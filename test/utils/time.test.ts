import { afterEach, describe, expect, it, vi } from 'vitest'
import { advance, advanceAsync, DAY, HOUR, jump, restore, setNow } from './time'

afterEach(restore)

describe('fake clock helper', () => {
  it.each([HOUR, 8 * HOUR, DAY])('jumps %s milliseconds without running interval callbacks', milliseconds => {
    const timestamp = 1792108800000
    setNow(timestamp)
    const callback = vi.fn()
    setInterval(callback, 1000)

    jump(milliseconds)

    expect(Date.now()).toBe(timestamp + milliseconds)
    expect(callback).not.toHaveBeenCalled()
  })

  it('enables fake timers when jumping from the real clock', () => {
    const timestamp = Date.now()

    jump(HOUR)

    expect(vi.isFakeTimers()).toBe(true)
    expect(Date.now()).toBeGreaterThanOrEqual(timestamp + HOUR)
    expect(Date.now()).toBeLessThanOrEqual(vi.getRealSystemTime() + HOUR)
  })

  it('advances asynchronously and runs a one-hour timeout once', async () => {
    setNow(1792108800000)
    const callback = vi.fn()
    setTimeout(callback, HOUR)

    await advanceAsync(HOUR)

    expect(callback).toHaveBeenCalledOnce()
  })

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
