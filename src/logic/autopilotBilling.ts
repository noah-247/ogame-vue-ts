import type { AutopilotContract, Planet, Player } from '@/types/game'
import { BuildingType } from '@/types/game'
import { calculateEnergyConsumption, calculateEnergyProduction } from './resourceLogic'

/**
 * 自動成長副官付費核心邏輯（v3：三資源收費、無試用、聘請即扣）
 *
 * 純邏輯模組：無 UI、無 store 依賴，方便單元測試。
 * tick 接線、存檔遷移、UI 由後續 phase 完成。
 *
 * 金額一律用整數（微單位）避免浮點誤差：1 單位資源 = 1_000_000 微單位。
 * 費率語義：calculateRates 回傳的是「每小時」整數單位費率；
 * settleMinute 每滿 60 計費秒結算「一分鐘」的量（= 每小時費率 / 60）。
 */

export const MICRO_PER_UNIT = 1_000_000

/** 費率 = 標準時產合計 × 3% */
export const BILLING_RATE_RATIO = 0.03

/** 下限（只套用一次，帝國統一合約） */
export const MIN_METAL_RATE = 50
export const MIN_CRYSTAL_RATE = 30
export const MIN_DEUTERIUM_RATE = 15

/** 費率向上取整粒度 */
export const RATE_ROUND_STEP = 10

export interface ResourceTriple {
  metal: number
  crystal: number
  deuterium: number
}

export interface BillingPlanetInput {
  metalMineLevel: number
  crystalMineLevel: number
  deuteriumMineLevel: number
  /** 能源效率；<= 0 的星球不納入費率計算 */
  energyEfficiency: number
}

export type InsufficientResource = 'metal' | 'crystal' | 'deuterium' | null

export interface SettleResult {
  deducted: ResourceTriple
  insufficient: InsufficientResource
}

/**
 * 標準時產：金屬 1500×L×1.5^L、晶體 1000×L×1.5^L、重氫 500×L×1.5^L。
 * 同一個 mineLevel 對三種資源各算一次；呼叫方按星球的三種礦等級分別取對應欄位。
 */
export function standardHourlyOutput(mineLevel: number): ResourceTriple {
  const base = mineLevel * Math.pow(1.5, mineLevel)
  return {
    metal: 1500 * base,
    crystal: 1000 * base,
    deuterium: 500 * base
  }
}

/**
 * 單種資源的費率：合計標準時產為 0 → 0（零產能不收費）；
 * 否則 max(下限, 合計×3%) 再向上取整至 10。
 * 匯出以便直接測試下限邏輯（經由礦等級無法構造出低於下限的非零合計）。
 */
export function rateForResource(hourlySum: number, minFloor: number): number {
  if (!(hourlySum > 0)) return 0
  // 先轉微單位整數再算 3%，避免二進位制浮點誤差影響 ceil 邊界
  const rawMicro = Math.round(hourlySum * MICRO_PER_UNIT * BILLING_RATE_RATIO)
  const ceiled = Math.ceil(rawMicro / (RATE_ROUND_STEP * MICRO_PER_UNIT)) * RATE_ROUND_STEP
  return Math.max(minFloor, ceiled)
}

/**
 * 帝國統一費率：對每種資源，把「能源效率 > 0 的星球」的標準時產加總後套 rateForResource。
 * 全停電（或無星球）→ 三種全為 0。
 */
export function calculateRates(planets: BillingPlanetInput[]): ResourceTriple {
  let metalSum = 0
  let crystalSum = 0
  let deuteriumSum = 0
  for (const p of planets) {
    if (!(p.energyEfficiency > 0)) continue // 停電星球排除
    metalSum += standardHourlyOutput(p.metalMineLevel).metal
    crystalSum += standardHourlyOutput(p.crystalMineLevel).crystal
    deuteriumSum += standardHourlyOutput(p.deuteriumMineLevel).deuterium
  }
  return {
    metal: rateForResource(metalSum, MIN_METAL_RATE),
    crystal: rateForResource(crystalSum, MIN_CRYSTAL_RATE),
    deuterium: rateForResource(deuteriumSum, MIN_DEUTERIUM_RATE)
  }
}

/**
 * 副官是否處於「值班計費」狀態：只有 plan=standard 且 status=active 才算工作。
 * 免費監控（free）不計費；paused_manual / paused_funds / terminated / inactive 均不工作。
 */
export function canAutopilotWork(contract: AutopilotContract | undefined): boolean {
  return contract !== undefined && contract.plan === 'standard' && contract.status === 'active'
}

/**
 * 累加計費秒：增量 = tick 虛擬秒 × gameSpeed。
 * 不監聽速度切換事件——呼叫方每次 tick 按當前 gameSpeed 傳入即可，無競態。
 * @returns 本次新增的計費秒（同時累加進 contract.dutySecondsAcc）
 */
export function accrueBillingSeconds(
  contract: AutopilotContract,
  virtualSeconds: number,
  gameSpeed: number
): number {
  const delta = virtualSeconds * gameSpeed
  contract.dutySecondsAcc += delta
  return delta
}

/**
 * 建立一份預設（未啟用）的合約，方便呼叫方初始化。
 * - plan 預設為 'standard'；v2→v3 遷移時傳 'free'（遷移合約不自動開始計費）。
 * - status 恆為 'inactive'、autoRenew 恆為 false：不追溯、不自動重啟。
 * - needsBillingConfirm / needsBillingNotice 預設為 false，由遷移按舊存檔使用情況設定。
 */
export function createDefaultContract(
  payerPlanetId = '',
  servicePlanetIds: string[] = [],
  plan: 'free' | 'standard' = 'standard'
): AutopilotContract {
  return {
    plan,
    status: 'inactive',
    payerPlanetId,
    servicePlanetIds,
    autoRenew: false,
    accruedMicroMetal: 0,
    accruedMicroCrystal: 0,
    accruedMicroDeuterium: 0,
    dutySecondsAcc: 0,
    totalConsumedMetal: 0,
    totalConsumedCrystal: 0,
    totalConsumedDeuterium: 0,
    needsBillingConfirm: false,
    needsBillingNotice: false
  }
}

/** 舊存檔是否用過副官：任一星球 autopilot.enabled，或帝國研究副官 enabled */
export function hasLegacyAutopilotUsage(player: Player): boolean {
  if (player.planets.some(p => p.autopilot?.enabled === true)) return true
  return player.empireResearchAutopilot?.enabled === true
}

/** 舊存檔裡開過副官的星球 id（遷移時作為 servicePlanetIds） */
export function autopilotEnabledPlanetIds(player: Player): string[] {
  return player.planets.filter(p => p.autopilot?.enabled === true).map(p => p.id)
}

/** 確認門：舊存檔有用副官且 needsBillingConfirm 尚未清除 */
export function shouldShowBillingConfirm(player: Player): boolean {
  return player.autopilotContract?.needsBillingConfirm === true
}

/** 一次性新制說明：確認門使用者不重複彈（確認門文案已含新制說明） */
export function shouldShowBillingNotice(player: Player): boolean {
  const c = player.autopilotContract
  return c !== undefined && c.needsBillingNotice === true && c.needsBillingConfirm !== true
}

export type BillingConfirmChoice = 'continue' | 'pause'

/**
 * 確認門選擇（就地修改 player.autopilotContract，呼叫方負責持久化）：
 * - continue：plan → 'standard'、status → 'active'，下個 tick 開始按費率計費
 * - pause：status → 'paused_manual'，不扣款（canAutopilotWork 為 false）
 * 兩種選擇都會清除確認旗標，保證重讀不重彈。
 */
export function applyBillingConfirmation(player: Player, choice: BillingConfirmChoice): void {
  const c = player.autopilotContract
  if (!c) return
  if (choice === 'continue') {
    c.plan = 'standard'
    c.status = 'active'
  } else {
    c.status = 'paused_manual'
  }
  c.needsBillingConfirm = false
  c.needsBillingNotice = false
}

/** 一次性新制說明關閉：清除旗標，重讀不重彈 */
export function dismissBillingNotice(player: Player): void {
  const c = player.autopilotContract
  if (!c) return
  c.needsBillingNotice = false
}

/**
 * 合約卡「可支撐小時」顯示：每種資源的支撐小時 = floor(可用量 / 每小時費率)；
 * 費率為 0（零產能不收費）→ 該資源無限，不參與瓶頸判定。
 */
export interface HoursSupport {
  /** 每種資源各自可支撐的小時數（費率 0 → Infinity） */
  perResource: ResourceTriple
  /** 瓶頸資源：最先耗盡的那個（並列時 metal > crystal > deuterium；三費率全 0 → 'metal'） */
  bottleneck: 'metal' | 'crystal' | 'deuterium'
  /** 以瓶頸為準的可支撐小時數（三費率全 0 → Infinity） */
  limitingHours: number
}
export function computeHoursSupported(rates: ResourceTriple, available: ResourceTriple): HoursSupport {
  const perResource: ResourceTriple = { metal: Infinity, crystal: Infinity, deuterium: Infinity }
  const keys = ['metal', 'crystal', 'deuterium'] as const
  for (const k of keys) {
    if (rates[k] > 0) perResource[k] = Math.floor(available[k] / rates[k])
  }
  let bottleneck: 'metal' | 'crystal' | 'deuterium' = 'metal'
  for (const k of keys) {
    if (perResource[k] < perResource[bottleneck]) bottleneck = k
  }
  return { perResource, bottleneck, limitingHours: perResource[bottleneck] }
}

/**
 * 「恢復值班」前的餘款檢查（UI 級守衛）：要求付款星球三資源可用量 ≥ 一小時費率。
 * 回傳低於門檻的資源（metal → crystal → deuterium 順序）；空陣列表示足夠。
 * 費率 0 的資源跳過（零產能不收費）。不從其他星球掃——提示使用者手動補資源。
 */
export function findInsufficientForResume(
  rates: ResourceTriple,
  available: ResourceTriple
): Array<'metal' | 'crystal' | 'deuterium'> {
  const missing: Array<'metal' | 'crystal' | 'deuterium'> = []
  const keys = ['metal', 'crystal', 'deuterium'] as const
  for (const k of keys) {
    if (rates[k] > 0 && available[k] < rates[k]) missing.push(k)
  }
  return missing
}

/**
 * 星球 → 費率輸入。能源效率沿用 updatePlanetResources 的判定語義：
 * 能源產出 >= 消耗 → 1（正常生產）；否則 0（停電，費率計算時排除）。
 */
export function toBillingPlanetInput(planet: Planet, energyProductionBonus = 0): BillingPlanetInput {
  const production = calculateEnergyProduction(planet, { energyProductionBonus })
  const consumption = calculateEnergyConsumption(planet)
  return {
    metalMineLevel: planet.buildings[BuildingType.MetalMine] ?? 0,
    crystalMineLevel: planet.buildings[BuildingType.CrystalMine] ?? 0,
    deuteriumMineLevel: planet.buildings[BuildingType.DeuteriumSynthesizer] ?? 0,
    energyEfficiency: production >= consumption ? 1 : 0
  }
}

export interface BillingTickOptions {
  /** 本 tick 虛擬秒（呼叫方按本次與上次 tick 的 now 差算出，快轉/離線場景下呼叫方負責不傳） */
  virtualSeconds: number
  /** 當前 gameSpeed（呼叫方每次 tick 按當下值傳入，不監聽切換事件） */
  gameSpeed: number
  /** 是否快轉 tick：true 則跳過計費（比照離線） */
  isFastForward: boolean
  /** 服務星球的費率輸入（由 toBillingPlanetInput 構造） */
  servicePlanetInputs: BillingPlanetInput[]
  /** 付款星球的資源物件（settleMinute 成功時就地扣款） */
  payerResources: ResourceTriple
}

export interface BillingTickResult {
  /** 本 tick 結算的整分鐘數 */
  settledMinutes: number
  /** 是否因餘額不足把合約轉入 paused_funds */
  pausedForFunds: boolean
  /** 是否因 autoRenew 自動從 paused_funds 恢復為 active（當 tick 一次性事件） */
  autoResumed: boolean
}

/**
 * 合約卡「恢復值班」核心（B-1）：餘額檢查透過 → plan 設為 'standard'（恢復即接受付費制）
 * ＋ status 設為 'active'；餘額不足 → 返回缺資源清單，合約保持不動（UI 負責提示）。
 */
export function resumeBillingContract(
  contract: AutopilotContract,
  rates: ResourceTriple,
  available: ResourceTriple
): Array<'metal' | 'crystal' | 'deuterium'> {
  const missing = findInsufficientForResume(rates, available)
  if (missing.length === 0) {
    contract.plan = 'standard'
    contract.status = 'active'
  }
  return missing
}

/**
 * 副官 tick 計費編排（v3 §3）：線上普通 tick 累加計費秒（增量 = 虛擬秒 × gameSpeed），
 * 每滿 60 計費秒按當期費率結算一分鐘；快轉 tick 跳過（比照離線不收費）。
 * 任一資源餘額不足 → 合約 status 轉 paused_funds（小數累計凍結，未付的分鐘不追討），
 * 後續副官工作由執行守衛自然停止（已開工項不受影響）。
 * B-2 自動續費：合約因餘額不足暫停且 autoRenew 為 true，若付款星球已補足
 * （達到恢復值班的一小時費率門檻）→ 自動恢復 active，同 tick 繼續計費。
 */
export function processBillingTick(
  contract: AutopilotContract | undefined,
  opts: BillingTickOptions
): BillingTickResult {
  if (!contract || opts.isFastForward || !(opts.virtualSeconds > 0)) {
    return { settledMinutes: 0, pausedForFunds: false, autoResumed: false }
  }
  let autoResumed = false
  if (contract.plan === 'standard' && contract.status === 'paused_funds' && contract.autoRenew) {
    const rates = calculateRates(opts.servicePlanetInputs)
    if (findInsufficientForResume(rates, opts.payerResources).length === 0) {
      contract.status = 'active'
      autoResumed = true
    }
  }
  if (!canAutopilotWork(contract)) {
    return { settledMinutes: 0, pausedForFunds: false, autoResumed }
  }
  accrueBillingSeconds(contract, opts.virtualSeconds, opts.gameSpeed)
  let settledMinutes = 0
  let pausedForFunds = false
  while (contract.dutySecondsAcc >= 60) {
    const rates = calculateRates(opts.servicePlanetInputs)
    const result = settleMinute(contract, rates, opts.payerResources)
    contract.dutySecondsAcc -= 60
    settledMinutes++
    if (result.insufficient) {
      contract.status = 'paused_funds'
      pausedForFunds = true
      break
    }
  }
  return { settledMinutes, pausedForFunds, autoResumed }
}

/**
 * 每滿 60 計費秒結算一分鐘。
 *
 * 每種資源應扣（微單位）= 每小時費率×1e6/60 + 該資源 accruedMicro 餘數；
 * 滿 1 單位扣整數，餘數保留回 accruedMicro*（全整數運算，無浮點誤差）。
 * 成功時：從 payerResources 扣除整數單位，累加 totalConsumed*。
 * 任一資源 payer 餘額不足 → insufficient 回傳該資源（按 metal→crystal→deuterium 順序取首個），
 * 不扣任何資源、不動餘數（小數累計凍結），由呼叫方據此轉 paused_funds。
 */
export function settleMinute(
  contract: AutopilotContract,
  rates: ResourceTriple,
  payerResources: ResourceTriple
): SettleResult {
  const keys = ['metal', 'crystal', 'deuterium'] as const
  const dueUnits: ResourceTriple = { metal: 0, crystal: 0, deuterium: 0 }
  const newAccrued: ResourceTriple = { metal: 0, crystal: 0, deuterium: 0 }

  for (const k of keys) {
    const accruedKey = k === 'metal' ? 'accruedMicroMetal' : k === 'crystal' ? 'accruedMicroCrystal' : 'accruedMicroDeuterium'
    // 總應扣（微單位×60 的整數分子，避免除法浮點誤差）
    const totalMicroX60 = contract[accruedKey] * 60 + rates[k] * MICRO_PER_UNIT
    const deduct = Math.floor(totalMicroX60 / (60 * MICRO_PER_UNIT))
    const accrued = Math.floor((totalMicroX60 % (60 * MICRO_PER_UNIT)) / 60)
    dueUnits[k] = deduct
    newAccrued[k] = accrued
  }

  for (const k of keys) {
    if (payerResources[k] < dueUnits[k]) {
      return { deducted: { metal: 0, crystal: 0, deuterium: 0 }, insufficient: k }
    }
  }

  for (const k of keys) {
    payerResources[k] -= dueUnits[k]
    const accruedKey = k === 'metal' ? 'accruedMicroMetal' : k === 'crystal' ? 'accruedMicroCrystal' : 'accruedMicroDeuterium'
    const totalKey = k === 'metal' ? 'totalConsumedMetal' : k === 'crystal' ? 'totalConsumedCrystal' : 'totalConsumedDeuterium'
    contract[accruedKey] = newAccrued[k]
    contract[totalKey] += dueUnits[k]
  }
  return { deducted: dueUnits, insufficient: null }
}
