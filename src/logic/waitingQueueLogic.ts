/**
 * 等待佇列邏輯模組
 * 處理建築、科技、艦船、防禦的等待佇列功能
 */

import type { Planet, Player, WaitingQueueItem, Resources, Officer, BuildQueueItem } from '@/types/game'
import { BuildingType, TechnologyType, ShipType, DefenseType, OfficerType } from '@/types/game'
import * as buildingLogic from './buildingLogic'
import * as researchLogic from './researchLogic'
import * as shipLogic from './shipLogic'
import * as resourceLogic from './resourceLogic'
import * as publicLogic from './publicLogic'
import * as officerLogic from './officerLogic'
import * as buildingValidation from './buildingValidation'
import * as researchValidation from './researchValidation'
import { canAutopilotWork } from './autopilotBilling'
import * as shipValidation from './shipValidation'
import { getGameNow } from './gameTime'
import { checkEnergySafeWorstOrder, pendingEnergyDelta } from './autopilotLogic'

/**
 * 獲取等待佇列最大容量
 * 與正式佇列相同（建築: 3 + 奈米工廠等級，科技: 3 + 計算機技術等級，最多10）
 */
export const getMaxBuildWaitingQueue = (planet: Planet, additionalBuildQueue: number = 0): number => {
  return publicLogic.getMaxBuildQueue(planet, additionalBuildQueue)
}

export const getMaxResearchWaitingQueue = (technologies: Partial<Record<TechnologyType, number>>): number => {
  return publicLogic.getMaxResearchQueue(technologies)
}

/**
 * 建立建築等待佇列項
 */
export const createBuildingWaitingItem = (buildingType: BuildingType, targetLevel: number, planetId: string): WaitingQueueItem => {
  return {
    id: `waiting_building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'building',
    itemType: buildingType,
    targetLevel,
    priority: Date.now(),
    addedTime: Date.now(),
    planetId
  }
}

/**
 * 建立拆除等待佇列項
 */
export const createDemolishWaitingItem = (buildingType: BuildingType, targetLevel: number, planetId: string): WaitingQueueItem => {
  return {
    id: `waiting_demolish_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'demolish',
    itemType: buildingType,
    targetLevel,
    priority: Date.now(),
    addedTime: Date.now(),
    planetId
  }
}

/**
 * 建立科技等待佇列項
 */
export const createResearchWaitingItem = (techType: TechnologyType, targetLevel: number): WaitingQueueItem => {
  return {
    id: `waiting_tech_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'technology',
    itemType: techType,
    targetLevel,
    priority: Date.now(),
    addedTime: Date.now()
  }
}

/**
 * 建立艦船等待佇列項
 */
export const createShipWaitingItem = (shipType: ShipType, quantity: number, planetId: string): WaitingQueueItem => {
  return {
    id: `waiting_ship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'ship',
    itemType: shipType,
    quantity,
    priority: Date.now(),
    addedTime: Date.now(),
    planetId
  }
}

/**
 * 建立防禦等待佇列項
 */
export const createDefenseWaitingItem = (defenseType: DefenseType, quantity: number, planetId: string): WaitingQueueItem => {
  return {
    id: `waiting_defense_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'defense',
    itemType: defenseType,
    quantity,
    priority: Date.now(),
    addedTime: Date.now(),
    planetId
  }
}

/**
 * 計算等待佇列項的預估成本
 */
export const calculateWaitingItemCost = (item: WaitingQueueItem): Resources => {
  switch (item.type) {
    case 'building':
      return buildingLogic.calculateBuildingCost(item.itemType as BuildingType, item.targetLevel || 1)
    case 'demolish':
      // 拆除不需要資源
      return { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }
    case 'technology':
      return researchLogic.calculateTechnologyCost(item.itemType as TechnologyType, item.targetLevel || 1)
    case 'ship':
      return shipLogic.calculateShipCost(item.itemType as ShipType, item.quantity || 1)
    case 'defense':
      return shipLogic.calculateDefenseCost(item.itemType as DefenseType, item.quantity || 1)
    default:
      return { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }
  }
}

/**
 * 檢查資源是否足夠執行等待佇列項
 */
export const canExecuteWaitingItem = (item: WaitingQueueItem, resources: Resources): boolean => {
  const cost = calculateWaitingItemCost(item)
  return resourceLogic.checkResourcesAvailable(resources, cost)
}

/**
 * 檢查是否可以新增到建築等待佇列
 */
export const canAddToBuildWaitingQueue = (
  planet: Planet,
  item: WaitingQueueItem,
  officers: Record<OfficerType, Officer>
): { canAdd: boolean; reason?: string } => {
  const bonuses = officerLogic.calculateActiveBonuses(officers, getGameNow())
  const maxQueue = getMaxBuildWaitingQueue(planet, bonuses.additionalBuildQueue)
  const waitingQueue = planet.waitingBuildQueue || []

  if (waitingQueue.length >= maxQueue) {
    return { canAdd: false, reason: 'errors.waitingQueueFull' }
  }

  // 建築允許多次排隊（比如金屬礦升級到2、3、4、5級）
  // 拆除型別：不允許重複排隊
  if (item.type === 'demolish') {
    const buildingType = item.itemType as BuildingType
    const existsInWaiting = waitingQueue.some(q => q.type === 'demolish' && q.itemType === buildingType)
    const existsInQueue = planet.buildQueue.some(q => q.type === 'demolish' && q.itemType === buildingType)
    if (existsInWaiting || existsInQueue) {
      return { canAdd: false, reason: 'errors.buildingAlreadyInQueue' }
    }
  }

  return { canAdd: true }
}

/**
 * 檢查是否可以新增到研究等待佇列
 */
export const canAddToResearchWaitingQueue = (player: Player, _item: WaitingQueueItem): { canAdd: boolean; reason?: string } => {
  const maxQueue = getMaxResearchWaitingQueue(player.technologies)
  const waitingQueue = player.waitingResearchQueue || []

  if (waitingQueue.length >= maxQueue) {
    return { canAdd: false, reason: 'errors.waitingQueueFull' }
  }

  // 科技允許多次排隊（比如能源技術升級到2、3、4、5級）
  return { canAdd: true }
}

/**
 * 等待佇列排序：玩家手動項永遠在副官項前面（MAJ-3：玩家優先，副官不搶資源/槽位），
 * 同來源內再按 priority 升序（數字越小越靠前）。
 */
const compareWaitingItems = (a: WaitingQueueItem, b: WaitingQueueItem): number =>
  (a.source === 'autopilot' ? 1 : 0) - (b.source === 'autopilot' ? 1 : 0) || a.priority - b.priority

/**
 * 新增到建築等待佇列
 */
export const addToBuildWaitingQueue = (planet: Planet, item: WaitingQueueItem): void => {
  // 確保陣列存在（向後相容）
  if (!planet.waitingBuildQueue) {
    planet.waitingBuildQueue = []
  }
  planet.waitingBuildQueue.push(item)
  planet.waitingBuildQueue.sort(compareWaitingItems)
}

/**
 * 新增到研究等待佇列
 */
export const addToResearchWaitingQueue = (player: Player, item: WaitingQueueItem): void => {
  // 確保陣列存在（向後相容）
  if (!player.waitingResearchQueue) {
    player.waitingResearchQueue = []
  }
  player.waitingResearchQueue.push(item)
  player.waitingResearchQueue.sort(compareWaitingItems)
}

/**
 * 從建築等待佇列移除
 */
export const removeFromBuildWaitingQueue = (planet: Planet, itemId: string): WaitingQueueItem | null => {
  if (!planet.waitingBuildQueue) return null
  const index = planet.waitingBuildQueue.findIndex(q => q.id === itemId)
  if (index === -1) return null
  const [removed] = planet.waitingBuildQueue.splice(index, 1)
  return removed ?? null
}

/**
 * 從研究等待佇列移除
 */
export const removeFromResearchWaitingQueue = (player: Player, itemId: string): WaitingQueueItem | null => {
  if (!player.waitingResearchQueue) return null
  const index = player.waitingResearchQueue.findIndex(q => q.id === itemId)
  if (index === -1) return null
  const [removed] = player.waitingResearchQueue.splice(index, 1)
  return removed ?? null
}

/**
 * 處理單個星球的建築等待佇列
 * 當正式佇列為空且資源足夠時，自動將等待佇列項移至正式佇列
 */
export const processPlanetWaitingQueue = (
  planet: Planet,
  player: Player,
  officers: Record<OfficerType, Officer>,
  energyProductionBonus = officerLogic.calculateActiveBonuses(officers, getGameNow()).energyProductionBonus,
  energyBonusExpiresAt?: number
): { executed: WaitingQueueItem[]; messages: string[] } => {
  const executed: WaitingQueueItem[] = []
  const messages: string[] = []
  const now = getGameNow()
  const bonuses = officerLogic.calculateActiveBonuses(officers, now)

  for (const item of [...(planet.waitingBuildQueue || [])]) {
    if (item.type === 'building' && item.targetLevel !== undefined &&
        (planet.buildings[item.itemType as BuildingType] || 0) >= item.targetLevel) {
      removeFromBuildWaitingQueue(planet, item.id)
      messages.push('errors.levelAlreadyReached')
    }
  }

  // 檢查正式佇列是否為空
  const maxBuildQueue = publicLogic.getMaxBuildQueue(planet, bonuses.additionalBuildQueue)
  const buildingQueueCount = planet.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish').length

  // 佇列已滿，不處理
  if (buildingQueueCount >= maxBuildQueue) {
    return { executed, messages }
  }

  // 遍歷等待佇列（已按優先順序排序）
  const waitingQueue = planet.waitingBuildQueue || []
  const itemsToProcess = [...waitingQueue]
  // v3 計費守衛（§4.1）：副官來源的等待項無有效合約時不開工；手動項（player/預設）不受影響。
  // 等待佇列執行早於副官 tick，只在 tick 檢查不夠，開工入口必須擋。
  const autopilotMayWork = canAutopilotWork(player.autopilotContract)
  for (const waitingItem of itemsToProcess) {
    if (planet.autopilot?.mode === 'monitor' && waitingItem.source === 'autopilot') continue
    if (waitingItem.source === 'autopilot' && !autopilotMayWork) continue
    // 檢查正式佇列是否還有空位
    const currentBuildQueueCount = planet.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish').length
    if (currentBuildQueueCount >= maxBuildQueue) break

    // 根據型別執行不同處理
    if (waitingItem.type === 'building') {
      if (waitingItem.source === 'autopilot') {
        const energyHorizon = Math.max(
          now,
          ...planet.buildQueue
            .filter(item => item.type === 'building' || item.type === 'demolish')
            .map(item => item.endTime || 0)
        )
        const bonus = energyBonusExpiresAt !== undefined && energyBonusExpiresAt < energyHorizon ? 0 : energyProductionBonus
        const { consDelta, prodDelta } = pendingEnergyDelta(planet, waitingItem, bonus)
        if (!(consDelta <= 0 && prodDelta >= 0) && !checkEnergySafeWorstOrder(planet, bonus, [waitingItem]).safe) continue
      }
      const result = tryExecuteBuildingWaitingItem(planet, waitingItem, player.technologies, officers)
      if (result.success && result.queueItem) {
        planet.buildQueue.push(result.queueItem)
        removeFromBuildWaitingQueue(planet, waitingItem.id)
        executed.push(waitingItem)
        messages.push(result.message || '')
      }
    } else if (waitingItem.type === 'demolish') {
      const result = tryExecuteDemolishWaitingItem(planet, waitingItem, officers)
      if (result.success && result.queueItem) {
        planet.buildQueue.push(result.queueItem)
        removeFromBuildWaitingQueue(planet, waitingItem.id)
        executed.push(waitingItem)
        messages.push(result.message || '')
      }
    } else if (waitingItem.type === 'ship') {
      const result = tryExecuteShipWaitingItem(planet, waitingItem, player.technologies, officers)
      if (result.success && result.queueItem) {
        planet.buildQueue.push(result.queueItem)
        removeFromBuildWaitingQueue(planet, waitingItem.id)
        executed.push(waitingItem)
        messages.push(result.message || '')
      }
    } else if (waitingItem.type === 'defense') {
      const result = tryExecuteDefenseWaitingItem(planet, waitingItem, player.technologies, officers)
      if (result.success && result.queueItem) {
        planet.buildQueue.push(result.queueItem)
        removeFromBuildWaitingQueue(planet, waitingItem.id)
        executed.push(waitingItem)
        messages.push(result.message || '')
      }
    }
  }

  return { executed, messages }
}

/**
 * 處理研究等待佇列
 */
export const processResearchWaitingQueue = (
  player: Player,
  currentPlanet: Planet,
  officers: Record<OfficerType, Officer>
): { executed: WaitingQueueItem[]; messages: string[] } => {
  const executed: WaitingQueueItem[] = []
  const messages: string[] = []

  for (const item of [...(player.waitingResearchQueue || [])]) {
    if (item.type === 'technology' && item.targetLevel !== undefined &&
        (player.technologies[item.itemType as TechnologyType] || 0) >= item.targetLevel) {
      removeFromResearchWaitingQueue(player, item.id)
      messages.push('errors.levelAlreadyReached')
    }
  }

  // 檢查正式佇列是否為空
  const maxResearchQueue = publicLogic.getMaxResearchQueue(player.technologies)
  if (player.researchQueue.length >= maxResearchQueue) {
    return { executed, messages }
  }

  // 遍歷等待佇列
  const waitingResearchQueue = player.waitingResearchQueue || []
  const itemsToProcess = [...waitingResearchQueue]
  // v3 計費守衛（§4.1）：副官來源的研究等待項無有效合約時不開工；手動項不受影響。
  const autopilotMayWork = canAutopilotWork(player.autopilotContract)
  for (const waitingItem of itemsToProcess) {
    if (player.researchQueue.length >= maxResearchQueue) break
    if (currentPlanet.autopilot?.mode === 'monitor' && waitingItem.source === 'autopilot') continue
    if (waitingItem.source === 'autopilot' && !autopilotMayWork) continue

    if (waitingItem.type === 'technology') {
      const result = tryExecuteResearchWaitingItem(currentPlanet, waitingItem, player, officers)
      if (result.success && result.queueItem) {
        player.researchQueue.push(result.queueItem)
        removeFromResearchWaitingQueue(player, waitingItem.id)
        executed.push(waitingItem)
        messages.push(result.message || '')
      }
    }
  }

  return { executed, messages }
}

/**
 * 嘗試執行建築等待項
 */
const tryExecuteBuildingWaitingItem = (
  planet: Planet,
  item: WaitingQueueItem,
  technologies: Partial<Record<TechnologyType, number>>,
  officers: Record<OfficerType, Officer>
): { success: boolean; queueItem?: BuildQueueItem; message?: string } => {
  const buildingType = item.itemType as BuildingType
  const currentLevel = planet.buildings[buildingType] || 0
  const waitingTargetLevel = item.targetLevel || currentLevel + 1

  // 檢查目標等級是否仍然正確（可能在等待期間已經升級了）
  if (currentLevel >= waitingTargetLevel) {
    return { success: false, message: 'errors.levelAlreadyReached' }
  }

  // 實際執行的目標等級是當前等級+1
  const actualTargetLevel = currentLevel + 1

  // 驗證升級條件
  // 跳過以下錯誤，因為它們不影響下一級升級：
  // - buildQueueFull: 我們已經在外層檢查了
  // - buildingAlreadyInQueue: 同一建築可能在佇列中（等待前一級完成）
  // - insufficientResources: 我們會在下面單獨檢查實際需要的資源
  const validation = buildingValidation.validateBuildingUpgrade(planet, buildingType, technologies, officers)
  if (!validation.valid &&
      validation.reason !== 'errors.buildQueueFull' &&
      validation.reason !== 'errors.buildingAlreadyInQueue' &&
      validation.reason !== 'errors.insufficientResources') {
    return { success: false, message: validation.reason }
  }

  // 檢查同一建築是否已在正式佇列中（等待前一級完成）
  const existingInQueue = planet.buildQueue.find(
    q => (q.type === 'building' || q.type === 'demolish') && q.itemType === buildingType
  )
  if (existingInQueue) {
    // 同一建築已在佇列中，暫時不執行，等待完成後再處理
    return { success: false, message: 'errors.buildingAlreadyInQueue' }
  }

  // 檢查實際需要的資源（下一級的成本，不是等待佇列項的目標等級）
  const cost = buildingLogic.calculateBuildingCost(buildingType, actualTargetLevel)
  if (!resourceLogic.checkResourcesAvailable(planet.resources, cost)) {
    return { success: false, message: 'errors.insufficientResources' }
  }

  // 執行升級
  const queueItem = buildingValidation.executeBuildingUpgrade(planet, buildingType, officers)
  return { success: true, queueItem, message: 'queue.movedToQueue' }
}

/**
 * 嘗試執行拆除等待項
 */
const tryExecuteDemolishWaitingItem = (
  planet: Planet,
  item: WaitingQueueItem,
  officers: Record<OfficerType, Officer>
): { success: boolean; queueItem?: BuildQueueItem; message?: string } => {
  const buildingType = item.itemType as BuildingType
  const currentLevel = planet.buildings[buildingType] || 0
  const waitingTargetLevel = item.targetLevel || currentLevel - 1

  // 檢查等級是否仍然可拆除
  if (currentLevel <= 0 || currentLevel <= waitingTargetLevel) {
    return { success: false, message: 'errors.buildingLevelZero' }
  }

  // 驗證拆除條件
  const validation = buildingValidation.validateBuildingDemolish(planet, buildingType, officers)
  if (!validation.valid && validation.reason !== 'errors.buildQueueFull') {
    return { success: false, message: validation.reason }
  }

  // 檢查同一建築是否已在正式佇列中（等待前一次拆除完成）
  const existingInQueue = planet.buildQueue.find(
    q => (q.type === 'building' || q.type === 'demolish') && q.itemType === buildingType
  )
  if (existingInQueue) {
    // 同一建築已在佇列中，暫時不執行，等待完成後再處理
    return { success: false, message: 'errors.buildingAlreadyInQueue' }
  }

  // 執行拆除
  const queueItem = buildingValidation.executeBuildingDemolish(planet, buildingType, officers)
  return { success: true, queueItem, message: 'queue.movedToQueue' }
}

/**
 * 嘗試執行艦船等待項
 */
const tryExecuteShipWaitingItem = (
  planet: Planet,
  item: WaitingQueueItem,
  technologies: Partial<Record<TechnologyType, number>>,
  officers: Record<OfficerType, Officer>
): { success: boolean; queueItem?: BuildQueueItem; message?: string } => {
  const shipType = item.itemType as ShipType
  const quantity = item.quantity || 1

  // 驗證建造條件
  const validation = shipValidation.validateShipBuild(planet, shipType, quantity, technologies)
  if (!validation.valid) {
    return { success: false, message: validation.reason }
  }

  // 執行建造
  const queueItem = shipValidation.executeShipBuild(planet, shipType, quantity, officers)
  return { success: true, queueItem, message: 'queue.movedToQueue' }
}

/**
 * 嘗試執行防禦等待項
 */
const tryExecuteDefenseWaitingItem = (
  planet: Planet,
  item: WaitingQueueItem,
  technologies: Partial<Record<TechnologyType, number>>,
  officers: Record<OfficerType, Officer>
): { success: boolean; queueItem?: BuildQueueItem; message?: string } => {
  const defenseType = item.itemType as DefenseType
  const quantity = item.quantity || 1

  // 驗證建造條件
  const validation = shipValidation.validateDefenseBuild(planet, defenseType, quantity, technologies)
  if (!validation.valid) {
    return { success: false, message: validation.reason }
  }

  // 執行建造
  const queueItem = shipValidation.executeDefenseBuild(planet, defenseType, quantity, officers)
  return { success: true, queueItem, message: 'queue.movedToQueue' }
}

/**
 * 嘗試執行研究等待項
 */
const tryExecuteResearchWaitingItem = (
  planet: Planet,
  item: WaitingQueueItem,
  player: Player,
  officers: Record<OfficerType, Officer>
): { success: boolean; queueItem?: BuildQueueItem; message?: string } => {
  const techType = item.itemType as TechnologyType
  const currentLevel = player.technologies[techType] || 0
  const waitingTargetLevel = item.targetLevel || currentLevel + 1

  // 檢查目標等級是否仍然正確
  if (currentLevel >= waitingTargetLevel) {
    return { success: false, message: 'errors.levelAlreadyReached' }
  }

  // 實際執行的目標等級是當前等級+1
  const actualTargetLevel = currentLevel + 1

  // 驗證研究條件
  // 跳過以下錯誤：
  // - researchQueueFull: 我們已經在外層檢查了
  // - technologyAlreadyInQueue: 同一科技可能在佇列中（等待前一級完成）
  // - insufficientResources: 我們會在下面單獨檢查實際需要的資源
  const validation = researchValidation.validateTechnologyResearch(planet, techType, player.technologies, player.researchQueue)
  if (!validation.valid &&
      validation.reason !== 'errors.researchQueueFull' &&
      validation.reason !== 'errors.technologyAlreadyInQueue' &&
      validation.reason !== 'errors.insufficientResources') {
    return { success: false, message: validation.reason }
  }

  // 檢查同一科技是否已在研究佇列中（等待前一級完成）
  const existingInQueue = player.researchQueue.find(q => q.itemType === techType)
  if (existingInQueue) {
    // 同一科技已在佇列中，暫時不執行，等待完成後再處理
    return { success: false, message: 'errors.technologyAlreadyInQueue' }
  }

  // 檢查實際需要的資源（下一級的成本，不是等待佇列項的目標等級）
  const cost = researchLogic.calculateTechnologyCost(techType, actualTargetLevel)
  if (!resourceLogic.checkResourcesAvailable(planet.resources, cost)) {
    return { success: false, message: 'errors.insufficientResources' }
  }

  // 執行研究
  const result = researchValidation.executeTechnologyResearch(planet, techType, currentLevel, officers, player.technologies)
  return { success: true, queueItem: result.queueItem, message: 'queue.movedToQueue' }
}

/**
 * 處理所有等待佇列（在 gameLoop 中呼叫）
 */
export const processAllWaitingQueues = (player: Player, now: number): { executed: WaitingQueueItem[]; messages: string[] } => {
  const allExecuted: WaitingQueueItem[] = []
  const allMessages: string[] = []
  const { energyProductionBonus } = officerLogic.calculateActiveBonuses(player.officers, now)
  const energyBonusExpiresAt = officerLogic.getEnergyBonusExpiresAt(player.officers, now)

  // 處理所有星球的建築等待佇列
  for (const planet of player.planets) {
    const result = processPlanetWaitingQueue(planet, player, player.officers, energyProductionBonus, energyBonusExpiresAt)
    allExecuted.push(...result.executed)
    allMessages.push(...result.messages)
  }

  // 處理研究等待佇列（使用第一個有研究實驗室的星球）
  const labPlanet = player.planets.find(p => (p.buildings[BuildingType.ResearchLab] || 0) > 0)
  if (labPlanet) {
    const result = processResearchWaitingQueue(player, labPlanet, player.officers)
    allExecuted.push(...result.executed)
    allMessages.push(...result.messages)
  }

  return { executed: allExecuted, messages: allMessages }
}

/**
 * 獲取等待佇列項的顯示名稱
 */
export const getWaitingItemName = (item: WaitingQueueItem): string => {
  switch (item.type) {
    case 'building':
    case 'demolish':
      return `buildings.${item.itemType}`
    case 'technology':
      return `technologies.${item.itemType}`
    case 'ship':
      return `ships.${item.itemType}`
    case 'defense':
      return `defenses.${item.itemType}`
    default:
      return 'unknown'
  }
}
