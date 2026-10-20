import { describe, expect, it } from 'vitest'
import {
  accrueBillingSeconds,
  calculateRates,
  canAutopilotWork,
  createDefaultContract,
  processBillingTick,
  rateForResource,
  resumeBillingContract,
  settleMinute,
  standardHourlyOutput
} from '@/logic/autopilotBilling'
import type { AutopilotContract } from '@/types/game'
import type { ResourceTriple } from '@/logic/autopilotBilling'

const mkContract = (over: Partial<AutopilotContract> = {}): AutopilotContract => ({
  ...createDefaultContract('p1', ['p1']),
  ...over
})

describe('standardHourlyOutput', () => {
  it('1 級礦：金屬 2250 / 晶體 1500 / 重氫 750', () => {
    expect(standardHourlyOutput(1)).toEqual({ metal: 2250, crystal: 1500, deuterium: 750 })
  })
  it('10 級金屬標準時產 ≈ 864975.59', () => {
    expect(standardHourlyOutput(10).metal).toBeCloseTo(864975.5859375, 6)
  })
})

describe('rateForResource（單資源費率）', () => {
  it('合計為 0 → 費率 0（零產能不收費）', () => {
    expect(rateForResource(0, 50)).toBe(0)
    expect(rateForResource(-10, 50)).toBe(0)
  })
  it('下限：合計×3% 低於下限時取下限 50/30/15', () => {
    expect(rateForResource(100, 50)).toBe(50) // 100×3%=3 → ceil10=10 → max=50
    expect(rateForResource(100, 30)).toBe(30)
    expect(rateForResource(100, 15)).toBe(15)
  })
  it('3% 公式：1 級礦 → 70/50/30', () => {
    expect(rateForResource(2250, 50)).toBe(70)
    expect(rateForResource(1500, 30)).toBe(50)
    expect(rateForResource(750, 15)).toBe(30)
  })
  it('向上取整至 10：202.5→210、455.625→460', () => {
    expect(rateForResource(6750, 50)).toBe(210)
    expect(rateForResource(15187.5, 50)).toBe(460)
  })
  it('20 級礦按公式 = 2992740/1995160/997580（精確有理數驗算）', () => {
    expect(rateForResource(standardHourlyOutput(20).metal, 50)).toBe(2992740)
    expect(rateForResource(standardHourlyOutput(20).crystal, 30)).toBe(1995160)
    expect(rateForResource(standardHourlyOutput(20).deuterium, 15)).toBe(997580)
  })
})

describe('calculateRates（多星球合計）', () => {
  it('單星球 1 級礦 → 70/50/30', () => {
    expect(
      calculateRates([{ metalMineLevel: 1, crystalMineLevel: 1, deuteriumMineLevel: 1, energyEfficiency: 1 }])
    ).toEqual({ metal: 70, crystal: 50, deuterium: 30 })
  })
  it('多星球合計：兩顆 1 級星球金屬合計 4500 → 140', () => {
    const p = { metalMineLevel: 1, crystalMineLevel: 1, deuteriumMineLevel: 1, energyEfficiency: 1 }
    expect(calculateRates([p, p]).metal).toBe(140) // 4500×3%=135 → 140
  })
  it('零產能 → 0：空列表、全 0 級礦', () => {
    expect(calculateRates([])).toEqual({ metal: 0, crystal: 0, deuterium: 0 })
    expect(
      calculateRates([{ metalMineLevel: 0, crystalMineLevel: 0, deuteriumMineLevel: 0, energyEfficiency: 1 }])
    ).toEqual({ metal: 0, crystal: 0, deuterium: 0 })
  })
  it('全停電 → 三種全 0', () => {
    expect(
      calculateRates([{ metalMineLevel: 20, crystalMineLevel: 20, deuteriumMineLevel: 20, energyEfficiency: 0 }])
    ).toEqual({ metal: 0, crystal: 0, deuterium: 0 })
  })
  it('停電星球被排除：20 級停電 + 1 級正常 = 只算 1 級', () => {
    expect(
      calculateRates([
        { metalMineLevel: 20, crystalMineLevel: 20, deuteriumMineLevel: 20, energyEfficiency: 0 },
        { metalMineLevel: 1, crystalMineLevel: 1, deuteriumMineLevel: 1, energyEfficiency: 1 }
      ])
    ).toEqual({ metal: 70, crystal: 50, deuterium: 30 })
  })
})

describe('canAutopilotWork', () => {
  it('只有 standard + active 算值班中', () => {
    expect(canAutopilotWork(mkContract({ plan: 'standard', status: 'active' }))).toBe(true)
  })
  it('免費監控不算工作；暫停/終止/未啟用不算；無合約不算', () => {
    expect(canAutopilotWork(mkContract({ plan: 'free', status: 'active' }))).toBe(false)
    expect(canAutopilotWork(mkContract({ plan: 'standard', status: 'paused_manual' }))).toBe(false)
    expect(canAutopilotWork(mkContract({ plan: 'standard', status: 'paused_funds' }))).toBe(false)
    expect(canAutopilotWork(mkContract({ plan: 'standard', status: 'terminated' }))).toBe(false)
    expect(canAutopilotWork(mkContract({ plan: 'standard', status: 'inactive' }))).toBe(false)
    expect(canAutopilotWork(undefined)).toBe(false)
  })
})

describe('accrueBillingSeconds', () => {
  it('計費秒 = 虛擬秒 × gameSpeed，並累加到 dutySecondsAcc', () => {
    const c = mkContract()
    expect(accrueBillingSeconds(c, 10, 3)).toBe(30)
    expect(c.dutySecondsAcc).toBe(30)
  })
  it('速度切換無競態：按每次 tick 的當前 gameSpeed 直接計算', () => {
    const c = mkContract()
    accrueBillingSeconds(c, 60, 1)
    accrueBillingSeconds(c, 60, 10)
    expect(c.dutySecondsAcc).toBe(660)
  })
})

describe('settleMinute', () => {
  it('分鐘結算扣整數：費率 60/時 → 每分鐘各扣 1', () => {
    const c = mkContract()
    const payer = { metal: 10, crystal: 10, deuterium: 10 }
    const r = settleMinute(c, { metal: 60, crystal: 60, deuterium: 60 }, payer)
    expect(r).toEqual({ deducted: { metal: 1, crystal: 1, deuterium: 1 }, insufficient: null })
    expect(payer).toEqual({ metal: 9, crystal: 9, deuterium: 9 })
    expect(c.accruedMicroMetal).toBe(0)
    expect(c.totalConsumedMetal).toBe(1)
  })
  it('小數餘數保留：70/時 → 每分鐘扣 1，餘 166666 微單位並跨分鐘累積', () => {
    const c = mkContract()
    const payer = { metal: 100, crystal: 100, deuterium: 100 }
    settleMinute(c, { metal: 70, crystal: 50, deuterium: 30 }, payer)
    expect(c.accruedMicroMetal).toBe(166666) // 70e6/60 = 1166666.67 → 扣 1 餘 166666
    expect(c.accruedMicroCrystal).toBe(833333) // 50e6/60 = 833333.33 → 扣 0 餘 833333
    expect(c.accruedMicroDeuterium).toBe(500000) // 30e6/60 = 500000 → 扣 0 餘 500000
    settleMinute(c, { metal: 70, crystal: 50, deuterium: 30 }, payer)
    expect(c.accruedMicroMetal).toBe(333332) // 166666 + 1166666.67 → 扣 1 餘 333332
    expect(c.totalConsumedMetal).toBe(2)
  })
  it('任一資源不足 → insufficient 且不扣任何、餘數凍結', () => {
    const c = mkContract()
    const payer = { metal: 100, crystal: 100, deuterium: 100 }
    settleMinute(c, { metal: 70, crystal: 50, deuterium: 30 }, payer) // 先累一點餘數
    const frozen = c.accruedMicroMetal
    const poor = { metal: 0, crystal: 100, deuterium: 100 }
    const r = settleMinute(c, { metal: 60, crystal: 60, deuterium: 60 }, poor)
    expect(r.insufficient).toBe('metal')
    expect(r.deducted).toEqual({ metal: 0, crystal: 0, deuterium: 0 })
    expect(poor).toEqual({ metal: 0, crystal: 100, deuterium: 100 })
    expect(c.accruedMicroMetal).toBe(frozen) // 凍結不動
    expect(c.totalConsumedMetal).toBe(1) // 只記了之前成功那次
  })
  it('多種不足時按 metal→crystal→deuterium 順序回傳首個', () => {
    const c = mkContract()
    const r = settleMinute(c, { metal: 60, crystal: 60, deuterium: 60 }, { metal: 0, crystal: 0, deuterium: 5 })
    expect(r.insufficient).toBe('metal')
    const r2 = settleMinute(c, { metal: 60, crystal: 60, deuterium: 60 }, { metal: 5, crystal: 0, deuterium: 0 })
    expect(r2.insufficient).toBe('crystal')
  })
  it('三種資源各自獨立：只有金屬有費率時只扣金屬', () => {
    const c = mkContract()
    const payer = { metal: 5, crystal: 0, deuterium: 0 }
    const r = settleMinute(c, { metal: 70, crystal: 0, deuterium: 0 }, payer)
    expect(r.insufficient).toBeNull()
    expect(r.deducted).toEqual({ metal: 1, crystal: 0, deuterium: 0 })
    expect(payer).toEqual({ metal: 4, crystal: 0, deuterium: 0 })
  })
})

describe('resumeBillingContract（B-1 暫停→恢復）', () => {
  const rates = { metal: 70, crystal: 50, deuterium: 30 }
  it('遷移暫停狀態（plan=free + paused_manual）恢復後：plan=standard、status=active、canAutopilotWork 為 true', () => {
    const contract = mkContract({ plan: 'free', status: 'paused_manual' })
    const missing = resumeBillingContract(contract, rates, { metal: 1000, crystal: 1000, deuterium: 1000 })
    expect(missing).toEqual([])
    expect(contract.plan).toBe('standard') // 恢復 = 接受付費制
    expect(contract.status).toBe('active')
    expect(canAutopilotWork(contract)).toBe(true)
  })
  it('餘額不足時不恢復：plan/status 保持不動、canAutopilotWork 為 false', () => {
    const contract = mkContract({ plan: 'free', status: 'paused_manual' })
    const missing = resumeBillingContract(contract, rates, { metal: 10, crystal: 1000, deuterium: 1000 })
    expect(missing).toEqual(['metal'])
    expect(contract.plan).toBe('free')
    expect(contract.status).toBe('paused_manual')
    expect(canAutopilotWork(contract)).toBe(false)
  })
})

describe('processBillingTick 自動續費（B-2）', () => {
  const oneLevelInputs = [
    { metalMineLevel: 1, crystalMineLevel: 1, deuteriumMineLevel: 1, energyEfficiency: 1 }
  ] // 費率 70/50/30 每小時
  const rich = (): ResourceTriple => ({ metal: 1_000_000, crystal: 1_000_000, deuterium: 1_000_000 })
  const tick = (contract: AutopilotContract, payer: ResourceTriple, isFastForward = false) =>
    processBillingTick(contract, {
      virtualSeconds: 10, gameSpeed: 6, isFastForward,
      servicePlanetInputs: oneLevelInputs, payerResources: payer
    })

  it('paused_funds + autoRenew=true + 資源補足 → 自動恢復 active 且同 tick 繼續計費', () => {
    const contract = mkContract({ status: 'paused_funds', autoRenew: true })
    const payer = rich()
    const result = tick(contract, payer)
    expect(result.autoResumed).toBe(true)
    expect(contract.status).toBe('active')
    expect(canAutopilotWork(contract)).toBe(true)
    expect(result.settledMinutes).toBe(1) // 10 虛擬秒 × 6 倍速 = 60 計費秒 → 結算 1 分鐘
    expect(payer.metal).toBe(999_999) // 恢復後正常扣款
  })
  it('paused_funds + autoRenew=false → 不自動恢復、不計費', () => {
    const contract = mkContract({ status: 'paused_funds', autoRenew: false })
    const payer = rich()
    const result = tick(contract, payer)
    expect(result.autoResumed).toBe(false)
    expect(contract.status).toBe('paused_funds')
    expect(result.settledMinutes).toBe(0)
    expect(payer).toEqual(rich())
  })
  it('paused_funds + autoRenew=true 但資源仍不足 → 不恢復、不扣款', () => {
    const contract = mkContract({ status: 'paused_funds', autoRenew: true })
    const payer: ResourceTriple = { metal: 0, crystal: 1_000_000, deuterium: 1_000_000 }
    const result = tick(contract, payer)
    expect(result.autoResumed).toBe(false)
    expect(contract.status).toBe('paused_funds')
    expect(result.settledMinutes).toBe(0)
    expect(payer.metal).toBe(0)
  })
  it('快轉 tick 不觸發自動恢復（比照離線）', () => {
    const contract = mkContract({ status: 'paused_funds', autoRenew: true })
    const payer = rich()
    const result = tick(contract, payer, true)
    expect(result.autoResumed).toBe(false)
    expect(contract.status).toBe('paused_funds')
    expect(payer).toEqual(rich())
  })
})
