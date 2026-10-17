import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deliverAutopilotNotifications } from '@/logic/autopilotNotifications'
import { predictPowerShortage, selectNewAlerts } from '@/logic/autopilotAlerts'
import { selectNewExpeditionReminders } from '@/logic/autopilotExpeditions'
import { BuildingType, MissionType } from '@/types/game'
import { monitoringPlanet, monitoringPlayer } from '../utils/autopilot'
import { HOUR, restore, setNow } from '../utils/time'

beforeEach(() => setNow(1_700_000_000_000))
afterEach(restore)

describe('autopilot silent notifications', () => {
  const notifications = [
    { title: 'Power shortage', description: 'Planet A' },
    { title: 'Power shortage', description: 'Planet B' },
    { title: 'Expedition returning', description: 'Planet A' }
  ]
  it('groups alerts and reminders into summary parts without toast or browser delivery', () => {
    const notify = vi.fn()
    expect(deliverAutopilotNotifications(notifications, true, notify)).toEqual(['Power shortage ×2', 'Expedition returning ×1'])
    expect(notify).not.toHaveBeenCalled()
  })
  it('delivers every notification normally outside silent mode', () => {
    const notify = vi.fn()
    expect(deliverAutopilotNotifications(notifications, false, notify)).toEqual([])
    expect(notify.mock.calls).toEqual(notifications.map(notification => [notification.title, notification.description]))
  })
  it('does not add summary parts when no new alerts or reminders exist', () => {
    expect(deliverAutopilotNotifications([], true, vi.fn())).toEqual([])
  })
  it('advances alert and expedition state during silent skips without replaying on the next tick', () => {
    const planet = monitoringPlanet()
    planet.buildings[BuildingType.MetalMine] = 1
    const player = monitoringPlayer([planet])
    player.fleetMissions.push({ id: 'expedition', playerId: player.id, originPlanetId: planet.id,
      targetPosition: planet.position, missionType: MissionType.Expedition, fleet: {}, cargo: { ...planet.resources },
      departureTime: Date.now() - HOUR, arrivalTime: Date.now() - HOUR / 2,
      returnTime: Date.now() + HOUR / 4, status: 'returning' })
    const alerts = predictPowerShortage(planet)
    const selected = selectNewAlerts(alerts, new Map(), Date.now())
    const reminders = selectNewExpeditionReminders(player, Date.now(), new Set())
    const notify = vi.fn()
    const batch = [
      ...selected.fresh.map(alert => ({ title: alert.type, description: alert.planetId })),
      ...reminders.fresh.map(reminder => ({ title: 'expedition', description: reminder.planetId }))
    ]
    expect(deliverAutopilotNotifications(batch, true, notify)).toEqual(['power ×1', 'expedition ×1'])
    expect(notify).not.toHaveBeenCalled()
    expect(selectNewAlerts(alerts, selected.state, Date.now() + 1000).fresh).toEqual([])
    expect(selectNewExpeditionReminders(player, Date.now() + 1000, reminders.state).fresh).toEqual([])
  })
})
