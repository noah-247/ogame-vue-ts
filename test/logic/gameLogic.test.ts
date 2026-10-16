import { afterEach, describe, expect, it } from 'vitest'
import type { Planet, Player } from '@/types/game'
import { BuildingType } from '@/types/game'
import { processGameUpdate } from '@/logic/gameLogic'
import * as buildingLogic from '@/logic/buildingLogic'
import { setNow, restore } from '../utils/time'

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
    temperature: { min: 20, max: 40 }, // 重氢温度系数 1.2
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

/** B1 场景星球：太阳能 6（531.47）带三矿，余量仅 12.76 */
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

describe('processGameUpdate 逐事件结算 (B1)', () => {
  it('区间中途断电只影响断电后的分段，不吞掉整段产量', () => {
    const planet = blackoutPlanet()
    // 金属矿 11 在第 1 小时完工：用电 259.37→313.84，总耗 573.18 > 531.47，后 7 小时断电
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 11, startTime: T0, endTime: T0 + HOUR }
    ]
    const player = makePlayer([planet])
    setNow(T0 + 8 * HOUR)

    processGameUpdate(player, T0 + 8 * HOUR, 1)

    expect(planet.buildings[BuildingType.MetalMine]).toBe(11)
    // 旧逻辑：整段 8 小时产量归零（metal === 0）
    // 新逻辑：第 1 小时按金属 10 结算（864975.59），后 7 小时断电为 0
    expect(planet.resources.metal).toBeGreaterThan(800_000)
    expect(planet.resources.metal).toBeLessThan(900_000)
    expect(planet.resources.crystal).toBeGreaterThan(200_000)
    expect(planet.resources.crystal).toBeLessThan(210_000)
    expect(planet.resources.deuterium).toBeGreaterThan(12_000)
    expect(planet.resources.deuterium).toBeLessThan(13_000)
  })

  it('无断电事件时分段结算与整段结算一致', () => {
    const planet = blackoutPlanet()
    // 太阳能 7 在第 1 小时完工：只增产不断电
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 7, startTime: T0, endTime: T0 + HOUR }
    ]
    const player = makePlayer([planet])
    setNow(T0 + 8 * HOUR)

    processGameUpdate(player, T0 + 8 * HOUR, 1)

    expect(planet.buildings[BuildingType.SolarPlant]).toBe(7)
    // 金属矿等级未变：8 小时足额生产
    expect(planet.resources.metal).toBeGreaterThan(6_900_000)
    expect(planet.resources.metal).toBeLessThan(7_000_000)
  })

  it('多个完工事件按时间顺序逐个结算', () => {
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
    // 晶体：4h×205031.25（8级）+ 4h×345990.23（9级，太阳能 7 不影响晶体产量）
    expect(planet.resources.crystal).toBeGreaterThan(2_200_000)
    expect(planet.resources.crystal).toBeLessThan(2_210_000)
  })

  it('无事件时行为与旧逻辑一致（单次结算）', () => {
    const planet = blackoutPlanet()
    const player = makePlayer([planet])
    setNow(T0 + HOUR)

    processGameUpdate(player, T0 + HOUR, 1)

    // 1 小时足额：金属 864975.59 / 晶体 205031.25 / 重氢 12150
    expect(planet.resources.metal).toBeGreaterThan(864_000)
    expect(planet.resources.metal).toBeLessThan(866_000)
    expect(planet.lastUpdate).toBe(T0 + HOUR)
  })

  it('completeBuildQueue 的 upTo 语义：同一项不会在多个分段重复完成', () => {
    const planet = blackoutPlanet()
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 7, startTime: T0, endTime: T0 + HOUR },
      { id: 'b2', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 9, startTime: T0, endTime: T0 + 2 * HOUR }
    ]
    const completions: string[] = []
    const onCompleted = (_type: string, itemType: string, level?: number) => {
      completions.push(`${itemType}:${level}`)
    }

    // 第一段：只完成太阳能
    buildingLogic.completeBuildQueue(planet, T0 + 8 * HOUR, undefined, onCompleted, T0 + HOUR)
    expect(planet.buildings[BuildingType.SolarPlant]).toBe(7)
    expect(planet.buildings[BuildingType.CrystalMine]).toBe(8)
    expect(planet.buildQueue).toHaveLength(1)

    // 第二段：完成晶体矿；太阳能不重复
    buildingLogic.completeBuildQueue(planet, T0 + 8 * HOUR, undefined, onCompleted, T0 + 2 * HOUR)
    expect(planet.buildings[BuildingType.CrystalMine]).toBe(9)
    expect(planet.buildQueue).toHaveLength(0)

    expect(completions).toEqual(['solarPlant:7', 'crystalMine:9'])
  })
})
