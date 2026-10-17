import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BuildingType, TechnologyType } from '@/types/game'
import { calculateBuildingTime } from '@/logic/buildingLogic'
import {
  createAutopilotTarget, createAutopilotResearchTarget, createDefaultContext, createDefaultEmpireResearchAutopilot,
  setAutopilotMode, tickAutopilotPlanet, tickEmpireResearch
} from '@/logic/autopilotLogic'
import { applyBlueprintAndEnablePlanet, enablePlanetAutopilot, shouldStartInMonitoring } from '@/logic/autopilotLifecycle'
import { collectAutopilotAlerts, createDefaultForecastContext } from '@/logic/autopilotAlerts'
import { processPlanetWaitingQueue, processResearchWaitingQueue } from '@/logic/waitingQueueLogic'
import { monitoringPlanet, monitoringPlayer } from '../utils/autopilot'
import { HOUR, jump, restore, setNow } from '../utils/time'

beforeEach(() => setNow(1_700_000_000_000))
afterEach(restore)
const context = createDefaultContext()

const maturePlanet = () => {
  const planet = monitoringPlanet()
  planet.autopilot!.enabled = false
  planet.buildings[BuildingType.MetalMine] = 20
  planet.buildings[BuildingType.CrystalMine] = 20
  planet.buildings[BuildingType.DeuteriumSynthesizer] = 20
  return planet
}

describe('first enable lifecycle', () => {
  it('starts mature old saves directly in monitoring without injecting a blueprint', () => {
    const planet = maturePlanet()
    enablePlanetAutopilot(planet, context, Date.now())
    expect(planet.autopilot).toMatchObject({ enabled: true, mode: 'monitor', firstEnabledAt: Date.now(), lastDecision: 'autopilot.decisionMonitoring' })
    expect(planet.autopilot!.targets).toEqual([])
    expect(planet.autopilot!.downgradeReason).toBeUndefined()
  })
  it('keeps a new colony in auto and isolates the mature planet', () => {
    const old = maturePlanet()
    const colony = monitoringPlanet({ id: 'colony', autopilot: undefined })
    enablePlanetAutopilot(old, context, Date.now())
    enablePlanetAutopilot(colony, context, Date.now())
    expect(old.autopilot!.mode).toBe('monitor')
    expect(colony.autopilot!.mode).toBe('auto')
  })
  it('uses the next level, not the distant final target level', () => {
    const planet = monitoringPlanet()
    planet.autopilot!.targets = [createAutopilotTarget(BuildingType.MetalMine, 60, 0, Date.now())]
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
  })
  it('requires a strict majority of long goals', () => {
    const planet = maturePlanet()
    planet.autopilot!.targets = [
      createAutopilotTarget(BuildingType.MetalMine, 21, 0, Date.now()),
      createAutopilotTarget(BuildingType.SolarPlant, 1, 1, Date.now())
    ]
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
    planet.autopilot!.targets.push(createAutopilotTarget(BuildingType.CrystalMine, 21, 2, Date.now()))
    expect(shouldStartInMonitoring(planet, context)).toBe(true)
  })
  it('does not count completed goals in the majority', () => {
    const planet = maturePlanet()
    planet.autopilot!.targets = [
      createAutopilotTarget(BuildingType.MetalMine, 21, 0, Date.now()),
      createAutopilotTarget(BuildingType.CrystalMine, 20, 1, Date.now())
    ]
    expect(shouldStartInMonitoring(planet, context)).toBe(true)
  })
  it('keeps the exact work-time boundary eligible for auto', () => {
    const planet = maturePlanet()
    planet.autopilot!.targets = [createAutopilotTarget(BuildingType.MetalMine, 21, 0, Date.now())]
    planet.autopilot!.workHourThreshold = calculateBuildingTime(BuildingType.MetalMine, 21)
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
    planet.autopilot!.workHourThreshold--
    expect(shouldStartInMonitoring(planet, context)).toBe(true)
  })
  it('uses real factories, nanites, officers and the configured duration limit', () => {
    const planet = maturePlanet()
    planet.buildings[BuildingType.RoboticsFactory] = 50
    planet.buildings[BuildingType.NaniteFactory] = 50
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
    planet.buildings[BuildingType.RoboticsFactory] = 0
    planet.buildings[BuildingType.NaniteFactory] = 0
    expect(shouldStartInMonitoring(planet, { ...context, buildSpeedBonus: 99 })).toBe(false)
    planet.autopilot!.workHourThreshold = 10 ** 9
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
  })
  it('does not classify an already used M1 autopilot as a first enable', () => {
    const planet = maturePlanet()
    planet.autopilot!.lastPlannedAt = Date.now() - HOUR
    planet.autopilot!.mode = 'execute'
    enablePlanetAutopilot(planet, context, Date.now())
    expect(planet.autopilot!.mode).toBe('execute')
  })
  it('does not reclassify the mode when disabled and enabled again', () => {
    const planet = maturePlanet()
    enablePlanetAutopilot(planet, context, Date.now())
    const first = planet.autopilot!.firstEnabledAt
    expect(setAutopilotMode(planet.autopilot!, 'execute')).toBe(true)
    planet.autopilot!.enabled = false
    jump(HOUR)
    enablePlanetAutopilot(planet, context, Date.now())
    expect(planet.autopilot!.mode).toBe('execute')
    expect(planet.autopilot!.firstEnabledAt).toBe(first)
  })
  it('does not spontaneously resume construction after factory acceleration', () => {
    const planet = maturePlanet()
    enablePlanetAutopilot(planet, context, Date.now())
    planet.buildings[BuildingType.NaniteFactory] = 50
    const result = tickAutopilotPlanet(monitoringPlayer([planet]), planet, Date.now(), context)
    expect(result.enqueued).toBe(0)
    expect(planet.autopilot!.mode).toBe('monitor')
    expect(planet.autopilot!.canResumeAuto).toBe(false)
  })
  it('does not misclassify invalid or moon-incompatible goals', () => {
    const planet = monitoringPlanet({ isMoon: true })
    planet.autopilot!.targets = [createAutopilotTarget(BuildingType.MetalMine, NaN, 0, Date.now())]
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
    planet.buildings[BuildingType.MetalMine] = 20
    planet.autopilot!.targets[0]!.targetLevel = 21
    expect(shouldStartInMonitoring(planet, context)).toBe(false)
  })
  it('classifies without mutating the planet', () => {
    const planet = maturePlanet()
    const snapshot = JSON.stringify(planet)
    shouldStartInMonitoring(planet, context)
    expect(JSON.stringify(planet)).toBe(snapshot)
  })
  it('does not let applying a blueprint bypass first-enable classification', () => {
    const planet = maturePlanet()
    planet.autopilot!.workHourThreshold = 0
    expect(applyBlueprintAndEnablePlanet(planet, 'economy', context, Date.now())).toBe(true)
    expect(planet.autopilot).toMatchObject({ enabled: true, mode: 'monitor', firstEnabledAt: Date.now() })
  })
  it('does not treat a pre-enable UI decision as prior planning history', () => {
    const planet = maturePlanet()
    planet.autopilot!.lastDecision = 'autopilot.decisionBlueprintApplied'
    enablePlanetAutopilot(planet, context, Date.now())
    expect(planet.autopilot!.mode).toBe('monitor')
  })
})

describe('monitoring scheduling boundary', () => {
  it.each([false, true])('reconciles manually completed targets while monitoring, paused=%s', paused => {
    const planet = monitoringPlanet()
    planet.autopilot!.mode = 'monitor'
    planet.autopilot!.paused = paused
    const target = createAutopilotTarget(BuildingType.SolarPlant, 1, 0, Date.now())
    planet.autopilot!.targets = [target]
    planet.buildings[BuildingType.SolarPlant] = 1
    const player = monitoringPlayer([planet])
    const result = tickAutopilotPlanet(player, planet, Date.now(), context)
    expect(result.completedTargets).toEqual([target])
    expect(target.completed).toBe(true)
    expect(result.decision).toBe('autopilot.decisionMonitoring')
    expect(tickAutopilotPlanet(player, planet, Date.now(), context).completedTargets).toEqual([])
    planet.buildings[BuildingType.SolarPlant] = 0
    tickAutopilotPlanet(player, planet, Date.now(), context)
    expect(target.completed).toBe(false)
  })
  it('checks enabled before reconciling or withdrawing monitoring waiting jobs', () => {
    const planet = monitoringPlanet()
    planet.autopilot!.mode = 'monitor'
    planet.autopilot!.enabled = false
    const target = createAutopilotTarget(BuildingType.SolarPlant, 1, 0, Date.now())
    planet.autopilot!.targets = [target]
    planet.buildings[BuildingType.SolarPlant] = 1
    planet.waitingBuildQueue.push({ id: 'automatic', type: 'building', itemType: BuildingType.MetalMine,
      targetLevel: 1, source: 'autopilot', priority: 0, addedTime: Date.now() })
    const snapshot = JSON.stringify(planet.waitingBuildQueue)
    expect(tickAutopilotPlanet(monitoringPlayer([planet]), planet, Date.now(), context).decision).toBe('autopilot.decisionDisabled')
    expect(JSON.stringify(planet.waitingBuildQueue)).toBe(snapshot)
    expect(target.completed).toBeUndefined()
  })
  it('removes only autopilot waiting jobs, preserving manual and active construction', () => {
    const planet = maturePlanet()
    const automatic = { id: 'automatic', type: 'building' as const, itemType: BuildingType.SolarPlant, targetLevel: 1, priority: 0, addedTime: Date.now(), source: 'autopilot' as const }
    const manual = { ...automatic, id: 'manual', source: 'player' as const }
    const legacy = { ...manual, id: 'legacy', source: undefined }
    planet.waitingBuildQueue.push(automatic, manual, legacy)
    planet.buildQueue.push({ id: 'active', type: 'building', itemType: BuildingType.CrystalStorage, targetLevel: 1, startTime: Date.now(), endTime: Date.now() + HOUR })
    const active = JSON.stringify(planet.buildQueue)
    enablePlanetAutopilot(planet, context, Date.now())
    expect(planet.waitingBuildQueue.map(item => item.id)).toEqual(['manual', 'legacy'])
    expect(JSON.stringify(planet.buildQueue)).toBe(active)
  })
  it('prevents persisted automatic waiting jobs from executing before the planning tick', () => {
    const planet = monitoringPlanet()
    planet.autopilot!.mode = 'monitor'
    planet.resources.metal = 1000
    planet.resources.crystal = 1000
    planet.waitingBuildQueue.push({ id: 'automatic', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 1, source: 'autopilot', priority: 0, addedTime: Date.now() })
    const player = monitoringPlayer([planet])
    expect(processPlanetWaitingQueue(planet, player, player.officers).executed).toEqual([])
    expect(planet.buildQueue).toEqual([])
    expect(tickAutopilotPlanet(monitoringPlayer([planet]), planet, Date.now(), context).enqueued).toBe(0)
    expect(planet.waitingBuildQueue).toEqual([])
  })
  it('continues alerts while no automatic jobs are scheduled', () => {
    const planet = maturePlanet()
    enablePlanetAutopilot(planet, context, Date.now())
    const player = monitoringPlayer([planet])
    expect(tickAutopilotPlanet(player, planet, Date.now(), context).decision).toBe('autopilot.decisionMonitoring')
    expect(collectAutopilotAlerts(player, createDefaultForecastContext()).some(alert => alert.type === 'power')).toBe(true)
    expect(planet.waitingBuildQueue).toEqual([])
  })
  it.each(['player', undefined] as const)('continues manual and legacy waiting jobs (%s)', source => {
    const planet = monitoringPlanet()
    planet.autopilot!.mode = 'monitor'
    planet.resources.metal = 1000
    planet.resources.crystal = 1000
    planet.waitingBuildQueue.push({ id: 'manual', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 1, source, priority: 0, addedTime: Date.now() })
    const player = monitoringPlayer([planet])
    expect(processPlanetWaitingQueue(planet, player, player.officers).executed.map(item => item.id)).toEqual(['manual'])
    expect(planet.buildQueue).toHaveLength(1)
  })
  it('allows construction only after the player explicitly selects execute mode', () => {
    const planet = monitoringPlanet()
    planet.autopilot!.mode = 'monitor'
    planet.autopilot!.targets = [createAutopilotTarget(BuildingType.SolarPlant, 1, 0, Date.now())]
    planet.resources.metal = 1000
    planet.resources.crystal = 1000
    planet.buildings[BuildingType.RoboticsFactory] = 2
    const player = monitoringPlayer([planet])
    expect(tickAutopilotPlanet(player, planet, Date.now(), context).enqueued).toBe(0)
    expect(setAutopilotMode(planet.autopilot!, 'execute')).toBe(true)
    expect(tickAutopilotPlanet(player, planet, Date.now(), context).enqueued).toBeGreaterThan(0)
  })
})

describe('monitoring empire research boundary', () => {
  const researchSetup = () => {
    const planet = monitoringPlanet()
    planet.autopilot!.mode = 'monitor'
    planet.buildings[BuildingType.ResearchLab] = 1
    planet.resources.metal = 100000
    planet.resources.crystal = 100000
    planet.resources.deuterium = 100000
    const player = monitoringPlayer([planet])
    player.technologies[TechnologyType.EnergyTechnology] = 1
    player.empireResearchAutopilot = { ...createDefaultEmpireResearchAutopilot(), enabled: true,
      targets: [createAutopilotResearchTarget(TechnologyType.CombustionDrive, 1, 0, Date.now())] }
    return { planet, player }
  }
  it('does not enqueue empire research until the laboratory switches to execute', () => {
    const { planet, player } = researchSetup()
    expect(tickEmpireResearch(player, Date.now(), context).decision).toBe('autopilot.decisionMonitoring')
    expect(player.waitingResearchQueue).toEqual([])
    expect(setAutopilotMode(planet.autopilot!, 'execute')).toBe(true)
    expect(tickEmpireResearch(player, Date.now(), context).enqueued).toBeGreaterThan(0)
  })
  it('reconciles manually completed empire research while monitoring', () => {
    const { player } = researchSetup()
    player.technologies[TechnologyType.CombustionDrive] = 1
    const result = tickEmpireResearch(player, Date.now(), context)
    expect(result.completedTargets).toHaveLength(1)
    expect(player.empireResearchAutopilot!.targets[0]?.completed).toBe(true)
  })
  it('blocks persisted automatic research promotion before tick and withdraws only automatic waiting jobs', () => {
    const { planet, player } = researchSetup()
    const automatic = { id: 'automatic', type: 'technology' as const, itemType: TechnologyType.CombustionDrive,
      targetLevel: 1, source: 'autopilot' as const, priority: 0, addedTime: Date.now() }
    player.waitingResearchQueue.push(automatic)
    expect(processResearchWaitingQueue(player, planet, player.officers).executed).toEqual([])
    expect(player.researchQueue).toEqual([])
    player.waitingResearchQueue.push({ ...automatic, id: 'manual', source: 'player' }, { ...automatic, id: 'legacy', source: undefined })
    tickEmpireResearch(player, Date.now(), context)
    expect(player.waitingResearchQueue.map(item => item.id)).toEqual(['manual', 'legacy'])
  })
  it.each(['player', undefined] as const)('keeps manual and legacy research promotion (%s)', source => {
    const { planet, player } = researchSetup()
    player.waitingResearchQueue.push({ id: 'manual', type: 'technology', itemType: TechnologyType.CombustionDrive,
      targetLevel: 1, source, priority: 0, addedTime: Date.now() })
    expect(processResearchWaitingQueue(player, planet, player.officers).executed.map(item => item.id)).toEqual(['manual'])
    expect(player.researchQueue).toHaveLength(1)
  })
  it('preserves active research when the laboratory enters monitoring', () => {
    const { player } = researchSetup()
    player.researchQueue.push({ id: 'active', type: 'technology', itemType: TechnologyType.CombustionDrive,
      targetLevel: 1, startTime: Date.now(), endTime: Date.now() + HOUR })
    const snapshot = JSON.stringify(player.researchQueue)
    tickEmpireResearch(player, Date.now(), context)
    expect(JSON.stringify(player.researchQueue)).toBe(snapshot)
  })
})
