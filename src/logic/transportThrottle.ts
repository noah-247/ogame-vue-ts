import type { Planet } from '@/types/game'

/** 任一星球的運輸資源相對上次計算變化超過 5% 就重算；分母至少為 1，且 0 → 正數一律重算。 */
export const TRANSPORT_RECALC_RESOURCE_CHANGE_RATIO = 0.05

/** 最多快取 5 秒；配置、艦隊等資源以外的變更也會在此期限內重新整理。 */
export const TRANSPORT_RECALC_MAX_STALE_MS = 5000

export interface TransportInputSnapshot {
  planets: Record<string, { metal: number; crystal: number; deuterium: number }>
}

const transportResources = ['metal', 'crystal', 'deuterium'] as const

export function snapshotTransportInputs(planets: Planet[]): TransportInputSnapshot {
  return {
    planets: Object.fromEntries(planets.map(planet => [planet.id, {
      metal: planet.resources.metal,
      crystal: planet.resources.crystal,
      deuterium: planet.resources.deuterium
    }]))
  }
}

export function shouldRecalculateTransports(
  last: TransportInputSnapshot | null,
  next: TransportInputSnapshot,
  lastCalculatedAt: number,
  nowMs: number
): boolean {
  if (last === null) return true
  if (!Number.isFinite(lastCalculatedAt) || !Number.isFinite(nowMs)) return true
  if (nowMs - lastCalculatedAt >= TRANSPORT_RECALC_MAX_STALE_MS) return true

  const nextPlanetIds = Object.keys(next.planets)
  if (Object.keys(last.planets).length !== nextPlanetIds.length) return true

  for (const planetId of nextPlanetIds) {
    if (!Object.prototype.hasOwnProperty.call(last.planets, planetId)) return true
    for (const resource of transportResources) {
      const previousAmount = last.planets[planetId]![resource]
      const nextAmount = next.planets[planetId]![resource]
      if (!Number.isFinite(previousAmount) || !Number.isFinite(nextAmount)) return true
      if (previousAmount === 0 && nextAmount > 0) return true
      if (Math.abs(nextAmount - previousAmount) / Math.max(previousAmount, 1) > TRANSPORT_RECALC_RESOURCE_CHANGE_RATIO) return true
    }
  }
  return false
}

export interface TransportThrottleState<T> {
  lastSnapshot: TransportInputSnapshot | null
  lastCalculatedAt: number
  lastResult: T | null
}

export function createTransportThrottleState<T>(): TransportThrottleState<T> {
  return { lastSnapshot: null, lastCalculatedAt: 0, lastResult: null }
}

export function getThrottledResult<T>(
  state: TransportThrottleState<T>,
  planets: Planet[],
  nowMs: number,
  compute: () => T
): T {
  const nextSnapshot = snapshotTransportInputs(planets)
  if (state.lastResult === null || shouldRecalculateTransports(state.lastSnapshot, nextSnapshot, state.lastCalculatedAt, nowMs)) {
    const result = compute()
    state.lastSnapshot = nextSnapshot
    state.lastCalculatedAt = nowMs
    state.lastResult = result
    return result
  }
  return state.lastResult
}
