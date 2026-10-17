import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BuildingType } from '@/types/game'
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
      expect(predictOreDepletion(planet).find(alert => alert.resource === resource)?.hoursLeft).toBe(0)
      expect(calculateDepositEfficiency(planet.oreDeposits, resource)).toBe(0.2)
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
  it('forecasts buffer drain under a deficit', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.MetalMine] = 1
    planet.resources.energy = 11 * 6
    expect(predictPowerShortage(planet)[0]?.hoursLeft).toBeCloseTo(6)
    planet.resources.energy = 0
    expect(predictPowerShortage(planet)[0]?.severity).toBe('critical')
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
    expect(predictPowerShortage(planet)[0]?.hoursLeft).toBeCloseTo(1 / 11)
  })
  it('uses pessimistic energy when an officer bonus can expire', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.SolarPlant] = 1
    planet.buildings[BuildingType.MetalMine] = 4
    planet.resources.energy = 1
    const context = { ...createDefaultForecastContext(), energyProductionBonus: 100 }
    expect(predictPowerShortage(planet, 6, context)).toEqual([])
    expect(predictPowerShortage(planet, 6, { ...context, energyBonusExpiresAt: Date.now() + HOUR })).toHaveLength(1)
  })
  it('scales resource and power rates with game speed, including pause', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.MetalMine] = 1
    const context = createDefaultForecastContext()
    const normal = predictPowerShortage(planet, 24, context)[0]!.hoursLeft
    expect(predictPowerShortage(planet, 24, { ...context, gameSpeed: 2 })[0]!.hoursLeft).toBe(normal / 2)
    expect(predictPowerShortage(planet, 24, { ...context, gameSpeed: 0 })).toEqual([])
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
    planet.buildings[BuildingType.MetalMine] = 1
    planet.resources.energy = 60
    const alerts = predictPowerShortage(planet)
    const first = selectNewAlerts(alerts, new Map())
    expect(first.fresh).toHaveLength(1)
    jump(HOUR)
    expect(selectNewAlerts(alerts, first.state).fresh).toEqual([])
    planet.resources.energy = 0
    expect(selectNewAlerts(predictPowerShortage(planet), first.state).fresh).toHaveLength(1)
    const cleared = selectNewAlerts([], first.state)
    expect(selectNewAlerts(alerts, cleared.state).fresh).toHaveLength(1)
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
    planet.buildings[BuildingType.MetalMine] = 1
    planet.resources.energy = 11 * 2
    const warned = selectNewAlerts(predictPowerShortage(planet), new Map())
    planet.resources.energy = 11 * 4
    const improved = selectNewAlerts(predictPowerShortage(planet), warned.state)
    expect(improved.fresh).toEqual([])
    planet.resources.energy = 11 * 2
    expect(selectNewAlerts(predictPowerShortage(planet), improved.state).fresh).toEqual([])
  })
})
