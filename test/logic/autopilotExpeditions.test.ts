import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExpeditionZone, MissionType } from '@/types/game'
import type { FleetMission } from '@/types/game'
import { collectExpeditionReminders, getExpeditionReminderMinutes, predictExpeditionReturns, selectNewExpeditionReminders } from '@/logic/autopilotExpeditions'
import { monitoringPlanet, monitoringPlayer } from '../utils/autopilot'
import { HOUR, jump, restore, setNow } from '../utils/time'

beforeEach(() => setNow(1_700_000_000_000))
afterEach(restore)

const mission = (overrides: Partial<FleetMission> = {}): FleetMission => ({
  id: 'expedition-1', playerId: 'player-1', originPlanetId: 'planet-1',
  targetPosition: { galaxy: 1, system: 1, position: 16 }, missionType: MissionType.Expedition,
  fleet: {}, cargo: { metal: 100, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
  departureTime: Date.now() - HOUR, arrivalTime: Date.now() - HOUR / 2,
  returnTime: Date.now() + HOUR / 2, status: 'returning', ...overrides
})

describe('expedition return reminders', () => {
  it('includes the exact default 30 minute boundary', () => {
    expect(predictExpeditionReturns([mission()], Date.now())).toEqual([
      { missionId: 'expedition-1', planetId: 'planet-1', minutesLeft: 30 }
    ])
  })
  it('crosses into the window using the fake game clock', () => {
    const fleet = mission({ returnTime: Date.now() + HOUR })
    expect(predictExpeditionReturns([fleet], Date.now())).toEqual([])
    jump(HOUR / 2)
    expect(predictExpeditionReturns([fleet], Date.now())).toHaveLength(1)
  })
  it.each(['outbound', 'arrived'] as const)('does not touch %s missions', status => {
    expect(predictExpeditionReturns([mission({ status })], Date.now())).toEqual([])
  })
  it('does not remind transport or hostile fleets', () => {
    const planet = monitoringPlanet()
    const player = monitoringPlayer([planet])
    player.fleetMissions = [mission({ missionType: MissionType.Transport }), mission({ playerId: 'npc-1' })]
    expect(collectExpeditionReminders(player, Date.now())).toEqual([])
  })
  it.each([undefined, NaN, Infinity, 0])('ignores absent or invalid returnTime %s', returnTime => {
    expect(predictExpeditionReturns([mission({ returnTime })], Date.now())).toEqual([])
  })
  it('does not emit reminders at or after arrival, including offline jumps', () => {
    const fleet = mission()
    jump(HOUR / 2)
    expect(predictExpeditionReturns([fleet], Date.now())).toEqual([])
    jump(24 * HOUR)
    expect(predictExpeditionReturns([fleet], Date.now())).toEqual([])
  })
  it.each(Object.values(ExpeditionZone))('uses actual return time for zone %s', expeditionZone => {
    expect(predictExpeditionReturns([mission({ expeditionZone })], Date.now())[0]?.minutesLeft).toBe(30)
  })
  it('uses per-origin settings and still works with construction paused', () => {
    const planet = monitoringPlanet()
    const player = monitoringPlayer([planet])
    player.fleetMissions = [mission()]
    planet.autopilot!.paused = true
    planet.autopilot!.expeditionReminderMinutes = 29
    expect(collectExpeditionReminders(player, Date.now())).toEqual([])
    planet.autopilot!.expeditionReminderMinutes = 30
    expect(collectExpeditionReminders(player, Date.now())).toHaveLength(1)
    planet.autopilot!.enabled = false
    expect(collectExpeditionReminders(player, Date.now())).toEqual([])
  })
  it('defaults legacy settings and handles disabled and invalid windows', () => {
    const planet = monitoringPlanet()
    expect(getExpeditionReminderMinutes(planet)).toBe(30)
    planet.autopilot!.expeditionReminderMinutes = NaN
    expect(getExpeditionReminderMinutes(planet)).toBe(30)
    expect(predictExpeditionReturns([mission()], Date.now(), 0)).toEqual([])
    expect(predictExpeditionReturns([mission()], Date.now(), -1)).toEqual([])
    expect(predictExpeditionReturns([mission()], Date.now(), Infinity)).toEqual([])
  })
  it('does not resend per tick or after window adjustments and clears completed ids', () => {
    const planet = monitoringPlanet()
    const player = monitoringPlayer([planet])
    player.fleetMissions = [mission()]
    const first = selectNewExpeditionReminders(player, Date.now(), new Set())
    expect(first.fresh).toHaveLength(1)
    jump(60_000)
    expect(selectNewExpeditionReminders(player, Date.now(), first.state).fresh).toEqual([])
    planet.autopilot!.expeditionReminderMinutes = 0
    const disabled = selectNewExpeditionReminders(player, Date.now(), first.state)
    planet.autopilot!.expeditionReminderMinutes = 30
    expect(selectNewExpeditionReminders(player, Date.now(), disabled.state).fresh).toEqual([])
    jump(HOUR)
    expect(selectNewExpeditionReminders(player, Date.now(), first.state).state.size).toBe(0)
  })
  it('does not mutate fleet dispatch, loot or return processing', () => {
    const fleet = mission()
    const snapshot = JSON.stringify(fleet)
    predictExpeditionReturns([fleet], Date.now())
    expect(JSON.stringify(fleet)).toBe(snapshot)
  })
})
