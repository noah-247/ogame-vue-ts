import { getGameNow } from './gameTime'
import type { Planet, Resources } from '@/types/game'
import { BuildingType, ShipType, DefenseType } from '@/types/game'
import { MOON_CONFIG, FLEET_STORAGE_CONFIG } from '@/config/gameConfig'
import { generateId } from '@/utils/id'

/**
 * 計算月球生成機率
 * OGame規則：每100,000殘骸(金屬+晶體) = 1%機率，最高20%（需要2,000,000殘骸）
 * @param debrisField 戰鬥產生的殘骸場
 * @returns 生成機率（0-20）
 */
export const calculateMoonGenerationChance = (debrisField: Resources): number => {
  const totalDebris = debrisField.metal + debrisField.crystal

  // 殘骸不足最小值，無法生成月球
  if (totalDebris < MOON_CONFIG.minDebrisField) {
    return 0
  }

  // 計算機率：每100k殘骸 = 1%
  const chance = Math.floor(totalDebris / MOON_CONFIG.chancePerDebris)

  // 限制在最大機率內（20%）
  return Math.min(chance, MOON_CONFIG.maxChance)
}

/**
 * 計算月球直徑
 * OGame規則：直徑基於生成時的moonchance，20%機率保證直徑>8000km
 * @param moonChance 月球生成機率（1-20）
 * @returns 月球直徑(km)
 */
export const calculateMoonDiameter = (moonChance: number): number => {
  // 基礎直徑 + 每%機率增加的直徑 + 隨機波動
  const baseDiameter = MOON_CONFIG.baseDiameter
  const bonusDiameter = moonChance * MOON_CONFIG.diameterPerChance
  // 新增±10%的隨機波動
  const randomFactor = 0.9 + Math.random() * 0.2
  const diameter = Math.floor((baseDiameter + bonusDiameter) * randomFactor)

  // 確保在合理範圍內
  return Math.max(MOON_CONFIG.minDiameter, Math.min(MOON_CONFIG.maxDiameter, diameter))
}

/**
 * 嘗試生成月球
 * OGame規則：
 * - 每100k殘骸 = 1%機率
 * - 最高20%機率（需要2M殘骸）
 * - 月球初始只有1格空間
 * - 直徑基於moonchance計算
 *
 * @param debrisField 戰鬥產生的殘骸場
 * @param planetPosition 星球座標
 * @param planetId 母星ID
 * @param playerId 玩家ID
 * @returns 生成的月球物件，如果未生成則返回null
 */
export const tryGenerateMoon = (
  debrisField: Resources,
  planetPosition: { galaxy: number; system: number; position: number },
  planetId: string,
  playerId: string
): Planet | null => {
  const chance = calculateMoonGenerationChance(debrisField)

  // 無法生成
  if (chance === 0) {
    return null
  }

  // 隨機判斷是否生成
  const roll = Math.random() * 100
  if (roll >= chance) {
    return null
  }

  // 計算月球直徑
  const diameter = calculateMoonDiameter(chance)

  // 生成月球
  const moon: Planet = {
    id: generateId('moon'),
    name: `Moon [${planetPosition.galaxy}:${planetPosition.system}:${planetPosition.position}]`,
    ownerId: playerId,
    position: planetPosition,
    resources: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    buildings: {} as Record<BuildingType, number>,
    fleet: {
      [ShipType.LightFighter]: 0,
      [ShipType.HeavyFighter]: 0,
      [ShipType.Cruiser]: 0,
      [ShipType.Battleship]: 0,
      [ShipType.Battlecruiser]: 0,
      [ShipType.Bomber]: 0,
      [ShipType.Destroyer]: 0,
      [ShipType.SmallCargo]: 0,
      [ShipType.LargeCargo]: 0,
      [ShipType.ColonyShip]: 0,
      [ShipType.Recycler]: 0,
      [ShipType.EspionageProbe]: 0,
      [ShipType.SolarSatellite]: 0,
      [ShipType.DarkMatterHarvester]: 0,
      [ShipType.Deathstar]: 0
    },
    defense: {
      [DefenseType.RocketLauncher]: 0,
      [DefenseType.LightLaser]: 0,
      [DefenseType.HeavyLaser]: 0,
      [DefenseType.GaussCannon]: 0,
      [DefenseType.IonCannon]: 0,
      [DefenseType.PlasmaTurret]: 0,
      [DefenseType.SmallShieldDome]: 0,
      [DefenseType.LargeShieldDome]: 0,
      [DefenseType.AntiBallisticMissile]: 0,
      [DefenseType.InterplanetaryMissile]: 0,
      [DefenseType.PlanetaryShield]: 0
    },
    buildQueue: [],
    waitingBuildQueue: [], // 等待佇列
    lastUpdate: getGameNow(),
    maxSpace: MOON_CONFIG.baseFields, // OGame規則：月球初始只有1格空間
    maxFleetStorage: FLEET_STORAGE_CONFIG.baseStorage,
    isMoon: true,
    parentPlanetId: planetId,
    diameter: diameter // 月球直徑(km)
  }

  // 初始化所有建築為0級
  Object.values(BuildingType).forEach(building => {
    moon.buildings[building] = 0
  })

  return moon
}

/**
 * 檢查座標是否已有月球
 * @param planets 所有星球列表
 * @param position 座標
 * @returns 是否已有月球
 */
export const hasMoonAtPosition = (planets: Planet[], position: { galaxy: number; system: number; position: number }): boolean => {
  return planets.some(
    p =>
      p.isMoon &&
      p.position.galaxy === position.galaxy &&
      p.position.system === position.system &&
      p.position.position === position.position
  )
}

/**
 * 月球銷燬結果型別
 */
export interface MoonDestructionResult {
  moonDestroyed: boolean // 月球是否被銷燬
  deathstarsDestroyed: boolean // 死星是否被反向銷燬
  moonDestructionChance: number // 月球銷燬機率
  deathstarDestructionChance: number // 死星被銷燬機率
}

/**
 * 計算月球銷燬機率
 * OGame規則：銷燬機率 = (100 - √diameter) × √deathstars
 * @param moonDiameter 月球直徑(km)
 * @param deathstarCount 死星數量
 * @returns 銷燬機率(0-100)
 */
export const calculateMoonDestructionChance = (moonDiameter: number, deathstarCount: number): number => {
  if (deathstarCount <= 0) return 0

  // 公式：(100 - √diameter) × √deathstars
  const chance = (100 - Math.sqrt(moonDiameter)) * Math.sqrt(deathstarCount)

  // 限制在0-100之間
  return Math.max(0, Math.min(100, chance))
}

/**
 * 計算死星被反向銷燬的機率
 * OGame規則：反向銷燬機率 = √diameter / 2
 * @param moonDiameter 月球直徑(km)
 * @returns 死星被銷燬機率(0-100)
 */
export const calculateDeathstarDestructionChance = (moonDiameter: number): number => {
  // 公式：√diameter / 2
  const chance = Math.sqrt(moonDiameter) / 2

  // 限制在0-100之間
  return Math.max(0, Math.min(100, chance))
}

/**
 * 嘗試銷燬月球（死星攻擊月球時呼叫）
 * OGame規則：
 * - 死星攻擊月球時，先進行正常戰鬥
 * - 戰鬥後，如果死星存活，則判定月球銷燬
 * - 月球銷燬機率 = (100 - √diameter) × √deathstars
 * - 死星反向銷燬機率 = √diameter / 2
 * - 兩個機率獨立判定
 *
 * @param moon 目標月球
 * @param deathstarCount 攻擊的死星數量
 * @returns 銷燬結果
 */
export const tryDestroyMoon = (moon: Planet, deathstarCount: number): MoonDestructionResult => {
  if (!moon.isMoon || deathstarCount <= 0) {
    return {
      moonDestroyed: false,
      deathstarsDestroyed: false,
      moonDestructionChance: 0,
      deathstarDestructionChance: 0
    }
  }

  const diameter = moon.diameter || MOON_CONFIG.minDiameter

  // 計算機率
  const moonDestructionChance = calculateMoonDestructionChance(diameter, deathstarCount)
  const deathstarDestructionChance = calculateDeathstarDestructionChance(diameter)

  // 獨立判定
  const moonRoll = Math.random() * 100
  const deathstarRoll = Math.random() * 100

  const moonDestroyed = moonRoll < moonDestructionChance
  const deathstarsDestroyed = deathstarRoll < deathstarDestructionChance

  return {
    moonDestroyed,
    deathstarsDestroyed,
    moonDestructionChance,
    deathstarDestructionChance
  }
}

/**
 * 計算感測器陣列掃描範圍
 * OGame規則：範圍 = level² - 1 個星系
 * @param sensorPhalanxLevel 感測器陣列等級
 * @returns 可掃描的星系範圍（單向）
 */
export const calculateSensorPhalanxRange = (sensorPhalanxLevel: number): number => {
  if (sensorPhalanxLevel <= 0) return 0
  return sensorPhalanxLevel * sensorPhalanxLevel - 1
}

/**
 * 檢查目標座標是否在感測器陣列掃描範圍內
 * @param moonPosition 月球座標
 * @param targetPosition 目標座標
 * @param sensorPhalanxLevel 感測器陣列等級
 * @returns 是否在掃描範圍內
 */
export const isInSensorPhalanxRange = (
  moonPosition: { galaxy: number; system: number; position: number },
  targetPosition: { galaxy: number; system: number; position: number },
  sensorPhalanxLevel: number
): boolean => {
  // 必須在同一銀河系
  if (moonPosition.galaxy !== targetPosition.galaxy) return false

  const range = calculateSensorPhalanxRange(sensorPhalanxLevel)
  const systemDistance = Math.abs(moonPosition.system - targetPosition.system)

  return systemDistance <= range
}

/**
 * 檢查跳躍門是否可用（冷卻是否結束）
 * OGame規則：跳躍門使用後有1小時冷卻時間
 * @param moon 月球物件
 * @returns 是否可以使用跳躍門
 */
export const isJumpGateReady = (moon: Planet): boolean => {
  if (!moon.isMoon) return false
  if (!moon.buildings[BuildingType.JumpGate] || moon.buildings[BuildingType.JumpGate] <= 0) return false

  const lastUsed = moon.jumpGateLastUsed || 0
  const cooldownEnd = lastUsed + MOON_CONFIG.jumpGateCooldown

  return Date.now() >= cooldownEnd
}

/**
 * 獲取跳躍門剩餘冷卻時間（毫秒）
 * @param moon 月球物件
 * @returns 剩餘冷卻時間（毫秒），0表示已冷卻完成
 */
export const getJumpGateCooldownRemaining = (moon: Planet): number => {
  if (!moon.isMoon) return 0
  if (!moon.buildings[BuildingType.JumpGate] || moon.buildings[BuildingType.JumpGate] <= 0) return 0

  const lastUsed = moon.jumpGateLastUsed || 0
  const cooldownEnd = lastUsed + MOON_CONFIG.jumpGateCooldown
  const remaining = cooldownEnd - Date.now()

  return Math.max(0, remaining)
}

/**
 * 使用跳躍門（記錄使用時間）
 * @param moon 月球物件
 */
export const useJumpGate = (moon: Planet): void => {
  if (moon.isMoon) {
    moon.jumpGateLastUsed = Date.now()
  }
}

/**
 * 檢查兩個月球之間是否可以使用跳躍門傳送
 * OGame規則：兩個月球都必須有跳躍門，且都必須冷卻完成
 * @param sourceMoon 源月球
 * @param targetMoon 目標月球
 * @returns 是否可以傳送
 */
export const canUseJumpGate = (sourceMoon: Planet, targetMoon: Planet): boolean => {
  // 兩個都必須是月球
  if (!sourceMoon.isMoon || !targetMoon.isMoon) return false

  // 兩個都必須有跳躍門
  const sourceHasGate = sourceMoon.buildings[BuildingType.JumpGate] > 0
  const targetHasGate = targetMoon.buildings[BuildingType.JumpGate] > 0
  if (!sourceHasGate || !targetHasGate) return false

  // 兩個跳躍門都必須冷卻完成
  return isJumpGateReady(sourceMoon) && isJumpGateReady(targetMoon)
}
