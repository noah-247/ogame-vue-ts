/**
 * 導彈系統邏輯
 * 處理星際導彈攻擊、射程計算、攔截等
 */

import type { Planet, MissileAttack, DefenseType, TechnologyType, Position, BuildQueueItem } from '@/types/game'
import { DefenseType as DefenseTypes, BuildingType } from '@/types/game'
import { getGameNow } from './gameTime'

/**
 * 計算導彈發射井容量
 */
export const calculateMissileSiloCapacity = (buildings: Partial<Record<BuildingType, number>>): number => {
  const siloLevel = buildings[BuildingType.MissileSilo] || 0
  return siloLevel * 10 // 每級儲存10枚導彈
}

/**
 * 計算當前導彈總數
 */
export const calculateCurrentMissileCount = (defense: Partial<Record<DefenseType, number>>): number => {
  const interplanetaryMissiles = defense[DefenseTypes.InterplanetaryMissile] || 0
  const antiBallisticMissiles = defense[DefenseTypes.AntiBallisticMissile] || 0
  return interplanetaryMissiles + antiBallisticMissiles
}

/**
 * 計算建造佇列中的導彈總數
 */
export const calculateQueueMissileCount = (buildQueue: BuildQueueItem[]): number => {
  let queueMissileCount = 0

  for (const item of buildQueue) {
    if (item.type === 'defense') {
      const defenseType = item.itemType as DefenseType
      if (defenseType === DefenseTypes.InterplanetaryMissile || defenseType === DefenseTypes.AntiBallisticMissile) {
        queueMissileCount += item.quantity || 0
      }
    }
  }

  return queueMissileCount
}

/**
 * 檢查導彈容量限制
 */
export const checkMissileSiloLimit = (
  defenseType: DefenseType,
  currentDefense: Partial<Record<DefenseType, number>>,
  buildings: Partial<Record<BuildingType, number>>,
  quantity: number,
  buildQueue?: BuildQueueItem[]
): boolean => {
  // 只對導彈型別進行檢查
  if (defenseType !== DefenseTypes.InterplanetaryMissile && defenseType !== DefenseTypes.AntiBallisticMissile) {
    return true
  }

  const maxCapacity = calculateMissileSiloCapacity(buildings)
  const currentCount = calculateCurrentMissileCount(currentDefense)
  const queueCount = buildQueue ? calculateQueueMissileCount(buildQueue) : 0
  const newCount = currentCount + queueCount + quantity

  return newCount <= maxCapacity
}

/**
 * 計算導彈射程（基於脈衝引擎等級）
 * 射程 = 5 * impulseDriveLevel - 1（系統距離）
 */
export const calculateMissileRange = (impulseDriveLevel: number): number => {
  if (impulseDriveLevel === 0) return 0
  return 5 * impulseDriveLevel - 1
}

/**
 * 計算兩個位置之間的系統距離
 */
export const calculateSystemDistance = (from: Position, to: Position): number => {
  // 如果在不同銀河系，距離無限大
  if (from.galaxy !== to.galaxy) {
    return Infinity
  }

  // 同一銀河系內的系統距離
  return Math.abs(from.system - to.system)
}

/**
 * 檢查目標是否在射程內
 */
export const isTargetInRange = (originPosition: Position, targetPosition: Position, impulseDriveLevel: number): boolean => {
  const range = calculateMissileRange(impulseDriveLevel)
  const distance = calculateSystemDistance(originPosition, targetPosition)
  return distance <= range
}

/**
 * 計算導彈飛行時間（秒）
 * 基礎飛行時間: 30秒 + 60秒/系統距離
 */
export const calculateMissileFlightTime = (distance: number): number => {
  return 30 + distance * 60
}

/**
 * 建立導彈攻擊任務
 */
export const createMissileAttack = (
  playerId: string,
  originPlanet: Planet,
  targetPosition: Position,
  targetPlanetId: string | undefined,
  missileCount: number
): MissileAttack => {
  const now = getGameNow()
  const distance = calculateSystemDistance(originPlanet.position, targetPosition)
  const flightTime = calculateMissileFlightTime(distance) * 1000 // 轉換為毫秒

  return {
    id: `missile_${now}_${playerId}`,
    playerId,
    originPlanetId: originPlanet.id,
    targetPosition,
    targetPlanetId,
    missileCount,
    launchTime: now,
    arrivalTime: now + flightTime,
    status: 'flying'
  }
}

/**
 * 驗證導彈發射條件
 */
export const validateMissileLaunch = (
  originPlanet: Planet,
  targetPosition: Position,
  missileCount: number,
  technologies: Partial<Record<TechnologyType, number>>
): {
  valid: boolean
  reason?: string
} => {
  // 檢查是否有足夠的星際導彈
  const availableMissiles = originPlanet.defense[DefenseTypes.InterplanetaryMissile] || 0
  if (availableMissiles < missileCount) {
    return { valid: false, reason: 'errors.insufficientMissiles' }
  }

  // 檢查發射數量
  if (missileCount <= 0) {
    return { valid: false, reason: 'errors.invalidMissileCount' }
  }

  // 檢查射程
  const impulseDriveLevel = technologies['impulseDrive'] || 0
  if (!isTargetInRange(originPlanet.position, targetPosition, impulseDriveLevel)) {
    return { valid: false, reason: 'errors.targetOutOfRange' }
  }

  // 不能攻擊自己的星球
  if (
    originPlanet.position.galaxy === targetPosition.galaxy &&
    originPlanet.position.system === targetPosition.system &&
    originPlanet.position.position === targetPosition.position
  ) {
    return { valid: false, reason: 'errors.cannotAttackOwnPlanet' }
  }

  return { valid: true }
}

/**
 * 執行導彈發射（扣除導彈）
 */
export const executeMissileLaunch = (planet: Planet, missileCount: number): void => {
  const currentMissiles = planet.defense[DefenseTypes.InterplanetaryMissile] || 0
  planet.defense[DefenseTypes.InterplanetaryMissile] = currentMissiles - missileCount
}

/**
 * 計算導彈攻擊結果（考慮攔截）
 * @returns 實際命中的導彈數量
 */
export const calculateMissileImpact = (
  attackingMissiles: number,
  defenderPlanet: Planet
): {
  missileHits: number
  missileIntercepted: number
  defenseLosses: Partial<Record<DefenseType, number>>
} => {
  const antiBallisticMissiles = defenderPlanet.defense[DefenseTypes.AntiBallisticMissile] || 0

  // 反彈道導彈攔截（1:1）
  const intercepted = Math.min(attackingMissiles, antiBallisticMissiles)
  const missileHits = attackingMissiles - intercepted

  // 計算防禦損失
  const defenseLosses: Partial<Record<DefenseType, number>> = {}

  // 消耗的反彈道導彈
  if (intercepted > 0) {
    defenseLosses[DefenseTypes.AntiBallisticMissile] = intercepted
  }

  // 如果有導彈命中，隨機摧毀防禦設施
  if (missileHits > 0) {
    const defenseTypes = Object.keys(defenderPlanet.defense) as DefenseType[]
    const availableDefenses = defenseTypes.filter(type => {
      // 不能摧毀護盾罩和行星護盾
      if (type === DefenseTypes.SmallShieldDome || type === DefenseTypes.LargeShieldDome || type === DefenseTypes.PlanetaryShield) {
        return false
      }
      return (defenderPlanet.defense[type] || 0) > 0
    })

    // 每枚導彈可以摧毀一個防禦設施
    for (let i = 0; i < missileHits && availableDefenses.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableDefenses.length)
      const targetDefense = availableDefenses[randomIndex]

      if (targetDefense) {
        if (!defenseLosses[targetDefense]) {
          defenseLosses[targetDefense] = 0
        }
        defenseLosses[targetDefense]!++

        // 如果該型別防禦全部摧毀，從可用列表中移除
        const remaining = (defenderPlanet.defense[targetDefense] || 0) - (defenseLosses[targetDefense] || 0)
        if (remaining <= 0) {
          availableDefenses.splice(randomIndex, 1)
        }
      }
    }
  }

  return {
    missileHits,
    missileIntercepted: intercepted,
    defenseLosses
  }
}

/**
 * 應用導彈攻擊結果到星球
 */
export const applyMissileAttackResult = (planet: Planet, defenseLosses: Partial<Record<DefenseType, number>>): void => {
  for (const [defenseType, lossCount] of Object.entries(defenseLosses)) {
    const currentCount = planet.defense[defenseType as DefenseType] || 0
    planet.defense[defenseType as DefenseType] = Math.max(0, currentCount - lossCount)
  }
}
