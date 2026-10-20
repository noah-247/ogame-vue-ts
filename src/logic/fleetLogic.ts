import type { FleetMission, Planet, Resources, Fleet, BattleResult, SpyReport, Player, Officer, DebrisField, NPC } from '@/types/game'
import type { Locale } from '@/locales'
import { ShipType, DefenseType, MissionType, BuildingType, OfficerType, TechnologyType, ExpeditionZone } from '@/types/game'
import { FLEET_STORAGE_CONFIG, EXPEDITION_ZONES } from '@/config/gameConfig'
import { useGameStore } from '@/stores/gameStore'
import { generateId } from '@/utils/id'
import * as battleLogic from './battleLogic'
import * as moonLogic from './moonLogic'
import * as moonValidation from './moonValidation'
import * as diplomaticLogic from './diplomaticLogic'
import * as resourceLogic from './resourceLogic'
import * as fleetStorageLogic from './fleetStorageLogic'
import * as officerLogic from './officerLogic'
import * as planetLogic from './planetLogic'
import { getGameNow } from './gameTime'

/**
 * 計算兩個星球之間的距離
 * 使用類似 OGame 的距離計算公式
 */
export const calculateDistance = (
  from: { galaxy: number; system: number; position: number },
  to: { galaxy: number; system: number; position: number }
): number => {
  // 同一位置
  if (from.galaxy === to.galaxy && from.system === to.system && from.position === to.position) {
    return 5
  }

  // 同星系內不同位置
  if (from.galaxy === to.galaxy && from.system === to.system) {
    return 1000 + Math.abs(to.position - from.position) * 5
  }

  // 同系統內不同星系
  if (from.galaxy === to.galaxy) {
    return 2700 + Math.abs(to.system - from.system) * 95
  }

  // 不同系統
  return 20000 + Math.abs(to.galaxy - from.galaxy) * 20000
}

/**
 * 計算飛行時間
 * 平衡後的時間倍率，確保遊戲節奏合理
 */
export const calculateFlightTime = (distance: number, minSpeed: number): number => {
  return Math.max(10, Math.floor((distance * 50) / minSpeed)) // 至少10秒
}

/**
 * 建立艦隊任務
 */
export const createFleetMission = (
  playerId: string,
  originPlanetId: string,
  targetPosition: { galaxy: number; system: number; position: number },
  missionType: MissionType,
  fleet: Partial<Fleet>,
  cargo: Resources,
  flightTime: number
): FleetMission => {
  const now = getGameNow()
  return {
    id: generateId('mission'),
    playerId,
    originPlanetId,
    // 深複製targetPosition，避免多個任務共享同一個引用
    targetPosition: { ...targetPosition },
    missionType,
    fleet,
    cargo,
    departureTime: now,
    arrivalTime: now + flightTime * 1000,
    returnTime: now + flightTime * 2 * 1000,
    status: 'outbound'
  }
}

/**
 * 運輸任務失敗原因
 */
export type TransportFailReason = 'targetNotFound' | 'giftRejected'

/**
 * 運輸任務結果
 */
export interface TransportResult {
  success: boolean
  reputationGain?: number
  overflow?: Resources
  failReason?: TransportFailReason
}

/**
 * 處理運輸任務到達
 */
export const processTransportArrival = (
  mission: FleetMission,
  targetPlanet: Planet | undefined,
  player?: Player,
  allNpcs?: NPC[],
  locale: Locale = 'zh-CN',
  storageCapacityBonus: number = 0
): TransportResult => {
  // 檢查是否是贈送任務
  if (mission.isGift && mission.giftTargetNpcId && player && allNpcs) {
    const targetNpc = allNpcs.find(n => n.id === mission.giftTargetNpcId)
    if (targetNpc) {
      const giftResult = diplomaticLogic.handleGiftArrival(mission, player, targetNpc, locale)
      mission.status = 'returning'

      // 如果禮物被拒絕，資源返還給玩家
      if (!giftResult.accepted) {
        // 資源保留在cargo中，返回時會退還給玩家
        return { success: false, reputationGain: undefined, failReason: 'giftRejected' }
      }

      // 禮物被接受，清空貨物
      mission.cargo = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }
      return { success: true, reputationGain: giftResult.reputationGain }
    }
  }

  // 正常運輸任務
  if (targetPlanet) {
    // 使用安全新增函式，防止資源溢位
    const result = resourceLogic.addResourcesSafely(targetPlanet, mission.cargo, storageCapacityBonus)
    mission.status = 'returning'

    // 如果有溢位的資源，保留在cargo中返回給傳送者
    if (result.overflow.metal > 0 || result.overflow.crystal > 0 || result.overflow.deuterium > 0 || result.overflow.darkMatter > 0) {
      mission.cargo = result.overflow
      return { success: true, overflow: result.overflow }
    }
    // 運輸成功，清空貨物
    mission.cargo = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }
    return { success: true }
  }
  // 目標星球不存在
  mission.status = 'returning'
  return { success: false, failReason: 'targetNotFound' }
}

/**
 * 處理攻擊任務到達
 */
export const processAttackArrival = async (
  mission: FleetMission,
  targetPlanet: Planet | undefined,
  attacker: Player,
  defender: Player | null,
  allPlanets: Planet[]
): Promise<{ battleResult: BattleResult; moon: Planet | null; debrisField: DebrisField | null } | null> => {
  if (!targetPlanet || targetPlanet.ownerId === attacker.id) {
    mission.status = 'returning'
    return null
  }

  // 執行戰鬥（使用 Worker 進行非同步計算）
  const gameStore = useGameStore()
  const battleResult = await battleLogic.simulateBattle(
    mission.fleet,
    targetPlanet.fleet,
    targetPlanet.defense,
    targetPlanet.resources,
    attacker.officers,
    defender?.officers || ({} as Record<OfficerType, Officer>),
    attacker.technologies,
    defender?.technologies || ({} as Record<TechnologyType, number>),
    gameStore.battleToFinish
  )

  // 更新戰鬥報告ID
  battleResult.id = generateId('battle')
  battleResult.attackerId = attacker.id
  battleResult.defenderId = targetPlanet.ownerId || 'unknown'
  battleResult.attackerPlanetId = mission.originPlanetId
  battleResult.defenderPlanetId = targetPlanet.id

  // 如果攻擊方獲勝，掠奪資源已經在戰鬥模擬中計算
  mission.cargo = battleResult.plunder

  // 更新艦隊 - 計算倖存艦船
  const survivingFleet: Partial<Fleet> = {}
  Object.entries(mission.fleet).forEach(([shipType, initialCount]) => {
    const lost = battleResult.attackerLosses[shipType as ShipType] || 0
    const surviving = initialCount - lost
    if (surviving > 0) {
      survivingFleet[shipType as ShipType] = surviving
    }
  })
  mission.fleet = survivingFleet

  // 更新目標星球艦隊和防禦
  Object.entries(battleResult.defenderLosses.fleet).forEach(([shipType, lost]) => {
    targetPlanet.fleet[shipType as ShipType] = Math.max(0, targetPlanet.fleet[shipType as ShipType] - lost)
  })

  Object.entries(battleResult.defenderLosses.defense).forEach(([defenseType, lost]) => {
    targetPlanet.defense[defenseType as DefenseType] = Math.max(0, targetPlanet.defense[defenseType as DefenseType] - lost)
  })

  // 防禦設施修復（70%機率）
  const defenseBeforeBattle: Partial<Record<DefenseType, number>> = { ...targetPlanet.defense }
  Object.entries(battleResult.defenderLosses.defense).forEach(([defenseType, lost]) => {
    defenseBeforeBattle[defenseType as DefenseType] = (defenseBeforeBattle[defenseType as DefenseType] || 0) + lost
  })
  targetPlanet.defense = battleLogic.repairDefense(defenseBeforeBattle, targetPlanet.defense) as Record<DefenseType, number>

  // 扣除掠奪的資源（防止下溢到負數）
  targetPlanet.resources.metal = Math.max(0, targetPlanet.resources.metal - battleResult.plunder.metal)
  targetPlanet.resources.crystal = Math.max(0, targetPlanet.resources.crystal - battleResult.plunder.crystal)
  targetPlanet.resources.deuterium = Math.max(0, targetPlanet.resources.deuterium - battleResult.plunder.deuterium)

  mission.status = 'returning'

  // 嘗試生成月球（如果該位置還沒有月球）
  let moon: Planet | null = null
  const moonCheck = moonValidation.canCreateMoon(allPlanets, targetPlanet.position, battleResult.debrisField)
  if (moonCheck.canCreate && moonCheck.chance) {
    if (moonValidation.shouldGenerateMoon(moonCheck.chance)) {
      moon = moonLogic.tryGenerateMoon(battleResult.debrisField, targetPlanet.position, targetPlanet.id, targetPlanet.ownerId || 'unknown')
    }
  }

  // 建立殘骸場（如果有殘骸）
  let debrisField: DebrisField | null = null
  const totalDebris = battleResult.debrisField.metal + battleResult.debrisField.crystal
  if (totalDebris > 0) {
    debrisField = {
      id: `debris_${targetPlanet.position.galaxy}_${targetPlanet.position.system}_${targetPlanet.position.position}`,
      position: targetPlanet.position,
      resources: {
        metal: battleResult.debrisField.metal,
        crystal: battleResult.debrisField.crystal
      },
      createdAt: Date.now()
    }
  }

  return { battleResult, moon, debrisField }
}

/**
 * 處理NPC攻擊玩家星球
 * 專門用於NPC作為攻擊方的情況
 */
export const processNPCAttackArrival = async (
  npc: NPC,
  mission: FleetMission,
  targetPlanet: Planet,
  defender: Player,
  allPlanets: Planet[]
): Promise<{ battleResult: BattleResult; moon: Planet | null; debrisField: DebrisField | null } | null> => {
  // 執行戰鬥（使用 Worker 進行非同步計算）
  const gameStore = useGameStore()
  const battleResult = await battleLogic.simulateBattle(
    mission.fleet, // NPC艦隊
    targetPlanet.fleet, // 玩家艦隊
    targetPlanet.defense, // 玩家防禦
    targetPlanet.resources, // 玩家資源
    {} as Record<OfficerType, Officer>, // NPC沒有軍官系統
    defender.officers || ({} as Record<OfficerType, Officer>), // 玩家軍官
    npc.technologies, // NPC科技等級
    defender.technologies, // 玩家科技等級
    gameStore.battleToFinish
  )

  // 更新戰鬥報告ID和參與者資訊
  battleResult.id = generateId('battle')
  battleResult.attackerId = npc.id
  battleResult.defenderId = defender.id
  battleResult.attackerPlanetId = mission.originPlanetId
  battleResult.defenderPlanetId = targetPlanet.id
  battleResult.timestamp = Date.now()

  // 如果NPC獲勝，掠奪的資源給NPC的起始星球
  if (battleResult.winner === 'attacker' && battleResult.plunder) {
    const npcOriginPlanet = npc.planets.find(p => p.id === mission.originPlanetId)
    if (npcOriginPlanet) {
      // NPC獲得掠奪的資源（當艦隊返回時）
      mission.cargo = battleResult.plunder
    }
  }

  // 更新NPC艦隊 - 計算倖存艦船
  const survivingFleet: Partial<Fleet> = {}
  Object.entries(mission.fleet).forEach(([shipType, initialCount]) => {
    const lost = battleResult.attackerLosses[shipType as ShipType] || 0
    const surviving = initialCount - lost
    if (surviving > 0) {
      survivingFleet[shipType as ShipType] = surviving
    }
  })
  mission.fleet = survivingFleet

  // 更新玩家星球艦隊和防禦
  Object.entries(battleResult.defenderLosses.fleet).forEach(([shipType, lost]) => {
    targetPlanet.fleet[shipType as ShipType] = Math.max(0, (targetPlanet.fleet[shipType as ShipType] || 0) - lost)
  })

  Object.entries(battleResult.defenderLosses.defense).forEach(([defenseType, lost]) => {
    targetPlanet.defense[defenseType as DefenseType] = Math.max(0, (targetPlanet.defense[defenseType as DefenseType] || 0) - lost)
  })

  // 防禦設施修復（70%機率）
  const defenseBeforeBattle: Partial<Record<DefenseType, number>> = { ...targetPlanet.defense }
  Object.entries(battleResult.defenderLosses.defense).forEach(([defenseType, lost]) => {
    defenseBeforeBattle[defenseType as DefenseType] = (defenseBeforeBattle[defenseType as DefenseType] || 0) + lost
  })
  targetPlanet.defense = battleLogic.repairDefense(defenseBeforeBattle, targetPlanet.defense) as Record<DefenseType, number>

  // 扣除玩家星球被掠奪的資源
  if (battleResult.plunder) {
    targetPlanet.resources.metal = Math.max(0, targetPlanet.resources.metal - battleResult.plunder.metal)
    targetPlanet.resources.crystal = Math.max(0, targetPlanet.resources.crystal - battleResult.plunder.crystal)
    targetPlanet.resources.deuterium = Math.max(0, targetPlanet.resources.deuterium - battleResult.plunder.deuterium)
  }

  mission.status = 'returning'

  // 嘗試生成月球（如果該位置還沒有月球）
  let moon: Planet | null = null
  const moonCheck = moonValidation.canCreateMoon(allPlanets, targetPlanet.position, battleResult.debrisField)
  if (moonCheck.canCreate && moonCheck.chance) {
    if (moonValidation.shouldGenerateMoon(moonCheck.chance)) {
      moon = moonLogic.tryGenerateMoon(battleResult.debrisField, targetPlanet.position, targetPlanet.id, targetPlanet.ownerId || 'unknown')
    }
  }

  // 建立殘骸場（如果有殘骸）
  let debrisField: DebrisField | null = null
  const totalDebris = battleResult.debrisField.metal + battleResult.debrisField.crystal
  if (totalDebris > 0) {
    debrisField = {
      id: `debris_${targetPlanet.position.galaxy}_${targetPlanet.position.system}_${targetPlanet.position.position}`,
      position: targetPlanet.position,
      resources: {
        metal: battleResult.debrisField.metal,
        crystal: battleResult.debrisField.crystal
      },
      createdAt: Date.now()
    }
  }

  // NPC攻擊玩家後降低好感度
  if (!npc.relations) {
    npc.relations = {}
  }
  if (!npc.relations[defender.id]) {
    npc.relations[defender.id] = diplomaticLogic.initializeDiplomaticRelation(npc.id, defender.id)
  }

  // 根據戰鬥結果降低好感度
  // NPC獲勝降低更多好感度，失敗降低較少
  const reputationChange = battleResult.winner === 'attacker' ? -15 : -10
  const relation = npc.relations[defender.id]
  if (relation) {
    diplomaticLogic.updateReputation(relation, reputationChange, 'attack', `NPC ${npc.name} attacked player ${defender.name}`)
  }

  return { battleResult, moon, debrisField }
}

/**
 * 計算玩家最大星球數量
 * 基於天體物理學技術等級
 */
export const calculateMaxPlanets = (astrophysicsLevel: number): number => {
  // 基礎1個星球（主星） + 每級天體物理學增加1個殖民地槽位
  return 1 + astrophysicsLevel
}

/**
 * 檢查玩家是否可以殖民新星球
 */
export const canColonize = (player: Player): boolean => {
  const astrophysicsLevel = player.technologies[TechnologyType.Astrophysics] || 0
  const maxPlanets = calculateMaxPlanets(astrophysicsLevel)
  const currentPlanets = player.planets.length
  return currentPlanets < maxPlanets
}

/**
 * 殖民任務結果
 */
export interface ColonizeResult {
  success: boolean
  planet: Planet | null
  failReason?: 'positionOccupied' | 'maxColoniesReached'
}

/**
 * 處理殖民任務到達
 */
export const processColonizeArrival = (
  mission: FleetMission,
  targetPlanet: Planet | undefined,
  player: Player,
  colonyNameTemplate: string = 'Colony'
): ColonizeResult => {
  if (targetPlanet) {
    // 位置已被佔用
    mission.status = 'returning'
    return { success: false, planet: null, failReason: 'positionOccupied' }
  }

  // 檢查殖民地槽位限制
  if (!canColonize(player)) {
    // 超出殖民地數量限制，殖民船返回
    mission.status = 'returning'
    return { success: false, planet: null, failReason: 'maxColoniesReached' }
  }

  // 建立新殖民地
  const newPlanet: Planet = {
    id: generateId('planet'),
    name: `${colonyNameTemplate} ${mission.targetPosition.galaxy}:${mission.targetPosition.system}:${mission.targetPosition.position}`,
    ownerId: player.id,
    position: mission.targetPosition,
    resources: { metal: 500, crystal: 500, deuterium: 0, darkMatter: 0, energy: 0 },
    buildings: {} as Record<BuildingType, number>,
    fleet: {
      [ShipType.LightFighter]: 0,
      [ShipType.HeavyFighter]: 0,
      [ShipType.Cruiser]: 0,
      [ShipType.Battleship]: 0,
      [ShipType.Battlecruiser]: 0,
      [ShipType.Bomber]: 0,
      [ShipType.Destroyer]: 0,
      [ShipType.SmallCargo]: 0,
      [ShipType.LargeCargo]: 0,
      [ShipType.ColonyShip]: 0,
      [ShipType.Recycler]: 0,
      [ShipType.EspionageProbe]: 0,
      [ShipType.SolarSatellite]: 0,
      [ShipType.DarkMatterHarvester]: 0,
      [ShipType.Deathstar]: 0
    },
    defense: {
      [DefenseType.RocketLauncher]: 0,
      [DefenseType.LightLaser]: 0,
      [DefenseType.HeavyLaser]: 0,
      [DefenseType.GaussCannon]: 0,
      [DefenseType.IonCannon]: 0,
      [DefenseType.PlasmaTurret]: 0,
      [DefenseType.SmallShieldDome]: 0,
      [DefenseType.LargeShieldDome]: 0,
      [DefenseType.AntiBallisticMissile]: 0,
      [DefenseType.InterplanetaryMissile]: 0,
      [DefenseType.PlanetaryShield]: 0
    },
    buildQueue: [],
    waitingBuildQueue: [], // 等待佇列
    lastUpdate: getGameNow(),
    maxSpace: 200,
    maxFleetStorage: FLEET_STORAGE_CONFIG.baseStorage,
    isMoon: false
  }

  Object.values(BuildingType).forEach(building => {
    newPlanet.buildings[building] = 0
  })

  // 初始化溫度
  newPlanet.temperature = planetLogic.generatePlanetTemperature(mission.targetPosition.position)

  // 殖民船被消耗
  mission.fleet[ShipType.ColonyShip] = (mission.fleet[ShipType.ColonyShip] || 1) - 1
  mission.status = 'returning'

  return { success: true, planet: newPlanet }
}

/**
 * 計算間諜偵查資訊可見度
 * 根據雙方間諜技術等級差異決定顯示哪些資訊
 */
export const calculateSpyVisibility = (
  attackerSpyLevel: number,
  defenderSpyLevel: number,
  spyProbeCount: number
): {
  showFleet: boolean
  showDefense: boolean
  showBuildings: boolean
  showTechnologies: boolean
} => {
  // 技術等級差異 (考慮間諜探測器數量加成)
  const levelDiff = attackerSpyLevel - defenderSpyLevel + Math.floor(spyProbeCount / 5)

  return {
    showFleet: levelDiff >= -1, // Level 2: Resources + fleet
    showDefense: levelDiff >= 1, // Level 4: Resources + fleet + defense
    showBuildings: levelDiff >= 3, // Level 6: Resources + fleet + defense + buildings
    showTechnologies: levelDiff >= 5 // Level 8: Resources + fleet + defense + buildings + technologies
  }
}

/**
 * 計算間諜偵查被發現機率
 */
export const calculateSpyDetectionChance = (attackerSpyLevel: number, defenderSpyLevel: number, spyProbeCount: number): number => {
  // 基礎被發現機率
  let baseChance = 0.25

  // 技術等級差異影響
  const levelDiff = defenderSpyLevel - attackerSpyLevel
  if (levelDiff > 0) {
    baseChance += levelDiff * 0.1 // 防守方技術高，增加被發現機率
  } else {
    baseChance += levelDiff * 0.05 // 攻擊方技術高，減少被發現機率
  }

  // 間諜探測器數量影響
  baseChance -= spyProbeCount * 0.01 // 每個探測器降低1%被發現機率

  // 限制在 1% - 99% 之間
  return Math.max(0.01, Math.min(0.99, baseChance))
}

/**
 * 偵查任務失敗原因
 */
export type SpyFailReason = 'targetNotFound'

/**
 * 偵查任務結果
 */
export interface SpyResult {
  success: boolean
  report?: SpyReport
  failReason?: SpyFailReason
}

/**
 * 處理間諜任務到達
 */
export const processSpyArrival = (
  mission: FleetMission,
  targetPlanet: Planet | undefined,
  attacker: Player,
  defender: Player | null,
  allNpcs?: NPC[],
  locale: Locale = 'zh-CN'
): SpyResult => {
  if (!targetPlanet) {
    mission.status = 'returning'
    return { success: false, failReason: 'targetNotFound' }
  }

  // 獲取間諜技術等級
  const attackerSpyLevel = attacker.technologies[TechnologyType.EspionageTechnology] || 0
  const defenderSpyLevel = defender?.technologies[TechnologyType.EspionageTechnology] || 0
  const spyProbeCount = mission.fleet[ShipType.EspionageProbe] || 0

  // 計算資訊可見度
  const visibility = calculateSpyVisibility(attackerSpyLevel, defenderSpyLevel, spyProbeCount)

  // 計算被發現機率
  const detectionChance = calculateSpyDetectionChance(attackerSpyLevel, defenderSpyLevel, spyProbeCount)

  // 判斷是否被發現
  const wasDetected = Math.random() < detectionChance

  const spyReport: SpyReport = {
    id: generateId('spy'),
    timestamp: Date.now(),
    spyId: attacker.id,
    targetPlanetId: targetPlanet.id,
    targetPlanetName: targetPlanet.name,
    targetPosition: { ...targetPlanet.position },
    targetPlayerId: targetPlanet.ownerId || 'unknown',
    resources: { ...targetPlanet.resources }, // 資源資訊始終可見
    fleet: visibility.showFleet ? { ...targetPlanet.fleet } : undefined,
    defense: visibility.showDefense ? { ...targetPlanet.defense } : undefined,
    buildings: visibility.showBuildings ? { ...targetPlanet.buildings } : undefined,
    technologies: visibility.showTechnologies && defender ? { ...defender.technologies } : undefined,
    detectionChance
  }

  // 如果目標是NPC星球，呼叫外交邏輯
  if (allNpcs && targetPlanet.ownerId) {
    const targetNpc = allNpcs.find(npc => npc.planets.some(p => p.id === targetPlanet.id))
    if (targetNpc) {
      diplomaticLogic.handleSpyReputation(attacker, targetNpc, wasDetected, locale)
    }
  }

  mission.status = 'returning'
  return { success: true, report: spyReport }
}

/**
 * 部署任務失敗原因
 */
export type DeployFailReason = 'targetNotFound' | 'notOwnPlanet'

/**
 * 部署任務結果
 */
export interface DeployResult {
  success: boolean
  overflow?: Partial<Record<ShipType, number>>
  failReason?: DeployFailReason
}

/**
 * 處理部署任務到達
 */
export const processDeployArrival = (
  mission: FleetMission,
  targetPlanet: Planet | undefined,
  playerId: string,
  technologies: Record<TechnologyType, number>
): DeployResult => {
  if (!targetPlanet) {
    mission.status = 'returning'
    return { success: false, failReason: 'targetNotFound' }
  }
  if (targetPlanet.ownerId !== playerId) {
    mission.status = 'returning'
    return { success: false, failReason: 'notOwnPlanet' }
  }

  // 使用安全新增函式，防止艦隊倉儲溢位
  const result = fleetStorageLogic.addFleetSafely(targetPlanet, mission.fleet, technologies)
  // 如果有溢位的艦船，保留在mission.fleet中返回給傳送者
  const hasOverflow = Object.keys(result.overflow).length > 0
  if (hasOverflow) {
    mission.fleet = result.overflow as Fleet
    mission.status = 'returning'
    return { success: true, overflow: result.overflow }
  }
  // 部署任務直接完成，不返回
  return { success: true }
}

/**
 * 回收任務失敗原因
 */
export type RecycleFailReason = 'noDebrisField' | 'debrisEmpty'

/**
 * 回收任務結果
 */
export interface RecycleResult {
  success: boolean
  collectedResources?: Pick<Resources, 'metal' | 'crystal'>
  remainingDebris?: Pick<Resources, 'metal' | 'crystal'> | null
  failReason?: RecycleFailReason
}

/**
 * 處理回收任務到達
 */
export const processRecycleArrival = (
  mission: FleetMission,
  debrisField: DebrisField | undefined,
  player?: Player,
  allNpcs?: NPC[],
  locale: Locale = 'zh-CN'
): RecycleResult => {
  if (!debrisField) {
    mission.status = 'returning'
    return { success: false, failReason: 'noDebrisField' }
  }

  // 計算回收船的貨艙容量
  const recyclerCount = mission.fleet[ShipType.Recycler] || 0
  const recyclerCapacity = 20000 // 每艘回收船容量20000
  const totalCapacity = recyclerCount * recyclerCapacity

  // 計算已裝載的貨物
  const currentCargo = mission.cargo.metal + mission.cargo.crystal + mission.cargo.deuterium

  // 剩餘容量
  const availableCapacity = totalCapacity - currentCargo

  // 計算可以收集的資源
  const totalDebris = debrisField.resources.metal + debrisField.resources.crystal
  const collectedAmount = Math.min(totalDebris, availableCapacity)

  // 防止除零：如果殘骸為0，直接返回
  if (totalDebris === 0) {
    mission.status = 'returning'
    return { success: false, failReason: 'debrisEmpty' }
  }

  // 按比例收集金屬和晶體
  const metalRatio = debrisField.resources.metal / totalDebris
  const crystalRatio = debrisField.resources.crystal / totalDebris

  const collectedMetal = Math.floor(collectedAmount * metalRatio)
  const collectedCrystal = Math.floor(collectedAmount * crystalRatio)

  // 更新任務貨物
  mission.cargo.metal += collectedMetal
  mission.cargo.crystal += collectedCrystal

  // 更新殘骸場
  const remainingMetal = debrisField.resources.metal - collectedMetal
  const remainingCrystal = debrisField.resources.crystal - collectedCrystal

  mission.status = 'returning'

  // 檢查是否在NPC星球位置回收殘骸，如果是則降低好感度
  if (player && allNpcs && collectedAmount > 0) {
    diplomaticLogic.handleDebrisRecycleReputation(player, debrisField.position, allNpcs, locale)
  }

  return {
    success: true,
    collectedResources: {
      metal: collectedMetal,
      crystal: collectedCrystal
    },
    remainingDebris:
      remainingMetal > 0 || remainingCrystal > 0
        ? {
            metal: remainingMetal,
            crystal: remainingCrystal
          }
        : null
  }
}

/**
 * 探險事件型別
 */
export type ExpeditionEventType = 'resources' | 'darkMatter' | 'fleet' | 'nothing' | 'pirates' | 'aliens'

/**
 * 探險結果
 */
export interface ExpeditionResult {
  eventType: ExpeditionEventType
  resources?: Partial<Resources>
  fleet?: Partial<Fleet>
  fleetLost?: Partial<Fleet>
  message: string
}

/**
 * 處理探險任務到達
 * 探險任務會隨機觸發各種事件，基於探險區域配置
 */
export const processExpeditionArrival = (mission: FleetMission): ExpeditionResult => {
  // 獲取探險區域配置，預設為近空區域
  const zone = mission.expeditionZone || ExpeditionZone.NearSpace
  const zoneConfig = EXPEDITION_ZONES[zone]

  // 計算艦隊總貨艙容量
  let totalCargoCapacity = 0
  for (const [shipType, count] of Object.entries(mission.fleet)) {
    if (count > 0) {
      const shipConfig = getShipCargoCapacity(shipType as ShipType)
      totalCargoCapacity += shipConfig * count
    }
  }

  // 根據區域配置的機率計算隨機事件
  const random = Math.random() * 100
  const probs = zoneConfig.probabilities
  let result: ExpeditionResult

  // 累積機率閾值
  const resourceThreshold = probs.resources
  const darkMatterThreshold = resourceThreshold + probs.darkMatter
  const fleetThreshold = darkMatterThreshold + probs.fleet
  const piratesThreshold = fleetThreshold + probs.pirates
  const aliensThreshold = piratesThreshold + probs.aliens

  if (random < resourceThreshold) {
    // 發現資源 - 大幅提升獎勵
    const baseMultiplier = 0.3 + Math.random() * 0.5 // 30%-80% 的貨艙容量
    const resourceMultiplier = baseMultiplier * zoneConfig.resourceMultiplier
    const resourceAmount = Math.floor(totalCargoCapacity * resourceMultiplier)
    const metalAmount = Math.floor(resourceAmount * 0.5)
    const crystalAmount = Math.floor(resourceAmount * 0.35)
    const deuteriumAmount = Math.floor(resourceAmount * 0.15)

    mission.cargo.metal += metalAmount
    mission.cargo.crystal += crystalAmount
    mission.cargo.deuterium += deuteriumAmount

    result = {
      eventType: 'resources',
      resources: { metal: metalAmount, crystal: crystalAmount, deuterium: deuteriumAmount, darkMatter: 0, energy: 0 },
      message: 'expedition.foundResources'
    }
  } else if (random < darkMatterThreshold) {
    // 發現暗物質 - 大幅提升獎勵
    const baseDarkMatter = 200 + Math.random() * 500 // 200-700 暗物質
    const darkMatterAmount = Math.floor(baseDarkMatter * zoneConfig.darkMatterMultiplier)
    mission.cargo.darkMatter += darkMatterAmount

    result = {
      eventType: 'darkMatter',
      resources: { metal: 0, crystal: 0, deuterium: 0, darkMatter: darkMatterAmount, energy: 0 },
      message: 'expedition.foundDarkMatter'
    }
  } else if (random < fleetThreshold) {
    // 發現廢棄艦船
    const foundFleet: Partial<Fleet> = {}
    // 高階區域可以發現更多種類的艦船
    const possibleShips: ShipType[] =
      zone === ExpeditionZone.DangerousNebula
        ? [ShipType.LightFighter, ShipType.HeavyFighter, ShipType.SmallCargo, ShipType.LargeCargo, ShipType.Cruiser, ShipType.Battleship]
        : zone === ExpeditionZone.UnchartedSpace
        ? [ShipType.LightFighter, ShipType.HeavyFighter, ShipType.SmallCargo, ShipType.LargeCargo, ShipType.Cruiser]
        : [ShipType.LightFighter, ShipType.HeavyFighter, ShipType.SmallCargo, ShipType.LargeCargo]

    const shipTypeIndex = Math.floor(Math.random() * possibleShips.length)
    const shipType = possibleShips[shipTypeIndex] ?? ShipType.LightFighter
    const baseCount = 3 + Math.random() * 12 // 3-15 艘
    const count = Math.floor(baseCount * zoneConfig.fleetFindMultiplier)
    foundFleet[shipType] = count

    // 將發現的艦船新增到任務艦隊中
    mission.fleet[shipType] = (mission.fleet[shipType] || 0) + count

    result = {
      eventType: 'fleet',
      fleet: foundFleet,
      message: 'expedition.foundFleet'
    }
  } else if (random < piratesThreshold) {
    // 遭遇海盜（損失部分艦隊）
    const fleetLost: Partial<Fleet> = {}
    let hasLoss = false
    const lossChance = Math.min(0.3 * zoneConfig.dangerMultiplier, 0.9) // 危險區域損失機率更高，上限90%

    for (const [shipType, count] of Object.entries(mission.fleet)) {
      if (count > 0 && Math.random() < lossChance) {
        const baseLossRate = Math.min(0.1 * zoneConfig.dangerMultiplier, 0.5) // 危險區域損失比例更高，上限50%
        const lossCount = Math.max(1, Math.floor(count * baseLossRate))
        const actualLoss = Math.min(lossCount, count)
        fleetLost[shipType as ShipType] = actualLoss
        mission.fleet[shipType as ShipType] = count - actualLoss
        hasLoss = true
      }
    }

    result = {
      eventType: 'pirates',
      fleetLost: hasLoss ? fleetLost : undefined,
      message: hasLoss ? 'expedition.piratesAttack' : 'expedition.piratesEscaped'
    }
  } else if (random < aliensThreshold) {
    // 遭遇外星人（損失更多艦隊）
    const fleetLost: Partial<Fleet> = {}
    let hasLoss = false
    const lossChance = Math.min(0.5 * zoneConfig.dangerMultiplier, 0.95) // 危險區域損失機率更高，上限95%

    for (const [shipType, count] of Object.entries(mission.fleet)) {
      if (count > 0 && Math.random() < lossChance) {
        const baseLossRate = Math.min(0.2 * zoneConfig.dangerMultiplier, 0.6) // 危險區域損失比例更高，上限60%
        const lossCount = Math.max(1, Math.floor(count * baseLossRate))
        const actualLoss = Math.min(lossCount, count)
        fleetLost[shipType as ShipType] = actualLoss
        mission.fleet[shipType as ShipType] = count - actualLoss
        hasLoss = true
      }
    }

    result = {
      eventType: 'aliens',
      fleetLost: hasLoss ? fleetLost : undefined,
      message: hasLoss ? 'expedition.aliensAttack' : 'expedition.aliensEscaped'
    }
  } else {
    // 什麼都沒發現
    result = {
      eventType: 'nothing',
      message: 'expedition.nothing'
    }
  }

  mission.status = 'returning'
  return result
}

/**
 * 獲取艦船貨艙容量
 */
const getShipCargoCapacity = (shipType: ShipType): number => {
  const cargoCapacities: Record<ShipType, number> = {
    [ShipType.LightFighter]: 50,
    [ShipType.HeavyFighter]: 100,
    [ShipType.Cruiser]: 800,
    [ShipType.Battleship]: 1500,
    [ShipType.Battlecruiser]: 750,
    [ShipType.Bomber]: 500,
    [ShipType.Destroyer]: 2000,
    [ShipType.SmallCargo]: 5000,
    [ShipType.LargeCargo]: 25000,
    [ShipType.ColonyShip]: 7500,
    [ShipType.Recycler]: 20000,
    [ShipType.EspionageProbe]: 5,
    [ShipType.SolarSatellite]: 0,
    [ShipType.DarkMatterHarvester]: 1000,
    [ShipType.Deathstar]: 1000000
  }
  return cargoCapacities[shipType] || 0
}

/**
 * 計算行星毀滅機率
 */
export const calculateDestructionChance = (deathstarCount: number, planetaryShieldCount: number, planetDefensePower: number): number => {
  // 基礎摧毀機率：每艘死星 10%
  let baseChance = deathstarCount * 10

  // 行星護盾減少機率：每個護盾 -5%
  const shieldReduction = planetaryShieldCount * 5

  // 防禦力量減少機率：每 10000 防禦力量 -1%
  const defensePowerReduction = Math.floor(planetDefensePower / 10000)

  // 最終機率
  let finalChance = baseChance - shieldReduction - defensePowerReduction

  // 限制在 1% - 99% 之間
  return Math.max(1, Math.min(99, finalChance))
}

/**
 * 計算星球總防禦力量
 */
export const calculatePlanetDefensePower = (fleet: Partial<Fleet>, defense: Partial<Record<DefenseType, number>>): number => {
  let totalPower = 0

  // 計算艦隊力量
  Object.entries(fleet).forEach(([_shipType, count]) => {
    if (count > 0) {
      // 簡單估算：每艘船的攻擊力 + 護盾 + 裝甲 / 10
      totalPower += count * 100 // 簡化計算
    }
  })

  // 計算防禦設施力量
  Object.entries(defense).forEach(([_defenseType, count]) => {
    if (count > 0) {
      totalPower += count * 50 // 簡化計算
    }
  })

  return totalPower
}

/**
 * 處理行星/月球毀滅任務到達
 * OGame規則：
 * - 月球銷燬機率 = (100 - √diameter) × √deathstars
 * - 死星反向銷燬機率 = √diameter / 2
 * - 兩個機率獨立判定
 */

/**
 * 毀滅任務失敗原因
 */
export type DestroyFailReason = 'targetNotFound' | 'ownPlanet' | 'noDeathstar' | 'chanceFailed'

/**
 * 銷燬任務結果
 */
export interface DestroyResult {
  success: boolean // 目標是否被銷燬
  destructionChance: number // 銷燬機率
  planetId?: string // 被銷燬的星球/月球ID
  deathstarsLost: boolean // 死星是否被反向銷燬
  deathstarDestructionChance: number // 死星反向銷燬機率
  isMoon: boolean // 目標是否為月球
  failReason?: DestroyFailReason // 失敗原因
  battleResult?: BattleResult // 戰鬥結果（如果發生了戰鬥）
  debrisField?: DebrisField // 戰鬥產生的殘骸場
  moon?: Planet // 戰鬥產生的月球
}

export const processDestroyArrival = async (
  mission: FleetMission,
  targetPlanet: Planet | undefined,
  attacker: Player,
  defender: Player | null,
  allPlanets: Planet[]
): Promise<DestroyResult> => {
  if (!targetPlanet) {
    mission.status = 'returning'
    return {
      success: false,
      destructionChance: 0,
      deathstarsLost: false,
      deathstarDestructionChance: 0,
      isMoon: false,
      failReason: 'targetNotFound'
    }
  }
  if (targetPlanet.ownerId === attacker.id) {
    mission.status = 'returning'
    return {
      success: false,
      destructionChance: 0,
      deathstarsLost: false,
      deathstarDestructionChance: 0,
      isMoon: targetPlanet.isMoon || false,
      failReason: 'ownPlanet'
    }
  }

  // 檢查是否有死星
  const initialDeathstarCount = mission.fleet[ShipType.Deathstar] || 0
  if (initialDeathstarCount === 0) {
    mission.status = 'returning'
    return {
      success: false,
      destructionChance: 0,
      deathstarsLost: false,
      deathstarDestructionChance: 0,
      isMoon: targetPlanet.isMoon || false,
      failReason: 'noDeathstar'
    }
  }

  // 檢查目標是否有防禦力量（艦隊或防禦設施）
  const hasDefenderFleet = Object.values(targetPlanet.fleet || {}).some(count => count > 0)
  const hasDefense = Object.values(targetPlanet.defense || {}).some(count => count > 0)
  const needsBattle = hasDefenderFleet || hasDefense

  let battleResult: BattleResult | undefined
  let debrisField: DebrisField | undefined
  let newMoon: Planet | undefined
  let survivingDeathstars = initialDeathstarCount

  // 如果目標有防禦力量，先進行戰鬥
  if (needsBattle) {
    const gameStore = useGameStore()

    // 執行戰鬥
    battleResult = await battleLogic.simulateBattle(
      mission.fleet,
      targetPlanet.fleet,
      targetPlanet.defense,
      targetPlanet.resources,
      attacker.officers,
      defender?.officers || ({} as Record<OfficerType, Officer>),
      attacker.technologies,
      defender?.technologies || ({} as Record<TechnologyType, number>),
      gameStore.battleToFinish
    )

    // 更新戰鬥報告
    battleResult.id = generateId('battle')
    battleResult.attackerId = attacker.id
    battleResult.defenderId = targetPlanet.ownerId || 'unknown'
    battleResult.attackerPlanetId = mission.originPlanetId
    battleResult.defenderPlanetId = targetPlanet.id

    // 更新艦隊 - 計算倖存艦船
    const survivingFleet: Partial<Fleet> = {}
    Object.entries(mission.fleet).forEach(([shipType, initialCount]) => {
      const lost = battleResult!.attackerLosses[shipType as ShipType] || 0
      const surviving = initialCount - lost
      if (surviving > 0) {
        survivingFleet[shipType as ShipType] = surviving
      }
    })
    mission.fleet = survivingFleet

    // 計算存活的死星數量
    survivingDeathstars = survivingFleet[ShipType.Deathstar] || 0

    // 更新目標星球艦隊和防禦
    Object.entries(battleResult.defenderLosses.fleet).forEach(([shipType, lost]) => {
      const current = targetPlanet.fleet[shipType as ShipType] || 0
      targetPlanet.fleet[shipType as ShipType] = Math.max(0, current - lost)
    })
    Object.entries(battleResult.defenderLosses.defense).forEach(([defenseType, lost]) => {
      const current = targetPlanet.defense[defenseType as DefenseType] || 0
      targetPlanet.defense[defenseType as DefenseType] = Math.max(0, current - lost)
    })

    // 計算殘骸場
    const debrisResources = battleResult.debrisField
    if (debrisResources.metal > 0 || debrisResources.crystal > 0) {
      debrisField = {
        id: `debris_${targetPlanet.position.galaxy}_${targetPlanet.position.system}_${targetPlanet.position.position}`,
        position: { ...targetPlanet.position },
        resources: {
          metal: debrisResources.metal,
          crystal: debrisResources.crystal
        },
        createdAt: Date.now()
      }
    }

    // 檢查是否生成月球（只有非月球位置才能生成月球）
    if (!targetPlanet.isMoon && debrisField) {
      const moonExists = moonLogic.hasMoonAtPosition(allPlanets, targetPlanet.position)
      if (!moonExists) {
        newMoon =
          moonLogic.tryGenerateMoon(
            { ...debrisResources, deuterium: 0, darkMatter: 0, energy: 0 },
            targetPlanet.position,
            targetPlanet.id,
            targetPlanet.ownerId || attacker.id
          ) || undefined
      }
    }

    // 如果攻擊方失敗或沒有存活的死星，直接返回
    if (battleResult.winner === 'defender' || survivingDeathstars === 0) {
      mission.status = 'returning'
      return {
        success: false,
        destructionChance: 0,
        deathstarsLost: initialDeathstarCount > 0 && survivingDeathstars === 0,
        deathstarDestructionChance: 0,
        isMoon: targetPlanet.isMoon || false,
        failReason: survivingDeathstars === 0 ? 'noDeathstar' : 'chanceFailed',
        battleResult,
        debrisField,
        moon: newMoon
      }
    }
  }

  // 根據目標型別使用不同的銷燬邏輯
  if (targetPlanet.isMoon) {
    // 月球銷燬使用 OGame 公式
    const result = moonLogic.tryDestroyMoon(targetPlanet, survivingDeathstars)

    // 如果死星被反向銷燬，從任務艦隊中移除
    if (result.deathstarsDestroyed) {
      mission.fleet[ShipType.Deathstar] = 0
    }

    mission.status = 'returning'

    return {
      success: result.moonDestroyed,
      destructionChance: result.moonDestructionChance,
      planetId: result.moonDestroyed ? targetPlanet.id : undefined,
      deathstarsLost: result.deathstarsDestroyed,
      deathstarDestructionChance: result.deathstarDestructionChance,
      isMoon: true,
      failReason: result.moonDestroyed ? undefined : 'chanceFailed',
      battleResult,
      debrisField,
      moon: newMoon
    }
  } else {
    // 行星銷燬使用原有邏輯（基於存活的死星數量）
    const planetaryShieldCount = targetPlanet.defense[DefenseType.PlanetaryShield] || 0
    const defensePower = calculatePlanetDefensePower(targetPlanet.fleet, targetPlanet.defense)
    const destructionChance = calculateDestructionChance(survivingDeathstars, planetaryShieldCount, defensePower)

    const randomValue = Math.random() * 100
    const success = randomValue < destructionChance

    mission.status = 'returning'

    return {
      success,
      destructionChance,
      planetId: success ? targetPlanet.id : undefined,
      deathstarsLost: false,
      deathstarDestructionChance: 0,
      isMoon: false,
      failReason: success ? undefined : 'chanceFailed',
      battleResult,
      debrisField,
      moon: newMoon
    }
  }
}

/**
 * 處理艦隊任務返回
 */
export const processFleetReturn = (
  mission: FleetMission,
  originPlanet: Planet,
  technologies: Record<TechnologyType, number>,
  storageCapacityBonus: number
): void => {
  // 艦船返回 - 使用安全新增函式
  fleetStorageLogic.addFleetSafely(originPlanet, mission.fleet, technologies)
  // 如果艦隊倉儲溢位，超出部分會丟失（這是合理的懲罰）

  // 資源返回（掠奪物或運輸貨物）- 使用安全新增函式
  resourceLogic.addResourcesSafely(originPlanet, mission.cargo, storageCapacityBonus)
  // 如果資源倉儲溢位，超出部分會丟失（這是合理的懲罰）
}

/**
 * 更新艦隊任務狀態
 */
export const updateFleetMissions = async (
  missions: FleetMission[],
  planets: Map<string, Planet>,
  debrisFields: Map<string, DebrisField>,
  attacker: Player,
  defender: Player | null,
  now: number,
  allNpcs?: NPC[],
  locale?: Locale
): Promise<{
  completedMissions: string[]
  battleReports: BattleResult[]
  spyReports: SpyReport[]
  newColonies: Planet[]
  newMoons: Planet[]
  newDebrisFields: DebrisField[]
  updatedDebrisFields: DebrisField[]
  removedDebrisFieldIds: string[]
  destroyedPlanetIds: string[]
}> => {
  const completedMissions: string[] = []
  const battleReports: BattleResult[] = []
  const spyReports: SpyReport[] = []
  const newColonies: Planet[] = []
  const newMoons: Planet[] = []
  const newDebrisFields: DebrisField[] = []
  const updatedDebrisFields: DebrisField[] = []
  const removedDebrisFieldIds: string[] = []
  const destroyedPlanetIds: string[] = []

  // 獲取所有星球列表（用於月球生成檢查）
  const allPlanets = Array.from(planets.values())
  // 計算軍官加成（用於資源容量計算）
  const bonuses = officerLogic.calculateActiveBonuses(attacker.officers, now)
  const storageCapacityBonus = bonuses.storageCapacityBonus

  // 使用 for...of 以支援 await
  for (const mission of missions) {
    const originPlanet = attacker.planets.find(p => p.id === mission.originPlanetId)

    if (mission.status === 'outbound' && now >= mission.arrivalTime) {
      // 任務到達目標
      const targetKey = `${mission.targetPosition.galaxy}:${mission.targetPosition.system}:${mission.targetPosition.position}`
      const targetPlanet = planets.get(targetKey)

      switch (mission.missionType) {
        case MissionType.Transport:
          processTransportArrival(mission, targetPlanet, attacker, allNpcs, locale, storageCapacityBonus)
          break

        case MissionType.Attack: {
          const attackResult = await processAttackArrival(mission, targetPlanet, attacker, defender, allPlanets)
          if (attackResult) {
            battleReports.push(attackResult.battleResult)
            if (attackResult.moon) {
              newMoons.push(attackResult.moon)
              // 將月球新增到planets map中
              const moonKey = `${attackResult.moon.position.galaxy}:${attackResult.moon.position.system}:${attackResult.moon.position.position}`
              planets.set(moonKey, attackResult.moon)
            }
            if (attackResult.debrisField) {
              // 檢查該位置是否已存在殘骸場
              const existingDebris = debrisFields.get(attackResult.debrisField.id)
              if (existingDebris) {
                // 累加殘骸資源
                const updatedDebris: DebrisField = {
                  ...existingDebris,
                  resources: {
                    metal: existingDebris.resources.metal + attackResult.debrisField.resources.metal,
                    crystal: existingDebris.resources.crystal + attackResult.debrisField.resources.crystal
                  }
                }
                debrisFields.set(attackResult.debrisField.id, updatedDebris)
                updatedDebrisFields.push(updatedDebris)
              } else {
                // 新建殘骸場
                debrisFields.set(attackResult.debrisField.id, attackResult.debrisField)
                newDebrisFields.push(attackResult.debrisField)
              }
            }
          }
          break
        }

        case MissionType.Colonize:
          const colonizeResult = processColonizeArrival(mission, targetPlanet, attacker)
          if (colonizeResult.success && colonizeResult.planet) {
            newColonies.push(colonizeResult.planet)
            planets.set(targetKey, colonizeResult.planet)
          }
          break

        case MissionType.Spy:
          const spyResult = processSpyArrival(mission, targetPlanet, attacker, defender)
          if (spyResult.success && spyResult.report) {
            spyReports.push(spyResult.report)
          }
          break

        case MissionType.Deploy:
          const deployed = processDeployArrival(mission, targetPlanet, attacker.id, attacker.technologies)
          if (deployed.success && !deployed.overflow) {
            completedMissions.push(mission.id)
          }
          break

        case MissionType.Recycle:
          const debrisId = `debris_${mission.targetPosition.galaxy}_${mission.targetPosition.system}_${mission.targetPosition.position}`
          const debrisField = debrisFields.get(debrisId)
          const recycleResult = processRecycleArrival(mission, debrisField, attacker, allNpcs)
          if (recycleResult.success && recycleResult.collectedResources) {
            if (recycleResult.remainingDebris) {
              // 更新殘骸場
              const updatedDebris: DebrisField = {
                ...debrisField!,
                resources: recycleResult.remainingDebris
              }
              debrisFields.set(debrisId, updatedDebris)
              updatedDebrisFields.push(updatedDebris)
            } else {
              // 殘骸場已被完全收集，刪除
              debrisFields.delete(debrisId)
              removedDebrisFieldIds.push(debrisId)
            }
          }
          break

        case MissionType.Destroy: {
          const destroyResult = await processDestroyArrival(mission, targetPlanet, attacker, defender, allPlanets)

          // 處理戰鬥報告
          if (destroyResult.battleResult) {
            battleReports.push(destroyResult.battleResult)
          }

          // 處理新生成的月球
          if (destroyResult.moon) {
            newMoons.push(destroyResult.moon)
            const moonKey = `${destroyResult.moon.position.galaxy}:${destroyResult.moon.position.system}:${destroyResult.moon.position.position}`
            planets.set(moonKey, destroyResult.moon)
          }

          // 處理殘骸場
          if (destroyResult.debrisField) {
            const existingDebris = debrisFields.get(destroyResult.debrisField.id)
            if (existingDebris) {
              const updatedDebris: DebrisField = {
                ...existingDebris,
                resources: {
                  metal: existingDebris.resources.metal + destroyResult.debrisField.resources.metal,
                  crystal: existingDebris.resources.crystal + destroyResult.debrisField.resources.crystal
                }
              }
              debrisFields.set(destroyResult.debrisField.id, updatedDebris)
              updatedDebrisFields.push(updatedDebris)
            } else {
              debrisFields.set(destroyResult.debrisField.id, destroyResult.debrisField)
              newDebrisFields.push(destroyResult.debrisField)
            }
          }

          if (destroyResult.success && destroyResult.planetId) {
            // 星球被摧毀
            destroyedPlanetIds.push(destroyResult.planetId)

            // 處理外交關係（如果目標是NPC星球）
            if (targetPlanet && targetPlanet.ownerId && allNpcs && locale) {
              const planetOwner = allNpcs.find(npc => npc.id === targetPlanet.ownerId)
              if (planetOwner) {
                diplomaticLogic.handlePlanetDestructionReputation(attacker, targetPlanet, planetOwner, allNpcs, locale)
              }
            }

            planets.delete(targetKey)
          }
          break
        }
      }
    }

    if (mission.status === 'returning' && mission.returnTime && now >= mission.returnTime) {
      // 艦隊返回
      if (originPlanet) {
        processFleetReturn(mission, originPlanet, attacker.technologies, storageCapacityBonus)
      }
      completedMissions.push(mission.id)
    }
  }

  return {
    completedMissions,
    battleReports,
    spyReports,
    newColonies,
    newMoons,
    newDebrisFields,
    updatedDebrisFields,
    removedDebrisFieldIds,
    destroyedPlanetIds
  }
}

/**
 * 召回艦隊
 */
export const recallFleetMission = (mission: FleetMission, now: number): boolean => {
  if (mission.status !== 'outbound') return false

  const elapsedTime = now - mission.departureTime

  // 如果還在飛行途中，立即返回
  if (now < mission.arrivalTime) {
    mission.status = 'returning'
    mission.returnTime = now + elapsedTime // 返回時間等於已飛行的時間
    return true
  }

  return false
}
