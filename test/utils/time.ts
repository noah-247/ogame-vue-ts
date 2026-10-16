import { vi } from 'vitest'

export const HOUR = 3_600_000
export const DAY = 86_400_000

/** performance.now() is used only by UI animation in useQueueAnimation.ts; game logic uses Date.now(), so performance need not be faked. */
/** Register afterEach(restore) in every test suite that uses this clock. */
export const setNow = (timestamp: number): void => {
  vi.useFakeTimers()
  vi.setSystemTime(timestamp)
}

/** Runs scheduled timers, unlike jump(), which only changes the clock for offline settlement. */
export const advance = (milliseconds: number): void => {
  vi.advanceTimersByTime(milliseconds)
}

/** Changes system time without firing timers, even for large offline settlement steps. */
export const jump = (milliseconds: number): void => {
  if (!vi.isFakeTimers()) vi.useFakeTimers()
  vi.setSystemTime(Date.now() + milliseconds)
}

export const advanceAsync = (milliseconds: number) => vi.advanceTimersByTimeAsync(milliseconds)

export const restore = (): void => {
  vi.useRealTimers()
}
