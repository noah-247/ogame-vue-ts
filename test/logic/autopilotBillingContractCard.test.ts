import { describe, expect, it } from 'vitest'
import { computeHoursSupported, findInsufficientForResume } from '@/logic/autopilotBilling'

/**
 * Phase 4：副官合約卡的可測邏輯層——
 * 可支撐小時（瓶頸判定）與「恢復值班」前的餘款檢查。
 * UI 渲染按 repo 既有慣例不做元件測試。
 */

describe('computeHoursSupported', () => {
  it('per-resource floor division, bottleneck is the earliest to exhaust', () => {
    const support = computeHoursSupported(
      { metal: 100, crystal: 100, deuterium: 100 },
      { metal: 550, crystal: 320, deuterium: 1050 }
    )
    expect(support.perResource).toEqual({ metal: 5, crystal: 3, deuterium: 10 })
    expect(support.bottleneck).toBe('crystal')
    expect(support.limitingHours).toBe(3)
  })

  it('zero-rate resource is treated as infinite and never the bottleneck', () => {
    const support = computeHoursSupported(
      { metal: 100, crystal: 0, deuterium: 100 },
      { metal: 150, crystal: 0, deuterium: 400 }
    )
    expect(support.perResource.crystal).toBe(Infinity)
    expect(support.bottleneck).toBe('metal')
    expect(support.limitingHours).toBe(1)
  })

  it('all zero rates → infinite sustain', () => {
    const support = computeHoursSupported(
      { metal: 0, crystal: 0, deuterium: 0 },
      { metal: 0, crystal: 0, deuterium: 0 }
    )
    expect(support.limitingHours).toBe(Infinity)
    expect(support.perResource).toEqual({ metal: Infinity, crystal: Infinity, deuterium: Infinity })
  })

  it('ties break metal > crystal > deuterium', () => {
    const support = computeHoursSupported(
      { metal: 100, crystal: 100, deuterium: 100 },
      { metal: 200, crystal: 250, deuterium: 299 }
    )
    expect(support.bottleneck).toBe('metal')
    expect(support.limitingHours).toBe(2)
  })
})

describe('findInsufficientForResume', () => {
  it('all resources cover one hour → no missing', () => {
    expect(
      findInsufficientForResume(
        { metal: 100, crystal: 60, deuterium: 30 },
        { metal: 100, crystal: 60, deuterium: 30 }
      )
    ).toEqual([])
  })

  it('returns missing resources in metal → crystal → deuterium order', () => {
    expect(
      findInsufficientForResume(
        { metal: 100, crystal: 60, deuterium: 30 },
        { metal: 1000, crystal: 10, deuterium: 5 }
      )
    ).toEqual(['crystal', 'deuterium'])
  })

  it('zero-rate resource is skipped even when balance is zero', () => {
    expect(
      findInsufficientForResume(
        { metal: 100, crystal: 0, deuterium: 30 },
        { metal: 200, crystal: 0, deuterium: 40 }
      )
    ).toEqual([])
  })
})
