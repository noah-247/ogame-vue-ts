/**
 * 外交系統邏輯
 *
 * 管理玩家與NPC之間的雙向好感度、關係狀態和外交事件
 */

import { DIPLOMATIC_CONFIG } from '@/config/gameConfig'
import { getLocale, type Locale } from '@/locales'
import * as resourceLogic from './resourceLogic'
import * as officerLogic from './officerLogic'
import type {
  DiplomaticRelation,
  RelationStatus,
  DiplomaticEventType,
  DiplomaticReport,
  Resources,
  Player,
  NPC,
  Planet,
  FleetMission,
  BattleResult,
  Position,
  GiftNotification,
  GiftRejectedNotification
} from '@/types/game'
import { RelationStatus as RS, DiplomaticEventType as DET } from '@/types/game'
import { getGameNow } from './gameTime'

/**
 * 獲取翻譯文字的輔助函式
 * @param key 翻譯鍵
 * @param locale 語言程式碼
 * @param params 引數
 * @returns 翻譯後的文字
 */
const t = (key: string, locale: Locale, params?: Record<string, string | number>): string => {
  const keys = key.split('.')
  let value: any = getLocale(locale)

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      return key // 如果找不到翻譯，返回原始 key
    }
  }

  let result = typeof value === 'string' ? value : key

  // 替換引數佔位符
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
    })
  }

  return result
}

/**
 * 根據好感度值計算關係狀態
 * @param reputation 好感度值 (-100 到 +100)
 * @returns 關係狀態
 */
export const calculateRelationStatus = (reputation: number): RelationStatus => {
  if (reputation <= DIPLOMATIC_CONFIG.HOSTILE_THRESHOLD) {
    return RS.Hostile
  } else if (reputation >= DIPLOMATIC_CONFIG.FRIENDLY_THRESHOLD) {
    return RS.Friendly
  }
  return RS.Neutral
}

/**
 * 初始化外交關係
 * @param fromId 關係發起方ID
 * @param toId 關係接收方ID
 * @returns 新的外交關係物件
 */
export const initializeDiplomaticRelation = (fromId: string, toId: string): DiplomaticRelation => {
  return {
    fromId,
    toId,
    reputation: 0, // 初始中立
    status: RS.Neutral,
    lastUpdated: Date.now(),
    history: []
  }
}

/**
 * 更新好感度值
 * @param relation 外交關係物件
 * @param change 好感度變化值
 * @param reason 變化原因
 * @param details 詳細資訊
 * @returns 更新後的外交關係物件
 */
export const updateReputation = (
  relation: DiplomaticRelation,
  change: number,
  reason: DiplomaticEventType,
  details?: string
): DiplomaticRelation => {
  const oldReputation = relation.reputation

  // 計算新的好感度（限制在範圍內）
  const newReputation = Math.max(DIPLOMATIC_CONFIG.MIN_REPUTATION, Math.min(DIPLOMATIC_CONFIG.MAX_REPUTATION, oldReputation + change))

  // 更新狀態
  const newStatus = calculateRelationStatus(newReputation)

  // 記錄歷史
  if (!relation.history) {
    relation.history = []
  }
  relation.history.push({
    timestamp: Date.now(),
    change,
    reason,
    details
  })

  // 只保留最近50條歷史記錄
  if (relation.history.length > 50) {
    relation.history = relation.history.slice(-50)
  }

  return {
    ...relation,
    reputation: newReputation,
    status: newStatus,
    lastUpdated: Date.now()
  }
}

/**
 * 計算贈送資源的好感度增加值
 * @param resources 贈送的資源
 * @returns 好感度增加值
 */
export const calculateGiftReputationGain = (resources: Resources): number => {
  const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG

  // 計算資源總價值（晶體和氘氣價值更高）
  const totalValue = resources.metal + resources.crystal * 1.5 + resources.deuterium * 3

  // 檢查是否達到最小价值門檻
  if (totalValue < REPUTATION_CHANGES.GIFT_MIN_VALUE) {
    return 0 // 低於門檻不獲得好感度
  }

  // 基礎好感度 + 基於價值的額外好感度
  const baseGain = REPUTATION_CHANGES.GIFT_BASE
  const valueGain = Math.floor(totalValue / 1000) * REPUTATION_CHANGES.GIFT_PER_1K_RESOURCES

  // 確保達到門檻的禮物至少獲得1點好感度
  const totalGain = Math.max(baseGain + valueGain, 1)

  // 限制在最大值範圍內
  return Math.min(totalGain, REPUTATION_CHANGES.GIFT_MAX_SINGLE)
}

/**
 * 獲取或建立外交關係
 * @param relations 關係記錄
 * @param fromId 關係發起方ID
 * @param toId 關係接收方ID
 * @returns 外交關係物件
 */
export const getOrCreateRelation = (relations: Record<string, DiplomaticRelation>, fromId: string, toId: string): DiplomaticRelation => {
  if (!relations[toId]) {
    relations[toId] = initializeDiplomaticRelation(fromId, toId)
  }
  return relations[toId]
}

/**
 * 計算NPC拒絕禮物的機率
 * @param npc NPC
 * @param player 玩家
 * @returns 拒絕機率（0-1）
 */
export const calculateNPCRejectionProbability = (npc: NPC, player: Player): number => {
  const { GIFT_ACCEPTANCE_CONFIG } = DIPLOMATIC_CONFIG

  // 獲取NPC對玩家的好感度
  const relation = npc.relations?.[player.id]
  const reputation = relation?.reputation || 0

  // 基礎機率 + 好感度修正
  // 好感度越低，拒絕機率越高
  let rejectionProb = GIFT_ACCEPTANCE_CONFIG.NPC_REJECTION_BASE_PROBABILITY

  // 好感度修正：每低於0一點，增加1%拒絕機率
  if (reputation < 0) {
    rejectionProb += Math.abs(reputation) * GIFT_ACCEPTANCE_CONFIG.NPC_REJECTION_REPUTATION_MODIFIER
  } else if (reputation > 0) {
    // 好感度為正時，降低拒絕機率
    rejectionProb -= reputation * GIFT_ACCEPTANCE_CONFIG.NPC_REJECTION_REPUTATION_MODIFIER
  }

  // 限制在最小和最大範圍內
  return Math.max(
    GIFT_ACCEPTANCE_CONFIG.MIN_REJECTION_PROBABILITY,
    Math.min(GIFT_ACCEPTANCE_CONFIG.MAX_REJECTION_PROBABILITY, rejectionProb)
  )
}

/**
 * 處理贈送資源到達（需要NPC接受判定）
 * @param mission 艦隊任務
 * @param player 玩家
 * @param targetNpc 目標NPC
 * @param locale 語言程式碼
 * @returns { accepted: boolean, reputationGain?: number }
 */
export const handleGiftArrival = (
  mission: FleetMission,
  player: Player,
  targetNpc: NPC,
  locale: Locale
): { accepted: boolean; reputationGain?: number } => {
  // 計算NPC拒絕機率
  const rejectionProb = calculateNPCRejectionProbability(targetNpc, player)
  const isRejected = Math.random() < rejectionProb

  if (isRejected) {
    // NPC拒絕禮物
    handleGiftRejection(player, targetNpc, mission.cargo, locale)
    return { accepted: false }
  }

  // NPC接受禮物
  // 計算好感度增加值
  const reputationGain = calculateGiftReputationGain(mission.cargo)

  // 更新NPC對玩家的關係（統一使用 npc.relations）
  if (!targetNpc.relations) {
    targetNpc.relations = {}
  }

  const npcRelation = getOrCreateRelation(targetNpc.relations, targetNpc.id, player.id)
  targetNpc.relations[player.id] = updateReputation(
    npcRelation,
    reputationGain,
    DET.GiftResources,
    t('diplomacy.reports.giftedResources', locale, {
      metal: mission.cargo.metal.toString(),
      crystal: mission.cargo.crystal.toString(),
      deuterium: mission.cargo.deuterium.toString()
    })
  )

  // 生成外交報告
  generateDiplomaticReport(
    player,
    targetNpc,
    DET.GiftResources,
    reputationGain,
    t('diplomacy.reports.giftedToNpc', locale, { npcName: targetNpc.name, reputation: reputationGain.toString() })
  )

  return { accepted: true, reputationGain }
}

/**
 * 處理禮物被拒絕
 * @param player 玩家
 * @param npc NPC
 * @param rejectedResources 被拒絕的資源
 * @param locale 語言程式碼
 */
const handleGiftRejection = (player: Player, npc: NPC, rejectedResources: Resources, locale: Locale): void => {
  const { GIFT_ACCEPTANCE_CONFIG } = DIPLOMATIC_CONFIG

  // 建立拒絕通知
  if (!player.giftRejectedNotifications) {
    player.giftRejectedNotifications = []
  }

  const relation = npc.relations?.[player.id]
  const currentReputation = relation?.reputation || 0

  const notification: GiftRejectedNotification = {
    id: `gift-rejected-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    npcId: npc.id,
    npcName: npc.name,
    rejectedResources,
    currentReputation,
    reason: currentReputation < -20 ? 'hostile' : currentReputation < 20 ? 'neutral_distrust' : 'polite_decline',
    read: false
  }

  player.giftRejectedNotifications.push(notification)

  // 限制通知數量
  if (player.giftRejectedNotifications.length > 50) {
    player.giftRejectedNotifications = player.giftRejectedNotifications.slice(-50)
  }

  // 拒絕禮物會降低好感度
  if (!npc.relations) {
    npc.relations = {}
  }

  const npcRelation = getOrCreateRelation(npc.relations, npc.id, player.id)
  npc.relations[player.id] = updateReputation(
    npcRelation,
    GIFT_ACCEPTANCE_CONFIG.REJECTION_REPUTATION_PENALTY,
    DET.GiftResources,
    t('diplomacy.reports.rejectedPlayerGift', locale)
  )

  // 生成外交報告
  generateDiplomaticReport(
    player,
    npc,
    DET.GiftResources,
    GIFT_ACCEPTANCE_CONFIG.REJECTION_REPUTATION_PENALTY,
    t('diplomacy.reports.npcRejectedGift', locale, {
      npcName: npc.name,
      reputation: GIFT_ACCEPTANCE_CONFIG.REJECTION_REPUTATION_PENALTY.toString()
    })
  )
}

/**
 * 處理攻擊事件的好感度變化
 * @param attacker 攻擊者（玩家）
 * @param defender 防禦者（NPC）
 * @param battleResult 戰鬥結果
 * @param allNpcs 所有NPC列表
 * @param locale 語言程式碼
 */
export const handleAttackReputation = (
  attacker: Player,
  defender: NPC,
  battleResult: BattleResult,
  allNpcs: NPC[],
  locale: Locale
): void => {
  const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG

  // 計算好感度降低值
  let reputationLoss = REPUTATION_CHANGES.ATTACK

  if (battleResult.winner === 'attacker') {
    reputationLoss = REPUTATION_CHANGES.ATTACK_WIN
  }

  // 更新NPC對玩家的關係（統一使用 npc.relations）
  if (!defender.relations) {
    defender.relations = {}
  }

  const defenderRelation = getOrCreateRelation(defender.relations, defender.id, attacker.id)
  defender.relations[attacker.id] = updateReputation(
    defenderRelation,
    reputationLoss,
    DET.Attack,
    t('diplomacy.reports.wasAttackedByPlayer', locale)
  )

  // 檢查盟友關係網路
  if (defender.allies && defender.allies.length > 0) {
    handleAllyAttackedReputation(attacker, defender, allNpcs, locale)
  }

  // 生成外交報告
  generateDiplomaticReport(
    attacker,
    defender,
    DET.Attack,
    reputationLoss,
    t('diplomacy.reports.youAttackedNpc', locale, { npcName: defender.name })
  )
}

/**
 * 處理盟友被攻擊的好感度變化
 * @param attacker 攻擊者（玩家）
 * @param attackedNpc 被攻擊的NPC
 * @param allNpcs 所有NPC列表
 * @param locale 語言程式碼
 */
export const handleAllyAttackedReputation = (attacker: Player, attackedNpc: NPC, allNpcs: NPC[], locale: Locale): void => {
  const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG

  // 找到所有盟友
  const allies = allNpcs.filter(npc => attackedNpc.allies?.includes(npc.id))

  allies.forEach(ally => {
    // 更新盟友對玩家的關係
    if (!ally.relations) {
      ally.relations = {}
    }

    const allyRelation = getOrCreateRelation(ally.relations, ally.id, attacker.id)
    ally.relations[attacker.id] = updateReputation(
      allyRelation,
      REPUTATION_CHANGES.ALLY_ATTACKED,
      DET.AllyAttacked,
      t('diplomacy.reports.playerAttackedAlly', locale, { allyName: attackedNpc.name })
    )

    // 生成外交報告
    generateDiplomaticReport(
      attacker,
      ally,
      DET.AllyAttacked,
      REPUTATION_CHANGES.ALLY_ATTACKED,
      t('diplomacy.reports.allyDispleased', locale, { allyName: ally.name, targetName: attackedNpc.name })
    )
  })
}

/**
 * 處理偵查事件的好感度變化
 * @param spy 偵查者（玩家）
 * @param target 偵查目標（NPC）
 * @param wasDetected 是否被發現
 * @param locale 語言程式碼
 */
export const handleSpyReputation = (spy: Player, target: NPC, wasDetected: boolean, locale: Locale): void => {
  const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG

  const reputationLoss = wasDetected ? REPUTATION_CHANGES.SPY_DETECTED : REPUTATION_CHANGES.SPY_UNDETECTED

  // NPC對玩家的關係始終受影響
  if (!target.relations) {
    target.relations = {}
  }

  const targetRelation = getOrCreateRelation(target.relations, target.id, spy.id)
  target.relations[spy.id] = updateReputation(
    targetRelation,
    reputationLoss,
    DET.Spy,
    t('diplomacy.reports.wasSpiedByPlayer', locale, { detected: wasDetected ? 'true' : 'false' })
  )

  // 如果被發現，生成外交報告
  if (wasDetected) {
    generateDiplomaticReport(spy, target, DET.Spy, reputationLoss, t('diplomacy.reports.spyDetected', locale, { npcName: target.name }))
  }
}

/**
 * 處理回收殘骸事件的好感度變化
 * 如果殘骸在NPC星球位置，視為搶奪
 * @param player 玩家
 * @param debrisPosition 殘骸位置
 * @param allNpcs 所有NPC列表
 * @param locale 語言程式碼
 */
export const handleDebrisRecycleReputation = (player: Player, debrisPosition: Position, allNpcs: NPC[], locale: Locale): void => {
  const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG

  // 找到該位置的NPC星球所有者
  const npcOwner = allNpcs.find(npc =>
    npc.planets.some(
      p =>
        p.position.galaxy === debrisPosition.galaxy &&
        p.position.system === debrisPosition.system &&
        p.position.position === debrisPosition.position
    )
  )

  if (npcOwner) {
    // 這是在NPC星球位置回收殘骸，視為搶奪
    // 更新NPC對玩家的關係（統一使用 npc.relations）
    if (!npcOwner.relations) {
      npcOwner.relations = {}
    }

    const npcRelation = getOrCreateRelation(npcOwner.relations, npcOwner.id, player.id)
    npcOwner.relations[player.id] = updateReputation(
      npcRelation,
      REPUTATION_CHANGES.STEAL_DEBRIS,
      DET.StealDebris,
      t('diplomacy.reports.stoleDebrisFromTerritory', locale, { npcName: npcOwner.name })
    )

    // 生成外交報告
    generateDiplomaticReport(
      player,
      npcOwner,
      DET.StealDebris,
      REPUTATION_CHANGES.STEAL_DEBRIS,
      t('diplomacy.reports.recycledDebrisNearNpc', locale, { npcName: npcOwner.name })
    )
  }
}

/**
 * 處理星球摧毀事件的好感度變化
 * 摧毀星球是最嚴重的行為，直接導致敵對關係
 * @param attacker 攻擊者（玩家）
 * @param destroyedPlanet 被摧毀的星球
 * @param planetOwner 星球所有者（NPC）
 * @param allNpcs 所有NPC列表
 * @param locale 語言程式碼
 */
export const handlePlanetDestructionReputation = (
  attacker: Player,
  destroyedPlanet: Planet,
  planetOwner: NPC,
  allNpcs: NPC[],
  locale: Locale
): void => {
  const { HOSTILE_THRESHOLD } = DIPLOMATIC_CONFIG
  const now = Date.now()

  // 更新星球所有者對玩家的關係 - 直接設為敵對（統一使用 npc.relations）
  if (!planetOwner.relations) {
    planetOwner.relations = {}
  }

  const ownerRelation = getOrCreateRelation(planetOwner.relations, planetOwner.id, attacker.id)
  const ownerEventDescription = t('diplomacy.reports.playerDestroyedPlanet', locale, {
    planetName: destroyedPlanet.name
  })

  planetOwner.relations[attacker.id] = {
    ...ownerRelation,
    reputation: HOSTILE_THRESHOLD, // 直接設為敵對閾值
    status: RS.Hostile,
    lastUpdated: now,
    history: [
      ...(ownerRelation.history || []),
      {
        timestamp: now,
        change: HOSTILE_THRESHOLD - ownerRelation.reputation,
        reason: DET.DestroyPlanet,
        details: ownerEventDescription
      }
    ]
  }

  // 生成外交報告
  generateDiplomaticReport(
    attacker,
    planetOwner,
    DET.DestroyPlanet,
    HOSTILE_THRESHOLD,
    t('diplomacy.reports.youDestroyedNpcPlanet', locale, {
      npcName: planetOwner.name,
      planetName: destroyedPlanet.name,
      reputation: HOSTILE_THRESHOLD
    }),
    'diplomacy.reports.youDestroyedNpcPlanet',
    { npcName: planetOwner.name, planetName: destroyedPlanet.name, reputation: HOSTILE_THRESHOLD }
  )

  // 檢查盟友關係網路 - 摧毀星球對盟友的影響更嚴重
  if (planetOwner.allies && planetOwner.allies.length > 0) {
    handleAllyPlanetDestroyedReputation(attacker, planetOwner, destroyedPlanet, allNpcs, locale)
  }
}

/**
 * 處理盟友星球被摧毀的好感度變化
 * @param attacker 攻擊者（玩家）
 * @param attackedNpc 星球被摧毀的NPC
 * @param destroyedPlanet 被摧毀的星球
 * @param allNpcs 所有NPC列表
 * @param locale 語言程式碼
 */
export const handleAllyPlanetDestroyedReputation = (
  attacker: Player,
  attackedNpc: NPC,
  destroyedPlanet: Planet,
  allNpcs: NPC[],
  locale: Locale
): void => {
  const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG

  // 找到所有盟友
  const allies = allNpcs.filter(npc => attackedNpc.allies?.includes(npc.id))

  allies.forEach(ally => {
    // 更新盟友對玩家的關係 - 摧毀盟友星球的懲罰是攻擊的兩倍
    if (!ally.relations) {
      ally.relations = {}
    }

    const allyRelation = getOrCreateRelation(ally.relations, ally.id, attacker.id)
    const reputationLoss = REPUTATION_CHANGES.ALLY_ATTACKED * 2 // 雙倍懲罰
    ally.relations[attacker.id] = updateReputation(
      allyRelation,
      reputationLoss,
      DET.DestroyPlanet,
      t('diplomacy.reports.playerDestroyedAllyPlanet', locale, { allyName: attackedNpc.name, planetName: destroyedPlanet.name })
    )

    // 生成外交報告
    generateDiplomaticReport(
      attacker,
      ally,
      DET.DestroyPlanet,
      reputationLoss,
      t('diplomacy.reports.allyOutraged', locale, {
        allyName: ally.name,
        targetName: attackedNpc.name,
        planetName: destroyedPlanet.name
      }),
      'diplomacy.reports.allyOutraged',
      {
        allyName: ally.name,
        targetName: attackedNpc.name,
        planetName: destroyedPlanet.name
      }
    )
  })
}

/**
 * 生成外交報告
 * @param player 玩家
 * @param npc NPC
 * @param eventType 事件型別
 * @param reputationChange 好感度變化值
 * @param message 訊息內容（已棄用，用於向後相容）
 * @param messageKey 翻譯鍵（可選）
 * @param messageParams 翻譯引數（可選）
 */
const generateDiplomaticReport = (
  player: Player,
  npc: NPC,
  eventType: DiplomaticEventType,
  reputationChange: number,
  message: string,
  messageKey?: string,
  messageParams?: Record<string, string | number>
): void => {
  if (!player.diplomaticReports) {
    player.diplomaticReports = []
  }

  // 使用 npc.relations 作為唯一資料來源
  const relation = npc.relations?.[player.id] || initializeDiplomaticRelation(npc.id, player.id)
  const oldStatus = relation.status
  const newReputation = Math.max(
    DIPLOMATIC_CONFIG.MIN_REPUTATION,
    Math.min(DIPLOMATIC_CONFIG.MAX_REPUTATION, relation.reputation + reputationChange)
  )
  const newStatus = calculateRelationStatus(newReputation)

  const report: DiplomaticReport = {
    id: `diplomatic-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    npcId: npc.id,
    npcName: npc.name,
    eventType,
    reputationChange,
    newReputation,
    oldStatus,
    newStatus,
    message,
    messageKey,
    messageParams,
    read: false
  }

  player.diplomaticReports.push(report)

  // 只保留最近100條報告
  if (player.diplomaticReports.length > 100) {
    player.diplomaticReports = player.diplomaticReports.slice(-100)
  }
}

/**
 * 處理NPC贈送資源給玩家（建立禮物通知，等待玩家接受/拒絕）
 * @param npc 贈送方NPC
 * @param player 接收方玩家
 * @param giftResources 贈送的資源
 */
export const handleNPCGiftToPlayer = (npc: NPC, player: Player, giftResources: Resources): void => {
  const { GIFT_ACCEPTANCE_CONFIG } = DIPLOMATIC_CONFIG

  // 建立禮物通知
  if (!player.giftNotifications) {
    player.giftNotifications = []
  }

  const npcRelation = npc.relations?.[player.id]
  const currentReputation = npcRelation?.reputation || 0
  const expectedReputationGain = Math.floor(calculateGiftReputationGain(giftResources) * 0.5)

  const notification: GiftNotification = {
    id: `gift-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    fromNpcId: npc.id,
    fromNpcName: npc.name,
    resources: giftResources,
    currentReputation,
    expectedReputationGain,
    expiresAt: Date.now() + GIFT_ACCEPTANCE_CONFIG.GIFT_EXPIRATION_DAYS * 24 * 3600 * 1000,
    read: false
  }

  player.giftNotifications.push(notification)

  // 限制通知數量
  if (player.giftNotifications.length > 50) {
    player.giftNotifications = player.giftNotifications.slice(-50)
  }
}

/**
 * 玩家接受NPC的禮物
 * @param player 玩家
 * @param npc NPC
 * @param giftNotification 禮物通知
 * @param locale 語言程式碼
 */
export const acceptNPCGift = (player: Player, npc: NPC, giftNotification: GiftNotification, locale: Locale): void => {
  // 將資源新增到玩家主星球（使用安全新增函式防止溢位）
  if (player.planets && player.planets.length > 0) {
    const mainPlanet = player.planets[0]
    if (mainPlanet) {
      // 計算軍官加成
      const bonuses = officerLogic.calculateActiveBonuses(player.officers, getGameNow())
      // 使用安全新增函式，超出容量的資源會丟失
      resourceLogic.addResourcesSafely(mainPlanet, giftNotification.resources, bonuses.storageCapacityBonus)
    }
  }

  // 更新NPC對玩家的關係
  if (!npc.relations) {
    npc.relations = {}
  }

  const npcRelation = getOrCreateRelation(npc.relations, npc.id, player.id)
  npc.relations[player.id] = updateReputation(
    npcRelation,
    giftNotification.expectedReputationGain,
    DET.GiftResources,
    t('diplomacy.reports.giftedResourcesToPlayer', locale)
  )

  // 生成外交報告
  generateDiplomaticReport(
    player,
    npc,
    DET.GiftResources,
    giftNotification.expectedReputationGain,
    t('diplomacy.reports.acceptedGiftFromNpc', locale, {
      npcName: npc.name,
      metal: giftNotification.resources.metal.toString(),
      crystal: giftNotification.resources.crystal.toString(),
      deuterium: giftNotification.resources.deuterium.toString()
    })
  )

  // 移除禮物通知
  if (player.giftNotifications) {
    player.giftNotifications = player.giftNotifications.filter(n => n.id !== giftNotification.id)
  }
}

/**
 * 玩家拒絕NPC的禮物
 * @param player 玩家
 * @param npc NPC
 * @param giftNotification 禮物通知
 * @param locale 語言程式碼
 */
export const rejectNPCGift = (player: Player, npc: NPC, giftNotification: GiftNotification, locale: Locale): void => {
  const { GIFT_ACCEPTANCE_CONFIG } = DIPLOMATIC_CONFIG

  // 拒絕禮物會降低好感度
  if (!npc.relations) {
    npc.relations = {}
  }

  const npcRelation = getOrCreateRelation(npc.relations, npc.id, player.id)
  npc.relations[player.id] = updateReputation(
    npcRelation,
    GIFT_ACCEPTANCE_CONFIG.REJECTION_REPUTATION_PENALTY,
    DET.GiftResources,
    t('diplomacy.reports.playerRejectedGift', locale)
  )

  // 生成外交報告
  generateDiplomaticReport(
    player,
    npc,
    DET.GiftResources,
    GIFT_ACCEPTANCE_CONFIG.REJECTION_REPUTATION_PENALTY,
    t('diplomacy.reports.rejectedGiftFromNpc', locale, {
      npcName: npc.name,
      reputation: GIFT_ACCEPTANCE_CONFIG.REJECTION_REPUTATION_PENALTY.toString()
    })
  )

  // 移除禮物通知
  if (player.giftNotifications) {
    player.giftNotifications = player.giftNotifications.filter(n => n.id !== giftNotification.id)
  }
}

/**
 * 處理NPC被徹底消滅（所有星球被摧毀）
 * @param eliminatedNpc 被消滅的NPC
 * @param player 玩家
 * @param allNpcs 所有NPC列表
 * @param locale 語言程式碼
 */
export const handleNPCElimination = (eliminatedNpc: NPC, player: Player, allNpcs: NPC[], locale: Locale): void => {
  const { HOSTILE_THRESHOLD } = DIPLOMATIC_CONFIG

  // 1. 將NPC對玩家的關係設為最低（敵對狀態）
  if (!eliminatedNpc.relations) {
    eliminatedNpc.relations = {}
  }

  const relation = getOrCreateRelation(eliminatedNpc.relations, eliminatedNpc.id, player.id)
  const now = Date.now()

  eliminatedNpc.relations[player.id] = {
    ...relation,
    reputation: HOSTILE_THRESHOLD, // 設為敵對閾值
    status: RS.Hostile,
    lastUpdated: now,
    history: [
      ...(relation.history || []),
      {
        timestamp: now,
        change: HOSTILE_THRESHOLD - relation.reputation,
        reason: DET.DestroyPlanet,
        details: t('diplomacy.reports.npcEliminated', locale, { npcName: eliminatedNpc.name })
      }
    ]
  }

  // 2. 生成外交報告
  generateDiplomaticReport(
    player,
    eliminatedNpc,
    DET.DestroyPlanet,
    HOSTILE_THRESHOLD,
    t('diplomacy.reports.npcEliminatedMessage', locale, { npcName: eliminatedNpc.name }),
    'diplomacy.reports.npcEliminatedMessage',
    { npcName: eliminatedNpc.name }
  )

  // 3. 從所有其他NPC的盟友列表中移除被消滅的NPC
  allNpcs.forEach(npc => {
    if (npc.id !== eliminatedNpc.id && npc.allies && npc.allies.includes(eliminatedNpc.id)) {
      npc.allies = npc.allies.filter(allyId => allyId !== eliminatedNpc.id)
    }
  })
}

/**
 * 檢查並處理被消滅的NPC（所有星球都被摧毀的NPC）
 * @param allNpcs 所有NPC列表
 * @param player 玩家
 * @param locale 語言程式碼
 * @returns 被消滅的NPC ID列表
 */
export const checkAndHandleEliminatedNPCs = (allNpcs: NPC[], player: Player, locale: Locale): string[] => {
  const eliminatedNpcIds: string[] = []

  allNpcs.forEach(npc => {
    // 檢查NPC是否還有星球
    if (!npc.planets || npc.planets.length === 0) {
      // NPC被徹底消滅
      handleNPCElimination(npc, player, allNpcs, locale)
      eliminatedNpcIds.push(npc.id)
    }
  })

  return eliminatedNpcIds
}

/**
 * 通知玩家盟友正在協防
 * @param npc 派遣協防艦隊的NPC
 * @param player 玩家
 * @param targetPlanet 被協防的星球
 * @param mission 協防任務
 */
export const notifyPlayerOfAllyDefense = (
  npc: NPC,
  player: Player,
  targetPlanet: Planet,
  mission: FleetMission
): void => {
  // 計算艦隊規模
  const fleetSize = Object.values(mission.fleet).reduce((sum, count) => sum + (count || 0), 0)

  // 建立外交報告
  const report: DiplomaticReport = {
    id: `ally_defense_${Date.now()}_${npc.id}`,
    npcId: npc.id,
    npcName: npc.name,
    eventType: 'ally_defend' as DiplomaticEventType,
    timestamp: Date.now(),
    details: {
      targetPlanetName: targetPlanet.name,
      targetPosition: targetPlanet.position,
      fleetSize,
      arrivalTime: mission.arrivalTime,
      stationDuration: mission.returnTime ? mission.returnTime - mission.arrivalTime : 0
    },
    read: false
  }

  // 新增到玩家的外交報告列表
  if (!player.diplomaticReports) {
    player.diplomaticReports = []
  }
  player.diplomaticReports.unshift(report)

  // 限制報告數量
  if (player.diplomaticReports.length > 100) {
    player.diplomaticReports = player.diplomaticReports.slice(0, 100)
  }
}
