/**
 * 解鎖檢查邏輯
 * 用於檢測建築/科技完成後新解鎖的內容
 */

import { BuildingType, TechnologyType, type Planet } from '@/types/game'
import { BUILDINGS, TECHNOLOGIES } from '@/config/gameConfig'
import * as buildingLogic from './buildingLogic'
import * as researchLogic from './researchLogic'

export interface UnlockedItem {
  type: 'building' | 'technology'
  id: BuildingType | TechnologyType
  name: string
}

/**
 * 檢查哪些建築在完成建築/科技後被新解鎖
 */
export const checkNewlyUnlockedBuildings = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  previousBuildings: Partial<Record<BuildingType, number>>,
  previousTechnologies: Partial<Record<TechnologyType, number>>
): UnlockedItem[] => {
  const newlyUnlocked: UnlockedItem[] = []

  // 遍歷所有建築型別
  for (const buildingType of Object.values(BuildingType)) {
    const config = BUILDINGS[buildingType]
    if (!config) continue

    // 跳過已經建造過的建築（等級 > 0）
    if ((planet.buildings[buildingType] || 0) > 0) continue

    // 檢查之前是否已解鎖
    const wasUnlockedBefore = checkBuildingRequirementsWith(buildingType, previousBuildings, previousTechnologies)

    // 檢查現在是否解鎖
    const isUnlockedNow = buildingLogic.checkBuildingRequirements(buildingType, planet, technologies)

    // 如果之前未解鎖，現在解鎖了，則是新解鎖
    if (!wasUnlockedBefore && isUnlockedNow) {
      newlyUnlocked.push({
        type: 'building',
        id: buildingType,
        name: config.name
      })
    }
  }

  return newlyUnlocked
}

/**
 * 檢查哪些科技在完成建築/科技後被新解鎖
 */
export const checkNewlyUnlockedTechnologies = (
  buildings: Partial<Record<BuildingType, number>>,
  technologies: Partial<Record<TechnologyType, number>>,
  previousBuildings: Partial<Record<BuildingType, number>>,
  previousTechnologies: Partial<Record<TechnologyType, number>>
): UnlockedItem[] => {
  const newlyUnlocked: UnlockedItem[] = []

  // 遍歷所有科技型別
  for (const techType of Object.values(TechnologyType)) {
    const config = TECHNOLOGIES[techType]
    if (!config) continue

    // 跳過已經研究過的科技（等級 > 0）
    if ((technologies[techType] || 0) > 0) continue

    // 檢查之前是否已解鎖
    const wasUnlockedBefore = researchLogic.checkTechnologyRequirements(techType, previousBuildings, previousTechnologies)

    // 檢查現在是否解鎖
    const isUnlockedNow = researchLogic.checkTechnologyRequirements(techType, buildings, technologies)

    // 如果之前未解鎖，現在解鎖了，則是新解鎖
    if (!wasUnlockedBefore && isUnlockedNow) {
      newlyUnlocked.push({
        type: 'technology',
        id: techType,
        name: config.name
      })
    }
  }

  return newlyUnlocked
}

/**
 * 使用指定的建築和科技等級檢查建築需求
 * （用於與之前狀態比較）
 */
const checkBuildingRequirementsWith = (
  buildingType: BuildingType,
  buildings: Partial<Record<BuildingType, number>>,
  technologies: Partial<Record<TechnologyType, number>>
): boolean => {
  const config = BUILDINGS[buildingType]
  const requirements = (config as any).requirements
  if (!requirements) return true

  for (const [key, level] of Object.entries(requirements)) {
    const requiredLevel = level as number
    if (Object.values(BuildingType).includes(key as BuildingType)) {
      if ((buildings[key as BuildingType] || 0) < requiredLevel) {
        return false
      }
    } else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
      if ((technologies[key as TechnologyType] || 0) < requiredLevel) {
        return false
      }
    }
  }
  return true
}

/**
 * 檢查所有新解鎖的內容（建築 + 科技）
 */
export const checkAllNewlyUnlocked = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  previousBuildings: Partial<Record<BuildingType, number>>,
  previousTechnologies: Partial<Record<TechnologyType, number>>
): UnlockedItem[] => {
  const unlockedBuildings = checkNewlyUnlockedBuildings(planet, technologies, previousBuildings, previousTechnologies)

  const unlockedTechnologies = checkNewlyUnlockedTechnologies(planet.buildings, technologies, previousBuildings, previousTechnologies)

  return [...unlockedBuildings, ...unlockedTechnologies]
}
