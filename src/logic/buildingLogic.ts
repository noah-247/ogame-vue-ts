import type { Planet, Resources, BuildQueueItem } from '@/types/game'
import { BuildingType, TechnologyType, ShipType, DefenseType } from '@/types/game'
import { BUILDINGS } from '@/config/gameConfig'
import * as pointsLogic from './pointsLogic'
import { getGameNow } from './gameTime'

// 用於生成唯一ID的計數器
let queueIdCounter = 0

/**
 * 計算建築升級成本
 */
export const calculateBuildingCost = (buildingType: BuildingType, targetLevel: number): Resources => {
  const config = BUILDINGS[buildingType]
  const multiplier = Math.pow(config.costMultiplier, targetLevel - 1)
  return {
    metal: Math.floor(config.baseCost.metal * multiplier),
    crystal: Math.floor(config.baseCost.crystal * multiplier),
    deuterium: Math.floor(config.baseCost.deuterium * multiplier),
    darkMatter: Math.floor(config.baseCost.darkMatter * multiplier),
    energy: 0
  }
}

/**
 * 計算建築升級時間
 * @param buildingType 建築型別
 * @param targetLevel 目標等級
 * @param buildingSpeedBonus 指揮官等提供的速度加成百分比
 * @param roboticsFactoryLevel 機器人工廠等級
 * @param naniteFactoryLevel 奈米工廠等級
 */
export const calculateBuildingTime = (
  buildingType: BuildingType,
  targetLevel: number,
  buildingSpeedBonus: number = 0,
  roboticsFactoryLevel: number = 0,
  naniteFactoryLevel: number = 0
): number => {
  const config = BUILDINGS[buildingType]
  const multiplier = Math.pow(config.costMultiplier, targetLevel - 1)
  const baseTime = config.baseTime * multiplier

  // 機器人工廠和奈米工廠的加速：建造時間 / (1 + 機器人工廠等級 + 奈米工廠等級 × 2)
  const factorySpeedDivisor = 1 + roboticsFactoryLevel + naniteFactoryLevel * 2

  // 指揮官等的百分比加成
  const speedMultiplier = 1 - buildingSpeedBonus / 100

  return Math.floor((baseTime / factorySpeedDivisor) * speedMultiplier)
}

/**
 * 計算已用空間
 */
export const calculateUsedSpace = (planet: Planet): number => {
  let usedSpace = 0
  Object.entries(planet.buildings).forEach(([buildingType, level]) => {
    if (level > 0) {
      const config = BUILDINGS[buildingType as BuildingType]
      usedSpace += config.spaceUsage * level
    }
  })
  return usedSpace
}

/**
 * 檢查建築升級條件（包括基礎要求和等級門檻要求）
 */
export const checkBuildingRequirements = (
  buildingType: BuildingType,
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  targetLevel?: number
): boolean => {
  const config = BUILDINGS[buildingType]
  const currentLevel = planet.buildings[buildingType] || 0
  const level = targetLevel ?? currentLevel + 1

  // 檢查基礎 requirements
  const requirements = (config as any).requirements
  if (requirements) {
    for (const [key, reqLevel] of Object.entries(requirements)) {
      const requiredLevel = reqLevel as number
      if (Object.values(BuildingType).includes(key as BuildingType)) {
        const requiredBuildingType = key as BuildingType
        const requiredBuildingConfig = BUILDINGS[requiredBuildingType]

        // 如果當前是月球，且所需建築是星球專屬建築（planetOnly），則跳過此前置條件
        // 這允許在月球上建造機器人工廠等建築，即使它們的前置條件是無法在月球建造的礦場
        if (planet.isMoon && requiredBuildingConfig?.planetOnly) {
          continue
        }

        if ((planet.buildings[requiredBuildingType] || 0) < requiredLevel) {
          return false
        }
      } else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
        if ((technologies[key as TechnologyType] || 0) < requiredLevel) {
          return false
        }
      }
    }
  }

  // 檢查等級門檻 levelRequirements
  const levelRequirements = (config as any).levelRequirements
  if (levelRequirements) {
    // 找出所有小於等於目標等級的門檻
    const applicableLevels = Object.keys(levelRequirements)
      .map(Number)
      .filter(l => l <= level)
      .sort((a, b) => a - b)

    for (const threshold of applicableLevels) {
      const reqs = levelRequirements[threshold]
      if (!reqs) continue

      for (const [key, reqLevel] of Object.entries(reqs)) {
        const requiredLevel = reqLevel as number
        if (Object.values(BuildingType).includes(key as BuildingType)) {
          const requiredBuildingType = key as BuildingType
          const requiredBuildingConfig = BUILDINGS[requiredBuildingType]

          // 如果當前是月球，且所需建築是星球專屬建築（planetOnly），則跳過此前置條件
          if (planet.isMoon && requiredBuildingConfig?.planetOnly) {
            continue
          }

          if ((planet.buildings[requiredBuildingType] || 0) < requiredLevel) {
            return false
          }
        } else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
          if ((technologies[key as TechnologyType] || 0) < requiredLevel) {
            return false
          }
        }
      }
    }
  }

  return true
}

/**
 * 檢查是否有足夠空間建造
 */
export const checkSpaceAvailable = (planet: Planet, buildingType: BuildingType): boolean => {
  const usedSpace = calculateUsedSpace(planet)
  const buildingConfig = BUILDINGS[buildingType]
  const requiredSpace = buildingConfig.spaceUsage
  return usedSpace + requiredSpace <= planet.maxSpace
}

/**
 * 建立建造佇列項
 */
export const createBuildQueueItem = (buildingType: BuildingType, targetLevel: number, buildTime: number): BuildQueueItem => {
  const now = getGameNow()
  queueIdCounter++
  return {
    id: `build_${now}_${queueIdCounter}`,
    type: 'building',
    itemType: buildingType,
    targetLevel,
    startTime: now,
    endTime: now + buildTime * 1000
  }
}

/**
 * 處理建造完成
 * @param upTo 只完成 endTime <= upTo 的項（預設 = now）。B1 離線大步結算時，
 *             呼叫方按完工時間點逐事件呼叫，實現分段結算。
 */
export const completeBuildQueue = (
  planet: Planet,
  now: number,
  onPointsEarned?: (points: number, type: 'building' | 'ship' | 'defense', itemType: string, level?: number, quantity?: number) => void,
  onCompleted?: (type: 'building' | 'ship' | 'defense' | 'demolish', itemType: string, level?: number, quantity?: number) => void,
  upTo: number = now
): void => {
  planet.buildQueue = planet.buildQueue.filter(item => {
    if (upTo >= item.endTime) {
      // 建造完成
      if (item.type === 'building') {
        const oldLevel = planet.buildings[item.itemType as BuildingType] || 0
        // 升級完成時，等級+1（而不是直接使用targetLevel，避免在升級過程中被拆除後跳級）
        const newLevel = oldLevel + 1
        planet.buildings[item.itemType as BuildingType] = newLevel

        // 計算並累積積分
        if (onPointsEarned && newLevel > oldLevel) {
          const points = pointsLogic.calculateBuildingPoints(item.itemType as BuildingType, oldLevel, newLevel)
          onPointsEarned(points, 'building', item.itemType, newLevel)
        }

        if (onCompleted) {
          onCompleted('building', item.itemType, newLevel)
        }
      } else if (item.type === 'ship') {
        const shipType = item.itemType as ShipType
        const quantity = item.quantity || 0
        planet.fleet[shipType] = (planet.fleet[shipType] || 0) + quantity

        // 計算並累積積分
        if (onPointsEarned && quantity > 0) {
          const points = pointsLogic.calculateShipPoints(shipType, quantity)
          onPointsEarned(points, 'ship', item.itemType, undefined, quantity)
        }
      } else if (item.type === 'defense') {
        const defenseType = item.itemType as DefenseType
        const quantity = item.quantity || 0
        planet.defense[defenseType] = (planet.defense[defenseType] || 0) + quantity

        // 計算並累積積分
        if (onPointsEarned && quantity > 0) {
          const points = pointsLogic.calculateDefensePoints(defenseType, quantity)
          onPointsEarned(points, 'defense', item.itemType, undefined, quantity)
        }
      } else if (item.type === 'demolish') {
        // 拆除完成，降低建築等級
        const buildingType = item.itemType as BuildingType
        const currentLevel = planet.buildings[buildingType] || 0
        planet.buildings[buildingType] = Math.max(0, currentLevel - 1)
      } else if (item.type === 'scrap_ship') {
        // 艦船拆除完成，減少艦船數量（艦船已在開始拆除時扣除）
        // 資源返還也在開始拆除時完成，這裡不需要額外操作
        if (onCompleted) {
          onCompleted('ship', item.itemType, undefined, item.quantity)
        }
      }
      return false
    }
    return true
  })
}

/**
 * 計算拆除返還資源
 * @param buildingType 建築型別
 * @param currentLevel 當前等級
 * @returns 返還50%的當前等級建造成本
 */
export const calculateDemolishRefund = (buildingType: BuildingType, currentLevel: number): Resources => {
  const cost = calculateBuildingCost(buildingType, currentLevel)
  return {
    metal: Math.floor(cost.metal * 0.5),
    crystal: Math.floor(cost.crystal * 0.5),
    deuterium: Math.floor(cost.deuterium * 0.5),
    darkMatter: Math.floor(cost.darkMatter * 0.5),
    energy: 0
  }
}

/**
 * 計算拆除時間
 * @param buildingType 建築型別
 * @param currentLevel 當前等級
 * @param buildingSpeedBonus 建築速度加成
 * @param roboticsFactoryLevel 機器人工廠等級
 * @param naniteFactoryLevel 奈米工廠等級
 * @returns 拆除時間（建造時間的50%）
 */
export const calculateDemolishTime = (
  buildingType: BuildingType,
  currentLevel: number,
  buildingSpeedBonus: number = 0,
  roboticsFactoryLevel: number = 0,
  naniteFactoryLevel: number = 0
): number => {
  const buildTime = calculateBuildingTime(buildingType, currentLevel, buildingSpeedBonus, roboticsFactoryLevel, naniteFactoryLevel)
  return Math.floor(buildTime * 0.5)
}

/**
 * 建立拆除佇列項
 * @param buildingType 建築型別
 * @param currentLevel 當前等級
 * @param demolishTime 拆除時間
 * @returns 拆除佇列項
 */
export const createDemolishQueueItem = (buildingType: BuildingType, currentLevel: number, demolishTime: number): BuildQueueItem => {
  const now = getGameNow()
  queueIdCounter++
  return {
    id: `demolish_${now}_${queueIdCounter}`,
    type: 'demolish',
    itemType: buildingType,
    targetLevel: currentLevel - 1, // 目標等級為當前等級-1
    startTime: now,
    endTime: now + demolishTime * 1000
  }
}
