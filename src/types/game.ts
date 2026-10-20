// 位置型別
export interface Position {
  galaxy: number
  system: number
  position: number
}

// 資源型別
export interface Resources {
  metal: number
  crystal: number
  deuterium: number
  darkMatter: number // 暗物質
  energy: number // 電量（實時計算，不儲存）
}

// 星球礦脈儲量
export interface OreDeposits {
  metal: number // 金屬礦脈剩餘儲量
  crystal: number // 晶體礦脈剩餘儲量
  deuterium: number // 重氫儲量
  // 儲存星球位置，用於動態計算初始儲量上限
  // 這樣修改配置後，所有星球的上限都會自動更新
  position: { galaxy: number; system: number; position: number }
}

// 建築型別
export const BuildingType = {
  MetalMine: 'metalMine',
  CrystalMine: 'crystalMine',
  DeuteriumSynthesizer: 'deuteriumSynthesizer',
  SolarPlant: 'solarPlant',
  FusionReactor: 'fusionReactor', // 核聚變反應堆
  RoboticsFactory: 'roboticsFactory',
  NaniteFactory: 'naniteFactory', // 奈米工廠
  Shipyard: 'shipyard',
  Hangar: 'hangar', // 機庫
  ResearchLab: 'researchLab',
  MetalStorage: 'metalStorage',
  CrystalStorage: 'crystalStorage',
  DeuteriumTank: 'deuteriumTank',
  DarkMatterCollector: 'darkMatterCollector', // 暗物質收集器
  DarkMatterTank: 'darkMatterTank', // 暗物質儲罐
  MissileSilo: 'missileSilo', // 導彈發射井
  Terraformer: 'terraformer', // 地形改造器
  // 月球專屬建築
  LunarBase: 'lunarBase', // 月球基地
  SensorPhalanx: 'sensorPhalanx', // 感測器陣列
  JumpGate: 'jumpGate', // 跳躍門
  // 特殊建築
  PlanetDestroyerFactory: 'planetDestroyerFactory', // 行星毀滅者工廠
  GeoResearchStation: 'geoResearchStation', // 地質研究站（影響礦脈恢復速度）
  DeepDrillingFacility: 'deepDrillingFacility', // 深層鑽探設施（提升礦脈上限）
  // 2moons新增建築
  University: 'university' // 大學（加速研究）
} as const

export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType]

// 建築配置
export interface BuildingConfig {
  id: BuildingType
  name: string
  description: string
  baseCost: Resources
  baseTime: number // 基礎建造時間(秒)
  costMultiplier: number // 升級成本倍數
  spaceUsage: number // 佔用空間
  fleetStorageBonus?: number // 每級增加的艦隊倉儲（可選）
  planetOnly?: boolean // 僅行星可建造
  moonOnly?: boolean // 僅月球可建造
  maxLevel?: number // 最大等級（可選，不設定則無上限）
  requirements?: Partial<Record<BuildingType | TechnologyType, number>> // 前置條件（初始解鎖）
  levelRequirements?: Record<number, Partial<Record<BuildingType | TechnologyType, number>>> // 等級升級條件
}

// 建築例項
export interface Building {
  type: BuildingType
  level: number
}

// 研究科技型別
export const TechnologyType = {
  EnergyTechnology: 'energyTechnology',
  LaserTechnology: 'laserTechnology',
  IonTechnology: 'ionTechnology',
  HyperspaceTechnology: 'hyperspaceTechnology',
  PlasmaTechnology: 'plasmaTechnology',
  ComputerTechnology: 'computerTechnology', // 計算機技術
  EspionageTechnology: 'espionageTechnology', // 間諜技術
  CombustionDrive: 'combustionDrive',
  ImpulseDrive: 'impulseDrive',
  HyperspaceDrive: 'hyperspaceDrive',
  WeaponsTechnology: 'weaponsTechnology', // 武器技術
  ShieldingTechnology: 'shieldingTechnology', // 護盾技術
  ArmourTechnology: 'armourTechnology', // 裝甲技術
  Astrophysics: 'astrophysics', // 天體物理學
  GravitonTechnology: 'gravitonTechnology', // 引力技術
  DarkMatterTechnology: 'darkMatterTechnology', // 暗物質技術
  TerraformingTechnology: 'terraformingTechnology', // 地形改造技術
  PlanetDestructionTech: 'planetDestructionTech', // 行星毀滅技術
  MiningTechnology: 'miningTechnology', // 採礦技術（提升礦脈上限）
  // 2moons新增科技
  IntergalacticResearchNetwork: 'intergalacticResearchNetwork', // 星際研究網路（連線多個研究實驗室）
  MineralResearch: 'mineralResearch', // 礦物研究（提升金屬產量）
  CrystalResearch: 'crystalResearch', // 晶體研究（提升晶體產量）
  FuelResearch: 'fuelResearch' // 燃料研究（提升重氫產量）
} as const

export type TechnologyType = (typeof TechnologyType)[keyof typeof TechnologyType]

// 科技配置
export interface TechnologyConfig {
  id: TechnologyType
  name: string
  description: string
  baseCost: Resources
  baseTime: number
  costMultiplier: number
  fleetStorageBonus?: number // 每級增加的艦隊倉儲（全域性，可選）
  maxLevel?: number // 最大等級（可選，不設定則無上限）
  requirements?: Partial<Record<BuildingType | TechnologyType, number>> // 前置條件（初始解鎖）
  levelRequirements?: Record<number, Partial<Record<BuildingType | TechnologyType, number>>> // 等級升級條件
}

// 科技例項
export interface Technology {
  type: TechnologyType
  level: number
}

// 防禦設施型別
export const DefenseType = {
  RocketLauncher: 'rocketLauncher',
  LightLaser: 'lightLaser',
  HeavyLaser: 'heavyLaser',
  GaussCannon: 'gaussCannon',
  IonCannon: 'ionCannon',
  PlasmaTurret: 'plasmaTurret',
  SmallShieldDome: 'smallShieldDome',
  LargeShieldDome: 'largeShieldDome',
  AntiBallisticMissile: 'antiBallisticMissile', // 反彈道導彈
  InterplanetaryMissile: 'interplanetaryMissile', // 星際導彈
  PlanetaryShield: 'planetaryShield' // 行星護盾
} as const

export type DefenseType = (typeof DefenseType)[keyof typeof DefenseType]

// 防禦設施配置
export interface DefenseConfig {
  id: DefenseType
  name: string
  description: string
  cost: Resources
  buildTime: number
  attack: number
  shield: number
  armor: number
  requirements?: Partial<Record<BuildingType | TechnologyType, number>>
}

// 艦船型別
export const ShipType = {
  LightFighter: 'lightFighter',
  HeavyFighter: 'heavyFighter',
  Cruiser: 'cruiser',
  Battleship: 'battleship',
  Battlecruiser: 'battlecruiser', // 戰列巡洋艦
  Bomber: 'bomber', // 轟炸機
  Destroyer: 'destroyer', // 驅逐艦
  SmallCargo: 'smallCargo',
  LargeCargo: 'largeCargo',
  ColonyShip: 'colonyShip',
  Recycler: 'recycler',
  EspionageProbe: 'espionageProbe',
  SolarSatellite: 'solarSatellite', // 太陽能衛星
  DarkMatterHarvester: 'darkMatterHarvester', // 暗物質採集船
  Deathstar: 'deathstar' // 死星
} as const

export type ShipType = (typeof ShipType)[keyof typeof ShipType]

// 艦船配置
export interface ShipConfig {
  id: ShipType
  name: string
  description: string
  cost: Resources
  buildTime: number
  cargoCapacity: number
  attack: number
  shield: number
  armor: number
  speed: number
  fuelConsumption: number
  storageUsage: number // 佔用艦隊倉儲
  requirements?: Partial<Record<BuildingType | TechnologyType, number>>
  // 快速射擊：對特定目標有額外攻擊次數
  // 例如 { lightFighter: 6 } 表示對輕型戰鬥機有6倍快速射擊
  rapidFire?: Partial<Record<ShipType | DefenseType, number>>
}

// 艦船例項
export interface Fleet {
  [ShipType.LightFighter]: number
  [ShipType.HeavyFighter]: number
  [ShipType.Cruiser]: number
  [ShipType.Battleship]: number
  [ShipType.Battlecruiser]: number
  [ShipType.Bomber]: number
  [ShipType.Destroyer]: number
  [ShipType.SmallCargo]: number
  [ShipType.LargeCargo]: number
  [ShipType.ColonyShip]: number
  [ShipType.Recycler]: number
  [ShipType.EspionageProbe]: number
  [ShipType.SolarSatellite]: number
  [ShipType.DarkMatterHarvester]: number
  [ShipType.Deathstar]: number
}

// 艦隊任務型別
export const MissionType = {
  Attack: 'attack',
  Transport: 'transport',
  Colonize: 'colonize',
  Spy: 'spy',
  Deploy: 'deploy',
  Expedition: 'expedition',
  HarvestDarkMatter: 'harvestDarkMatter', // 暗物質採集
  Recycle: 'recycle', // 回收殘骸
  Destroy: 'destroy', // 行星毀滅
  MissileAttack: 'missileAttack', // 導彈攻擊
  Station: 'station' // 駐守協防
} as const

export type MissionType = (typeof MissionType)[keyof typeof MissionType]

// 探險區域型別
export const ExpeditionZone = {
  NearSpace: 'nearSpace', // 近空區域 - 低風險低收益
  DeepSpace: 'deepSpace', // 深空區域 - 中等風險收益
  UnchartedSpace: 'unchartedSpace', // 未知空間 - 高風險高收益
  DangerousNebula: 'dangerousNebula' // 危險星雲 - 極高風險極高收益
} as const

export type ExpeditionZone = (typeof ExpeditionZone)[keyof typeof ExpeditionZone]

// 探險區域配置
export interface ExpeditionZoneConfig {
  id: ExpeditionZone
  requiredTechLevel: number // 所需天體物理學等級
  flightTimeMultiplier: number // 飛行時間倍率
  resourceMultiplier: number // 資源獎勵倍率
  darkMatterMultiplier: number // 暗物質獎勵倍率
  fleetFindMultiplier: number // 艦船發現倍率
  dangerMultiplier: number // 危險程度倍率
  probabilities: {
    resources: number // 發現資源機率
    darkMatter: number // 發現暗物質機率
    fleet: number // 發現艦船機率
    pirates: number // 遭遇海盜機率
    aliens: number // 遭遇外星人機率
    nothing: number // 什麼都沒發現機率
  }
}

// 外交關係狀態
export const RelationStatus = {
  Hostile: 'hostile', // 敵對
  Neutral: 'neutral', // 中立
  Friendly: 'friendly' // 友好
} as const

export type RelationStatus = (typeof RelationStatus)[keyof typeof RelationStatus]

// 外交事件型別
export const DiplomaticEventType = {
  GiftResources: 'giftResources', // 贈送資源
  Attack: 'attack', // 攻擊
  Spy: 'spy', // 偵查
  StealDebris: 'stealDebris', // 搶奪殘骸
  AllyAttacked: 'allyAttacked', // 盟友被攻擊
  DestroyPlanet: 'destroyPlanet', // 摧毀星球
  CampaignChoice: 'campaignChoice' // 戰役對話選擇
} as const

export type DiplomaticEventType = (typeof DiplomaticEventType)[keyof typeof DiplomaticEventType]

// 外交關係
export interface DiplomaticRelation {
  fromId: string // 關係發起方（玩家或NPC ID）
  toId: string // 關係接收方（玩家或NPC ID）
  reputation: number // 好感度值 (-100 到 +100)
  status: RelationStatus // 關係狀態
  lastUpdated: number // 最後更新時間戳
  history?: Array<{
    // 關係變化歷史
    timestamp: number
    change: number
    reason: DiplomaticEventType
    details?: string
  }>
}

// 外交報告（顯示好感度變化通知）
export interface DiplomaticReport {
  id: string
  timestamp: number
  npcId: string // NPC ID
  npcName: string // NPC名稱
  eventType: DiplomaticEventType // 事件型別
  reputationChange?: number // 好感度變化值（可選，ally_defend 事件沒有）
  newReputation?: number // 新的好感度值（可選）
  oldStatus?: RelationStatus // 舊的關係狀態（可選）
  newStatus?: RelationStatus // 新的關係狀態（可選）
  message?: string // 訊息內容（已棄用，保留用於相容性）
  messageKey?: string // 翻譯鍵（如 'diplomacy.reports.youDestroyedNpcPlanet'）
  messageParams?: Record<string, string | number> // 翻譯引數（如 { npcName: 'NPC-1', planetName: '星球 1:1:8', reputation: -80 }）
  read?: boolean // 已讀狀態
  details?: {
    // 協防任務詳情
    targetPlanetName?: string
    targetPosition?: Position
    fleetSize?: number
    arrivalTime?: number
    stationDuration?: number
  }
}

// 艦隊預設
export interface FleetPreset {
  id: string
  name: string // 自定義預設名稱
  fleet: Partial<Fleet> // 預設艦隊數量
  targetPosition?: { galaxy: number; system: number; position: number } // 預設目標座標
  missionType?: MissionType // 預設任務型別
  cargo?: Partial<Resources> // 預設運輸資源
}

// 艦隊任務
export interface FleetMission {
  id: string
  playerId: string // 玩家ID，如果是NPC任務則為NPC ID
  npcId?: string // NPC ID（如果是NPC發起的任務）
  isHostile?: boolean // 是否是敵對任務（用於警告顯示）
  originPlanetId: string
  targetPosition: { galaxy: number; system: number; position: number }
  targetIsMoon?: boolean // 目標是否為月球（用於區分同坐標的行星和月球）
  targetPlanetId?: string
  debrisFieldId?: string // 殘骸場ID（用於回收任務）
  missionType: MissionType
  fleet: Partial<Fleet>
  cargo: Resources
  departureTime: number
  arrivalTime: number
  returnTime?: number
  status: 'outbound' | 'returning' | 'arrived'
  // 外交系統欄位
  isGift?: boolean // 是否為贈送資源任務
  giftTargetNpcId?: string // 贈送目標NPC ID
  // 探險系統欄位
  expeditionZone?: ExpeditionZone // 探險區域型別
}

// 導彈攻擊任務（不使用艦隊系統）
export interface MissileAttack {
  id: string
  playerId: string
  originPlanetId: string
  targetPosition: { galaxy: number; system: number; position: number }
  targetPlanetId?: string
  missileCount: number // 發射的星際導彈數量
  launchTime: number
  arrivalTime: number
  status: 'flying' | 'arrived' | 'intercepted'
}

// 戰鬥結果
export interface BattleResult {
  id: string
  timestamp: number
  attackerId: string
  defenderId: string
  attackerPlanetId: string
  defenderPlanetId: string
  attackerFleet: Partial<Fleet>
  defenderFleet: Partial<Fleet>
  defenderDefense: Partial<Record<DefenseType, number>>
  attackerLosses: Partial<Fleet>
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  winner: 'attacker' | 'defender' | 'draw'
  read?: boolean // 已讀狀態
  plunder: Resources
  debrisField: Resources
  // 新增詳細資訊
  rounds?: number
  attackerRemaining?: Partial<Fleet>
  defenderRemaining?: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  roundDetails?: Array<{
    round: number
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
    attackerRemainingPower: number
    defenderRemainingPower: number
  }>
  moonChance?: number // 月球生成機率
}

// 間諜報告
export interface SpyReport {
  id: string
  timestamp: number
  spyId: string
  targetPlanetId: string
  targetPlanetName: string // 目標星球名稱
  targetPosition: Position // 目標星球座標
  targetPlayerId: string
  resources: Resources
  fleet?: Partial<Fleet>
  defense?: Partial<Record<DefenseType, number>>
  buildings?: Partial<Record<BuildingType, number>>
  technologies?: Partial<Record<TechnologyType, number>>
  detectionChance: number
  read?: boolean // 已讀狀態
}

// 被偵查通知（玩家被NPC偵查時收到）
export interface SpiedNotification {
  id: string
  timestamp: number
  npcId: string // 偵查者NPC ID
  npcName: string // 偵查者NPC名稱
  targetPlanetId: string // 被偵查的星球ID
  targetPlanetName: string // 被偵查的星球名稱
  detectionSuccess: boolean // 是否被發現
  read?: boolean
}

// NPC活動通知（回收殘骸等）
export interface NPCActivityNotification {
  id: string
  timestamp: number
  npcId: string // NPC ID
  npcName: string // NPC名稱
  activityType: 'recycle' // 活動型別
  targetPosition: Position // 目標位置
  targetPlanetId?: string // 目標星球ID（如果在玩家星球位置）
  targetPlanetName?: string // 目標星球名稱
  arrivalTime: number // 到達時間
  read?: boolean
}

// 即將到來的敵對艦隊警告
export interface IncomingFleetAlert {
  id: string // 對應的FleetMission ID
  npcId: string // NPC ID
  npcName: string // NPC名稱
  missionType: MissionType // 任務型別（spy/attack）
  targetPlanetId: string // 目標星球ID
  targetPlanetName: string // 目標星球名稱
  arrivalTime: number // 到達時間
  fleetSize: number // 艦隊總數（用於顯示規模）
  read?: boolean
}

// 任務報告（運輸、殖民、回收、部署、毀滅等任務的結果通知）
export interface MissionReport {
  id: string
  timestamp: number
  missionType: MissionType
  originPlanetId: string
  originPlanetName: string
  targetPosition: { galaxy: number; system: number; position: number }
  targetPlanetId?: string
  targetPlanetName?: string
  success: boolean // 任務是否成功
  message: string // 任務結果描述
  // 任務特定的詳細資訊
  details?: {
    // 通用：失敗原因
    failReason?: string
    // 運輸任務：運輸的資源
    transportedResources?: Resources
    // 殖民任務：新星球資訊
    newPlanetId?: string
    newPlanetName?: string
    // 回收任務：回收的資源
    recycledResources?: Pick<Resources, 'metal' | 'crystal'>
    remainingDebris?: Pick<Resources, 'metal' | 'crystal'>
    // 毀滅任務：摧毀的星球
    destroyedPlanetName?: string
    // 毀滅任務：機率和死星損失
    destructionChance?: number
    deathstarsLost?: boolean
    // 毀滅任務：是否發生了戰鬥
    hadBattle?: boolean
    // 部署任務：部署的艦隊
    deployedFleet?: Partial<Fleet>
    // 導彈攻擊任務：導彈資訊
    missileCount?: number
    missileHits?: number
    missileIntercepted?: number
    defenseLosses?: Partial<Record<DefenseType, number>>
    // 探險任務：發現的資源
    foundResources?: Partial<Resources>
    // 探險任務：發現的艦船
    foundFleet?: Partial<Fleet>
    // 探險任務：損失的艦船
    fleetLost?: Partial<Fleet>
    // 探險任務：探險區域
    expeditionZone?: ExpeditionZone
    // 偵查任務：報告ID
    spyReportId?: string
  }
  read?: boolean
}

// 禮物通知（NPC贈送禮物，等待玩家接受或拒絕）
export interface GiftNotification {
  id: string
  timestamp: number
  fromNpcId: string // 贈送方NPC ID
  fromNpcName: string // 贈送方NPC名稱
  resources: Resources // 贈送的資源
  currentReputation: number // 當前好感度
  expectedReputationGain: number // 預期好感度增加
  expiresAt: number // 過期時間（7天后自動拒絕）
  read?: boolean
}

// 禮物被拒絕通知（玩家贈送禮物被NPC拒絕）
export interface GiftRejectedNotification {
  id: string
  timestamp: number
  npcId: string // NPC ID
  npcName: string // NPC名稱
  rejectedResources: Resources // 被拒絕的資源
  currentReputation: number // 當前好感度
  reason: string // 拒絕原因
  read?: boolean
}

// NPC貿易提議
export interface TradeOffer {
  id: string
  npcId: string
  npcName: string
  timestamp: number
  offeredResources: {
    type: 'metal' | 'crystal' | 'deuterium'
    amount: number
  }
  requestedResources: {
    type: 'metal' | 'crystal' | 'deuterium'
    amount: number
  }
  expiresAt: number
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  read?: boolean
}

// NPC情報型別
export type IntelType = 'enemyFleet' | 'enemyResources' | 'enemyMovement'

// NPC情報報告
export interface IntelReport {
  id: string
  fromNpcId: string
  fromNpcName: string
  timestamp: number
  targetNpcId: string
  targetNpcName: string
  intelType: IntelType
  data: {
    fleet?: Partial<Fleet>
    resources?: Partial<Resources>
    movement?: {
      targetPosition: { galaxy: number; system: number; position: number }
      arrivalTime: number
      missionType: string
    }
  }
  read: boolean
}

// NPC聯合攻擊邀請
export interface JointAttackInvite {
  id: string
  fromNpcId: string
  fromNpcName: string
  timestamp: number
  targetNpcId: string
  targetNpcName: string
  targetPlanetId: string
  targetPosition: { galaxy: number; system: number; position: number }
  npcFleetCommitment: Partial<Fleet>
  expectedLootRatio: number // 玩家預期分成比例 (0-1)
  expiresAt: number
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  read?: boolean
}

// NPC資源援助通知
export interface AidNotification {
  id: string
  timestamp: number
  npcId: string
  npcName: string
  aidResources: Resources
  read?: boolean
}

// NPC報復等級
export interface RevengeLevel {
  attackCount: number
  fleetMultiplier: number
  attackInterval: number
  name: string
}

// NPC協防通知
export interface AllyDefenseNotification {
  id: string
  timestamp: number
  npcId: string
  npcName: string
  targetPlanetId: string
  targetPlanetName: string
  fleetSent: Partial<Fleet>
  read?: boolean
}

// NPC態度變化通知
export interface AttitudeChangeNotification {
  id: string
  timestamp: number
  npcId: string
  npcName: string
  previousStatus: 'hostile' | 'neutral' | 'friendly'
  newStatus: 'hostile' | 'neutral' | 'friendly'
  reason: string // 變化原因
  read?: boolean
}

// 殘骸場
export interface DebrisField {
  id: string
  position: { galaxy: number; system: number; position: number }
  resources: Pick<Resources, 'metal' | 'crystal'> // 殘骸場只包含金屬和晶體
  createdAt: number
  expiresAt?: number // 可選的過期時間
}

// 建造佇列項
export interface BuildQueueItem {
  id: string
  type: 'building' | 'technology' | 'ship' | 'defense' | 'demolish' | 'scrap_ship'
  itemType: BuildingType | TechnologyType | ShipType | DefenseType
  targetLevel?: number // 用於建築和科技
  quantity?: number // 用於艦船和防禦
  startTime: number
  endTime: number
}

// 等待佇列項（尚未開始執行，不需要 startTime/endTime）
export interface WaitingQueueItem {
  id: string
  type: 'building' | 'technology' | 'ship' | 'defense' | 'demolish' | 'scrap_ship'
  itemType: BuildingType | TechnologyType | ShipType | DefenseType
  targetLevel?: number // 用於建築和科技
  quantity?: number // 用於艦船和防禦
  priority: number // 排序優先順序（數字越小優先順序越高）
  addedTime: number // 新增到等待佇列的時間戳
  planetId?: string // 建造佇列需要標識目標星球
  source?: 'autopilot' | 'player' // B11：副官排入的等待項來源標記；預設視為玩家手動
  targetId?: string // 副官目標/前置鏈歸屬（MAJ-1/MAJ-6：刪除目標或接管時精準撤回）
}

// ===== 自動成長副官（Autopilot，方案 A「目標等級清單」）=====

// 副官目標：單座建築的目標等級；規劃層自己持久儲存（B3），不依賴等待項
export interface AutopilotTarget {
  id: string
  buildingType: BuildingType
  targetLevel: number
  priority: number // 數字越小優先順序越高
  /** 是否已達標（由每 tick 的 reconcileTargets 重推；達標後目標保留，見 Minor-9/E） */
  completed?: boolean
}

// 資源預留：規劃層面的軟性預留，不實際扣款；低優先順序自動工作只能用預留之外的資源
export interface AutopilotReserve {
  metal: number
  crystal: number
  deuterium: number
}

export type AutopilotMode = 'auto' | 'execute'

export interface AutopilotAlertSettings {
  oreHours: number
  warehouseHours: number
  powerHours: number
}

/** 單星球副官配置（存於 Planet.autopilot；預設 = 未啟用） */
export interface AutopilotPlanetConfig {
  alerts?: AutopilotAlertSettings
  expeditionReminderMinutes?: number
  firstEnabledAt?: number
  enabled: boolean
  mode: AutopilotMode | 'monitor'
  paused: boolean // 玩家手動暫停：不再新增工作，已開工繼續
  targets: AutopilotTarget[]
  reserve: AutopilotReserve
  /** 單級工時上限（秒）：自主模式只排不超過此工時的下一步；預設 7200 */
  workHourThreshold: number
  /** 滯後恢復閾值（秒）：剩餘步驟工時都低於此值才提示可恢復自主；預設 5400 */
  resumeThreshold: number
  /** 自主→執行降級原因（B8 滯後語義的記錄） */
  downgradeReason?: string
  /** 引擎計算：是否已滿足恢復自主條件，供 UI 提示玩家確認 */
  canResumeAuto?: boolean
  /** 是否允許自動補最低必要前置 */
  allowPrereqAutoBuild: boolean
  /** 空間預留（B5）：排建時至少保留的空閒空間 */
  minFreeSpace: number
  /** 最近一次決策摘要（供 UI 展示與回顧） */
  lastDecision?: string
  /** 上次規劃時間戳（毫秒） */
  lastPlannedAt?: number
}

/** 帝國層級研究目標（B6：研究授權放帝國層級，多殖民地不互搶） */
export interface AutopilotResearchTarget {
  id: string
  technology: TechnologyType
  targetLevel: number
  priority: number
  /** 是否已達標（由每 tick 的 reconcileResearchTargets 重推；達標後目標保留，見 Minor-9/E） */
  completed?: boolean
}

/** 帝國層級研究副官配置（存於 Player.empireResearchAutopilot；預設 = 未啟用） */
export interface EmpireResearchAutopilot {
  enabled: boolean
  mode: AutopilotMode // auto=自主挑下一步；execute=執行已批准清單（降級後）
  paused: boolean
  targets: AutopilotResearchTarget[]
  reserve: AutopilotReserve
  workHourThreshold: number
  resumeThreshold: number
  downgradeReason?: string
  canResumeAuto?: boolean
  lastDecision?: string
  lastPlannedAt?: number
}

// 星球
export interface Planet {
  id: string
  name: string
  ownerId?: string
  position: { galaxy: number; system: number; position: number }
  resources: Resources
  buildings: Record<BuildingType, number>
  fleet: Fleet
  defense: Record<DefenseType, number>
  buildQueue: BuildQueueItem[]
  waitingBuildQueue: WaitingQueueItem[] // 等待佇列（建築、艦船、防禦）
  autopilot?: AutopilotPlanetConfig // 自動成長副官配置（預設 = 未啟用）
  lastUpdate: number
  maxSpace: number // 最大空間
  maxFleetStorage: number // 艦隊倉儲上限
  isMoon: boolean // 是否為月球
  parentPlanetId?: string // 如果是月球,指向母星的ID
  diameter?: number // 月球直徑(km)，用於銷燬機率計算
  jumpGateLastUsed?: number // 跳躍門上次使用時間戳(ms)，用於冷卻計算
  oreDeposits?: OreDeposits // 礦脈儲量（可選，用於向後相容）
  temperature?: { min: number; max: number } // 星球溫度範圍（攝氏度），影響太陽能衛星和重氫產量
}

// 月球特殊配置
export interface MoonConfig {
  minDebrisField: number // 生成月球所需的最小殘骸場
  baseChance: number // 基礎生成機率
  maxChance: number // 最大生成機率
  chancePerDebris: number // 每單位殘骸增加的機率
}

// 軍官型別
export const OfficerType = {
  Commander: 'commander', // 指揮官 - 增加建築佇列
  Admiral: 'admiral', // 上將 - 增加艦隊槽位
  Engineer: 'engineer', // 工程師 - 增加防禦和能量
  Geologist: 'geologist', // 地質學家 - 增加資源產量
  Technocrat: 'technocrat', // 技術專家 - 減少研究時間
  DarkMatterSpecialist: 'darkMatterSpecialist' // 暗物質專家 - 增加暗物質產量
} as const

export type OfficerType = (typeof OfficerType)[keyof typeof OfficerType]

// 軍官配置
export interface OfficerConfig {
  id: OfficerType
  name: string
  description: string
  cost: Resources // 招募成本
  weeklyMaintenance: Resources // 每週維護費用
  benefits: {
    buildingSpeedBonus?: number // 建築速度加成 (百分比)
    researchSpeedBonus?: number // 研究速度加成 (百分比)
    resourceProductionBonus?: number // 資源產量加成 (百分比)
    darkMatterProductionBonus?: number // 暗物質產量加成 (百分比)
    energyProductionBonus?: number // 電量產出加成 (百分比)
    fleetSpeedBonus?: number // 艦隊速度加成 (百分比)
    fuelConsumptionReduction?: number // 燃料消耗減少 (百分比)
    defenseBonus?: number // 防禦加成 (百分比)
    additionalBuildQueue?: number // 額外建築佇列
    additionalFleetSlots?: number // 額外艦隊槽位
    storageCapacityBonus?: number // 倉儲容量加成 (百分比)
  }
}

// 軍官例項
export interface Officer {
  type: OfficerType
  active: boolean
  hiredAt?: number // 招募時間
  expiresAt?: number // 到期時間
  // 動態加成（與 OfficerConfig.benefits 結構相同）
  bonuses?: {
    buildingSpeedBonus?: number
    researchSpeedBonus?: number
    resourceProductionBonus?: number
    darkMatterProductionBonus?: number
    energyProductionBonus?: number
    fleetSpeedBonus?: number
    fuelConsumptionReduction?: number
    defenseBonus?: number
    additionalBuildQueue?: number
    additionalFleetSlots?: number
    storageCapacityBonus?: number
  }
}

// 自動成長副官付費合約（v3：帝國統一合約；存於 Player.autopilotContract；預設 = 未簽約）
// 計費單位：費率為每小時整數單位；accruedMicro* 為每分鐘結算保留的小數餘數（微單位，1 單位 = 1_000_000 微）
export interface AutopilotContract {
  plan: 'free' | 'standard' // free = 免費監控（不計費）；standard = 標準副官（auto/execute 計費）
  status: 'inactive' | 'active' | 'paused_manual' | 'paused_funds' | 'terminated'
  payerPlanetId: string // 扣款星球（預設母星）；三資源一律從該星球扣，不掃其他星球
  servicePlanetIds: string[] // 服務星球（費率按這些星球的標準時產合計）
  autoRenew: boolean // 餘額不足暫停後是否自動恢復（v3 預設 false：補資源不自動重啟）
  accruedMicroMetal: number // 每分鐘結算保留的小數餘數（微單位整數）
  accruedMicroCrystal: number
  accruedMicroDeuterium: number
  dutySecondsAcc: number // 累計值班秒數（顯示用；快轉/離線不計入）
  totalConsumedMetal: number // 累計已扣（整數單位）
  totalConsumedCrystal: number
  totalConsumedDeuterium: number
  /** v2→v3 遷移：舊存檔有用副官，等待使用者在確認門選擇（繼續使用／暫停副官），選擇後清除 */
  needsBillingConfirm?: boolean
  /** v2→v3 遷移：所有舊存檔展示一次新制說明，展示後清除 */
  needsBillingNotice?: boolean
}

// 玩家
export interface Player {
  id: string
  name: string
  planets: Planet[]
  technologies: Record<TechnologyType, number>
  officers: Record<OfficerType, Officer>
  researchQueue: BuildQueueItem[]
  waitingResearchQueue: WaitingQueueItem[] // 研究等待佇列
  empireResearchAutopilot?: EmpireResearchAutopilot // 帝國層級研究副官（B6，預設 = 未啟用）
  fleetMissions: FleetMission[]
  missileAttacks: MissileAttack[] // 導彈攻擊任務
  battleReports: BattleResult[]
  spyReports: SpyReport[]
  spiedNotifications: SpiedNotification[] // 被偵查通知
  npcActivityNotifications: NPCActivityNotification[] // NPC活動通知（回收殘骸等）
  missionReports: MissionReport[] // 任務報告（運輸、殖民、回收等）
  incomingFleetAlerts: IncomingFleetAlert[] // 即將到來的敵對艦隊警告
  giftNotifications: GiftNotification[] // 禮物通知（等待接受/拒絕）
  giftRejectedNotifications: GiftRejectedNotification[] // 禮物被拒絕通知
  // NPC增強行為通知
  tradeOffers?: TradeOffer[] // 中立NPC貿易提議
  intelReports?: IntelReport[] // 友好NPC情報報告
  jointAttackInvites?: JointAttackInvite[] // 友好NPC聯合攻擊邀請
  aidNotifications?: AidNotification[] // 友好NPC資源援助通知
  allyDefenseNotifications?: AllyDefenseNotification[] // 友好NPC協防通知
  attitudeChangeNotifications?: AttitudeChangeNotification[] // NPC態度變化通知
  points: number // 總積分（每1000資源=1分）
  bonusPoints?: number // 獎勵積分（戰役、成就等獎勵的積分，不會被重新計算覆蓋）
  isGMEnabled?: boolean // GM模式開關（預設false，透過秘籍啟用）
  lastVersionCheckTime?: number // 最後一次自動檢查版本的時間戳（被動檢測）
  lastManualUpdateCheck?: number // 最後一次手動檢查更新的時間戳（主動檢測）
  // 外交系統欄位（外交關係儲存在 NPC.relations 中）
  diplomaticReports?: DiplomaticReport[] // 外交變化報告
  // 新手引導欄位
  tutorialProgress?: TutorialProgress // 新手引導進度
  // 隱私協議同意狀態
  privacyAgreed?: boolean // 是否已同意隱私協議
  // 弱引導系統
  dismissedHints?: string[] // 已關閉的提示ID列表
  hintsEnabled?: boolean // 是否啟用弱引導提示（預設true）
  // 顯示設定
  backgroundEnabled?: boolean // 是否啟用背景動畫（預設false）
  // 艦隊預設
  fleetPresets?: FleetPreset[] // 艦隊預設列表（最多3個）
  // 自動成長副官付費合約（預設 = 未簽約，舊存檔沒有該欄位）
  autopilotContract?: AutopilotContract
  // 成就係統
  achievementStats?: AchievementStats // 成就統計資料
  achievements?: Record<string, AchievementProgress> // 成就進度
  // 戰役系統
  campaignProgress?: PlayerCampaignProgress // 戰役進度
  questNotifications?: QuestNotification[] // 任務通知
}

export interface NotificationSettings {
  browser: boolean
  inApp: boolean
  suppressInFocus: boolean // 當頁面聚焦時是否瀏覽器通知
  types: {
    construction: boolean
    research: boolean
    [key: string]: boolean
  }
}

// 遊戲狀態
export interface GameState {
  player: Player
  currentPlanetId: string
  gameTime: number
  isPaused: boolean
  universe: Universe
}

// 宇宙
export interface Universe {
  galaxies: number
  systems: number
  positions: number
  planets: Map<string, Planet> // key: "galaxy:system:position"
  npcs: NPC[]
}

// NPC AI 型別
export const NPCAIType = {
  Aggressive: 'aggressive', // 侵略型 - 積極偵查和攻擊玩家
  Defensive: 'defensive', // 防守型 - 只在被攻擊時反擊，優先發展防禦
  Trader: 'trader', // 商人型 - 主動交易，幾乎不攻擊，高好感度時贈送資源
  Expansionist: 'expansionist', // 擴張型 - 優先發展和殖民，較少攻擊
  Balanced: 'balanced' // 平衡型 - 根據情況動態調整策略
} as const

export type NPCAIType = (typeof NPCAIType)[keyof typeof NPCAIType]

// NPC玩家
export interface NPC {
  id: string
  name: string
  note?: string // 玩家新增的備註
  planets: Planet[]
  technologies: Record<TechnologyType, number>
  difficulty: 'easy' | 'medium' | 'hard' // 保留相容，不再使用
  aiType?: NPCAIType // AI 行為型別
  // 距離難度系統
  difficultyLevel?: number // 基於距離的難度等級（1-無限）
  distanceToHomeworld?: number // 到玩家母星的距離
  // 行為跟蹤欄位
  lastSpyTime?: number // 上次偵查玩家的時間
  lastAttackTime?: number // 上次攻擊玩家的時間
  playerSpyReports?: Record<string, SpyReport> // 對玩家星球的偵查報告（key: planetId）
  fleetMissions?: FleetMission[] // NPC的艦隊任務
  // 被攻擊追蹤
  attackedBy?: Record<
    string,
    {
      count: number // 被攻擊次數
      lastAttackTime: number // 最後被攻擊時間
      planetId?: string // 攻擊者星球ID
    }
  >
  alertUntil?: number // 警戒狀態持續到的時間戳
  revengeTarget?: string // 復仇目標玩家ID
  // 外交系統欄位
  relations?: Record<string, DiplomaticRelation> // NPC對其他實體的關係（key: targetId）
  allies?: string[] // 盟友列表（NPC ID）
  enemies?: string[] // 敵人列表（NPC ID）
}

// 新手引導系統
export interface TutorialStep {
  id: string
  title: string // 標題
  content: string // 內容描述
  target?: string // 目標元素的選擇器或ID
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center' // 提示框位置
  route?: string // 需要跳轉的路由
  action?: 'click' | 'build' | 'research' | 'none' // 需要完成的操作型別
  actionTarget?: string // 操作目標（建築ID、科技ID等）
  completionCheck?: () => boolean // 完成條件檢查函式（執行時注入）
  canSkip?: boolean // 是否可跳過此步驟
  highlightPadding?: number // 高亮區域的padding
}

export interface TutorialState {
  isActive: boolean // 引導是否啟用
  currentStepIndex: number // 當前步驟索引
  completedSteps: string[] // 已完成的步驟ID列表
  skipped: boolean // 是否已跳過整個引導
  lastActiveTime?: number // 最後活躍時間
}

export interface TutorialProgress {
  tutorialCompleted: boolean // 是否完成了整個引導
  completedStepIds: string[] // 已完成的步驟ID
  currentStep: string | null // 當前步驟ID
  skippedAt?: number // 跳過的時間戳
}

// ==================== 成就係統型別 ====================

// 成就類別列舉
export const AchievementCategory = {
  Resource: 'resource',
  Building: 'building',
  Combat: 'combat',
  Mission: 'mission',
  Diplomacy: 'diplomacy'
} as const
export type AchievementCategory = (typeof AchievementCategory)[keyof typeof AchievementCategory]

// 成就等級列舉
export const AchievementTier = {
  Bronze: 'bronze',
  Silver: 'silver',
  Gold: 'gold',
  Platinum: 'platinum',
  Diamond: 'diamond'
} as const
export type AchievementTier = (typeof AchievementTier)[keyof typeof AchievementTier]

// 成就統計資料介面
export interface AchievementStats {
  // 資源統計
  totalMetalProduced: number
  totalCrystalProduced: number
  totalDeuteriumProduced: number
  totalDarkMatterProduced: number
  totalMetalConsumed: number
  totalCrystalConsumed: number
  totalDeuteriumConsumed: number
  totalDarkMatterConsumed: number

  // 建造統計
  buildingsUpgraded: number
  maxBuildingLevel: Record<BuildingType, number>
  researchCompleted: number
  maxTechnologyLevel: Record<TechnologyType, number>
  shipsProduced: Record<ShipType, number>
  totalShipsProduced: number
  defensesBuilt: Record<DefenseType, number>
  totalDefensesBuilt: number

  // 戰鬥統計
  attacksLaunched: number
  attacksWon: number
  attacksLost: number
  fleetLostInAttack: Record<ShipType, number>
  totalFleetLostInAttack: number
  debrisCreatedFromAttacks: number
  defensesSuccessful: number
  defensesFailed: number
  fleetLostInDefense: Record<ShipType, number>
  totalFleetLostInDefense: number
  defenseLostInDefense: Record<DefenseType, number>
  totalDefenseLostInDefense: number
  enemyFleetDestroyedInDefense: Record<ShipType, number>
  totalEnemyFleetDestroyedInDefense: number
  debrisCreatedFromDefenses: number

  // 任務統計
  totalFlightMissions: number
  transportMissions: number
  transportedResources: number
  colonizations: number
  spyMissions: number
  deployments: number
  expeditionsTotal: number
  expeditionsSuccessful: number
  recyclingMissions: number
  recycledResources: number
  planetDestructions: number
  fuelConsumed: number

  // 外交統計
  friendlyNPCCount: number
  hostileNPCCount: number
  giftsSent: number
  giftResourcesTotal: number
  attackedByNPC: number
  spiedByNPC: number
  debrisRecycledByNPC: number
  debrisResourcesLostToNPC: number
}

// 成就等級配置
export interface AchievementTierConfig {
  tier: AchievementTier
  target: number
  reward: AchievementReward
}

// 成就獎勵
export interface AchievementReward {
  darkMatter?: number
  points?: number
}

// 成就配置介面
export interface AchievementConfig {
  id: string
  category: AchievementCategory
  icon: string
  tiers: AchievementTierConfig[]
  statKey: keyof AchievementStats | string
  checkType: 'gte' | 'eq' | 'sum' | 'max'
}

// 玩家成就進度
export interface AchievementProgress {
  id: string
  currentTier: AchievementTier | null
  currentValue: number
  unlockedAt?: number
  tierUnlocks: Record<AchievementTier, number | null>
}

// ==================== 排行榜系統型別 ====================

// 排行榜類別列舉
export const RankingCategory = {
  Total: 'total', // 總積分
  Building: 'building', // 建築積分
  Research: 'research', // 研究積分
  Fleet: 'fleet', // 艦隊積分
  Defense: 'defense' // 防禦積分
} as const
export type RankingCategory = (typeof RankingCategory)[keyof typeof RankingCategory]

// 排行榜條目介面
export interface RankingEntry {
  id: string // 玩家或NPC ID
  name: string // 名稱
  isPlayer: boolean // 是否為玩家（否則為NPC）
  scores: {
    total: number // 總積分
    building: number // 建築積分
    research: number // 研究積分
    fleet: number // 艦隊積分
    defense: number // 防禦積分
  }
  planetCount: number // 星球數量
}

// ==================== 戰役系統 ====================

// 任務狀態
export const QuestStatus = {
  Locked: 'locked', // 未解鎖
  Available: 'available', // 可接取
  Active: 'active', // 進行中
  Completed: 'completed', // 已完成
  Failed: 'failed' // 失敗
} as const
export type QuestStatus = (typeof QuestStatus)[keyof typeof QuestStatus]

// 任務目標型別
export const ObjectiveType = {
  // 基礎目標
  BuildBuilding: 'buildBuilding', // 建造建築到某等級
  ResearchTech: 'researchTech', // 研究科技
  ProduceShips: 'produceShips', // 生產艦船
  AccumulateResources: 'accumulateResources', // 積累資源

  // 戰鬥目標
  DefeatNPC: 'defeatNPC', // 擊敗特定NPC
  WinBattles: 'winBattles', // 贏得N場戰鬥
  RecycleDebris: 'recycleDebris', // 回收殘骸
  DestroyPlanet: 'destroyPlanet', // 摧毀星球

  // 外交目標
  ReachRelation: 'reachRelation', // 達到某關係等級
  SendGift: 'sendGift', // 送禮
  FormAlliance: 'formAlliance', // 結盟

  // 探索目標
  Colonize: 'colonize', // 殖民新星球
  Expedition: 'expedition', // 完成探險任務
  DiscoverLocation: 'discoverLocation', // 發現特定位置
  SpyTarget: 'spyTarget' // 偵查特定目標
} as const
export type ObjectiveType = (typeof ObjectiveType)[keyof typeof ObjectiveType]

// 任務目標
export interface QuestObjective {
  id: string
  type: ObjectiveType
  descriptionKey: string // 翻譯鍵
  target: string | number // 目標值或ID (建築型別/科技型別/艦船型別/NPC ID等)
  targetSecondary?: string | number // 次要目標 (如等級要求)
  required: number // 需要數量
}

// 任務獎勵
export interface QuestReward {
  resources?: Partial<Resources>
  darkMatter?: number
  points?: number
  ships?: Partial<Fleet>
  unlockBuilding?: BuildingType
  unlockTech?: TechnologyType
  specialItem?: string // 特殊物品ID
}

// 劇情對話
export interface StoryDialogue {
  id: string
  speaker: 'narrator' | 'player' | 'npc' | 'mysterious'
  speakerNameKey?: string // 翻譯鍵
  portrait?: string // 頭像標識
  textKey: string // 翻譯鍵
  choices?: DialogueChoice[]
}

// 對話選項
export interface DialogueChoice {
  textKey: string // 翻譯鍵
  nextDialogueId?: string
  effect?: 'reputation_up' | 'reputation_down' | 'unlock_branch'
  npcId?: string // 影響的NPC ID（用於聲望變化）
  value?: number // 效果數值（如聲望變化量，預設為10）
  branchId?: string // 解鎖的分支ID（用於unlock_branch效果）
}

// 戰役任務配置
export interface CampaignQuestConfig {
  id: string
  chapter: number // 章節號
  order: number // 章節內順序
  titleKey: string // 翻譯鍵
  descriptionKey: string // 翻譯鍵

  // 劇情
  prologueDialogues?: StoryDialogue[] // 任務開始對話
  epilogueDialogues?: StoryDialogue[] // 任務完成對話

  // 目標
  objectives: QuestObjective[]

  // 獎勵
  rewards: QuestReward

  // 解鎖條件
  requiredQuestIds?: string[] // 需要先完成的任務

  // 任務位置（用於地圖顯示）
  mapPosition: { x: number; y: number }

  // 特殊標記
  isBoss?: boolean // Boss戰
  isBranch?: boolean // 分支任務
  branchGroup?: string // 分支組ID（同組只能完成一個）
}

// 戰役章節配置
export interface CampaignChapterConfig {
  id: string
  number: number
  titleKey: string // 翻譯鍵
  descriptionKey: string // 翻譯鍵
  backgroundStoryKey: string // 翻譯鍵
  quests: CampaignQuestConfig[]
}

// 戰役配置
export interface CampaignConfig {
  id: string
  nameKey: string // 翻譯鍵
  descriptionKey: string // 翻譯鍵
  chapters: CampaignChapterConfig[]
}

// 玩家任務進度
export interface QuestProgress {
  questId: string
  status: QuestStatus
  objectives: Record<string, { current: number; completed: boolean }>
  startedAt?: number
  completedAt?: number
  rewardsClaimed?: boolean
  dialoguesRead?: string[] // 已讀對話ID
}

// 玩家戰役進度
export interface PlayerCampaignProgress {
  campaignId: string
  currentChapter: number
  currentQuestId?: string
  questProgress: Record<string, QuestProgress>
  completedQuests: string[]
  unlockedQuests: string[]
  branchChoices?: Record<string, string> // 分支選擇記錄
  unlockedBranches?: string[] // 已解鎖的分支任務ID列表
}

// 任務通知
export interface QuestNotification {
  id: string
  timestamp: number
  questId: string
  questTitleKey: string // 翻譯鍵
  eventType: 'unlocked' | 'objective_completed' | 'quest_completed' | 'chapter_completed' | 'reward_claimed'
  messageKey: string // 翻譯鍵
  messageParams?: Record<string, string | number> // 翻譯引數
  rewards?: QuestReward
  read?: boolean
}

// WebDAV 配置
export interface WebDAVConfig {
  serverUrl: string // WebDAV 伺服器地址
  username: string // 使用者名稱
  password: string // 密碼或應用專用密碼
  basePath: string // 存檔存放路徑
}
