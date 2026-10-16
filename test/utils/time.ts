import { vi } from 'vitest'

/** Register afterEach(restore) in every test suite that uses this clock. */
export const setNow = (timestamp: number): void => {
  vi.useFakeTimers()
  vi.setSystemTime(timestamp)
}

export const advance = (milliseconds: number): void => {
  vi.advanceTimersByTime(milliseconds)
}

export const restore = (): void => {
  vi.useRealTimers()
}
