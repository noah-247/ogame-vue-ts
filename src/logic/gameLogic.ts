import type { Planet, Player, BuildQueueItem, Officer } from '@/types/game'
import { TechnologyType, OfficerType } from '@/types/game'
import * as officerLogic from './officerLogic'
import * as buildingLogic from './buildingLogic'
import * as researchLogic from './researchLogic'
import * as pointsLogic from './pointsLogic'
import * as planetLogic from './planetLogic'
import * as resourceLogic from './resourceLogic'
import * as achievementLogic from './achievementLogic'
import * as unlockLogic from './unlockLogic'
import * as waitingQueueLogic from './waitingQueueLogic'
import type { UnlockedItem } from './unlockLogic'

/**
 * 初始化玩家資料
 */
export const initializePlayer = (playerId: string, playerName: string = 'Commander'): Player => {
  const player: Player = {
    id: playerId,
    name: playerName,
    planets: [],
    technologies: {} as Record<TechnologyType, number>,
    officers: {} as Record<OfficerType, Officer>,
    researchQueue: [],
    waitingResearchQueue: [], // 研究等待佇列
    fleetMissions: [],
    missileAttacks: [],
    battleReports: [],
    spyReports: [],
    spiedNotifications: [],
    npcActivityNotifications: [],
    missionReports: [],
    incomingFleetAlerts: [],
    giftNotifications: [],
    giftRejectedNotifications: [],
    diplomaticReports: [],
    points: 0
  }

  // 初始化科技等級
  Object.values(TechnologyType).forEach(tech => {
    player.technologies[tech] = 0
  })

  // 初始化軍官狀態
  Object.values(OfficerType).forEach(officer => {
    player.officers[officer] = officerLogic.createInactiveOfficer(officer)
  })

  return player
}

/**
 * 檢查是否需要初始化遊戲
 */
export const shouldInitializeGame = (planets: Planet[]): boolean => {
  return planets.length === 0
}

/**
 * 更新所有星球的最後更新時間
 */
export const updatePlanetsLastUpdate = (planets: Planet[], now: number): void => {
  planets.forEach(planet => {
    planet.lastUpdate = now
  })
}

/**
 * 生成星系位置列表
 */
export const generateSystemPositions = (
  _galaxy: number,
  _system: number,
  count: number = 10
): Array<{ position: number; planet: Planet | null }> => {
  const result: Array<{ position: number; planet: Planet | null }> = []
  for (let pos = 1; pos <= count; pos++) {
    result.push({ position: pos, planet: null })
  }
  return result
}

/**
 * 生成隨機NPC星球位置
 */
export const generateRandomPosition = (): { galaxy: number; system: number; position: number } => {
  return {
    galaxy: Math.floor(Math.random() * 9) + 1,
    system: Math.floor(Math.random() * 10) + 1,
    position: Math.floor(Math.random() * 10) + 1
  }
}

/**
 * 生成位置鍵
 */
export const generatePositionKey = (galaxy: number, system: number, position: number): string => {
  return `${galaxy}:${system}:${position}`
}

/**
 * 更新遊戲狀態 - 處理所有星球和任務
 */
export const processGameUpdate = (
  player: Player,
  now: number,
  gameSpeed: number = 1,
  onNotification?: (type: string, itemType: string, level?: number) => void,
  onUnlock?: (unlockedItems: UnlockedItem[]) => void
): {
  updatedResearchQueue: BuildQueueItem[]
} => {
  // 確保成就統計資料存在
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }
  if (!player.achievements) {
    player.achievements = achievementLogic.initializeAchievements()
  }

  // 獲取軍官加成
  const bonuses = officerLogic.calculateActiveBonuses(player.officers, now)

  // 建立積分回撥函式
  const onPointsEarned = (points: number, _type: string, _itemType: string, _level?: number, _quantity?: number) => {
    pointsLogic.addPoints(player, points)
  }

  // 儲存完成前的狀態（用於解鎖檢查）
  const previousTechnologies = { ...player.technologies }

  // 通知回撥 + 成就統計更新
  const onCompleted = (type: string, itemType: string, level?: number, quantity?: number) => {
    if (onNotification) {
      onNotification(type, itemType, level)
    }
    // 更新成就統計
    if (player.achievementStats) {
      if (type === 'building' && level !== undefined) {
        achievementLogic.updateBuildingStats(player.achievementStats, itemType as any, level)
      } else if (type === 'technology' && level !== undefined) {
        achievementLogic.updateResearchStats(player.achievementStats, itemType as any, level)
      } else if (type === 'ship' && quantity !== undefined) {
        achievementLogic.updateShipProductionStats(player.achievementStats, itemType as any, quantity)
      } else if (type === 'defense' && quantity !== undefined) {
        achievementLogic.updateDefenseProductionStats(player.achievementStats, itemType as any, quantity)
      }
    }
  }

  // 收集所有新解鎖的內容
  const allUnlockedItems: UnlockedItem[] = []

  // 獲取採礦技術等級（用於礦脈恢復上限計算）
  const miningTechLevel = player.technologies[TechnologyType.MiningTechnology] || 0
  // 獲取資源研究科技等級
  const techBonuses = {
    mineralResearchLevel: player.technologies[TechnologyType.MineralResearch] || 0,
    crystalResearchLevel: player.technologies[TechnologyType.CrystalResearch] || 0,
    fuelResearchLevel: player.technologies[TechnologyType.FuelResearch] || 0
  }

  /**
   * B1 修復：逐事件結算。
   * 舊邏輯先完成區間內所有建築、再用完工後等級結算整段時間——若離線期間
   * 任何時點斷電（某礦/設施完工導致用電超過發電），整段離線產量歸零。
   * 新邏輯按完工時間點切分割槽間：每段用該段起始時的建築等級結算資源，
   * 再結算該時間點的完工事件；中途斷電隻影響斷電後的分段，不吞掉整段。
   */
  const settlePlanetEventStepped = (planet: Planet): void => {
    const from = planet.lastUpdate
    const eventTimes = new Set<number>()
    for (const item of planet.buildQueue) {
      if (item.endTime > from && item.endTime <= now) eventTimes.add(item.endTime)
    }
    const sortedTimes = [...eventTimes].sort((a, b) => a - b)

    // 計算更新前的資源（用於成就生產統計：整段口徑，與舊邏輯一致）
    const resourcesBefore = { ...planet.resources }

    for (const eventTime of sortedTimes) {
      // 先用完工前等級結算 [lastUpdate, eventTime]，再結算該時間點的完工
      resourceLogic.updatePlanetResources(planet, eventTime, bonuses, gameSpeed, miningTechLevel, techBonuses)
      buildingLogic.completeBuildQueue(planet, now, onPointsEarned, onCompleted, eventTime)
    }
    // 最後一段：[最後事件, now]
    resourceLogic.updatePlanetResources(planet, now, bonuses, gameSpeed, miningTechLevel, techBonuses)
    buildingLogic.completeBuildQueue(planet, now, onPointsEarned, onCompleted, now)

    // 追蹤資源生產統計
    if (player.achievementStats) {
      const metalProduced = Math.max(0, planet.resources.metal - resourcesBefore.metal)
      const crystalProduced = Math.max(0, planet.resources.crystal - resourcesBefore.crystal)
      const deuteriumProduced = Math.max(0, planet.resources.deuterium - resourcesBefore.deuterium)
      const darkMatterProduced = Math.max(0, planet.resources.darkMatter - resourcesBefore.darkMatter)

      if (metalProduced > 0 || crystalProduced > 0 || deuteriumProduced > 0 || darkMatterProduced > 0) {
        achievementLogic.updateResourceProductionStats(player.achievementStats, {
          metal: metalProduced,
          crystal: crystalProduced,
          deuterium: deuteriumProduced,
          darkMatter: darkMatterProduced
        })
      }
    }
  }

  // 逐星球：逐事件結算建造與資源（取代舊的「先全完成、再整段結算」）
  player.planets.forEach(planet => {
    // 儲存完成前的建築狀態
    const previousBuildings = { ...planet.buildings }

    settlePlanetEventStepped(planet)

    // 檢查新解鎖（只在主星球上檢查，避免重複通知）
    if (!planet.isMoon && onUnlock) {
      const unlockedItems = unlockLogic.checkAllNewlyUnlocked(planet, player.technologies, previousBuildings, previousTechnologies)
      allUnlockedItems.push(...unlockedItems)
    }

    // 更新星球最大空間
    if (planet.isMoon) {
      planet.maxSpace = planetLogic.calculateMoonMaxSpace(planet)
    } else {
      const terraformingTechLevel = player.technologies[TechnologyType.TerraformingTechnology] || 0
      planet.maxSpace = planetLogic.calculatePlanetMaxSpace(planet, terraformingTechLevel)
    }
  })

  // 檢查研究佇列
  const updatedResearchQueue = researchLogic.completeResearchQueue(
    player.researchQueue,
    player.technologies,
    now,
    onPointsEarned,
    onCompleted
  )

  // 重要：先更新 player.researchQueue，再處理等待佇列
  // 這樣等待佇列處理時可以正確 push 新專案到佇列中
  player.researchQueue = updatedResearchQueue

  // 處理等待佇列自動執行
  const waitingResult = waitingQueueLogic.processAllWaitingQueues(player, now)
  // 如果有等待佇列項被執行，可以在這裡新增通知（可選）
  if (waitingResult.executed.length > 0 && onNotification) {
    waitingResult.executed.forEach(item => {
      // 通知等待佇列項已移至正式佇列
      onNotification('waitingQueueMoved', item.itemType as string, item.targetLevel || item.quantity)
    })
  }

  // 如果科技完成，再次檢查解鎖（使用第一個非月球星球）
  if (onUnlock && player.technologies !== previousTechnologies) {
    const mainPlanet = player.planets.find(p => !p.isMoon)
    if (mainPlanet) {
      // 這裡使用完成後的建築狀態，因為我們只關心科技完成帶來的解鎖
      const techUnlockedItems = unlockLogic.checkAllNewlyUnlocked(
        mainPlanet,
        player.technologies,
        mainPlanet.buildings,
        previousTechnologies
      )
      // 去重（避免與建築完成時的解鎖重複）
      techUnlockedItems.forEach(item => {
        if (!allUnlockedItems.some(existing => existing.type === item.type && existing.id === item.id)) {
          allUnlockedItems.push(item)
        }
      })
    }
  }

  // 觸發解鎖通知
  if (onUnlock && allUnlockedItems.length > 0) {
    onUnlock(allUnlockedItems)
  }

  // 返回當前的研究佇列（包含等待佇列處理後新增的新項）
  return {
    updatedResearchQueue: player.researchQueue
  }
}

/**
 * 檢查並返回過期的軍官列表
 */
export const checkOfficersExpiration = (officers: Record<OfficerType, Officer>, now: number): void => {
  officerLogic.checkAndDeactivateExpiredOfficers(officers, now)
}

/**
 * 檢查成就進度並解鎖新成就
 */
export const checkAndUnlockAchievements = (player: Player): achievementLogic.AchievementUnlock[] => {
  if (!player.achievementStats || !player.achievements) {
    return []
  }

  const unlocks = achievementLogic.checkAchievements(player)

  // 應用獎勵
  unlocks.forEach(unlock => {
    achievementLogic.applyAchievementReward(player, unlock.reward)
  })

  return unlocks
}

/**
 * 更新資源消耗統計
 */
export const trackResourceConsumption = (
  player: Player,
  consumed: { metal?: number; crystal?: number; deuterium?: number; darkMatter?: number }
): void => {
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }
  achievementLogic.updateResourceConsumptionStats(player.achievementStats, consumed)
}

/**
 * 更新攻擊統計（玩家作為攻擊者）
 */
export const trackAttackStats = (player: Player, battleResult: any, won: boolean, debrisValue: number): void => {
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }
  achievementLogic.updateAttackStats(player.achievementStats, battleResult, won, debrisValue)
}

/**
 * 更新防禦統計（玩家作為防禦者）
 */
export const trackDefenseStats = (player: Player, battleResult: any, won: boolean, debrisValue: number): void => {
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }
  achievementLogic.updateDefenseStats(player.achievementStats, battleResult, won, debrisValue)
}

/**
 * 更新任務統計
 */
export const trackMissionStats = (
  player: Player,
  missionType: string,
  details?: {
    resourcesAmount?: number
    successful?: boolean
    fuelAmount?: number
  }
): void => {
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }

  const stats = player.achievementStats
  achievementLogic.updateFlightMissionStats(stats)

  switch (missionType) {
    case 'transport':
      if (details?.resourcesAmount) {
        achievementLogic.updateTransportStats(stats, details.resourcesAmount)
      }
      break
    case 'colonize':
      achievementLogic.updateColonizationStats(stats)
      break
    case 'spy':
      achievementLogic.updateSpyStats(stats)
      break
    case 'deploy':
      achievementLogic.updateDeploymentStats(stats)
      break
    case 'expedition':
      achievementLogic.updateExpeditionStats(stats, details?.successful ?? false)
      break
    case 'recycle':
      // 回收任務總是計入任務次數，但只有有資源時才增加回收資源量
      achievementLogic.updateRecyclingStats(stats, details?.resourcesAmount ?? 0)
      break
    case 'destroy':
      achievementLogic.updatePlanetDestructionStats(stats)
      break
  }

  if (details?.fuelAmount) {
    achievementLogic.updateFuelConsumptionStats(stats, details.fuelAmount)
  }
}

/**
 * 更新外交統計
 */
export const trackDiplomacyStats = (
  player: Player,
  eventType: string,
  details?: {
    resourcesAmount?: number
    friendlyCount?: number
    hostileCount?: number
  }
): void => {
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }

  const stats = player.achievementStats

  switch (eventType) {
    case 'gift':
      if (details?.resourcesAmount) {
        achievementLogic.updateGiftStats(stats, details.resourcesAmount)
      }
      break
    case 'attackedByNPC':
      achievementLogic.updateAttackedByNPCStats(stats)
      break
    case 'spiedByNPC':
      achievementLogic.updateSpiedByNPCStats(stats)
      break
    case 'debrisRecycledByNPC':
      if (details?.resourcesAmount) {
        achievementLogic.updateDebrisRecycledByNPCStats(stats, details.resourcesAmount)
      }
      break
    case 'updateRelations':
      if (details?.friendlyCount !== undefined) {
        achievementLogic.updateFriendlyNPCStats(stats, details.friendlyCount)
      }
      if (details?.hostileCount !== undefined) {
        achievementLogic.updateHostileNPCStats(stats, details.hostileCount)
      }
      break
  }
}

/**
 * 追蹤燃料消耗（在艦隊出發時呼叫）
 */
export const trackFuelConsumption = (player: Player, fuelAmount: number): void => {
  if (!player.achievementStats) {
    player.achievementStats = achievementLogic.initializeAchievementStats()
  }
  achievementLogic.updateFuelConsumptionStats(player.achievementStats, fuelAmount)
}
