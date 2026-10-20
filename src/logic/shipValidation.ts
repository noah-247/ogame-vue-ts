import type { Planet, Resources, BuildQueueItem, Fleet, Officer } from '@/types/game'
import { ShipType, DefenseType, TechnologyType, OfficerType, BuildingType } from '@/types/game'
import * as shipLogic from './shipLogic'
import * as missileLogic from './missileLogic'
import * as resourceLogic from './resourceLogic'
import * as officerLogic from './officerLogic'
import * as publicLogic from './publicLogic'
import * as fleetStorageLogic from './fleetStorageLogic'
import { getGameNow } from './gameTime'

/**
 * 驗證艦船建造的所有條件
 */
export const validateShipBuild = (
  planet: Planet,
  shipType: ShipType,
  quantity: number,
  technologies: Partial<Record<TechnologyType, number>>
): {
  valid: boolean
  reason?: string
} => {
  const totalCost = shipLogic.calculateShipCost(shipType, quantity)

  // 檢查前置條件
  if (!shipLogic.checkShipRequirements(shipType, planet.buildings, technologies)) {
    return { valid: false, reason: 'errors.requirementsNotMet' }
  }

  // 檢查資源
  if (!resourceLogic.checkResourcesAvailable(planet.resources, totalCost)) {
    return { valid: false, reason: 'errors.insufficientResources' }
  }

  // 檢查艦隊倉儲空間
  if (!fleetStorageLogic.hasEnoughFleetStorage(planet, shipType, quantity, technologies as Record<TechnologyType, number>)) {
    return { valid: false, reason: 'errors.insufficientFleetStorage' }
  }

  return { valid: true }
}

/**
 * 執行艦船建造
 */
export const executeShipBuild = (
  planet: Planet,
  shipType: ShipType,
  quantity: number,
  officers: Record<OfficerType, Officer>
): BuildQueueItem => {
  const totalCost = shipLogic.calculateShipCost(shipType, quantity)

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 獲取機器人工廠和奈米工廠等級
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0

  const buildTime = shipLogic.calculateShipBuildTime(
    shipType,
    quantity,
    bonuses.buildingSpeedBonus,
    roboticsFactoryLevel,
    naniteFactoryLevel
  )

  // 扣除資源
  resourceLogic.deductResources(planet.resources, totalCost)

  // 建立佇列項
  return shipLogic.createShipQueueItem(shipType, quantity, buildTime)
}

/**
 * 驗證防禦建造的所有條件
 */
export const validateDefenseBuild = (
  planet: Planet,
  defenseType: DefenseType,
  quantity: number,
  technologies: Partial<Record<TechnologyType, number>>
): {
  valid: boolean
  reason?: string
} => {
  const totalCost = shipLogic.calculateDefenseCost(defenseType, quantity)

  // 檢查前置條件
  if (!shipLogic.checkDefenseRequirements(defenseType, planet.buildings, technologies)) {
    return { valid: false, reason: 'errors.requirementsNotMet' }
  }

  // 檢查資源
  if (!resourceLogic.checkResourcesAvailable(planet.resources, totalCost)) {
    return { valid: false, reason: 'errors.insufficientResources' }
  }

  // 護盾罩限制
  if (!shipLogic.checkShieldDomeLimit(defenseType, planet.defense, quantity)) {
    return { valid: false, reason: 'errors.shieldDomeLimit' }
  }

  // 導彈發射井容量限制
  if (!missileLogic.checkMissileSiloLimit(defenseType, planet.defense, planet.buildings, quantity, planet.buildQueue)) {
    return { valid: false, reason: 'errors.missileSiloLimit' }
  }

  return { valid: true }
}

/**
 * 執行防禦建造
 */
export const executeDefenseBuild = (
  planet: Planet,
  defenseType: DefenseType,
  quantity: number,
  officers: Record<OfficerType, Officer>
): BuildQueueItem => {
  const totalCost = shipLogic.calculateDefenseCost(defenseType, quantity)

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 獲取機器人工廠和奈米工廠等級
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0

  const buildTime = shipLogic.calculateDefenseBuildTime(
    defenseType,
    quantity,
    bonuses.buildingSpeedBonus,
    roboticsFactoryLevel,
    naniteFactoryLevel
  )

  // 扣除資源
  resourceLogic.deductResources(planet.resources, totalCost)

  // 建立佇列項
  return shipLogic.createDefenseQueueItem(defenseType, quantity, buildTime)
}

/**
 * 驗證艦隊派遣的所有條件
 */
export const validateFleetDispatch = (
  planet: Planet,
  fleet: Partial<Fleet>,
  cargo: Resources,
  officers: Record<OfficerType, Officer>,
  currentFleetMissions: number = 0,
  technologies: Partial<Record<TechnologyType, number>> = {}
): {
  valid: boolean
  reason?: string
  fuelNeeded?: number
} => {
  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 檢查艦隊任務槽位是否已滿
  const computerTechLevel = technologies[TechnologyType.ComputerTechnology] || 0
  const maxFleetMissions = publicLogic.getMaxFleetMissions(bonuses.additionalFleetSlots, computerTechLevel)
  if (currentFleetMissions >= maxFleetMissions) {
    return { valid: false, reason: 'errors.fleetMissionsFull' }
  }

  // 檢查艦隊是否足夠
  if (!shipLogic.checkFleetAvailable(planet.fleet, fleet)) {
    return { valid: false, reason: 'errors.insufficientFleet' }
  }

  // 檢查是否有足夠的重氫作為燃料（包含貨物重量影響）
  const fuelNeeded = shipLogic.calculateFleetFuelConsumption(fleet, bonuses.fuelConsumptionReduction, cargo)
  if (planet.resources.deuterium < fuelNeeded) {
    return { valid: false, reason: 'errors.insufficientFuel', fuelNeeded }
  }

  return { valid: true, fuelNeeded }
}

/**
 * 執行艦隊派遣（扣除艦隊和燃料）
 */
export const executeFleetDispatch = (
  planet: Planet,
  fleet: Partial<Fleet>,
  fuelNeeded: number,
  shouldDeductCargo: boolean,
  cargo: Resources
): void => {
  // 扣除艦隊
  shipLogic.deductFleet(planet.fleet, fleet)

  // 扣除燃料
  planet.resources.deuterium -= fuelNeeded

  // 扣除運輸的資源
  if (shouldDeductCargo) {
    resourceLogic.deductResources(planet.resources, cargo)
  }
}

/**
 * 驗證艦船拆除的所有條件
 */
export const validateShipScrap = (
  planet: Planet,
  shipType: ShipType,
  quantity: number
): {
  valid: boolean
  reason?: string
} => {
  // 檢查數量是否有效
  if (quantity <= 0) {
    return { valid: false, reason: 'errors.invalidQuantity' }
  }

  // 檢查艦船數量是否足夠
  const available = planet.fleet[shipType] || 0
  if (available < quantity) {
    return { valid: false, reason: 'errors.insufficientShips' }
  }

  return { valid: true }
}

/**
 * 執行艦船拆除
 */
export const executeShipScrap = (
  planet: Planet,
  shipType: ShipType,
  quantity: number,
  officers: Record<OfficerType, Officer>
): BuildQueueItem => {
  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 獲取機器人工廠和奈米工廠等級
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0

  // 計算拆除時間
  const scrapTime = shipLogic.calculateShipScrapTime(
    shipType,
    quantity,
    bonuses.buildingSpeedBonus,
    roboticsFactoryLevel,
    naniteFactoryLevel
  )

  // 計算返還資源
  const refund = shipLogic.calculateShipScrapRefund(shipType, quantity)

  // 扣除艦船（立即扣除，避免拆除過程中派遣）
  planet.fleet[shipType] = (planet.fleet[shipType] || 0) - quantity

  // 返還資源
  resourceLogic.addResources(planet.resources, refund)

  // 建立佇列項
  return shipLogic.createShipScrapQueueItem(shipType, quantity, scrapTime)
}
