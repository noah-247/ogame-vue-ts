/**
 * 戰役系統邏輯
 * 處理任務進度、解鎖、完成等核心邏輯
 */

import {
  QuestStatus,
  ObjectiveType,
  type Player,
  type PlayerCampaignProgress,
  type QuestObjective,
  type QuestReward,
  type QuestNotification,
  type CampaignQuestConfig,
  type NPC,
  RelationStatus,
  type BuildingType,
  type TechnologyType,
  type ShipType
} from '@/types/game'
import { MAIN_CAMPAIGN, getAllQuests, getQuestById, getQuestsByChapter } from '@/config/campaignConfig'
import { generateId } from '@/utils/id'
import * as resourceLogic from './resourceLogic'

/**
 * 初始化玩家戰役進度
 */
export const initializeCampaignProgress = (player: Player): PlayerCampaignProgress => {
  // 如果已有進度，返回現有進度
  if (player.campaignProgress) {
    return player.campaignProgress
  }

  // 建立初始進度，第一個任務預設解鎖
  const firstQuest = getQuestsByChapter(1)[0]
  const progress: PlayerCampaignProgress = {
    campaignId: MAIN_CAMPAIGN.id,
    currentChapter: 1,
    currentQuestId: firstQuest?.id,
    questProgress: {},
    completedQuests: [],
    unlockedQuests: firstQuest ? [firstQuest.id] : [],
    branchChoices: {}
  }

  // 初始化第一個任務為可接取狀態
  if (firstQuest) {
    progress.questProgress[firstQuest.id] = {
      questId: firstQuest.id,
      status: QuestStatus.Available,
      objectives: {}
    }
    // 初始化目標進度
    const questProgress = progress.questProgress[firstQuest.id]
    if (questProgress) {
      firstQuest.objectives.forEach(obj => {
        questProgress.objectives[obj.id] = {
          current: 0,
          completed: false
        }
      })
    }
  }

  return progress
}

/**
 * 獲取任務狀態
 */
export const getQuestStatus = (progress: PlayerCampaignProgress, questId: string): QuestStatus => {
  const questProgress = progress.questProgress[questId]
  if (questProgress) {
    return questProgress.status
  }

  // 檢查是否已解鎖
  if (progress.unlockedQuests.includes(questId)) {
    return QuestStatus.Available
  }

  return QuestStatus.Locked
}

/**
 * 開始任務
 */
export const startQuest = (player: Player, questId: string): { success: boolean; error?: string } => {
  const progress = player.campaignProgress
  if (!progress) {
    return { success: false, error: 'campaign.errors.notInitialized' }
  }

  const quest = getQuestById(questId)
  if (!quest) {
    return { success: false, error: 'campaign.errors.questNotFound' }
  }

  // 檢查是否已解鎖
  if (!progress.unlockedQuests.includes(questId)) {
    return { success: false, error: 'campaign.errors.questLocked' }
  }

  // 檢查是否已完成
  if (progress.completedQuests.includes(questId)) {
    return { success: false, error: 'campaign.errors.questAlreadyCompleted' }
  }

  // 初始化或更新任務進度
  if (!progress.questProgress[questId]) {
    progress.questProgress[questId] = {
      questId,
      status: QuestStatus.Active,
      objectives: {},
      startedAt: Date.now()
    }
  }
  const questProgress = progress.questProgress[questId]
  if (questProgress) {
    questProgress.status = QuestStatus.Active
    questProgress.startedAt = Date.now()
    // 初始化目標進度
    quest.objectives.forEach(obj => {
      if (!questProgress.objectives[obj.id]) {
        questProgress.objectives[obj.id] = {
          current: 0,
          completed: false
        }
      }
    })
  }

  progress.currentQuestId = questId

  return { success: true }
}

/**
 * 檢查單個目標的進度
 */
export const checkObjectiveProgress = (player: Player, objective: QuestObjective, npcs: NPC[]): number => {
  switch (objective.type) {
    case ObjectiveType.BuildBuilding: {
      // 檢查玩家所有星球上該建築的最高等級
      const targetLevel = objective.targetSecondary as number
      const buildingType = objective.target as BuildingType
      const hasBuilding = player.planets.some(planet => {
        const level = planet.buildings[buildingType] || 0
        return level >= targetLevel
      })
      return hasBuilding ? 1 : 0
    }

    case ObjectiveType.ResearchTech: {
      const targetLevel = objective.targetSecondary as number
      const techType = objective.target as TechnologyType
      const currentLevel = player.technologies[techType] || 0
      return currentLevel >= targetLevel ? 1 : 0
    }

    case ObjectiveType.ProduceShips: {
      // 統計所有星球上該型別艦船的總數
      const shipType = objective.target as ShipType
      let totalShips = 0
      player.planets.forEach(planet => {
        totalShips += planet.fleet[shipType] || 0
      })
      return Math.min(totalShips, objective.required)
    }

    case ObjectiveType.AccumulateResources: {
      // 統計所有星球的資源總量
      let totalResources = 0
      player.planets.forEach(planet => {
        totalResources += planet.resources.metal + planet.resources.crystal + planet.resources.deuterium
      })
      return Math.min(totalResources, objective.required)
    }

    case ObjectiveType.Colonize: {
      // 統計殖民地數量（不包括母星）
      const colonyCount = player.planets.length - 1
      return Math.min(colonyCount, objective.required)
    }

    case ObjectiveType.SpyTarget: {
      // 統計偵查報告數量
      const target = objective.target
      if (target === 'any') {
        return Math.min(player.spyReports.length, objective.required)
      } else if (target === 'hostile') {
        // 統計敵對NPC的偵查報告
        const hostileNpcIds = npcs
          .filter(npc => {
            const relation = npc.relations?.[player.id]
            return relation?.status === RelationStatus.Hostile
          })
          .map(npc => npc.id)
        const hostileReports = player.spyReports.filter(report => hostileNpcIds.includes(report.targetPlayerId || ''))
        return Math.min(hostileReports.length, objective.required)
      }
      return 0
    }

    case ObjectiveType.SendGift: {
      // 從成就統計中獲取送禮次數
      return Math.min(player.achievementStats?.giftsSent || 0, objective.required)
    }

    case ObjectiveType.Expedition: {
      // 從成就統計中獲取探險次數（使用 expeditionsTotal）
      return Math.min(player.achievementStats?.expeditionsTotal || 0, objective.required)
    }

    case ObjectiveType.WinBattles: {
      const target = objective.target
      if (target === 'attack') {
        return Math.min(player.achievementStats?.attacksWon || 0, objective.required)
      } else if (target === 'defense') {
        // 使用 defensesSuccessful 代替 defensesWon
        return Math.min(player.achievementStats?.defensesSuccessful || 0, objective.required)
      }
      const totalWins = (player.achievementStats?.attacksWon || 0) + (player.achievementStats?.defensesSuccessful || 0)
      return Math.min(totalWins, objective.required)
    }

    case ObjectiveType.RecycleDebris: {
      return Math.min(player.achievementStats?.recyclingMissions || 0, objective.required)
    }

    case ObjectiveType.ReachRelation: {
      // 檢查是否有任何NPC達到指定關係等級
      const targetStatus = objective.target as string
      const hasRelation = npcs.some(npc => {
        const relation = npc.relations?.[player.id]
        return relation?.status === targetStatus
      })
      return hasRelation ? 1 : 0
    }

    case ObjectiveType.FormAlliance: {
      // 檢查是否有盟友（使用 Friendly 作為最高關係等級）
      const hasAlliance = npcs.some(npc => {
        const relation = npc.relations?.[player.id]
        return relation?.status === RelationStatus.Friendly && (relation.reputation || 0) >= 80
      })
      return hasAlliance ? 1 : 0
    }

    case ObjectiveType.DefeatNPC: {
      // 檢查攻擊NPC獲勝次數
      return Math.min(player.achievementStats?.attacksWon || 0, objective.required)
    }

    case ObjectiveType.DestroyPlanet: {
      return Math.min(player.achievementStats?.planetDestructions || 0, objective.required)
    }

    default:
      return 0
  }
}

/**
 * 更新任務進度
 */
export const updateQuestProgress = (
  player: Player,
  questId: string,
  npcs: NPC[]
): {
  updated: boolean
  completedObjectives: string[]
  questCompleted: boolean
} => {
  const result = {
    updated: false,
    completedObjectives: [] as string[],
    questCompleted: false
  }

  const progress = player.campaignProgress
  if (!progress) return result

  const questProgress = progress.questProgress[questId]
  if (!questProgress || questProgress.status !== QuestStatus.Active) return result

  const quest = getQuestById(questId)
  if (!quest) return result

  // 檢查每個目標的進度
  quest.objectives.forEach(objective => {
    const objProgress = questProgress.objectives[objective.id]
    if (!objProgress || objProgress.completed) return

    const newProgress = checkObjectiveProgress(player, objective, npcs)
    if (newProgress !== objProgress.current) {
      objProgress.current = newProgress
      result.updated = true

      // 檢查目標是否完成
      if (newProgress >= objective.required && !objProgress.completed) {
        objProgress.completed = true
        result.completedObjectives.push(objective.id)
      }
    }
  })

  // 檢查任務是否全部完成
  const allCompleted = quest.objectives.every(obj => questProgress.objectives[obj.id]?.completed)

  if (allCompleted && questProgress.status === QuestStatus.Active) {
    questProgress.status = QuestStatus.Completed
    questProgress.completedAt = Date.now()
    result.questCompleted = true
  }

  return result
}

/**
 * 領取任務獎勵
 */
export const claimQuestRewards = (
  player: Player,
  questId: string
): {
  success: boolean
  rewards?: QuestReward
  error?: string
} => {
  const progress = player.campaignProgress
  if (!progress) {
    return { success: false, error: 'campaign.errors.notInitialized' }
  }

  const questProgress = progress.questProgress[questId]
  if (!questProgress) {
    return { success: false, error: 'campaign.errors.questNotFound' }
  }

  if (questProgress.status !== QuestStatus.Completed) {
    return { success: false, error: 'campaign.errors.questNotCompleted' }
  }

  if (questProgress.rewardsClaimed) {
    return { success: false, error: 'campaign.errors.rewardsAlreadyClaimed' }
  }

  const quest = getQuestById(questId)
  if (!quest) {
    return { success: false, error: 'campaign.errors.questNotFound' }
  }

  // 發放獎勵
  const rewards = quest.rewards
  const currentPlanet = player.planets[0] // 預設發放到第一個星球

  if (rewards.resources && currentPlanet) {
    resourceLogic.addResources(currentPlanet.resources, rewards.resources)
  }

  if (rewards.darkMatter && currentPlanet) {
    currentPlanet.resources.darkMatter += rewards.darkMatter
  }

  if (rewards.points) {
    // 獎勵積分存入 bonusPoints，不會被 calculatePlayerPoints 覆蓋
    player.bonusPoints = (player.bonusPoints || 0) + rewards.points
  }

  if (rewards.ships && currentPlanet) {
    Object.entries(rewards.ships).forEach(([shipType, count]) => {
      const ship = shipType as ShipType
      currentPlanet.fleet[ship] = (currentPlanet.fleet[ship] || 0) + count
    })
  }

  // 標記獎勵已領取
  questProgress.rewardsClaimed = true

  // 將任務新增到已完成列表
  if (!progress.completedQuests.includes(questId)) {
    progress.completedQuests.push(questId)
  }

  // 解鎖後續任務
  unlockNextQuests(player, questId)

  return { success: true, rewards }
}

/**
 * 解鎖後續任務
 */
export const unlockNextQuests = (player: Player, _completedQuestId: string): string[] => {
  const progress = player.campaignProgress
  if (!progress) return []

  const unlockedQuests: string[] = []
  const allQuests = getAllQuests()

  allQuests.forEach(quest => {
    // 跳過已解鎖的任務
    if (progress.unlockedQuests.includes(quest.id)) return

    // 檢查前置任務是否完成
    if (quest.requiredQuestIds && quest.requiredQuestIds.length > 0) {
      const allRequiredCompleted = quest.requiredQuestIds.every(reqId => progress.completedQuests.includes(reqId))

      if (allRequiredCompleted) {
        progress.unlockedQuests.push(quest.id)
        unlockedQuests.push(quest.id)

        // 初始化任務進度
        progress.questProgress[quest.id] = {
          questId: quest.id,
          status: QuestStatus.Available,
          objectives: {}
        }
        const questProgress = progress.questProgress[quest.id]
        if (questProgress) {
          quest.objectives.forEach(obj => {
            questProgress.objectives[obj.id] = {
              current: 0,
              completed: false
            }
          })
        }

        // 更新當前章節
        if (quest.chapter > progress.currentChapter) {
          progress.currentChapter = quest.chapter
        }
      }
    }
  })

  return unlockedQuests
}

/**
 * 計算戰役總進度百分比
 */
export const calculateCampaignProgress = (progress: PlayerCampaignProgress): number => {
  const totalQuests = getAllQuests().length
  const completedCount = progress.completedQuests.length
  return Math.round((completedCount / totalQuests) * 100)
}

/**
 * 計算章節進度百分比
 */
export const calculateChapterProgress = (progress: PlayerCampaignProgress, chapterNumber: number): number => {
  const chapterQuests = getQuestsByChapter(chapterNumber)
  const completedCount = chapterQuests.filter(quest => progress.completedQuests.includes(quest.id)).length
  return Math.round((completedCount / chapterQuests.length) * 100)
}

/**
 * 計算單個任務的進度百分比
 */
export const calculateQuestProgress = (progress: PlayerCampaignProgress, questId: string): number => {
  const questProgress = progress.questProgress[questId]
  if (!questProgress) return 0

  const quest = getQuestById(questId)
  if (!quest) return 0

  // 計算所有目標的平均進度
  const objectives = quest.objectives
  if (objectives.length === 0) return 0

  let totalProgress = 0
  objectives.forEach(obj => {
    const objProgress = questProgress.objectives[obj.id]
    if (objProgress) {
      if (objProgress.completed) {
        totalProgress += 100
      } else {
        totalProgress += Math.min((objProgress.current / obj.required) * 100, 100)
      }
    }
  })

  return Math.round(totalProgress / objectives.length)
}

/**
 * 獲取當前可進行的任務列表
 */
export const getAvailableQuests = (progress: PlayerCampaignProgress): CampaignQuestConfig[] => {
  return getAllQuests().filter(quest => {
    const status = getQuestStatus(progress, quest.id)
    return status === QuestStatus.Available || status === QuestStatus.Active
  })
}

/**
 * 獲取當前啟用的任務
 */
export const getActiveQuest = (progress: PlayerCampaignProgress): CampaignQuestConfig | undefined => {
  if (!progress.currentQuestId) return undefined
  return getQuestById(progress.currentQuestId)
}

/**
 * 建立任務通知
 */
export const createQuestNotification = (
  questId: string,
  eventType: QuestNotification['eventType'],
  messageKey: string,
  messageParams?: Record<string, string | number>,
  rewards?: QuestReward
): QuestNotification => {
  const quest = getQuestById(questId)
  return {
    id: generateId('quest_notification'),
    timestamp: Date.now(),
    questId,
    questTitleKey: quest?.titleKey || '',
    eventType,
    messageKey,
    messageParams,
    rewards,
    read: false
  }
}

/**
 * 新增任務通知到玩家
 */
export const addQuestNotification = (player: Player, notification: QuestNotification): void => {
  if (!player.questNotifications) {
    player.questNotifications = []
  }
  player.questNotifications.unshift(notification)

  // 限制通知數量
  if (player.questNotifications.length > 50) {
    player.questNotifications = player.questNotifications.slice(0, 50)
  }
}

/**
 * 標記通知為已讀
 */
export const markQuestNotificationRead = (player: Player, notificationId: string): void => {
  const notification = player.questNotifications?.find(n => n.id === notificationId)
  if (notification) {
    notification.read = true
  }
}

/**
 * 獲取未讀通知數量
 */
export const getUnreadQuestNotificationCount = (player: Player): number => {
  return player.questNotifications?.filter(n => !n.read).length || 0
}

/**
 * 檢查並更新所有啟用任務的進度
 */
export const checkAllActiveQuestsProgress = (player: Player, npcs: NPC[]): QuestNotification[] => {
  const notifications: QuestNotification[] = []
  const progress = player.campaignProgress

  if (!progress) return notifications

  // 遍歷所有啟用的任務
  Object.entries(progress.questProgress).forEach(([questId, questProgress]) => {
    if (questProgress.status !== QuestStatus.Active) return

    const result = updateQuestProgress(player, questId, npcs)

    // 為完成的目標建立通知
    result.completedObjectives.forEach(objId => {
      const quest = getQuestById(questId)
      const objective = quest?.objectives.find(o => o.id === objId)
      if (objective) {
        notifications.push(
          createQuestNotification(questId, 'objective_completed', 'campaign.notifications.objectiveCompleted', {
            objective: objective.descriptionKey
          })
        )
      }
    })

    // 任務完成通知
    if (result.questCompleted) {
      const quest = getQuestById(questId)
      notifications.push(createQuestNotification(questId, 'quest_completed', 'campaign.notifications.questCompleted', {}, quest?.rewards))
    }
  })

  // 新增通知到玩家
  notifications.forEach(notification => {
    addQuestNotification(player, notification)
  })

  return notifications
}
