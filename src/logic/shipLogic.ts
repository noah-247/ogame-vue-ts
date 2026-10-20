import type { Resources, BuildQueueItem, Fleet } from '@/types/game'
import { ShipType, DefenseType, BuildingType, TechnologyType } from '@/types/game'
import { SHIPS, DEFENSES } from '@/config/gameConfig'
import { getGameNow } from './gameTime'

// 用於生成唯一ID的計數器
let shipQueueIdCounter = 0

/**
 * 計算艦船建造成本
 */
export const calculateShipCost = (shipType: ShipType, quantity: number): Resources => {
  const config = SHIPS[shipType]
  return {
    metal: config.cost.metal * quantity,
    crystal: config.cost.crystal * quantity,
    deuterium: config.cost.deuterium * quantity,
    darkMatter: config.cost.darkMatter * quantity,
    energy: 0
  }
}

/**
 * 計算防禦設施建造成本
 */
export const calculateDefenseCost = (defenseType: DefenseType, quantity: number): Resources => {
  const config = DEFENSES[defenseType]
  return {
    metal: config.cost.metal * quantity,
    crystal: config.cost.crystal * quantity,
    deuterium: config.cost.deuterium * quantity,
    darkMatter: config.cost.darkMatter * quantity,
    energy: 0
  }
}

/**
 * 計算艦船建造時間
 * @param shipType 艦船型別
 * @param quantity 數量
 * @param buildingSpeedBonus 指揮官等提供的速度加成百分比
 * @param roboticsFactoryLevel 機器人工廠等級
 * @param naniteFactoryLevel 奈米工廠等級
 */
export const calculateShipBuildTime = (
  shipType: ShipType,
  quantity: number,
  buildingSpeedBonus: number = 0,
  roboticsFactoryLevel: number = 0,
  naniteFactoryLevel: number = 0
): number => {
  const config = SHIPS[shipType]
  const baseTime = config.buildTime * quantity

  // 機器人工廠和奈米工廠的加速：建造時間 / (1 + 機器人工廠等級 + 奈米工廠等級 × 2)
  const factorySpeedDivisor = 1 + roboticsFactoryLevel + naniteFactoryLevel * 2

  // 指揮官等的百分比加成
  const speedMultiplier = 1 - buildingSpeedBonus / 100

  return Math.floor((baseTime / factorySpeedDivisor) * speedMultiplier)
}

/**
 * 計算防禦設施建造時間
 * @param defenseType 防禦型別
 * @param quantity 數量
 * @param buildingSpeedBonus 指揮官等提供的速度加成百分比
 * @param roboticsFactoryLevel 機器人工廠等級
 * @param naniteFactoryLevel 奈米工廠等級
 */
export const calculateDefenseBuildTime = (
  defenseType: DefenseType,
  quantity: number,
  buildingSpeedBonus: number = 0,
  roboticsFactoryLevel: number = 0,
  naniteFactoryLevel: number = 0
): number => {
  const config = DEFENSES[defenseType]
  const baseTime = config.buildTime * quantity

  // 機器人工廠和奈米工廠的加速：建造時間 / (1 + 機器人工廠等級 + 奈米工廠等級 × 2)
  const factorySpeedDivisor = 1 + roboticsFactoryLevel + naniteFactoryLevel * 2

  // 指揮官等的百分比加成
  const speedMultiplier = 1 - buildingSpeedBonus / 100

  return Math.floor((baseTime / factorySpeedDivisor) * speedMultiplier)
}

/**
 * 檢查艦船建造條件
 */
export const checkShipRequirements = (
  shipType: ShipType,
  buildings: Partial<Record<BuildingType, number>>,
  technologies: Partial<Record<TechnologyType, number>>
): boolean => {
  const config = SHIPS[shipType]
  if (!config.requirements) return true

  for (const [key, level] of Object.entries(config.requirements)) {
    if (Object.values(BuildingType).includes(key as BuildingType)) {
      if ((buildings[key as BuildingType] || 0) < level) {
        return false
      }
    } else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
      if ((technologies[key as TechnologyType] || 0) < level) {
        return false
      }
    }
  }
  return true
}

/**
 * 檢查防禦設施建造條件
 */
export const checkDefenseRequirements = (
  defenseType: DefenseType,
  buildings: Partial<Record<BuildingType, number>>,
  technologies: Partial<Record<TechnologyType, number>>
): boolean => {
  const config = DEFENSES[defenseType]
  if (!config.requirements) return true

  for (const [key, level] of Object.entries(config.requirements)) {
    if (Object.values(BuildingType).includes(key as BuildingType)) {
      if ((buildings[key as BuildingType] || 0) < level) {
        return false
      }
    } else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
      if ((technologies[key as TechnologyType] || 0) < level) {
        return false
      }
    }
  }
  return true
}

/**
 * 檢查防禦罩數量限制
 */
export const checkShieldDomeLimit = (
  defenseType: DefenseType,
  currentDefense: Partial<Record<DefenseType, number>>,
  quantity: number
): boolean => {
  if (defenseType === DefenseType.SmallShieldDome || defenseType === DefenseType.LargeShieldDome) {
    if ((currentDefense[defenseType] || 0) > 0) {
      return false
    }
    if (quantity > 1) {
      return false
    }
  }
  return true
}

/**
 * 建立艦船建造佇列項
 */
export const createShipQueueItem = (shipType: ShipType, quantity: number, buildTime: number): BuildQueueItem => {
  const now = getGameNow()
  shipQueueIdCounter++
  return {
    id: `ship_${now}_${shipQueueIdCounter}`,
    type: 'ship',
    itemType: shipType,
    quantity,
    startTime: now,
    endTime: now + buildTime * 1000
  }
}

/**
 * 建立防禦設施建造佇列項
 */
export const createDefenseQueueItem = (defenseType: DefenseType, quantity: number, buildTime: number): BuildQueueItem => {
  const now = getGameNow()
  shipQueueIdCounter++
  return {
    id: `defense_${now}_${shipQueueIdCounter}`,
    type: 'defense',
    itemType: defenseType,
    quantity,
    startTime: now,
    endTime: now + buildTime * 1000
  }
}

/**
 * 檢查艦隊是否足夠
 */
export const checkFleetAvailable = (currentFleet: Partial<Fleet>, requiredFleet: Partial<Fleet>): boolean => {
  for (const [shipType, count] of Object.entries(requiredFleet)) {
    if ((currentFleet[shipType as ShipType] || 0) < count) {
      return false
    }
  }
  return true
}

/**
 * 計算艦隊燃料消耗（包含貨物重量影響）
 * @param fleet 艦隊組成
 * @param fuelConsumptionReduction 燃料消耗減少百分比
 * @param cargo 攜帶的貨物（可選）
 * @returns 總燃料消耗（重氫）
 */
export const calculateFleetFuelConsumption = (fleet: Partial<Fleet>, fuelConsumptionReduction: number = 0, cargo?: Resources): number => {
  // 計算艦船基礎燃料消耗
  let baseFuelNeeded = 0
  for (const [shipType, count] of Object.entries(fleet)) {
    const config = SHIPS[shipType as ShipType]
    baseFuelNeeded += config.fuelConsumption * count
  }

  // 計算貨物額外燃料消耗
  // 每1000單位資源增加1點燃料消耗
  let cargoFuelNeeded = 0
  if (cargo) {
    const totalCargo = cargo.metal + cargo.crystal + cargo.deuterium + cargo.darkMatter
    cargoFuelNeeded = Math.floor(totalCargo / 1000)
  }

  // 應用燃料消耗減少加成（僅應用於基礎燃料，不影響貨物燃料）
  const reductionMultiplier = 1 - fuelConsumptionReduction / 100
  const reducedBaseFuel = Math.floor(baseFuelNeeded * reductionMultiplier)

  return reducedBaseFuel + cargoFuelNeeded
}

/**
 * 計算艦隊最慢速度
 */
export const calculateFleetMinSpeed = (fleet: Partial<Fleet>, fleetSpeedBonus: number = 0): number => {
  let minSpeed = Infinity
  for (const [shipType, count] of Object.entries(fleet)) {
    if (count > 0) {
      const config = SHIPS[shipType as ShipType]
      minSpeed = Math.min(minSpeed, config.speed)
    }
  }
  const speedMultiplier = 1 + fleetSpeedBonus / 100
  return Math.floor(minSpeed * speedMultiplier)
}

/**
 * 扣除艦隊
 */
export const deductFleet = (currentFleet: Fleet, fleet: Partial<Fleet>): void => {
  for (const [shipType, count] of Object.entries(fleet)) {
    currentFleet[shipType as ShipType] -= count
  }
}

/**
 * 新增艦隊
 */
export const addFleet = (currentFleet: Fleet, fleet: Partial<Fleet>): void => {
  for (const [shipType, count] of Object.entries(fleet)) {
    if (count > 0) {
      currentFleet[shipType as ShipType] += count
    }
  }
}

/**
 * 計算艦船拆除返還資源
 * 返還50%的建造成本
 */
export const calculateShipScrapRefund = (shipType: ShipType, quantity: number): Resources => {
  const cost = calculateShipCost(shipType, quantity)
  return {
    metal: Math.floor(cost.metal * 0.5),
    crystal: Math.floor(cost.crystal * 0.5),
    deuterium: Math.floor(cost.deuterium * 0.5),
    darkMatter: Math.floor(cost.darkMatter * 0.5),
    energy: 0
  }
}

/**
 * 計算艦船拆除時間
 * 拆除時間為建造時間的50%
 */
export const calculateShipScrapTime = (
  shipType: ShipType,
  quantity: number,
  buildingSpeedBonus: number = 0,
  roboticsFactoryLevel: number = 0,
  naniteFactoryLevel: number = 0
): number => {
  const buildTime = calculateShipBuildTime(shipType, quantity, buildingSpeedBonus, roboticsFactoryLevel, naniteFactoryLevel)
  return Math.floor(buildTime * 0.5)
}

/**
 * 建立艦船拆除佇列項
 */
export const createShipScrapQueueItem = (shipType: ShipType, quantity: number, scrapTime: number): BuildQueueItem => {
  const now = getGameNow()
  shipQueueIdCounter++
  return {
    id: `scrap_ship_${now}_${shipQueueIdCounter}`,
    type: 'scrap_ship',
    itemType: shipType,
    quantity,
    startTime: now,
    endTime: now + scrapTime * 1000
  }
}
