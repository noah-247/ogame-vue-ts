import { BuildingType, TechnologyType } from '@/types/game'
import type { AutopilotAlertSettings, Planet, Player, Resources } from '@/types/game'
import { ORE_DEPOSIT_CONFIG } from '@/config/gameConfig'
import { checkEnergySafeWorstOrder, createDefaultContext } from './autopilotLogic'
import type { AutopilotContext } from './autopilotLogic'
import * as resourceLogic from './resourceLogic'
import * as oreLogic from './oreDepositLogic'
import * as officerLogic from './officerLogic'

export const TRANSPORT_RESOURCES = ['metal', 'crystal', 'deuterium'] as const
export type TransportResource = (typeof TRANSPORT_RESOURCES)[number]
export interface AutopilotAlert {
  type: 'ore' | 'warehouse' | 'power'
  planetId: string
  resource?: TransportResource
  hoursLeft: number
  severity: 'info' | 'warn' | 'critical'
}

export interface ForecastContext extends AutopilotContext {
  gameSpeed: number
  resourceProductionBonus: number
  darkMatterProductionBonus: number
  technologies: Partial<Record<TechnologyType, number>>
  netProduction?: Partial<Resources>
  oreConsumption?: Partial<Record<TransportResource, number>>
}

export const createDefaultForecastContext = (): ForecastContext => ({
  ...createDefaultContext(), gameSpeed: 1, resourceProductionBonus: 0,
  darkMatterProductionBonus: 0, technologies: {}
})

export const createForecastContext = (player: Player, gameSpeed: number, now: number): ForecastContext => {
  const bonuses = officerLogic.calculateActiveBonuses(player.officers, now)
  return {
    ...createDefaultForecastContext(), ...bonuses,
    buildSpeedBonus: bonuses.buildingSpeedBonus,
    researchSpeedBonus: bonuses.researchSpeedBonus,
    energyBonusExpiresAt: officerLogic.getEnergyBonusExpiresAt(player.officers, now),
    technologies: player.technologies, gameSpeed
  }
}

export const createDefaultAlertSettings = (): AutopilotAlertSettings => ({ oreHours: 24, warehouseHours: 6, powerHours: 6 })

export const getAlertSettings = (planet: Planet): AutopilotAlertSettings => {
  const defaults = createDefaultAlertSettings()
  const saved = planet.autopilot?.alerts
  for (const key of Object.keys(defaults) as Array<keyof AutopilotAlertSettings>) {
    const value = saved?.[key]
    if (value !== undefined && Number.isFinite(value) && value >= 0) defaults[key] = value
  }
  return defaults
}

const forecastAlert = (
  type: AutopilotAlert['type'], planetId: string, hoursLeft: number, threshold: number, resource?: TransportResource
): AutopilotAlert[] => {
  if (!Number.isFinite(hoursLeft) || !Number.isFinite(threshold) || threshold < 0 || hoursLeft > threshold) return []
  return [{ type, planetId, ...(resource ? { resource } : {}), hoursLeft,
    severity: hoursLeft <= 0 ? 'critical' : hoursLeft <= threshold / 2 ? 'warn' : 'info' }]
}

export const forecastProduction = (planet: Planet, context: ForecastContext): Resources => {
  const production = resourceLogic.calculateResourceProduction(planet, context, {
    mineralResearchLevel: context.technologies[TechnologyType.MineralResearch],
    crystalResearchLevel: context.technologies[TechnologyType.CrystalResearch],
    fuelResearchLevel: context.technologies[TechnologyType.FuelResearch]
  })
  const speed = Math.max(0, context.gameSpeed)
  return Object.fromEntries(Object.entries(production).map(([resource, rate]) =>
    [resource, context.netProduction?.[resource as keyof Resources] ?? rate * speed]
  )) as unknown as Resources
}

export const predictOreDepletion = (
  planet: Planet, hours = getAlertSettings(planet).oreHours, context = createDefaultForecastContext()
): AutopilotAlert[] => {
  if (planet.isMoon || !planet.oreDeposits) return []
  const deposits = planet.oreDeposits
  const position = deposits.position ?? planet.position
  const initial = oreLogic.calculateInitialDeposits(position)
  const enhanced = oreLogic.calculateEnhancedDeposits(position,
    planet.buildings[BuildingType.DeepDrillingFacility] || 0, context.technologies[TechnologyType.MiningTechnology] || 0)
  const production = forecastProduction(planet, context)
  const regeneration = ORE_DEPOSIT_CONFIG.REGENERATION
  return TRANSPORT_RESOURCES.flatMap(resource => {
    const remaining = deposits[resource] - initial[resource] * ORE_DEPOSIT_CONFIG.DECAY_START_THRESHOLD
    const regenerated = regeneration.ENABLED
      ? enhanced[resource] * regeneration.RATE_PER_HOUR * oreLogic.calculateGeoStationBonus(planet.buildings[BuildingType.GeoResearchStation] || 0) * Math.max(0, context.gameSpeed)
      : 0
    const consumed = context.oreConsumption?.[resource] ?? production[resource] - regenerated
    const hoursLeft = remaining <= 0 ? 0 : consumed > 0 ? remaining / consumed : Infinity
    return forecastAlert('ore', planet.id, hoursLeft, hours, resource)
  })
}

export const predictWarehouseFull = (
  planet: Planet, hours = getAlertSettings(planet).warehouseHours, context = createDefaultForecastContext()
): AutopilotAlert[] => {
  const production = forecastProduction(planet, context)
  const capacity = resourceLogic.calculateResourceCapacity(planet, context.storageCapacityBonus)
  return TRANSPORT_RESOURCES.flatMap(resource => {
    const remaining = capacity[resource] - planet.resources[resource]
    const rate = production[resource]
    const hoursLeft = remaining <= 0 ? 0 : rate > 0 ? remaining / rate : Infinity
    return forecastAlert('warehouse', planet.id, hoursLeft, hours, resource)
  })
}

export const predictPowerShortage = (
  planet: Planet, hours = getAlertSettings(planet).powerHours, context = createDefaultForecastContext()
): AutopilotAlert[] => {
  const current = checkEnergySafeWorstOrder(planet, context.energyProductionBonus)
  const expired = context.energyBonusExpiresAt !== undefined ? checkEnergySafeWorstOrder(planet, 0) : current
  const margin = Math.min(current.margin, expired.margin)
  const drain = -margin * Math.max(0, context.gameSpeed)
  const hoursLeft = drain > 0 ? Math.max(0, planet.resources.energy) / drain : Infinity
  return forecastAlert('power', planet.id, hoursLeft, hours)
}

export const collectAutopilotAlerts = (player: Player, context: ForecastContext): AutopilotAlert[] =>
  player.planets.filter(planet => planet.autopilot?.enabled).flatMap(planet => [
    ...predictOreDepletion(planet, undefined, context),
    ...predictWarehouseFull(planet, undefined, context),
    ...predictPowerShortage(planet, undefined, context)
  ])

export const selectNewAlerts = (
  alerts: AutopilotAlert[], previous: ReadonlyMap<string, AutopilotAlert['severity']>
): { fresh: AutopilotAlert[]; state: Map<string, AutopilotAlert['severity']> } => {
  const state = new Map<string, AutopilotAlert['severity']>()
  const rank = { info: 0, warn: 1, critical: 2 }
  const fresh = alerts.filter(alert => {
    const key = `${alert.planetId}:${alert.type}:${alert.resource ?? ''}`
    const old = previous.get(key)
    state.set(key, old !== undefined && rank[old] > rank[alert.severity] ? old : alert.severity)
    return old === undefined || rank[alert.severity] > rank[old]
  })
  return { fresh, state }
}
