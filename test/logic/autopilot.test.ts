import { afterEach, describe, expect, it } from 'vitest'
import type { AutopilotPlanetConfig, EmpireResearchAutopilot, Planet, Player, WaitingQueueItem } from '@/types/game'
import { BuildingType, TechnologyType } from '@/types/game'
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
  tickAutopilotPlanet,
  tickEmpireResearch
} from '@/logic/autopilotLogic'
import { setNow, restore } from '../utils/time'

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
  it('marks a target complete when actual level reaches the target', () => {
    const planet = makePlanet({ [BuildingType.MetalMine]: 10 })
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 10], [BuildingType.CrystalMine, 5]])
    setNow(NOW)

    const completed = reconcileTargets(config, planet)

    expect(completed.map(t => t.buildingType)).toEqual([BuildingType.MetalMine])
    expect(config.targets.map(t => t.buildingType)).toEqual([BuildingType.CrystalMine])
  })

  it('reopens progress when the player demolishes below the target', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 8, [BuildingType.MetalMine]: 10 })
    const config = enableAutopilot(planet, [[BuildingType.MetalMine, 10]])
    reconcileTargets(config, planet)
    expect(config.targets).toHaveLength(0)

    // 玩家拆除后等级回落：重新加入目标，下次 tick 从实际等级重推
    config.targets = [createAutopilotTarget(BuildingType.MetalMine, 10, 0, 1000)]
    planet.buildings[BuildingType.MetalMine] = 8
    const completed = reconcileTargets(config, planet)

    expect(completed).toHaveLength(0)
    expect(config.targets).toHaveLength(1)
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

  it('returns null when the cost already fits capacity', () => {
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

    expect(rescue).toBeNull()
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

  it('marks research targets complete from actual tech levels', () => {
    const player = researchPlayer({ [TechnologyType.EnergyTechnology]: 2 })
    const config = enableResearchAutopilot(player, [[TechnologyType.EnergyTechnology, 2]])
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.completedTargets).toHaveLength(1)
    expect(config.targets).toHaveLength(0)
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
