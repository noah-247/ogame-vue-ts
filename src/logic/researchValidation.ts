import type { Planet, Resources, BuildQueueItem, Officer } from '@/types/game'
import { TechnologyType, OfficerType, BuildingType } from '@/types/game'
import * as researchLogic from './researchLogic'
import * as resourceLogic from './resourceLogic'
import * as publicLogic from './publicLogic'
import * as officerLogic from './officerLogic'
import { getGameNow } from './gameTime'

/**
 * 驗證科技研究的所有條件
 */
export const validateTechnologyResearch = (
  planet: Planet,
  techType: TechnologyType,
  technologies: Partial<Record<TechnologyType, number>>,
  researchQueue: BuildQueueItem[]
): {
  valid: boolean
  reason?: string
} => {
  const currentLevel = technologies[techType] || 0
  const targetLevel = currentLevel + 1
  const cost = researchLogic.calculateTechnologyCost(techType, targetLevel)

  // 檢查佇列中是否已存在該科技的研究任務
  const existingQueueItem = researchQueue.find(item => item.type === 'technology' && item.itemType === techType)
  if (existingQueueItem) {
    return { valid: false, reason: 'errors.technologyAlreadyInQueue' }
  }

  // 檢查研究佇列是否已滿
  const maxQueue = publicLogic.getMaxResearchQueue(technologies)
  if (researchQueue.length >= maxQueue) {
    return { valid: false, reason: 'errors.researchQueueFull' }
  }

  // 檢查前置條件
  if (!researchLogic.checkTechnologyRequirements(techType, planet.buildings, technologies)) {
    return { valid: false, reason: 'errors.requirementsNotMet' }
  }

  // 檢查資源
  if (!resourceLogic.checkResourcesAvailable(planet.resources, cost)) {
    return { valid: false, reason: 'errors.insufficientResources' }
  }

  return { valid: true }
}

/**
 * 執行科技研究（扣除資源，建立佇列項）
 */
export const executeTechnologyResearch = (
  planet: Planet,
  techType: TechnologyType,
  currentLevel: number,
  officers: Record<OfficerType, Officer>,
  technologies: Partial<Record<TechnologyType, number>>,
  allPlanets?: Planet[]
): { queueItem: BuildQueueItem } => {
  const targetLevel = currentLevel + 1
  const cost = researchLogic.calculateTechnologyCost(techType, targetLevel)

  // 計算軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())

  // 獲取星際研究網路等級
  const intergalacticResearchNetworkLevel = technologies[TechnologyType.IntergalacticResearchNetwork] || 0

  // 計算有效研究實驗室等級（考慮星際研究網路）
  let researchLabLevel: number
  if (allPlanets && intergalacticResearchNetworkLevel > 0) {
    researchLabLevel = researchLogic.calculateEffectiveLabLevel(allPlanets, planet.id, intergalacticResearchNetworkLevel)
  } else {
    researchLabLevel = planet.buildings[BuildingType.ResearchLab] || 1
  }

  const energyTechLevel = technologies[TechnologyType.EnergyTechnology] || 0
  // 獲取大學等級（加速研究）
  const universityLevel = planet.buildings[BuildingType.University] || 0

  const time = researchLogic.calculateTechnologyTime(
    techType,
    currentLevel,
    bonuses.researchSpeedBonus,
    researchLabLevel,
    energyTechLevel,
    1,
    universityLevel
  )

  // 扣除資源
  resourceLogic.deductResources(planet.resources, cost)

  // 建立佇列項
  const queueItem = researchLogic.createResearchQueueItem(techType, targetLevel, time)

  return { queueItem }
}

/**
 * 取消研究並計算返還資源
 */
export const cancelTechnologyResearch = (queueItem: BuildQueueItem): Resources => {
  const cost = researchLogic.calculateTechnologyCost(queueItem.itemType as TechnologyType, queueItem.targetLevel || 1)

  return {
    metal: Math.floor(cost.metal * 0.5),
    crystal: Math.floor(cost.crystal * 0.5),
    deuterium: Math.floor(cost.deuterium * 0.5),
    darkMatter: Math.floor(cost.darkMatter * 0.5),
    energy: 0
  }
}
