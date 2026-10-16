import { afterEach, describe, expect, it, vi } from 'vitest'
import { advance, restore, setNow } from './time'

afterEach(restore)

describe('fake clock helper', () => {
  it('fixes Date.now at the requested timestamp', () => {
    setNow(1792108800000)
    expect(Date.now()).toBe(1792108800000)
    expect(vi.isFakeTimers()).toBe(true)
  })

  it('advances one hour and runs scheduled timers', () => {
    setNow(1792108800000)
    const callback = vi.fn()
    setTimeout(callback, 3600_000)

    advance(3600_000)

    expect(Date.now()).toBe(1792112400000)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('restores the real clock', () => {
    const before = Date.now()
    setNow(0)
    restore()

    expect(vi.isFakeTimers()).toBe(false)
    expect(Date.now()).toBeGreaterThanOrEqual(before)
    expect(Date.now()).toBeLessThanOrEqual(vi.getRealSystemTime())
  })
})
