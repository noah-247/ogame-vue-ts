import type { Resources, BuildQueueItem, Planet } from '@/types/game'
import { TechnologyType, BuildingType } from '@/types/game'
import { TECHNOLOGIES } from '@/config/gameConfig'
import * as pointsLogic from './pointsLogic'
import { getGameNow } from './gameTime'

/**
 * 計算有效研究實驗室等級（考慮星際研究網路）
 * 星際研究網路允許連線多個星球的研究實驗室，取等級最高的N個實驗室等級之和
 * @param planets 玩家的所有星球
 * @param currentPlanetId 當前星球ID（研究所在的星球）
 * @param intergalacticResearchNetworkLevel 星際研究網路等級
 * @returns 有效的研究實驗室等級總和
 */
export const calculateEffectiveLabLevel = (
  planets: Planet[],
  currentPlanetId: string,
  intergalacticResearchNetworkLevel: number
): number => {
  // 收集所有星球的研究實驗室等級
  const labLevels: { planetId: string; level: number }[] = []

  for (const planet of planets) {
    const labLevel = planet.buildings[BuildingType.ResearchLab] || 0
    if (labLevel > 0) {
      labLevels.push({ planetId: planet.id, level: labLevel })
    }
  }

  // 如果沒有星際研究網路，只返回當前星球的實驗室等級
  if (intergalacticResearchNetworkLevel === 0) {
    const currentPlanet = planets.find(p => p.id === currentPlanetId)
    return currentPlanet?.buildings[BuildingType.ResearchLab] || 0
  }

  // 按等級降序排序
  labLevels.sort((a, b) => b.level - a.level)

  // 可連線的實驗室數量 = 1 + 星際研究網路等級
  // 等級1可連線2個實驗室，等級2可連線3個，以此類推
  const maxLabs = 1 + intergalacticResearchNetworkLevel

  // 取前N個實驗室的等級之和
  let totalLevel = 0
  const count = Math.min(maxLabs, labLevels.length)
  for (let i = 0; i < count; i++) {
    const lab = labLevels[i]
    if (lab) {
      totalLevel += lab.level
    }
  }

  return totalLevel
}

// 用於生成唯一ID的計數器
let researchQueueIdCounter = 0

/**
 * 計算科技研究成本
 */
export const calculateTechnologyCost = (techType: TechnologyType, targetLevel: number): Resources => {
  const config = TECHNOLOGIES[techType]
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
 * 計算科技研究時間
 * 使用 2moons 公式（調整版）：
 * 1. 成本系數 = Σ (資源^0.3 / 0.003)
 * 2. 時間(秒) = 成本系數 / ((1 + 研究實驗室等級) × 能源加成 × 遊戲速度)
 * @param techType 科技型別
 * @param currentLevel 當前等級（要研究的目標等級 = currentLevel + 1）
 * @param researchSpeedBonus 軍官等提供的研究速度加成百分比
 * @param researchLabLevel 研究實驗室等級
 * @param energyTechLevel 能源技術等級（提供額外加速）
 * @param gameSpeed 遊戲速度（預設1）
 * @param universityLevel 大學等級（每級減少研究時間8%）
 */
export const calculateTechnologyTime = (
  techType: TechnologyType,
  currentLevel: number,
  researchSpeedBonus: number = 0,
  researchLabLevel: number = 1,
  energyTechLevel: number = 0,
  gameSpeed: number = 1,
  universityLevel: number = 0
): number => {
  // 目標等級 = 當前等級 + 1
  const targetLevel = currentLevel + 1

  // 計算該等級的成本
  const cost = calculateTechnologyCost(techType, targetLevel)

  // 2moons 公式：成本系數 = Σ (資源^0.3 / 0.003)
  let elementCost = 0
  if (cost.metal > 0) elementCost += Math.pow(cost.metal, 0.3) / 0.003
  if (cost.crystal > 0) elementCost += Math.pow(cost.crystal, 0.3) / 0.003
  if (cost.deuterium > 0) elementCost += Math.pow(cost.deuterium, 0.3) / 0.003

  // 研究實驗室等級至少為1，防止除以0
  const labLevel = Math.max(1, researchLabLevel)

  // 能源技術提供額外加速（每級5%）
  const energyBonus = 1 + energyTechLevel * 0.05

  // 簡化公式：時間(秒) = 成本系數 / (實驗室加成 × 能源加成 × 遊戲速度)
  const timeInSeconds = elementCost / ((1 + labLevel) * energyBonus * gameSpeed)

  // 軍官等的百分比加成
  const speedMultiplier = 1 - researchSpeedBonus / 100

  // 大學加成：每級減少研究時間8%（最高10級=57%減少，因為是乘法疊加）
  // 使用乘法疊加：(1 - 0.08)^level
  const universityMultiplier = Math.pow(0.92, universityLevel)

  // 確保最小時間為5秒
  return Math.max(5, Math.floor(timeInSeconds * speedMultiplier * universityMultiplier))
}

/**
 * 檢查科技研究條件
 */
export const checkTechnologyRequirements = (
  techType: TechnologyType,
  buildings: Partial<Record<BuildingType, number>>,
  technologies: Partial<Record<TechnologyType, number>>
): boolean => {
  const config = TECHNOLOGIES[techType]
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
 * 建立研究佇列項
 */
export const createResearchQueueItem = (techType: TechnologyType, targetLevel: number, researchTime: number): BuildQueueItem => {
  const now = getGameNow()
  researchQueueIdCounter++
  return {
    id: `research_${now}_${researchQueueIdCounter}`,
    type: 'technology',
    itemType: techType,
    targetLevel,
    startTime: now,
    endTime: now + researchTime * 1000
  }
}

/**
 * 處理研究完成
 */
export const completeResearchQueue = (
  researchQueue: BuildQueueItem[],
  technologies: Partial<Record<TechnologyType, number>>,
  now: number,
  onPointsEarned?: (points: number, type: 'technology', itemType: string, level: number) => void,
  onCompleted?: (type: 'technology', itemType: string, level: number) => void
): BuildQueueItem[] => {
  return researchQueue.filter(item => {
    if (now >= item.endTime) {
      // 研究完成
      const oldLevel = technologies[item.itemType as TechnologyType] || 0
      // 研究完成時，等級+1（而不是直接使用targetLevel，保持一致性）
      const newLevel = oldLevel + 1
      technologies[item.itemType as TechnologyType] = newLevel

      // 計算並累積積分
      if (onPointsEarned && newLevel > oldLevel) {
        const points = pointsLogic.calculateTechnologyPoints(item.itemType as TechnologyType, oldLevel, newLevel)
        onPointsEarned(points, 'technology', item.itemType, newLevel)
      }

      // 通知完成
      if (onCompleted) {
        onCompleted('technology', item.itemType, newLevel)
      }

      return false
    }
    return true
  })
}
