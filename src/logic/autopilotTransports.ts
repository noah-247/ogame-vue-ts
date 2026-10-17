import type { Planet, Player, Resources } from '@/types/game'
import { MissionType } from '@/types/game'
import { planAllSteps, planResearchSteps, selectResearchPlanet } from './autopilotLogic'
import {
  createDefaultForecastContext, forecastProduction, predictWarehouseFull, TRANSPORT_RESOURCES
} from './autopilotAlerts'
import type { ForecastContext, TransportResource } from './autopilotAlerts'
import * as resourceLogic from './resourceLogic'

export interface TransportSuggestion {
  from: string
  to: string
  resource: TransportResource
  amount: number
  reason: 'autopilot.transportReason'
}

const targetCosts = (planet: Planet, context: ForecastContext, player?: Player): Record<TransportResource, number> => {
  const costs: Resources[] = planet.autopilot
    ? planAllSteps(planet, context.technologies, planet.autopilot, context).filter(step => !step.blockedBy).map(step => step.cost)
    : []
  if (player?.empireResearchAutopilot && selectResearchPlanet(player)?.id === planet.id) {
    costs.push(...planResearchSteps(player, player.empireResearchAutopilot, context)
      .filter(step => !step.blockedByBuilding).map(step => step.cost))
  }
  return Object.fromEntries(TRANSPORT_RESOURCES.map(resource =>
    [resource, Math.max(0, ...costs.map(cost => cost[resource]))]
  )) as Record<TransportResource, number>
}

export const suggestTransports = (
  planets: Planet[], context = createDefaultForecastContext(), player?: Player
): TransportSuggestion[] => {
  const costs = new Map(planets.map(planet => [planet.id, targetCosts(planet, context, player)]))
  const available = new Map<string, number>()
  const shortages = new Map<string, number>()
  for (const planet of planets) {
    const capacity = resourceLogic.calculateResourceCapacity(planet, context.storageCapacityBonus)
    const incoming = player?.fleetMissions.filter(mission => {
      if (mission.missionType !== MissionType.Transport || mission.status !== 'outbound') return false
      if (mission.targetPlanetId !== undefined) return mission.targetPlanetId === planet.id
      return mission.targetPosition.galaxy === planet.position.galaxy &&
        mission.targetPosition.system === planet.position.system &&
        mission.targetPosition.position === planet.position.position &&
        (mission.targetIsMoon ?? false) === (planet.isMoon ?? false)
    }) ?? []
    for (const resource of TRANSPORT_RESOURCES) {
      const key = `${planet.id}:${resource}`
      const required = costs.get(planet.id)![resource]
      const reserve = planet.autopilot?.reserve[resource] ?? 0
      const inTransit = incoming.reduce((total, mission) => total + mission.cargo[resource], 0)
      available.set(key, Math.max(0, planet.resources[resource] - required - reserve))
      shortages.set(key, Math.min(Math.max(0, capacity[resource] - planet.resources[resource] - inTransit),
        required > 0 ? Math.max(0, required + reserve - planet.resources[resource] - inTransit) : 0))
    }
  }
  const suggestions: TransportSuggestion[] = []
  for (const from of planets) {
    const production = forecastProduction(from, context)
    for (const alert of predictWarehouseFull(from, undefined, context)) {
      const resource = alert.resource!
      if (!(production[resource] > 0)) continue
      const sourceKey = `${from.id}:${resource}`
      for (const to of planets) {
        if (from.id === to.id) continue
        const destinationKey = `${to.id}:${resource}`
        const amount = Math.floor(Math.min(available.get(sourceKey)!, shortages.get(destinationKey)!) * 0.8)
        if (amount <= 0) continue
        suggestions.push({ from: from.id, to: to.id, resource, amount, reason: 'autopilot.transportReason' })
        available.set(sourceKey, available.get(sourceKey)! - amount)
        shortages.set(destinationKey, shortages.get(destinationKey)! - amount)
      }
    }
  }
  return suggestions
}
