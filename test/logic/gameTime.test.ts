import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuildQueueItem } from '@/types/game'
import { BuildingType, DefenseType, MissionType, OfficerType, ShipType, TechnologyType } from '@/types/game'
import { getGameNow, getTimeOffset, setTimeOffset } from '@/logic/gameTime'
import { initializePlayer, processGameUpdate } from '@/logic/gameLogic'
import * as buildingLogic from '@/logic/buildingLogic'
import * as buildingValidation from '@/logic/buildingValidation'
import * as researchLogic from '@/logic/researchLogic'
import * as shipLogic from '@/logic/shipLogic'
import * as fleetLogic from '@/logic/fleetLogic'
import * as missileLogic from '@/logic/missileLogic'
import * as planetLogic from '@/logic/planetLogic'
import * as moonLogic from '@/logic/moonLogic'
import * as officerLogic from '@/logic/officerLogic'
import * as resourceLogic from '@/logic/resourceLogic'
import { createAutopilotTarget, createDefaultContext, createDefaultPlanetAutopilot, tickAutopilotPlanet } from '@/logic/autopilotLogic'
import { createDefaultContract } from '@/logic/autopilotBilling'
import { HOUR, jump, restore, setNow } from '../utils/time'

const NOW = 1_700_000_000_000

vi.mock('@/stores/gameStore', () => ({ useGameStore: vi.fn() }))

afterEach(() => {
  setTimeOffset(0)
  restore()
  vi.restoreAllMocks()
})

const makeGame = () => {
  const player = initializePlayer('clock-player')
  const planet = planetLogic.createInitialPlanet(player.id)
  planet.buildings[BuildingType.SolarPlant] = 8
  planet.buildings[BuildingType.MetalMine] = 1
  planet.buildings[BuildingType.MetalStorage] = 10
  planet.buildings[BuildingType.CrystalStorage] = 10
  planet.buildings[BuildingType.DeuteriumTank] = 10
  player.planets.push(planet)
  // v3 計費：副官工作需要 active 合約；既有行為測試預設掛一張有效合約
  player.autopilotContract = { ...createDefaultContract(planet.id, [planet.id]), status: 'active' as const }
  return { player, planet }
}

describe('P0-3 virtual clock across all task producers', () => {
  const queueFactories: Array<[string, () => BuildQueueItem]> = [
    ['building', () => buildingLogic.createBuildQueueItem(BuildingType.MetalMine, 2, 3600)],
    ['research', () => researchLogic.createResearchQueueItem(TechnologyType.EnergyTechnology, 1, 3600)],
    ['ship', () => shipLogic.createShipQueueItem(ShipType.LightFighter, 1, 3600)],
    ['defense', () => shipLogic.createDefenseQueueItem(DefenseType.RocketLauncher, 1, 3600)],
    ['demolish', () => buildingLogic.createDemolishQueueItem(BuildingType.MetalStorage, 10, 3600)],
    ['scrap', () => shipLogic.createShipScrapQueueItem(ShipType.LightFighter, 1, 3600)]
  ]

  it.each(queueFactories)('%s started after a real time skip stays pending after one second', (_name, createItem) => {
    setNow(NOW)
    const { player, planet } = makeGame()
    setTimeOffset(8 * HOUR)
    processGameUpdate(player, getGameNow())
    const item = createItem()
    expect(item.startTime).toBe(getGameNow())
    expect(item.endTime).toBe(getGameNow() + HOUR)
    if (item.type === 'technology') player.researchQueue.push(item)
    else planet.buildQueue.push(item)

    jump(1000)
    processGameUpdate(player, getGameNow())

    const queue = item.type === 'technology' ? player.researchQueue : planet.buildQueue
    expect(queue).toContain(item)
    expect(item.endTime - getGameNow()).toBe(HOUR - 1000)
    jump(HOUR - 1000)
    processGameUpdate(player, getGameNow())
    expect(item.type === 'technology' ? player.researchQueue : planet.buildQueue).not.toContain(item)
  })

  it('resumes the normal per-second resource rate immediately after successive time skips', () => {
    setNow(NOW)
    const { player, planet } = makeGame()
    for (const hours of [8, 1]) {
      setTimeOffset(getTimeOffset() + hours * HOUR)
      processGameUpdate(player, getGameNow())
      const metalBefore = planet.resources.metal
      const expectedRate = resourceLogic.calculateResourceProduction(planet, {
        resourceProductionBonus: 0, darkMatterProductionBonus: 0, energyProductionBonus: 0
      }).metal / 3600

      jump(1000)
      processGameUpdate(player, getGameNow())

      expect(planet.lastUpdate).toBe(getGameNow())
      expect(planet.resources.metal - metalBefore).toBeCloseTo(expectedRate, 6)
    }
  })

  it('creates and recalls fleets and launches missiles on the same virtual timeline', () => {
    setNow(NOW)
    setTimeOffset(8 * HOUR)
    const { player, planet } = makeGame()
    const target = { galaxy: 1, system: 1, position: 2 }
    const mission = fleetLogic.createFleetMission(player.id, planet.id, target, MissionType.Transport,
      { [ShipType.SmallCargo]: 1 }, { ...planet.resources }, 60)
    const missile = missileLogic.createMissileAttack(player.id, planet, target, undefined, 1)

    expect(mission.departureTime).toBe(getGameNow())
    expect(mission.arrivalTime).toBe(getGameNow() + 60000)
    expect(mission.returnTime).toBe(getGameNow() + 120000)
    expect(missile.arrivalTime).toBeGreaterThan(getGameNow() + 1000)
    jump(1000)
    expect(fleetLogic.recallFleetMission(mission, getGameNow())).toBe(true)
    expect(mission.returnTime).toBe(getGameNow() + 1000)
  })

  it('initializes every new planet and moon at virtual now, including colonization', () => {
    setNow(NOW)
    setTimeOffset(8 * HOUR)
    const { player, planet } = makeGame()
    expect(planet.lastUpdate).toBe(getGameNow())
    expect(planetLogic.createNPCPlanet(1, planet.position).lastUpdate).toBe(getGameNow())
    expect(planetLogic.createMoon(planet, planet.position, player.id).lastUpdate).toBe(getGameNow())
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(moonLogic.tryGenerateMoon({ metal: 2_000_000, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
      planet.position, planet.id, player.id)?.lastUpdate).toBe(getGameNow())
    const mission = fleetLogic.createFleetMission(player.id, planet.id, { ...planet.position, position: 2 },
      MissionType.Colonize, { [ShipType.ColonyShip]: 1 }, { ...planet.resources }, 60)
    player.technologies[TechnologyType.Astrophysics] = 1
    expect(fleetLogic.processColonizeArrival(mission, undefined, player).planet?.lastUpdate).toBe(getGameNow())
  })

  it('hiring, expiry, renewal and bonus checks use virtual time after a skip', () => {
    setNow(NOW)
    setTimeOffset(8 * HOUR)
    const { player } = makeGame()
    const officer = officerLogic.createActiveOfficer(OfficerType.Engineer, 1)
    player.officers[OfficerType.Engineer] = officer
    expect(officer.hiredAt).toBe(getGameNow())
    expect(officer.expiresAt).toBe(getGameNow() + 24 * HOUR)
    expect(officerLogic.calculateActiveBonuses(player.officers, getGameNow()).energyProductionBonus).toBe(10)
    setTimeOffset(getTimeOffset() + 25 * HOUR)
    expect(officerLogic.calculateActiveBonuses(player.officers, getGameNow()).energyProductionBonus).toBe(0)
    player.officers[OfficerType.Engineer] = officerLogic.renewOfficerExpiration(officer, 1, getGameNow())
    expect(player.officers[OfficerType.Engineer].expiresAt).toBe(getGameNow() + 24 * HOUR)
    expect(officerLogic.calculateActiveBonuses(player.officers, getGameNow()).energyProductionBonus).toBe(10)
  })
})

describe('autopilot and processGameUpdate multi-tick integration', () => {
  it('stays powered through 600 ticks, a time skip and a manual upgrade of an autopilot waiting building', () => {
    setNow(NOW)
    const { player, planet } = makeGame()
    planet.buildings[BuildingType.SolarPlant] = 7
    planet.buildings[BuildingType.MetalMine] = 8
    planet.buildings[BuildingType.CrystalMine] = 8
    planet.buildings[BuildingType.DeuteriumSynthesizer] = 5
    planet.buildings[BuildingType.RoboticsFactory] = 2
    planet.resources = { metal: 1_000_000, crystal: 1_000_000, deuterium: 1_000_000, darkMatter: 0, energy: 0 }
    const config = createDefaultPlanetAutopilot()
    config.enabled = true
    config.targets = [createAutopilotTarget(BuildingType.MetalMine, 12, 0, getGameNow()),
      createAutopilotTarget(BuildingType.CrystalMine, 11, 1, getGameNow())]
    planet.autopilot = config
    const context = createDefaultContext()
    tickAutopilotPlanet(player, planet, getGameNow(), context)
    expect(planet.waitingBuildQueue.some(item => item.itemType === BuildingType.MetalMine)).toBe(true)
    const manualUpgrade = buildingValidation.executeBuildingUpgrade(planet, BuildingType.MetalMine, player.officers)
    planet.buildQueue.push(manualUpgrade)
    let rescueQueued = false
    let subsequentMineQueued = false

    for (let tick = 0; tick < 600; tick++) {
      if (tick === 30) setTimeOffset(getTimeOffset() + 8 * HOUR)
      jump(1000)
      processGameUpdate(player, getGameNow())
      expect(resourceLogic.calculateEnergyProduction(planet, { energyProductionBonus: 0 }))
        .toBeGreaterThanOrEqual(resourceLogic.calculateEnergyConsumption(planet))
      tickAutopilotPlanet(player, planet, getGameNow(), context)
      expect(resourceLogic.calculateEnergyProduction(planet, { energyProductionBonus: 0 }))
        .toBeGreaterThanOrEqual(resourceLogic.calculateEnergyConsumption(planet))
      rescueQueued ||= planet.waitingBuildQueue.some(item => item.itemType === BuildingType.SolarPlant)
      subsequentMineQueued ||= planet.waitingBuildQueue.some(item => item.itemType === BuildingType.MetalMine && (item.targetLevel || 0) >= 10)
    }

    expect(planet.buildings[BuildingType.MetalMine]).toBeGreaterThanOrEqual(10)
    expect(planet.waitingBuildQueue.some(item => item.itemType === BuildingType.MetalMine && (item.targetLevel || 0) <= 9)).toBe(false)
    expect(rescueQueued).toBe(true)
    expect(subsequentMineQueued).toBe(true)
  })
})
