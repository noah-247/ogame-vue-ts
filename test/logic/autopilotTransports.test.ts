import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuildingType, MissionType, ShipType, TechnologyType } from '@/types/game'
import { createAutopilotResearchTarget, createAutopilotTarget, createDefaultEmpireResearchAutopilot } from '@/logic/autopilotLogic'
import { createDefaultForecastContext } from '@/logic/autopilotAlerts'
import { suggestTransports } from '@/logic/autopilotTransports'
import { executeSuggestedTransport } from '@/logic/autopilotTransportDispatch'
import { getGameNow, setTimeOffset } from '@/logic/gameTime'
import { getMaxFleetMissions } from '@/logic/publicLogic'
import { monitoringPlanet, monitoringPlayer } from '../utils/autopilot'
import { HOUR, jump, restore, setNow } from '../utils/time'

vi.mock('@/stores/gameStore', () => ({ useGameStore: vi.fn() }))

beforeEach(() => { setNow(1_700_000_000_000); setTimeOffset(0) })
afterEach(() => { restore(); setTimeOffset(0) })

const setup = () => {
  const from = monitoringPlanet({ id: 'from' })
  from.resources.metal = 10_000
  from.resources.deuterium = 10_000
  from.buildings[BuildingType.MetalMine] = 1
  from.buildings[BuildingType.SolarPlant] = 1
  from.fleet[ShipType.SmallCargo] = 4
  const to = monitoringPlanet({ id: 'to', position: { galaxy: 1, system: 2, position: 8 } })
  to.autopilot!.targets = [createAutopilotTarget(BuildingType.SolarPlant, 1, 0, Date.now())]
  const player = monitoringPlayer([from, to])
  return { from, to, player }
}

describe('pure conservative transport suggestions', () => {
  it('matches overflow to shortage and discounts once to 80 percent', () => {
    const { player } = setup()
    expect(suggestTransports(player.planets)).toEqual([
      { from: 'from', to: 'to', resource: 'metal', amount: 60, reason: 'autopilot.transportReason' }
    ])
  })
  it('does not suggest when the recipient has no target shortage', () => {
    const { to, player } = setup()
    to.resources.metal = 1000
    expect(suggestTransports(player.planets)).toEqual([])
  })
  it('does not suggest for a donor with no imminent overflow', () => {
    const { from, player } = setup()
    from.resources.metal = 0
    from.autopilot!.alerts = { oreHours: 24, warehouseHours: 1, powerHours: 6 }
    expect(suggestTransports(player.planets)).toEqual([])
  })
  it.each([0, -100])('ignores a full donor with net production %s', rate => {
    const { player } = setup()
    expect(suggestTransports(player.planets, { ...createDefaultForecastContext(), netProduction: { metal: rate } })).toEqual([])
  })
  it('keeps donor reserves and its own next target costs', () => {
    const { from, player } = setup()
    from.autopilot!.reserve.metal = 9950
    expect(suggestTransports(player.planets)[0]?.amount).toBe(40)
    from.autopilot!.targets = [createAutopilotTarget(BuildingType.SolarPlant, 2, 0, Date.now())]
    expect(suggestTransports(player.planets)).toEqual([])
  })
  it('does not allocate more than donor inventory across destinations', () => {
    const { from, to, player } = setup()
    const other = monitoringPlanet({ id: 'other' })
    other.autopilot!.targets = structuredClone(to.autopilot!.targets)
    player.planets.push(other)
    from.autopilot!.reserve.metal = 9925
    const suggestions = suggestTransports(player.planets)
    expect(suggestions.reduce((total, suggestion) => total + suggestion.amount, 0)).toBeLessThanOrEqual(75)
    expect(suggestions.every(suggestion => suggestion.from !== suggestion.to)).toBe(true)
  })
  it('caps deliveries to destination storage space', () => {
    const { to, player } = setup()
    to.resources.metal = 9990
    to.buildings[BuildingType.SolarPlant] = 20
    to.autopilot!.targets = [createAutopilotTarget(BuildingType.SolarPlant, 21, 0, Date.now())]
    expect(suggestTransports(player.planets).find(suggestion => suggestion.resource === 'metal')?.amount).toBe(8)
  })
  it('includes research shortages at the empire laboratory', () => {
    const { to, player } = setup()
    to.buildings[BuildingType.ResearchLab] = 1
    to.autopilot!.targets = []
    player.empireResearchAutopilot = createDefaultEmpireResearchAutopilot()
    player.empireResearchAutopilot.targets = [createAutopilotResearchTarget(TechnologyType.CombustionDrive, 1, 0, Date.now())]
    expect(suggestTransports(player.planets, createDefaultForecastContext(), player).some(suggestion => suggestion.to === to.id)).toBe(true)
  })
  it('recomputes after panel state changes and never mutates or persists suggestions', () => {
    const { to, player } = setup()
    const snapshot = JSON.stringify(player)
    expect(suggestTransports(player.planets)).toHaveLength(1)
    expect(JSON.stringify(player)).toBe(snapshot)
    jump(HOUR)
    to.resources.metal = 75
    expect(suggestTransports(player.planets)).toEqual([])
  })
})

describe('confirmed transport dispatch', () => {
  it('dispatches through existing fleet logic and records fuel statistics', () => {
    const { from, to, player } = setup()
    setTimeOffset(2 * HOUR)
    const suggestion = suggestTransports(player.planets)[0]!
    expect(executeSuggestedTransport(player, suggestion, 1)).toEqual({ success: true })
    expect(from.resources.metal).toBe(9940)
    expect(from.resources.deuterium).toBe(9990)
    expect(from.fleet[ShipType.SmallCargo]).toBe(3)
    expect(player.fleetMissions[0]).toMatchObject({
      originPlanetId: from.id, targetPlanetId: to.id, missionType: MissionType.Transport,
      status: 'outbound', departureTime: getGameNow(), cargo: { metal: 60 }
    })
    expect(player.achievementStats).toBeDefined()
  })
  it('preserves moon destination identity', () => {
    const { to, player } = setup()
    to.isMoon = true
    to.autopilot!.targets = [createAutopilotTarget(BuildingType.RoboticsFactory, 1, 0, Date.now())]
    const suggestion = suggestTransports(player.planets)[0]!
    expect(executeSuggestedTransport(player, suggestion, 1).success).toBe(true)
    expect(player.fleetMissions[0]?.targetIsMoon).toBe(true)
  })
  it('rejects expired suggestions without side effects', () => {
    const { to, player } = setup()
    const suggestion = suggestTransports(player.planets)[0]!
    to.resources.metal = 100
    const snapshot = JSON.stringify(player)
    expect(executeSuggestedTransport(player, suggestion, 1)).toEqual({ success: false, reason: 'autopilot.transportExpired' })
    expect(JSON.stringify(player)).toBe(snapshot)
  })
  it.each([NaN, -1, 0, 1.5, 10_000])('rejects malformed or oversized amount %s', amount => {
    const { player } = setup()
    const suggestion = { ...suggestTransports(player.planets)[0]!, amount }
    const snapshot = JSON.stringify(player)
    expect(executeSuggestedTransport(player, suggestion, 1).success).toBe(false)
    expect(JSON.stringify(player)).toBe(snapshot)
  })
  it('rejects insufficient cargo ships without spending anything', () => {
    const { from, player } = setup()
    from.fleet = {} as typeof from.fleet
    const snapshot = JSON.stringify(player)
    expect(executeSuggestedTransport(player, suggestTransports(player.planets)[0]!, 1).reason).toBe('autopilot.transportNoCargo')
    expect(JSON.stringify(player)).toBe(snapshot)
  })
  it('rejects missing fuel without dispatching', () => {
    const { from, player } = setup()
    from.resources.deuterium = 0
    const snapshot = JSON.stringify(player)
    expect(executeSuggestedTransport(player, suggestTransports(player.planets)[0]!, 1).success).toBe(false)
    expect(JSON.stringify(player)).toBe(snapshot)
  })
  it('checks cargo plus fuel when transporting deuterium', () => {
    const { from, to, player } = setup()
    from.buildings[BuildingType.DeuteriumSynthesizer] = 1
    from.buildings[BuildingType.SolarPlant] = 10
    from.resources.deuterium = 10
    from.fleet = { [ShipType.SmallCargo]: 1 } as typeof from.fleet
    from.autopilot!.alerts = { oreHours: 24, warehouseHours: 24, powerHours: 6 }
    to.buildings[BuildingType.ResearchLab] = 1
    to.autopilot!.targets = []
    player.empireResearchAutopilot = createDefaultEmpireResearchAutopilot()
    player.empireResearchAutopilot.targets = [createAutopilotResearchTarget(TechnologyType.CombustionDrive, 1, 0, Date.now())]
    const suggestion = suggestTransports(player.planets, createDefaultForecastContext(), player).find(suggestion => suggestion.resource === 'deuterium')!
    expect(suggestion).toBeDefined()
    const snapshot = JSON.stringify(player)
    expect(executeSuggestedTransport(player, suggestion, 1).success).toBe(false)
    expect(JSON.stringify(player)).toBe(snapshot)
  })
  it('rejects a full mission queue without spending resources or ships', () => {
    const { player } = setup()
    player.fleetMissions = Array.from({ length: getMaxFleetMissions() }, (_, index) => ({
      id: `active-${index}`
    })) as typeof player.fleetMissions
    const snapshot = JSON.stringify(player)
    expect(executeSuggestedTransport(player, suggestTransports(player.planets)[0]!, 1).reason).toBe('errors.fleetMissionsFull')
    expect(JSON.stringify(player)).toBe(snapshot)
  })
})
