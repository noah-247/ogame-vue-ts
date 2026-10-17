import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BuildingType, OfficerType } from '@/types/game'
import { createActiveOfficer } from '@/logic/officerLogic'
import { calculateInitialDeposits, calculateDepositEfficiency } from '@/logic/oreDepositLogic'
import { calculateResourceCapacity } from '@/logic/resourceLogic'
import {
  collectAutopilotAlerts, createDefaultForecastContext, createForecastContext, forecastProduction,
  getAlertSettings, predictOreDepletion, predictPowerShortage, predictWarehouseFull, selectNewAlerts,
  TRANSPORT_RESOURCES
} from '@/logic/autopilotAlerts'
import { monitoringPlanet, monitoringPlayer } from '../utils/autopilot'
import { HOUR, jump, restore, setNow } from '../utils/time'

beforeEach(() => setNow(1_700_000_000_000))
afterEach(restore)

describe('ore decay forecasts', () => {
  for (const resource of TRANSPORT_RESOURCES) {
    it.each([0, 12, 24])(`${resource}: includes boundary %s hours`, hours => {
      const planet = monitoringPlanet()
      const initial = calculateInitialDeposits(planet.position)
      planet.oreDeposits = { ...initial, position: planet.position }
      planet.oreDeposits[resource] = initial[resource] * 0.05 + hours * 100
      const context = { ...createDefaultForecastContext(), oreConsumption: { [resource]: 100 } }
      const alert = predictOreDepletion(planet, 24, context).find(alert => alert.resource === resource)
      expect(alert?.hoursLeft).toBe(hours)
      expect(alert?.severity).toBe(hours === 0 ? 'critical' : hours === 12 ? 'warn' : 'info')
    })
    it(`${resource}: suppresses beyond threshold and nonpositive consumption`, () => {
      const planet = monitoringPlanet()
      const initial = calculateInitialDeposits(planet.position)
      planet.oreDeposits = { ...initial, position: planet.position }
      planet.oreDeposits[resource] = initial[resource] * 0.05 + 2500
      for (const rate of [100, 0, -100]) {
        expect(predictOreDepletion(planet, 24, { ...createDefaultForecastContext(), oreConsumption: { [resource]: rate } })).toEqual([])
      }
    })
    it(`${resource}: already depleted keeps 20 percent production`, () => {
      const planet = monitoringPlanet()
      planet.oreDeposits = { ...calculateInitialDeposits(planet.position), [resource]: 0, position: planet.position }
      expect(predictOreDepletion(planet, 24, { ...createDefaultForecastContext(), oreConsumption: { [resource]: 100 } })
        .find(alert => alert.resource === resource)?.hoursLeft).toBe(0)
      expect(calculateDepositEfficiency(planet.oreDeposits, resource)).toBe(0.2)
    })
    it.each([0, -100])(`${resource}: suppresses depleted deposits while consumption is %s`, consumed => {
      const planet = monitoringPlanet()
      planet.oreDeposits = { ...calculateInitialDeposits(planet.position), [resource]: 0, position: planet.position }
      expect(predictOreDepletion(planet, 24, { ...createDefaultForecastContext(), oreConsumption: { [resource]: consumed } })).toEqual([])
    })
  }
  it('ignores moons and legacy missing deposits', () => {
    expect(predictOreDepletion(monitoringPlanet())).toEqual([])
    expect(predictOreDepletion(monitoringPlanet({ isMoon: true, oreDeposits: { metal: 0, crystal: 0, deuterium: 0, position: { galaxy: 1, system: 1, position: 8 } } }))).toEqual([])
  })
  it('subtracts regeneration rather than predicting a false depletion', () => {
    const planet = monitoringPlanet()
    planet.oreDeposits = { ...calculateInitialDeposits(planet.position), position: planet.position }
    expect(predictOreDepletion(planet, 720, { ...createDefaultForecastContext(), netProduction: { metal: 1 } })).toEqual([])
  })
})

describe('warehouse forecasts', () => {
  for (const resource of TRANSPORT_RESOURCES) {
    it.each([0, 3, 6])(`${resource}: includes boundary %s hours`, hours => {
      const planet = monitoringPlanet()
      const capacity = calculateResourceCapacity(planet, 0)
      planet.resources[resource] = capacity[resource] - hours * 100
      const context = { ...createDefaultForecastContext(), netProduction: { [resource]: 100 } }
      expect(predictWarehouseFull(planet, 6, context).find(alert => alert.resource === resource)?.hoursLeft).toBe(hours)
    })
    it(`${resource}: suppresses zero and negative net output`, () => {
      for (const rate of [0, -100]) {
        expect(predictWarehouseFull(monitoringPlanet(), 6, { ...createDefaultForecastContext(), netProduction: { [resource]: rate } })).toEqual([])
      }
    })
    it(`${resource}: full storage remains critical with negative output`, () => {
      const planet = monitoringPlanet()
      planet.resources[resource] = calculateResourceCapacity(planet, 0)[resource] + 100
      expect(predictWarehouseFull(planet, 0, { ...createDefaultForecastContext(), netProduction: { [resource]: -100 } })[0]?.severity).toBe('critical')
    })
  }
  it('honors storage bonus and custom warning thresholds', () => {
    const planet = monitoringPlanet()
    planet.resources.metal = calculateResourceCapacity(planet, 0).metal - 700
    const context = { ...createDefaultForecastContext(), netProduction: { metal: 100 } }
    expect(predictWarehouseFull(planet, 6, context)).toEqual([])
    expect(predictWarehouseFull(planet, 7, context)).toHaveLength(1)
    expect(predictWarehouseFull(planet, 7, { ...context, storageCapacityBonus: 100 })).toEqual([])
  })
})

describe('power and monitoring integration', () => {
  it.each([0, 66, 1_000_000])('reports an immediate outage regardless of energy buffer %s', energy => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.MetalMine] = 1
    planet.resources.energy = energy
    expect(predictPowerShortage(planet)[0]).toMatchObject({ hoursLeft: 0, severity: 'critical' })
  })
  it('does not warn with zero consumption or surplus', () => {
    const planet = monitoringPlanet()
    expect(predictPowerShortage(planet)).toEqual([])
    planet.buildings[BuildingType.SolarPlant] = 1
    expect(predictPowerShortage(planet)).toEqual([])
  })
  it('uses B1 waiting consumers without crediting pending producers', () => {
    const planet = monitoringPlanet()
    planet.resources.energy = 1
    planet.waitingBuildQueue.push(
      { id: 'consumer', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 1, priority: 0, addedTime: Date.now() },
      { id: 'producer', type: 'building', itemType: BuildingType.SolarPlant, targetLevel: 1, priority: 1, addedTime: Date.now() }
    )
    expect(predictPowerShortage(planet)[0]).toMatchObject({ hoursLeft: 0, severity: 'warn' })
  })
  it('uses pessimistic energy when an officer bonus can expire', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.SolarPlant] = 1
    planet.buildings[BuildingType.MetalMine] = 4
    planet.resources.energy = 1
    const context = { ...createDefaultForecastContext(), energyProductionBonus: 100 }
    expect(predictPowerShortage(planet, 6, context)).toEqual([])
    expect(predictPowerShortage(planet, 6, { ...context, energyBonusExpiresAt: Date.now() + HOUR })[0]?.hoursLeft).toBe(1)
    expect(predictPowerShortage(planet, 6, { ...context, energyBonusExpiresAt: Date.now() + 30 * 24 * HOUR })).toEqual([])
  })
  it('scales resource production but never delays an existing outage, including pause', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.MetalMine] = 1
    const context = createDefaultForecastContext()
    expect(predictPowerShortage(planet, 24, { ...context, gameSpeed: 2 })[0]!.hoursLeft).toBe(0)
    expect(predictPowerShortage(planet, 24, { ...context, gameSpeed: 0 })[0]!.severity).toBe('critical')
    expect(forecastProduction(planet, { ...context, gameSpeed: 0 }).metal).toBe(0)
  })
  it('defaults legacy settings and rejects invalid thresholds', () => {
    const planet = monitoringPlanet()
    expect(getAlertSettings(planet)).toEqual({ oreHours: 24, warehouseHours: 6, powerHours: 6 })
    planet.autopilot!.alerts = { oreHours: NaN, warehouseHours: -1, powerHours: 0 }
    expect(getAlertSettings(planet)).toEqual({ oreHours: 24, warehouseHours: 6, powerHours: 0 })
    expect(predictPowerShortage(planet, -1)).toEqual([])
  })
  it('monitors enabled planets even when automatic construction is paused', () => {
    const planet = monitoringPlanet()
    planet.autopilot!.paused = true
    planet.resources.metal = calculateResourceCapacity(planet, 0).metal
    const player = monitoringPlayer([planet])
    expect(collectAutopilotAlerts(player, createForecastContext(player, 1, Date.now()))).toHaveLength(1)
    planet.autopilot!.enabled = false
    expect(collectAutopilotAlerts(player, createForecastContext(player, 1, Date.now()))).toEqual([])
  })
  it('only notifies new and escalated alerts and rearms after resolution', () => {
    const planet = monitoringPlanet()
    planet.resources.metal = 9700
    const context = { ...createDefaultForecastContext(), netProduction: { metal: 100 } }
    const alerts = predictWarehouseFull(planet, 6, context)
    const first = selectNewAlerts(alerts, new Map())
    expect(first.fresh).toHaveLength(1)
    jump(HOUR / 4)
    expect(selectNewAlerts(alerts, first.state).fresh).toEqual([])
    planet.resources.metal = 10000
    expect(selectNewAlerts(predictWarehouseFull(planet, 6, context), first.state).fresh).toHaveLength(1)
    const cleared = selectNewAlerts([], first.state)
    expect(selectNewAlerts(alerts, cleared.state).fresh).toEqual([])
    jump(HOUR)
    const resolved = selectNewAlerts([], cleared.state)
    expect(selectNewAlerts(alerts, resolved.state).fresh).toHaveLength(1)
  })
  it('prediction calls never mutate the planet', () => {
    const planet = monitoringPlanet()
    const snapshot = JSON.stringify(planet)
    predictOreDepletion(planet)
    predictWarehouseFull(planet)
    predictPowerShortage(planet)
    expect(JSON.stringify(planet)).toBe(snapshot)
  })
  it('does not spam when an active alert oscillates across a severity boundary', () => {
    const planet = monitoringPlanet()
    planet.resources.metal = 9800
    const context = { ...createDefaultForecastContext(), netProduction: { metal: 100 } }
    const warned = selectNewAlerts(predictWarehouseFull(planet, 6, context), new Map())
    planet.resources.metal = 9600
    const improved = selectNewAlerts(predictWarehouseFull(planet, 6, context), warned.state)
    expect(improved.fresh).toEqual([])
    planet.resources.metal = 9800
    expect(selectNewAlerts(predictWarehouseFull(planet, 6, context), improved.state).fresh).toEqual([])
  })
  it('requires a continuous cooldown after resolution even for a long-running alert', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.MetalMine] = 1
    const alerts = predictPowerShortage(planet)
    let selection = selectNewAlerts(alerts, new Map(), Date.now())
    jump(24 * HOUR)
    selection = selectNewAlerts(alerts, selection.state, Date.now())
    expect(selection.fresh).toEqual([])
    jump(1000)
    const brieflyCleared = selectNewAlerts([], selection.state, Date.now())
    jump(1000)
    const reappeared = selectNewAlerts(alerts, brieflyCleared.state, Date.now())
    expect(reappeared.fresh).toEqual([])
    jump(HOUR / 2 - 1)
    const notYetRearmed = selectNewAlerts([], reappeared.state, Date.now())
    expect(notYetRearmed.state.size).toBe(1)
    jump(1)
    const rearmed = selectNewAlerts([], notYetRearmed.state, Date.now())
    expect(rearmed.state.size).toBe(0)
    expect(selectNewAlerts(alerts, rearmed.state, Date.now()).fresh).toHaveLength(1)
  })
})

describe('timestamp-based power forecasts', () => {
  const queued = (itemType: BuildingType, targetLevel: number, hours: number, type: 'building' | 'demolish' = 'building') => ({
    id: `${itemType}-${targetLevel}`, type, itemType, targetLevel, startTime: Date.now(), endTime: Date.now() + hours * HOUR
  })

  it.each([0, 1, 10])('uses the first harmful completion timestamp at speed %s', gameSpeed => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.SolarPlant] = 1
    planet.buildings[BuildingType.MetalMine] = 2
    planet.buildQueue.push(queued(BuildingType.MetalMine, 4, 4), queued(BuildingType.MetalMine, 3, 2))
    expect(predictPowerShortage(planet, 6, { ...createDefaultForecastContext(), gameSpeed })[0]?.hoursLeft).toBe(4)
  })
  it('does not credit pending energy producers', () => {
    const planet = monitoringPlanet()
    planet.buildQueue.push(queued(BuildingType.SolarPlant, 10, 1), queued(BuildingType.MetalMine, 1, 2))
    expect(predictPowerShortage(planet)[0]?.hoursLeft).toBe(2)
  })
  it('forecasts demolition of an energy producer', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.SolarPlant] = 1
    planet.buildings[BuildingType.MetalMine] = 1
    planet.buildQueue.push(queued(BuildingType.SolarPlant, 0, 3, 'demolish'))
    expect(predictPowerShortage(planet)[0]?.hoursLeft).toBe(3)
  })
  it('estimates waiting consumers from the earliest free building slot', () => {
    const planet = monitoringPlanet()
    planet.buildQueue.push(queued(BuildingType.MetalStorage, 1, 3), queued(BuildingType.SolarPlant, 1, 2))
    planet.waitingBuildQueue.push({ id: 'waiting', type: 'building', itemType: BuildingType.MetalMine, targetLevel: 1, priority: 0, addedTime: Date.now() })
    expect(predictPowerShortage(planet)[0]).toMatchObject({ hoursLeft: 2, severity: 'warn' })
  })
  it('combines officer expiry with a later consuming completion', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.SolarPlant] = 1
    planet.buildings[BuildingType.MetalMine] = 2
    planet.buildQueue.push(queued(BuildingType.MetalMine, 3, 1), queued(BuildingType.MetalMine, 4, 4))
    const context = { ...createDefaultForecastContext(), energyProductionBonus: 100, energyBonusExpiresAt: Date.now() + 2 * HOUR }
    expect(predictPowerShortage(planet, 6, context)[0]?.hoursLeft).toBe(4)
  })
  it('uses the supplied game clock rather than wall clock', () => {
    const planet = monitoringPlanet()
    planet.buildQueue.push(queued(BuildingType.MetalMine, 1, 5))
    expect(predictPowerShortage(planet, 6, { ...createDefaultForecastContext(), now: Date.now() + 3 * HOUR })[0]?.hoursLeft).toBe(2)
  })
})

describe('warehouse officer expiry', () => {
  it.each([0, 100])('reports capacity shrink at expiry with production %s', rate => {
    const planet = monitoringPlanet()
    planet.resources.metal = 10500
    const context = { ...createDefaultForecastContext(), storageCapacityBonus: 10,
      storageBonusExpiresAt: Date.now() + HOUR, netProduction: { metal: rate } }
    expect(predictWarehouseFull(planet, 6, context)[0]?.hoursLeft).toBe(1)
  })
  it('reports filling the smaller capacity after expiry', () => {
    const planet = monitoringPlanet()
    planet.resources.metal = 9700
    const context = { ...createDefaultForecastContext(), storageCapacityBonus: 10,
      storageBonusExpiresAt: Date.now() + HOUR, netProduction: { metal: 100 } }
    expect(predictWarehouseFull(planet, 6, context)[0]?.hoursLeft).toBe(3)
  })
  it('keeps an earlier full time and ignores expiry beyond the warning window', () => {
    const planet = monitoringPlanet()
    planet.resources.metal = 10900
    const context = { ...createDefaultForecastContext(), storageCapacityBonus: 10,
      storageBonusExpiresAt: Date.now() + 24 * HOUR, netProduction: { metal: 100 } }
    expect(predictWarehouseFull(planet, 6, context)[0]?.hoursLeft).toBe(1)
    expect(predictWarehouseFull(planet, 6, { ...context, netProduction: { metal: 0 } })).toEqual([])
  })
  it('collects only active expiring storage bonuses', () => {
    const planet = monitoringPlanet()
    const player = monitoringPlayer([planet])
    player.officers[OfficerType.Commander] = createActiveOfficer(OfficerType.Commander, 2)
    player.officers[OfficerType.Geologist] = createActiveOfficer(OfficerType.Geologist, 1)
    player.officers[OfficerType.Engineer] = createActiveOfficer(OfficerType.Engineer, 0.5)
    expect(createForecastContext(player, 1, Date.now()).storageBonusExpiresAt).toBe(Date.now() + 24 * HOUR)
    player.officers[OfficerType.Geologist].active = false
    expect(createForecastContext(player, 1, Date.now()).storageBonusExpiresAt).toBe(Date.now() + 48 * HOUR)
    player.officers[OfficerType.Commander].expiresAt = undefined
    expect(createForecastContext(player, 1, Date.now()).storageBonusExpiresAt).toBeUndefined()
  })
})
