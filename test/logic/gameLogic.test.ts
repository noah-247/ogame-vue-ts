import { afterEach, describe, expect, it } from 'vitest'
import type { Planet, Player } from '@/types/game'
import { BuildingType } from '@/types/game'
import { processGameUpdate } from '@/logic/gameLogic'
import { getGameNow, setTimeOffset } from '@/logic/gameTime'
import * as buildingLogic from '@/logic/buildingLogic'
import { setNow, jump, restore } from '../utils/time'

afterEach(restore)

const HOUR = 3_600_000
const T0 = 1_700_000_000_000

const makePlanet = (buildings: Partial<Record<BuildingType, number>>, overrides: Partial<Planet> = {}): Planet =>
  ({
    id: 'planet-1',
    name: 'Test',
    position: { galaxy: 1, system: 1, position: 1 },
    resources: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    buildings: { ...buildings } as unknown as Record<BuildingType, number>,
    fleet: {},
    defense: {},
    buildQueue: [],
    waitingBuildQueue: [],
    lastUpdate: T0,
    maxSpace: 400,
    maxFleetStorage: 0,
    isMoon: false,
    temperature: { min: 20, max: 40 }, // 重氫溫度係數 1.2
    ...overrides
  }) as unknown as Planet

const makePlayer = (planets: Planet[]): Player =>
  ({
    id: 'player-1',
    name: 'Tester',
    planets,
    technologies: {},
    officers: {},
    researchQueue: [],
    waitingResearchQueue: [],
    fleetMissions: []
  }) as unknown as Player

/** B1 場景星球：太陽能 6（531.47）帶三礦，餘量僅 12.76 */
const blackoutPlanet = () =>
  makePlanet({
    [BuildingType.SolarPlant]: 6,
    [BuildingType.MetalMine]: 10, // 259.37
    [BuildingType.CrystalMine]: 8, // 171.49
    [BuildingType.DeuteriumSynthesizer]: 4, // 87.85
    [BuildingType.MetalStorage]: 10,
    [BuildingType.CrystalStorage]: 10,
    [BuildingType.DeuteriumTank]: 10
  })

describe('processGameUpdate 逐事件結算 (B1)', () => {
  it('區間中途斷電隻影響斷電後的分段，不吞掉整段產量', () => {
    const planet = blackoutPlanet()
    // 金屬礦 11 在第 1 小時完工：用電 259.37→313.84，總耗 573.18 > 531.47，後 7 小時斷電
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 11, startTime: T0, endTime: T0 + HOUR }
    ]
    const player = makePlayer([planet])
    setNow(T0 + 8 * HOUR)

    processGameUpdate(player, T0 + 8 * HOUR, 1)

    expect(planet.buildings[BuildingType.MetalMine]).toBe(11)
    // 舊邏輯：整段 8 小時產量歸零（metal === 0）
    // 新邏輯：第 1 小時按金屬 10 結算（864975.59），後 7 小時斷電為 0
    expect(planet.resources.metal).toBeGreaterThan(800_000)
    expect(planet.resources.metal).toBeLessThan(900_000)
    expect(planet.resources.crystal).toBeGreaterThan(200_000)
    expect(planet.resources.crystal).toBeLessThan(210_000)
    expect(planet.resources.deuterium).toBeGreaterThan(12_000)
    expect(planet.resources.deuterium).toBeLessThan(13_000)
  })

  it('無斷電事件時分段結算與整段結算一致', () => {
    const planet = blackoutPlanet()
    // 太陽能 7 在第 1 小時完工：只增產不斷電
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 7, startTime: T0, endTime: T0 + HOUR }
    ]
    const player = makePlayer([planet])
    setNow(T0 + 8 * HOUR)

    processGameUpdate(player, T0 + 8 * HOUR, 1)

    expect(planet.buildings[BuildingType.SolarPlant]).toBe(7)
    // 金屬礦等級未變：8 小時足額生產
    expect(planet.resources.metal).toBeGreaterThan(6_900_000)
    expect(planet.resources.metal).toBeLessThan(7_000_000)
  })

  it('多個完工事件按時間順序逐個結算', () => {
    const planet = blackoutPlanet()
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 7, startTime: T0, endTime: T0 + 2 * HOUR },
      { id: 'b2', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 9, startTime: T0, endTime: T0 + 4 * HOUR }
    ]
    const player = makePlayer([planet])
    setNow(T0 + 8 * HOUR)

    processGameUpdate(player, T0 + 8 * HOUR, 1)

    expect(planet.buildings[BuildingType.SolarPlant]).toBe(7)
    expect(planet.buildings[BuildingType.CrystalMine]).toBe(9)
    // 晶體：4h×205031.25（8級）+ 4h×345990.23（9級，太陽能 7 不影響晶體產量）
    expect(planet.resources.crystal).toBeGreaterThan(2_200_000)
    expect(planet.resources.crystal).toBeLessThan(2_210_000)
  })

  it('無事件時行為與舊邏輯一致（單次結算）', () => {
    const planet = blackoutPlanet()
    const player = makePlayer([planet])
    setNow(T0 + HOUR)

    processGameUpdate(player, T0 + HOUR, 1)

    // 1 小時足額：金屬 864975.59 / 晶體 205031.25 / 重氫 12150
    expect(planet.resources.metal).toBeGreaterThan(864_000)
    expect(planet.resources.metal).toBeLessThan(866_000)
    expect(planet.lastUpdate).toBe(T0 + HOUR)
  })

  it('completeBuildQueue 的 upTo 語義：同一項不會在多個分段重複完成', () => {
    const planet = blackoutPlanet()
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 7, startTime: T0, endTime: T0 + HOUR },
      { id: 'b2', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 9, startTime: T0, endTime: T0 + 2 * HOUR }
    ]
    const completions: string[] = []
    const onCompleted = (_type: string, itemType: string, level?: number) => {
      completions.push(`${itemType}:${level}`)
    }

    // 第一段：只完成太陽能
    buildingLogic.completeBuildQueue(planet, T0 + 8 * HOUR, undefined, onCompleted, T0 + HOUR)
    expect(planet.buildings[BuildingType.SolarPlant]).toBe(7)
    expect(planet.buildings[BuildingType.CrystalMine]).toBe(8)
    expect(planet.buildQueue).toHaveLength(1)

    // 第二段：完成晶體礦；太陽能不重複
    buildingLogic.completeBuildQueue(planet, T0 + 8 * HOUR, undefined, onCompleted, T0 + 2 * HOUR)
    expect(planet.buildings[BuildingType.CrystalMine]).toBe(9)
    expect(planet.buildQueue).toHaveLength(0)

    expect(completions).toEqual(['solarPlant:7', 'crystalMine:9'])
  })
})

describe('虛擬時間偏移 (BLK-1)', () => {
  afterEach(() => setTimeOffset(0))

  it('快轉後連續 tick 資源持續增長（不凍結）', () => {
    setNow(T0)
    setTimeOffset(8 * HOUR) // 模擬一次 8h 快轉
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1, [BuildingType.MetalMine]: 1 })
    const player = makePlayer([planet])
    const now1 = getGameNow()
    planet.lastUpdate = now1 - HOUR
    processGameUpdate(player, now1, 1)
    const metal1 = planet.resources.metal
    expect(metal1).toBeGreaterThan(0)
    // 真實時間 +1s：虛擬時間繼續推進，產量繼續累積（舊 Math.max 方案這裡 timeDiff=0 凍結）
    jump(1000)
    processGameUpdate(player, getGameNow(), 1)
    expect(planet.resources.metal).toBeGreaterThan(metal1)
  })

  it('快轉後新開工的建造不會瞬間完工', () => {
    setNow(T0)
    setTimeOffset(8 * HOUR)
    const item = buildingLogic.createBuildQueueItem(BuildingType.MetalMine, 2, 3600)
    const now = getGameNow()
    // startTime 必須用虛擬時間（≈ now），不能是牆鍾時間（舊 bug：牆鍾 startTime 落後 8h，下一 tick 即完工）
    expect(item.startTime).toBeGreaterThanOrEqual(now - 1000)
    expect(item.endTime).toBe(item.startTime + 3600 * 1000)
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 1, [BuildingType.MetalMine]: 1 },
      { buildQueue: [item], lastUpdate: now - 1000 }
    )
    const player = makePlayer([planet])
    jump(1000)
    processGameUpdate(player, getGameNow(), 1)
    expect(planet.buildings[BuildingType.MetalMine]).toBe(1) // 1h 工時，1s 後不應完工
    expect(planet.buildQueue).toHaveLength(1)
  })

  it('重複快轉只向前推進，不倒退', () => {
    setNow(T0)
    setTimeOffset(8 * HOUR)
    const now1 = getGameNow()
    setTimeOffset(9 * HOUR) // 凍結視窗內再快轉 1h
    const now2 = getGameNow()
    // 舊 Math.max 方案：futureNow < gameTime 會回撥；新方案單調遞增
    expect(now2).toBeGreaterThan(now1)
    expect(now2 - now1).toBe(HOUR)
  })
})
