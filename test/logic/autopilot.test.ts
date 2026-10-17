import { afterEach, describe, expect, it } from 'vitest'
import type { AutopilotPlanetConfig, EmpireResearchAutopilot, Planet, Player, WaitingQueueItem } from '@/types/game'
import { BuildingType, OfficerType, TechnologyType } from '@/types/game'
import {
  applyBlueprintToPlanet,
  AUTOPILOT_BLUEPRINTS,
  checkEnergySafeWorstOrder,
  createAutopilotResearchTarget,
  createAutopilotTarget,
  createDefaultContext,
  createDefaultEmpireResearchAutopilot,
  createDefaultPlanetAutopilot,
  expandPrerequisiteChain,
  expandResearchPrerequisiteChain,
  getAutopilotBlueprint,
  planAllSteps,
  planEnergyRescue,
  planTargetSteps,
  planWarehouseRescue,
  reconcileTargets,
  resumeAutoMode,
  setAutopilotMode,
  tickAutopilotPlanet,
  tickEmpireResearch,
  withdrawAutopilotWaiting
} from '@/logic/autopilotLogic'
import { setNow, restore, jump, HOUR } from '../utils/time'
import * as waitingQueueLogic from '@/logic/waitingQueueLogic'
import * as buildingLogic from '@/logic/buildingLogic'
import * as resourceLogic from '@/logic/resourceLogic'
import * as gameLogic from '@/logic/gameLogic'
import { getGameNow, setTimeOffset } from '@/logic/gameTime'
import { BUILDINGS } from '@/config/gameConfig'

afterEach(restore)

type Buildings = Partial<Record<BuildingType, number>>

const makePlanet = (buildings: Buildings = {}, overrides: Partial<Planet> = {}): Planet =>
  ({
    id: 'planet-1',
    name: 'Test',
    position: { galaxy: 1, system: 1, position: 1 },
    resources: { metal: 1_000_000, crystal: 500_000, deuterium: 200_000, darkMatter: 0, energy: 5000 },
    buildings: { ...buildings } as unknown as Record<BuildingType, number>,
    fleet: {},
    defense: {},
    buildQueue: [],
    waitingBuildQueue: [],
    lastUpdate: Date.now(),
    maxSpace: 200,
    maxFleetStorage: 0,
    isMoon: false,
    ...overrides
  }) as unknown as Planet

const makePlayer = (planets: Planet[], technologies: Partial<Record<TechnologyType, number>> = {}): Player =>
  ({
    id: 'player-1',
    name: 'Tester',
    planets,
    technologies,
    officers: {},
    researchQueue: [],
    waitingResearchQueue: [],
    fleetMissions: []
  }) as unknown as Player

const enableAutopilot = (planet: Planet, targets: Array<[BuildingType, number]>, priorityStart = 0): AutopilotPlanetConfig => {
  const config = createDefaultPlanetAutopilot()
  config.enabled = true
  config.targets = targets.map(([type, level], i) => createAutopilotTarget(type, level, priorityStart + i, 1000))
  planet.autopilot = config
  return config
}

const enableResearchAutopilot = (player: Player, targets: Array<[TechnologyType, number]>): EmpireResearchAutopilot => {
  const config = createDefaultEmpireResearchAutopilot()
  config.enabled = true
  config.targets = targets.map(([tech, level], i) => createAutopilotResearchTarget(tech, level, i, 1000))
  player.empireResearchAutopilot = config
  return config
}

const ctx = createDefaultContext()
const NOW = 1_700_000_000_000

describe('reconcileTargets (B12)', () => {
  it('marks a target complete when actual level reaches the target (target persists, Minor-9/E)', () => {
    const planet = makePlanet({ [BuildingType.MetalMine]: 10 })
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 10], [BuildingType.CrystalMine, 5]])
    setNow(NOW)

    const completed = reconcileTargets(config, planet)

    expect(completed.map(t => t.buildingType)).toEqual([BuildingType.MetalMine])
    // Minor-9/E：达标不删除目标（达标=无工作可做），目标保留在清单中
    expect(config.targets.map(t => t.buildingType)).toEqual([BuildingType.MetalMine, BuildingType.CrystalMine])
    expect(config.targets[0]!.completed).toBe(true)
    expect(config.targets[1]!.completed).toBe(false)
    // 已达标的不再重复报告
    expect(reconcileTargets(config, planet)).toHaveLength(0)
  })

  it('reopens progress when the player demolishes below the target', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 8, [BuildingType.MetalMine]: 10 })
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 10]])
    reconcileTargets(config, planet)
    expect(config.targets).toHaveLength(1)
    expect(config.targets[0]!.completed).toBe(true)

    // 玩家拆除后等级回落：目标变回未完成，下次 tick 从实际等级重推（Minor-9/E：达标前后行为一致）
    planet.buildings[BuildingType.MetalMine] = 8
    const completed = reconcileTargets(config, planet)

    expect(completed).toHaveLength(0)
    expect(config.targets).toHaveLength(1)
    expect(config.targets[0]!.completed).toBe(false)
    const result = tickAutopilotPlanet(makePlayer([planet]), planet, NOW, ctx)
    expect(result.enqueued).toBeGreaterThan(0)
  })
})

describe('expandPrerequisiteChain (B4)', () => {
  it('recursively expands the full hidden chain for metalMine 10', () => {
    // 金属矿 9 → 目标 10：需要机器人工厂 2；工厂 2 又要三矿各 2
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 1,
      [BuildingType.MetalMine]: 9,
      [BuildingType.CrystalMine]: 1,
      [BuildingType.DeuteriumSynthesizer]: 1
    })

    const chain = expandPrerequisiteChain(planet, {}, BuildingType.MetalMine, 10)
    const keys = chain.map(s => `${s.buildingType}:${s.level}`)

    expect(keys).toContain('deuteriumSynthesizer:2')
    expect(keys).toContain('crystalMine:2')
    expect(keys).toContain('roboticsFactory:1')
    expect(keys).toContain('roboticsFactory:2')
    expect(keys).toContain('metalMine:10')
    // 前置在前：工厂 2 必须排在金属矿 10 之前
    expect(keys.indexOf('roboticsFactory:2')).toBeLessThan(keys.indexOf('metalMine:10'))
  })

  it('expands the researchLab 8 deadlock chain down to deuterium 10 and robotics 5', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 8,
      [BuildingType.MetalMine]: 10,
      [BuildingType.CrystalMine]: 10,
      [BuildingType.DeuteriumSynthesizer]: 9,
      [BuildingType.RoboticsFactory]: 4,
      [BuildingType.ResearchLab]: 7
    })

    const chain = expandPrerequisiteChain(planet, {}, BuildingType.ResearchLab, 8)
    const keys = chain.map(s => `${s.buildingType}:${s.level}`)

    expect(keys).toContain('deuteriumSynthesizer:10')
    expect(keys).toContain('roboticsFactory:5')
    expect(keys).toContain('researchLab:8')
  })

  it('marks missing technology prerequisites as blockers instead of build steps', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    // 聚变反应堆需要能源技术 3（科技前置只标记不展开）＋重氢 5（建筑前置递归展开）
    const chain = expandPrerequisiteChain(planet, {}, BuildingType.FusionReactor, 1)
    const keys = chain.map(s => `${s.buildingType}:${s.level}`)

    expect(keys).toEqual([
      'deuteriumSynthesizer:1',
      'deuteriumSynthesizer:2',
      'deuteriumSynthesizer:3',
      'deuteriumSynthesizer:4',
      'deuteriumSynthesizer:5',
      'fusionReactor:1'
    ])
    const fusionStep = chain.find(s => s.buildingType === BuildingType.FusionReactor)!
    expect(fusionStep.blockedByTech).toEqual({ technology: TechnologyType.EnergyTechnology, level: 3 })
    expect(chain.filter(s => s.blockedByTech)).toHaveLength(1)
  })

  it('skips planetOnly prerequisites on moons', () => {
    const planet = makePlanet({ [BuildingType.MetalMine]: 2 }, { isMoon: true })
    const chain = expandPrerequisiteChain(planet, {}, BuildingType.RoboticsFactory, 1)
    const keys = chain.map(s => `${s.buildingType}:${s.level}`)

    // 月球跳过 planetOnly 的三矿前置，直接可建
    expect(keys).toEqual(['roboticsFactory:1'])
  })

  it('dedupes shared prerequisites across targets', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const config = enableAutopilot(planet, [
      [BuildingType.MetalMine, 10],
      [BuildingType.CrystalMine, 10]
    ])
    const steps = planAllSteps(planet, {}, config, ctx)
    const roboticsSteps = steps.filter(s => s.buildingType === BuildingType.RoboticsFactory)

    expect(roboticsSteps.map(s => s.nextLevel)).toEqual([1])
  })
})

describe('planAllSteps ordering', () => {
  it('respects target priority, longest build time first within a priority', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 1,
      [BuildingType.MetalMine]: 5,
      [BuildingType.CrystalMine]: 5,
      [BuildingType.DeuteriumSynthesizer]: 2,
      [BuildingType.RoboticsFactory]: 2
    })
    const config = enableAutopilot(planet, [
      [BuildingType.MetalMine, 6],
      [BuildingType.SolarPlant, 2]
    ])
    // 把太阳能设为更高优先级（priority 更小）
    config.targets[1]!.priority = -1

    const steps = planAllSteps(planet, {}, config, ctx)

    expect(steps[0]!.buildingType).toBe(BuildingType.SolarPlant)
  })
})

describe('checkEnergySafeWorstOrder (B1)', () => {
  const energyPlanet = () =>
    makePlanet({
      [BuildingType.SolarPlant]: 7, // 产出 682.05
      [BuildingType.MetalMine]: 10, // 消耗 259.37
      [BuildingType.CrystalMine]: 8, // 消耗 171.49
      [BuildingType.DeuteriumSynthesizer]: 5, // 消耗 120.79
      [BuildingType.RoboticsFactory]: 2, // 消耗 12.10
      [BuildingType.ResearchLab]: 1 // 消耗 13.20
      // 合计消耗 576.95，余量 105.10
    })

  it('is safe when production covers every pending consumer', () => {
    const planet = energyPlanet()
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.CrystalMine, startTime: 0, endTime: 1 }
    ]

    const result = checkEnergySafeWorstOrder(planet, 0)

    expect(result.safe).toBe(true)
    expect(result.margin).toBeGreaterThan(0)
  })

  it('detects blackout under the worst completion order even when currently safe', () => {
    const planet = energyPlanet()
    // 三个耗电项增量合计 133.85 > 余量 105.10；最坏顺序下转负
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.CrystalMine, startTime: 0, endTime: 1 },
      { id: 'b2', type: 'building', itemType: BuildingType.MetalMine, startTime: 0, endTime: 2 },
      { id: 'b3', type: 'building', itemType: BuildingType.DeuteriumSynthesizer, startTime: 0, endTime: 3 }
    ]

    const result = checkEnergySafeWorstOrder(planet, 0)

    expect(result.safe).toBe(false)
    expect(result.margin).toBeLessThan(0)
  })

  it('does not let a pending solar upgrade rescue the worst case', () => {
    const planet = energyPlanet()
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.CrystalMine, startTime: 0, endTime: 1 },
      { id: 'b2', type: 'building', itemType: BuildingType.MetalMine, startTime: 0, endTime: 2 },
      { id: 'b3', type: 'building', itemType: BuildingType.DeuteriumSynthesizer, startTime: 0, endTime: 3 },
      // 太阳能 7 在最坏顺序里最后才完工，救不了中间的断电
      { id: 'b4', type: 'building', itemType: BuildingType.SolarPlant, startTime: 0, endTime: 4 }
    ]

    const result = checkEnergySafeWorstOrder(planet, 0)

    expect(result.safe).toBe(false)
  })
})

describe('tickAutopilotPlanet', () => {
  it('does nothing when disabled or paused', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    setNow(NOW)

    expect(tickAutopilotPlanet(player, planet, NOW, ctx).enqueued).toBe(0)

    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 2]])
    config.paused = true
    expect(tickAutopilotPlanet(player, planet, NOW, ctx).enqueued).toBe(0)
    expect(planet.waitingBuildQueue).toHaveLength(0)
  })

  it('enqueues the next single level with source=autopilot (B3/B11)', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 3]])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(1)
    const item = planet.waitingBuildQueue[0]!
    expect(item.itemType).toBe(BuildingType.MetalMine)
    expect(item.targetLevel).toBe(1) // B3：只执行 current+1
    expect(item.source).toBe('autopilot') // B11
    expect(item.planetId).toBe('planet-1')
  })

  it('does not double-queue a building the player already queued', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 3]])
    const playerItem: WaitingQueueItem = {
      id: 'pw1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 1,
      priority: 0, addedTime: NOW
    }
    planet.waitingBuildQueue.push(playerItem)
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(planet.waitingBuildQueue.filter(i => i.itemType === BuildingType.MetalMine)).toHaveLength(1)
    expect(result.enqueued).toBe(0)
  })

  it('downgrades auto→execute when a step exceeds the work-hour threshold (B8)', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 12,
      [BuildingType.MetalMine]: 10,
      [BuildingType.CrystalMine]: 16, // 16→17 工时 9223s > 7200（机器人工厂 2）
      [BuildingType.DeuteriumSynthesizer]: 4,
      [BuildingType.RoboticsFactory]: 2,
      [BuildingType.MetalStorage]: 4,
      [BuildingType.CrystalStorage]: 3
    })
    const player = makePlayer([planet])
    const config = enableAutopilot(planet, [[BuildingType.CrystalMine, 17]])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.downgraded).toBe(true)
    expect(config.mode).toBe('execute')
    expect(config.downgradeReason).toBe('autopilot.downgradeWorkTime')
    expect(result.enqueued).toBe(0)
  })

  it('keeps executing approved targets in execute mode regardless of work time', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 12, // 产出 1883.06
      [BuildingType.MetalMine]: 10, // 259.37
      [BuildingType.CrystalMine]: 16, // 735.20 → 17：+124.00，余量充足
      [BuildingType.DeuteriumSynthesizer]: 4, // 87.85
      [BuildingType.RoboticsFactory]: 2, // 12.10
      [BuildingType.MetalStorage]: 4, // 容量 160000 ≥ 88544
      [BuildingType.CrystalStorage]: 3 // 容量 80000 ≥ 44272
    })
    const player = makePlayer([planet])
    const config = enableAutopilot(planet, [[BuildingType.CrystalMine, 17]])
    config.mode = 'execute'
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.downgraded).toBe(false)
    expect(result.enqueued).toBe(1)
    expect(planet.waitingBuildQueue[0]!.itemType).toBe(BuildingType.CrystalMine)
  })

  it('flags canResumeAuto only when every remaining step is under the resume threshold', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 8, // 857.44
      [BuildingType.MetalMine]: 8, // 171.49
      [BuildingType.CrystalMine]: 10, // 259.37 → 11：+54.53
      [BuildingType.DeuteriumSynthesizer]: 4, // 87.85
      [BuildingType.RoboticsFactory]: 2 // 12.10 → 合计 530.81，余量 326.63
    })
    const player = makePlayer([planet])
    const config = enableAutopilot(planet, [[BuildingType.CrystalMine, 11]])
    config.mode = 'execute'
    setNow(NOW)

    tickAutopilotPlanet(player, planet, NOW, ctx)

    // 晶体矿 10→11 工时 549s < 5400
    expect(config.canResumeAuto).toBe(true)
    expect(resumeAutoMode(config)).toBe(true)
    expect(config.mode).toBe('auto')
  })

  it('refuses resumeAutoMode without player confirmation eligibility', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 2]])
    config.mode = 'execute'
    config.canResumeAuto = false

    expect(resumeAutoMode(config)).toBe(false)
    expect(config.mode).toBe('execute')
  })

  it('always leaves one build slot for the player (B7)', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 6 })
    // 容量 3；玩家已占 2 个正式槽 → 副官最多再排 0 个（3-1-2）
    planet.buildQueue = [
      { id: 'p1', type: 'building', itemType: BuildingType.CrystalMine, startTime: 0, endTime: NOW + 60000 },
      { id: 'p2', type: 'building', itemType: BuildingType.DeuteriumSynthesizer, startTime: 0, endTime: NOW + 60000 }
    ]
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 5]])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoSlot')).toBe(true)
  })

  it('uses up to capacity-1 slots across build and waiting queues', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 6 })
    const player = makePlayer([planet])
    enableAutopilot(planet, [
      [BuildingType.MetalMine, 2],
      [BuildingType.CrystalMine, 2],
      [BuildingType.DeuteriumSynthesizer, 2]
    ])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 容量 3，留 1 给玩家 → 最多 2 个副官等待项
    expect(result.enqueued).toBe(2)
    expect(planet.waitingBuildQueue).toHaveLength(2)
  })

  it('respects the resource reserve (starvation guard)', () => {
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 6 },
      { resources: { metal: 500, crystal: 500, deuterium: 0, darkMatter: 0, energy: 100 } }
    )
    const player = makePlayer([planet])
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 2]])
    config.reserve = { metal: 450, crystal: 450, deuterium: 0 } // 金属矿 2 需 90/22，预留后不够
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoResource')).toBe(true)
  })

  it('plans from a simulated ledger so one tick cannot overspend', () => {
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 6 },
      { resources: { metal: 200, crystal: 200, deuterium: 0, darkMatter: 0, energy: 100 } }
    )
    const player = makePlayer([planet])
    // 金属矿1 60/15、晶体矿1 48/24、重氢1 225/75：200 金属只够前两项
    enableAutopilot(planet, [
      [BuildingType.MetalMine, 1],
      [BuildingType.CrystalMine, 1],
      [BuildingType.DeuteriumSynthesizer, 1]
    ])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(2)
  })

  it('enqueues an energy rescue instead of a blackout-causing step', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 6, // 531.47
      [BuildingType.MetalMine]: 11, // 313.86
      [BuildingType.CrystalMine]: 8, // 171.49 → 合计 485.35，余量 46.12
      [BuildingType.RoboticsFactory]: 2
    })
    const player = makePlayer([planet])
    // 金属矿 12：消耗 +62.75，余量转负 → 应先补太阳能
    enableAutopilot(planet, [[BuildingType.MetalMine, 12]])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(planet.waitingBuildQueue.some(i => i.itemType === BuildingType.SolarPlant)).toBe(true)
    expect(planet.waitingBuildQueue.some(i => i.itemType === BuildingType.MetalMine)).toBe(false)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedEnergyRescue')).toBe(true)
  })

  it('auto-expands a warehouse when the step cost exceeds capacity', () => {
    const planet = makePlanet(
      {
        [BuildingType.SolarPlant]: 20, // 充足电力
        [BuildingType.MetalMine]: 19,
        [BuildingType.CrystalMine]: 15,
        [BuildingType.DeuteriumSynthesizer]: 10,
        [BuildingType.RoboticsFactory]: 5,
        [BuildingType.ResearchLab]: 3
      },
      { resources: { metal: 5_000_000, crystal: 5_000_000, deuterium: 5_000_000, darkMatter: 0, energy: 100 } }
    )
    const player = makePlayer([planet])
    // 金属矿 20 费用 133010 金属 > 10000 基础容量 → 先扩金属仓库
    enableAutopilot(planet, [[BuildingType.MetalMine, 20]])
    setNow(NOW)

    tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(planet.waitingBuildQueue.some(i => i.itemType === BuildingType.MetalStorage)).toBe(true)
  })

  it('blocks when free space falls below the reserve (B5)', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 6 }, { maxSpace: 20 })
    // 太阳能 6 占 12 格，maxSpace 20，minFreeSpace 10 → 只能用 10 格，已超
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 2]])
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoSpace')).toBe(true)
  })

  it('auto-builds missing prerequisites in chain order when allowed (B4)', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 6, // 电力充足，避免能源救援抢占
      [BuildingType.MetalMine]: 9,
      [BuildingType.CrystalMine]: 1,
      [BuildingType.DeuteriumSynthesizer]: 1
    })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 10]])
    setNow(NOW)

    // 第一轮：金属矿 10（缺工厂 2）、工厂 1（缺晶体 2、重氢 2）都被前置检查拦下，
    // 只有链首的晶体矿 2、重氢 2 可排
    const first = tickAutopilotPlanet(player, planet, NOW, ctx)
    expect(first.enqueued).toBe(2)
    const firstTypes = planet.waitingBuildQueue.map(i => i.itemType).sort()
    expect(firstTypes).toEqual([BuildingType.CrystalMine, BuildingType.DeuteriumSynthesizer].sort())
    expect(first.blockers.some(b => b.reason === 'autopilot.blockedPrereq')).toBe(true)

    // 模拟晶体矿 2、重氢 2 完工：下一轮应排出工厂 1
    planet.buildings[BuildingType.CrystalMine] = 2
    planet.buildings[BuildingType.DeuteriumSynthesizer] = 2
    planet.waitingBuildQueue = []
    const second = tickAutopilotPlanet(player, planet, NOW + 1000, ctx)
    expect(second.enqueued).toBeGreaterThan(0)
    expect(planet.waitingBuildQueue.some(i => i.itemType === BuildingType.RoboticsFactory)).toBe(true)
    expect(planet.waitingBuildQueue.every(i => i.itemType !== BuildingType.MetalMine)).toBe(true)
  })

  it('marks prereq steps blocked when auto prereq building is disabled', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 1,
      [BuildingType.MetalMine]: 9,
      [BuildingType.CrystalMine]: 1,
      [BuildingType.DeuteriumSynthesizer]: 1
    })
    const player = makePlayer([planet])
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 10]])
    config.allowPrereqAutoBuild = false
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedPrereqDisabled')).toBe(true)
  })

  it('never enqueues research from the planet tick (B6)', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 1,
      [BuildingType.MetalMine]: 3,
      [BuildingType.CrystalMine]: 3,
      [BuildingType.DeuteriumSynthesizer]: 3,
      [BuildingType.ResearchLab]: 1
    })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 5]])
    setNow(NOW)

    tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(player.waitingResearchQueue).toHaveLength(0)
  })
})

describe('planEnergyRescue / planWarehouseRescue', () => {
  it('picks the producer with the largest output gain', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 6 })
    const rescue = planEnergyRescue(planet, {}, ctx)

    expect(rescue?.buildingType).toBe(BuildingType.SolarPlant)
    expect(rescue?.nextLevel).toBe(7)
    expect(rescue?.prodDelta).toBeGreaterThan(0)
  })

  it('returns null when no producer can be built', () => {
    const planet = makePlanet({}, { isMoon: true })
    // 月球不能建太阳能/聚变（planetOnly），且聚变要能源技术 3
    const rescue = planEnergyRescue(planet, {}, ctx)

    expect(rescue).toBeNull()
  })

  it('returns an empty plan when the cost already fits capacity', () => {
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 1, [BuildingType.MetalStorage]: 2 },
      { resources: { metal: 50000, crystal: 50000, deuterium: 0, darkMatter: 0, energy: 100 } }
    )
    const rescue = planWarehouseRescue(
      planet,
      { metal: 5000, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
      0,
      ctx
    )

    expect(rescue.step).toBeNull()
    expect(rescue.blocked).toBeUndefined()
  })

  it('Minor-7: reports blockedWarehouseCap when even +12 warehouse levels cannot hold the cost', () => {
    const planet = makePlanet({ [BuildingType.MetalStorage]: 0 })
    const rescue = planWarehouseRescue(
      planet,
      { metal: 1e15, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
      0,
      ctx
    )

    expect(rescue.step).toBeNull()
    expect(rescue.blocked).toMatchObject({
      kind: 'building',
      itemType: BuildingType.MetalStorage,
      reason: 'autopilot.blockedWarehouseCap'
    })
  })
})

describe('expandResearchPrerequisiteChain', () => {
  it('expands technology chains recursively', () => {
    // 激光技术 1 需要能源技术 2
    const chain = expandResearchPrerequisiteChain({}, {}, TechnologyType.LaserTechnology, 1)
    const keys = chain.map(s => `${s.technology}:${s.level}`)

    expect(keys).toContain('energyTechnology:1')
    expect(keys).toContain('energyTechnology:2')
    expect(keys).toContain('laserTechnology:1')
    expect(keys.indexOf('energyTechnology:2')).toBeLessThan(keys.indexOf('laserTechnology:1'))
  })

  it('marks missing building prerequisites as blockers', () => {
    const chain = expandResearchPrerequisiteChain({}, {}, TechnologyType.EnergyTechnology, 1)

    expect(chain[0]!.blockedByBuilding).toEqual({ building: BuildingType.ResearchLab, level: 1 })
  })
})

describe('tickEmpireResearch (B6)', () => {
  const researchPlayer = (techs: Partial<Record<TechnologyType, number>> = {}) => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 2,
      [BuildingType.ResearchLab]: 1,
      [BuildingType.MetalMine]: 1,
      [BuildingType.CrystalMine]: 1,
      [BuildingType.DeuteriumSynthesizer]: 1
    })
    return makePlayer([planet], techs)
  }

  it('does nothing when disabled', () => {
    const player = researchPlayer()
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(player.waitingResearchQueue).toHaveLength(0)
  })

  it('enqueues the next research level with source=autopilot', () => {
    const player = researchPlayer()
    enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 2]])
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.enqueued).toBe(1)
    const item = player.waitingResearchQueue[0]!
    expect(item.itemType).toBe(TechnologyType.EnergyTechnology)
    expect(item.targetLevel).toBe(1)
    expect(item.source).toBe('autopilot')
  })

  it('reports a blocker when no planet has a research lab', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 1]])
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoLab')).toBe(true)
  })

  it('auto-expands technology prerequisites before the target', () => {
    const player = researchPlayer()
    enableResearchAutopilot(player, [[TechnologyType.LaserTechnology, 1]])
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    // 激光技术 1 的前置是能源技术 2；本 tick 只排能源技术 1（同级不并发）
    expect(result.enqueued).toBe(1)
    expect(player.waitingResearchQueue[0]!.itemType).toBe(TechnologyType.EnergyTechnology)
    expect(player.waitingResearchQueue[0]!.source).toBe('autopilot')
  })

  it('leaves one research slot for the player', () => {
    const player = researchPlayer()
    player.researchQueue = [
      { id: 'r1', type: 'technology', itemType: TechnologyType.ComputerTechnology, startTime: 0, endTime: 1 },
      { id: 'r2', type: 'technology', itemType: TechnologyType.EnergyTechnology, startTime: 0, endTime: 1 }
    ]
    enableResearchAutopilot(player, [[TechnologyType.LaserTechnology, 1]])
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoSlot')).toBe(true)
  })

  it('downgrades on long research time in auto mode', () => {
    const player = researchPlayer()
    const config = enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 1]])
    config.workHourThreshold = 1 // 1 秒门槛，任何研究都超限
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.downgraded).toBe(true)
    expect(config.mode).toBe('execute')
  })

  it('marks research targets complete from actual tech levels (target persists, Minor-9/E)', () => {
    const player = researchPlayer({ [TechnologyType.EnergyTechnology]: 2 })
    const config = enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 2]])
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.completedTargets).toHaveLength(1)
    expect(config.targets).toHaveLength(1)
    expect(config.targets[0]!.completed).toBe(true)
  })
})

describe('planTargetSteps', () => {
  it('returns no steps for an already-completed target', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1, [BuildingType.MetalMine]: 5 })
    const target = createAutopilotTarget(BuildingType.MetalMine, 5, 0, 1000)

    expect(planTargetSteps(planet, {}, target, ctx, true)).toHaveLength(0)
  })

  it('computes build time with the robotics factory divisor', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 1,
      [BuildingType.MetalMine]: 5,
      [BuildingType.RoboticsFactory]: 2
    })
    const target = createAutopilotTarget(BuildingType.MetalMine, 6, 0, 1000)
    const [step] = planTargetSteps(planet, {}, target, ctx, true)

    // floor(15 * 1.5^5 / 3) = floor(113.9/3) = 37
    expect(step!.buildTime).toBe(37)
    expect(step!.cost).toEqual({ metal: 455, crystal: 113, deuterium: 0, darkMatter: 0, energy: 0 })
  })
})

describe('blueprints', () => {
  it('ships exactly the economy and balanced presets', () => {
    expect(AUTOPILOT_BLUEPRINTS.map(b => b.id).sort()).toEqual(['balanced', 'economy'])
    const economy = getAutopilotBlueprint('economy')!
    expect(economy.targets.find(t => t.buildingType === BuildingType.MetalMine)?.targetLevel).toBe(12)
    expect(economy.targets.find(t => t.buildingType === BuildingType.RoboticsFactory)?.targetLevel).toBe(4)
    const balanced = getAutopilotBlueprint('balanced')!
    expect(balanced.targets.find(t => t.buildingType === BuildingType.ResearchLab)?.targetLevel).toBe(5)
    expect(balanced.targets.find(t => t.buildingType === BuildingType.DeuteriumSynthesizer)?.targetLevel).toBe(8)
  })

  it('returns undefined for an unknown blueprint id', () => {
    expect(getAutopilotBlueprint('nope')).toBeUndefined()
  })

  it('uses unique priorities within each blueprint (duplicate priorities freeze up/down reorder)', () => {
    for (const blueprint of AUTOPILOT_BLUEPRINTS) {
      const priorities = blueprint.targets.map(t => t.priority)
      expect(new Set(priorities).size).toBe(priorities.length)
    }
  })

  it('moveTarget-style reorder works even when existing saves carry duplicate priorities', () => {
    // 回歸：舊存檔三倉庫 priority 全為 5，單純交換 priority 是空操作；
    // 新的搬移實作（splice＋重排）必須能真正改變順序
    const targets = [
      { id: 'a', priority: 5 },
      { id: 'b', priority: 5 },
      { id: 'c', priority: 5 },
    ]
    const move = (index: number, dir: -1 | 1) => {
      const j = index + dir
      if (j < 0 || j >= targets.length) return
      const arr = [...targets].sort((x, y) => x.priority - y.priority)
      const [moved] = arr.splice(index, 1)
      arr.splice(j, 0, moved!)
      arr.forEach((t, idx) => { t.priority = idx })
    }
    move(2, -1) // 把 c 上移一位
    const order = [...targets].sort((x, y) => x.priority - y.priority).map(t => t.id)
    expect(order).toEqual(['a', 'c', 'b'])
  })

  it('applyBlueprintToPlanet replaces targets, enables and records the decision', () => {
    const config = createDefaultPlanetAutopilot()
    config.targets.push(createAutopilotTarget(BuildingType.MetalMine, 3, 0, 1000))

    expect(applyBlueprintToPlanet(config, 'economy', 2000)).toBe(true)
    expect(config.enabled).toBe(true)
    expect(config.paused).toBe(false)
    expect(config.targets).toHaveLength(getAutopilotBlueprint('economy')!.targets.length)
    expect(config.targets.every(t => t.id.startsWith('apt_'))).toBe(true)
    expect(config.lastDecision).toBe('autopilot.decisionBlueprintApplied')
  })

  it('applyBlueprintToPlanet returns false for an unknown blueprint id and keeps the config', () => {
    const config = createDefaultPlanetAutopilot()
    expect(applyBlueprintToPlanet(config, 'nope')).toBe(false)
    expect(config.targets).toHaveLength(0)
    expect(config.enabled).toBe(false)
  })
})

describe('BLK-2 waiting queue counted in energy check', () => {
  // s6/m8/c8/d5：余量 67.7；金属 9 单独 +27.0（安全）、晶体 9 单独 +27.0（安全）、合起来 -13.8（断电）
  // 目标 9 级不触发机器人工厂前置门槛（10 级才要），避免前置链干扰本测试
  const tightPlanet = () =>
    makePlanet({
      [BuildingType.SolarPlant]: 6,
      [BuildingType.MetalMine]: 8,
      [BuildingType.CrystalMine]: 8,
      [BuildingType.DeuteriumSynthesizer]: 5
    })

  it('counts items already sitting in the waiting queue', () => {
    const planet = tightPlanet()
    planet.waitingBuildQueue = [
      {
        id: 'w1', type: 'building', itemType: BuildingType.MetalMine,
        targetLevel: 9, priority: 0, addedTime: 0, planetId: planet.id
      } as WaitingQueueItem
    ]
    // 晶体 9 单独验证是安全的，但等待队列里已有金属 9，合起来断电 → 必须判不安全
    const result = checkEnergySafeWorstOrder(planet, 0, [{ type: 'building', itemType: BuildingType.CrystalMine }])
    expect(result.safe).toBe(false)
    expect(result.margin).toBeLessThan(0)
  })

  it('tick never enqueues an energy-unsafe combination within one tick', () => {
    const planet = tightPlanet()
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [
      [BuildingType.MetalMine, 9],
      [BuildingType.CrystalMine, 9]
    ])
    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 晶体 9 不能和金属 9 同一 tick 排入
    const crystalEnqueued = planet.waitingBuildQueue.some(
      i => i.itemType === BuildingType.CrystalMine && i.source === 'autopilot'
    )
    expect(crystalEnqueued).toBe(false)
    // 无论走能源救援还是阻塞，最终在途组合必须不断电
    expect(checkEnergySafeWorstOrder(planet, 0).safe).toBe(true)
    expect(
      result.blockers.some(b => b.reason === 'autopilot.blockedEnergy' || b.reason === 'autopilot.blockedEnergyRescue')
    ).toBe(true)
  })
})

describe('P0-1 target-level energy validation and promotion', () => {
  const tightPlanet = () => makePlanet({
    [BuildingType.SolarPlant]: 6,
    [BuildingType.MetalMine]: 8,
    [BuildingType.CrystalMine]: 8,
    [BuildingType.DeuteriumSynthesizer]: 5
  })

  it('blocks an autopilot step that is individually safe but unsafe with a player waiting step', () => {
    setNow(NOW)
    const planet = tightPlanet()
    const player = makePlayer([planet])
    const proposed = { type: 'building' as const, itemType: BuildingType.CrystalMine, targetLevel: 9 }
    expect(checkEnergySafeWorstOrder(planet, 0, [proposed]).safe).toBe(true)
    planet.waitingBuildQueue.push(waitingQueueLogic.createBuildingWaitingItem(BuildingType.MetalMine, 9, planet.id))
    expect(checkEnergySafeWorstOrder(planet, 0).safe).toBe(true)
    enableAutopilot(planet, [[BuildingType.CrystalMine, 9]])

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(planet.waitingBuildQueue.some(item => item.itemType === BuildingType.CrystalMine)).toBe(false)
    expect(result.blockers.some(blocker => blocker.reason === 'autopilot.blockedEnergyRescue')).toBe(true)
  })

  it('revalidates before promotion after a player adds an incompatible waiting step', () => {
    setNow(NOW)
    const planet = tightPlanet()
    const player = makePlayer([planet])
    const item = { ...waitingQueueLogic.createBuildingWaitingItem(BuildingType.MetalMine, 9, planet.id), source: 'autopilot' as const }
    expect(checkEnergySafeWorstOrder(planet, 0, [item]).safe).toBe(true)
    planet.waitingBuildQueue = [waitingQueueLogic.createBuildingWaitingItem(BuildingType.CrystalMine, 9, planet.id), item]

    const result = waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers, 0)

    expect(result.executed.map(entry => entry.itemType)).toEqual([BuildingType.CrystalMine])
    expect(planet.waitingBuildQueue).toEqual([item])
    expect(planet.buildQueue.some(entry => entry.itemType === BuildingType.MetalMine)).toBe(false)
  })

  it('counts a waiting promotion candidate only once and allows a safe promotion', () => {
    setNow(NOW)
    const planet = tightPlanet()
    const player = makePlayer([planet])
    const item = { ...waitingQueueLogic.createBuildingWaitingItem(BuildingType.MetalMine, 9, planet.id), source: 'autopilot' as const }
    planet.waitingBuildQueue = [item]
    expect(checkEnergySafeWorstOrder(planet, 0, [item]).margin).toBe(checkEnergySafeWorstOrder(planet, 0).margin)

    expect(waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers, 0).executed).toEqual([item])
    expect(planet.waitingBuildQueue).toHaveLength(0)
  })

  it('uses the supplied energy production bonus when revalidating promotion', () => {
    setNow(NOW)
    const planet = tightPlanet()
    const player = makePlayer([planet])
    planet.waitingBuildQueue = [
      { ...waitingQueueLogic.createBuildingWaitingItem(BuildingType.MetalMine, 9, planet.id), source: 'autopilot' },
      { ...waitingQueueLogic.createBuildingWaitingItem(BuildingType.CrystalMine, 9, planet.id), source: 'autopilot' }
    ]
    expect(waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers, 0).executed).toHaveLength(0)
    expect(waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers, 100).executed).toHaveLength(2)
  })

  it('promotes and completes solar rescue on a deficit planet across game and autopilot ticks', () => {
    setNow(NOW)
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1, [BuildingType.MetalMine]: 10 })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 11]])
    expect(checkEnergySafeWorstOrder(planet, 0).safe).toBe(false)
    let solarPromoted = false

    for (let tick = 0; tick < 100; tick++) {
      gameLogic.processGameUpdate(player, getGameNow())
      solarPromoted ||= planet.buildQueue.some(item => item.itemType === BuildingType.SolarPlant)
      tickAutopilotPlanet(player, planet, getGameNow(), ctx)
      jump(HOUR)
    }

    expect(solarPromoted).toBe(true)
    expect(planet.buildings[BuildingType.SolarPlant]).toBeGreaterThanOrEqual(2)
    expect(planet.buildings[BuildingType.MetalMine]).toBe(11)
    expect(planet.waitingBuildQueue.filter(item => item.source === 'autopilot')).toHaveLength(0)
  })

  it.each([
    [NOW - 1, 0],
    [NOW + HOUR / 2, 0],
    [NOW + HOUR, 2]
  ])('uses a conservative bonus expiring at %s for promotion', (expiresAt, executedCount) => {
    setNow(NOW)
    const planet = tightPlanet()
    const player = makePlayer([planet])
    planet.buildQueue = [{
      id: 'pending-robotics', type: 'building', itemType: BuildingType.RoboticsFactory,
      targetLevel: 1, startTime: NOW, endTime: NOW + HOUR
    }]
    planet.waitingBuildQueue = [BuildingType.MetalMine, BuildingType.CrystalMine].map(buildingType => ({
      ...waitingQueueLogic.createBuildingWaitingItem(buildingType, 9, planet.id), source: 'autopilot' as const
    }))

    const result = waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers, 100, expiresAt)

    expect(result.executed).toHaveLength(executedCount)
  })

  it('passes the active energy officer expiry through processAllWaitingQueues', () => {
    setNow(NOW)
    const planet = tightPlanet()
    const player = makePlayer([planet])
    player.officers[OfficerType.Engineer] = { type: OfficerType.Engineer, active: true, expiresAt: NOW + HOUR / 2 }
    planet.buildQueue = [{
      id: 'pending-robotics', type: 'building', itemType: BuildingType.RoboticsFactory,
      targetLevel: 1, startTime: NOW, endTime: NOW + HOUR
    }]
    planet.waitingBuildQueue = [BuildingType.MetalMine, BuildingType.CrystalMine].map(buildingType => ({
      ...waitingQueueLogic.createBuildingWaitingItem(buildingType, 9, planet.id), source: 'autopilot' as const
    }))
    expect(checkEnergySafeWorstOrder(planet, 10).safe).toBe(true)

    expect(waitingQueueLogic.processAllWaitingQueues(player, getGameNow()).executed).toHaveLength(0)
    expect(planet.waitingBuildQueue).toHaveLength(2)
  })

  it.each([10, 20])('sums three mine upgrades from their targetLevel at level %s regardless of queue order', current => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 20, [BuildingType.MetalMine]: current })
    const before = checkEnergySafeWorstOrder(planet, 0).margin
    planet.waitingBuildQueue = [3, 1, 2].map(offset =>
      waitingQueueLogic.createBuildingWaitingItem(BuildingType.MetalMine, current + offset, planet.id))

    const delta = before - checkEnergySafeWorstOrder(planet, 0).margin
    const consumptionAt = (level: number) => 10 * level * Math.pow(1.1, level)
    const naiveDelta = 3 * (consumptionAt(current + 1) - consumptionAt(current))

    expect(delta).toBeCloseTo(consumptionAt(current + 3) - consumptionAt(current), 8)
    expect(delta).toBeGreaterThan(naiveDelta)
    if (current === 20) {
      expect(delta).toBeCloseTo(714.0, 0)
      expect(naiveDelta).toBeCloseTo(625.7, 0)
    } else {
      expect(consumptionAt(11) - consumptionAt(10)).toBeCloseTo(54.47, 2)
      expect(consumptionAt(12) - consumptionAt(11)).toBeCloseTo(62.77, 1)
    }
  })

  it('accounts for all demolition sources using the post-demolition targetLevel and the correct sign', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 8 })
    const before = checkEnergySafeWorstOrder(planet, 20).margin
    planet.buildQueue = [{ id: 'demolish', type: 'demolish', itemType: BuildingType.SolarPlant, targetLevel: 7, startTime: NOW, endTime: NOW + 1000 }]
    planet.waitingBuildQueue = [
      waitingQueueLogic.createDemolishWaitingItem(BuildingType.SolarPlant, 6, planet.id),
      { ...waitingQueueLogic.createDemolishWaitingItem(BuildingType.SolarPlant, 5, planet.id), source: 'autopilot' }
    ]

    const productionAt = (level: number) => 50 * level * Math.pow(1.1, level) * 1.2
    expect(before - checkEnergySafeWorstOrder(planet, 20).margin).toBeCloseTo(productionAt(8) - productionAt(5), 8)
  })
})

describe('review fixes', () => {
  it('P0-2: removes a manually completed step and advances the next level in the same tick', () => {
    setNow(NOW)
    const planet = makePlanet({ [BuildingType.SolarPlant]: 8, [BuildingType.MetalMine]: 5 })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 7]])
    tickAutopilotPlanet(player, planet, NOW, ctx)
    const staleId = planet.waitingBuildQueue.find(item => item.itemType === BuildingType.MetalMine)!.id
    planet.buildings[BuildingType.MetalMine] = 6

    const result = tickAutopilotPlanet(player, planet, NOW + 1000, ctx)

    expect(planet.waitingBuildQueue.some(item => item.id === staleId)).toBe(false)
    expect(planet.waitingBuildQueue.filter(item => item.itemType === BuildingType.MetalMine)).toMatchObject([
      { targetLevel: 7, source: 'autopilot' }
    ])
    expect(result.enqueued).toBe(1)
  })

  it('P0-2: two over-capacity steps in one tick enqueue only one warehouse', () => {
    setNow(NOW)
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 20,
      [BuildingType.MetalMine]: 19,
      [BuildingType.CrystalMine]: 15,
      [BuildingType.DeuteriumSynthesizer]: 10,
      [BuildingType.RoboticsFactory]: 5,
      [BuildingType.ResearchLab]: 3
    })
    const player = makePlayer([planet])
    enableAutopilot(planet, [[BuildingType.MetalMine, 20], [BuildingType.CrystalMine, 16]])

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(planet.waitingBuildQueue).toMatchObject([{ itemType: BuildingType.MetalStorage, targetLevel: 1 }])
    expect(planet.waitingBuildQueue).toHaveLength(1)
    expect(result.enqueued).toBe(1)
  })

  it.each([undefined, 'autopilot'] as const)('P0-2: removes stale building and research items from source %s even with full queues', source => {
    setNow(NOW)
    const planet = makePlanet({ [BuildingType.MetalMine]: 6 })
    const player = makePlayer([planet], { [TechnologyType.EnergyTechnology]: 2 })
    planet.waitingBuildQueue = [{
      ...waitingQueueLogic.createBuildingWaitingItem(BuildingType.MetalMine, 6, planet.id), source
    }]
    player.waitingResearchQueue = [{
      ...waitingQueueLogic.createResearchWaitingItem(TechnologyType.EnergyTechnology, 2), source
    }]
    planet.buildQueue = Array.from({ length: 3 }, (_, index) => ({
      id: `busy-${index}`, type: 'building', itemType: BuildingType.CrystalMine,
      targetLevel: 1, startTime: NOW, endTime: NOW + 10000
    }))
    player.researchQueue = [{
      id: 'busy-tech', type: 'technology', itemType: TechnologyType.ComputerTechnology,
      targetLevel: 1, startTime: NOW, endTime: NOW + 10000
    }]

    expect(waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers).messages).toEqual(['errors.levelAlreadyReached'])
    expect(waitingQueueLogic.processResearchWaitingQueue(player, planet, player.officers).messages).toEqual(['errors.levelAlreadyReached'])
    expect(planet.waitingBuildQueue).toHaveLength(0)
    expect(player.waitingResearchQueue).toHaveLength(0)
  })

  it('BLK-3: does not queue a second warehouse while one is already waiting', () => {
    // 金属矿 14 费用 11677 > 金属仓 0 级容量 10000 → 触发仓库救援；
    // 等待队列里已有副官的金属仓等待项 → 不得重复排入
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 14,
      [BuildingType.MetalMine]: 13,
      [BuildingType.CrystalMine]: 10,
      [BuildingType.DeuteriumSynthesizer]: 6,
      [BuildingType.RoboticsFactory]: 2,
      [BuildingType.MetalStorage]: 0
    })
    planet.waitingBuildQueue = [
      {
        id: 'w1', type: 'building', itemType: BuildingType.MetalStorage,
        targetLevel: 1, priority: -1, addedTime: 1000, planetId: planet.id, source: 'autopilot'
      } as WaitingQueueItem
    ]
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [[BuildingType.MetalMine, 14]])
    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    const warehouseItems = planet.waitingBuildQueue.filter(i => i.itemType === BuildingType.MetalStorage)
    expect(warehouseItems).toHaveLength(1) // 不重复排入
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedWaitingWarehouse')).toBe(true)
  })

  it('MAJ-1: prunes expired autopilot waiting items (player built it manually)', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 2,
      [BuildingType.MetalMine]: 6 // 玩家手动已建到 6
    })
    planet.waitingBuildQueue = [
      {
        id: 'w1', type: 'building', itemType: BuildingType.MetalMine,
        targetLevel: 6, priority: 0, addedTime: 1000, planetId: planet.id, source: 'autopilot'
      } as WaitingQueueItem,
      {
        id: 'w2', type: 'building', itemType: BuildingType.CrystalMine,
        targetLevel: 3, priority: 1, addedTime: 1000, planetId: planet.id // 玩家手动项不过期
      } as WaitingQueueItem
    ]
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [[BuildingType.MetalMine, 8]])
    tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(planet.waitingBuildQueue.find(i => i.id === 'w1')).toBeUndefined()
    expect(planet.waitingBuildQueue.find(i => i.id === 'w2')).toBeDefined()
  })

  it('MAJ-1/MAJ-6: withdrawAutopilotWaiting removes by target or all', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    planet.waitingBuildQueue = [
      { id: 'a1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 2, priority: 0, addedTime: 1, planetId: 'p', source: 'autopilot', targetId: 't1' },
      { id: 'a2', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 2, priority: 1, addedTime: 1, planetId: 'p', source: 'autopilot', targetId: 't2' },
      { id: 'p1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 2, priority: 999, addedTime: 1, planetId: 'p' }
    ] as WaitingQueueItem[]

    expect(withdrawAutopilotWaiting(planet, 't1')).toBe(1)
    expect(planet.waitingBuildQueue.map(i => i.id).sort()).toEqual(['a2', 'p1'])
    expect(withdrawAutopilotWaiting(planet)).toBe(1)
    expect(planet.waitingBuildQueue.map(i => i.id)).toEqual(['p1']) // 玩家项保留
  })

  it('MAJ-2: ship/defense queue items do not consume autopilot building slots', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 2,
      [BuildingType.MetalMine]: 3,
      [BuildingType.Shipyard]: 2
    })
    // 正式队列塞满舰船/防御（非建筑槽项）
    planet.buildQueue = [
      { id: 's1', type: 'ship', itemType: 'lightFighter', quantity: 10, startTime: 0, endTime: 999999 },
      { id: 's2', type: 'ship', itemType: 'lightFighter', quantity: 10, startTime: 0, endTime: 999999 },
      { id: 'd1', type: 'defense', itemType: 'rocketLauncher', quantity: 5, startTime: 0, endTime: 999999 }
    ] as unknown as Planet['buildQueue']
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [[BuildingType.MetalMine, 4]])
    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 建筑槽实际空闲（capacity 3 - 0 建筑项 - 保留 1 = 2 可用），副官应能排入
    expect(result.enqueued).toBeGreaterThan(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoSlot')).toBe(false)
  })

  it('MAJ-4: a busy long-time step does not trigger downgrade', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 2,
      [BuildingType.MetalMine]: 3
    })
    // 玩家手动在建金属矿 4（工时短），但目标金属 12 的后续步骤工时长；
    // 当前步骤（金属 4）在建中 → 不应因「未来长工时」降级
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 4, startTime: NOW - 1000, endTime: NOW + 3600_000 }
    ]
    const player = makePlayer([planet])
    setNow(NOW)
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 5]])
    config.workHourThreshold = 1 // 极小阈值：任何可排步骤都会超限
    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 唯一可规划的步骤（金属 4）在建中 → 跳过，不触发降级
    expect(result.downgraded).toBe(false)
    expect(config.mode).toBe('auto')
  })

  it('MAJ-3: player waiting items sort before autopilot items', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const playerItem = {
      id: 'p1', type: 'building', itemType: BuildingType.CrystalMine,
      targetLevel: 2, priority: Date.now(), addedTime: 2, planetId: planet.id
    } as WaitingQueueItem
    const autoItem = {
      id: 'a1', type: 'building', itemType: BuildingType.MetalMine,
      targetLevel: 2, priority: 0, addedTime: 1, planetId: planet.id, source: 'autopilot'
    } as const
    waitingQueueLogic.addToBuildWaitingQueue(planet, autoItem as WaitingQueueItem)
    waitingQueueLogic.addToBuildWaitingQueue(planet, playerItem)
    // 副官项 priority 更小，但玩家项必须排前面
    expect(planet.waitingBuildQueue[0]!.id).toBe('p1')
    expect(planet.waitingBuildQueue[1]!.id).toBe('a1')
  })
})

describe('review patch round 2', () => {
  it('BLK-1: resources keep growing across consecutive ticks after a 4h fast-forward', () => {
    setNow(NOW)
    try {
      // 快转 4 小时：虚拟时间 = 真实时间 + 4h，之后每秒 tick 必须持续推进（不冻结）
      setTimeOffset(4 * HOUR)
      const planet = makePlanet(
        { [BuildingType.SolarPlant]: 5, [BuildingType.MetalMine]: 5 },
        { resources: { metal: 100, crystal: 100, deuterium: 0, darkMatter: 0, energy: 5000 } }
      )
      planet.lastUpdate = getGameNow()
      const bonuses = {
        resourceProductionBonus: 0,
        darkMatterProductionBonus: 0,
        energyProductionBonus: 0,
        storageCapacityBonus: 0
      }
      const seen: number[] = [planet.resources.metal ?? 0]
      for (let i = 0; i < 3; i++) {
        jump(1000) // 每个 tick 间隔 1 真实秒
        resourceLogic.updatePlanetResources(planet, getGameNow(), bonuses)
        seen.push(planet.resources.metal ?? 0)
      }
      expect(seen[1]).toBeGreaterThan(seen[0]!)
      expect(seen[2]).toBeGreaterThan(seen[1]!)
      expect(seen[3]).toBeGreaterThan(seen[2]!)
    } finally {
      setTimeOffset(0)
    }
  })

  it('BLK-2: two individually-safe targets that black out together enqueue only one per tick', () => {
    // review 原例：太阳能 1（产 55）+ 金属 2 / 晶体 1（耗 35.2），余量 19.8；
    // 金属 3（增耗 +15.7）与晶体 2（增耗 +13.2）各自单独验证都安全（余量 4.1 / 6.6），
    // 合起来余量 -9.1 会断电 → 同一 tick 只允许排入一项
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 1,
      [BuildingType.MetalMine]: 2,
      [BuildingType.CrystalMine]: 1
    })
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [[BuildingType.MetalMine, 3], [BuildingType.CrystalMine, 2]])

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 优先级高的金属 3 先排入；合起来断电的晶体 2 不得排入
    expect(
      planet.waitingBuildQueue.some(i => i.itemType === BuildingType.MetalMine && i.source === 'autopilot')
    ).toBe(true)
    expect(
      planet.waitingBuildQueue.some(i => i.itemType === BuildingType.CrystalMine && i.source === 'autopilot')
    ).toBe(false)
    expect(
      result.blockers.some(b => b.reason === 'autopilot.blockedEnergy' || b.reason === 'autopilot.blockedEnergyRescue')
    ).toBe(true)
    // 最终在途组合不断电
    expect(checkEnergySafeWorstOrder(planet, 0).safe).toBe(true)
  })

  it('BLK-3: warehouse rescue is not duplicated across ticks', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 14,
      [BuildingType.MetalMine]: 13,
      [BuildingType.CrystalMine]: 10,
      [BuildingType.DeuteriumSynthesizer]: 6,
      [BuildingType.RoboticsFactory]: 2,
      [BuildingType.MetalStorage]: 0
    })
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [[BuildingType.MetalMine, 14]])

    tickAutopilotPlanet(player, planet, NOW, ctx)
    tickAutopilotPlanet(player, planet, NOW + 1000, ctx)

    const warehouseItems = planet.waitingBuildQueue.filter(i => i.itemType === BuildingType.MetalStorage)
    expect(warehouseItems).toHaveLength(1)
  })

  it('MAJ-1: a manually completed building expires the autopilot waiting item mid-flight', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 5, [BuildingType.MetalMine]: 5 })
    const player = makePlayer([planet])
    setNow(NOW)
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 6]])

    const r1 = tickAutopilotPlanet(player, planet, NOW, ctx)
    expect(r1.enqueued).toBe(1)
    const waitingId = planet.waitingBuildQueue.find(i => i.itemType === BuildingType.MetalMine)!.id

    // 玩家手动把金属矿建到 6（副官的等待项过期）
    planet.buildings[BuildingType.MetalMine] = 6
    const r2 = tickAutopilotPlanet(player, planet, NOW + 1000, ctx)

    expect(planet.waitingBuildQueue.find(i => i.id === waitingId)).toBeUndefined()
    expect(config.targets[0]!.completed).toBe(true)
    expect(r2.completedTargets.map(t => t.buildingType)).toEqual([BuildingType.MetalMine])

    // 已达标不再重复报告
    const r3 = tickAutopilotPlanet(player, planet, NOW + 2000, ctx)
    expect(r3.completedTargets).toHaveLength(0)
  })

  it('MAJ-2: a truly full building queue blocks the autopilot with blockedNoSlot', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 2, [BuildingType.MetalMine]: 3 })
    // 正式队列塞满 3 个建筑项（capacity 3）：副官槽位预算 = 3 - 1（给玩家留一槽）= 2 已用完
    planet.buildQueue = [
      { id: 'b1', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 2, startTime: 0, endTime: 999999 },
      { id: 'b2', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 3, startTime: 0, endTime: 999999 },
      { id: 'b3', type: 'building', itemType: BuildingType.CrystalMine, targetLevel: 4, startTime: 0, endTime: 999999 }
    ] as unknown as Planet['buildQueue']
    const player = makePlayer([planet])
    setNow(NOW)
    enableAutopilot(planet, [[BuildingType.MetalMine, 4]])

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoSlot')).toBe(true)
  })

  it('MAJ-3: the player waiting item executes before the autopilot item', () => {
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 2, [BuildingType.MetalMine]: 1, [BuildingType.CrystalMine]: 1 },
      // 资源只够一项：晶体 2（76m/38c）可建，金属 2（90m/22c）不够
      { resources: { metal: 80, crystal: 50, deuterium: 0, darkMatter: 0, energy: 5000 } }
    )
    const player = makePlayer([planet])
    setNow(NOW)
    // 副官项 priority 更小，但玩家项必须先执行
    waitingQueueLogic.addToBuildWaitingQueue(planet, {
      id: 'a1', type: 'building', itemType: BuildingType.MetalMine,
      targetLevel: 2, priority: 0, addedTime: 1, planetId: planet.id, source: 'autopilot'
    } as WaitingQueueItem)
    waitingQueueLogic.addToBuildWaitingQueue(planet, {
      id: 'p1', type: 'building', itemType: BuildingType.CrystalMine,
      targetLevel: 2, priority: Date.now(), addedTime: 2, planetId: planet.id
    } as WaitingQueueItem)

    const { executed } = waitingQueueLogic.processPlanetWaitingQueue(planet, player, player.officers)

    expect(executed.map(i => i.id)).toEqual(['p1'])
    expect(planet.waitingBuildQueue.map(i => i.id)).toEqual(['a1'])
    expect(planet.buildQueue.some(q => q.itemType === BuildingType.CrystalMine)).toBe(true)
  })

  it('MAJ-4: a blocked long-time step does not trigger downgrade', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 }, { isMoon: true })
    const player = makePlayer([planet])
    setNow(NOW)
    const config = enableAutopilot(planet, [[BuildingType.SolarPlant, 5]])
    config.workHourThreshold = 1 // 极小阈值：任何可排步骤都会超限
    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 太阳能是 planetOnly：月球上永久 blockedMoonIncompatible，不应触发降级
    expect(result.downgraded).toBe(false)
    expect(config.mode).toBe('auto')
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedMoonIncompatible')).toBe(true)
  })

  it('MAJ-8: a resource-blocked high-priority step soft-reserves its gap; income buildings bypass, non-income steps stay constrained', () => {
    const planet = makePlanet(
      {
        [BuildingType.SolarPlant]: 20,
        [BuildingType.MetalMine]: 19,
        [BuildingType.CrystalMine]: 15,
        [BuildingType.DeuteriumSynthesizer]: 2,
        [BuildingType.RoboticsFactory]: 5,
        [BuildingType.ResearchLab]: 3,
        [BuildingType.MetalStorage]: 12,
        [BuildingType.CrystalStorage]: 12,
        [BuildingType.DeuteriumTank]: 12
      },
      // 金属 20（133010m/33252c）：晶体不够被挡，缺口 33252-30000=3252；
      // 晶体 16（55339m/27670c）单独看可建；机器人 6（12800m/3840c/6400d）单独看可建
      { resources: { metal: 200000, crystal: 30000, deuterium: 100000, darkMatter: 0, energy: 5000 } }
    )
    const player = makePlayer([planet])
    setNow(NOW)
    const config = enableAutopilot(planet, [
      [BuildingType.MetalMine, 20],
      [BuildingType.CrystalMine, 16],
      [BuildingType.RoboticsFactory, 6]
    ])
    config.workHourThreshold = 1e12 // 关掉工时降级，单独验证软预留

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    const reasons = result.blockers.map(b => `${b.itemType}:${b.reason}`)
    // 高优先级金属矿 20 被资源挡住，缺口 3252 晶体进入软预留
    expect(reasons).toContain(`${BuildingType.MetalMine}:autopilot.blockedNoResource`)
    // 晶体矿 16 是收入型建筑且软预留有晶体缺口 → bypass，照常排入（旧逻辑下会被误杀）
    expect(planet.waitingBuildQueue.some(
      i => i.itemType === BuildingType.CrystalMine && i.targetLevel === 16
    )).toBe(true)
    expect(reasons).not.toContain(`${BuildingType.CrystalMine}:autopilot.blockedNoResource`)
    // 机器人厂 6 不产资源、无 bypass：排入晶体矿 16 后晶体只剩 2330，扣掉软预留 3252 不够 3840 → 仍被挡
    expect(reasons).toContain(`${BuildingType.RoboticsFactory}:autopilot.blockedNoResource`)
    expect(result.enqueued).toBe(1)
  })

  it('MAJ-8 (research): a resource-blocked high-priority research soft-reserves its gap only', () => {
    const planet = makePlanet(
      {
        [BuildingType.SolarPlant]: 2,
        [BuildingType.ResearchLab]: 1,
        [BuildingType.MetalMine]: 1,
        [BuildingType.CrystalMine]: 1,
        [BuildingType.DeuteriumSynthesizer]: 1
      },
      // 能源 4（6400c/3200d）：晶体不够被挡；激光 1（200m/100c）单独看可建
      { resources: { metal: 50000, crystal: 5000, deuterium: 5000, darkMatter: 0, energy: 5000 } }
    )
    const player = makePlayer([planet], { [TechnologyType.EnergyTechnology]: 3 })
    setNow(NOW)
    const config = enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 4], [TechnologyType.LaserTechnology, 1]])
    config.workHourThreshold = 1e12 // 关掉工时降级，单独验证软预留

    const result = tickEmpireResearch(player, NOW, ctx)

    // 能源 4（6400c/3200d）缺晶体 1400 → 被挡，缺口 1400 进入软预留；
    // 激光 1（200m/100c）只累加缺口后仍买得起（3600 ≥ 100）→ 排入（旧逻辑全额预留会把它误杀）
    expect(result.enqueued).toBe(1)
    expect(result.blockers.some(
      b => b.itemType === TechnologyType.EnergyTechnology && b.reason === 'autopilot.blockedNoResource'
    )).toBe(true)
    expect(player.waitingResearchQueue.some(
      i => i.itemType === TechnologyType.LaserTechnology && i.targetLevel === 1
    )).toBe(true)
  })

  it('Minor-2: energy rescue is exempt from the minFreeSpace reserve', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1, [BuildingType.MetalMine]: 4, [BuildingType.CrystalMine]: 3 })
    const player = makePlayer([planet])
    setNow(NOW)
    // 空间刚好卡住 B5 预留：没有豁免的话救援会被 blockedNoSpace 挡住
    const usedSpace = buildingLogic.calculateUsedSpace(planet)
    const solarSpace = BUILDINGS[BuildingType.SolarPlant].spaceUsage
    planet.maxSpace = usedSpace + solarSpace + 5
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 5]])
    expect(usedSpace + solarSpace > planet.maxSpace - config.minFreeSpace).toBe(true)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 金属 5 会断电 → 触发能源救援，豁免空间预留后成功排入
    const rescue = planet.waitingBuildQueue.find(i => i.itemType === BuildingType.SolarPlant && i.source === 'autopilot')
    expect(rescue).toBeDefined()
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedEnergyRescue')).toBe(true)
  })

  it('Minor-5: the research tick deducts the lab planet autopilot reserve from its snapshot', () => {
    const planet = makePlanet(
      {
        [BuildingType.SolarPlant]: 2,
        [BuildingType.ResearchLab]: 1,
        [BuildingType.MetalMine]: 1,
        [BuildingType.CrystalMine]: 1,
        [BuildingType.DeuteriumSynthesizer]: 1
      },
      {
        resources: { metal: 50000, crystal: 50000, deuterium: 5000, darkMatter: 0, energy: 5000 },
        autopilot: { ...createDefaultPlanetAutopilot(), reserve: { metal: 49000, crystal: 49900, deuterium: 0 } }
      }
    )
    const player = makePlayer([planet], {})
    setNow(NOW)
    const config = enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 1]])
    config.workHourThreshold = 1e12

    const result = tickEmpireResearch(player, NOW, ctx)

    // 能源 1（800m/400c）单独看资源充足，但扣掉星球副官预留（剩 1000m/100c）后不够 → 被挡
    expect(result.enqueued).toBe(0)
    expect(result.blockers.some(b => b.reason === 'autopilot.blockedNoResource')).toBe(true)
  })

  it('MAJ-5: setAutopilotMode refuses to bypass the resume guard', () => {
    const config = createDefaultPlanetAutopilot()
    config.mode = 'execute'
    config.downgradeReason = 'autopilot.downgradeWorkTime'
    config.canResumeAuto = false

    expect(setAutopilotMode(config, 'auto')).toBe(false)
    expect(config.mode).toBe('execute')

    config.canResumeAuto = true
    expect(setAutopilotMode(config, 'auto')).toBe(true)
    expect(config.mode).toBe('auto')
    expect(config.downgradeReason).toBeUndefined()
  })
})

describe('MAJ-8 软预留改版：收入型建筑 bypass（死锁回归）', () => {
  it('太阳能3因缺金属被挡时，金属矿1通过 bypass 排入；收入起来后太阳能3最终排上', () => {
    setNow(NOW)
    // 帕吉场景：太阳能2/重氢1/金属0/晶体0，资源 metal 88 / crystal 350 / deuterium 426
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 2, [BuildingType.DeuteriumSynthesizer]: 1 },
      { resources: { metal: 88, crystal: 350, deuterium: 426, darkMatter: 0, energy: 0 } }
    )
    const player = makePlayer([planet])
    const config = createDefaultPlanetAutopilot()
    config.enabled = true
    planet.autopilot = config
    applyBlueprintToPlanet(config, 'economy', NOW) // 太阳能→6（优先级0）、金属→12、晶体→10…

    const result1 = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 太阳能3造价约 168 金属，88 金属确实不够 → 被资源挡住（这就是它的高优先级软预留来源）
    const solarBlocker = result1.blockers.find(
      b => b.itemType === BuildingType.SolarPlant && b.level === 3
    )
    expect(solarBlocker?.reason).toBe('autopilot.blockedNoResource')

    // 死锁修复：金属矿1是收入型建筑，软预留缺口豁免 → 排入而非 blockedNoResource
    // （旧逻辑下太阳能3的全额成本会把 planningResources 扣成负数，金属矿1也被挡）
    expect(result1.blockers.some(
      b => b.itemType === BuildingType.MetalMine && b.reason === 'autopilot.blockedNoResource'
    )).toBe(false)
    expect(planet.waitingBuildQueue.some(
      i => i.itemType === BuildingType.MetalMine && i.targetLevel === 1
    )).toBe(true)

    // 模拟：金属矿1完工 + 一轮收入（金属涨到 5000）
    planet.buildings[BuildingType.MetalMine] = 1
    planet.waitingBuildQueue = []
    planet.resources.metal = 5000

    // 下一个 tick：太阳能3的资源检查通过 → 最终排上
    tickAutopilotPlanet(player, planet, NOW + 1000, ctx)
    expect(planet.waitingBuildQueue.some(
      i => i.itemType === BuildingType.SolarPlant && i.targetLevel === 3
    )).toBe(true)
  })

  it('bypass 不豁免显式 reserve：收入建筑缺口再大也盖不掉用户预留', () => {
    setNow(NOW)
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 2 },
      { resources: { metal: 88, crystal: 350, deuterium: 0, darkMatter: 0, energy: 0 } }
    )
    const player = makePlayer([planet])
    const config = createDefaultPlanetAutopilot()
    config.enabled = true
    config.reserve = { metal: 80, crystal: 0, deuterium: 0 } // 用户显式预留 80 金属
    planet.autopilot = config
    applyBlueprintToPlanet(config, 'economy', NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 可用金属只有 88-80=8，金属矿1（60金属）就算有 bypass 也排不上；
    // 且必须有 blockedNoResource 记录（不是静默放行也不是其他原因）
    expect(planet.waitingBuildQueue.some(i => i.itemType === BuildingType.MetalMine)).toBe(false)
    expect(result.blockers.some(
      b => b.itemType === BuildingType.MetalMine && b.reason === 'autopilot.blockedNoResource'
    )).toBe(true)
  })
  it('重氢合成器 bypass：高优先级聚变堆因缺重氢被挡时，重氢合成器豁免重氢软预留排入', () => {
    setNow(NOW)
    const planet = makePlanet(
      {
        [BuildingType.SolarPlant]: 8,
        [BuildingType.MetalMine]: 8,
        [BuildingType.CrystalMine]: 8,
        [BuildingType.DeuteriumSynthesizer]: 5 // 聚变堆前置要求重氢 5
      },
      { resources: { metal: 50000, crystal: 50000, deuterium: 50, darkMatter: 0, energy: 5000 } }
    )
    // 聚变堆前置：能源科技 3（重氢 5 已满足）
    const player = makePlayer([planet], { [TechnologyType.EnergyTechnology]: 3 })
    const config = enableAutopilot(planet, [
      [BuildingType.FusionReactor, 1], // priority 0：180 重氢 > 50 → 被挡，缺口 130 进入软预留
      [BuildingType.DeuteriumSynthesizer, 7] // priority 1：收入型建筑，bypass 重氢软预留
    ])
    config.workHourThreshold = 1e12

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 聚变堆因缺重氢被挡住
    expect(result.blockers.some(
      b => b.itemType === BuildingType.FusionReactor && b.reason === 'autopilot.blockedNoResource'
    )).toBe(true)
    // 重氢合成器 6 本身不花重氢，但旧逻辑下 planning 重氢被扣成 -130，连 0 花费都过不了；
    // bypass 豁免重氢软预留 → 排入而非被挡
    expect(planet.waitingBuildQueue.some(
      i => i.itemType === BuildingType.DeuteriumSynthesizer && i.targetLevel === 6
    )).toBe(true)
    expect(result.blockers.some(
      b => b.itemType === BuildingType.DeuteriumSynthesizer && b.reason === 'autopilot.blockedNoResource'
    )).toBe(false)
  })

  it('soft 预留为空时 bypass 不生效：收入建筑缺资源照常被挡', () => {
    setNow(NOW)
    const planet = makePlanet(
      { [BuildingType.SolarPlant]: 3, [BuildingType.MetalMine]: 2 },
      { resources: { metal: 10, crystal: 5000, deuterium: 0, darkMatter: 0, energy: 5000 } }
    )
    const player = makePlayer([planet])
    // 唯一目标：金属矿 3（135 金属 > 10，可用资源不够；且它是第一个步骤，无软预留）
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 3]])
    config.workHourThreshold = 1e12

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    // 软预留为空，bypass 无从生效 → 照常被资源挡住，且有明确 blocker 记录
    expect(result.blockers.some(
      b => b.itemType === BuildingType.MetalMine && b.reason === 'autopilot.blockedNoResource'
    )).toBe(true)
    expect(planet.waitingBuildQueue.length).toBe(0)
  })
})
