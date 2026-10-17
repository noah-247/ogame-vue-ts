import { MissionType } from '@/types/game'
import type { FleetMission, Planet, Player } from '@/types/game'

export interface ExpeditionReminder {
  missionId: string
  planetId: string
  minutesLeft: number
}

export const getExpeditionReminderMinutes = (planet: Planet): number => {
  const value = planet.autopilot?.expeditionReminderMinutes
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 30
}

export const predictExpeditionReturns = (missions: FleetMission[], now: number, minutes = 30): ExpeditionReminder[] => {
  if (!Number.isFinite(now) || !Number.isFinite(minutes) || minutes < 0) return []
  return missions.flatMap(mission => {
    if (mission.missionType !== MissionType.Expedition || mission.status !== 'returning' ||
      mission.returnTime === undefined || !Number.isFinite(mission.returnTime)) return []
    const minutesLeft = (mission.returnTime - now) / 60_000
    if (minutesLeft <= 0 || minutesLeft > minutes) return []
    return [{ missionId: mission.id, planetId: mission.originPlanetId, minutesLeft }]
  })
}

export const collectExpeditionReminders = (player: Player, now: number): ExpeditionReminder[] =>
  player.planets.filter(planet => planet.autopilot?.enabled).flatMap(planet =>
    predictExpeditionReturns(player.fleetMissions.filter(mission =>
      mission.originPlanetId === planet.id && mission.playerId === player.id), now, getExpeditionReminderMinutes(planet)))

export const selectNewExpeditionReminders = (
  player: Player, now: number, previous: ReadonlySet<string>
): { fresh: ExpeditionReminder[]; state: Set<string> } => {
  const reminders = collectExpeditionReminders(player, now)
  const returning = new Set(player.fleetMissions.filter(mission =>
    mission.missionType === MissionType.Expedition && mission.status === 'returning' &&
    mission.returnTime !== undefined && mission.returnTime > now).map(mission => mission.id))
  const state = new Set([...previous].filter(id => returning.has(id)))
  const fresh = reminders.filter(reminder => !state.has(reminder.missionId))
  for (const reminder of fresh) state.add(reminder.missionId)
  return { fresh, state }
}
