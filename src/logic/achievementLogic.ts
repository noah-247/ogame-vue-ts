import {
  AchievementTier,
  BuildingType,
  TechnologyType,
  ShipType,
  DefenseType,
  type AchievementStats,
  type AchievementProgress,
  type AchievementReward,
  type Player,
  type Resources,
  type BattleResult
} from '@/types/game'
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, getNextTier, getTierIndex } from '@/config/achievementConfig'

// 初始化空的成就統計資料
export const initializeAchievementStats = (): AchievementStats => {
  const emptyShipRecord = Object.values(ShipType).reduce(
    (acc, type) => {
      acc[type] = 0
      return acc
    },
    {} as Record<ShipType, number>
  )

  const emptyDefenseRecord = Object.values(DefenseType).reduce(
    (acc, type) => {
      acc[type] = 0
      return acc
    },
    {} as Record<DefenseType, number>
  )

  const emptyBuildingRecord = Object.values(BuildingType).reduce(
    (acc, type) => {
      acc[type] = 0
      return acc
    },
    {} as Record<BuildingType, number>
  )

  const emptyTechRecord = Object.values(TechnologyType).reduce(
    (acc, type) => {
      acc[type] = 0
      return acc
    },
    {} as Record<TechnologyType, number>
  )

  return {
    // 資源統計
    totalMetalProduced: 0,
    totalCrystalProduced: 0,
    totalDeuteriumProduced: 0,
    totalDarkMatterProduced: 0,
    totalMetalConsumed: 0,
    totalCrystalConsumed: 0,
    totalDeuteriumConsumed: 0,
    totalDarkMatterConsumed: 0,

    // 建造統計
    buildingsUpgraded: 0,
    maxBuildingLevel: { ...emptyBuildingRecord },
    researchCompleted: 0,
    maxTechnologyLevel: { ...emptyTechRecord },
    shipsProduced: { ...emptyShipRecord },
    totalShipsProduced: 0,
    defensesBuilt: { ...emptyDefenseRecord },
    totalDefensesBuilt: 0,

    // 戰鬥統計
    attacksLaunched: 0,
    attacksWon: 0,
    attacksLost: 0,
    fleetLostInAttack: { ...emptyShipRecord },
    totalFleetLostInAttack: 0,
    debrisCreatedFromAttacks: 0,
    defensesSuccessful: 0,
    defensesFailed: 0,
    fleetLostInDefense: { ...emptyShipRecord },
    totalFleetLostInDefense: 0,
    defenseLostInDefense: { ...emptyDefenseRecord },
    totalDefenseLostInDefense: 0,
    enemyFleetDestroyedInDefense: { ...emptyShipRecord },
    totalEnemyFleetDestroyedInDefense: 0,
    debrisCreatedFromDefenses: 0,

    // 任務統計
    totalFlightMissions: 0,
    transportMissions: 0,
    transportedResources: 0,
    colonizations: 0,
    spyMissions: 0,
    deployments: 0,
    expeditionsTotal: 0,
    expeditionsSuccessful: 0,
    recyclingMissions: 0,
    recycledResources: 0,
    planetDestructions: 0,
    fuelConsumed: 0,

    // 外交統計
    friendlyNPCCount: 0,
    hostileNPCCount: 0,
    giftsSent: 0,
    giftResourcesTotal: 0,
    attackedByNPC: 0,
    spiedByNPC: 0,
    debrisRecycledByNPC: 0,
    debrisResourcesLostToNPC: 0
  }
}

// 初始化所有成就進度
export const initializeAchievements = (): Record<string, AchievementProgress> => {
  const achievements: Record<string, AchievementProgress> = {}

  for (const config of ACHIEVEMENTS) {
    achievements[config.id] = {
      id: config.id,
      currentTier: null,
      currentValue: 0,
      tierUnlocks: {
        [AchievementTier.Bronze]: null,
        [AchievementTier.Silver]: null,
        [AchievementTier.Gold]: null,
        [AchievementTier.Platinum]: null,
        [AchievementTier.Diamond]: null
      }
    }
  }

  return achievements
}

// 獲取成就的當前值
const getAchievementValue = (stats: AchievementStats, statKey: string, checkType: string): number => {
  // 處理特殊的組合統計鍵
  if (statKey === 'totalResourcesConsumed') {
    return stats.totalMetalConsumed + stats.totalCrystalConsumed + stats.totalDeuteriumConsumed + stats.totalDarkMatterConsumed
  }

  if (statKey === 'totalDebrisCreated') {
    return stats.debrisCreatedFromAttacks + stats.debrisCreatedFromDefenses
  }

  if (statKey === 'totalFleetLost') {
    return stats.totalFleetLostInAttack + stats.totalFleetLostInDefense
  }

  // 處理普通統計鍵
  const value = stats[statKey as keyof AchievementStats]
  if (typeof value === 'number') {
    return value
  }

  // 處理 Record 型別的值（如果需要求和）
  if (checkType === 'sum' && typeof value === 'object') {
    return Object.values(value as Record<string, number>).reduce((a, b) => a + b, 0)
  }

  return 0
}

// 檢查並更新成就進度，返回新解鎖的成就
export interface AchievementUnlock {
  id: string
  tier: AchievementTier
  reward: AchievementReward
}

export const checkAchievements = (player: Player): AchievementUnlock[] => {
  if (!player.achievementStats || !player.achievements) {
    return []
  }

  const unlocks: AchievementUnlock[] = []
  const stats = player.achievementStats
  const achievements = player.achievements

  for (const config of ACHIEVEMENTS) {
    const progress = achievements[config.id]
    if (!progress) continue

    // 獲取當前值
    const currentValue = getAchievementValue(stats, config.statKey, config.checkType)
    progress.currentValue = currentValue

    // 檢查每個等級
    for (const tierConfig of config.tiers) {
      // 如果已經解鎖這個等級，跳過
      if (progress.tierUnlocks[tierConfig.tier] !== null) continue

      // 檢查是否達到目標
      let achieved = false
      if (config.checkType === 'gte' || config.checkType === 'sum') {
        achieved = currentValue >= tierConfig.target
      } else if (config.checkType === 'eq') {
        achieved = currentValue === tierConfig.target
      } else if (config.checkType === 'max') {
        achieved = currentValue >= tierConfig.target
      }

      if (achieved) {
        // 解鎖成就
        const now = Date.now()
        progress.tierUnlocks[tierConfig.tier] = now

        // 更新當前最高等級
        if (progress.currentTier === null || getTierIndex(tierConfig.tier) > getTierIndex(progress.currentTier)) {
          progress.currentTier = tierConfig.tier
          progress.unlockedAt = now
        }

        unlocks.push({
          id: config.id,
          tier: tierConfig.tier,
          reward: tierConfig.reward
        })
      }
    }
  }

  return unlocks
}

// 應用成就獎勵
export const applyAchievementReward = (player: Player, reward: AchievementReward): void => {
  const firstPlanet = player.planets[0]
  if (reward.darkMatter && firstPlanet) {
    // 獎勵新增到第一個星球的資源中
    firstPlanet.resources.darkMatter += reward.darkMatter
  }

  if (reward.points) {
    // 獎勵積分存入 bonusPoints，不會被 calculatePlayerPoints 覆蓋
    player.bonusPoints = (player.bonusPoints || 0) + reward.points
  }
}

// ==================== 統計更新函式 ====================

// 更新資源生產統計
export const updateResourceProductionStats = (
  stats: AchievementStats,
  produced: { metal?: number; crystal?: number; deuterium?: number; darkMatter?: number }
): void => {
  if (produced.metal) stats.totalMetalProduced += produced.metal
  if (produced.crystal) stats.totalCrystalProduced += produced.crystal
  if (produced.deuterium) stats.totalDeuteriumProduced += produced.deuterium
  if (produced.darkMatter) stats.totalDarkMatterProduced += produced.darkMatter
}

// 更新資源消耗統計
export const updateResourceConsumptionStats = (stats: AchievementStats, consumed: Partial<Resources>): void => {
  if (consumed.metal) stats.totalMetalConsumed += consumed.metal
  if (consumed.crystal) stats.totalCrystalConsumed += consumed.crystal
  if (consumed.deuterium) stats.totalDeuteriumConsumed += consumed.deuterium
  if (consumed.darkMatter) stats.totalDarkMatterConsumed += consumed.darkMatter
}

// 更新建築升級統計
export const updateBuildingStats = (stats: AchievementStats, buildingType: BuildingType, level: number): void => {
  stats.buildingsUpgraded += 1

  // 更新最高等級記錄
  if (level > (stats.maxBuildingLevel[buildingType] || 0)) {
    stats.maxBuildingLevel[buildingType] = level
  }
}

// 更新科技研究統計
export const updateResearchStats = (stats: AchievementStats, techType: TechnologyType, level: number): void => {
  stats.researchCompleted += 1

  // 更新最高等級記錄
  if (level > (stats.maxTechnologyLevel[techType] || 0)) {
    stats.maxTechnologyLevel[techType] = level
  }
}

// 更新艦船生產統計
export const updateShipProductionStats = (stats: AchievementStats, shipType: ShipType, quantity: number): void => {
  stats.shipsProduced[shipType] = (stats.shipsProduced[shipType] || 0) + quantity
  stats.totalShipsProduced += quantity
}

// 更新防禦建造統計
export const updateDefenseProductionStats = (stats: AchievementStats, defenseType: DefenseType, quantity: number): void => {
  stats.defensesBuilt[defenseType] = (stats.defensesBuilt[defenseType] || 0) + quantity
  stats.totalDefensesBuilt += quantity
}

// 更新攻擊統計（玩家作為攻擊者）
export const updateAttackStats = (stats: AchievementStats, battleResult: BattleResult, won: boolean, debrisValue: number): void => {
  // 攻擊也算飛行任務
  stats.totalFlightMissions += 1
  stats.attacksLaunched += 1

  if (won) {
    stats.attacksWon += 1
  } else if (battleResult.winner === 'defender') {
    stats.attacksLost += 1
  }

  // 記錄攻擊中損失的艦隊
  if (battleResult.attackerLosses) {
    for (const [shipType, count] of Object.entries(battleResult.attackerLosses)) {
      if (count && count > 0) {
        stats.fleetLostInAttack[shipType as ShipType] = (stats.fleetLostInAttack[shipType as ShipType] || 0) + count
        stats.totalFleetLostInAttack += count
      }
    }
  }

  // 記錄產生的殘骸
  stats.debrisCreatedFromAttacks += debrisValue
}

// 更新防禦統計（玩家作為防禦者）
export const updateDefenseStats = (stats: AchievementStats, battleResult: BattleResult, won: boolean, debrisValue: number): void => {
  if (won) {
    stats.defensesSuccessful += 1
  } else {
    stats.defensesFailed += 1
  }

  // 記錄防禦中損失的艦隊
  if (battleResult.defenderLosses?.fleet) {
    for (const [shipType, count] of Object.entries(battleResult.defenderLosses.fleet)) {
      if (count && count > 0) {
        stats.fleetLostInDefense[shipType as ShipType] = (stats.fleetLostInDefense[shipType as ShipType] || 0) + count
        stats.totalFleetLostInDefense += count
      }
    }
  }

  // 記錄防禦中損失的防禦設施
  if (battleResult.defenderLosses?.defense) {
    for (const [defenseType, count] of Object.entries(battleResult.defenderLosses.defense)) {
      if (count && count > 0) {
        stats.defenseLostInDefense[defenseType as DefenseType] = (stats.defenseLostInDefense[defenseType as DefenseType] || 0) + count
        stats.totalDefenseLostInDefense += count
      }
    }
  }

  // 記錄防禦中消滅的敵方艦隊
  if (battleResult.attackerLosses) {
    for (const [shipType, count] of Object.entries(battleResult.attackerLosses)) {
      if (count && count > 0) {
        stats.enemyFleetDestroyedInDefense[shipType as ShipType] = (stats.enemyFleetDestroyedInDefense[shipType as ShipType] || 0) + count
        stats.totalEnemyFleetDestroyedInDefense += count
      }
    }
  }

  // 記錄產生的殘骸
  stats.debrisCreatedFromDefenses += debrisValue
}

// 更新飛行任務統計
export const updateFlightMissionStats = (stats: AchievementStats): void => {
  stats.totalFlightMissions += 1
}

// 更新運輸任務統計
export const updateTransportStats = (stats: AchievementStats, resourcesAmount: number): void => {
  stats.transportMissions += 1
  stats.transportedResources += resourcesAmount
}

// 更新殖民統計
export const updateColonizationStats = (stats: AchievementStats): void => {
  stats.colonizations += 1
}

// 更新偵查統計
export const updateSpyStats = (stats: AchievementStats): void => {
  stats.spyMissions += 1
}

// 更新部署統計
export const updateDeploymentStats = (stats: AchievementStats): void => {
  stats.deployments += 1
}

// 更新探險統計
export const updateExpeditionStats = (stats: AchievementStats, successful: boolean): void => {
  stats.expeditionsTotal += 1
  if (successful) {
    stats.expeditionsSuccessful += 1
  }
}

// 更新回收統計
export const updateRecyclingStats = (stats: AchievementStats, resourcesAmount: number): void => {
  stats.recyclingMissions += 1
  stats.recycledResources += resourcesAmount
}

// 更新行星毀滅統計
export const updatePlanetDestructionStats = (stats: AchievementStats): void => {
  stats.planetDestructions += 1
}

// 更新燃料消耗統計
export const updateFuelConsumptionStats = (stats: AchievementStats, fuelAmount: number): void => {
  stats.fuelConsumed += fuelAmount
}

// 更新友好NPC數量
export const updateFriendlyNPCStats = (stats: AchievementStats, count: number): void => {
  stats.friendlyNPCCount = count
}

// 更新敵對NPC數量
export const updateHostileNPCStats = (stats: AchievementStats, count: number): void => {
  stats.hostileNPCCount = count
}

// 更新送禮統計
export const updateGiftStats = (stats: AchievementStats, resourcesAmount: number): void => {
  stats.giftsSent += 1
  stats.giftResourcesTotal += resourcesAmount
}

// 更新被NPC攻擊統計
export const updateAttackedByNPCStats = (stats: AchievementStats): void => {
  stats.attackedByNPC += 1
}

// 更新被NPC偵查統計
export const updateSpiedByNPCStats = (stats: AchievementStats): void => {
  stats.spiedByNPC += 1
}

// 更新被NPC回收殘骸統計
export const updateDebrisRecycledByNPCStats = (stats: AchievementStats, resourcesAmount: number): void => {
  stats.debrisRecycledByNPC += 1
  stats.debrisResourcesLostToNPC += resourcesAmount
}

// 獲取成就的下一個目標
export const getNextTarget = (achievementId: string, currentTier: AchievementTier | null): number | null => {
  const config = ACHIEVEMENT_MAP[achievementId]
  if (!config) return null

  const nextTier = getNextTier(currentTier)
  if (!nextTier) return null

  const tierConfig = config.tiers.find(t => t.tier === nextTier)
  return tierConfig?.target ?? null
}

// 獲取成就進度百分比
export const getAchievementProgress = (achievementId: string, currentValue: number, currentTier: AchievementTier | null): number => {
  const config = ACHIEVEMENT_MAP[achievementId]
  if (!config) return 0

  const nextTier = getNextTier(currentTier)
  if (!nextTier) return 100 // 已達到最高等級

  const tierConfig = config.tiers.find(t => t.tier === nextTier)
  if (!tierConfig) return 0

  // 計算當前等級的起始值
  let startValue = 0
  if (currentTier) {
    const currentTierConfig = config.tiers.find(t => t.tier === currentTier)
    startValue = currentTierConfig?.target ?? 0
  }

  const progress = ((currentValue - startValue) / (tierConfig.target - startValue)) * 100
  return Math.min(100, Math.max(0, progress))
}
