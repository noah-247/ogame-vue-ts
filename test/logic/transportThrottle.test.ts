import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuildingType, ShipType } from '@/types/game'
import { createAutopilotTarget } from '@/logic/autopilotLogic'
import { createForecastContext } from '@/logic/autopilotAlerts'
import { suggestTransports } from '@/logic/autopilotTransports'
import type { TransportSuggestion } from '@/logic/autopilotTransports'
import { setTimeOffset } from '@/logic/gameTime'
import {
  createTransportThrottleState, getThrottledResult, shouldRecalculateTransports,
  snapshotTransportInputs, TRANSPORT_RECALC_MAX_STALE_MS, TRANSPORT_RECALC_RESOURCE_CHANGE_RATIO
} from '@/logic/transportThrottle'
import { monitoringPlanet, monitoringPlayer } from '../utils/autopilot'
import { jump, restore, setNow } from '../utils/time'

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

describe('transport input snapshots', () => {
  it('copies only planet IDs and transport resources without mutating the player', () => {
    const { from, player } = setup()
    const before = structuredClone(player)
    const snapshot = snapshotTransportInputs(player.planets)
    expect(snapshot).toEqual({ planets: {
      from: { metal: 10_000, crystal: 0, deuterium: 10_000 },
      to: { metal: 0, crystal: 0, deuterium: 0 }
    } })
    expect(player).toEqual(before)
    from.resources.metal = 20_000
    expect(snapshot.planets.from!.metal).toBe(10_000)
  })
})

describe('transport recalculation decisions', () => {
  it('recalculates without a previous snapshot', () => {
    expect(shouldRecalculateTransports(null, { planets: {} }, Date.now(), Date.now())).toBe(true)
  })

  it('ignores planet ordering and resources outside transports', () => {
    const { from, player } = setup()
    const last = snapshotTransportInputs(player.planets)
    from.resources.energy += 1000
    from.resources.darkMatter += 1000
    player.planets.reverse()
    expect(shouldRecalculateTransports(last, snapshotTransportInputs(player.planets), Date.now(), Date.now() + 1000)).toBe(false)
  })

  it('detects a replaced planet even when planet counts match', () => {
    const { player } = setup()
    const last = snapshotTransportInputs(player.planets)
    player.planets[1] = monitoringPlanet({ id: 'replacement' })
    expect(shouldRecalculateTransports(last, snapshotTransportInputs(player.planets), Date.now(), Date.now())).toBe(true)
  })

  it.each(['metal', 'crystal', 'deuterium'] as const)('detects increases and decreases above the %s threshold on any planet', resource => {
    const { to, player } = setup()
    to.resources[resource] = 1000
    const last = snapshotTransportInputs(player.planets)
    for (const amount of [1200, 800]) {
      to.resources[resource] = amount
      expect(shouldRecalculateTransports(last, snapshotTransportInputs(player.planets), Date.now(), Date.now())).toBe(true)
    }
  })

  it.each([1, -1])('does not recalculate at exactly the threshold in direction %s', direction => {
    const { from, player } = setup()
    const last = snapshotTransportInputs(player.planets)
    from.resources.metal *= 1 + direction * TRANSPORT_RECALC_RESOURCE_CHANGE_RATIO
    expect(shouldRecalculateTransports(last, snapshotTransportInputs(player.planets), Date.now(), Date.now())).toBe(false)
  })

  it('recalculates when zero becomes a positive fractional amount', () => {
    const { to, player } = setup()
    const last = snapshotTransportInputs(player.planets)
    to.resources.crystal = 0.001
    expect(shouldRecalculateTransports(last, snapshotTransportInputs(player.planets), Date.now(), Date.now())).toBe(true)
  })

  it('uses a denominator of at least one for fractional baselines', () => {
    const { to, player } = setup()
    to.resources.crystal = 0.1
    const last = snapshotTransportInputs(player.planets)
    to.resources.crystal = 0.11
    expect(shouldRecalculateTransports(last, snapshotTransportInputs(player.planets), Date.now(), Date.now())).toBe(false)
  })

  it.each([NaN, Infinity, -Infinity])('recalculates for non-finite resource values: %s', invalid => {
    const { from, player } = setup()
    const valid = snapshotTransportInputs(player.planets)
    for (const resource of ['metal', 'crystal', 'deuterium'] as const) {
      const invalidSnapshot = snapshotTransportInputs(player.planets)
      invalidSnapshot.planets[from.id]![resource] = invalid
      expect(shouldRecalculateTransports(valid, invalidSnapshot, Date.now(), Date.now())).toBe(true)
      expect(shouldRecalculateTransports(invalidSnapshot, valid, Date.now(), Date.now())).toBe(true)
    }
  })

  it.each([NaN, Infinity, -Infinity])('recalculates for non-finite timestamps: %s', invalid => {
    const snapshot = snapshotTransportInputs(setup().player.planets)
    expect(shouldRecalculateTransports(snapshot, snapshot, invalid, Date.now())).toBe(true)
    expect(shouldRecalculateTransports(snapshot, snapshot, Date.now(), invalid)).toBe(true)
  })

  it.each([
    [TRANSPORT_RECALC_MAX_STALE_MS - 1, false],
    [TRANSPORT_RECALC_MAX_STALE_MS, true]
  ])('checks the maximum age boundary at %s milliseconds', (elapsed, expected) => {
    const snapshot = snapshotTransportInputs(setup().player.planets)
    expect(shouldRecalculateTransports(snapshot, snapshot, Date.now(), Date.now() + elapsed)).toBe(expected)
  })
})

describe('cached transport results', () => {
  it('always computes on the first call and records the result, snapshot and time', () => {
    const { player } = setup()
    const state = createTransportThrottleState<string[]>()
    expect(state).toEqual({ lastSnapshot: null, lastCalculatedAt: 0, lastResult: null })
    const result = ['first']
    const compute = vi.fn(() => result)
    expect(getThrottledResult(state, player.planets, Date.now(), compute)).toBe(result)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(state.lastSnapshot).toEqual(snapshotTransportInputs(player.planets))
    expect(state.lastCalculatedAt).toBe(Date.now())
    expect(state.lastResult).toBe(result)
  })

  it('returns the same cached result after one second without recomputing', () => {
    const { player } = setup()
    const state = createTransportThrottleState<string[]>()
    const compute = vi.fn(() => ['cached'])
    const first = getThrottledResult(state, player.planets, Date.now(), compute)
    const firstSnapshot = state.lastSnapshot
    const firstCalculatedAt = state.lastCalculatedAt
    jump(1000)
    expect(getThrottledResult(state, player.planets, Date.now(), compute)).toBe(first)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(state.lastSnapshot).toBe(firstSnapshot)
    expect(state.lastCalculatedAt).toBe(firstCalculatedAt)
  })

  it.each([[1.2, 2], [1.01, 1]])('computes %s times the initial metal with %s total calls', (multiplier, expectedCalls) => {
    const { from, player } = setup()
    const state = createTransportThrottleState<string[]>()
    const compute = vi.fn(() => ['result'])
    getThrottledResult(state, player.planets, Date.now(), compute)
    from.resources.metal *= multiplier
    jump(1000)
    getThrottledResult(state, player.planets, Date.now(), compute)
    expect(compute).toHaveBeenCalledTimes(expectedCalls)
  })

  it('compares cumulative resource changes with the last calculation', () => {
    const { from, player } = setup()
    const state = createTransportThrottleState<string[]>()
    const compute = vi.fn(() => ['result'])
    getThrottledResult(state, player.planets, Date.now(), compute)
    from.resources.metal = 10_400
    jump(1000)
    getThrottledResult(state, player.planets, Date.now(), compute)
    expect(compute).toHaveBeenCalledTimes(1)
    from.resources.metal = 10_600
    jump(1000)
    getThrottledResult(state, player.planets, Date.now(), compute)
    expect(compute).toHaveBeenCalledTimes(2)
    expect(state.lastSnapshot!.planets.from!.metal).toBe(10_600)
  })

  it('recomputes after six seconds without resource changes', () => {
    const { player } = setup()
    const state = createTransportThrottleState<string[]>()
    const compute = vi.fn(() => ['result'])
    getThrottledResult(state, player.planets, Date.now(), compute)
    jump(6000)
    getThrottledResult(state, player.planets, Date.now(), compute)
    expect(compute).toHaveBeenCalledTimes(2)
    expect(state.lastCalculatedAt).toBe(Date.now())
  })

  it.each(['add', 'remove'])('recomputes when planets change: %s', change => {
    const { player } = setup()
    const state = createTransportThrottleState<string[]>()
    const compute = vi.fn(() => ['result'])
    getThrottledResult(state, player.planets, Date.now(), compute)
    if (change === 'add') player.planets.push(monitoringPlanet({ id: 'new' }))
    else player.planets.pop()
    jump(1000)
    getThrottledResult(state, player.planets, Date.now(), compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('forces computation when the cached result is null despite a fresh snapshot', () => {
    const { player } = setup()
    const state = createTransportThrottleState<string[]>()
    state.lastSnapshot = snapshotTransportInputs(player.planets)
    state.lastCalculatedAt = Date.now()
    const compute = vi.fn(() => ['result'])
    expect(getThrottledResult(state, player.planets, Date.now(), compute)).toEqual(['result'])
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('does not update the cached state when computation throws', () => {
    const { player } = setup()
    const state = createTransportThrottleState<string[]>()
    const compute = vi.fn((): string[] => { throw new Error('calculation failed') })
    expect(() => getThrottledResult(state, player.planets, Date.now(), compute)).toThrow('calculation failed')
    expect(state).toEqual({ lastSnapshot: null, lastCalculatedAt: 0, lastResult: null })
  })
})

describe('real transport suggestion integration', () => {
  it('matches direct suggestions for initial, resource-triggered and timeout recalculations', () => {
    const { from, player } = setup()
    const state = createTransportThrottleState<TransportSuggestion[]>()
    const compute = vi.fn(() => suggestTransports(player.planets, createForecastContext(player, 1, Date.now()), player))
    const direct = () => suggestTransports(player.planets, createForecastContext(player, 1, Date.now()), player)
    const first = getThrottledResult(state, player.planets, Date.now(), compute)
    expect(first.length).toBeGreaterThan(0)
    expect(first).toEqual(direct())
    jump(1000)
    expect(getThrottledResult(state, player.planets, Date.now(), compute)).toBe(first)
    expect(compute).toHaveBeenCalledTimes(1)
    from.resources.metal *= 1.2
    expect(getThrottledResult(state, player.planets, Date.now(), compute)).toEqual(direct())
    expect(compute).toHaveBeenCalledTimes(2)
    from.autopilot!.reserve.metal = from.resources.metal
    jump(6000)
    const refreshed = getThrottledResult(state, player.planets, Date.now(), compute)
    expect(refreshed).toEqual(direct())
    expect(refreshed).toEqual([])
    expect(compute).toHaveBeenCalledTimes(3)
  })
})
