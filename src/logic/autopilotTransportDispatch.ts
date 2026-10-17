import { MissionType, ShipType } from '@/types/game'
import type { Fleet, Player, Resources } from '@/types/game'
import { SHIPS } from '@/config/gameConfig'
import { createForecastContext } from './autopilotAlerts'
import { suggestTransports } from './autopilotTransports'
import type { TransportSuggestion } from './autopilotTransports'
import * as resourceLogic from './resourceLogic'
import * as fleetLogic from './fleetLogic'
import * as shipLogic from './shipLogic'
import * as shipValidation from './shipValidation'
import * as officerLogic from './officerLogic'
import * as gameLogic from './gameLogic'
import { getGameNow } from './gameTime'

export const executeSuggestedTransport = (
  player: Player, suggestion: TransportSuggestion, gameSpeed: number
): { success: boolean; reason?: string } => {
  const now = getGameNow()
  const context = createForecastContext(player, gameSpeed, now)
  const fresh = suggestTransports(player.planets, context, player).find(candidate =>
    candidate.from === suggestion.from && candidate.to === suggestion.to && candidate.resource === suggestion.resource)
  if (!fresh || !Number.isSafeInteger(suggestion.amount) || suggestion.amount <= 0 || fresh.amount < suggestion.amount) {
    return { success: false, reason: 'autopilot.transportExpired' }
  }
  const from = player.planets.find(planet => planet.id === suggestion.from)!
  const to = player.planets.find(planet => planet.id === suggestion.to)!
  const cargo: Resources = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0, [suggestion.resource]: suggestion.amount }
  const fleet: Partial<Fleet> = {}
  let remaining = suggestion.amount
  for (const ship of [ShipType.LargeCargo, ShipType.SmallCargo]) {
    const count = Math.min(from.fleet[ship] || 0, Math.ceil(remaining / SHIPS[ship].cargoCapacity))
    if (count <= 0) continue
    fleet[ship] = count
    remaining -= count * SHIPS[ship].cargoCapacity
    if (remaining <= 0) break
  }
  if (remaining > 0) return { success: false, reason: 'autopilot.transportNoCargo' }
  const validation = shipValidation.validateFleetDispatch(from, fleet, cargo, player.officers,
    player.fleetMissions.length, player.technologies)
  if (!validation.valid) return { success: false, reason: validation.reason }
  const fuel = validation.fuelNeeded ?? 0
  if (from.resources.deuterium < cargo.deuterium + fuel ||
    !resourceLogic.checkResourcesAvailable(from.resources, cargo)) {
    return { success: false, reason: 'errors.insufficientResources' }
  }
  const bonuses = officerLogic.calculateActiveBonuses(player.officers, now)
  const distance = fleetLogic.calculateDistance(from.position, to.position)
  const flightTime = fleetLogic.calculateFlightTime(distance, shipLogic.calculateFleetMinSpeed(fleet, bonuses.fleetSpeedBonus))
  const mission = fleetLogic.createFleetMission(player.id, from.id, to.position, MissionType.Transport, fleet, cargo, flightTime)
  mission.targetPlanetId = to.id
  mission.targetIsMoon = to.isMoon
  shipValidation.executeFleetDispatch(from, fleet, fuel, true, cargo)
  gameLogic.trackResourceConsumption(player, { deuterium: fuel })
  gameLogic.trackFuelConsumption(player, fuel)
  player.fleetMissions.push(mission)
  return { success: true }
}
