import type { Player, Resources, BuildingType, TechnologyType, ShipType, DefenseType } from '@/types/game'
import { SHIPS } from '@/config/gameConfig'
import { DEFENSES } from '@/config/gameConfig'
import * as buildingLogic from './buildingLogic'
import * as researchLogic from './researchLogic'

/**
 * 計算資源總和（僅計算金屬+晶體+重氫）
 * 根據遊戲規則：不包括暗物質和能量
 */
export const calculateResourceCost = (resources: Resources): number => {
  return resources.metal + resources.crystal + resources.deuterium
}

/**
 * 將資源總和轉換為積分
 * 規則：每1000資源 = 1分
 */
export const calculatePointsFromResources = (resourceCost: number): number => {
  return Math.floor(resourceCost / 1000)
}

/**
 * 為玩家新增積分
 */
export const addPoints = (player: Player, points: number): void => {
  player.points += points
}

/**
 * 計算建築升級到指定等級所獲得的積分
 * @param buildingType 建築型別
 * @param fromLevel 起始等級（不包括）
 * @param toLevel 目標等級（包括）
 * @returns 積分數
 */
export const calculateBuildingPoints = (buildingType: BuildingType, fromLevel: number, toLevel: number): number => {
  let totalPoints = 0
  for (let level = fromLevel + 1; level <= toLevel; level++) {
    const cost = buildingLogic.calculateBuildingCost(buildingType, level)
    const resourceCost = calculateResourceCost(cost)
    totalPoints += calculatePointsFromResources(resourceCost)
  }
  return totalPoints
}

/**
 * 計算科技研究到指定等級所獲得的積分
 * @param technologyType 科技型別
 * @param fromLevel 起始等級（不包括）
 * @param toLevel 目標等級（包括）
 * @returns 積分數
 */
export const calculateTechnologyPoints = (technologyType: TechnologyType, fromLevel: number, toLevel: number): number => {
  let totalPoints = 0
  for (let level = fromLevel + 1; level <= toLevel; level++) {
    const cost = researchLogic.calculateTechnologyCost(technologyType, level)
    const resourceCost = calculateResourceCost(cost)
    totalPoints += calculatePointsFromResources(resourceCost)
  }
  return totalPoints
}

/**
 * 計算艦船建造所獲得的積分
 * @param shipType 艦船型別
 * @param quantity 數量
 * @returns 積分數
 */
export const calculateShipPoints = (shipType: ShipType, quantity: number): number => {
  const config = SHIPS[shipType]
  const resourceCost = calculateResourceCost(config.cost)
  const pointsPerShip = calculatePointsFromResources(resourceCost)
  return pointsPerShip * quantity
}

/**
 * 計算防禦建造所獲得的積分
 * @param defenseType 防禦型別
 * @param quantity 數量
 * @returns 積分數
 */
export const calculateDefensePoints = (defenseType: DefenseType, quantity: number): number => {
  const config = DEFENSES[defenseType]
  const resourceCost = calculateResourceCost(config.cost)
  const pointsPerDefense = calculatePointsFromResources(resourceCost)
  return pointsPerDefense * quantity
}

/**
 * 計算玩家當前的總積分（用於資料遷移或重新計算）
 * 會計算所有建築、科技、艦船、防禦的累積積分
 */
export const calculateTotalPlayerPoints = (player: Player): number => {
  let totalPoints = 0

  // 計算所有星球的建築積分
  for (const planet of player.planets) {
    for (const [buildingType, level] of Object.entries(planet.buildings)) {
      if (level > 0) {
        totalPoints += calculateBuildingPoints(buildingType as BuildingType, 0, level)
      }
    }

    // 計算所有星球的艦船積分
    for (const [shipType, quantity] of Object.entries(planet.fleet)) {
      if (quantity > 0) {
        totalPoints += calculateShipPoints(shipType as ShipType, quantity)
      }
    }

    // 計算所有星球的防禦積分
    for (const [defenseType, quantity] of Object.entries(planet.defense)) {
      if (quantity > 0) {
        totalPoints += calculateDefensePoints(defenseType as DefenseType, quantity)
      }
    }
  }

  // 計算所有科技的積分
  for (const [technologyType, level] of Object.entries(player.technologies)) {
    if (level > 0) {
      totalPoints += calculateTechnologyPoints(technologyType as TechnologyType, 0, level)
    }
  }

  // 計算正在飛行的艦隊積分（艦隊已經建造，所以也計入積分）
  for (const mission of player.fleetMissions) {
    for (const [shipType, quantity] of Object.entries(mission.fleet)) {
      if (quantity && quantity > 0) {
        totalPoints += calculateShipPoints(shipType as ShipType, quantity)
      }
    }
  }

  return totalPoints
}
