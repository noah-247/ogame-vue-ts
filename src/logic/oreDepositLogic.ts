/**
 * 礦脈儲量邏輯
 * 處理星球礦脈儲量的生成、消耗和效率計算
 */

import type { Planet, OreDeposits } from '@/types/game'
import { ORE_DEPOSIT_CONFIG } from '@/config/gameConfig'

/**
 * 礦脈上限加成配置
 */
export const ORE_CAPACITY_BONUS = {
  // 深層鑽探設施：每級增加20%礦脈上限
  DEEP_DRILLING_BONUS_PER_LEVEL: 0.2,
  // 採礦技術：每級增加15%礦脈上限（全域性）
  MINING_TECH_BONUS_PER_LEVEL: 0.15
}

/**
 * 計算深層鑽探設施的礦脈上限加成
 * @param deepDrillingLevel 深層鑽探設施等級
 * @returns 加成倍數（1 + 等級 * 0.2）
 */
export const calculateDeepDrillingBonus = (deepDrillingLevel: number): number => {
  return 1 + deepDrillingLevel * ORE_CAPACITY_BONUS.DEEP_DRILLING_BONUS_PER_LEVEL
}

/**
 * 計算採礦技術的礦脈上限加成
 * @param miningTechLevel 採礦技術等級
 * @returns 加成倍數（1 + 等級 * 0.15）
 */
export const calculateMiningTechBonus = (miningTechLevel: number): number => {
  return 1 + miningTechLevel * ORE_CAPACITY_BONUS.MINING_TECH_BONUS_PER_LEVEL
}

/**
 * 根據星球位置動態計算基礎儲量上限（不含建築/科技加成）
 * 這樣修改配置後，所有星球的上限都會自動更新
 */
export const calculateInitialDeposits = (
  position:
    | {
        galaxy: number
        system: number
        position: number
      }
    | undefined
): { metal: number; crystal: number; deuterium: number } => {
  const { BASE_DEPOSITS, POSITION_MULTIPLIERS, GALAXY_MULTIPLIER } = ORE_DEPOSIT_CONFIG

  // 防禦性檢查：如果position無效，返回預設值（位置8，銀河系1）
  if (!position || typeof position.position !== 'number' || typeof position.galaxy !== 'number') {
    console.warn('[OreDeposits] Invalid position, using defaults:', position)
    return {
      metal: BASE_DEPOSITS.metal,
      crystal: BASE_DEPOSITS.crystal,
      deuterium: BASE_DEPOSITS.deuterium
    }
  }

  // 位置索引 (0-14)
  const posIndex = Math.max(0, Math.min(14, position.position - 1))

  // 銀河系加成 (銀河系1為基礎，每增加1個銀河系增加5%)
  const galaxyBonus = 1 + (position.galaxy - 1) * GALAXY_MULTIPLIER

  // 計算每種資源的儲量上限（不含隨機浮動，確保一致性）
  const metal = Math.floor(BASE_DEPOSITS.metal * (POSITION_MULTIPLIERS.metal[posIndex] ?? 1) * galaxyBonus)
  const crystal = Math.floor(BASE_DEPOSITS.crystal * (POSITION_MULTIPLIERS.crystal[posIndex] ?? 1) * galaxyBonus)
  const deuterium = Math.floor(BASE_DEPOSITS.deuterium * (POSITION_MULTIPLIERS.deuterium[posIndex] ?? 1) * galaxyBonus)

  return { metal, crystal, deuterium }
}

/**
 * 計算帶有建築和科技加成的礦脈儲量上限
 * @param position 星球位置
 * @param deepDrillingLevel 深層鑽探設施等級（星球級）
 * @param miningTechLevel 採礦技術等級（全域性）
 * @returns 包含加成的儲量上限
 */
export const calculateEnhancedDeposits = (
  position: { galaxy: number; system: number; position: number } | undefined,
  deepDrillingLevel: number = 0,
  miningTechLevel: number = 0
): { metal: number; crystal: number; deuterium: number; bonusMultiplier: number } => {
  const baseDeposits = calculateInitialDeposits(position)

  // 計算總加成倍數
  const deepDrillingBonus = calculateDeepDrillingBonus(deepDrillingLevel)
  const miningTechBonus = calculateMiningTechBonus(miningTechLevel)
  const totalBonus = deepDrillingBonus * miningTechBonus

  return {
    metal: Math.floor(baseDeposits.metal * totalBonus),
    crystal: Math.floor(baseDeposits.crystal * totalBonus),
    deuterium: Math.floor(baseDeposits.deuterium * totalBonus),
    bonusMultiplier: totalBonus
  }
}

/**
 * 根據星球位置生成初始礦脈儲量
 */
export const generateOreDeposits = (position: { galaxy: number; system: number; position: number }): OreDeposits => {
  const initialDeposits = calculateInitialDeposits(position)

  return {
    metal: initialDeposits.metal,
    crystal: initialDeposits.crystal,
    deuterium: initialDeposits.deuterium,
    position: { ...position }
  }
}

/**
 * 計算礦脈儲量對產量的效率係數
 * 當儲量低於衰減閾值時，產量會線性下降
 * 但即使耗盡也保留最低產量（MIN_PRODUCTION_EFFICIENCY）
 * @returns MIN_PRODUCTION_EFFICIENCY-1 之間的效率係數
 */
export const calculateDepositEfficiency = (deposits: OreDeposits | undefined, resourceType: 'metal' | 'crystal' | 'deuterium'): number => {
  if (!deposits) return 1 // 沒有儲量資料時返回滿效率（向後相容）

  const { DECAY_START_THRESHOLD, MIN_PRODUCTION_EFFICIENCY } = ORE_DEPOSIT_CONFIG

  const currentDeposit = deposits[resourceType]
  const initialDeposits = calculateInitialDeposits(deposits.position)
  const initialDeposit = initialDeposits[resourceType]

  // 如果初始儲量為0，返回最低效率（避免除以0）
  if (initialDeposit <= 0) return MIN_PRODUCTION_EFFICIENCY

  // 計算剩餘百分比
  const remainingPercentage = currentDeposit / initialDeposit

  // 如果高於衰減閾值，返回滿效率
  if (remainingPercentage >= DECAY_START_THRESHOLD) return 1

  // 如果已耗盡，返回最低效率（保底產量）
  if (currentDeposit <= 0) return MIN_PRODUCTION_EFFICIENCY

  // 在衰減閾值以下，線性衰減
  // 從 DECAY_START_THRESHOLD 到 0，效率從 1 降到 MIN_PRODUCTION_EFFICIENCY
  const decayRange = 1 - MIN_PRODUCTION_EFFICIENCY
  const decayProgress = remainingPercentage / DECAY_START_THRESHOLD
  return MIN_PRODUCTION_EFFICIENCY + decayRange * decayProgress
}

/**
 * 消耗礦脈儲量
 * @param deposits 礦脈儲量物件
 * @param resourceType 資源型別
 * @param amount 要消耗的量
 * @returns 實際消耗的量（不會超過剩餘儲量）
 */
export const consumeDeposit = (deposits: OreDeposits, resourceType: 'metal' | 'crystal' | 'deuterium', amount: number): number => {
  const currentDeposit = deposits[resourceType]
  const actualConsumption = Math.min(currentDeposit, amount)

  deposits[resourceType] = Math.max(0, currentDeposit - actualConsumption)

  return actualConsumption
}

/**
 * 獲取礦脈剩餘百分比
 */
export const getDepositPercentage = (deposits: OreDeposits | undefined, resourceType: 'metal' | 'crystal' | 'deuterium'): number => {
  if (!deposits) return 100
  // 如果沒有position資訊，返回100%（向後相容舊資料）
  if (!deposits.position) return 100

  const currentDeposit = deposits[resourceType]
  const initialDeposits = calculateInitialDeposits(deposits.position)
  const initialDeposit = initialDeposits[resourceType]

  if (initialDeposit <= 0) return 0

  return (currentDeposit / initialDeposit) * 100
}

/**
 * 檢查礦脈是否處於警告狀態（低於警告閾值）
 */
export const isDepositWarning = (deposits: OreDeposits | undefined, resourceType: 'metal' | 'crystal' | 'deuterium'): boolean => {
  if (!deposits) return false

  const percentage = getDepositPercentage(deposits, resourceType)
  return percentage < ORE_DEPOSIT_CONFIG.WARNING_THRESHOLD * 100 && percentage > 0
}

/**
 * 檢查礦脈是否已耗盡
 */
export const isDepositDepleted = (deposits: OreDeposits | undefined, resourceType: 'metal' | 'crystal' | 'deuterium'): boolean => {
  if (!deposits) return false
  return deposits[resourceType] <= 0
}

/**
 * 為現有星球遷移/初始化礦脈儲量
 * 如果星球沒有礦脈資料，則生成新的儲量
 * 如果有礦脈資料但缺少position，則補充position資訊
 */
export const migrateOreDeposits = (planet: Planet): void => {
  // 月球不需要礦脈（沒有采礦建築）
  if (planet.isMoon) return

  if (!planet.oreDeposits) {
    planet.oreDeposits = generateOreDeposits(planet.position)
  } else if (!planet.oreDeposits.position) {
    // 舊資料遷移：補充position資訊
    planet.oreDeposits.position = { ...planet.position }
  }
}

/**
 * 計算預計耗盡時間（小時）
 * @param deposits 礦脈儲量
 * @param resourceType 資源型別
 * @param productionPerHour 每小時產量
 * @returns 預計耗盡時間（小時），如果產量為0則返回Infinity
 */
export const calculateDepletionTime = (
  deposits: OreDeposits | undefined,
  resourceType: 'metal' | 'crystal' | 'deuterium',
  productionPerHour: number
): number => {
  if (!deposits || productionPerHour <= 0) return Infinity

  const currentDeposit = deposits[resourceType]
  if (currentDeposit <= 0) return 0

  return currentDeposit / productionPerHour
}

/**
 * 格式化耗盡時間為可讀字串
 */
export const formatDepletionTime = (hours: number): string => {
  if (!isFinite(hours) || hours < 0) return '∞'
  if (hours === 0) return '0'

  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)

  if (days > 365) {
    const years = Math.floor(days / 365)
    return `${years}y+`
  }

  if (days > 0) {
    return `${days}d ${remainingHours}h`
  }

  if (hours < 1) {
    const minutes = Math.floor(hours * 60)
    return `${minutes}m`
  }

  return `${remainingHours}h`
}

/**
 * 計算地質研究站帶來的恢復速率加成
 * @param geoStationLevel 地質研究站等級
 * @returns 恢復速率倍數（1 + 等級 * 0.1）
 */
export const calculateGeoStationBonus = (geoStationLevel: number): number => {
  // 每級地質研究站增加50%恢復速度
  // 0級 = 1倍, 1級 = 1.5倍, 2級 = 2倍, ..., 10級 = 6倍
  return 1 + geoStationLevel * 0.1
}

/**
 * 恢復礦脈儲量
 * 礦脈會隨時間緩慢恢復，模擬地質活動
 * @param deposits 礦脈儲量物件
 * @param hoursElapsed 經過的小時數
 * @param geoStationLevel 地質研究站等級（可選，影響恢復速度）
 * @param deepDrillingLevel 深層鑽探設施等級（可選，影響恢復上限）
 * @param miningTechLevel 採礦技術等級（可選，影響恢復上限）
 */
export const regenerateDeposits = (
  deposits: OreDeposits,
  hoursElapsed: number,
  geoStationLevel: number = 0,
  deepDrillingLevel: number = 0,
  miningTechLevel: number = 0
): void => {
  const { REGENERATION } = ORE_DEPOSIT_CONFIG

  if (!REGENERATION.ENABLED || hoursElapsed <= 0) return

  // 計算地質研究站加成
  const geoBonus = calculateGeoStationBonus(geoStationLevel)

  // 計算帶有建築和科技加成的儲量上限
  const enhancedDeposits = calculateEnhancedDeposits(deposits.position, deepDrillingLevel, miningTechLevel)

  // 計算恢復量（基於增強後儲量的百分比，乘以地質研究站加成）
  const regenRate = REGENERATION.RATE_PER_HOUR * hoursElapsed * geoBonus
  const maxPercentage = REGENERATION.MAX_PERCENTAGE

  // 恢復每種資源
  const metalRegen = enhancedDeposits.metal * regenRate
  const crystalRegen = enhancedDeposits.crystal * regenRate
  const deuteriumRegen = enhancedDeposits.deuterium * regenRate

  // 新增恢復量，但不超過增強後儲量的最大百分比
  deposits.metal = Math.min(enhancedDeposits.metal * maxPercentage, deposits.metal + metalRegen)
  deposits.crystal = Math.min(enhancedDeposits.crystal * maxPercentage, deposits.crystal + crystalRegen)
  deposits.deuterium = Math.min(enhancedDeposits.deuterium * maxPercentage, deposits.deuterium + deuteriumRegen)
}

/**
 * 獲取礦脈恢復狀態資訊
 * @param deposits 礦脈儲量
 * @param geoStationLevel 地質研究站等級（可選，影響恢復時間計算）
 * @param deepDrillingLevel 深層鑽探設施等級（可選，影響恢復上限）
 * @param miningTechLevel 採礦技術等級（可選，影響恢復上限）
 */
export const getRegenerationInfo = (
  deposits: OreDeposits | undefined,
  geoStationLevel: number = 0,
  deepDrillingLevel: number = 0,
  miningTechLevel: number = 0
): {
  metalRecovering: boolean
  crystalRecovering: boolean
  deuteriumRecovering: boolean
  hoursToFullMetal: number
  hoursToFullCrystal: number
  hoursToFullDeuterium: number
  geoStationBonus: number // 地質研究站加成倍數
} => {
  const geoBonus = calculateGeoStationBonus(geoStationLevel)

  if (!deposits) {
    return {
      metalRecovering: false,
      crystalRecovering: false,
      deuteriumRecovering: false,
      hoursToFullMetal: 0,
      hoursToFullCrystal: 0,
      hoursToFullDeuterium: 0,
      geoStationBonus: geoBonus
    }
  }

  // 計算帶有建築和科技加成的儲量上限
  const enhancedDeposits = calculateEnhancedDeposits(deposits.position, deepDrillingLevel, miningTechLevel)

  const { REGENERATION } = ORE_DEPOSIT_CONFIG
  const maxPercentage = REGENERATION.MAX_PERCENTAGE
  // 實際恢復速率 = 基礎速率 * 地質研究站加成
  const ratePerHour = REGENERATION.RATE_PER_HOUR * geoBonus

  const metalMax = enhancedDeposits.metal * maxPercentage
  const crystalMax = enhancedDeposits.crystal * maxPercentage
  const deuteriumMax = enhancedDeposits.deuterium * maxPercentage

  const metalRecovering = deposits.metal < metalMax
  const crystalRecovering = deposits.crystal < crystalMax
  const deuteriumRecovering = deposits.deuterium < deuteriumMax

  // 計算恢復到滿需要的小時數（考慮地質研究站加成）
  const hoursToFullMetal = metalRecovering ? (metalMax - deposits.metal) / (enhancedDeposits.metal * ratePerHour) : 0
  const hoursToFullCrystal = crystalRecovering ? (crystalMax - deposits.crystal) / (enhancedDeposits.crystal * ratePerHour) : 0
  const hoursToFullDeuterium = deuteriumRecovering ? (deuteriumMax - deposits.deuterium) / (enhancedDeposits.deuterium * ratePerHour) : 0

  return {
    metalRecovering,
    crystalRecovering,
    deuteriumRecovering,
    hoursToFullMetal,
    hoursToFullCrystal,
    hoursToFullDeuterium,
    geoStationBonus: geoBonus
  }
}
