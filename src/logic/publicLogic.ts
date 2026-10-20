/**
 * 公共業務邏輯模組
 * 提供跨模組共享的通用業務邏輯功能
 */

import { BuildingType, TechnologyType, ShipType, DefenseType } from '@/types/game'
import type { Planet, Resources, Officer, BuildingConfig, TechnologyConfig, Player } from '@/types/game'
import { OfficerType } from '@/types/game'
import * as officerLogic from '@/logic/officerLogic'
import * as resourceLogic from '@/logic/resourceLogic'
import { scaleResources } from '@/utils/speed'
import { BUILDINGS, TECHNOLOGIES, SHIPS, DEFENSES } from '@/config/gameConfig'
import { getGameNow } from './gameTime'

/**
 * 獲取特定等級的升級條件
 * 合併基礎 requirements 和等級門檻 levelRequirements
 * @param config 建築或科技配置
 * @param targetLevel 目標等級
 * @returns 合併後的前置條件
 */
export const getLevelRequirements = (
  config: BuildingConfig | TechnologyConfig,
  targetLevel: number
): Partial<Record<BuildingType | TechnologyType, number>> => {
  const requirements: Partial<Record<BuildingType | TechnologyType, number>> = {}

  // 1. 新增基礎 requirements（如果存在）
  if (config.requirements) {
    Object.assign(requirements, config.requirements)
  }

  // 2. 新增等級門檻 requirements（如果存在）
  if (config.levelRequirements) {
    // 找出所有小於等於目標等級的門檻
    const applicableLevels = Object.keys(config.levelRequirements)
      .map(Number)
      .filter(level => level <= targetLevel)
      .sort((a, b) => a - b)

    // 依次合併所有適用的等級要求（後面的覆蓋前面的）
    for (const level of applicableLevels) {
      const levelReqs = config.levelRequirements[level]
      if (levelReqs) {
        // 合併要求，取最大值
        for (const [key, value] of Object.entries(levelReqs)) {
          const currentValue = requirements[key as BuildingType | TechnologyType] || 0
          requirements[key as BuildingType | TechnologyType] = Math.max(currentValue, value)
        }
      }
    }
  }

  return requirements
}

/**
 * 檢查建造/研發前置條件是否滿足
 * @param planet 星球物件
 * @param technologies 已研究的科技等級
 * @param requirements 前置條件要求（建築等級或科技等級）
 * @returns 是否滿足前置條件
 */
export const checkRequirements = (
  planet: Planet | undefined,
  technologies: Partial<Record<TechnologyType, number>>,
  requirements?: Partial<Record<BuildingType | TechnologyType, number>>
): boolean => {
  // 如果星球不存在或沒有前置條件，預設返回 true
  if (!planet || !requirements) return true

  // 檢查所有前置條件
  for (const [key, requiredLevel] of Object.entries(requirements)) {
    // 檢查是否為建築型別
    if (Object.values(BuildingType).includes(key as BuildingType)) {
      const requiredBuildingType = key as BuildingType
      const requiredBuildingConfig = BUILDINGS[requiredBuildingType]

      // 如果當前是月球，且所需建築是星球專屬建築（planetOnly），則跳過此前置條件
      // 這允許在月球上建造機器人工廠等建築，即使它們的前置條件是無法在月球建造的礦場
      if (planet.isMoon && requiredBuildingConfig?.planetOnly) {
        continue
      }

      const currentLevel = planet.buildings[requiredBuildingType] || 0
      if (currentLevel < requiredLevel) {
        return false
      }
    }
    // 檢查是否為科技型別
    else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
      const currentLevel = technologies[key as TechnologyType] || 0
      if (currentLevel < requiredLevel) {
        return false
      }
    }
  }

  return true
}

/**
 * 計算星球的資源產量（包含軍官加成和科技加成）
 * @param planet 星球物件
 * @param officers 玩家的軍官物件
 * @param resourceSpeed 遊戲速度
 * @param techBonuses 科技加成（可選，礦物研究/晶體研究/燃料研究）
 * @returns 每小時各類資源的產量
 */
export const getResourceProduction = (
  planet: Planet,
  officers: Record<OfficerType, Officer>,
  resourceSpeed: number = 1,
  techBonuses?: {
    mineralResearchLevel?: number
    crystalResearchLevel?: number
    fuelResearchLevel?: number
  }
): Resources => {
  // 計算當前啟用的軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())
  // 根據建築等級和軍官加成計算資源產量
  const base = resourceLogic.calculateResourceProduction(planet, bonuses, techBonuses)
  return scaleResources(base, resourceSpeed)
}

/**
 * 計算星球的資源儲存容量（包含軍官加成）
 * @param planet 星球物件
 * @param officers 玩家的軍官物件
 * @returns 各類資源的最大儲存容量
 */
export const getResourceCapacity = (planet: Planet, officers: Record<OfficerType, Officer>): Resources => {
  // 計算當前啟用的軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())
  // 根據倉庫建築等級和軍官加成計算儲存容量
  return resourceLogic.calculateResourceCapacity(planet, bonuses.storageCapacityBonus)
}

/**
 * 計算最大建造佇列數量
 * @param planet 星球物件
 * @param additionalBuildQueue 軍官提供的額外佇列數量
 * @returns 最大建造佇列數量（基礎3個 + 奈米工廠等級 + 軍官加成，最多10個）
 */
export const getMaxBuildQueue = (planet: Planet, additionalBuildQueue: number = 0): number => {
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0
  return Math.min(3 + naniteFactoryLevel + additionalBuildQueue, 10)
}

/**
 * 計算最大研究佇列數量
 * @param technologies 已研究的科技等級
 * @returns 最大研究佇列數量（基礎3個 + 計算機技術等級，最多10個）
 */
export const getMaxResearchQueue = (technologies: Partial<Record<TechnologyType, number>>): number => {
  const computerTechLevel = technologies[TechnologyType.ComputerTechnology] || 0
  return Math.min(3 + computerTechLevel, 10)
}

/**
 * 計算最大艦隊任務數量
 * @param additionalFleetSlots 軍官提供的額外槽位數量
 * @param computerTechnologyLevel 計算機技術等級
 * @returns 最大艦隊任務數量（基礎3個 + 計算機技術等級 + 軍官加成，最多20個）
 */
export const getMaxFleetMissions = (additionalFleetSlots: number = 0, computerTechnologyLevel: number = 0): number => {
  return Math.min(3 + computerTechnologyLevel + additionalFleetSlots, 20)
}

/**
 * 計算建築的總成本（從等級1到目標等級的累計成本）
 * @param buildingType 建築型別
 * @param level 目標等級
 * @returns 總資源成本（金屬+水晶+重氫）
 */
export const calculateBuildingTotalCost = (buildingType: BuildingType, level: number): number => {
  if (level <= 0) return 0

  const config = BUILDINGS[buildingType]
  if (!config) return 0

  let totalCost = 0
  const { baseCost, costMultiplier } = config

  // 累加從等級1到目標等級的所有成本
  for (let i = 1; i <= level; i++) {
    const levelCost = {
      metal: Math.floor(baseCost.metal * Math.pow(costMultiplier, i - 1)),
      crystal: Math.floor(baseCost.crystal * Math.pow(costMultiplier, i - 1)),
      deuterium: Math.floor(baseCost.deuterium * Math.pow(costMultiplier, i - 1))
    }
    totalCost += levelCost.metal + levelCost.crystal + levelCost.deuterium
  }

  return totalCost
}

/**
 * 計算科技的總成本（從等級1到目標等級的累計成本）
 * @param techType 科技型別
 * @param level 目標等級
 * @returns 總資源成本（金屬+水晶+重氫）
 */
export const calculateTechnologyTotalCost = (techType: TechnologyType, level: number): number => {
  if (level <= 0) return 0

  const config = TECHNOLOGIES[techType]
  if (!config) return 0

  let totalCost = 0
  const { baseCost, costMultiplier } = config

  // 累加從等級1到目標等級的所有成本
  for (let i = 1; i <= level; i++) {
    const levelCost = {
      metal: Math.floor(baseCost.metal * Math.pow(costMultiplier, i - 1)),
      crystal: Math.floor(baseCost.crystal * Math.pow(costMultiplier, i - 1)),
      deuterium: Math.floor(baseCost.deuterium * Math.pow(costMultiplier, i - 1))
    }
    totalCost += levelCost.metal + levelCost.crystal + levelCost.deuterium
  }

  return totalCost
}

/**
 * 計算單個艦船的成本
 * @param shipType 艦船型別
 * @returns 單個艦船的資源成本（金屬+水晶+重氫）
 */
export const calculateShipUnitCost = (shipType: ShipType): number => {
  const config = SHIPS[shipType]
  if (!config) return 0

  return config.cost.metal + config.cost.crystal + config.cost.deuterium
}

/**
 * 計算單個防禦的成本
 * @param defenseType 防禦型別
 * @returns 單個防禦的資源成本（金屬+水晶+重氫）
 */
export const calculateDefenseUnitCost = (defenseType: DefenseType): number => {
  const config = DEFENSES[defenseType]
  if (!config) return 0

  return config.cost.metal + config.cost.crystal + config.cost.deuterium
}

/**
 * 計算玩家的總積分
 * 積分規則：(建築成本 + 科技成本 + 艦隊成本 + 防禦成本) / 1000
 * @param player 玩家物件
 * @returns 玩家總積分
 */
export const calculatePlayerPoints = (player: Player): number => {
  let totalCost = 0

  // 1. 計算所有星球的建築成本
  player.planets.forEach(planet => {
    Object.entries(planet.buildings).forEach(([buildingType, level]) => {
      totalCost += calculateBuildingTotalCost(buildingType as BuildingType, level)
    })
  })

  // 2. 計算科技成本
  Object.entries(player.technologies).forEach(([techType, level]) => {
    totalCost += calculateTechnologyTotalCost(techType as TechnologyType, level)
  })

  // 3. 計算所有星球的艦隊成本
  player.planets.forEach(planet => {
    Object.entries(planet.fleet).forEach(([shipType, count]) => {
      totalCost += calculateShipUnitCost(shipType as ShipType) * count
    })
  })

  // 4. 計算所有星球的防禦成本
  player.planets.forEach(planet => {
    Object.entries(planet.defense).forEach(([defenseType, count]) => {
      totalCost += calculateDefenseUnitCost(defenseType as DefenseType) * count
    })
  })

  // 每1000資源 = 1積分（基礎積分）
  const basePoints = Math.floor(totalCost / 1000)

  // 加上獎勵積分（戰役、成就等獎勵的積分）
  const bonusPoints = player.bonusPoints || 0

  return basePoints + bonusPoints
}
