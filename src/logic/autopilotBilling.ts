import type { AutopilotContract, Planet } from '@/types/game'
import { BuildingType } from '@/types/game'
import { calculateEnergyConsumption, calculateEnergyProduction } from './resourceLogic'

/**
 * 自动成长副官付费核心逻辑（v3：三资源收費、无试用、聘请即扣）
 *
 * 纯逻辑模块：无 UI、无 store 依赖，方便单元测试。
 * tick 接线、存档迁移、UI 由后续 phase 完成。
 *
 * 金额一律用整数（微单位）避免浮点误差：1 单位资源 = 1_000_000 微单位。
 * 费率语义：calculateRates 回传的是「每小时」整数单位费率；
 * settleMinute 每满 60 计费秒结算「一分钟」的量（= 每小时费率 / 60）。
 */

export const MICRO_PER_UNIT = 1_000_000

/** 费率 = 标准时产合计 × 3% */
export const BILLING_RATE_RATIO = 0.03

/** 下限（只套用一次，帝国统一合约） */
export const MIN_METAL_RATE = 50
export const MIN_CRYSTAL_RATE = 30
export const MIN_DEUTERIUM_RATE = 15

/** 费率向上取整粒度 */
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
  /** 能源效率；<= 0 的星球不纳入费率计算 */
  energyEfficiency: number
}

export type InsufficientResource = 'metal' | 'crystal' | 'deuterium' | null

export interface SettleResult {
  deducted: ResourceTriple
  insufficient: InsufficientResource
}

/**
 * 标准时产：金属 1500×L×1.5^L、晶体 1000×L×1.5^L、重氢 500×L×1.5^L。
 * 同一个 mineLevel 对三种资源各算一次；调用方按星球的三种矿等级分别取对应字段。
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
 * 单种资源的费率：合计标准时产为 0 → 0（零产能不收费）；
 * 否则 max(下限, 合计×3%) 再向上取整至 10。
 * 导出以便直接测试下限逻辑（经由矿等级无法构造出低于下限的非零合计）。
 */
export function rateForResource(hourlySum: number, minFloor: number): number {
  if (!(hourlySum > 0)) return 0
  // 先转微单位整数再算 3%，避免二进制浮点误差影响 ceil 边界
  const rawMicro = Math.round(hourlySum * MICRO_PER_UNIT * BILLING_RATE_RATIO)
  const ceiled = Math.ceil(rawMicro / (RATE_ROUND_STEP * MICRO_PER_UNIT)) * RATE_ROUND_STEP
  return Math.max(minFloor, ceiled)
}

/**
 * 帝国统一费率：对每种资源，把「能源效率 > 0 的星球」的标准时产加总后套 rateForResource。
 * 全停电（或无星球）→ 三种全为 0。
 */
export function calculateRates(planets: BillingPlanetInput[]): ResourceTriple {
  let metalSum = 0
  let crystalSum = 0
  let deuteriumSum = 0
  for (const p of planets) {
    if (!(p.energyEfficiency > 0)) continue // 停电星球排除
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
 * 副官是否处于「值班计费」状态：只有 plan=standard 且 status=active 才算工作。
 * 免费监控（free）不计费；paused_manual / paused_funds / terminated / inactive 均不工作。
 */
export function canAutopilotWork(contract: AutopilotContract | undefined): boolean {
  return contract !== undefined && contract.plan === 'standard' && contract.status === 'active'
}

/**
 * 累加计费秒：增量 = tick 虚拟秒 × gameSpeed。
 * 不监听速度切换事件——调用方每次 tick 按当前 gameSpeed 传入即可，无竞态。
 * @returns 本次新增的计费秒（同时累加进 contract.dutySecondsAcc）
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

/** 建立一份默认（未激活）的标准合约，方便调用方初始化 */
export function createDefaultContract(payerPlanetId: string, servicePlanetIds: string[]): AutopilotContract {
  return {
    plan: 'standard',
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
    totalConsumedDeuterium: 0
  }
}

/**
 * 星球 → 费率输入。能源效率沿用 updatePlanetResources 的判定语义：
 * 能源产出 >= 消耗 → 1（正常生产）；否则 0（停电，费率计算时排除）。
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
  /** 本 tick 虚拟秒（调用方按本次与上次 tick 的 now 差算出，快转/离线场景下调用方负责不传） */
  virtualSeconds: number
  /** 当前 gameSpeed（调用方每次 tick 按当下值传入，不监听切换事件） */
  gameSpeed: number
  /** 是否快转 tick：true 则跳过计费（比照离线） */
  isFastForward: boolean
  /** 服务星球的费率输入（由 toBillingPlanetInput 构造） */
  servicePlanetInputs: BillingPlanetInput[]
  /** 付款星球的资源对象（settleMinute 成功时就地扣款） */
  payerResources: ResourceTriple
}

export interface BillingTickResult {
  /** 本 tick 结算的整分钟数 */
  settledMinutes: number
  /** 是否因余额不足把合约转入 paused_funds */
  pausedForFunds: boolean
}

/**
 * 副官 tick 计费编排（v3 §3）：在线普通 tick 累加计费秒（增量 = 虚拟秒 × gameSpeed），
 * 每满 60 计费秒按当期费率结算一分钟；快转 tick 跳过（比照离线不收费）。
 * 任一资源余额不足 → 合约 status 转 paused_funds（小数累计冻结，未付的分钟不追讨），
 * 后续副官工作由执行守卫自然停止（已开工项不受影响）。
 */
export function processBillingTick(
  contract: AutopilotContract | undefined,
  opts: BillingTickOptions
): BillingTickResult {
  if (!contract || !canAutopilotWork(contract) || opts.isFastForward || !(opts.virtualSeconds > 0)) {
    return { settledMinutes: 0, pausedForFunds: false }
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
  return { settledMinutes, pausedForFunds }
}

/**
 * 每满 60 计费秒结算一分钟。
 *
 * 每种资源应扣（微单位）= 每小时费率×1e6/60 + 该资源 accruedMicro 余数；
 * 满 1 单位扣整数，余数保留回 accruedMicro*（全整数运算，无浮点误差）。
 * 成功时：从 payerResources 扣除整数单位，累加 totalConsumed*。
 * 任一资源 payer 余额不足 → insufficient 回传该资源（按 metal→crystal→deuterium 顺序取首个），
 * 不扣任何资源、不动余数（小数累计冻结），由调用方据此转 paused_funds。
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
    // 总应扣（微单位×60 的整数分子，避免除法浮点误差）
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
