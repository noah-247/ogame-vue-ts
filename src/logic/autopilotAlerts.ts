import { BuildingType, TechnologyType } from '@/types/game'
import type { AutopilotAlertSettings, Planet, Player, Resources } from '@/types/game'
import { ORE_DEPOSIT_CONFIG } from '@/config/gameConfig'
import { checkEnergySafeWorstOrder, createDefaultContext, pendingEnergyDelta } from './autopilotLogic'
import type { AutopilotContext } from './autopilotLogic'
import * as resourceLogic from './resourceLogic'
import * as oreLogic from './oreDepositLogic'
import * as officerLogic from './officerLogic'
import { getGameNow } from './gameTime'

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
  now: number
  storageBonusExpiresAt?: number
  gameSpeed: number
  resourceProductionBonus: number
  darkMatterProductionBonus: number
  technologies: Partial<Record<TechnologyType, number>>
  netProduction?: Partial<Resources>
  oreConsumption?: Partial<Record<TransportResource, number>>
}

export const createDefaultForecastContext = (): ForecastContext => ({
  ...createDefaultContext(), now: getGameNow(), gameSpeed: 1, resourceProductionBonus: 0,
  darkMatterProductionBonus: 0, technologies: {}
})

export const createForecastContext = (player: Player, gameSpeed: number, now: number): ForecastContext => {
  const bonuses = officerLogic.calculateActiveBonuses(player.officers, now)
  return {
    ...createDefaultForecastContext(), ...bonuses,
    buildSpeedBonus: bonuses.buildingSpeedBonus,
    researchSpeedBonus: bonuses.researchSpeedBonus,
    energyBonusExpiresAt: officerLogic.getEnergyBonusExpiresAt(player.officers, now),
    storageBonusExpiresAt: officerLogic.getStorageBonusExpiresAt(player.officers, now),
    technologies: player.technologies, gameSpeed, now
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
    const hoursLeft = consumed <= 0 ? Infinity : remaining <= 0 ? 0 : remaining / consumed
    return forecastAlert('ore', planet.id, hoursLeft, hours, resource)
  })
}

export const predictWarehouseFull = (
  planet: Planet, hours = getAlertSettings(planet).warehouseHours, context = createDefaultForecastContext()
): AutopilotAlert[] => {
  const production = forecastProduction(planet, context)
  const capacity = resourceLogic.calculateResourceCapacity(planet, context.storageCapacityBonus)
  const expiredCapacity = resourceLogic.calculateResourceCapacity(planet, 0)
  return TRANSPORT_RESOURCES.flatMap(resource => {
    const remaining = capacity[resource] - planet.resources[resource]
    const rate = production[resource]
    let hoursLeft = remaining <= 0 ? 0 : rate > 0 ? remaining / rate : Infinity
    if (context.storageBonusExpiresAt !== undefined) {
      const expiresIn = Math.max(0, (context.storageBonusExpiresAt - context.now) / 3.6e6)
      const expiredRemaining = expiredCapacity[resource] - planet.resources[resource]
      const expiredFullIn = expiredRemaining <= 0 ? 0 : rate > 0 ? expiredRemaining / rate : Infinity
      hoursLeft = Math.min(hoursLeft, Math.max(expiresIn, expiredFullIn))
    }
    return forecastAlert('warehouse', planet.id, hoursLeft, hours, resource)
  })
}

export const predictPowerShortage = (
  planet: Planet, hours = getAlertSettings(planet).powerHours, context = createDefaultForecastContext()
): AutopilotAlert[] => {
  const currentMargin = (bonus: number) => resourceLogic.calculateEnergyProduction(planet, { energyProductionBonus: bonus }) -
    resourceLogic.calculateEnergyConsumption(planet)
  if (currentMargin(context.energyProductionBonus) < 0) return forecastAlert('power', planet.id, 0, hours)

  const harmful = planet.buildQueue.filter(item => {
    if (item.type !== 'building' && item.type !== 'demolish') return false
    const { prodDelta, consDelta } = pendingEnergyDelta(planet, item, context.energyProductionBonus)
    return consDelta > 0 || prodDelta < 0
  })
  const times = harmful.map(item => item.endTime)
  if (context.energyBonusExpiresAt !== undefined) times.push(context.energyBonusExpiresAt)
  for (const time of [...new Set(times)].sort((earlier, later) => earlier - later)) {
    const bonus = context.energyBonusExpiresAt !== undefined && time >= context.energyBonusExpiresAt
      ? 0 : context.energyProductionBonus
    let margin = currentMargin(bonus)
    for (const item of harmful) {
      if (item.endTime > time) continue
      const { prodDelta, consDelta } = pendingEnergyDelta(planet, item, bonus)
      margin += Math.min(0, prodDelta) - Math.max(0, consDelta)
    }
    if (margin < 0) return forecastAlert('power', planet.id, Math.max(0, (time - context.now) / 3.6e6), hours)
  }

  if (!checkEnergySafeWorstOrder(planet, context.energyProductionBonus).safe) {
    const slots = planet.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish')
    const earliest = Math.min(...slots.map(item => item.endTime))
    const hoursLeft = slots.length > 0 ? Math.max(0, (earliest - context.now) / 3.6e6) : 0
    return forecastAlert('power', planet.id, hoursLeft, hours).map(alert => ({ ...alert, severity: 'warn' }))
  }
  return []
}

export const collectAutopilotAlerts = (player: Player, context: ForecastContext): AutopilotAlert[] =>
  player.planets.filter(planet => planet.autopilot?.enabled).flatMap(planet => [
    ...predictOreDepletion(planet, undefined, context),
    ...predictWarehouseFull(planet, undefined, context),
    ...predictPowerShortage(planet, undefined, context)
  ])

export interface AlertNotificationState {
  severity: AutopilotAlert['severity']
  lastSeenAt: number
}

export const selectNewAlerts = (
  alerts: AutopilotAlert[], previous: ReadonlyMap<string, AlertNotificationState>, now = getGameNow()
): { fresh: AutopilotAlert[]; state: Map<string, AlertNotificationState> } => {
  const state = new Map([...previous].filter(([, entry]) => now - entry.lastSeenAt < 30 * 60_000))
  const rank = { info: 0, warn: 1, critical: 2 }
  const fresh = alerts.filter(alert => {
    const key = `${alert.planetId}:${alert.type}:${alert.resource ?? ''}`
    const old = previous.get(key)
    const notify = old === undefined || rank[alert.severity] > rank[old.severity]
    state.set(key, { severity: notify ? alert.severity : old.severity, lastSeenAt: now })
    return notify
  })
  return { fresh, state }
}
