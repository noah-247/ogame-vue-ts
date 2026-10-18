import { afterEach, describe, expect, it } from 'vitest'
import type { AutopilotContract, Planet, Player, WaitingQueueItem } from '@/types/game'
import { BuildingType, TechnologyType } from '@/types/game'
import {
  createDefaultContext,
  createDefaultEmpireResearchAutopilot,
  createDefaultPlanetAutopilot,
  createAutopilotTarget,
  createAutopilotResearchTarget,
  tickAutopilotPlanet,
  tickEmpireResearch
} from '@/logic/autopilotLogic'
import {
  createDefaultContract,
  processBillingTick,
  toBillingPlanetInput
} from '@/logic/autopilotBilling'
import {
  createBuildingWaitingItem,
  createResearchWaitingItem,
  processPlanetWaitingQueue,
  processResearchWaitingQueue
} from '@/logic/waitingQueueLogic'
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

/** 附带指定状态合约的玩家（缺省 = 无合约） */
const withContract = (player: Player, status: AutopilotContract['status']): AutopilotContract => {
  const contract = { ...createDefaultContract('planet-1', ['planet-1']), status }
  player.autopilotContract = contract
  return contract
}

const enablePlanetAutopilot = (planet: Planet) => {
  const config = createDefaultPlanetAutopilot()
  config.enabled = true
  config.targets = [createAutopilotTarget(BuildingType.MetalMine, 3, 0, 1000)]
  planet.autopilot = config
}

const enableResearchAutopilot = (player: Player) => {
  const config = createDefaultEmpireResearchAutopilot()
  config.enabled = true
  config.targets = [createAutopilotResearchTarget(TechnologyType.EnergyTechnology, 2, 0, 1000)]
  player.empireResearchAutopilot = config
}

const ctx = createDefaultContext()
const NOW = 1_700_000_000_000

describe('tickAutopilotPlanet 计费守卫（v3 §4.1）', () => {
  it('无合约时不产生任何副官工作', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enablePlanetAutopilot(planet)
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(planet.waitingBuildQueue).toHaveLength(0)
  })

  it('合约 inactive 时不产生副官工作', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enablePlanetAutopilot(planet)
    withContract(player, 'inactive')
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(planet.waitingBuildQueue).toHaveLength(0)
  })

  it('合约 paused_funds 时不产生副官工作', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enablePlanetAutopilot(planet)
    withContract(player, 'paused_funds')
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(planet.waitingBuildQueue).toHaveLength(0)
  })

  it('合约 active 时副官正常工作（守卫放行）', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 1 })
    const player = makePlayer([planet])
    enablePlanetAutopilot(planet)
    withContract(player, 'active')
    setNow(NOW)

    const result = tickAutopilotPlanet(player, planet, NOW, ctx)

    expect(result.enqueued).toBe(1)
    expect(planet.waitingBuildQueue[0]!.source).toBe('autopilot')
  })
})

describe('tickEmpireResearch 计费守卫', () => {
  it('无合约时帝国研究副官不产生工作', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 2,
      [BuildingType.ResearchLab]: 1,
      [BuildingType.MetalMine]: 1,
      [BuildingType.CrystalMine]: 1,
      [BuildingType.DeuteriumSynthesizer]: 1
    })
    const player = makePlayer([planet])
    enableResearchAutopilot(player)
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.enqueued).toBe(0)
    expect(player.waitingResearchQueue).toHaveLength(0)
  })

  it('合约 active 时帝国研究副官正常工作', () => {
    const planet = makePlanet({
      [BuildingType.SolarPlant]: 2,
      [BuildingType.ResearchLab]: 1,
      [BuildingType.MetalMine]: 1,
      [BuildingType.CrystalMine]: 1,
      [BuildingType.DeuteriumSynthesizer]: 1
    })
    const player = makePlayer([planet])
    enableResearchAutopilot(player)
    withContract(player, 'active')
    setNow(NOW)

    const result = tickEmpireResearch(player, NOW, ctx)

    expect(result.enqueued).toBe(1)
    expect(player.waitingResearchQueue[0]!.source).toBe('autopilot')
  })
})

describe('waitingQueue 开工守卫（v3 §4.1）', () => {
  it('无合约：autopilot 来源不开工，手動项（player/缺省）不受影响', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 2 })
    const player = makePlayer([planet]) // 无合约
    const autopilotItem = { ...createBuildingWaitingItem(BuildingType.MetalMine, 1, planet.id), source: 'autopilot' as const, priority: 0 }
    const manualItem: WaitingQueueItem = { ...createBuildingWaitingItem(BuildingType.CrystalMine, 1, planet.id), source: 'player', priority: 1 }
    const defaultItem: WaitingQueueItem = { ...createBuildingWaitingItem(BuildingType.SolarPlant, 3, planet.id), priority: 2 } // 缺省 = 手动
    planet.waitingBuildQueue = [autopilotItem, manualItem, defaultItem]
    setNow(NOW)

    const result = processPlanetWaitingQueue(planet, player, player.officers, 0)

    expect(result.executed.map(i => i.itemType)).toEqual([BuildingType.CrystalMine, BuildingType.SolarPlant])
    expect(planet.waitingBuildQueue.map(i => i.itemType)).toEqual([BuildingType.MetalMine])
    expect(planet.waitingBuildQueue[0]!.source).toBe('autopilot')
  })

  it('合约 active：autopilot 来源正常开工', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 2 })
    const player = makePlayer([planet])
    withContract(player, 'active')
    const autopilotItem = { ...createBuildingWaitingItem(BuildingType.MetalMine, 1, planet.id), source: 'autopilot' as const }
    planet.waitingBuildQueue = [autopilotItem]
    setNow(NOW)

    const result = processPlanetWaitingQueue(planet, player, player.officers, 0)

    expect(result.executed).toEqual([autopilotItem])
    expect(planet.waitingBuildQueue).toHaveLength(0)
  })

  it('研究等待队列：无合约时 autopilot 来源不开工，手動项不受影响', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 2, [BuildingType.ResearchLab]: 1 })
    const player = makePlayer([planet]) // 无合约
    const autopilotItem = { ...createResearchWaitingItem(TechnologyType.EnergyTechnology, 1), source: 'autopilot' as const }
    const manualItem: WaitingQueueItem = { ...createResearchWaitingItem(TechnologyType.EnergyTechnology, 2), source: 'player' }
    player.waitingResearchQueue = [autopilotItem, manualItem]
    setNow(NOW)

    const result = processResearchWaitingQueue(player, planet, player.officers)

    expect(result.executed).toEqual([manualItem])
    expect(player.waitingResearchQueue).toEqual([autopilotItem])
  })

  it('无合约时已开工项（buildQueue）不受影响，只挡新工作', () => {
    const planet = makePlanet({ [BuildingType.SolarPlant]: 2 })
    const player = makePlayer([planet]) // 无合约
    const startedItem: WaitingQueueItem = {
      id: 'started-1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 1,
      priority: 0, addedTime: NOW, planetId: planet.id, source: 'autopilot'
    }
    // 模拟已开工：已在正式队列（processGameUpdate 推进，不经过等待队列守卫）
    planet.buildQueue = [{ id: 'bq-1', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 1, startTime: NOW, endTime: NOW + 60000 } as never]
    planet.waitingBuildQueue = [startedItem]
    setNow(NOW)

    processPlanetWaitingQueue(planet, player, player.officers, 0)

    expect(planet.buildQueue).toHaveLength(1) // 已开工继续
    expect(planet.waitingBuildQueue).toEqual([startedItem]) // 新工作不开工
  })
})

describe('processBillingTick（tick 累加与结算）', () => {
  const richResources = () => ({ metal: 1_000_000, crystal: 1_000_000, deuterium: 1_000_000 })
  const oneLevelInputs = () => [
    { metalMineLevel: 1, crystalMineLevel: 1, deuteriumMineLevel: 1, energyEfficiency: 1 }
  ] // 费率 70/50/30 每小时

  it('不同 gameSpeed：10 虚拟秒 × 6 倍速 = 60 计费秒，结算 1 分钟并扣款', () => {
    const contract = withContract(makePlayer([]), 'active')
    const payer = richResources()

    const result = processBillingTick(contract, {
      virtualSeconds: 10, gameSpeed: 6, isFastForward: false,
      servicePlanetInputs: oneLevelInputs(), payerResources: payer
    })

    expect(result.settledMinutes).toBe(1)
    expect(result.pausedForFunds).toBe(false)
    expect(contract.dutySecondsAcc).toBe(0)
    expect(payer.metal).toBe(999_999) // 70/60 ≈ 1.167 → 扣 1
    expect(payer.crystal).toBe(1_000_000) // 50/60 < 1 → 扣 0，余数保留
    expect(contract.totalConsumedMetal).toBe(1)
  })

  it('快转 tick（isFastForward）不累加计费秒、不扣款（比照离线）', () => {
    const contract = withContract(makePlayer([]), 'active')
    const payer = richResources()

    const result = processBillingTick(contract, {
      virtualSeconds: 3600, gameSpeed: 10, isFastForward: true,
      servicePlanetInputs: oneLevelInputs(), payerResources: payer
    })

    expect(result.settledMinutes).toBe(0)
    expect(contract.dutySecondsAcc).toBe(0)
    expect(payer).toEqual(richResources())
  })

  it('无合约/非 active/虚拟秒为 0 时跳过', () => {
    const payer = richResources()
    const base = { gameSpeed: 1, isFastForward: false, servicePlanetInputs: oneLevelInputs(), payerResources: payer }
    expect(processBillingTick(undefined, { ...base, virtualSeconds: 60 }).settledMinutes).toBe(0)
    const inactive = withContract(makePlayer([]), 'inactive')
    expect(processBillingTick(inactive, { ...base, virtualSeconds: 60 }).settledMinutes).toBe(0)
    const active = withContract(makePlayer([]), 'active')
    expect(processBillingTick(active, { ...base, virtualSeconds: 0 }).settledMinutes).toBe(0)
    expect(active.dutySecondsAcc).toBe(0)
    expect(payer).toEqual(richResources())
  })

  it('余额不足 → paused_funds，小数累计冻结（余数不动）', () => {
    const contract = withContract(makePlayer([]), 'active')
    contract.accruedMicroMetal = 123456 // 预置余数，结算失败后应原样保留
    const payer = { metal: 0, crystal: 1_000_000, deuterium: 1_000_000 } // 金属不够扣 1

    const result = processBillingTick(contract, {
      virtualSeconds: 60, gameSpeed: 1, isFastForward: false,
      servicePlanetInputs: oneLevelInputs(), payerResources: payer
    })

    expect(result.pausedForFunds).toBe(true)
    expect(contract.status).toBe('paused_funds')
    expect(contract.accruedMicroMetal).toBe(123456) // 冻结
    expect(contract.totalConsumedMetal).toBe(0)
    expect(payer.metal).toBe(0)
  })
})

describe('toBillingPlanetInput', () => {
  it('能源充足 → efficiency 1；停电（只建矿无能源）→ 0', () => {
    const powered = makePlanet({ [BuildingType.SolarPlant]: 5, [BuildingType.MetalMine]: 3 })
    const blackout = makePlanet({ [BuildingType.MetalMine]: 3 })

    const a = toBillingPlanetInput(powered, 0)
    expect(a).toEqual({ metalMineLevel: 3, crystalMineLevel: 0, deuteriumMineLevel: 0, energyEfficiency: 1 })

    const b = toBillingPlanetInput(blackout, 0)
    expect(b.metalMineLevel).toBe(3)
    expect(b.energyEfficiency).toBe(0)
  })
})
