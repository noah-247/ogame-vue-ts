import type { NPC, Planet, Player } from '@/types/game'
import { TechnologyType, BuildingType, ShipType, DefenseType, NPCAIType } from '@/types/game'
import { BUILDINGS, SHIPS, TECHNOLOGIES } from '@/config/gameConfig'
import * as buildingLogic from './buildingLogic'
import * as researchLogic from './researchLogic'

/**
 * NPC成長系統
 *
 * 策略說明:
 * - Easy: NPC實力保持在玩家平均實力的60%左右，被動成長
 * - Medium: NPC實力保持在玩家平均實力的80%左右，半主動成長
 * - Hard: NPC實力保持在玩家平均實力的100-120%，主動成長
 */

// 簡化的遊戲狀態介面（用於NPC成長系統）
export interface NPCGrowthGameState {
  planets: Planet[] // 所有星球（包括玩家和NPC的）
  player: Player // 玩家資料
  npcs: NPC[] // 所有NPC
}

// NPC成長配置（舊版，保留用於相容）
export const NPC_GROWTH_CONFIG = {
  easy: {
    powerRatio: 0.6, // 實力比例(相對玩家)
    checkInterval: 300, // 檢查間隔(秒) - 5分鐘
    resourceGrowthRate: 0.5, // 資源增長速率係數
    buildingGrowthSpeed: 0.5, // 建築升級速度係數
    techGrowthSpeed: 0.5 // 科技研究速度係數
  },
  medium: {
    powerRatio: 0.8,
    checkInterval: 180, // 3分鐘
    resourceGrowthRate: 0.8,
    buildingGrowthSpeed: 0.8,
    techGrowthSpeed: 0.8
  },
  hard: {
    powerRatio: 1.1,
    checkInterval: 120, // 2分鐘
    resourceGrowthRate: 1.2,
    buildingGrowthSpeed: 1.0,
    techGrowthSpeed: 1.0
  }
} as const

// 動態難度配置（基於玩家積分）
export interface DynamicDifficultyConfig {
  powerRatio: number
  checkInterval: number
  resourceGrowthRate: number
  buildingGrowthSpeed: number
  techGrowthSpeed: number
}

/**
 * 根據玩家積分計算動態難度配置
 */
export const calculateDynamicDifficulty = (playerPoints: number): DynamicDifficultyConfig => {
  // 積分割槽間和對應的難度引數
  if (playerPoints < 1000) {
    // 新手期：0-1,000分
    // NPC保持30-50%實力，給予充分發展空間，但資源增長速度加快
    const ratio = 0.3 + (playerPoints / 1000) * 0.2
    return {
      powerRatio: ratio,
      checkInterval: 300, // 5分鐘
      resourceGrowthRate: 0.8, // 從0.4提升到0.8，確保NPC有足夠資源發育
      buildingGrowthSpeed: 0.6, // 從0.4提升到0.6
      techGrowthSpeed: 0.6 // 從0.4提升到0.6
    }
  } else if (playerPoints < 5000) {
    // 初級期：1,000-5,000分
    // NPC保持50-70%實力，逐漸增加挑戰
    const ratio = 0.5 + ((playerPoints - 1000) / 4000) * 0.2
    return {
      powerRatio: ratio,
      checkInterval: 240, // 4分鐘
      resourceGrowthRate: 1.0, // 從0.6提升到1.0，與玩家資源產出相當
      buildingGrowthSpeed: 0.8, // 從0.6提升到0.8
      techGrowthSpeed: 0.8 // 從0.6提升到0.8
    }
  } else if (playerPoints < 20000) {
    // 中級期：5,000-20,000分
    // NPC保持70-90%實力，持續挑戰
    const ratio = 0.7 + ((playerPoints - 5000) / 15000) * 0.2
    return {
      powerRatio: ratio,
      checkInterval: 180, // 3分鐘
      resourceGrowthRate: 0.8,
      buildingGrowthSpeed: 0.8,
      techGrowthSpeed: 0.8
    }
  } else if (playerPoints < 50000) {
    // 高階期：20,000-50,000分
    // NPC保持90-110%實力，與玩家勢均力敵
    const ratio = 0.9 + ((playerPoints - 20000) / 30000) * 0.2
    return {
      powerRatio: ratio,
      checkInterval: 150, // 2.5分鐘
      resourceGrowthRate: 1.0,
      buildingGrowthSpeed: 1.0,
      techGrowthSpeed: 1.0
    }
  } else {
    // 專家期：50,000+分
    // NPC保持110-130%實力，超越玩家
    const ratio = Math.min(1.3, 1.1 + ((playerPoints - 50000) / 50000) * 0.2)
    return {
      powerRatio: ratio,
      checkInterval: 120, // 2分鐘
      resourceGrowthRate: 1.2,
      buildingGrowthSpeed: 1.2,
      techGrowthSpeed: 1.2
    }
  }
}

/**
 * 計算玩家平均實力
 */
export const calculatePlayerAveragePower = (
  gameState: NPCGrowthGameState
): {
  avgBuildingLevel: number
  avgTechLevel: number
  totalFleetPower: number
  totalResources: number
} => {
  // 篩選出玩家的星球
  const playerPlanets = gameState.planets.filter(p => p.ownerId === gameState.player.id)

  if (playerPlanets.length === 0) {
    return {
      avgBuildingLevel: 0,
      avgTechLevel: 0,
      totalFleetPower: 0,
      totalResources: 0
    }
  }

  // 計算平均建築等級
  let totalBuildingLevels = 0
  let buildingCount = 0
  playerPlanets.forEach(planet => {
    Object.values(planet.buildings).forEach(level => {
      totalBuildingLevels += level
      buildingCount++
    })
  })

  // 計算平均科技等級
  const techLevels = Object.values(gameState.player.technologies)
  const avgTechLevel = techLevels.length > 0 ? techLevels.reduce((sum, level) => sum + level, 0) / techLevels.length : 0

  // 計算總艦隊戰力
  let totalFleetPower = 0
  playerPlanets.forEach(planet => {
    Object.entries(planet.fleet).forEach(([shipType, count]) => {
      const shipConfig = SHIPS[shipType as ShipType]
      const power = shipConfig.attack + shipConfig.shield + shipConfig.armor / 10
      totalFleetPower += power * (count as number)
    })
  })

  // 計算總資源
  const totalResources = playerPlanets.reduce(
    (sum, planet) => sum + planet.resources.metal + planet.resources.crystal + planet.resources.deuterium,
    0
  )

  return {
    avgBuildingLevel: buildingCount > 0 ? totalBuildingLevels / buildingCount : 0,
    avgTechLevel,
    totalFleetPower,
    totalResources
  }
}

/**
 * 計算NPC當前實力
 */
export const calculateNPCPower = (
  npc: NPC
): {
  avgBuildingLevel: number
  avgTechLevel: number
  totalFleetPower: number
  totalResources: number
} => {
  // 計算平均建築等級
  let totalBuildingLevels = 0
  let buildingCount = 0
  npc.planets.forEach(planet => {
    Object.values(planet.buildings).forEach(level => {
      totalBuildingLevels += level
      buildingCount++
    })
  })

  // 計算平均科技等級
  const techLevels = Object.values(npc.technologies)
  const avgTechLevel = techLevels.length > 0 ? techLevels.reduce((sum, level) => sum + level, 0) / techLevels.length : 0

  // 計算總艦隊戰力
  let totalFleetPower = 0
  npc.planets.forEach(planet => {
    Object.entries(planet.fleet).forEach(([shipType, count]) => {
      const shipConfig = SHIPS[shipType as ShipType]
      const power = shipConfig.attack + shipConfig.shield + shipConfig.armor / 10
      totalFleetPower += power * (count as number)
    })
  })

  // 計算總資源
  const totalResources = npc.planets.reduce(
    (sum, planet) => sum + planet.resources.metal + planet.resources.crystal + planet.resources.deuterium,
    0
  )

  return {
    avgBuildingLevel: buildingCount > 0 ? totalBuildingLevels / buildingCount : 0,
    avgTechLevel,
    totalFleetPower,
    totalResources
  }
}

/**
 * 自動升級NPC建築
 */
export const autoUpgradeNPCBuildings = (npc: NPC): void => {
  const planet = npc.planets[0]
  if (!planet) return

  // 優先順序佇列：資源建築 > 設施建築 > 其他
  const priorityBuildings: BuildingType[] = [
    BuildingType.MetalMine,
    BuildingType.CrystalMine,
    BuildingType.DeuteriumSynthesizer,
    BuildingType.SolarPlant,
    BuildingType.RoboticsFactory,
    BuildingType.Shipyard,
    BuildingType.ResearchLab,
    BuildingType.MetalStorage,
    BuildingType.CrystalStorage,
    BuildingType.DeuteriumTank,
    BuildingType.DarkMatterCollector
  ]

  // 嘗試升級建築
  for (const buildingType of priorityBuildings) {
    const currentLevel = planet.buildings[buildingType] || 0
    const targetLevel = currentLevel + 1

    // 檢查是否達到最大等級
    const buildingConfig = BUILDINGS[buildingType]
    if (buildingConfig.maxLevel && currentLevel >= buildingConfig.maxLevel) {
      continue
    }

    // 計算升級成本
    const cost = buildingLogic.calculateBuildingCost(buildingType, targetLevel)

    // 檢查資源是否足夠
    if (
      planet.resources.metal >= cost.metal &&
      planet.resources.crystal >= cost.crystal &&
      planet.resources.deuterium >= cost.deuterium &&
      planet.resources.darkMatter >= cost.darkMatter
    ) {
      // 扣除資源
      planet.resources.metal -= cost.metal
      planet.resources.crystal -= cost.crystal
      planet.resources.deuterium -= cost.deuterium
      planet.resources.darkMatter -= cost.darkMatter

      // 直接升級(NPC不需要等待建造時間)
      planet.buildings[buildingType] = targetLevel

      // 每次只升級一個建築，避免一次性消耗太多資源
      break
    }
  }
}

/**
 * 自動研究NPC科技
 */
export const autoResearchNPCTechnologies = (npc: NPC): void => {
  const planet = npc.planets[0]
  if (!planet) return

  // 優先順序佇列：戰鬥科技 > 驅動科技 > 其他
  const priorityTechs: TechnologyType[] = [
    TechnologyType.EnergyTechnology,
    TechnologyType.ComputerTechnology,
    TechnologyType.WeaponsTechnology,
    TechnologyType.ShieldingTechnology,
    TechnologyType.ArmourTechnology,
    TechnologyType.CombustionDrive,
    TechnologyType.ImpulseDrive,
    TechnologyType.HyperspaceDrive,
    TechnologyType.LaserTechnology,
    TechnologyType.IonTechnology,
    TechnologyType.PlasmaTechnology,
    TechnologyType.Astrophysics,
    TechnologyType.EspionageTechnology
  ]

  // 嘗試研究科技
  for (const techType of priorityTechs) {
    const currentLevel = npc.technologies[techType] || 0
    const targetLevel = currentLevel + 1

    // 檢查是否達到最大等級
    const techConfig = TECHNOLOGIES[techType]
    if (techConfig.maxLevel && currentLevel >= techConfig.maxLevel) {
      continue
    }

    // 計算研究成本
    const cost = researchLogic.calculateTechnologyCost(techType, targetLevel)

    // 檢查資源是否足夠
    if (
      planet.resources.metal >= cost.metal &&
      planet.resources.crystal >= cost.crystal &&
      planet.resources.deuterium >= cost.deuterium &&
      planet.resources.darkMatter >= cost.darkMatter
    ) {
      // 扣除資源
      planet.resources.metal -= cost.metal
      planet.resources.crystal -= cost.crystal
      planet.resources.deuterium -= cost.deuterium
      planet.resources.darkMatter -= cost.darkMatter

      // 直接升級(NPC不需要等待研究時間)
      npc.technologies[techType] = targetLevel

      // 每次只研究一個科技
      break
    }
  }
}

/**
 * 自動建造NPC艦隊
 */
export const autoBuildNPCFleet = (npc: NPC): void => {
  const planet = npc.planets[0]
  if (!planet) return

  // 根據難度決定艦隊組成
  const fleetComposition: { shipType: ShipType; priority: number }[] = [
    { shipType: ShipType.LightFighter, priority: 1 },
    { shipType: ShipType.HeavyFighter, priority: 2 },
    { shipType: ShipType.Cruiser, priority: 3 },
    { shipType: ShipType.Battleship, priority: 4 },
    { shipType: ShipType.SmallCargo, priority: 5 },
    { shipType: ShipType.LargeCargo, priority: 6 },
    { shipType: ShipType.Recycler, priority: 7 },
    { shipType: ShipType.EspionageProbe, priority: 8 }
  ]

  // 按優先順序排序
  fleetComposition.sort((a, b) => a.priority - b.priority)

  // 嘗試建造艦船
  for (const { shipType } of fleetComposition) {
    const shipConfig = SHIPS[shipType]

    // 檢查建造需求
    const canBuild = Object.entries(shipConfig.requirements || {}).every(([reqType, reqLevel]) => {
      if (reqType in BuildingType) {
        return (planet.buildings[reqType as BuildingType] || 0) >= reqLevel
      }
      if (reqType in TechnologyType) {
        return (npc.technologies[reqType as TechnologyType] || 0) >= reqLevel
      }
      return false
    })

    if (!canBuild) continue

    // 根據難度和當前資源決定建造數量（防止除零）
    const metalAffordable = shipConfig.cost.metal > 0 ? planet.resources.metal / shipConfig.cost.metal : Infinity
    const crystalAffordable = shipConfig.cost.crystal > 0 ? planet.resources.crystal / shipConfig.cost.crystal : Infinity
    const deuteriumAffordable = shipConfig.cost.deuterium > 0 ? planet.resources.deuterium / shipConfig.cost.deuterium : Infinity
    const darkMatterAffordable = shipConfig.cost.darkMatter > 0 ? planet.resources.darkMatter / shipConfig.cost.darkMatter : Infinity

    const maxAffordable = Math.floor(Math.min(metalAffordable, crystalAffordable, deuteriumAffordable, darkMatterAffordable))

    // 防止NaN或Infinity（如果所有成本都為0的極端情況）
    if (!Number.isFinite(maxAffordable) || maxAffordable <= 0) continue

    // 建造數量：簡單1-5艘，中等5-10艘，困難10-20艘
    const buildCount = Math.min(maxAffordable, npc.difficulty === 'easy' ? 5 : npc.difficulty === 'medium' ? 10 : 20)

    if (buildCount > 0) {
      // 扣除資源
      planet.resources.metal -= shipConfig.cost.metal * buildCount
      planet.resources.crystal -= shipConfig.cost.crystal * buildCount
      planet.resources.deuterium -= shipConfig.cost.deuterium * buildCount
      planet.resources.darkMatter -= shipConfig.cost.darkMatter * buildCount

      // 新增艦船
      planet.fleet[shipType] = (planet.fleet[shipType] || 0) + buildCount

      // 建造一批後退出
      break
    }
  }
}

/**
 * 為NPC生成資源(模擬資源生產)
 */
export const generateNPCResources = (npc: NPC, deltaSeconds: number, config: DynamicDifficultyConfig, gameSpeed: number = 1): void => {
  const planet = npc.planets[0]
  if (!planet) return

  // 基於建築等級計算資源產量
  const metalMineLevel = planet.buildings[BuildingType.MetalMine] || 0
  const crystalMineLevel = planet.buildings[BuildingType.CrystalMine] || 0
  const deuteriumLevel = planet.buildings[BuildingType.DeuteriumSynthesizer] || 0
  const darkMatterLevel = planet.buildings[BuildingType.DarkMatterCollector] || 0

  // 簡化的資源產量計算(每秒產量) - 提升3倍讓NPC更富有
  const metalProduction = 90 * metalMineLevel * Math.pow(1.1, metalMineLevel) * config.resourceGrowthRate
  const crystalProduction = 60 * crystalMineLevel * Math.pow(1.1, crystalMineLevel) * config.resourceGrowthRate
  const deuteriumProduction = 30 * deuteriumLevel * Math.pow(1.1, deuteriumLevel) * config.resourceGrowthRate
  const darkMatterProduction = ((75 * darkMatterLevel * Math.pow(1.5, darkMatterLevel)) / 3600) * config.resourceGrowthRate

  // 應用遊戲速度倍率到時間
  const effectiveDeltaSeconds = deltaSeconds * gameSpeed

  // 增加資源
  planet.resources.metal += metalProduction * effectiveDeltaSeconds
  planet.resources.crystal += crystalProduction * effectiveDeltaSeconds
  planet.resources.deuterium += deuteriumProduction * effectiveDeltaSeconds
  planet.resources.darkMatter += darkMatterProduction * effectiveDeltaSeconds

  // 確保不超過儲存上限
  const metalStorage = planet.buildings[BuildingType.MetalStorage] || 0
  const crystalStorage = planet.buildings[BuildingType.CrystalStorage] || 0
  const deuteriumStorage = planet.buildings[BuildingType.DeuteriumTank] || 0
  const darkMatterStorage = planet.buildings[BuildingType.DarkMatterTank] || 0

  planet.resources.metal = Math.min(planet.resources.metal, 10000 * Math.pow(2, metalStorage))
  planet.resources.crystal = Math.min(planet.resources.crystal, 10000 * Math.pow(2, crystalStorage))
  planet.resources.deuterium = Math.min(planet.resources.deuterium, 10000 * Math.pow(2, deuteriumStorage))
  planet.resources.darkMatter = Math.min(planet.resources.darkMatter, 1000 * Math.pow(2, darkMatterStorage))
}

/**
 * 主NPC成長更新函式
 * 應該在遊戲迴圈中定期呼叫
 */
export const updateNPCGrowth = (npc: NPC, gameState: NPCGrowthGameState, deltaSeconds: number, gameSpeed: number = 1): void => {
  // 使用動態難度（基於玩家積分）而不是固定難度
  const config = calculateDynamicDifficulty(gameState.player.points)

  // 1. 持續生成資源（應用遊戲速度倍率）
  generateNPCResources(npc, deltaSeconds, config, gameSpeed)

  // 2. 定期評估並調整實力(使用靜態計數器或時間戳)
  const now = Date.now()
  const lastGrowthCheck = (npc as any).lastGrowthCheck || 0

  if (now - lastGrowthCheck >= config.checkInterval * 1000) {
    ;(npc as any).lastGrowthCheck = now

    // 計算玩家平均實力
    const playerPower = calculatePlayerAveragePower(gameState)
    const npcPower = calculateNPCPower(npc)

    // 計算目標實力
    const targetBuildingLevel = playerPower.avgBuildingLevel * config.powerRatio
    const targetTechLevel = playerPower.avgTechLevel * config.powerRatio
    const targetFleetPower = playerPower.totalFleetPower * config.powerRatio

    // 3. 如果實力不足，進行升級
    if (npcPower.avgBuildingLevel < targetBuildingLevel) {
      autoUpgradeNPCBuildings(npc)
    }

    if (npcPower.avgTechLevel < targetTechLevel) {
      autoResearchNPCTechnologies(npc)
    }

    if (npcPower.totalFleetPower < targetFleetPower) {
      autoBuildNPCFleet(npc)
    }
  }
}

/**
 * 初始化NPC時設定合理的起始實力
 */
export const initializeNPCStartingPower = (
  npc: NPC,
  playerPower: {
    avgBuildingLevel: number
    avgTechLevel: number
    totalFleetPower: number
    totalResources: number
  }
): void => {
  const config = NPC_GROWTH_CONFIG[npc.difficulty]
  const planet = npc.planets[0]
  if (!planet) return

  // 設定起始建築等級(基於玩家實力)
  const targetBuildingLevel = Math.max(5, Math.floor(playerPower.avgBuildingLevel * config.powerRatio))

  // 設定資源建築
  planet.buildings[BuildingType.MetalMine] = targetBuildingLevel
  planet.buildings[BuildingType.CrystalMine] = Math.floor(targetBuildingLevel * 0.8)
  planet.buildings[BuildingType.DeuteriumSynthesizer] = Math.floor(targetBuildingLevel * 0.6)
  planet.buildings[BuildingType.SolarPlant] = targetBuildingLevel + 2

  // 設定設施建築
  planet.buildings[BuildingType.RoboticsFactory] = Math.floor(targetBuildingLevel * 0.5)
  planet.buildings[BuildingType.Shipyard] = Math.floor(targetBuildingLevel * 0.4)
  planet.buildings[BuildingType.ResearchLab] = Math.floor(targetBuildingLevel * 0.4)

  // 設定倉儲
  planet.buildings[BuildingType.MetalStorage] = Math.floor(targetBuildingLevel * 0.3)
  planet.buildings[BuildingType.CrystalStorage] = Math.floor(targetBuildingLevel * 0.3)
  planet.buildings[BuildingType.DeuteriumTank] = Math.floor(targetBuildingLevel * 0.3)

  // 設定起始科技等級
  const targetTechLevel = Math.max(3, Math.floor(playerPower.avgTechLevel * config.powerRatio))

  npc.technologies[TechnologyType.EnergyTechnology] = targetTechLevel
  npc.technologies[TechnologyType.ComputerTechnology] = Math.floor(targetTechLevel * 0.8)
  npc.technologies[TechnologyType.WeaponsTechnology] = Math.floor(targetTechLevel * 0.7)
  npc.technologies[TechnologyType.ShieldingTechnology] = Math.floor(targetTechLevel * 0.7)
  npc.technologies[TechnologyType.ArmourTechnology] = Math.floor(targetTechLevel * 0.7)
  npc.technologies[TechnologyType.CombustionDrive] = Math.floor(targetTechLevel * 0.6)

  // 給予起始資源 - 大幅提升以讓NPC更富有
  planet.resources.metal = 500000 * config.powerRatio
  planet.resources.crystal = 250000 * config.powerRatio
  planet.resources.deuterium = 100000 * config.powerRatio
  planet.resources.darkMatter = 5000 * config.powerRatio

  // 給予起始艦隊（確保NPC能夠立即偵查和攻擊）
  // 使用平方根函式來平滑艦隊數量增長，避免初期過於強大
  const fleetRatio = Math.sqrt(config.powerRatio)

  // 間諜探測器 - 必需，用於偵查玩家
  planet.fleet[ShipType.EspionageProbe] = Math.max(5, Math.floor(10 * fleetRatio))

  // 基礎戰鬥艦隊
  planet.fleet[ShipType.LightFighter] = Math.floor(20 * fleetRatio)
  planet.fleet[ShipType.HeavyFighter] = Math.floor(10 * fleetRatio)
  planet.fleet[ShipType.Cruiser] = Math.floor(5 * fleetRatio)

  // 運輸和回收艦船
  planet.fleet[ShipType.SmallCargo] = Math.floor(5 * fleetRatio)
  planet.fleet[ShipType.Recycler] = Math.floor(3 * fleetRatio)
}

/**
 * 確保所有NPC都有最低數量的間諜探測器
 * 用於修復舊版本儲存的NPC資料
 */
export const ensureNPCSpyProbes = (npcs: NPC[]): void => {
  npcs.forEach(npc => {
    const planet = npc.planets[0]
    if (!planet) return

    // 如果沒有艦隊資料，初始化
    if (!planet.fleet) {
      planet.fleet = {} as any
    }

    // 檢查間諜探測器數量
    const currentProbes = planet.fleet[ShipType.EspionageProbe] || 0

    // 如果沒有探測器，根據NPC難度給予基礎數量
    if (currentProbes === 0) {
      const config = NPC_GROWTH_CONFIG[npc.difficulty]
      const fleetRatio = Math.sqrt(config.powerRatio)
      planet.fleet[ShipType.EspionageProbe] = Math.max(5, Math.floor(10 * fleetRatio))
    }
  })
}

/**
 * 初始化NPC外交關係網路
 * 為每個NPC隨機分配盟友和敵人
 */
export const initializeNPCDiplomacy = (npcs: NPC[]): void => {
  // 確保所有NPC都有空的外交欄位
  npcs.forEach(npc => {
    if (!npc.allies) npc.allies = []
    if (!npc.enemies) npc.enemies = []
    if (!npc.relations) npc.relations = {}
  })

  // 為每個NPC隨機分配1-2個盟友
  npcs.forEach(npc => {
    // 獲取還未建立關係的潛在盟友
    const potentialAllies = npcs.filter(n => n.id !== npc.id && !npc.allies!.includes(n.id) && !n.allies!.includes(npc.id))

    if (potentialAllies.length === 0) return

    // 隨機選擇1-2個盟友
    const allyCount = Math.min(Math.floor(Math.random() * 2) + 1, potentialAllies.length)

    for (let i = 0; i < allyCount; i++) {
      if (potentialAllies.length === 0) break

      const allyIndex = Math.floor(Math.random() * potentialAllies.length)
      const ally = potentialAllies.splice(allyIndex, 1)[0]

      if (!ally) continue

      // 建立雙向盟友關係
      if (!npc.allies!.includes(ally.id)) {
        npc.allies!.push(ally.id)
      }
      if (!ally.allies!.includes(npc.id)) {
        ally.allies!.push(npc.id)
      }
    }
  })
}

// ==================== 距離難度系統 ====================

/**
 * 計算NPC星球到玩家母星的距離
 * 銀河系距離權重最大，星系次之，位置最小
 */
export const calculateDistanceToHomeworld = (
  npcPosition: { galaxy: number; system: number; position: number },
  homeworldPosition: { galaxy: number; system: number; position: number }
): number => {
  const galaxyDistance = Math.abs(npcPosition.galaxy - homeworldPosition.galaxy)
  const systemDistance = Math.abs(npcPosition.system - homeworldPosition.system)
  const positionDistance = Math.abs(npcPosition.position - homeworldPosition.position)

  // 銀河系跨度權重最大
  return galaxyDistance * 100 + systemDistance * 10 + positionDistance
}

/**
 * 基於距離計算難度等級（1-無限）
 */
export const calculateDifficultyLevel = (distance: number): number => {
  if (distance <= 10) return 1 // 新手
  if (distance <= 30) return 2 // 簡單
  if (distance <= 60) return 3 // 普通
  if (distance <= 100) return 4 // 困難
  if (distance <= 200) return 5 // 專家
  if (distance <= 400) return 6 // 大師
  // 超過400繼續增長
  return 6 + Math.floor((distance - 400) / 200)
}

/**
 * 距離難度倍率配置
 */
export interface DistanceDifficultyMultipliers {
  buildingMultiplier: number
  techMultiplier: number
  fleetMultiplier: number
  resourceMultiplier: number
  defenseMultiplier: number
}

/**
 * 基於距離計算實力倍率
 * 使用對數增長，確保數值合理
 *
 * 建築等級上限：30
 * 科技等級上限：20
 *
 * 建築等級示例（baseLevel=5）：
 * - 距離 0: 5級
 * - 距離 10: 8級
 * - 距離 50: 14級
 * - 距離 100: 18級
 * - 距離 200: 22級
 * - 距離 400: 26級
 * - 距離 800+: 30級（上限）
 */
export const calculateDistanceDifficultyMultiplier = (distance: number): DistanceDifficultyMultipliers => {
  // 使用對數增長，確保建築等級在合理範圍內
  // 公式: 1 + ln(1 + distance) * 0.8
  // 這樣可以確保最大建築倍率約為6倍（5*6=30）
  const logMultiplier = 1 + Math.log(1 + distance) * 0.8

  // 限制建築倍率最大為6（因為基礎等級是5，5*6=30）
  const buildingMultiplier = Math.min(6, Math.max(1, Math.round(logMultiplier)))

  // 科技倍率稍低，上限4倍（5*4=20）
  const techMultiplier = Math.min(4, Math.max(1, Math.round(logMultiplier * 0.7)))

  // 艦隊倍率：使用更平緩的增長
  // 基礎艦隊10艘，最大約500艘左右
  const fleetMultiplier = Math.min(50, Math.max(1, Math.round(logMultiplier * 8)))

  // 資源倍率：限制最大20倍，避免Infinity
  const resourceMultiplier = Math.min(20, Math.max(1, logMultiplier * 3))

  // 防禦倍率
  const defenseMultiplier = Math.min(30, Math.max(1, Math.round(logMultiplier * 5)))

  return {
    buildingMultiplier,
    techMultiplier,
    fleetMultiplier,
    resourceMultiplier,
    defenseMultiplier
  }
}

/**
 * 隨機生成 NPC 的 AI 型別
 * 分佈機率:
 * - Balanced: 35% （平衡型最常見）
 * - Aggressive: 25% （侵略型較常見）
 * - Defensive: 20% （防守型中等）
 * - Expansionist: 15% （擴張型較少）
 * - Trader: 5% （商人型最稀少）
 */
export const generateRandomAIType = (): NPCAIType => {
  const roll = Math.random() * 100
  if (roll < 35) return NPCAIType.Balanced
  if (roll < 60) return NPCAIType.Aggressive
  if (roll < 80) return NPCAIType.Defensive
  if (roll < 95) return NPCAIType.Expansionist
  return NPCAIType.Trader
}

/**
 * 確保 NPC 有 AI 型別，如果沒有則隨機分配
 */
export const ensureNPCAIType = (npc: NPC): void => {
  if (!npc.aiType) {
    npc.aiType = generateRandomAIType()
  }
}

/**
 * 確保所有 NPC 都有 AI 型別
 */
export const ensureAllNPCsAIType = (npcs: NPC[]): void => {
  npcs.forEach(npc => ensureNPCAIType(npc))
}

/**
 * 基於距離難度初始化NPC星球
 * 替代舊的 initializeNPCStartingPower
 *
 * 設計原則：
 * 1. 只設定行星可建造的建築（不設定月球專屬建築）
 * 2. 建築空間不超出 maxSpace 限制
 * 3. 艦隊倉儲不超出限制（基於船塢+機庫+計算機技術計算）
 * 4. 建築和科技等級合理，不是隨機的，與難度成正比
 *
 * 空間佔用（每級）：
 * - 金屬礦/晶體礦: 1, 重氫合成器: 2, 太陽能電站: 2
 * - 聚變反應堆: 4, 金屬/晶體/重氫倉庫: 1
 * - 機器人工廠: 4, 造船廠: 5, 研究實驗室: 3, 機庫: 3
 * - 奈米工廠: 8, 導彈發射井: 6, 地形改造器: 5
 * - 暗物質收集器: 5, 暗物質儲罐: 2, 地質研究站: 6, 深鑽設施: 15
 *
 * 艦隊倉儲容量 = 1000 + 船塢×1000 + 機庫×1500 + 計算機技術×500
 *
 * 艦船倉儲佔用：
 * - 輕型戰鬥機: 5, 重型戰鬥機: 10, 巡洋艦: 15, 戰列艦: 25
 * - 戰列巡洋艦: 20, 轟炸機: 35, 驅逐艦: 12
 * - 小型運輸: 10, 大型運輸: 20, 殖民船: 40, 回收船: 30
 * - 間諜探測器: 2, 太陽能衛星: 1, 暗物質收集船: 50, 死星: 100
 */
export const initializeNPCByDistance = (npc: NPC, homeworldPosition: { galaxy: number; system: number; position: number }): void => {
  const planet = npc.planets[0]
  if (!planet) return

  const distance = calculateDistanceToHomeworld(planet.position, homeworldPosition)

  // 儲存距離和難度等級到NPC
  npc.distanceToHomeworld = distance
  npc.difficultyLevel = calculateDifficultyLevel(distance)

  // 分配隨機 AI 型別（如果還沒有）
  ensureNPCAIType(npc)

  // 難度等級 1-7+，有效等級 = 難度等級 + 2
  const difficultyLevel = npc.difficultyLevel || 1
  const effectiveLevel = difficultyLevel + 2 // 實力提升兩檔

  // ========== 第一步：設定建築等級（確保不超出空間限制）==========
  // maxSpace 預設為 200，需要合理分配

  // 根據effectiveLevel計算建築等級上限
  // effectiveLevel: 3,4,5,6,7,8,9 對應不同的建築配置

  // 資源建築（空間佔用較低，優先配置）
  const metalMineLevel = Math.min(25, Math.floor(10 + effectiveLevel * 2)) // 16-28級
  const crystalMineLevel = Math.min(23, Math.floor(9 + effectiveLevel * 1.8)) // 14-25級
  const deutLevel = Math.min(20, Math.floor(8 + effectiveLevel * 1.5)) // 12-21級
  const solarPlantLevel = Math.min(28, Math.floor(12 + effectiveLevel * 2)) // 18-30級

  planet.buildings[BuildingType.MetalMine] = metalMineLevel // 空間: 16-28
  planet.buildings[BuildingType.CrystalMine] = crystalMineLevel // 空間: 14-25
  planet.buildings[BuildingType.DeuteriumSynthesizer] = deutLevel // 空間: 24-42
  planet.buildings[BuildingType.SolarPlant] = solarPlantLevel // 空間: 36-60

  // 倉儲建築（空間佔用低，每級1）
  const storageLevel = Math.min(10, Math.floor(4 + effectiveLevel * 0.8)) // 6-11級
  planet.buildings[BuildingType.MetalStorage] = storageLevel // 空間: 6-11
  planet.buildings[BuildingType.CrystalStorage] = storageLevel // 空間: 6-11
  planet.buildings[BuildingType.DeuteriumTank] = storageLevel // 空間: 6-11

  // 關鍵設施建築（決定艦隊倉儲容量）
  const shipyardLevel = Math.min(16, Math.floor(6 + effectiveLevel * 1.2)) // 10-17級
  const hangarLevel = Math.min(20, Math.floor(8 + effectiveLevel * 1.5)) // 12-21級
  const roboticsLevel = Math.min(14, Math.floor(5 + effectiveLevel)) // 8-14級
  const researchLabLevel = Math.min(14, Math.floor(5 + effectiveLevel)) // 8-14級

  planet.buildings[BuildingType.Shipyard] = shipyardLevel // 空間: 50-85
  planet.buildings[BuildingType.Hangar] = hangarLevel // 空間: 36-63
  planet.buildings[BuildingType.RoboticsFactory] = roboticsLevel // 空間: 32-56
  planet.buildings[BuildingType.ResearchLab] = researchLabLevel // 空間: 24-42

  // 其他設施
  planet.buildings[BuildingType.MissileSilo] = Math.min(8, effectiveLevel) // 3-9級, 空間: 18-54
  planet.buildings[BuildingType.FusionReactor] = Math.min(10, effectiveLevel) // 3-9級, 空間: 12-36

  // 高階設施（根據effectiveLevel逐步解鎖）
  if (effectiveLevel >= 4) {
    planet.buildings[BuildingType.NaniteFactory] = Math.min(5, effectiveLevel - 3) // 1-6級, 空間: 8-48
  }
  if (effectiveLevel >= 5) {
    planet.buildings[BuildingType.DarkMatterCollector] = Math.min(4, effectiveLevel - 4) // 1-5級, 空間: 5-25
    planet.buildings[BuildingType.DarkMatterTank] = Math.min(5, effectiveLevel - 4) // 1-5級, 空間: 2-10
    planet.buildings[BuildingType.GeoResearchStation] = Math.min(3, effectiveLevel - 4) // 1-5級, 空間: 6-30
  }
  if (effectiveLevel >= 7) {
    planet.buildings[BuildingType.Terraformer] = Math.min(3, effectiveLevel - 6) // 1-3級, 空間: 5-15
    planet.buildings[BuildingType.DeepDrillingFacility] = Math.min(2, effectiveLevel - 6) // 1-3級, 空間: 15-45
  }

  // 計算並更新maxSpace（基於地形改造器）
  const terraformerLevel = planet.buildings[BuildingType.Terraformer] || 0
  planet.maxSpace = 200 + terraformerLevel * 10 // 地形改造器每級+10空間

  // ========== 第二步：設定科技等級（基於研究實驗室等級）==========
  // 科技等級與研究實驗室等級相關，不應超過實驗室等級太多
  const baseTechLevel = Math.min(20, researchLabLevel + effectiveLevel) // 實驗室+難度

  npc.technologies[TechnologyType.EnergyTechnology] = baseTechLevel
  npc.technologies[TechnologyType.ComputerTechnology] = Math.min(10, Math.floor(baseTechLevel * 0.6)) // 計算機技術上限10
  npc.technologies[TechnologyType.WeaponsTechnology] = Math.floor(baseTechLevel * 0.9)
  npc.technologies[TechnologyType.ShieldingTechnology] = Math.floor(baseTechLevel * 0.85)
  npc.technologies[TechnologyType.ArmourTechnology] = Math.floor(baseTechLevel * 0.85)
  npc.technologies[TechnologyType.CombustionDrive] = Math.floor(baseTechLevel * 0.8)
  npc.technologies[TechnologyType.ImpulseDrive] = Math.floor(baseTechLevel * 0.7)
  npc.technologies[TechnologyType.EspionageTechnology] = Math.floor(baseTechLevel * 0.7)
  npc.technologies[TechnologyType.LaserTechnology] = Math.floor(baseTechLevel * 0.8)
  npc.technologies[TechnologyType.Astrophysics] = Math.floor(baseTechLevel * 0.5)
  npc.technologies[TechnologyType.IonTechnology] = Math.min(10, effectiveLevel)
  npc.technologies[TechnologyType.HyperspaceTechnology] = Math.min(10, effectiveLevel)
  npc.technologies[TechnologyType.HyperspaceDrive] = Math.min(8, Math.max(0, effectiveLevel - 1))

  if (effectiveLevel >= 4) {
    npc.technologies[TechnologyType.PlasmaTechnology] = Math.min(10, effectiveLevel - 2)
  }
  if (effectiveLevel >= 5) {
    npc.technologies[TechnologyType.DarkMatterTechnology] = Math.min(6, effectiveLevel - 4)
    npc.technologies[TechnologyType.TerraformingTechnology] = Math.min(4, effectiveLevel - 4)
  }
  if (effectiveLevel >= 8) {
    npc.technologies[TechnologyType.GravitonTechnology] = 1
  }

  // ========== 第三步：計算艦隊倉儲容量 ==========
  // 艦隊倉儲 = 基礎1000 + 船塢×1000 + 機庫×1500 + 計算機技術×500
  const computerTechLevel = npc.technologies[TechnologyType.ComputerTechnology] || 0
  const maxFleetStorage = 1000 + shipyardLevel * 1000 + hangarLevel * 1500 + computerTechLevel * 500
  // effectiveLevel 3: 1000 + 10×1000 + 12×1500 + 6×500 = 1000+10000+18000+3000 = 32000
  // effectiveLevel 9: 1000 + 17×1000 + 21×1500 + 10×500 = 1000+17000+31500+5000 = 54500

  // ========== 第四步：設定艦隊（確保不超出倉儲限制）==========
  // 先清空艦隊
  Object.values(ShipType).forEach(shipType => {
    planet.fleet[shipType] = 0
  })

  // 計算每種艦船的倉儲佔用
  const shipStorage: Record<ShipType, number> = {
    [ShipType.LightFighter]: 5,
    [ShipType.HeavyFighter]: 10,
    [ShipType.Cruiser]: 15,
    [ShipType.Battleship]: 25,
    [ShipType.Battlecruiser]: 20,
    [ShipType.Bomber]: 35,
    [ShipType.Destroyer]: 12,
    [ShipType.SmallCargo]: 10,
    [ShipType.LargeCargo]: 20,
    [ShipType.ColonyShip]: 40,
    [ShipType.Recycler]: 30,
    [ShipType.EspionageProbe]: 2,
    [ShipType.SolarSatellite]: 1,
    [ShipType.DarkMatterHarvester]: 50,
    [ShipType.Deathstar]: 100
  }

  // 根據 effectiveLevel 計算艦隊基數
  // effectiveLevel 3: fleetMultiplier = 1, effectiveLevel 9: fleetMultiplier = 4
  const fleetMultiplier = Math.pow(effectiveLevel / 3, 2) // 1, 1.78, 2.78, 4, 5.44, 7.11, 9

  // 按優先順序分配艦隊（戰鬥艦優先）
  let usedStorage = 0

  // 輔助函式：新增艦船並追蹤倉儲使用
  const addShips = (shipType: ShipType, baseCount: number) => {
    const count = Math.floor(baseCount * fleetMultiplier)
    const availableStorage = maxFleetStorage - usedStorage
    const maxAffordable = Math.floor(availableStorage / shipStorage[shipType])
    const actualCount = Math.min(count, maxAffordable)
    if (actualCount > 0) {
      planet.fleet[shipType] = actualCount
      usedStorage += actualCount * shipStorage[shipType]
    }
  }

  // 主力戰鬥艦隊
  addShips(ShipType.LightFighter, 800) // 800-7200
  addShips(ShipType.HeavyFighter, 400) // 400-3600
  addShips(ShipType.Cruiser, 200) // 200-1800
  addShips(ShipType.Battleship, 100) // 100-900
  addShips(ShipType.Battlecruiser, 80) // 80-720
  addShips(ShipType.Destroyer, 60) // 60-540
  addShips(ShipType.Bomber, 40) // 40-360

  // 輔助艦隊
  addShips(ShipType.SmallCargo, 150) // 150-1350
  addShips(ShipType.LargeCargo, 60) // 60-540
  addShips(ShipType.Recycler, 50) // 50-450
  addShips(ShipType.EspionageProbe, 100) // 100-900
  addShips(ShipType.SolarSatellite, 200) // 200-1800

  // 特殊艦船
  if (effectiveLevel >= 4) {
    addShips(ShipType.ColonyShip, 3) // 3-27
  }
  if (effectiveLevel >= 5) {
    addShips(ShipType.DarkMatterHarvester, 10) // 10-90
  }
  if (effectiveLevel >= 8) {
    addShips(ShipType.Deathstar, 2) // 2-18
  }

  // ========== 第五步：設定防禦設施 ==========
  // 防禦不受倉儲限制，使用 effectiveLevel 的平方增長
  const defenseMultiplier = effectiveLevel * effectiveLevel // 9, 16, 25, 36, 49, 64, 81

  planet.defense[DefenseType.RocketLauncher] = defenseMultiplier * 50 // 450-4050
  planet.defense[DefenseType.LightLaser] = defenseMultiplier * 40 // 360-3240
  planet.defense[DefenseType.HeavyLaser] = defenseMultiplier * 20 // 180-1620
  planet.defense[DefenseType.GaussCannon] = defenseMultiplier * 8 // 72-648
  planet.defense[DefenseType.IonCannon] = defenseMultiplier * 8 // 72-648
  planet.defense[DefenseType.PlasmaTurret] = defenseMultiplier * 4 // 36-324
  planet.defense[DefenseType.SmallShieldDome] = 1
  planet.defense[DefenseType.LargeShieldDome] = effectiveLevel >= 4 ? 1 : 0
  planet.defense[DefenseType.AntiBallisticMissile] = defenseMultiplier * 3 // 27-243
  planet.defense[DefenseType.InterplanetaryMissile] = effectiveLevel >= 4 ? defenseMultiplier : 0 // 0-81
  planet.defense[DefenseType.PlanetaryShield] = effectiveLevel >= 6 ? 1 : 0

  // ========== 第六步：設定資源 ==========
  // 基於倉儲建築等級計算容量上限，資源填充70-100%
  const metalCapacity = 10000 * Math.pow(2, planet.buildings[BuildingType.MetalStorage] || 0)
  const crystalCapacity = 10000 * Math.pow(2, planet.buildings[BuildingType.CrystalStorage] || 0)
  const deuteriumCapacity = 10000 * Math.pow(2, planet.buildings[BuildingType.DeuteriumTank] || 0)
  const darkMatterCapacity = 1000 * Math.pow(2, planet.buildings[BuildingType.DarkMatterTank] || 0)

  const resourceFillRate = 0.7 + (difficultyLevel / 10) * 0.3
  planet.resources.metal = Math.floor(metalCapacity * resourceFillRate)
  planet.resources.crystal = Math.floor(crystalCapacity * resourceFillRate)
  planet.resources.deuterium = Math.floor(deuteriumCapacity * resourceFillRate)
  planet.resources.darkMatter = Math.floor(darkMatterCapacity * resourceFillRate)
}

/**
 * 基於距離的NPC成長配置
 */
export interface DistanceBasedGrowthConfig {
  resourceGrowthRate: number
  buildingGrowthSpeed: number
  techGrowthSpeed: number
  checkInterval: number
}

/**
 * 根據距離計算NPC成長配置
 */
export const calculateDistanceBasedGrowthConfig = (distance: number): DistanceBasedGrowthConfig => {
  const multipliers = calculateDistanceDifficultyMultiplier(distance)

  return {
    resourceGrowthRate: multipliers.resourceMultiplier,
    buildingGrowthSpeed: multipliers.buildingMultiplier,
    techGrowthSpeed: multipliers.techMultiplier,
    checkInterval: 180 // 3分鐘檢查一次
  }
}

/**
 * 基於距離更新NPC成長
 * 替代舊的 updateNPCGrowth 中基於玩家積分的邏輯
 */
export const updateNPCGrowthByDistance = (
  npc: NPC,
  homeworldPosition: { galaxy: number; system: number; position: number },
  deltaSeconds: number,
  gameSpeed: number = 1
): void => {
  const planet = npc.planets[0]
  if (!planet) return

  // 如果沒有距離資訊，先計算
  if (npc.distanceToHomeworld === undefined) {
    npc.distanceToHomeworld = calculateDistanceToHomeworld(planet.position, homeworldPosition)
    npc.difficultyLevel = calculateDifficultyLevel(npc.distanceToHomeworld)
  }

  const config = calculateDistanceBasedGrowthConfig(npc.distanceToHomeworld)

  // 1. 持續生成資源（應用遊戲速度倍率）
  generateNPCResourcesByDistance(npc, deltaSeconds, config, gameSpeed)

  // 2. 定期評估並調整實力
  const now = Date.now()
  const lastGrowthCheck = (npc as any).lastGrowthCheck || 0

  if (now - lastGrowthCheck >= config.checkInterval * 1000) {
    ;(npc as any).lastGrowthCheck = now

    // 計算目標實力（基於距離倍率）
    const multipliers = calculateDistanceDifficultyMultiplier(npc.distanceToHomeworld)
    const baseLevel = 5
    const targetBuildingLevel = Math.floor(baseLevel * multipliers.buildingMultiplier)
    const targetTechLevel = Math.floor(baseLevel * multipliers.techMultiplier)

    // 獲取當前平均建築等級
    let totalBuildingLevels = 0
    let buildingCount = 0
    Object.values(planet.buildings).forEach(level => {
      totalBuildingLevels += level
      buildingCount++
    })
    const avgBuildingLevel = buildingCount > 0 ? totalBuildingLevels / buildingCount : 0

    // 獲取當前平均科技等級
    const techLevels = Object.values(npc.technologies)
    const avgTechLevel = techLevels.length > 0 ? techLevels.reduce((sum, level) => sum + level, 0) / techLevels.length : 0

    // 如果實力不足，進行升級
    if (avgBuildingLevel < targetBuildingLevel) {
      autoUpgradeNPCBuildings(npc)
    }

    if (avgTechLevel < targetTechLevel) {
      autoResearchNPCTechnologies(npc)
    }

    // 計算目標艦隊戰力
    const targetFleetPower = 1000 * multipliers.fleetMultiplier
    let currentFleetPower = 0
    Object.entries(planet.fleet).forEach(([shipType, count]) => {
      const shipConfig = SHIPS[shipType as ShipType]
      const power = shipConfig.attack + shipConfig.shield + shipConfig.armor / 10
      currentFleetPower += power * (count as number)
    })

    if (currentFleetPower < targetFleetPower) {
      autoBuildNPCFleet(npc)
    }
  }
}

/**
 * 基於距離生成NPC資源
 */
export const generateNPCResourcesByDistance = (
  npc: NPC,
  deltaSeconds: number,
  config: DistanceBasedGrowthConfig,
  gameSpeed: number = 1
): void => {
  const planet = npc.planets[0]
  if (!planet) return

  // 基於建築等級計算資源產量
  const metalMineLevel = planet.buildings[BuildingType.MetalMine] || 0
  const crystalMineLevel = planet.buildings[BuildingType.CrystalMine] || 0
  const deuteriumLevel = planet.buildings[BuildingType.DeuteriumSynthesizer] || 0
  const darkMatterLevel = planet.buildings[BuildingType.DarkMatterCollector] || 0

  // 簡化的資源產量計算(每秒產量) - 提升3倍讓NPC更富有
  const metalProduction = 90 * metalMineLevel * Math.pow(1.1, metalMineLevel) * config.resourceGrowthRate
  const crystalProduction = 60 * crystalMineLevel * Math.pow(1.1, crystalMineLevel) * config.resourceGrowthRate
  const deuteriumProduction = 30 * deuteriumLevel * Math.pow(1.1, deuteriumLevel) * config.resourceGrowthRate
  const darkMatterProduction = ((75 * darkMatterLevel * Math.pow(1.5, darkMatterLevel)) / 3600) * config.resourceGrowthRate

  // 應用遊戲速度倍率到時間
  const effectiveDeltaSeconds = deltaSeconds * gameSpeed

  // 增加資源
  planet.resources.metal += metalProduction * effectiveDeltaSeconds
  planet.resources.crystal += crystalProduction * effectiveDeltaSeconds
  planet.resources.deuterium += deuteriumProduction * effectiveDeltaSeconds
  planet.resources.darkMatter += darkMatterProduction * effectiveDeltaSeconds

  // 確保不超過儲存上限
  const metalStorage = planet.buildings[BuildingType.MetalStorage] || 0
  const crystalStorage = planet.buildings[BuildingType.CrystalStorage] || 0
  const deuteriumStorage = planet.buildings[BuildingType.DeuteriumTank] || 0
  const darkMatterStorage = planet.buildings[BuildingType.DarkMatterTank] || 0

  planet.resources.metal = Math.min(planet.resources.metal, 10000 * Math.pow(2, metalStorage))
  planet.resources.crystal = Math.min(planet.resources.crystal, 10000 * Math.pow(2, crystalStorage))
  planet.resources.deuterium = Math.min(planet.resources.deuterium, 10000 * Math.pow(2, deuteriumStorage))
  planet.resources.darkMatter = Math.min(planet.resources.darkMatter, 1000 * Math.pow(2, darkMatterStorage))
}
