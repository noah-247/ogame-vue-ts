import type {
  NPC,
  Planet,
  Player,
  FleetMission,
  SpyReport,
  SpiedNotification,
  IncomingFleetAlert,
  Fleet,
  DebrisField,
  Resources,
  TradeOffer,
  IntelReport,
  JointAttackInvite,
  IntelType,
  AidNotification,
  AllyDefenseNotification,
  AttitudeChangeNotification
} from '@/types/game'
import { MissionType, ShipType, DefenseType, TechnologyType, RelationStatus, NPCAIType } from '@/types/game'

// 重新匯出型別供外部使用
export type { TradeOffer, IntelReport, JointAttackInvite, IntelType, AidNotification, AllyDefenseNotification, AttitudeChangeNotification }
import * as fleetLogic from './fleetLogic'
import * as diplomaticLogic from './diplomaticLogic'
import * as resourceLogic from './resourceLogic'
import { getGameNow } from './gameTime'
import { DIPLOMATIC_CONFIG, SHIPS, DEFENSES } from '@/config/gameConfig'

// ========== 敵對NPC增強行為型別定義 ==========

/**
 * 騷擾任務型別
 */
export type HarassmentType = 'spy' | 'raid' | 'intimidate'

/**
 * 報復等級
 */
export interface RevengeLevel {
  attackCount: number
  fleetMultiplier: number
  attackInterval: number
  name: string
}

/**
 * 圍攻協調資訊
 */
export interface SiegeCoordination {
  targetPlanetId: string
  targetPosition: { galaxy: number; system: number; position: number }
  coordinatorNpcId: string
  participantNpcIds: string[]
  arrivalTime: number
  startedAt: number
}

// TradeOffer, IntelReport, JointAttackInvite, IntelType 型別已移至 @/types/game.ts

/**
 * NPC之間的關係
 */
export interface NPCRelation {
  npcId: string
  targetNpcId: string
  status: 'ally' | 'neutral' | 'enemy'
  strength: number // 關係強度 0-100
  lastUpdated: number
}

/**
 * NPC聯盟
 */
export interface NPCAlliance {
  id: string
  name: string
  leaderNpcId: string
  memberNpcIds: string[]
  enemyNpcIds: string[]
  createdAt: number
}

/**
 * 輔助函式：獲取艦隊中最慢船隻的速度
 * 用於計算飛行時間
 */
const getFleetMinSpeed = (fleet: Partial<Fleet>): number => {
  let minSpeed = Infinity
  for (const [shipType, count] of Object.entries(fleet)) {
    if ((count || 0) > 0) {
      const shipConfig = SHIPS[shipType as ShipType]
      if (shipConfig) {
        minSpeed = Math.min(minSpeed, shipConfig.speed)
      }
    }
  }
  return minSpeed === Infinity ? 10000 : minSpeed // 預設使用基礎速度
}

/**
 * AI 型別行為修改器
 * 根據 NPC 的 AI 型別調整其行為引數
 */
export interface AIBehaviorModifier {
  spyFrequencyMultiplier: number // 偵查頻率倍率（越高偵查越頻繁）
  attackFrequencyMultiplier: number // 攻擊頻率倍率
  attackProbabilityMultiplier: number // 攻擊機率倍率
  fleetSizeMultiplier: number // 出擊艦隊比例倍率
  giftProbabilityMultiplier: number // 贈送禮物機率倍率
  revengeMultiplier: number // 反擊傾向倍率
  defenseFocus: boolean // 是否優先發展防禦
  willAttackWhenHostile: boolean // 敵對時是否會主動攻擊
  willSpyWhenHostile: boolean // 敵對時是否會偵查
}

/**
 * 獲取 AI 型別的行為修改器
 */
export const getAIBehaviorModifier = (aiType?: NPCAIType): AIBehaviorModifier => {
  switch (aiType) {
    case NPCAIType.Aggressive:
      // 侵略型：高頻偵查攻擊，大艦隊出擊，不送禮，強烈反擊
      return {
        spyFrequencyMultiplier: 1.5,
        attackFrequencyMultiplier: 1.5,
        attackProbabilityMultiplier: 1.3,
        fleetSizeMultiplier: 1.2,
        giftProbabilityMultiplier: 0,
        revengeMultiplier: 2.0,
        defenseFocus: false,
        willAttackWhenHostile: true,
        willSpyWhenHostile: true
      }

    case NPCAIType.Defensive:
      // 防守型：低頻偵查，幾乎不主動攻擊，但被攻擊後強烈反擊
      return {
        spyFrequencyMultiplier: 0.3,
        attackFrequencyMultiplier: 0.1,
        attackProbabilityMultiplier: 0.1,
        fleetSizeMultiplier: 0.5,
        giftProbabilityMultiplier: 0.5,
        revengeMultiplier: 3.0, // 反擊很強烈
        defenseFocus: true,
        willAttackWhenHostile: false, // 即使敵對也不主動攻擊
        willSpyWhenHostile: true // 但會偵查監視
      }

    case NPCAIType.Trader:
      // 商人型：幾乎不攻擊，高機率送禮，被攻擊後輕微反擊
      return {
        spyFrequencyMultiplier: 0.2,
        attackFrequencyMultiplier: 0.05,
        attackProbabilityMultiplier: 0.05,
        fleetSizeMultiplier: 0.3,
        giftProbabilityMultiplier: 3.0, // 高機率送禮
        revengeMultiplier: 0.5, // 反擊意願低
        defenseFocus: false,
        willAttackWhenHostile: false,
        willSpyWhenHostile: false
      }

    case NPCAIType.Expansionist:
      // 擴張型：中等偵查頻率，較少攻擊，專注發展
      return {
        spyFrequencyMultiplier: 0.7,
        attackFrequencyMultiplier: 0.4,
        attackProbabilityMultiplier: 0.5,
        fleetSizeMultiplier: 0.6,
        giftProbabilityMultiplier: 1.0,
        revengeMultiplier: 1.0,
        defenseFocus: false,
        willAttackWhenHostile: true,
        willSpyWhenHostile: true
      }

    case NPCAIType.Balanced:
    default:
      // 平衡型（預設）：標準行為
      return {
        spyFrequencyMultiplier: 1.0,
        attackFrequencyMultiplier: 1.0,
        attackProbabilityMultiplier: 1.0,
        fleetSizeMultiplier: 1.0,
        giftProbabilityMultiplier: 1.0,
        revengeMultiplier: 1.0,
        defenseFocus: false,
        willAttackWhenHostile: true,
        willSpyWhenHostile: true
      }
  }
}

/**
 * 根據 AI 型別調整動態行為配置
 */
export const applyAIModifierToConfig = (config: DynamicBehaviorConfig, modifier: AIBehaviorModifier): DynamicBehaviorConfig => {
  return {
    ...config,
    spyInterval: Math.floor(config.spyInterval / modifier.spyFrequencyMultiplier),
    attackInterval: Math.floor(config.attackInterval / modifier.attackFrequencyMultiplier),
    attackProbability: Math.min(1.0, config.attackProbability * modifier.attackProbabilityMultiplier),
    attackFleetSizeRatio: Math.min(1.0, config.attackFleetSizeRatio * modifier.fleetSizeMultiplier)
  }
}

/**
 * NPC行為決策系統
 *
 * 流程：
 * 1. NPC定期偵查玩家星球
 * 2. 玩家收到"被偵查"通知
 * 3. 基於偵查結果，NPC決定是否攻擊
 * 4. NPC發起攻擊，玩家收到實時警告
 * 5. NPC檢測並回收自己星球附近的殘骸
 * 6. NPC被攻擊後會做出防禦性反應或反擊
 */

// 動態行為配置介面
export interface DynamicBehaviorConfig {
  spyInterval: number
  attackInterval: number
  attackProbability: number
  minSpyProbes: number
  attackFleetSizeRatio: number
  maxConcurrentSpyMissions: number // 同時最多多少個偵查任務
  maxConcurrentAttackMissions: number // 同時最多多少個攻擊任務
}

/**
 * 根據玩家積分計算動態NPC行為配置
 * 積分越高，NPC越激進
 */
export const calculateDynamicBehavior = (playerPoints: number): DynamicBehaviorConfig => {
  if (playerPoints < 1000) {
    // 新手階段：NPC溫和但會主動偵查攻擊
    return {
      spyInterval: 300, // 5分鐘偵查一次
      attackInterval: 300, // 5分鐘攻擊一次（與偵查同步，偵查完就攻擊）
      attackProbability: 0.4,
      minSpyProbes: 1,
      attackFleetSizeRatio: 0.3, // 只派30%艦隊
      maxConcurrentSpyMissions: 3,
      maxConcurrentAttackMissions: 2
    }
  } else if (playerPoints < 5000) {
    // 初級階段：NPC比較激進
    return {
      spyInterval: 420, // 7分鐘偵查一次
      attackInterval: 420, // 7分鐘攻擊一次（與偵查同步）
      attackProbability: 0.45,
      minSpyProbes: 2,
      attackFleetSizeRatio: 0.5, // 派50%艦隊
      maxConcurrentSpyMissions: 5,
      maxConcurrentAttackMissions: 3
    }
  } else if (playerPoints < 20000) {
    // 中級階段：NPC很激進
    return {
      spyInterval: 360, // 6分鐘偵查一次
      attackInterval: 360, // 6分鐘攻擊一次（與偵查同步）
      attackProbability: 0.55,
      minSpyProbes: 3,
      attackFleetSizeRatio: 0.7, // 派70%艦隊
      maxConcurrentSpyMissions: 8,
      maxConcurrentAttackMissions: 5
    }
  } else if (playerPoints < 50000) {
    // 高階階段：NPC非常激進
    return {
      spyInterval: 300, // 5分鐘偵查一次
      attackInterval: 300, // 5分鐘攻擊一次（與偵查同步）
      attackProbability: 0.65,
      minSpyProbes: 4,
      attackFleetSizeRatio: 0.85, // 派85%艦隊
      maxConcurrentSpyMissions: 10,
      maxConcurrentAttackMissions: 8
    }
  } else {
    // 專家階段：NPC極度激進
    return {
      spyInterval: 240, // 4分鐘偵查一次
      attackInterval: 240, // 4分鐘攻擊一次（與偵查同步）
      attackProbability: 0.8,
      minSpyProbes: 5,
      attackFleetSizeRatio: 0.95, // 派95%艦隊
      maxConcurrentSpyMissions: 15,
      maxConcurrentAttackMissions: 12
    }
  }
}

/**
 * 檢查NPC是否應該偵查玩家
 */
export const shouldNPCSpyPlayer = (npc: NPC, player: Player, currentTime: number, config: DynamicBehaviorConfig): boolean => {
  // 新手保護：積分低於1000的玩家不會被偵查
  const playerPoints = player.points || 0
  if (playerPoints < 1000) {
    return false
  }

  // 獲取 AI 行為修改器
  const aiModifier = getAIBehaviorModifier(npc.aiType)

  // 檢查外交關係 - 統一使用 npc.relations
  const relation = npc.relations?.[player.id]

  // 如果沒有關係資料，視為中立，不偵查
  if (!relation) {
    return false
  }

  // 友好或中立NPC不偵查
  if (relation.status === RelationStatus.Friendly || relation.status === RelationStatus.Neutral) {
    return false
  }

  // 只有敵對NPC才會繼續
  if (relation.status !== RelationStatus.Hostile) {
    return false
  }

  // 根據 AI 型別判斷是否會偵查
  if (!aiModifier.willSpyWhenHostile) {
    return false
  }

  // 只有敵對NPC才會到達這裡，檢查冷卻時間（根據 AI 型別調整）
  const adjustedConfig = applyAIModifierToConfig(config, aiModifier)
  const lastSpyTime = npc.lastSpyTime || 0
  if (currentTime - lastSpyTime < adjustedConfig.spyInterval * 1000) {
    return false
  }

  // 敵對NPC且冷卻結束，執行偵查
  return true
}

/**
 * 檢查NPC是否應該攻擊玩家
 */
export const shouldNPCAttackPlayer = (npc: NPC, player: Player, currentTime: number, config: DynamicBehaviorConfig): boolean => {
  // 新手保護：積分低於1000的玩家不會被攻擊
  const playerPoints = player.points || 0
  if (playerPoints < 1000) {
    return false
  }

  // 獲取 AI 行為修改器
  const aiModifier = getAIBehaviorModifier(npc.aiType)

  // 檢查外交關係 - 統一使用 npc.relations
  const relation = npc.relations?.[player.id]

  // 如果沒有關係資料，視為中立，不攻擊
  if (!relation) {
    return false
  }

  // 友好或中立NPC不攻擊
  if (relation.status === RelationStatus.Friendly || relation.status === RelationStatus.Neutral) {
    return false
  }

  // 只有敵對NPC才會繼續
  if (relation.status !== RelationStatus.Hostile) {
    return false
  }

  // 根據 AI 型別判斷是否會主動攻擊
  if (!aiModifier.willAttackWhenHostile) {
    return false
  }

  // 檢查攻擊冷卻（根據 AI 型別調整）
  const adjustedConfig = applyAIModifierToConfig(config, aiModifier)
  const lastAttackTime = npc.lastAttackTime || 0
  if (currentTime - lastAttackTime < adjustedConfig.attackInterval * 1000) {
    return false
  }

  // 必須有偵查報告才能攻擊
  if (!npc.playerSpyReports || Object.keys(npc.playerSpyReports).length === 0) {
    return false
  }

  // 根據 AI 型別的攻擊機率決定是否攻擊
  // 侵略型總是攻擊，其他型別按機率
  if (aiModifier.attackProbabilityMultiplier < 1.0) {
    if (Math.random() > adjustedConfig.attackProbability) {
      return false
    }
  }

  return true
}

/**
 * 檢查NPC是否應該贈送資源給玩家
 */
export const shouldNPCGiftPlayer = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { NPC_GIFT_CONFIG } = DIPLOMATIC_CONFIG

  // 檢查功能是否啟用
  if (!NPC_GIFT_CONFIG.ENABLED) {
    return false
  }

  // 獲取 AI 行為修改器
  const aiModifier = getAIBehaviorModifier(npc.aiType)

  // 侵略型 NPC 永遠不送禮
  if (aiModifier.giftProbabilityMultiplier === 0) {
    return false
  }

  // 檢查上次贈送時間（商人型間隔更短）
  const lastGiftTime = (npc as any).lastGiftTime || 0
  const giftInterval = NPC_GIFT_CONFIG.CHECK_INTERVAL / aiModifier.giftProbabilityMultiplier
  if (currentTime - lastGiftTime < giftInterval * 1000) {
    return false
  }

  // 檢查好感度 - 統一使用 npc.relations
  // 商人型 NPC 好感度門檻更低
  const relation = npc.relations?.[player.id]
  const minReputation = npc.aiType === NPCAIType.Trader ? NPC_GIFT_CONFIG.MIN_REPUTATION * 0.5 : NPC_GIFT_CONFIG.MIN_REPUTATION
  if (!relation || relation.reputation < minReputation) {
    return false
  }

  // 隨機機率（根據 AI 型別調整）
  const giftProbability = NPC_GIFT_CONFIG.GIFT_PROBABILITY * aiModifier.giftProbabilityMultiplier
  return Math.random() < giftProbability
}

/**
 * 計算玩家的總資源產量（每小時）
 */
const calculatePlayerTotalProduction = (player: Player): { metal: number; crystal: number; deuterium: number } => {
  let totalMetal = 0
  let totalCrystal = 0
  let totalDeuterium = 0

  // 計算當前啟用的軍官加成
  const bonuses = player.officers
    ? {
        resourceProductionBonus: Object.values(player.officers).reduce((sum, officer) => {
          if (officer.active && officer.expiresAt && officer.expiresAt > getGameNow()) {
            return sum + (officer.bonuses?.resourceProductionBonus || 0)
          }
          return sum
        }, 0),
        darkMatterProductionBonus: Object.values(player.officers).reduce((sum, officer) => {
          if (officer.active && officer.expiresAt && officer.expiresAt > getGameNow()) {
            return sum + (officer.bonuses?.darkMatterProductionBonus || 0)
          }
          return sum
        }, 0),
        energyProductionBonus: Object.values(player.officers).reduce((sum, officer) => {
          if (officer.active && officer.expiresAt && officer.expiresAt > getGameNow()) {
            return sum + (officer.bonuses?.energyProductionBonus || 0)
          }
          return sum
        }, 0)
      }
    : { resourceProductionBonus: 0, darkMatterProductionBonus: 0, energyProductionBonus: 0 }

  // 遍歷所有星球計算總產量
  for (const planet of player.planets) {
    if (planet.isMoon) continue // 月球沒有礦場

    const production = resourceLogic.calculateResourceProduction(planet, bonuses)

    totalMetal += production.metal || 0
    totalCrystal += production.crystal || 0
    totalDeuterium += production.deuterium || 0
  }

  return { metal: totalMetal, crystal: totalCrystal, deuterium: totalDeuterium }
}

/**
 * NPC向玩家贈送資源
 * 動態計算贈送量：基於玩家每小時產量的4-8倍
 * 贈送的資源會從NPC主星球扣除
 */
export const giftResourcesToPlayer = (npc: NPC, player: Player): void => {
  const { NPC_GIFT_CONFIG } = DIPLOMATIC_CONFIG
  const dynamicConfig = NPC_GIFT_CONFIG.DYNAMIC_GIFT
  const baseConfig = NPC_GIFT_CONFIG.BASE_GIFT_AMOUNT

  // 獲取NPC主星球
  const npcPlanet = npc.planets[0]
  if (!npcPlanet) return

  let giftResources = {
    metal: 0,
    crystal: 0,
    deuterium: 0,
    darkMatter: 0,
    energy: 0
  }

  if (dynamicConfig?.ENABLED) {
    // 動態計算：根據玩家產量
    const playerProduction = calculatePlayerTotalProduction(player)

    // 隨機生成產量倍數（4-8倍）
    const multiplierRange = dynamicConfig.PRODUCTION_MULTIPLIER
    const multiplier = multiplierRange.min + Math.random() * (multiplierRange.max - multiplierRange.min)

    // 計算贈送量（產量 × 倍數）
    let metalGift = Math.floor(playerProduction.metal * multiplier)
    let crystalGift = Math.floor(playerProduction.crystal * multiplier)
    let deuteriumGift = Math.floor(playerProduction.deuterium * multiplier)

    // 應用最小值保底
    metalGift = Math.max(metalGift, dynamicConfig.MIN_AMOUNT.METAL)
    crystalGift = Math.max(crystalGift, dynamicConfig.MIN_AMOUNT.CRYSTAL)
    deuteriumGift = Math.max(deuteriumGift, dynamicConfig.MIN_AMOUNT.DEUTERIUM)

    // 應用最大值封頂
    metalGift = Math.min(metalGift, dynamicConfig.MAX_AMOUNT.METAL)
    crystalGift = Math.min(crystalGift, dynamicConfig.MAX_AMOUNT.CRYSTAL)
    deuteriumGift = Math.min(deuteriumGift, dynamicConfig.MAX_AMOUNT.DEUTERIUM)

    giftResources.metal = metalGift
    giftResources.crystal = crystalGift
    giftResources.deuterium = deuteriumGift
  } else {
    // 使用基礎配置（後備方案）
    giftResources.metal = Math.floor(Math.random() * (baseConfig.METAL.max - baseConfig.METAL.min + 1)) + baseConfig.METAL.min
    giftResources.crystal = Math.floor(Math.random() * (baseConfig.CRYSTAL.max - baseConfig.CRYSTAL.min + 1)) + baseConfig.CRYSTAL.min
    giftResources.deuterium =
      Math.floor(Math.random() * (baseConfig.DEUTERIUM.max - baseConfig.DEUTERIUM.min + 1)) + baseConfig.DEUTERIUM.min
  }

  // 根據好感度額外加成：好感度越高，贈送越多
  const relation = npc.relations?.[player.id]
  if (relation && relation.reputation > 60) {
    // 好感度60-100區間，額外增加0-40%
    const reputationBonus = 1 + (relation.reputation - 60) / 100
    giftResources.metal = Math.floor(giftResources.metal * reputationBonus)
    giftResources.crystal = Math.floor(giftResources.crystal * reputationBonus)
    giftResources.deuterium = Math.floor(giftResources.deuterium * reputationBonus)
  }

  // 限制贈送量不超過NPC擁有的資源（只贈送NPC實際擁有的部分）
  giftResources.metal = Math.min(giftResources.metal, Math.floor(npcPlanet.resources.metal))
  giftResources.crystal = Math.min(giftResources.crystal, Math.floor(npcPlanet.resources.crystal))
  giftResources.deuterium = Math.min(giftResources.deuterium, Math.floor(npcPlanet.resources.deuterium))

  // 如果NPC資源不足（所有資源都為0），則不贈送
  if (giftResources.metal <= 0 && giftResources.crystal <= 0 && giftResources.deuterium <= 0) {
    return
  }

  // 從NPC星球扣除資源
  npcPlanet.resources.metal -= giftResources.metal
  npcPlanet.resources.crystal -= giftResources.crystal
  npcPlanet.resources.deuterium -= giftResources.deuterium

  // 處理贈送
  diplomaticLogic.handleNPCGiftToPlayer(npc, player, giftResources)

  // 更新上次贈送時間
  ;(npc as any).lastGiftTime = Date.now()
}

/**
 * 檢查NPC是否應該協防玩家
 * 當玩家受到攻擊且NPC是友好狀態時觸發
 */
export const shouldNPCDefendPlayer = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { ALLY_DEFENSE_CONFIG } = DIPLOMATIC_CONFIG

  // 檢查功能是否啟用
  if (!ALLY_DEFENSE_CONFIG?.ENABLED) {
    return false
  }

  // 檢查好感度
  const relation = npc.relations?.[player.id]
  if (!relation || relation.reputation < ALLY_DEFENSE_CONFIG.MIN_REPUTATION) {
    return false
  }

  // 檢查上次協防時間
  const lastDefendTime = (npc as any).lastDefendTime || 0
  if (currentTime - lastDefendTime < ALLY_DEFENSE_CONFIG.CHECK_INTERVAL * 1000) {
    return false
  }

  // 檢查當前協防任務數量
  const activeDefenseMissions = npc.fleetMissions?.filter(m => m.missionType === MissionType.Station && m.status === 'outbound').length || 0
  if (activeDefenseMissions >= ALLY_DEFENSE_CONFIG.MAX_CONCURRENT_DEFENSES) {
    return false
  }

  // 檢查玩家是否有來襲攻擊艦隊
  const incomingAttacks =
    player.incomingFleetAlerts?.filter(
      alert => alert.missionType === MissionType.Attack && alert.fleetSize >= ALLY_DEFENSE_CONFIG.MIN_INCOMING_FLEET_SIZE
    ) || []
  if (incomingAttacks.length === 0) {
    return false
  }

  // 根據好感度計算協防機率
  const reputationBonus = (relation.reputation - ALLY_DEFENSE_CONFIG.MIN_REPUTATION) / 30 // 70-100區間
  const defenseProbability = ALLY_DEFENSE_CONFIG.BASE_DEFENSE_PROBABILITY + reputationBonus * 0.3
  return Math.random() < defenseProbability
}

/**
 * NPC派艦隊協防玩家
 */
export const sendDefenseFleet = (npc: NPC, _player: Player, targetPlanet: Planet): FleetMission | null => {
  const { ALLY_DEFENSE_CONFIG } = DIPLOMATIC_CONFIG

  // 選擇最近且有艦隊的NPC星球
  const sourcePlanet = selectBestNPCPlanet(npc, targetPlanet.position)
  if (!sourcePlanet) return null

  // 計算派遣艦隊（戰鬥艦船的30%-60%）
  const fleetRatio =
    ALLY_DEFENSE_CONFIG.FLEET_RATIO.min + Math.random() * (ALLY_DEFENSE_CONFIG.FLEET_RATIO.max - ALLY_DEFENSE_CONFIG.FLEET_RATIO.min)

  const combatShipTypes = [
    ShipType.LightFighter,
    ShipType.HeavyFighter,
    ShipType.Cruiser,
    ShipType.Battleship,
    ShipType.Battlecruiser,
    ShipType.Bomber,
    ShipType.Destroyer
  ]

  const defenseFleet: Partial<Fleet> = {}
  let hasShips = false

  for (const shipType of combatShipTypes) {
    const available = sourcePlanet.fleet[shipType] || 0
    if (available > 0) {
      const toSend = Math.floor(available * fleetRatio)
      if (toSend > 0) {
        defenseFleet[shipType] = toSend
        sourcePlanet.fleet[shipType] = available - toSend
        hasShips = true
      }
    }
  }

  if (!hasShips) return null

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(sourcePlanet.position, targetPlanet.position)
  const minSpeed = getFleetMinSpeed(defenseFleet)
  const flightTime = fleetLogic.calculateFlightTime(distance, minSpeed)

  const currentTime = getGameNow()
  const arrivalTime = currentTime + flightTime

  // 建立協防任務
  const mission: FleetMission = {
    id: `ally_defend_${currentTime}_${npc.id}`,
    playerId: npc.id,
    npcId: npc.id,
    originPlanetId: sourcePlanet.id,
    targetPosition: targetPlanet.position,
    targetPlanetId: targetPlanet.id,
    fleet: defenseFleet as Fleet,
    missionType: MissionType.Station,
    departureTime: currentTime,
    arrivalTime: arrivalTime,
    returnTime: arrivalTime + ALLY_DEFENSE_CONFIG.STATION_DURATION,
    status: 'outbound',
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    isGift: false,
    isHostile: false // 盟友協防不是敵對任務
  }

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  // 更新上次協防時間
  ;(npc as any).lastDefendTime = currentTime

  return mission
}

/**
 * 檢查並執行NPC協防行為
 */
export const checkAndExecuteAllyDefense = (npc: NPC, player: Player, currentTime: number): void => {
  if (!shouldNPCDefendPlayer(npc, player, currentTime)) {
    return
  }

  // 找到受攻擊的玩家星球
  const incomingAttacks = player.incomingFleetAlerts?.filter(alert => alert.missionType === MissionType.Attack) || []

  if (incomingAttacks.length === 0) return

  // 選擇一個受攻擊的星球進行協防
  const targetAlert = incomingAttacks[Math.floor(Math.random() * incomingAttacks.length)]
  if (!targetAlert) return

  const targetPlanet = player.planets.find(p => p.id === targetAlert.targetPlanetId)

  if (!targetPlanet) return

  // 派遣協防艦隊
  const mission = sendDefenseFleet(npc, player, targetPlanet)

  if (mission) {
    // 可以在這裡新增通知玩家的邏輯
    diplomaticLogic.notifyPlayerOfAllyDefense(npc, player, targetPlanet, mission)
  }
}

/**
 * 選擇NPC的最佳攻擊來源星球
 */
const selectBestNPCPlanet = (npc: NPC, targetPosition: { galaxy: number; system: number; position: number }): Planet | null => {
  if (npc.planets.length === 0) return null

  // 選擇距離最近且有艦隊的星球
  let bestPlanet: Planet | null = null
  let minDistance = Infinity

  for (const planet of npc.planets) {
    const distance = fleetLogic.calculateDistance(planet.position, targetPosition)
    const hasFleet = Object.values(planet.fleet).some(count => (count || 0) > 0)

    if (hasFleet && distance < minDistance) {
      minDistance = distance
      bestPlanet = planet
    }
  }

  return bestPlanet
}

/**
 * 計算NPC星球的戰鬥艦隊總攻擊力
 * 用於判斷NPC是否有足夠的戰鬥力來發起有意義的攻擊
 */
const calculateNPCCombatPower = (npcPlanet: Planet): number => {
  // 各艦船的攻擊力
  const shipAttackPower: Record<string, number> = {
    [ShipType.LightFighter]: 50,
    [ShipType.HeavyFighter]: 150,
    [ShipType.Cruiser]: 400,
    [ShipType.Battleship]: 1200,
    [ShipType.Bomber]: 700,
    [ShipType.Destroyer]: 2500,
    [ShipType.Battlecruiser]: 1000,
    [ShipType.Deathstar]: 200000
  }

  let totalPower = 0
  for (const [shipType, attack] of Object.entries(shipAttackPower)) {
    const count = npcPlanet.fleet[shipType as ShipType] || 0
    totalPower += count * attack
  }
  return totalPower
}

// 最小戰鬥力閾值：相當於約10艘輕型戰鬥機的攻擊力
// 這樣避免NPC只有幾艘小飛機就頻繁偵查騷擾玩家
const MIN_COMBAT_POWER_FOR_SPY = 500

/**
 * 建立NPC偵查任務
 */
export const createNPCSpyMission = (
  npc: NPC,
  targetPlanet: Planet,
  _planets: Planet[],
  config: DynamicBehaviorConfig
): FleetMission | null => {
  // 選擇NPC的最佳星球作為起點
  const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
  if (!npcPlanet) {
    return null
  }

  // 檢查NPC是否有足夠的間諜探測器
  const spyProbes = npcPlanet.fleet[ShipType.EspionageProbe] || 0
  if (spyProbes < config.minSpyProbes) {
    return null
  }

  // 檢查NPC是否有足夠的戰鬥力
  // 戰鬥力太低的話偵查沒有意義，也避免頻繁騷擾玩家
  const combatPower = calculateNPCCombatPower(npcPlanet)
  if (combatPower < MIN_COMBAT_POWER_FOR_SPY) {
    return null
  }

  // 建立偵查艦隊
  const fleet: Partial<Fleet> = {
    [ShipType.EspionageProbe]: config.minSpyProbes
  }

  // 從NPC星球扣除艦隊
  npcPlanet.fleet[ShipType.EspionageProbe] = (npcPlanet.fleet[ShipType.EspionageProbe] || 0) - config.minSpyProbes

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
  const spyProbeSpeed = 100000000 // 間諜探測器速度
  const flightTime = fleetLogic.calculateFlightTime(distance, spyProbeSpeed)

  const now = Date.now()
  const gameNow = getGameNow()
  const mission: FleetMission = {
    id: `npc-spy-${npc.id}-${now}`,
    playerId: npc.id,
    npcId: npc.id,
    isHostile: true,
    originPlanetId: npcPlanet.id,
    targetPosition: targetPlanet.position,
    targetPlanetId: targetPlanet.id,
    missionType: MissionType.Spy,
    fleet,
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    departureTime: gameNow,
    arrivalTime: gameNow + flightTime * 1000,
    status: 'outbound'
  }

  // 更新NPC的上次偵查時間
  npc.lastSpyTime = now

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  return mission
}

/**
 * 處理NPC偵查到達
 * 返回：被偵查通知（給玩家）和偵查報告（給NPC）
 */
export const processNPCSpyArrival = (
  npc: NPC,
  mission: FleetMission,
  targetPlanet: Planet,
  player: Player
): { spiedNotification: SpiedNotification; spyReport: SpyReport } => {
  // 計算偵查等級（基於NPC的間諜科技）
  const npcSpyTech = npc.technologies[TechnologyType.EspionageTechnology] || 0
  const playerSpyTech = player.technologies[TechnologyType.EspionageTechnology] || 0
  const spyProbeCount = mission.fleet[ShipType.EspionageProbe] || 0

  // 計算被發現的機率
  const detectionChance = Math.max(0, Math.min(100, 50 + (playerSpyTech - npcSpyTech) * 10 - spyProbeCount * 5))
  const detected = Math.random() * 100 < detectionChance

  // 建立NPC的偵查報告
  const spyReport: SpyReport = {
    id: `npc-spy-report-${mission.id}`,
    timestamp: Date.now(),
    spyId: npc.id,
    targetPlanetId: targetPlanet.id,
    targetPlanetName: targetPlanet.name,
    targetPosition: targetPlanet.position,
    targetPlayerId: player.id,
    resources: { ...targetPlanet.resources },
    fleet: npcSpyTech >= 2 ? { ...targetPlanet.fleet } : undefined,
    defense: npcSpyTech >= 4 ? { ...targetPlanet.defense } : undefined,
    buildings: npcSpyTech >= 6 ? { ...targetPlanet.buildings } : undefined,
    technologies: npcSpyTech >= 8 ? { ...player.technologies } : undefined,
    detectionChance
  }

  // 儲存到NPC的偵查報告
  if (!npc.playerSpyReports) {
    npc.playerSpyReports = {}
  }
  npc.playerSpyReports[targetPlanet.id] = spyReport

  // 建立被偵查通知（給玩家）
  const spiedNotification: SpiedNotification = {
    id: `spied-${mission.id}`,
    timestamp: Date.now(),
    npcId: npc.id,
    npcName: npc.name,
    targetPlanetId: targetPlanet.id,
    targetPlanetName: targetPlanet.name,
    detectionSuccess: detected,
    read: false
  }

  // 艦隊返回
  mission.status = 'returning'
  mission.returnTime = getGameNow() + (mission.arrivalTime - mission.departureTime)

  return { spiedNotification, spyReport }
}

/**
 * 計算艦隊的戰鬥力
 * 使用 attack + shield + armor 作為單位戰鬥力
 */
const calculateFleetCombatPower = (fleet: Partial<Fleet> | undefined): number => {
  if (!fleet) return 0
  let power = 0
  for (const [shipType, count] of Object.entries(fleet)) {
    if (count && count > 0) {
      const config = SHIPS[shipType as ShipType]
      if (config) {
        // 戰鬥力 = (攻擊力 + 護盾 + 裝甲) * 數量
        power += (config.attack + config.shield + config.armor) * count
      }
    }
  }
  return power
}

/**
 * 計算防禦設施的戰鬥力
 */
const calculateDefenseCombatPower = (defense: Partial<Record<DefenseType, number>> | undefined): number => {
  if (!defense) return 0
  let power = 0
  for (const [defenseType, count] of Object.entries(defense)) {
    if (count && count > 0) {
      const config = DEFENSES[defenseType as DefenseType]
      if (config) {
        // 戰鬥力 = (攻擊力 + 護盾 + 裝甲) * 數量
        power += (config.attack + config.shield + config.armor) * count
      }
    }
  }
  return power
}

/**
 * 評估NPC是否能贏得戰鬥
 * 返回NPC戰鬥力與敵方戰鬥力的比值
 */
export const evaluateWinProbability = (npcFleet: Partial<Fleet>, spyReport: SpyReport): number => {
  const npcPower = calculateFleetCombatPower(npcFleet)
  const enemyFleetPower = calculateFleetCombatPower(spyReport.fleet)
  const enemyDefensePower = calculateDefenseCombatPower(spyReport.defense)
  const totalEnemyPower = enemyFleetPower + enemyDefensePower

  // 如果敵方沒有防禦力，返回無限大（可以攻擊）
  if (totalEnemyPower === 0) return Infinity

  return npcPower / totalEnemyPower
}

/**
 * 決定NPC攻擊艦隊組成
 * 基於偵查報告和NPC實力，只有當有合理勝算時才攻擊
 */
const decideAttackFleet = (_npc: NPC, npcPlanet: Planet, spyReport: SpyReport, config: DynamicBehaviorConfig): Partial<Fleet> | null => {
  // 計算敵方總戰鬥力
  const enemyFleetPower = calculateFleetCombatPower(spyReport.fleet)
  const enemyDefensePower = calculateDefenseCombatPower(spyReport.defense)
  const totalEnemyPower = enemyFleetPower + enemyDefensePower

  // 先計算可用的攻擊艦隊
  const attackFleet: Partial<Fleet> = {}
  let hasShips = false

  // 優先派出戰鬥艦船
  const combatShips = [
    ShipType.LightFighter,
    ShipType.HeavyFighter,
    ShipType.Cruiser,
    ShipType.Battleship,
    ShipType.Bomber,
    ShipType.Destroyer,
    ShipType.Battlecruiser,
    ShipType.Deathstar
  ]

  for (const shipType of combatShips) {
    const available = npcPlanet.fleet[shipType] || 0
    if (available > 0) {
      // 使用 Math.ceil 確保至少派出1艘（如果有的話）
      // 但不能超過可用數量
      const sendCount = Math.min(available, Math.max(1, Math.floor(available * config.attackFleetSizeRatio)))
      attackFleet[shipType] = sendCount
      hasShips = true
    }
  }

  if (!hasShips) {
    return null
  }

  // 計算NPC艦隊戰鬥力
  const npcPower = calculateFleetCombatPower(attackFleet)

  // 如果敵方有防禦力，檢查是否有足夠的勝算
  // 要求NPC戰鬥力至少是敵方的1.2倍才會發動攻擊（確保有較大勝算）
  const MIN_WIN_RATIO = 1.2
  if (totalEnemyPower > 0 && npcPower < totalEnemyPower * MIN_WIN_RATIO) {
    // NPC戰鬥力不足，不發動攻擊
    return null
  }

  return attackFleet
}

/**
 * 建立NPC攻擊任務
 */
export const createNPCAttackMission = (
  npc: NPC,
  targetPlanet: Planet,
  spyReport: SpyReport,
  config: DynamicBehaviorConfig
): FleetMission | null => {
  // 選擇NPC的最佳星球作為起點
  const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
  if (!npcPlanet) {
    return null
  }

  // 決定攻擊艦隊
  const attackFleet = decideAttackFleet(npc, npcPlanet, spyReport, config)
  if (!attackFleet) {
    return null
  }

  // 從NPC星球扣除艦隊
  for (const [shipType, count] of Object.entries(attackFleet)) {
    npcPlanet.fleet[shipType as ShipType] = (npcPlanet.fleet[shipType as ShipType] || 0) - (count as number)
  }

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
  // 找出艦隊中最慢的船速
  let minSpeed = Infinity
  for (const _shipType of Object.keys(attackFleet)) {
    // 這裡簡化處理，實際應該從SHIPS配置中獲取速度
    const baseSpeed = 10000 // 簡化
    minSpeed = Math.min(minSpeed, baseSpeed)
  }
  const flightTime = fleetLogic.calculateFlightTime(distance, minSpeed)

  const now = Date.now()
  const gameNow = getGameNow()
  const mission: FleetMission = {
    id: `npc-attack-${npc.id}-${now}`,
    playerId: npc.id,
    npcId: npc.id,
    isHostile: true,
    originPlanetId: npcPlanet.id,
    targetPosition: targetPlanet.position,
    targetPlanetId: targetPlanet.id,
    missionType: MissionType.Attack,
    fleet: attackFleet,
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    departureTime: gameNow,
    arrivalTime: gameNow + flightTime * 1000,
    status: 'outbound'
  }

  // 更新NPC的上次攻擊時間
  npc.lastAttackTime = now

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  return mission
}

/**
 * 建立或更新即將到來的艦隊警告
 */
export const createIncomingFleetAlert = (mission: FleetMission, npc: NPC, targetPlanet: Planet): IncomingFleetAlert => {
  const fleetSize = Object.values(mission.fleet).reduce((sum, count) => sum + (count || 0), 0)

  return {
    id: mission.id,
    npcId: npc.id,
    npcName: npc.name,
    missionType: mission.missionType,
    targetPlanetId: targetPlanet.id,
    targetPlanetName: targetPlanet.name,
    arrivalTime: mission.arrivalTime,
    fleetSize,
    read: false
  }
}

/**
 * 更新玩家的即將到來的艦隊警告
 * 刪除已到達或已返回的任務警告
 */
export const updateIncomingFleetAlerts = (player: Player, currentTime: number): void => {
  if (!player.incomingFleetAlerts) {
    player.incomingFleetAlerts = []
  }

  // 刪除已過期的警告（艦隊已到達）
  player.incomingFleetAlerts = player.incomingFleetAlerts.filter(alert => alert.arrivalTime > currentTime)
}

/**
 * NPC主動行為主更新函式
 * 應該在遊戲迴圈中定期呼叫
 */
export const updateNPCBehavior = (
  npc: NPC,
  player: Player,
  allPlanets: Planet[],
  debrisFields: Record<string, DebrisField>,
  currentTime: number
): void => {
  // 根據玩家積分計算動態行為配置
  const config = calculateDynamicBehavior(player.points)

  // 1. 檢查並回收附近的殘骸（優先順序最高）
  const nearbyDebris = findNearbyDebris(npc, debrisFields)
  if (nearbyDebris.length > 0) {
    // 檢查是否已經有正在執行的回收任務
    const activeRecycleMissions = npc.fleetMissions?.filter(m => m.missionType === MissionType.Recycle && m.status === 'outbound') || []
    const activeDebrisIds = new Set(activeRecycleMissions.map(m => m.debrisFieldId).filter(Boolean))

    // 找到還沒有被回收的殘骸
    const availableDebris = nearbyDebris.filter(d => !activeDebrisIds.has(d.id))

    if (availableDebris.length > 0) {
      // 隨機選擇一個殘骸場進行回收
      const targetDebris = availableDebris[Math.floor(Math.random() * availableDebris.length)]
      if (targetDebris) {
        createNPCRecycleMission(npc, targetDebris, player, allPlanets)
      }
    }
  }

  // 2. 檢查是否應該反擊（優先於普通攻擊）
  if (shouldNPCRevenge(npc, currentTime)) {
    const revengeMission = createNPCRevengeMission(npc, allPlanets, config)
    if (revengeMission) {
      // 找到目標星球建立警告
      const targetPlanet = allPlanets.find(p => p.id === revengeMission.targetPlanetId)
      if (targetPlanet) {
        const alert = createIncomingFleetAlert(revengeMission, npc, targetPlanet)
        if (!player.incomingFleetAlerts) {
          player.incomingFleetAlerts = []
        }
        player.incomingFleetAlerts.push(alert)
      }
      // 反擊後跳過普通攻擊
      return
    }
  }

  // 3. 檢查是否應該偵查玩家
  if (shouldNPCSpyPlayer(npc, player, currentTime, config)) {
    // 隨機選擇一個玩家星球進行偵查
    const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
    if (playerPlanets.length > 0) {
      const targetPlanet = playerPlanets[Math.floor(Math.random() * playerPlanets.length)]
      if (!targetPlanet) {
        return
      }

      const spyMission = createNPCSpyMission(npc, targetPlanet, allPlanets, config)

      if (spyMission) {
        // 建立即將到來的艦隊警告
        const alert = createIncomingFleetAlert(spyMission, npc, targetPlanet)
        if (!player.incomingFleetAlerts) {
          player.incomingFleetAlerts = []
        }
        player.incomingFleetAlerts.push(alert)
      }
    }
  }

  // 4. 檢查是否應該攻擊玩家
  if (shouldNPCAttackPlayer(npc, player, currentTime, config)) {
    // 檢查是否有最近的偵查報告
    if (npc.playerSpyReports && Object.keys(npc.playerSpyReports).length > 0) {
      // 選擇一個偵查過的星球進行攻擊
      const spyReports = Object.values(npc.playerSpyReports)
      const recentReport = spyReports[Math.floor(Math.random() * spyReports.length)]

      // 確保找到了偵查報告
      if (!recentReport) {
        return
      }

      // 找到目標星球
      const targetPlanet = allPlanets.find(p => p.id === recentReport.targetPlanetId)
      if (targetPlanet) {
        const attackMission = createNPCAttackMission(npc, targetPlanet, recentReport, config)

        if (attackMission) {
          // 建立即將到來的艦隊警告
          const alert = createIncomingFleetAlert(attackMission, npc, targetPlanet)
          if (!player.incomingFleetAlerts) {
            player.incomingFleetAlerts = []
          }
          player.incomingFleetAlerts.push(alert)
        }
      }
    }
  }

  // 5. 檢查是否應該贈送資源給玩家（僅友好NPC）
  if (shouldNPCGiftPlayer(npc, player, currentTime)) {
    giftResourcesToPlayer(npc, player)
  }

  // 6. 檢查是否應該協防玩家（僅友好NPC，玩家被攻擊時）
  checkAndExecuteAllyDefense(npc, player, currentTime)

  // 7. 更新即將到來的艦隊警告（刪除過期的）
  updateIncomingFleetAlerts(player, currentTime)
}

/**
 * 帶併發限制的NPC行為更新函式
 * 防止同時產生過多偵查和攻擊任務導致遊戲卡頓
 */
export const updateNPCBehaviorWithLimit = (
  npc: NPC,
  player: Player,
  allPlanets: Planet[],
  debrisFields: Record<string, DebrisField>,
  currentTime: number,
  limits: {
    activeSpyMissions: number
    activeAttackMissions: number
    config: DynamicBehaviorConfig
  }
): { spyCreated: boolean; attackCreated: boolean } => {
  const { activeSpyMissions, activeAttackMissions, config } = limits
  let spyCreated = false
  let attackCreated = false

  // 1. 檢查並回收附近的殘骸（優先順序最高，不受併發限制）
  const nearbyDebris = findNearbyDebris(npc, debrisFields)
  if (nearbyDebris.length > 0) {
    const activeRecycleMissions = npc.fleetMissions?.filter(m => m.missionType === MissionType.Recycle && m.status === 'outbound') || []
    const activeDebrisIds = new Set(activeRecycleMissions.map(m => m.debrisFieldId).filter(Boolean))
    const availableDebris = nearbyDebris.filter(d => !activeDebrisIds.has(d.id))

    if (availableDebris.length > 0) {
      const targetDebris = availableDebris[Math.floor(Math.random() * availableDebris.length)]
      if (targetDebris) {
        createNPCRecycleMission(npc, targetDebris, player, allPlanets)
      }
    }
  }

  // 2. 檢查是否應該反擊（優先於普通攻擊，受攻擊併發限制）
  if (activeAttackMissions < config.maxConcurrentAttackMissions && shouldNPCRevenge(npc, currentTime)) {
    const revengeMission = createNPCRevengeMission(npc, allPlanets, config)
    if (revengeMission) {
      const targetPlanet = allPlanets.find(p => p.id === revengeMission.targetPlanetId)
      if (targetPlanet) {
        const alert = createIncomingFleetAlert(revengeMission, npc, targetPlanet)
        if (!player.incomingFleetAlerts) {
          player.incomingFleetAlerts = []
        }
        player.incomingFleetAlerts.push(alert)
        attackCreated = true
      }
      return { spyCreated, attackCreated }
    }
  }

  // 3. 檢查是否應該偵查玩家（受偵查併發限制）
  if (activeSpyMissions < config.maxConcurrentSpyMissions && shouldNPCSpyPlayer(npc, player, currentTime, config)) {
    const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
    if (playerPlanets.length > 0) {
      const targetPlanet = playerPlanets[Math.floor(Math.random() * playerPlanets.length)]
      if (targetPlanet) {
        const spyMission = createNPCSpyMission(npc, targetPlanet, allPlanets, config)
        if (spyMission) {
          const alert = createIncomingFleetAlert(spyMission, npc, targetPlanet)
          if (!player.incomingFleetAlerts) {
            player.incomingFleetAlerts = []
          }
          player.incomingFleetAlerts.push(alert)
          spyCreated = true
        }
      }
    }
  }

  // 4. 檢查是否應該攻擊玩家（受攻擊併發限制）
  if (activeAttackMissions < config.maxConcurrentAttackMissions && shouldNPCAttackPlayer(npc, player, currentTime, config)) {
    if (npc.playerSpyReports && Object.keys(npc.playerSpyReports).length > 0) {
      const spyReports = Object.values(npc.playerSpyReports)
      const recentReport = spyReports[Math.floor(Math.random() * spyReports.length)]

      if (recentReport) {
        const targetPlanet = allPlanets.find(p => p.id === recentReport.targetPlanetId)
        if (targetPlanet) {
          const attackMission = createNPCAttackMission(npc, targetPlanet, recentReport, config)
          if (attackMission) {
            const alert = createIncomingFleetAlert(attackMission, npc, targetPlanet)
            if (!player.incomingFleetAlerts) {
              player.incomingFleetAlerts = []
            }
            player.incomingFleetAlerts.push(alert)
            attackCreated = true
          }
        }
      }
    }
  }

  // 5. 檢查是否應該贈送資源給玩家（僅友好NPC，不受併發限制）
  if (shouldNPCGiftPlayer(npc, player, currentTime)) {
    giftResourcesToPlayer(npc, player)
  }

  // 6. 檢查是否應該協防玩家（僅友好NPC，玩家被攻擊時，不受併發限制）
  checkAndExecuteAllyDefense(npc, player, currentTime)

  // 7. 更新即將到來的艦隊警告（刪除過期的）
  updateIncomingFleetAlerts(player, currentTime)

  return { spyCreated, attackCreated }
}

// ========== 測試輔助函式 ==========

/**
 * 測試函式：強制NPC立即偵查玩家
 * 用於開發和測試
 */
export const forceNPCSpyPlayer = (npc: NPC, player: Player, allPlanets: Planet[], targetPlanetIndex = 0): FleetMission | null => {
  const config = calculateDynamicBehavior(player.points)

  // 選擇目標星球
  const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
  if (playerPlanets.length === 0) {
    console.error('[Test] No player planets found')
    return null
  }

  const targetPlanet = playerPlanets[targetPlanetIndex] || playerPlanets[0]
  if (!targetPlanet) {
    console.error('[Test] Target planet not found')
    return null
  }

  // 建立偵查任務
  const spyMission = createNPCSpyMission(npc, targetPlanet, allPlanets, config)

  if (spyMission) {
    // 建立即將到來的艦隊警告
    const alert = createIncomingFleetAlert(spyMission, npc, targetPlanet)
    if (!player.incomingFleetAlerts) {
      player.incomingFleetAlerts = []
    }
    player.incomingFleetAlerts.push(alert)
  } else {
    console.error('[Test] Failed to create spy mission - NPC may not have spy probes')
  }

  return spyMission
}

/**
 * 測試函式：強制NPC立即攻擊玩家
 * 需要先有偵查報告
 */
export const forceNPCAttackPlayer = (npc: NPC, player: Player, allPlanets: Planet[], targetPlanetIndex = 0): FleetMission | null => {
  const config = calculateDynamicBehavior(player.points)

  // 檢查是否有偵查報告
  if (!npc.playerSpyReports || Object.keys(npc.playerSpyReports).length === 0) {
    console.error('[Test] No spy reports available - NPC must spy first!')
    return null
  }

  // 選擇目標星球
  const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
  if (playerPlanets.length === 0) {
    console.error('[Test] No player planets found')
    return null
  }

  const targetPlanet = playerPlanets[targetPlanetIndex] || playerPlanets[0]
  if (!targetPlanet) {
    console.error('[Test] Target planet not found')
    return null
  }

  // 獲取該星球的偵查報告
  const spyReport = npc.playerSpyReports[targetPlanet.id]
  if (!spyReport) {
    console.error(`[Test] No spy report for ${targetPlanet.name} - spy this planet first!`)
    return null
  }

  // 建立攻擊任務
  const attackMission = createNPCAttackMission(npc, targetPlanet, spyReport, config)

  if (attackMission) {
    // 建立即將到來的艦隊警告
    const alert = createIncomingFleetAlert(attackMission, npc, targetPlanet)
    if (!player.incomingFleetAlerts) {
      player.incomingFleetAlerts = []
    }
    player.incomingFleetAlerts.push(alert)
  } else {
    console.error('[Test] Failed to create attack mission - NPC may not have ships')
  }

  return attackMission
}

/**
 * 測試函式：強制NPC先偵查再攻擊
 * 一步到位的測試函式
 */
export const forceNPCSpyAndAttack = (
  npc: NPC,
  player: Player,
  allPlanets: Planet[],
  targetPlanetIndex = 0
): { spyMission: FleetMission | null; attackMission: FleetMission | null } => {
  // 1. 先偵查
  const spyMission = forceNPCSpyPlayer(npc, player, allPlanets, targetPlanetIndex)

  if (!spyMission) {
    return { spyMission: null, attackMission: null }
  }

  // 2. 模擬偵查到達，立即生成偵查報告
  const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
  const targetPlanet = playerPlanets[targetPlanetIndex] || playerPlanets[0]
  if (!targetPlanet) {
    console.error('[Test] Target planet not found')
    return { spyMission, attackMission: null }
  }

  const { spyReport, spiedNotification } = processNPCSpyArrival(npc, spyMission, targetPlanet, player)

  // 儲存偵查報告到NPC
  if (!npc.playerSpyReports) {
    npc.playerSpyReports = {}
  }
  npc.playerSpyReports[targetPlanet.id] = spyReport

  // 新增被偵查通知給玩家
  if (!player.spiedNotifications) {
    player.spiedNotifications = []
  }
  player.spiedNotifications.push(spiedNotification)

  // 3. 立即發起攻擊
  const attackMission = forceNPCAttackPlayer(npc, player, allPlanets, targetPlanetIndex)

  return { spyMission, attackMission }
}

/**
 * 測試函式：加速艦隊任務到達時間
 * 將任務的到達時間設定為現在+指定秒數
 */
export const accelerateNPCMission = (npc: NPC, missionId: string, arriveInSeconds = 5, player?: Player): boolean => {
  if (!npc.fleetMissions) {
    console.error('[Test] NPC has no fleet missions')
    return false
  }

  const mission = npc.fleetMissions.find(m => m.id === missionId)
  if (!mission) {
    console.error('[Test] Mission not found')
    return false
  }

  const now = getGameNow()
  const flightTime = arriveInSeconds * 1000 // 飛行時間（毫秒）

  // 同時修改 departureTime 和 arrivalTime，保持飛行時間為指定秒數
  mission.departureTime = now
  mission.arrivalTime = now + flightTime

  // 同時更新對應的 IncomingFleetAlert
  if (player && player.incomingFleetAlerts) {
    const alert = player.incomingFleetAlerts.find(a => a.id === missionId)
    if (alert) {
      alert.arrivalTime = mission.arrivalTime
    }
  }

  return true
}

/**
 * 測試函式：加速所有NPC艦隊任務
 */
export const accelerateAllNPCMissions = (npc: NPC, arriveInSeconds = 5, player?: Player): number => {
  if (!npc.fleetMissions) {
    console.error('[Test] NPC has no fleet missions')
    return 0
  }

  const now = getGameNow()
  const flightTime = arriveInSeconds * 1000
  let count = 0

  npc.fleetMissions.forEach(mission => {
    if (mission.status === 'outbound') {
      // 同時修改 departureTime 和 arrivalTime
      mission.departureTime = now
      mission.arrivalTime = now + flightTime

      // 同時更新對應的 IncomingFleetAlert
      if (player && player.incomingFleetAlerts) {
        const alert = player.incomingFleetAlerts.find(a => a.id === mission.id)
        if (alert) {
          alert.arrivalTime = mission.arrivalTime
        }
      }

      count++
    } else if (mission.status === 'returning' && mission.returnTime) {
      // 對於返回任務，保持原來的邏輯
      mission.returnTime = now + flightTime
      count++
    }
  })

  return count
}

/**
 * 檢查NPC星球附近是否有殘骸場
 * 返回NPC可以回收的殘骸場列表
 * NPC會主動尋找同一星系內的殘骸進行回收
 */
export const findNearbyDebris = (npc: NPC, debrisFields: Record<string, DebrisField>): DebrisField[] => {
  const nearbyDebris: DebrisField[] = []

  for (const debris of Object.values(debrisFields)) {
    // 檢查殘骸是否在NPC的星球附近（同一星系內）
    for (const npcPlanet of npc.planets) {
      if (debris.position.galaxy === npcPlanet.position.galaxy && debris.position.system === npcPlanet.position.system) {
        // 檢查殘骸是否有足夠資源值得回收（至少1000金屬或水晶）
        if (debris.resources.metal > 1000 || debris.resources.crystal > 1000) {
          // 計算距離，確保不會太遠（最多在同一星系內）
          const distance = Math.abs(debris.position.position - npcPlanet.position.position)
          if (distance <= 15) {
            // 同一星系內最多15個位置
            nearbyDebris.push(debris)
          }
        }
      }
    }
  }

  return nearbyDebris
}

/**
 * 建立NPC回收殘骸任務
 */
export const createNPCRecycleMission = (npc: NPC, debris: DebrisField, player: Player, allPlanets: Planet[]): FleetMission | null => {
  // 找到離殘骸最近的NPC星球
  let closestPlanet: Planet | null = null
  let minDistance = Infinity

  for (const npcPlanet of npc.planets) {
    if (npcPlanet.position.galaxy === debris.position.galaxy && npcPlanet.position.system === debris.position.system) {
      const distance = Math.abs(npcPlanet.position.position - debris.position.position)
      if (distance < minDistance) {
        minDistance = distance
        closestPlanet = npcPlanet
      }
    }
  }

  if (!closestPlanet) {
    return null
  }

  // 檢查殘骸位置是否有玩家星球
  const playerPlanetAtDebris = allPlanets.find(
    p =>
      p.ownerId === player.id &&
      p.position.galaxy === debris.position.galaxy &&
      p.position.system === debris.position.system &&
      p.position.position === debris.position.position
  )

  // 如果殘骸在玩家星球位置，檢查玩家是否有防禦
  // 如果玩家有防禦，NPC不應該只派回收船去送死（會被擊毀產生更多殘骸，形成惡性迴圈）
  if (playerPlanetAtDebris) {
    // 計算玩家星球的總防禦數量
    const totalDefense = Object.values(playerPlanetAtDebris.defense || {}).reduce((sum, count) => sum + (count || 0), 0)
    if (totalDefense > 0) {
      return null // 玩家有防禦，不派純回收船去送死
    }
  }

  // 檢查NPC是否有回收船
  const recyclers = closestPlanet.fleet[ShipType.Recycler] || 0
  if (recyclers === 0) {
    return null
  }

  // 計算需要多少回收船（每艘回收船容量20000）
  const totalDebris = debris.resources.metal + debris.resources.crystal
  const recyclersNeeded = Math.min(Math.ceil(totalDebris / 20000), recyclers)

  // 建立回收艦隊
  const fleet: Partial<Fleet> = {
    [ShipType.Recycler]: recyclersNeeded
  }

  // 從NPC星球扣除艦隊
  closestPlanet.fleet[ShipType.Recycler] = recyclers - recyclersNeeded

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(closestPlanet.position, debris.position)
  const recyclerSpeed = 2000 // 回收船基礎速度
  const flightTime = fleetLogic.calculateFlightTime(distance, recyclerSpeed)

  const now = Date.now()
  const gameNow = getGameNow()
  const mission: FleetMission = {
    id: `npc-recycle-${npc.id}-${now}`,
    playerId: npc.id,
    npcId: npc.id,
    isHostile: false,
    originPlanetId: closestPlanet.id,
    targetPosition: debris.position,
    debrisFieldId: debris.id,
    missionType: MissionType.Recycle,
    fleet,
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    departureTime: gameNow,
    arrivalTime: gameNow + flightTime * 1000,
    status: 'outbound'
  }

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  // 如果殘骸在玩家星球位置，傳送警告（非敵對NPC才會執行到這裡）
  if (playerPlanetAtDebris) {
    // 建立即將到來的艦隊警告（非敵對）
    const alert = createIncomingFleetAlert(mission, npc, playerPlanetAtDebris)
    if (!player.incomingFleetAlerts) {
      player.incomingFleetAlerts = []
    }
    player.incomingFleetAlerts.push(alert)

    // 建立NPC活動通知
    if (!player.npcActivityNotifications) {
      player.npcActivityNotifications = []
    }
    player.npcActivityNotifications.push({
      id: `npc-activity-${mission.id}`,
      timestamp: now,
      npcId: npc.id,
      npcName: npc.name,
      activityType: 'recycle',
      targetPosition: debris.position,
      targetPlanetId: playerPlanetAtDebris.id,
      targetPlanetName: playerPlanetAtDebris.name,
      arrivalTime: mission.arrivalTime,
      read: false
    })
  }

  return mission
}

/**
 * NPC被攻擊後的反應
 * 記錄攻擊者，並根據情況決定是否反擊或加強防禦
 */
export const handleNPCAttacked = (npc: NPC, attackerId: string, attackerPlanetId: string | undefined): void => {
  // 初始化被攻擊記錄
  if (!npc.attackedBy) {
    npc.attackedBy = {}
  }

  // 記錄攻擊者和被攻擊次數
  if (!npc.attackedBy[attackerId]) {
    npc.attackedBy[attackerId] = {
      count: 0,
      lastAttackTime: 0,
      planetId: attackerPlanetId
    }
  }
  npc.attackedBy[attackerId].count++
  npc.attackedBy[attackerId].lastAttackTime = Date.now()
  if (attackerPlanetId) {
    npc.attackedBy[attackerId].planetId = attackerPlanetId
  }

  // 設定警戒狀態（被攻擊後1小時內保持警戒）
  npc.alertUntil = Date.now() + 3600 * 1000

  // 如果被同一個玩家攻擊超過3次，標記為高優先順序反擊目標
  if (npc.attackedBy[attackerId].count >= 3) {
    npc.revengeTarget = attackerId
  }
}

/**
 * 檢查NPC是否應該反擊
 */
export const shouldNPCRevenge = (npc: NPC, currentTime: number): boolean => {
  // 如果沒有復仇目標，不反擊
  if (!npc.revengeTarget || !npc.attackedBy) {
    return false
  }

  // 獲取 AI 行為修改器
  const aiModifier = getAIBehaviorModifier(npc.aiType)

  // 商人型 NPC 反擊意願很低，可能選擇不反擊
  if (aiModifier.revengeMultiplier < 1.0 && Math.random() > aiModifier.revengeMultiplier) {
    return false
  }

  const attackRecord = npc.attackedBy[npc.revengeTarget]
  if (!attackRecord) {
    return false
  }

  // 被攻擊後24小時內可以反擊（防守型可能更長時間記仇）
  const revengeWindow = 24 * 3600 * 1000 * aiModifier.revengeMultiplier
  const timeSinceLastAttack = currentTime - attackRecord.lastAttackTime
  if (timeSinceLastAttack > revengeWindow) {
    return false
  }

  // 至少等待一段時間後再反擊（防守型反應更快）
  const minWaitTime = aiModifier.defenseFocus ? 300 * 1000 : 600 * 1000 // 防守型5分鐘，其他10分鐘
  if (timeSinceLastAttack < minWaitTime) {
    return false
  }

  return true
}

/**
 * 建立NPC反擊任務
 */
export const createNPCRevengeMission = (npc: NPC, allPlanets: Planet[], config: DynamicBehaviorConfig): FleetMission | null => {
  if (!npc.revengeTarget || !npc.attackedBy) {
    return null
  }

  const attackRecord = npc.attackedBy[npc.revengeTarget]
  if (!attackRecord || !attackRecord.planetId) {
    return null
  }

  // 找到攻擊者的星球
  const targetPlanet = allPlanets.find(p => p.id === attackRecord.planetId)
  if (!targetPlanet) {
    return null
  }

  // 選擇NPC的最佳星球作為起點
  const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
  if (!npcPlanet) {
    return null
  }

  // 獲取 AI 行為修改器
  const aiModifier = getAIBehaviorModifier(npc.aiType)

  // 反擊時派出更多艦隊（基礎多50%，根據 AI 型別調整）
  // 防守型/侵略型反擊更猛烈
  const revengeMultiplier = 1.5 * aiModifier.revengeMultiplier
  const revengeFleet = decideAttackFleet(npc, npcPlanet, {} as SpyReport, {
    ...config,
    attackFleetSizeRatio: Math.min(1.0, config.attackFleetSizeRatio * revengeMultiplier)
  })

  if (!revengeFleet) {
    return null
  }

  // 從NPC星球扣除艦隊
  for (const [shipType, count] of Object.entries(revengeFleet)) {
    npcPlanet.fleet[shipType as ShipType] = (npcPlanet.fleet[shipType as ShipType] || 0) - (count as number)
  }

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
  let minSpeed = Infinity
  for (const _shipType of Object.keys(revengeFleet)) {
    const baseSpeed = 10000
    minSpeed = Math.min(minSpeed, baseSpeed)
  }
  const flightTime = fleetLogic.calculateFlightTime(distance, minSpeed)

  const now = Date.now()
  const gameNow = getGameNow()
  const mission: FleetMission = {
    id: `npc-revenge-${npc.id}-${now}`,
    playerId: npc.id,
    npcId: npc.id,
    isHostile: true,
    originPlanetId: npcPlanet.id,
    targetPosition: targetPlanet.position,
    targetPlanetId: targetPlanet.id,
    missionType: MissionType.Attack,
    fleet: revengeFleet,
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    departureTime: gameNow,
    arrivalTime: gameNow + flightTime * 1000,
    status: 'outbound'
  }

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  // 清除復仇目標（已經反擊）
  npc.revengeTarget = undefined

  return mission
}

/**
 * NPC狀態診斷函式 - 用於除錯和了解NPC當前狀態
 */

// 診斷原因型別，包含翻譯鍵和引數
export interface DiagnosticReason {
  key: string // 翻譯鍵，如 'friendlyNoAction', 'insufficientProbes'
  params?: Record<string, string | number> // 翻譯引數，如 { current: 5, required: 10 }
}

// 關係狀態翻譯鍵型別
export type RelationStatusKey = 'friendly' | 'hostile' | 'neutral' | 'noRelation' | 'noRelationNeutral'

export interface NPCDiagnosticInfo {
  npcId: string
  npcName: string
  difficulty: string
  aiType?: NPCAIType // AI 行為型別
  relationStatus: string // 保持原有欄位用於顯示
  relationStatusKey: RelationStatusKey // 翻譯鍵
  reputation: number
  canSpy: boolean
  canAttack: boolean
  spyProbes: number
  totalFleetPower: number
  lastSpyTime: number
  lastAttackTime: number
  timeSinceLastSpy: number
  timeSinceLastAttack: number
  nextSpyIn: number
  nextAttackIn: number
  attackProbability: number
  reasons: DiagnosticReason[] // 改為結構化原因陣列
}

export const diagnoseNPCBehavior = (npcs: NPC[], player: Player, currentTime: number): NPCDiagnosticInfo[] => {
  const playerPoints = player.points || 0
  const config = calculateDynamicBehavior(playerPoints)

  return npcs.map(npc => {
    const planet = npc.planets[0]
    const relation = npc.relations?.[player.id]
    const reasons: DiagnosticReason[] = []

    // 檢查外交關係
    let canSpy = false // 預設不能偵查，只有敵對NPC才能偵查
    let canAttack = false // 預設不能攻擊，只有敵對NPC才能攻擊
    let relationStatus = ''
    let relationStatusKey: RelationStatusKey = 'noRelation'
    let reputation = 0

    if (relation) {
      reputation = relation.reputation || 0

      if (relation.status === RelationStatus.Friendly) {
        relationStatus = 'friendly'
        relationStatusKey = 'friendly'
        reasons.push({ key: 'friendlyNoAction' })
      } else if (relation.status === RelationStatus.Neutral) {
        relationStatus = 'neutral'
        relationStatusKey = 'neutral'
        reasons.push({ key: 'neutralNoAction' })
      } else if (relation.status === RelationStatus.Hostile) {
        relationStatus = 'hostile'
        relationStatusKey = 'hostile'
        canSpy = true
        canAttack = true
        reasons.push({ key: 'hostileWillAct' })
      }
    } else {
      // 無關係的NPC視為中立
      relationStatus = 'noRelationNeutral'
      relationStatusKey = 'noRelationNeutral'
      reasons.push({ key: 'noRelationNeutral' })
    }

    // 檢查偵查探測器數量
    const spyProbes = planet?.fleet?.[ShipType.EspionageProbe] || 0
    if (spyProbes < config.minSpyProbes) {
      canSpy = false
      reasons.push({ key: 'insufficientProbes', params: { current: spyProbes, required: config.minSpyProbes } })
    }

    // 計算艦隊戰力
    let totalFleetPower = 0
    if (planet?.fleet) {
      Object.entries(planet.fleet).forEach(([shipType, count]) => {
        const shipConfig = SHIPS[shipType as ShipType]
        if (shipConfig) {
          const power = shipConfig.attack + shipConfig.shield + shipConfig.armor / 10
          totalFleetPower += power * (count as number)
        }
      })
    }

    if (totalFleetPower === 0) {
      canAttack = false
      reasons.push({ key: 'noFleet' })
    }

    // 時間檢查
    const lastSpyTime = npc.lastSpyTime || 0
    const lastAttackTime = npc.lastAttackTime || 0
    const timeSinceLastSpy = Math.floor((currentTime - lastSpyTime) / 1000)
    const timeSinceLastAttack = Math.floor((currentTime - lastAttackTime) / 1000)

    const nextSpyIn = Math.max(0, config.spyInterval - timeSinceLastSpy)
    const nextAttackIn = Math.max(0, config.attackInterval - timeSinceLastAttack)

    if (timeSinceLastSpy < config.spyInterval) {
      reasons.push({ key: 'spyCooldown', params: { min: Math.floor(nextSpyIn / 60), sec: nextSpyIn % 60 } })
    }

    if (timeSinceLastAttack < config.attackInterval) {
      reasons.push({ key: 'attackCooldown', params: { min: Math.floor(nextAttackIn / 60), sec: nextAttackIn % 60 } })
    }

    // 檢查是否已經偵查過玩家
    const hasSpiedPlayer = npc.playerSpyReports && Object.keys(npc.playerSpyReports).length > 0

    if (!hasSpiedPlayer && canAttack) {
      canAttack = false
      reasons.push({ key: 'notSpiedYet' })
    }

    // 計算實際攻擊機率
    let actualAttackProbability = config.attackProbability
    if (relation?.status === RelationStatus.Hostile) {
      actualAttackProbability = Math.min(config.attackProbability * 2.0, 1.0)
    }

    return {
      npcId: npc.id,
      npcName: npc.name,
      difficulty: npc.difficulty,
      aiType: npc.aiType,
      relationStatus,
      relationStatusKey,
      reputation,
      canSpy,
      canAttack,
      spyProbes,
      totalFleetPower: Math.floor(totalFleetPower),
      lastSpyTime,
      lastAttackTime,
      timeSinceLastSpy,
      timeSinceLastAttack,
      nextSpyIn,
      nextAttackIn,
      attackProbability: actualAttackProbability,
      reasons
    }
  })
}

// ========== 敵對NPC增強行為系統 ==========

/**
 * 獲取NPC的報復等級
 * 基於被攻擊次數確定報復強度
 */
export const getRevengeLevel = (npc: NPC, playerId: string): RevengeLevel => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const levels = HOSTILE_BEHAVIOR_CONFIG.REVENGE_ESCALATION.LEVELS
  const memoryDuration = HOSTILE_BEHAVIOR_CONFIG.REVENGE_ESCALATION.MEMORY_DURATION

  // 預設等級（用於陣列為空或未找到時）
  const defaultLevel: RevengeLevel = levels[0] || { attackCount: 1, fleetMultiplier: 1.0, attackInterval: 600, name: 'mild' }

  const attackRecord = npc.attackedBy?.[playerId]
  if (!attackRecord) {
    return defaultLevel // 預設最低等級
  }

  // 檢查記憶是否過期
  const now = Date.now()
  if (now - attackRecord.lastAttackTime > memoryDuration) {
    return defaultLevel // 記憶過期，重置為最低等級
  }

  // 根據被攻擊次數確定報復等級
  const attackCount = attackRecord.count
  let currentLevel = defaultLevel

  for (const level of levels) {
    if (attackCount >= level.attackCount) {
      currentLevel = level
    }
  }

  return currentLevel
}

/**
 * 檢查NPC是否應該執行騷擾戰術
 */
export const shouldNPCHarass = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const harassConfig = HOSTILE_BEHAVIOR_CONFIG.HARASSMENT

  if (!harassConfig.ENABLED) {
    return false
  }

  // 檢查外交關係
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Hostile) {
    return false
  }

  // 檢查好感度是否足夠低
  if (relation.reputation > harassConfig.TRIGGER_REPUTATION) {
    return false
  }

  // 檢查騷擾冷卻時間
  const lastHarassTime = (npc as any).lastHarassTime || 0
  if (currentTime - lastHarassTime < harassConfig.INTERVAL * 1000) {
    return false
  }

  // 機率判斷
  return Math.random() < harassConfig.PROBABILITY
}

/**
 * 選擇騷擾型別
 */
export const selectHarassmentType = (): HarassmentType => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const types = HOSTILE_BEHAVIOR_CONFIG.HARASSMENT.TYPES

  const rand = Math.random()
  if (rand < types.spy) {
    return 'spy'
  } else if (rand < types.spy + types.raid) {
    return 'raid'
  } else {
    return 'intimidate'
  }
}

/**
 * 建立騷擾任務
 */
export const createHarassmentMission = (
  npc: NPC,
  player: Player,
  allPlanets: Planet[],
  harassmentType: HarassmentType
): FleetMission | null => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const harassConfig = HOSTILE_BEHAVIOR_CONFIG.HARASSMENT

  // 選擇隨機玩家星球作為目標
  const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
  if (playerPlanets.length === 0) return null

  const targetPlanet = playerPlanets[Math.floor(Math.random() * playerPlanets.length)]
  if (!targetPlanet) return null

  // 選擇NPC最佳星球
  const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
  if (!npcPlanet) return null

  let fleet: Partial<Fleet> = {}
  let missionType: MissionType = MissionType.Attack

  if (harassmentType === 'spy') {
    // 偵查騷擾：派出間諜探測器
    const probes = npcPlanet.fleet[ShipType.EspionageProbe] || 0
    if (probes < 1) return null
    fleet = { [ShipType.EspionageProbe]: Math.min(probes, 3) }
    missionType = MissionType.Spy
  } else {
    // 襲擊或威懾：派出小規模戰鬥艦隊
    const fleetRatio =
      harassConfig.FLEET_SIZE_RATIO.min + Math.random() * (harassConfig.FLEET_SIZE_RATIO.max - harassConfig.FLEET_SIZE_RATIO.min)

    const combatShips = [ShipType.LightFighter, ShipType.HeavyFighter, ShipType.Cruiser]

    let hasShips = false
    for (const shipType of combatShips) {
      const available = npcPlanet.fleet[shipType] || 0
      if (available > 0) {
        const sendCount = Math.max(1, Math.floor(available * fleetRatio))
        fleet[shipType] = sendCount
        hasShips = true
      }
    }

    if (!hasShips) return null

    // 威懾任務使用部署型別（不攻擊，只是展示武力）
    if (harassmentType === 'intimidate') {
      missionType = MissionType.Deploy
    }
  }

  // 從NPC星球扣除艦隊
  for (const [shipType, count] of Object.entries(fleet)) {
    npcPlanet.fleet[shipType as ShipType] = (npcPlanet.fleet[shipType as ShipType] || 0) - (count as number)
  }

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
  const fleetMinSpeed = getFleetMinSpeed(fleet)
  const flightTime = fleetLogic.calculateFlightTime(distance, fleetMinSpeed)

  const now = Date.now()
  const gameNow = getGameNow()
  const mission: FleetMission = {
    id: `npc-harass-${harassmentType}-${npc.id}-${now}`,
    playerId: npc.id,
    npcId: npc.id,
    isHostile: harassmentType !== 'intimidate', // 威懾不是敵對行動
    originPlanetId: npcPlanet.id,
    targetPosition: targetPlanet.position,
    targetPlanetId: targetPlanet.id,
    missionType,
    fleet,
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    departureTime: gameNow,
    arrivalTime: gameNow + flightTime * 1000,
    status: 'outbound'
  }

  // 更新騷擾時間
  ;(npc as any).lastHarassTime = now

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  return mission
}

/**
 * 檢查是否可以發起圍攻
 * 需要多個敵對NPC協調
 */
export const canInitiateSiege = (npcs: NPC[], player: Player, currentTime: number): { canSiege: boolean; eligibleNpcs: NPC[] } => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const siegeConfig = HOSTILE_BEHAVIOR_CONFIG.SIEGE

  if (!siegeConfig.ENABLED) {
    return { canSiege: false, eligibleNpcs: [] }
  }

  // 找出所有符合圍攻條件的敵對NPC
  const eligibleNpcs = npcs.filter(npc => {
    const relation = npc.relations?.[player.id]
    if (!relation || relation.status !== RelationStatus.Hostile) {
      return false
    }

    // 檢查好感度是否足夠低
    if (relation.reputation > siegeConfig.TRIGGER_REPUTATION) {
      return false
    }

    // 檢查圍攻冷卻
    const lastSiegeTime = (npc as any).lastSiegeTime || 0
    if (currentTime - lastSiegeTime < siegeConfig.COOLDOWN) {
      return false
    }

    // 檢查是否有足夠的艦隊
    const npcPlanet = npc.planets[0]
    if (!npcPlanet) return false

    const combatPower = calculateNPCCombatPower(npcPlanet)
    return combatPower >= MIN_COMBAT_POWER_FOR_SPY * 10 // 圍攻需要較大戰力
  })

  // 檢查是否有足夠的NPC參與圍攻
  const canSiege = eligibleNpcs.length >= siegeConfig.MIN_HOSTILE_NPCS

  return { canSiege, eligibleNpcs }
}

/**
 * 發起圍攻
 * 協調多個NPC同時攻擊玩家
 */
export const initiateSiege = (
  eligibleNpcs: NPC[],
  player: Player,
  allPlanets: Planet[]
): { missions: FleetMission[]; coordination: SiegeCoordination } | null => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const siegeConfig = HOSTILE_BEHAVIOR_CONFIG.SIEGE

  if (eligibleNpcs.length < siegeConfig.MIN_HOSTILE_NPCS) {
    return null
  }

  // 選擇目標星球（選擇資源最多的）
  const playerPlanets = allPlanets.filter(p => p.ownerId === player.id)
  if (playerPlanets.length === 0) return null

  let targetPlanet = playerPlanets[0]
  let maxResources = 0
  for (const planet of playerPlanets) {
    const totalResources = planet.resources.metal + planet.resources.crystal + planet.resources.deuterium
    if (totalResources > maxResources) {
      maxResources = totalResources
      targetPlanet = planet
    }
  }

  if (!targetPlanet) return null

  // 計算統一到達時間（以最遠NPC的飛行時間為基準）
  let maxFlightTime = 0
  for (const npc of eligibleNpcs) {
    const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
    if (npcPlanet) {
      const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
      const flightTime = fleetLogic.calculateFlightTime(distance, 10000) // 使用基準速度
      maxFlightTime = Math.max(maxFlightTime, flightTime)
    }
  }

  const now = Date.now()
  const coordWindow = siegeConfig.COORDINATION_WINDOW
  const baseArrivalTime = now + maxFlightTime * 1000 + coordWindow

  const missions: FleetMission[] = []
  const participantNpcIds: string[] = []

  // 為每個NPC建立攻擊任務
  for (const npc of eligibleNpcs) {
    const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
    if (!npcPlanet) continue

    // 計算圍攻艦隊
    const fleetRatio = siegeConfig.FLEET_RATIO.min + Math.random() * (siegeConfig.FLEET_RATIO.max - siegeConfig.FLEET_RATIO.min)

    const combatShips = [
      ShipType.LightFighter,
      ShipType.HeavyFighter,
      ShipType.Cruiser,
      ShipType.Battleship,
      ShipType.Bomber,
      ShipType.Destroyer,
      ShipType.Battlecruiser
    ]

    const siegeFleet: Partial<Fleet> = {}
    let hasShips = false

    for (const shipType of combatShips) {
      const available = npcPlanet.fleet[shipType] || 0
      if (available > 0) {
        const sendCount = Math.max(1, Math.floor(available * fleetRatio))
        siegeFleet[shipType] = sendCount
        hasShips = true
      }
    }

    if (!hasShips) continue

    // 從NPC星球扣除艦隊
    for (const [shipType, count] of Object.entries(siegeFleet)) {
      npcPlanet.fleet[shipType as ShipType] = (npcPlanet.fleet[shipType as ShipType] || 0) - (count as number)
    }

    // 計算隨機偏移的到達時間（在協調視窗內）
    const arrivalOffset = Math.random() * coordWindow
    const arrivalTime = baseArrivalTime + arrivalOffset

    // 反推出發時間
    const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
    const siegeMinSpeed = getFleetMinSpeed(siegeFleet)
    const actualFlightTime = fleetLogic.calculateFlightTime(distance, siegeMinSpeed)
    const departureTime = arrivalTime - actualFlightTime * 1000

    const mission: FleetMission = {
      id: `npc-siege-${npc.id}-${now}`,
      playerId: npc.id,
      npcId: npc.id,
      isHostile: true,
      originPlanetId: npcPlanet.id,
      targetPosition: targetPlanet.position,
      targetPlanetId: targetPlanet.id,
      missionType: MissionType.Attack,
      fleet: siegeFleet,
      cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
      departureTime: Math.max(now, departureTime),
      arrivalTime,
      status: 'outbound'
    }

    // 更新NPC的圍攻時間
    ;(npc as any).lastSiegeTime = now

    // 新增到NPC任務列表
    if (!npc.fleetMissions) {
      npc.fleetMissions = []
    }
    npc.fleetMissions.push(mission)

    missions.push(mission)
    participantNpcIds.push(npc.id)
  }

  if (missions.length < siegeConfig.MIN_HOSTILE_NPCS) {
    return null // 沒有足夠的NPC成功發起圍攻
  }

  const coordination: SiegeCoordination = {
    targetPlanetId: targetPlanet.id,
    targetPosition: targetPlanet.position,
    coordinatorNpcId: eligibleNpcs[0]?.id || '',
    participantNpcIds,
    arrivalTime: baseArrivalTime,
    startedAt: now
  }

  return { missions, coordination }
}

/**
 * 執行報復升級攻擊
 * 根據報復等級派出不同強度的攻擊
 */
export const executeEscalatedRevenge = (
  npc: NPC,
  player: Player,
  allPlanets: Planet[],
  config: DynamicBehaviorConfig
): FleetMission | null => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const escalationConfig = HOSTILE_BEHAVIOR_CONFIG.REVENGE_ESCALATION

  if (!escalationConfig.ENABLED) {
    return null
  }

  // 獲取報復等級
  const revengeLevel = getRevengeLevel(npc, player.id)

  // 檢查攻擊間隔
  const lastRevengeTime = npc.lastAttackTime || 0
  const now = Date.now()
  if (now - lastRevengeTime < revengeLevel.attackInterval * 1000) {
    return null
  }

  // 找到攻擊者的星球
  const attackRecord = npc.attackedBy?.[player.id]
  if (!attackRecord?.planetId) {
    return null
  }

  const targetPlanet = allPlanets.find(p => p.id === attackRecord.planetId)
  if (!targetPlanet) {
    return null
  }

  // 選擇NPC最佳星球
  const npcPlanet = selectBestNPCPlanet(npc, targetPlanet.position)
  if (!npcPlanet) {
    return null
  }

  // 根據報復等級計算艦隊規模
  const baseFleetRatio = config.attackFleetSizeRatio
  const escalatedRatio = Math.min(1.0, baseFleetRatio * revengeLevel.fleetMultiplier)

  const combatShips = [
    ShipType.LightFighter,
    ShipType.HeavyFighter,
    ShipType.Cruiser,
    ShipType.Battleship,
    ShipType.Bomber,
    ShipType.Destroyer,
    ShipType.Battlecruiser,
    ShipType.Deathstar
  ]

  const revengeFleet: Partial<Fleet> = {}
  let hasShips = false

  for (const shipType of combatShips) {
    const available = npcPlanet.fleet[shipType] || 0
    if (available > 0) {
      const sendCount = Math.max(1, Math.floor(available * escalatedRatio))
      revengeFleet[shipType] = sendCount
      hasShips = true
    }
  }

  if (!hasShips) {
    return null
  }

  // 從NPC星球扣除艦隊
  for (const [shipType, count] of Object.entries(revengeFleet)) {
    npcPlanet.fleet[shipType as ShipType] = (npcPlanet.fleet[shipType as ShipType] || 0) - (count as number)
  }

  // 計算飛行時間
  const distance = fleetLogic.calculateDistance(npcPlanet.position, targetPlanet.position)
  const revengeMinSpeed = getFleetMinSpeed(revengeFleet)
  const flightTime = fleetLogic.calculateFlightTime(distance, revengeMinSpeed)

  const gameNow = getGameNow()
  const mission: FleetMission = {
    id: `npc-revenge-escalated-${revengeLevel.name}-${npc.id}-${now}`,
    playerId: npc.id,
    npcId: npc.id,
    isHostile: true,
    originPlanetId: npcPlanet.id,
    targetPosition: targetPlanet.position,
    targetPlanetId: targetPlanet.id,
    missionType: MissionType.Attack,
    fleet: revengeFleet,
    cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    departureTime: gameNow,
    arrivalTime: gameNow + flightTime * 1000,
    status: 'outbound'
  }

  // 更新攻擊時間
  npc.lastAttackTime = now

  // 新增到NPC任務列表
  if (!npc.fleetMissions) {
    npc.fleetMissions = []
  }
  npc.fleetMissions.push(mission)

  return mission
}

/**
 * 呼叫盟友NPC助戰
 * 在報復等級較高時，可能呼叫盟友一起攻擊
 */
export const callAlliesForRevenge = (
  npc: NPC,
  allNpcs: NPC[],
  player: Player,
  allPlanets: Planet[],
  _config: DynamicBehaviorConfig
): FleetMission[] => {
  const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const escalationConfig = HOSTILE_BEHAVIOR_CONFIG.REVENGE_ESCALATION

  if (!escalationConfig.CALL_ALLIES) {
    return []
  }

  // 獲取報復等級
  const revengeLevel = getRevengeLevel(npc, player.id)

  // 計算呼叫盟友機率（報復等級越高機率越大）
  const levelIndex = HOSTILE_BEHAVIOR_CONFIG.REVENGE_ESCALATION.LEVELS.findIndex(l => l.name === revengeLevel.name)
  const allyCallProbability = escalationConfig.ALLY_CALL_BASE_PROBABILITY * (levelIndex + 1)

  if (Math.random() > allyCallProbability) {
    return []
  }

  // 找到NPC的盟友（同樣敵對玩家的NPC）
  const allyMissions: FleetMission[] = []
  const attackRecord = npc.attackedBy?.[player.id]
  if (!attackRecord?.planetId) {
    return []
  }

  const targetPlanet = allPlanets.find(p => p.id === attackRecord.planetId)
  if (!targetPlanet) {
    return []
  }

  for (const allyNpc of allNpcs) {
    if (allyNpc.id === npc.id) continue // 跳過自己

    // 檢查是否是盟友（也敵對玩家）
    const allyRelation = allyNpc.relations?.[player.id]
    if (!allyRelation || allyRelation.status !== RelationStatus.Hostile) {
      continue
    }

    // 檢查NPC之間是否有盟友關係
    const interNpcRelation = allyNpc.allies?.includes(npc.id) || npc.allies?.includes(allyNpc.id)
    if (!interNpcRelation) {
      // 即使不是正式盟友，敵對同一玩家的NPC也有機率響應
      if (Math.random() > 0.3) continue
    }

    // 選擇盟友NPC的最佳星球
    const allyPlanet = selectBestNPCPlanet(allyNpc, targetPlanet.position)
    if (!allyPlanet) continue

    // 派出援軍艦隊（較小規模）
    const combatShips = [ShipType.LightFighter, ShipType.HeavyFighter, ShipType.Cruiser, ShipType.Battleship]

    const allyFleet: Partial<Fleet> = {}
    let hasShips = false

    for (const shipType of combatShips) {
      const available = allyPlanet.fleet[shipType] || 0
      if (available > 0) {
        const sendCount = Math.max(1, Math.floor(available * 0.3)) // 援軍派30%
        allyFleet[shipType] = sendCount
        hasShips = true
      }
    }

    if (!hasShips) continue

    // 從盟友星球扣除艦隊
    for (const [shipType, count] of Object.entries(allyFleet)) {
      allyPlanet.fleet[shipType as ShipType] = (allyPlanet.fleet[shipType as ShipType] || 0) - (count as number)
    }

    // 計算飛行時間
    const distance = fleetLogic.calculateDistance(allyPlanet.position, targetPlanet.position)
    const allyMinSpeed = getFleetMinSpeed(allyFleet)
    const flightTime = fleetLogic.calculateFlightTime(distance, allyMinSpeed)

    const now = Date.now()
  const gameNow = getGameNow()
    const mission: FleetMission = {
      id: `npc-ally-revenge-${allyNpc.id}-${now}`,
      playerId: allyNpc.id,
      npcId: allyNpc.id,
      isHostile: true,
      originPlanetId: allyPlanet.id,
      targetPosition: targetPlanet.position,
      targetPlanetId: targetPlanet.id,
      missionType: MissionType.Attack,
      fleet: allyFleet,
      cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
      departureTime: gameNow,
      arrivalTime: gameNow + flightTime * 1000,
      status: 'outbound'
    }

    // 新增到盟友NPC任務列表
    if (!allyNpc.fleetMissions) {
      allyNpc.fleetMissions = []
    }
    allyNpc.fleetMissions.push(mission)

    allyMissions.push(mission)
  }

  return allyMissions
}

/**
 * 增強版NPC行為更新函式
 * 包含圍攻、騷擾、報復升級等增強行為
 */
export const updateHostileNPCBehavior = (
  npc: NPC,
  allNpcs: NPC[],
  player: Player,
  allPlanets: Planet[],
  _debrisFields: Record<string, DebrisField>,
  currentTime: number,
  activeSiege?: SiegeCoordination
): {
  harassMission?: FleetMission
  siegeMissions?: FleetMission[]
  revengeMission?: FleetMission
  allyRevengeMissions?: FleetMission[]
  newSiegeCoordination?: SiegeCoordination
} => {
  const result: {
    harassMission?: FleetMission
    siegeMissions?: FleetMission[]
    revengeMission?: FleetMission
    allyRevengeMissions?: FleetMission[]
    newSiegeCoordination?: SiegeCoordination
  } = {}

  const config = calculateDynamicBehavior(player.points)

  // 檢查是否是敵對NPC
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Hostile) {
    return result
  }

  // 1. 檢查報復升級（優先順序最高）
  if (npc.revengeTarget === player.id) {
    const revengeMission = executeEscalatedRevenge(npc, player, allPlanets, config)
    if (revengeMission) {
      result.revengeMission = revengeMission

      // 建立警告
      const targetPlanet = allPlanets.find(p => p.id === revengeMission.targetPlanetId)
      if (targetPlanet) {
        const alert = createIncomingFleetAlert(revengeMission, npc, targetPlanet)
        if (!player.incomingFleetAlerts) {
          player.incomingFleetAlerts = []
        }
        player.incomingFleetAlerts.push(alert)
      }

      // 呼叫盟友助戰
      const allyMissions = callAlliesForRevenge(npc, allNpcs, player, allPlanets, config)
      if (allyMissions.length > 0) {
        result.allyRevengeMissions = allyMissions

        // 為盟友任務建立警告
        for (const allyMission of allyMissions) {
          const targetPlanet = allPlanets.find(p => p.id === allyMission.targetPlanetId)
          const allyNpc = allNpcs.find(n => n.id === allyMission.npcId)
          if (targetPlanet && allyNpc) {
            const alert = createIncomingFleetAlert(allyMission, allyNpc, targetPlanet)
            player.incomingFleetAlerts.push(alert)
          }
        }
      }

      return result // 報復後不執行其他行為
    }
  }

  // 2. 檢查圍攻（如果沒有正在進行的圍攻）
  if (!activeSiege) {
    const { canSiege, eligibleNpcs } = canInitiateSiege(allNpcs, player, currentTime)
    if (canSiege && eligibleNpcs.includes(npc)) {
      // 機率觸發圍攻
      const { HOSTILE_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
      if (Math.random() < HOSTILE_BEHAVIOR_CONFIG.SIEGE.BASE_PROBABILITY) {
        const siegeResult = initiateSiege(eligibleNpcs, player, allPlanets)
        if (siegeResult) {
          result.siegeMissions = siegeResult.missions
          result.newSiegeCoordination = siegeResult.coordination

          // 為所有圍攻任務建立警告
          for (const mission of siegeResult.missions) {
            const targetPlanet = allPlanets.find(p => p.id === mission.targetPlanetId)
            const attackerNpc = allNpcs.find(n => n.id === mission.npcId)
            if (targetPlanet && attackerNpc) {
              const alert = createIncomingFleetAlert(mission, attackerNpc, targetPlanet)
              if (!player.incomingFleetAlerts) {
                player.incomingFleetAlerts = []
              }
              player.incomingFleetAlerts.push(alert)
            }
          }

          return result // 圍攻後不執行其他行為
        }
      }
    }
  }

  // 3. 檢查騷擾戰術
  if (shouldNPCHarass(npc, player, currentTime)) {
    const harassmentType = selectHarassmentType()
    const harassMission = createHarassmentMission(npc, player, allPlanets, harassmentType)
    if (harassMission) {
      result.harassMission = harassMission

      // 建立警告
      const targetPlanet = allPlanets.find(p => p.id === harassMission.targetPlanetId)
      if (targetPlanet) {
        const alert = createIncomingFleetAlert(harassMission, npc, targetPlanet)
        if (!player.incomingFleetAlerts) {
          player.incomingFleetAlerts = []
        }
        player.incomingFleetAlerts.push(alert)
      }
    }
  }

  return result
}

// ========== 中立NPC行為系統 ==========

/**
 * 檢查中立NPC是否應該提議貿易
 */
export const shouldNPCOfferTrade = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { NEUTRAL_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const tradeConfig = NEUTRAL_BEHAVIOR_CONFIG.TRADE

  if (!tradeConfig.ENABLED) {
    return false
  }

  // 檢查玩家當前貿易提議數量是否已達上限
  const maxOffers = (tradeConfig as any).MAX_PENDING_OFFERS || 30
  if ((player.tradeOffers?.length || 0) >= maxOffers) {
    return false
  }

  // 檢查外交關係
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Neutral) {
    return false
  }

  // 檢查好感度範圍
  if (relation.reputation < tradeConfig.MIN_REPUTATION || relation.reputation > tradeConfig.MAX_REPUTATION) {
    return false
  }

  // 檢查貿易冷卻
  const lastTradeTime = (npc as any).lastTradeOfferTime || 0
  if (currentTime - lastTradeTime < tradeConfig.CHECK_INTERVAL * 1000) {
    return false
  }

  // 機率判斷
  return Math.random() < tradeConfig.PROBABILITY
}

/**
 * 建立貿易提議
 */
export const createTradeOffer = (npc: NPC, player: Player): TradeOffer | null => {
  const { NEUTRAL_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const tradeConfig = NEUTRAL_BEHAVIOR_CONFIG.TRADE

  // 獲取NPC主星球
  const npcPlanet = npc.planets[0]
  if (!npcPlanet) return null

  // 計算玩家總產量
  const playerProduction = calculatePlayerTotalProduction(player)

  // 隨機決定貿易量
  const tradeMultiplier = tradeConfig.TRADE_AMOUNT.min + Math.random() * (tradeConfig.TRADE_AMOUNT.max - tradeConfig.TRADE_AMOUNT.min)

  // 隨機選擇交易型別
  const tradeTypes: Array<{ offer: 'metal' | 'crystal' | 'deuterium'; request: 'metal' | 'crystal' | 'deuterium'; rate: number }> = [
    { offer: 'crystal', request: 'metal', rate: tradeConfig.EXCHANGE_RATES.metalToCrystal },
    { offer: 'deuterium', request: 'metal', rate: tradeConfig.EXCHANGE_RATES.metalToDeuterium },
    { offer: 'deuterium', request: 'crystal', rate: tradeConfig.EXCHANGE_RATES.crystalToDeuterium }
  ]

  const selectedTrade = tradeTypes[Math.floor(Math.random() * tradeTypes.length)]
  if (!selectedTrade) return null

  // 計算交易量（基於玩家產量和NPC資源）
  const baseAmount = playerProduction[selectedTrade.request] * tradeMultiplier
  const npcHas = Math.floor(npcPlanet.resources[selectedTrade.offer] || 0)

  // 驗證基礎數值有效性
  if (!isFinite(baseAmount) || baseAmount <= 0 || !isFinite(npcHas) || npcHas <= 0) {
    return null
  }

  // NPC提供的資源量
  const offerAmount = Math.min(Math.floor(baseAmount / selectedTrade.rate), npcHas)
  if (!isFinite(offerAmount) || offerAmount <= 0) return null

  // 玩家需要支付的資源量（含手續費）
  const requestAmount = Math.floor(offerAmount * selectedTrade.rate * (1 + tradeConfig.FEE_PERCENTAGE / 100))
  if (!isFinite(requestAmount) || requestAmount <= 0) return null

  const now = Date.now()
  const offer: TradeOffer = {
    id: `trade-${npc.id}-${now}`,
    npcId: npc.id,
    npcName: npc.name,
    timestamp: now,
    offeredResources: {
      type: selectedTrade.offer,
      amount: offerAmount
    },
    requestedResources: {
      type: selectedTrade.request,
      amount: requestAmount
    },
    expiresAt: now + 30 * 60 * 1000, // 30分鐘後過期
    status: 'pending'
  }

  // 更新NPC的貿易時間
  ;(npc as any).lastTradeOfferTime = now

  return offer
}

/**
 * 處理貿易接受
 */
export const acceptTradeOffer = (
  offer: TradeOffer,
  npc: NPC,
  player: Player,
  playerPlanet: Planet
): { success: boolean; reason?: string } => {
  const { NEUTRAL_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const tradeConfig = NEUTRAL_BEHAVIOR_CONFIG.TRADE

  // 檢查貿易是否過期
  if (Date.now() > offer.expiresAt) {
    offer.status = 'expired'
    return { success: false, reason: 'errors.tradeExpired' }
  }

  // 檢查玩家是否有足夠資源
  const playerHas = playerPlanet.resources[offer.requestedResources.type]
  if (playerHas < offer.requestedResources.amount) {
    return { success: false, reason: 'errors.insufficientResources' }
  }

  // 獲取NPC主星球
  const npcPlanet = npc.planets[0]
  if (!npcPlanet) {
    return { success: false, reason: 'errors.npcPlanetNotFound' }
  }

  // 檢查NPC是否還有足夠資源
  const npcHas = npcPlanet.resources[offer.offeredResources.type]
  if (npcHas < offer.offeredResources.amount) {
    return { success: false, reason: 'errors.npcInsufficientResources' }
  }

  // 執行交易
  // 從玩家扣除
  playerPlanet.resources[offer.requestedResources.type] -= offer.requestedResources.amount

  // 給玩家資源
  playerPlanet.resources[offer.offeredResources.type] += offer.offeredResources.amount

  // 從NPC扣除
  npcPlanet.resources[offer.offeredResources.type] -= offer.offeredResources.amount

  // 給NPC資源
  npcPlanet.resources[offer.requestedResources.type] += offer.requestedResources.amount

  // 增加好感度
  const relation = npc.relations?.[player.id]
  if (relation) {
    relation.reputation = Math.min(DIPLOMATIC_CONFIG.MAX_REPUTATION, relation.reputation + tradeConfig.REPUTATION_GAIN)
    relation.lastUpdated = Date.now()
  }

  offer.status = 'accepted'
  return { success: true }
}

/**
 * 檢查中立NPC是否應該搖擺態度
 */
export const shouldNPCSwingAttitude = (
  npc: NPC,
  player: Player,
  currentTime: number
): { shouldSwing: boolean; direction?: 'friendly' | 'hostile' } => {
  const { NEUTRAL_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const swingConfig = NEUTRAL_BEHAVIOR_CONFIG.SWING

  if (!swingConfig.ENABLED) {
    return { shouldSwing: false }
  }

  // 檢查外交關係
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Neutral) {
    return { shouldSwing: false }
  }

  // 檢查搖擺冷卻
  const lastSwingCheck = (npc as any).lastSwingCheck || 0
  if (currentTime - lastSwingCheck < swingConfig.CHECK_INTERVAL * 1000) {
    return { shouldSwing: false }
  }

  // 更新檢查時間
  ;(npc as any).lastSwingCheck = currentTime

  // 檢查是否達到搖擺閾值
  if (relation.reputation >= swingConfig.SWING_THRESHOLD.toFriendly) {
    // 好感度足夠高，可能變友好
    const probability = swingConfig.BASE_PROBABILITY * (relation.reputation / 20)
    if (Math.random() < probability) {
      return { shouldSwing: true, direction: 'friendly' }
    }
  } else if (relation.reputation <= swingConfig.SWING_THRESHOLD.toHostile) {
    // 好感度足夠低，可能變敵對
    const probability = swingConfig.BASE_PROBABILITY * (Math.abs(relation.reputation) / 20)
    if (Math.random() < probability) {
      return { shouldSwing: true, direction: 'hostile' }
    }
  }

  return { shouldSwing: false }
}

/**
 * 執行NPC態度搖擺
 */
export const executeNPCSwing = (npc: NPC, player: Player, direction: 'friendly' | 'hostile'): void => {
  const relation = npc.relations?.[player.id]
  if (!relation) return

  if (direction === 'friendly') {
    relation.status = RelationStatus.Friendly
    relation.reputation = Math.max(relation.reputation, DIPLOMATIC_CONFIG.FRIENDLY_THRESHOLD + 5)
  } else {
    relation.status = RelationStatus.Hostile
    relation.reputation = Math.min(relation.reputation, DIPLOMATIC_CONFIG.HOSTILE_THRESHOLD - 5)
  }

  relation.lastUpdated = Date.now()
}

/**
 * 中立NPC觀察附近事件並調整好感度
 */
export const observeNearbyEvents = (neutralNpc: NPC, eventNpc: NPC, player: Player, eventType: 'attack' | 'help'): void => {
  const { NEUTRAL_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const observeConfig = NEUTRAL_BEHAVIOR_CONFIG.OBSERVE

  if (!observeConfig.ENABLED) return

  // 檢查是否是中立NPC
  const relation = neutralNpc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Neutral) return

  // 檢查是否在同一星系（如果配置要求）
  if (observeConfig.SAME_GALAXY_ONLY) {
    const neutralPlanet = neutralNpc.planets[0]
    const eventPlanet = eventNpc.planets[0]
    if (!neutralPlanet || !eventPlanet) return
    if (neutralPlanet.position.galaxy !== eventPlanet.position.galaxy) return
  }

  // 根據事件型別調整好感度
  if (eventType === 'attack') {
    relation.reputation = Math.max(DIPLOMATIC_CONFIG.MIN_REPUTATION, relation.reputation + observeConfig.ATTACK_NEARBY_PENALTY)
  } else if (eventType === 'help') {
    relation.reputation = Math.min(DIPLOMATIC_CONFIG.MAX_REPUTATION, relation.reputation + observeConfig.HELP_NEARBY_BONUS)
  }

  relation.lastUpdated = Date.now()
}

// ========== 友好NPC增強行為系統 ==========

/**
 * 檢查友好NPC是否應該分享情報
 */
export const shouldNPCShareIntel = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { FRIENDLY_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const intelConfig = FRIENDLY_BEHAVIOR_CONFIG.INTEL_SHARING

  if (!intelConfig.ENABLED) {
    return false
  }

  // 檢查外交關係
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Friendly) {
    return false
  }

  // 檢查好感度
  if (relation.reputation < intelConfig.MIN_REPUTATION) {
    return false
  }

  // 檢查分享冷卻
  const lastIntelTime = (npc as any).lastIntelShareTime || 0
  if (currentTime - lastIntelTime < intelConfig.INTERVAL * 1000) {
    return false
  }

  // 機率判斷
  return Math.random() < intelConfig.PROBABILITY
}

/**
 * 選擇情報型別
 */
export const selectIntelType = (): IntelType => {
  const { FRIENDLY_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const types = FRIENDLY_BEHAVIOR_CONFIG.INTEL_SHARING.INTEL_TYPES

  const rand = Math.random()
  if (rand < types.enemyFleet) {
    return 'enemyFleet'
  } else if (rand < types.enemyFleet + types.enemyResources) {
    return 'enemyResources'
  } else {
    return 'enemyMovement'
  }
}

/**
 * 建立情報報告
 */
export const createIntelReport = (friendlyNpc: NPC, allNpcs: NPC[], player: Player): IntelReport | null => {
  // 找到一個敵對NPC作為情報目標
  const hostileNpcs = allNpcs.filter(n => {
    const relation = n.relations?.[player.id]
    return relation && relation.status === RelationStatus.Hostile
  })

  if (hostileNpcs.length === 0) return null

  const targetNpc = hostileNpcs[Math.floor(Math.random() * hostileNpcs.length)]
  if (!targetNpc) return null

  const targetPlanet = targetNpc.planets[0]
  if (!targetPlanet) return null

  const intelType = selectIntelType()
  const now = Date.now()

  const report: IntelReport = {
    id: `intel-${friendlyNpc.id}-${now}`,
    fromNpcId: friendlyNpc.id,
    fromNpcName: friendlyNpc.name,
    timestamp: now,
    targetNpcId: targetNpc.id,
    targetNpcName: targetNpc.name,
    intelType,
    data: {},
    read: false
  }

  // 根據情報型別填充資料
  switch (intelType) {
    case 'enemyFleet':
      report.data.fleet = { ...targetPlanet.fleet }
      break
    case 'enemyResources':
      report.data.resources = { ...targetPlanet.resources }
      break
    case 'enemyMovement':
      // 檢查NPC是否有正在進行的任務
      const activeMission = targetNpc.fleetMissions?.find(m => m.status === 'outbound')
      if (activeMission) {
        report.data.movement = {
          targetPosition: activeMission.targetPosition,
          arrivalTime: activeMission.arrivalTime,
          missionType: activeMission.missionType
        }
      } else {
        // 沒有活動任務，改為分享艦隊資訊
        report.intelType = 'enemyFleet'
        report.data.fleet = { ...targetPlanet.fleet }
      }
      break
  }

  // 更新NPC的情報分享時間
  ;(friendlyNpc as any).lastIntelShareTime = now

  return report
}

/**
 * 檢查友好NPC是否應該邀請聯合攻擊
 */
export const shouldNPCInviteJointAttack = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { FRIENDLY_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const jointConfig = FRIENDLY_BEHAVIOR_CONFIG.JOINT_ATTACK

  if (!jointConfig.ENABLED) {
    return false
  }

  // 檢查外交關係
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Friendly) {
    return false
  }

  // 檢查好感度
  if (relation.reputation < jointConfig.MIN_REPUTATION) {
    return false
  }

  // 檢查邀請冷卻
  const lastInviteTime = (npc as any).lastJointAttackInvite || 0
  if (currentTime - lastInviteTime < jointConfig.INTERVAL * 1000) {
    return false
  }

  // 機率判斷
  return Math.random() < jointConfig.PROBABILITY
}

/**
 * 建立聯合攻擊邀請
 */
export const createJointAttackInvite = (friendlyNpc: NPC, allNpcs: NPC[], player: Player): JointAttackInvite | null => {
  const { FRIENDLY_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const jointConfig = FRIENDLY_BEHAVIOR_CONFIG.JOINT_ATTACK

  // 找到合適的攻擊目標
  let targetNpc: NPC | null = null

  if (jointConfig.PREFER_COMMON_ENEMY) {
    // 優先選擇共同敵人（對友好NPC也敵對的NPC）
    const commonEnemies = allNpcs.filter(n => {
      const playerRelation = n.relations?.[player.id]
      const npcRelation = n.relations?.[friendlyNpc.id]
      return playerRelation?.status === RelationStatus.Hostile && npcRelation?.status === RelationStatus.Hostile
    })
    if (commonEnemies.length > 0) {
      targetNpc = commonEnemies[Math.floor(Math.random() * commonEnemies.length)] || null
    }
  }

  // 如果沒有共同敵人，選擇任意敵對NPC
  if (!targetNpc) {
    const hostileNpcs = allNpcs.filter(n => {
      const relation = n.relations?.[player.id]
      return relation && relation.status === RelationStatus.Hostile
    })
    if (hostileNpcs.length > 0) {
      targetNpc = hostileNpcs[Math.floor(Math.random() * hostileNpcs.length)] || null
    }
  }

  if (!targetNpc) return null

  const targetPlanet = targetNpc.planets[0]
  if (!targetPlanet) return null

  // 計算NPC承諾的艦隊
  const npcPlanet = friendlyNpc.planets[0]
  if (!npcPlanet) return null

  const fleetRatio = jointConfig.NPC_FLEET_RATIO.min + Math.random() * (jointConfig.NPC_FLEET_RATIO.max - jointConfig.NPC_FLEET_RATIO.min)

  const combatShips = [
    ShipType.LightFighter,
    ShipType.HeavyFighter,
    ShipType.Cruiser,
    ShipType.Battleship,
    ShipType.Bomber,
    ShipType.Destroyer
  ]

  const committedFleet: Partial<Fleet> = {}
  let hasShips = false

  for (const shipType of combatShips) {
    const available = npcPlanet.fleet[shipType] || 0
    if (available > 0) {
      const commitCount = Math.floor(available * fleetRatio)
      if (commitCount > 0) {
        committedFleet[shipType] = commitCount
        hasShips = true
      }
    }
  }

  if (!hasShips) return null

  const now = Date.now()
  const invite: JointAttackInvite = {
    id: `joint-attack-${friendlyNpc.id}-${now}`,
    fromNpcId: friendlyNpc.id,
    fromNpcName: friendlyNpc.name,
    timestamp: now,
    targetNpcId: targetNpc.id,
    targetNpcName: targetNpc.name,
    targetPlanetId: targetPlanet.id,
    targetPosition: targetPlanet.position,
    npcFleetCommitment: committedFleet,
    expectedLootRatio: jointConfig.PLAYER_LOOT_RATIO,
    expiresAt: now + 2 * 60 * 60 * 1000, // 2小時後過期
    status: 'pending'
  }

  // 更新NPC的邀請時間
  ;(friendlyNpc as any).lastJointAttackInvite = now

  return invite
}

/**
 * 檢查友好NPC是否應該提供資源援助
 */
export const shouldNPCProvideAid = (npc: NPC, player: Player, currentTime: number): boolean => {
  const { FRIENDLY_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const aidConfig = FRIENDLY_BEHAVIOR_CONFIG.RESOURCE_AID

  if (!aidConfig.ENABLED) {
    return false
  }

  // 檢查外交關係
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Friendly) {
    return false
  }

  // 檢查好感度
  if (relation.reputation < aidConfig.MIN_REPUTATION) {
    return false
  }

  // 檢查援助冷卻
  const lastAidTime = (npc as any).lastAidTime || 0
  if (currentTime - lastAidTime < aidConfig.CHECK_INTERVAL * 1000) {
    return false
  }

  // 檢查玩家是否資源緊張
  const playerProduction = calculatePlayerTotalProduction(player)
  const lowResourceThreshold = {
    metal: playerProduction.metal * aidConfig.TRIGGER_LOW_RESOURCES_HOURS,
    crystal: playerProduction.crystal * aidConfig.TRIGGER_LOW_RESOURCES_HOURS,
    deuterium: playerProduction.deuterium * aidConfig.TRIGGER_LOW_RESOURCES_HOURS
  }

  // 檢查玩家總資源
  let totalPlayerResources = { metal: 0, crystal: 0, deuterium: 0 }
  for (const planet of player.planets) {
    totalPlayerResources.metal += planet.resources.metal
    totalPlayerResources.crystal += planet.resources.crystal
    totalPlayerResources.deuterium += planet.resources.deuterium
  }

  // 如果玩家資源充足，不援助
  if (
    totalPlayerResources.metal > lowResourceThreshold.metal &&
    totalPlayerResources.crystal > lowResourceThreshold.crystal &&
    totalPlayerResources.deuterium > lowResourceThreshold.deuterium
  ) {
    return false
  }

  // 機率判斷
  return Math.random() < aidConfig.PROBABILITY
}

/**
 * 執行資源援助
 */
export const executeResourceAid = (npc: NPC, player: Player): Resources | null => {
  const { FRIENDLY_BEHAVIOR_CONFIG } = DIPLOMATIC_CONFIG
  const aidConfig = FRIENDLY_BEHAVIOR_CONFIG.RESOURCE_AID

  // 獲取NPC主星球
  const npcPlanet = npc.planets[0]
  if (!npcPlanet) return null

  // 計算援助量
  const playerProduction = calculatePlayerTotalProduction(player)
  const aidAmount = {
    metal: Math.floor(playerProduction.metal * aidConfig.AID_AMOUNT_HOURS),
    crystal: Math.floor(playerProduction.crystal * aidConfig.AID_AMOUNT_HOURS),
    deuterium: Math.floor(playerProduction.deuterium * aidConfig.AID_AMOUNT_HOURS),
    darkMatter: 0,
    energy: 0
  }

  // 限制為NPC實際擁有的資源
  aidAmount.metal = Math.min(aidAmount.metal, Math.floor(npcPlanet.resources.metal * 0.5))
  aidAmount.crystal = Math.min(aidAmount.crystal, Math.floor(npcPlanet.resources.crystal * 0.5))
  aidAmount.deuterium = Math.min(aidAmount.deuterium, Math.floor(npcPlanet.resources.deuterium * 0.5))

  // 如果援助量太少，不援助
  if (aidAmount.metal <= 0 && aidAmount.crystal <= 0 && aidAmount.deuterium <= 0) {
    return null
  }

  // 從NPC扣除
  npcPlanet.resources.metal -= aidAmount.metal
  npcPlanet.resources.crystal -= aidAmount.crystal
  npcPlanet.resources.deuterium -= aidAmount.deuterium

  // 給玩家主星球
  const playerMainPlanet = player.planets[0]
  if (playerMainPlanet) {
    playerMainPlanet.resources.metal += aidAmount.metal
    playerMainPlanet.resources.crystal += aidAmount.crystal
    playerMainPlanet.resources.deuterium += aidAmount.deuterium
  }

  // 更新援助時間
  ;(npc as any).lastAidTime = Date.now()

  return aidAmount
}

/**
 * 更新中立NPC行為
 */
export const updateNeutralNPCBehavior = (
  npc: NPC,
  _allNpcs: NPC[],
  player: Player,
  currentTime: number
): {
  tradeOffer?: TradeOffer
  swingDirection?: 'friendly' | 'hostile'
} => {
  const result: {
    tradeOffer?: TradeOffer
    swingDirection?: 'friendly' | 'hostile'
  } = {}

  // 檢查是否是中立NPC
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Neutral) {
    return result
  }

  // 1. 檢查貿易提議
  if (shouldNPCOfferTrade(npc, player, currentTime)) {
    const offer = createTradeOffer(npc, player)
    if (offer) {
      result.tradeOffer = offer
    }
  }

  // 2. 檢查態度搖擺
  const swingResult = shouldNPCSwingAttitude(npc, player, currentTime)
  if (swingResult.shouldSwing && swingResult.direction) {
    executeNPCSwing(npc, player, swingResult.direction)
    result.swingDirection = swingResult.direction
  }

  return result
}

/**
 * 更新友好NPC行為
 */
export const updateFriendlyNPCBehavior = (
  npc: NPC,
  allNpcs: NPC[],
  player: Player,
  currentTime: number
): {
  intelReport?: IntelReport
  jointAttackInvite?: JointAttackInvite
  aidProvided?: Resources
} => {
  const result: {
    intelReport?: IntelReport
    jointAttackInvite?: JointAttackInvite
    aidProvided?: Resources
  } = {}

  // 檢查是否是友好NPC
  const relation = npc.relations?.[player.id]
  if (!relation || relation.status !== RelationStatus.Friendly) {
    return result
  }

  // 1. 檢查情報分享
  if (shouldNPCShareIntel(npc, player, currentTime)) {
    const report = createIntelReport(npc, allNpcs, player)
    if (report) {
      result.intelReport = report
    }
  }

  // 2. 檢查聯合攻擊邀請
  if (shouldNPCInviteJointAttack(npc, player, currentTime)) {
    const invite = createJointAttackInvite(npc, allNpcs, player)
    if (invite) {
      result.jointAttackInvite = invite
    }
  }

  // 3. 檢查資源援助
  if (shouldNPCProvideAid(npc, player, currentTime)) {
    const aid = executeResourceAid(npc, player)
    if (aid) {
      result.aidProvided = aid
    }
  }

  return result
}

/**
 * 綜合NPC行為更新函式
 * 根據NPC與玩家的關係狀態呼叫相應的行為更新
 */
export const updateAllNPCBehaviors = (
  npcs: NPC[],
  player: Player,
  allPlanets: Planet[],
  debrisFields: Record<string, DebrisField>,
  currentTime: number,
  activeSiege?: SiegeCoordination
): {
  hostileResults: Map<string, ReturnType<typeof updateHostileNPCBehavior>>
  neutralResults: Map<string, ReturnType<typeof updateNeutralNPCBehavior>>
  friendlyResults: Map<string, ReturnType<typeof updateFriendlyNPCBehavior>>
  newSiegeCoordination?: SiegeCoordination
} => {
  const hostileResults = new Map<string, ReturnType<typeof updateHostileNPCBehavior>>()
  const neutralResults = new Map<string, ReturnType<typeof updateNeutralNPCBehavior>>()
  const friendlyResults = new Map<string, ReturnType<typeof updateFriendlyNPCBehavior>>()
  let newSiegeCoordination: SiegeCoordination | undefined

  for (const npc of npcs) {
    const relation = npc.relations?.[player.id]

    if (relation?.status === RelationStatus.Hostile) {
      // 敵對NPC
      const result = updateHostileNPCBehavior(npc, npcs, player, allPlanets, debrisFields, currentTime, activeSiege)
      hostileResults.set(npc.id, result)
      if (result.newSiegeCoordination) {
        newSiegeCoordination = result.newSiegeCoordination
      }
    } else if (relation?.status === RelationStatus.Neutral) {
      // 中立NPC
      const result = updateNeutralNPCBehavior(npc, npcs, player, currentTime)
      neutralResults.set(npc.id, result)
    } else if (relation?.status === RelationStatus.Friendly) {
      // 友好NPC
      const result = updateFriendlyNPCBehavior(npc, npcs, player, currentTime)
      friendlyResults.set(npc.id, result)
    }
  }

  return {
    hostileResults,
    neutralResults,
    friendlyResults,
    newSiegeCoordination
  }
}

// ========== NPC聯盟系統 ==========

/**
 * 獲取NPC之間的AI型別相容性分數
 */
export const getAITypeCompatibility = (type1?: NPCAIType, type2?: NPCAIType): number => {
  const { NPC_ALLIANCE_CONFIG } = DIPLOMATIC_CONFIG
  const compatibility = NPC_ALLIANCE_CONFIG.INTER_NPC_RELATIONS.TYPE_COMPATIBILITY

  // 預設型別為平衡型
  const t1 = type1 || NPCAIType.Balanced
  const t2 = type2 || NPCAIType.Balanced

  // 商人型與任何型別都友好
  if (t1 === NPCAIType.Trader || t2 === NPCAIType.Trader) {
    return compatibility.trader_any
  }

  // 侵略型與防守型互為敵人
  if ((t1 === NPCAIType.Aggressive && t2 === NPCAIType.Defensive) || (t1 === NPCAIType.Defensive && t2 === NPCAIType.Aggressive)) {
    return compatibility.aggressive_defensive
  }

  // 擴張型互相競爭
  if (t1 === NPCAIType.Expansionist && t2 === NPCAIType.Expansionist) {
    return compatibility.expansionist_expansionist
  }

  // 平衡型保持中立
  if (t1 === NPCAIType.Balanced || t2 === NPCAIType.Balanced) {
    return compatibility.balanced_any
  }

  // 預設中立
  return 0
}

/**
 * 初始化NPC之間的關係
 */
export const initializeInterNPCRelations = (npcs: NPC[]): void => {
  const { NPC_ALLIANCE_CONFIG } = DIPLOMATIC_CONFIG

  if (!NPC_ALLIANCE_CONFIG.ENABLED) return

  const config = NPC_ALLIANCE_CONFIG.INTER_NPC_RELATIONS

  for (const npc of npcs) {
    if (!npc.allies) npc.allies = []
    if (!npc.enemies) npc.enemies = []

    const npcPlanet = npc.planets[0]
    if (!npcPlanet) continue

    for (const otherNpc of npcs) {
      if (npc.id === otherNpc.id) continue

      const otherPlanet = otherNpc.planets[0]
      if (!otherPlanet) continue

      // 計算關係分數
      let relationScore = 0

      // 1. AI型別相容性
      const typeCompatibility = getAITypeCompatibility(npc.aiType, otherNpc.aiType)
      relationScore += typeCompatibility * 50 // 將-1到1對映到-50到50

      // 2. 同一星系加成
      if (npcPlanet.position.galaxy === otherPlanet.position.galaxy) {
        relationScore += config.SAME_GALAXY_ALLY_BONUS * 100 // 30點加成
      }

      // 3. 隨機因素（如果是mixed模式）
      if (config.INIT_MODE === 'mixed' || config.INIT_MODE === 'random') {
        relationScore += (Math.random() - 0.5) * 40 // -20到20的隨機值
      }

      // 根據分數決定關係
      if (relationScore > 30) {
        // 盟友
        if (!npc.allies.includes(otherNpc.id)) {
          npc.allies.push(otherNpc.id)
        }
      } else if (relationScore < -30) {
        // 敵人
        if (!npc.enemies.includes(otherNpc.id)) {
          npc.enemies.push(otherNpc.id)
        }
      }
      // 否則保持中立
    }
  }
}

/**
 * 傳播連坐效應
 * 當玩家攻擊/幫助NPC時，影響其盟友的好感度
 */
export const propagateGuiltByAssociation = (
  targetNpc: NPC,
  allNpcs: NPC[],
  player: Player,
  eventType: 'attack' | 'help',
  depth: number = 0
): void => {
  const { NPC_ALLIANCE_CONFIG } = DIPLOMATIC_CONFIG
  const guiltConfig = NPC_ALLIANCE_CONFIG.GUILT_BY_ASSOCIATION

  if (!guiltConfig.ENABLED) return
  if (depth >= guiltConfig.MAX_PROPAGATION_DEPTH) return

  // 獲取目標NPC的盟友
  const allies = targetNpc.allies || []

  for (const allyId of allies) {
    const allyNpc = allNpcs.find(n => n.id === allyId)
    if (!allyNpc) continue

    // 獲取盟友與玩家的關係
    const relation = allyNpc.relations?.[player.id]
    if (!relation) continue

    // 計算好感度變化
    let reputationChange = eventType === 'attack' ? guiltConfig.ALLY_REPUTATION_PENALTY : guiltConfig.ALLY_REPUTATION_BONUS

    // 如果啟用強度乘數，根據傳播深度減弱效果
    if (guiltConfig.STRENGTH_MULTIPLIER) {
      reputationChange = Math.floor(reputationChange * Math.pow(0.5, depth))
    }

    // 應用好感度變化
    relation.reputation = Math.max(
      DIPLOMATIC_CONFIG.MIN_REPUTATION,
      Math.min(DIPLOMATIC_CONFIG.MAX_REPUTATION, relation.reputation + reputationChange)
    )
    relation.lastUpdated = Date.now()

    // 更新關係狀態
    if (relation.reputation < DIPLOMATIC_CONFIG.HOSTILE_THRESHOLD) {
      relation.status = RelationStatus.Hostile
    } else if (relation.reputation > DIPLOMATIC_CONFIG.FRIENDLY_THRESHOLD) {
      relation.status = RelationStatus.Friendly
    } else {
      relation.status = RelationStatus.Neutral
    }

    // 遞迴傳播到盟友的盟友
    propagateGuiltByAssociation(allyNpc, allNpcs, player, eventType, depth + 1)
  }
}

/**
 * NPC盟友互助：當NPC被攻擊時，盟友可能響應
 */
export const checkAllyMutualDefense = (
  attackedNpc: NPC,
  attackerPlayerId: string,
  allNpcs: NPC[],
  allPlanets: Planet[],
  currentTime: number
): FleetMission[] => {
  const { NPC_ALLIANCE_CONFIG } = DIPLOMATIC_CONFIG
  const defenseConfig = NPC_ALLIANCE_CONFIG.MUTUAL_DEFENSE

  if (!defenseConfig.ENABLED) return []

  const defenseMissions: FleetMission[] = []
  const allies = attackedNpc.allies || []

  // 找到攻擊者的星球
  const attackerPlanet = allPlanets.find(p => p.ownerId === attackerPlayerId)
  if (!attackerPlanet) return []

  for (const allyId of allies) {
    const allyNpc = allNpcs.find(n => n.id === allyId)
    if (!allyNpc) continue

    // 檢查響應冷卻
    const lastDefenseTime = (allyNpc as any).lastMutualDefenseTime || 0
    if (currentTime - lastDefenseTime < defenseConfig.COOLDOWN * 1000) {
      continue
    }

    // 機率檢查
    if (Math.random() > defenseConfig.RESPONSE_PROBABILITY) {
      continue
    }

    // 選擇盟友最佳星球
    const allyPlanet = selectBestNPCPlanet(allyNpc, attackerPlanet.position)
    if (!allyPlanet) continue

    // 計算響應艦隊
    const fleetRatio = defenseConfig.FLEET_RATIO.min + Math.random() * (defenseConfig.FLEET_RATIO.max - defenseConfig.FLEET_RATIO.min)

    const combatShips = [
      ShipType.LightFighter,
      ShipType.HeavyFighter,
      ShipType.Cruiser,
      ShipType.Battleship,
      ShipType.Bomber,
      ShipType.Destroyer
    ]

    const defenseFleet: Partial<Fleet> = {}
    let hasShips = false

    for (const shipType of combatShips) {
      const available = allyPlanet.fleet[shipType] || 0
      if (available > 0) {
        const sendCount = Math.max(1, Math.floor(available * fleetRatio))
        defenseFleet[shipType] = sendCount
        hasShips = true
      }
    }

    if (!hasShips) continue

    // 從盟友星球扣除艦隊
    for (const [shipType, count] of Object.entries(defenseFleet)) {
      allyPlanet.fleet[shipType as ShipType] = (allyPlanet.fleet[shipType as ShipType] || 0) - (count as number)
    }

    // 計算飛行時間
    const distance = fleetLogic.calculateDistance(allyPlanet.position, attackerPlanet.position)
    const defenseMinSpeed = getFleetMinSpeed(defenseFleet)
    const flightTime = fleetLogic.calculateFlightTime(distance, defenseMinSpeed)

    const now = Date.now()
  const gameNow = getGameNow()
    const mission: FleetMission = {
      id: `npc-mutual-defense-${allyNpc.id}-${now}`,
      playerId: allyNpc.id,
      npcId: allyNpc.id,
      isHostile: true,
      originPlanetId: allyPlanet.id,
      targetPosition: attackerPlanet.position,
      targetPlanetId: attackerPlanet.id,
      missionType: MissionType.Attack,
      fleet: defenseFleet,
      cargo: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
      departureTime: gameNow,
      arrivalTime: gameNow + flightTime * 1000,
      status: 'outbound'
    }

    // 更新響應時間
    ;(allyNpc as any).lastMutualDefenseTime = now

    // 新增到盟友NPC任務列表
    if (!allyNpc.fleetMissions) {
      allyNpc.fleetMissions = []
    }
    allyNpc.fleetMissions.push(mission)

    defenseMissions.push(mission)
  }

  return defenseMissions
}

/**
 * NPC之間的資源共享
 */
export const executeNPCResourceSharing = (npcs: NPC[], currentTime: number): void => {
  const { NPC_ALLIANCE_CONFIG } = DIPLOMATIC_CONFIG
  const sharingConfig = NPC_ALLIANCE_CONFIG.RESOURCE_SHARING

  if (!sharingConfig.ENABLED) return

  for (const npc of npcs) {
    // 檢查共享冷卻
    const lastShareTime = (npc as any).lastResourceShareTime || 0
    if (currentTime - lastShareTime < sharingConfig.INTERVAL * 1000) {
      continue
    }

    const npcPlanet = npc.planets[0]
    if (!npcPlanet) continue

    const allies = npc.allies || []
    if (allies.length === 0) continue

    // 計算可共享資源
    const shareAmount = {
      metal: Math.floor(npcPlanet.resources.metal * sharingConfig.SHARE_RATIO),
      crystal: Math.floor(npcPlanet.resources.crystal * sharingConfig.SHARE_RATIO),
      deuterium: Math.floor(npcPlanet.resources.deuterium * sharingConfig.SHARE_RATIO)
    }

    // 平均分配給所有盟友
    const perAlly = {
      metal: Math.floor(shareAmount.metal / allies.length),
      crystal: Math.floor(shareAmount.crystal / allies.length),
      deuterium: Math.floor(shareAmount.deuterium / allies.length)
    }

    if (perAlly.metal <= 0 && perAlly.crystal <= 0 && perAlly.deuterium <= 0) {
      continue
    }

    // 從NPC扣除
    npcPlanet.resources.metal -= perAlly.metal * allies.length
    npcPlanet.resources.crystal -= perAlly.crystal * allies.length
    npcPlanet.resources.deuterium -= perAlly.deuterium * allies.length

    // 分配給盟友
    for (const allyId of allies) {
      const allyNpc = npcs.find(n => n.id === allyId)
      if (!allyNpc) continue

      const allyPlanet = allyNpc.planets[0]
      if (!allyPlanet) continue

      allyPlanet.resources.metal += perAlly.metal
      allyPlanet.resources.crystal += perAlly.crystal
      allyPlanet.resources.deuterium += perAlly.deuterium
    }

    // 更新共享時間
    ;(npc as any).lastResourceShareTime = currentTime
  }
}

/**
 * 獲取NPC的所有盟友資訊
 */
export const getNPCAllies = (npc: NPC, allNpcs: NPC[]): NPC[] => {
  const allies: NPC[] = []
  const allyIds = npc.allies || []

  for (const allyId of allyIds) {
    const allyNpc = allNpcs.find(n => n.id === allyId)
    if (allyNpc) {
      allies.push(allyNpc)
    }
  }

  return allies
}

/**
 * 獲取NPC的所有敵人資訊
 */
export const getNPCEnemies = (npc: NPC, allNpcs: NPC[]): NPC[] => {
  const enemies: NPC[] = []
  const enemyIds = npc.enemies || []

  for (const enemyId of enemyIds) {
    const enemyNpc = allNpcs.find(n => n.id === enemyId)
    if (enemyNpc) {
      enemies.push(enemyNpc)
    }
  }

  return enemies
}

/**
 * 增強版NPC被攻擊處理
 * 包含連坐效應和盟友互助
 */
export const handleNPCAttackedWithAlliance = (
  npc: NPC,
  attackerId: string,
  attackerPlanetId: string | undefined,
  allNpcs: NPC[],
  player: Player,
  allPlanets: Planet[],
  currentTime: number
): FleetMission[] => {
  // 基礎被攻擊處理
  handleNPCAttacked(npc, attackerId, attackerPlanetId)

  // 傳播連坐效應
  propagateGuiltByAssociation(npc, allNpcs, player, 'attack')

  // 檢查盟友互助
  const defenseMissions = checkAllyMutualDefense(npc, attackerId, allNpcs, allPlanets, currentTime)

  return defenseMissions
}

/**
 * 更新NPC聯盟系統
 * 在遊戲迴圈中呼叫
 */
export const updateNPCAllianceSystem = (npcs: NPC[], currentTime: number): void => {
  const { NPC_ALLIANCE_CONFIG } = DIPLOMATIC_CONFIG

  if (!NPC_ALLIANCE_CONFIG.ENABLED) return

  // 執行NPC之間的資源共享
  executeNPCResourceSharing(npcs, currentTime)
}
