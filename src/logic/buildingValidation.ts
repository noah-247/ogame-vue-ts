import type { Planet, Resources, BuildQueueItem, Officer } from '@/types/game'
import { BuildingType, TechnologyType, OfficerType } from '@/types/game'
import * as buildingLogic from './buildingLogic'
import * as resourceLogic from './resourceLogic'
import * as publicLogic from './publicLogic'
import * as officerLogic from './officerLogic'
import { BUILDINGS } from '@/config/gameConfig'
import { getGameNow } from './gameTime'

/**
 * 驗證建築升級的所有條件
 */
export const validateBuildingUpgrade = (
  planet: Planet,
  buildingType: BuildingType,
  technologies: Partial<Record<TechnologyType, number>>,
  officers: Record<OfficerType, Officer>
): {
  valid: boolean
  reason?: string
} => {
  const currentLevel = planet.buildings[buildingType] || 0
  const targetLevel = currentLevel + 1
  const cost = buildingLogic.calculateBuildingCost(buildingType, targetLevel)
  const buildingConfig = BUILDINGS[buildingType]

  // 檢查佇列中是否已存在該建築的升級或拆除任務
  const existingQueueItem = planet.buildQueue.find(
    item => (item.type === 'building' || item.type === 'demolish') && item.itemType === buildingType
  )
  if (existingQueueItem) {
    return { valid: false, reason: 'errors.buildingAlreadyInQueue' }
  }

  // 檢查星球/月球限制
  if (buildingConfig.planetOnly && planet.isMoon) {
    return { valid: false, reason: 'errors.planetOnly' }
  }
  if (buildingConfig.moonOnly && !planet.isMoon) {
    return { valid: false, reason: 'errors.moonOnly' }
  }

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 檢查建造佇列是否已滿（只計算建築型別的佇列項）
  const maxQueue = publicLogic.getMaxBuildQueue(planet, bonuses.additionalBuildQueue)
  const buildingQueueCount = planet.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish').length
  if (buildingQueueCount >= maxQueue) {
    return { valid: false, reason: 'errors.buildQueueFull' }
  }

  // 檢查空間
  if (!buildingLogic.checkSpaceAvailable(planet, buildingType)) {
    return { valid: false, reason: 'errors.insufficientSpace' }
  }

  // 檢查資源
  if (!resourceLogic.checkResourcesAvailable(planet.resources, cost)) {
    return { valid: false, reason: 'errors.insufficientResources' }
  }

  // 檢查前置條件
  if (!buildingLogic.checkBuildingRequirements(buildingType, planet, technologies)) {
    return { valid: false, reason: 'errors.requirementsNotMet' }
  }

  return { valid: true }
}

/**
 * 執行建築升級（扣除資源，新增到佇列）
 */
export const executeBuildingUpgrade = (
  planet: Planet,
  buildingType: BuildingType,
  officers: Record<OfficerType, Officer>
): BuildQueueItem => {
  const currentLevel = planet.buildings[buildingType] || 0
  const targetLevel = currentLevel + 1
  const cost = buildingLogic.calculateBuildingCost(buildingType, targetLevel)

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 獲取機器人工廠和奈米工廠等級
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0

  const time = buildingLogic.calculateBuildingTime(
    buildingType,
    targetLevel,
    bonuses.buildingSpeedBonus,
    roboticsFactoryLevel,
    naniteFactoryLevel
  )

  // 扣除資源
  resourceLogic.deductResources(planet.resources, cost)

  // 建立佇列項
  return buildingLogic.createBuildQueueItem(buildingType, targetLevel, time)
}

/**
 * 取消建造並計算返還資源
 */
export const cancelBuildingUpgrade = (_planet: Planet, queueItem: BuildQueueItem): Resources => {
  const cost = buildingLogic.calculateBuildingCost(queueItem.itemType as BuildingType, queueItem.targetLevel || 1)

  return {
    metal: Math.floor(cost.metal * 0.5),
    crystal: Math.floor(cost.crystal * 0.5),
    deuterium: Math.floor(cost.deuterium * 0.5),
    darkMatter: Math.floor(cost.darkMatter * 0.5),
    energy: 0
  }
}

/**
 * 查詢佇列項
 */
export const findQueueItem = (
  queue: BuildQueueItem[],
  queueId: string
): {
  item: BuildQueueItem | null
  index: number
} => {
  const index = queue.findIndex(q => q.id === queueId)
  if (index === -1) {
    return { item: null, index: -1 }
  }
  return { item: queue[index] || null, index }
}

/**
 * 驗證建築拆除的所有條件
 */
export const validateBuildingDemolish = (
  planet: Planet,
  buildingType: BuildingType,
  officers: Record<OfficerType, Officer>
): {
  valid: boolean
  reason?: string
} => {
  const currentLevel = planet.buildings[buildingType] || 0

  // 檢查建築等級
  if (currentLevel <= 0) {
    return { valid: false, reason: 'errors.buildingLevelZero' }
  }

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 檢查建造佇列是否已滿（只計算建築型別的佇列項）
  const maxQueue = publicLogic.getMaxBuildQueue(planet, bonuses.additionalBuildQueue)
  const buildingQueueCount = planet.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish').length
  if (buildingQueueCount >= maxQueue) {
    return { valid: false, reason: 'errors.buildQueueFull' }
  }

  return { valid: true }
}

/**
 * 執行建築拆除（返還資源，新增到佇列）
 */
export const executeBuildingDemolish = (
  planet: Planet,
  buildingType: BuildingType,
  officers: Record<OfficerType, Officer>
): BuildQueueItem => {
  const currentLevel = planet.buildings[buildingType] || 0

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 獲取機器人工廠和奈米工廠等級
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0

  const demolishTime = buildingLogic.calculateDemolishTime(
    buildingType,
    currentLevel,
    bonuses.buildingSpeedBonus,
    roboticsFactoryLevel,
    naniteFactoryLevel
  )

  // 返還50%資源
  const refund = buildingLogic.calculateDemolishRefund(buildingType, currentLevel)
  planet.resources.metal += refund.metal
  planet.resources.crystal += refund.crystal
  planet.resources.deuterium += refund.deuterium
  planet.resources.darkMatter += refund.darkMatter

  // 建立拆除佇列項
  return buildingLogic.createDemolishQueueItem(buildingType, currentLevel, demolishTime)
}
