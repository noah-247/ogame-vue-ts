import type { Planet, Resources, Officer } from '@/types/game'
import { BuildingType, OfficerType } from '@/types/game'
import * as officerLogic from './officerLogic'
import { OFFICERS } from '@/config/gameConfig'
import * as oreDepositLogic from './oreDepositLogic'
import * as planetLogic from './planetLogic'

/**
 * 計算資源研究科技加成
 * @param mineralResearchLevel 礦物研究等級（每級+2%金屬產量）
 * @param crystalResearchLevel 晶體研究等級（每級+2%晶體產量）
 * @param fuelResearchLevel 燃料研究等級（每級+2%重氫產量）
 */
export const calculateResearchProductionBonus = (
  mineralResearchLevel: number = 0,
  crystalResearchLevel: number = 0,
  fuelResearchLevel: number = 0
): { metalBonus: number; crystalBonus: number; deuteriumBonus: number } => {
  return {
    metalBonus: mineralResearchLevel * 2, // 每級2%
    crystalBonus: crystalResearchLevel * 2,
    deuteriumBonus: fuelResearchLevel * 2
  }
}

/**
 * 計算電量產出
 */
export const calculateEnergyProduction = (
  planet: Planet,
  bonuses: {
    energyProductionBonus: number
  }
): number => {
  const solarPlantLevel = planet.buildings[BuildingType.SolarPlant] || 0
  const fusionReactorLevel = planet.buildings[BuildingType.FusionReactor] || 0
  const solarSatelliteCount = planet.fleet.solarSatellite || 0
  const energyBonus = 1 + (bonuses.energyProductionBonus || 0) / 100

  // 太陽能電站每級產出：50 * 1.1^等級
  const solarPlantProduction = solarPlantLevel * 50 * Math.pow(1.1, solarPlantLevel)

  // 核聚變反應堆每級產出：150 * 1.15^等級（消耗重氫）
  const fusionReactorProduction = fusionReactorLevel * 150 * Math.pow(1.15, fusionReactorLevel)

  // 太陽能衛星產出：基於星球溫度計算
  // OGame 原版公式：(maxTemp + 160) / 6
  // 溫度越高，太陽能衛星產能越高
  const maxTemp = planet.temperature?.max ?? 0
  const solarSatelliteOutputPerUnit = planetLogic.calculateSolarSatelliteOutput(maxTemp)
  const solarSatelliteProduction = solarSatelliteCount * solarSatelliteOutputPerUnit

  return (solarPlantProduction + fusionReactorProduction + solarSatelliteProduction) * energyBonus
}

/**
 * 計算電量消耗
 */
export const calculateEnergyConsumption = (planet: Planet): number => {
  // 資源建築消耗
  const metalMineLevel = planet.buildings[BuildingType.MetalMine] || 0
  const crystalMineLevel = planet.buildings[BuildingType.CrystalMine] || 0
  const deuteriumSynthesizerLevel = planet.buildings[BuildingType.DeuteriumSynthesizer] || 0

  // 設施建築消耗
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0
  const shipyardLevel = planet.buildings[BuildingType.Shipyard] || 0
  const researchLabLevel = planet.buildings[BuildingType.ResearchLab] || 0
  const missileSiloLevel = planet.buildings[BuildingType.MissileSilo] || 0
  const terraformerLevel = planet.buildings[BuildingType.Terraformer] || 0
  const darkMatterCollectorLevel = planet.buildings[BuildingType.DarkMatterCollector] || 0

  // 月球建築消耗
  const sensorPhalanxLevel = planet.buildings[BuildingType.SensorPhalanx] || 0
  const jumpGateLevel = planet.buildings[BuildingType.JumpGate] || 0

  // 礦場每級消耗：10 * 1.1^等級
  const metalConsumption = metalMineLevel * 10 * Math.pow(1.1, metalMineLevel)
  const crystalConsumption = crystalMineLevel * 10 * Math.pow(1.1, crystalMineLevel)
  const deuteriumConsumption = deuteriumSynthesizerLevel * 15 * Math.pow(1.1, deuteriumSynthesizerLevel)

  // 設施建築消耗
  const roboticsConsumption = roboticsFactoryLevel * 5 * Math.pow(1.1, roboticsFactoryLevel)
  const naniteConsumption = naniteFactoryLevel * 20 * Math.pow(1.15, naniteFactoryLevel)
  const shipyardConsumption = shipyardLevel * 8 * Math.pow(1.1, shipyardLevel)
  const researchLabConsumption = researchLabLevel * 12 * Math.pow(1.1, researchLabLevel)
  const missileSiloConsumption = missileSiloLevel * 8 * Math.pow(1.1, missileSiloLevel)
  const terraformerConsumption = terraformerLevel * 25 * Math.pow(1.15, terraformerLevel)
  const darkMatterCollectorConsumption = darkMatterCollectorLevel * 10 * Math.pow(1.1, darkMatterCollectorLevel)

  // 月球建築消耗
  const sensorPhalanxConsumption = sensorPhalanxLevel * 15 * Math.pow(1.12, sensorPhalanxLevel)
  const jumpGateConsumption = jumpGateLevel * 50 * Math.pow(1.2, jumpGateLevel)

  return (
    metalConsumption +
    crystalConsumption +
    deuteriumConsumption +
    roboticsConsumption +
    naniteConsumption +
    shipyardConsumption +
    researchLabConsumption +
    missileSiloConsumption +
    terraformerConsumption +
    darkMatterCollectorConsumption +
    sensorPhalanxConsumption +
    jumpGateConsumption
  )
}

/**
 * 計算資源產量（每小時）
 * @param planet 星球
 * @param bonuses 軍官等加成
 * @param techBonuses 科技加成（可選，礦物研究/晶體研究/燃料研究）
 */
export const calculateResourceProduction = (
  planet: Planet,
  bonuses: {
    resourceProductionBonus: number
    darkMatterProductionBonus: number
    energyProductionBonus: number
  },
  techBonuses?: {
    mineralResearchLevel?: number
    crystalResearchLevel?: number
    fuelResearchLevel?: number
  }
): Resources => {
  const metalMineLevel = planet.buildings[BuildingType.MetalMine] || 0
  const crystalMineLevel = planet.buildings[BuildingType.CrystalMine] || 0
  const deuteriumSynthesizerLevel = planet.buildings[BuildingType.DeuteriumSynthesizer] || 0
  const darkMatterCollectorLevel = planet.buildings[BuildingType.DarkMatterCollector] || 0

  const resourceBonus = 1 + (bonuses.resourceProductionBonus || 0) / 100
  const darkMatterBonus = 1 + (bonuses.darkMatterProductionBonus || 0) / 100

  // 計算科技加成
  const researchBonus = calculateResearchProductionBonus(
    techBonuses?.mineralResearchLevel || 0,
    techBonuses?.crystalResearchLevel || 0,
    techBonuses?.fuelResearchLevel || 0
  )
  const metalTechBonus = 1 + researchBonus.metalBonus / 100
  const crystalTechBonus = 1 + researchBonus.crystalBonus / 100
  const deuteriumTechBonus = 1 + researchBonus.deuteriumBonus / 100

  // 計算能量產出（每小時）
  const energyProduction = calculateEnergyProduction(planet, { energyProductionBonus: bonuses.energyProductionBonus })

  // 計算能量消耗（每小時）
  const energyConsumption = calculateEnergyConsumption(planet)

  // 檢查能量平衡是否充足
  // 如果能量產出 >= 能量消耗，礦場正常生產
  // 這樣即使瀏覽器關閉後再開啟，只要能量平衡是正的，就能正常生產
  const hasPositiveEnergyBalance = energyProduction >= energyConsumption
  const productionEfficiency = hasPositiveEnergyBalance ? 1 : 0

  // 計算礦脈儲量效率（當儲量接近耗盡時產量下降）
  const metalDepositEfficiency = oreDepositLogic.calculateDepositEfficiency(planet.oreDeposits, 'metal')
  const crystalDepositEfficiency = oreDepositLogic.calculateDepositEfficiency(planet.oreDeposits, 'crystal')
  const deuteriumDepositEfficiency = oreDepositLogic.calculateDepositEfficiency(planet.oreDeposits, 'deuterium')

  // 重氫溫度加成：溫度越低，產量越高
  const deuteriumTempBonus = planetLogic.calculateDeuteriumTemperatureBonus(planet.temperature?.max ?? 0)

  return {
    metal:
      metalMineLevel *
      1500 *
      Math.pow(1.5, metalMineLevel) *
      resourceBonus *
      metalTechBonus *
      productionEfficiency *
      metalDepositEfficiency,
    crystal:
      crystalMineLevel *
      1000 *
      Math.pow(1.5, crystalMineLevel) *
      resourceBonus *
      crystalTechBonus *
      productionEfficiency *
      crystalDepositEfficiency,
    deuterium:
      deuteriumSynthesizerLevel *
      500 *
      Math.pow(1.5, deuteriumSynthesizerLevel) *
      resourceBonus *
      deuteriumTechBonus *
      productionEfficiency *
      deuteriumDepositEfficiency *
      deuteriumTempBonus,
    darkMatter: darkMatterCollectorLevel * 100 * Math.pow(1.5, darkMatterCollectorLevel) * darkMatterBonus,
    energy: energyProduction
  }
}

/**
 * 計算資源容量
 */
export const calculateResourceCapacity = (planet: Planet, storageCapacityBonus: number): Resources => {
  const metalStorageLevel = planet.buildings[BuildingType.MetalStorage] || 0
  const crystalStorageLevel = planet.buildings[BuildingType.CrystalStorage] || 0
  const deuteriumTankLevel = planet.buildings[BuildingType.DeuteriumTank] || 0
  const darkMatterTankLevel = planet.buildings[BuildingType.DarkMatterTank] || 0
  const solarPlantLevel = planet.buildings[BuildingType.SolarPlant] || 0

  const bonus = 1 + (storageCapacityBonus || 0) / 100

  // OGame規則：基礎容量10000，資源可以超過容量（隻影響生產，不會丟失）
  // 月球沒有礦場，所以超過容量沒有影響，玩家可以從行星運輸資源到月球
  const baseCapacity = 10000
  const darkMatterBaseCapacity = 1000 // 暗物質基礎容量較小
  return {
    metal: baseCapacity * Math.pow(2, metalStorageLevel) * bonus,
    crystal: baseCapacity * Math.pow(2, crystalStorageLevel) * bonus,
    deuterium: baseCapacity * Math.pow(2, deuteriumTankLevel) * bonus,
    darkMatter: darkMatterBaseCapacity * Math.pow(2, darkMatterTankLevel) * bonus,
    energy: 1000 + solarPlantLevel * 500 // 能量容量基於太陽能電站等級
  }
}

/**
 * 更新星球資源
 */
export const updatePlanetResources = (
  planet: Planet,
  now: number,
  bonuses: {
    resourceProductionBonus: number
    darkMatterProductionBonus: number
    energyProductionBonus: number
    storageCapacityBonus: number
  },
  gameSpeed: number = 1,
  miningTechLevel: number = 0,
  techBonuses?: {
    mineralResearchLevel?: number
    crystalResearchLevel?: number
    fuelResearchLevel?: number
  }
): void => {
  const timeDiff = (now - planet.lastUpdate) / 1000 // 轉換為秒

  // 時間回撥保護：如果時間差為負或為零，跳過資源更新但重置時間戳
  if (timeDiff <= 0) {
    planet.lastUpdate = now
    return
  }

  // 應用遊戲速度到時間差（遊戲速度影響資源產出速率）
  const effectiveTimeDiff = timeDiff * gameSpeed

  // 計算能量消耗（每小時）
  const energyConsumption = calculateEnergyConsumption(planet)

  // 先增加能量產出
  const energyProduction = calculateEnergyProduction(planet, { energyProductionBonus: bonuses.energyProductionBonus })
  planet.resources.energy += (energyProduction * effectiveTimeDiff) / 3600

  // 限制能量上限
  const capacity = calculateResourceCapacity(planet, bonuses.storageCapacityBonus)
  planet.resources.energy = Math.min(planet.resources.energy, capacity.energy)

  // 扣除能量消耗
  planet.resources.energy -= (energyConsumption * effectiveTimeDiff) / 3600

  // 能量不能為負數，最低為0
  planet.resources.energy = Math.max(0, planet.resources.energy)

  // 計算資源產量（會檢查能量是否充足，以及礦脈儲量效率）
  const production = calculateResourceProduction(
    planet,
    {
      resourceProductionBonus: bonuses.resourceProductionBonus,
      darkMatterProductionBonus: bonuses.darkMatterProductionBonus,
      energyProductionBonus: bonuses.energyProductionBonus
    },
    techBonuses
  )

  // 計算實際產出量（用於消耗礦脈儲量）
  const metalProduced = (production.metal * effectiveTimeDiff) / 3600
  const crystalProduced = (production.crystal * effectiveTimeDiff) / 3600
  const deuteriumProduced = (production.deuterium * effectiveTimeDiff) / 3600

  // 消耗礦脈儲量（如果有）
  if (planet.oreDeposits && !planet.isMoon) {
    oreDepositLogic.consumeDeposit(planet.oreDeposits, 'metal', metalProduced)
    oreDepositLogic.consumeDeposit(planet.oreDeposits, 'crystal', crystalProduced)
    oreDepositLogic.consumeDeposit(planet.oreDeposits, 'deuterium', deuteriumProduced)

    // 礦脈緩慢恢復（每次更新時恢復一小部分）
    // 地質研究站等級影響恢復速度，深層鑽探設施和採礦技術影響恢復上限
    const hoursElapsed = effectiveTimeDiff / 3600
    const geoStationLevel = planet.buildings[BuildingType.GeoResearchStation] || 0
    const deepDrillingLevel = planet.buildings[BuildingType.DeepDrillingFacility] || 0
    oreDepositLogic.regenerateDeposits(planet.oreDeposits, hoursElapsed, geoStationLevel, deepDrillingLevel, miningTechLevel)
  }

  // 更新資源（轉換為每秒產量，應用遊戲速度）
  planet.resources.metal += metalProduced
  planet.resources.crystal += crystalProduced
  planet.resources.deuterium += deuteriumProduced
  planet.resources.darkMatter += (production.darkMatter * effectiveTimeDiff) / 3600

  // 限制資源上限
  planet.resources.metal = Math.min(planet.resources.metal, capacity.metal)
  planet.resources.crystal = Math.min(planet.resources.crystal, capacity.crystal)
  planet.resources.deuterium = Math.min(planet.resources.deuterium, capacity.deuterium)
  planet.resources.darkMatter = Math.min(planet.resources.darkMatter, capacity.darkMatter)

  planet.lastUpdate = now
}

/**
 * 檢查資源是否足夠
 */
export const checkResourcesAvailable = (currentResources: Resources, cost: Resources): boolean => {
  return (
    currentResources.metal >= cost.metal &&
    currentResources.crystal >= cost.crystal &&
    currentResources.deuterium >= cost.deuterium &&
    currentResources.darkMatter >= cost.darkMatter
  )
}

/**
 * 扣除資源
 */
export const deductResources = (currentResources: Resources, cost: Partial<Resources>): void => {
  currentResources.metal -= cost.metal || 0
  currentResources.crystal -= cost.crystal || 0
  currentResources.deuterium -= cost.deuterium || 0
  currentResources.darkMatter -= cost.darkMatter || 0
}

/**
 * 新增資源
 */
export const addResources = (currentResources: Resources, amount: Partial<Resources>): void => {
  currentResources.metal += amount.metal || 0
  currentResources.crystal += amount.crystal || 0
  currentResources.deuterium += amount.deuterium || 0
  currentResources.darkMatter += amount.darkMatter || 0
}

/**
 * 安全地新增資源（會檢查倉儲容量上限）
 * @param planet 星球物件
 * @param amount 要新增的資源
 * @param storageCapacityBonus 倉儲容量加成
 * @returns 實際新增的資源數量和溢位的資源數量
 */
export const addResourcesSafely = (
  planet: Planet,
  amount: Resources,
  storageCapacityBonus: number
): { added: Resources; overflow: Resources } => {
  const capacity = calculateResourceCapacity(planet, storageCapacityBonus)

  const added: Resources = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }
  const overflow: Resources = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }

  // 處理每種資源
  const resources: Array<keyof Resources> = ['metal', 'crystal', 'deuterium', 'darkMatter']

  for (const resourceType of resources) {
    const currentAmount = planet.resources[resourceType]
    const amountToAdd = amount[resourceType]
    const maxCapacity = capacity[resourceType]

    // 計算可以新增的量（不超過容量上限）
    const spaceAvailable = Math.max(0, maxCapacity - currentAmount)
    const actuallyAdded = Math.min(amountToAdd, spaceAvailable)
    const overflowed = amountToAdd - actuallyAdded

    planet.resources[resourceType] += actuallyAdded
    added[resourceType] = actuallyAdded
    overflow[resourceType] = overflowed
  }

  return { added, overflow }
}

/**
 * 資源產量詳細資訊（用於UI展示）
 */
export interface ProductionBreakdown {
  metal: ProductionDetail
  crystal: ProductionDetail
  deuterium: ProductionDetail
  darkMatter: ProductionDetail
  energy: ProductionDetail
}

export interface ProductionDetail {
  baseProduction: number // 建築基礎產量
  buildingLevel: number // 建築等級
  buildingName: string // 建築名稱（用於顯示）
  bonuses: ProductionBonus[] // 加成列表
  finalProduction: number // 最終產量
  sources?: ProductionSource[] // 多個產量來源（用於能量）
}

export interface ProductionSource {
  name: string // 來源名稱
  level: number // 等級或數量
  production: number // 產量
}

export interface ProductionBonus {
  name: string // 加成名稱
  percentage: number // 加成百分比
  value: number // 實際增加的產量
  source: 'technology' | 'officer' | 'other' // 加成來源型別
}

/**
 * 能量消耗詳細資訊
 */
export interface ConsumptionBreakdown {
  // 資源建築
  metalMine: ConsumptionDetail
  crystalMine: ConsumptionDetail
  deuteriumSynthesizer: ConsumptionDetail
  // 設施建築
  roboticsFactory: ConsumptionDetail
  naniteFactory: ConsumptionDetail
  shipyard: ConsumptionDetail
  researchLab: ConsumptionDetail
  missileSilo: ConsumptionDetail
  terraformer: ConsumptionDetail
  darkMatterCollector: ConsumptionDetail
  // 月球建築
  sensorPhalanx: ConsumptionDetail
  jumpGate: ConsumptionDetail
  total: number
}

export interface ConsumptionDetail {
  buildingLevel: number
  buildingName: string
  consumption: number
}

/**
 * 計算資源產量詳細breakdown
 * @param planet 星球
 * @param officers 軍官
 * @param currentTime 當前時間
 * @param resourceSpeed 遊戲速度
 * @param techBonuses 科技加成（可選，礦物研究/晶體研究/燃料研究）
 */
export const calculateProductionBreakdown = (
  planet: Planet,
  officers: Record<OfficerType, Officer>,
  currentTime: number,
  resourceSpeed: number = 1,
  techBonuses?: {
    mineralResearchLevel?: number
    crystalResearchLevel?: number
    fuelResearchLevel?: number
  }
): ProductionBreakdown => {
  const metalMineLevel = planet.buildings[BuildingType.MetalMine] || 0
  const crystalMineLevel = planet.buildings[BuildingType.CrystalMine] || 0
  const deuteriumSynthesizerLevel = planet.buildings[BuildingType.DeuteriumSynthesizer] || 0
  const darkMatterCollectorLevel = planet.buildings[BuildingType.DarkMatterCollector] || 0
  const solarPlantLevel = planet.buildings[BuildingType.SolarPlant] || 0

  // 計算能量平衡（基於產出vs消耗，而不是當前能量值）
  const energyProduction = calculateEnergyProduction(planet, { energyProductionBonus: 0 })
  const energyConsumption = calculateEnergyConsumption(planet)
  const hasPositiveEnergyBalance = energyProduction >= energyConsumption
  const productionEfficiency = hasPositiveEnergyBalance ? 1 : 0

  // 收集每個軍官的加成資訊
  const activeOfficerBonuses: Array<{
    type: OfficerType
    name: string
    resourceBonus: number
    darkMatterBonus: number
    energyBonus: number
  }> = []

  Object.values(officers).forEach(officer => {
    if (officerLogic.isOfficerActive(officer, currentTime)) {
      const config = OFFICERS[officer.type]
      activeOfficerBonuses.push({
        type: officer.type,
        name: config.name,
        resourceBonus: config.benefits.resourceProductionBonus || 0,
        darkMatterBonus: config.benefits.darkMatterProductionBonus || 0,
        energyBonus: config.benefits.energyProductionBonus || 0
      })
    }
  })

  // 計算總加成
  const totalResourceBonus = activeOfficerBonuses.reduce((sum, officer) => sum + officer.resourceBonus, 0)
  const totalDarkMatterBonus = activeOfficerBonuses.reduce((sum, officer) => sum + officer.darkMatterBonus, 0)
  const totalEnergyBonus = activeOfficerBonuses.reduce((sum, officer) => sum + officer.energyBonus, 0)

  // 計算科技加成
  const researchBonus = calculateResearchProductionBonus(
    techBonuses?.mineralResearchLevel || 0,
    techBonuses?.crystalResearchLevel || 0,
    techBonuses?.fuelResearchLevel || 0
  )

  // 金屬礦產量
  const metalBase = metalMineLevel * 1500 * Math.pow(1.5, metalMineLevel)
  const metalBonuses: ProductionBonus[] = []

  // 為每個啟用的軍官新增加成項
  activeOfficerBonuses.forEach(officer => {
    if (officer.resourceBonus > 0) {
      const bonusValue = metalBase * (officer.resourceBonus / 100)
      metalBonuses.push({
        name: `officers.${officer.type}`,
        percentage: officer.resourceBonus,
        value: bonusValue,
        source: 'officer'
      })
    }
  })

  // 新增礦物研究科技加成
  if (researchBonus.metalBonus > 0) {
    const techBonusValue = metalBase * (1 + totalResourceBonus / 100) * (researchBonus.metalBonus / 100)
    metalBonuses.push({
      name: 'research.mineralResearch',
      percentage: researchBonus.metalBonus,
      value: techBonusValue,
      source: 'technology'
    })
  }

  if (!hasPositiveEnergyBalance) {
    metalBonuses.push({
      name: 'resources.noEnergy',
      percentage: -100,
      value: -metalBase * (1 + totalResourceBonus / 100) * (1 + researchBonus.metalBonus / 100),
      source: 'other'
    })
  }

  const metalFinal = metalBase * (1 + totalResourceBonus / 100) * (1 + researchBonus.metalBonus / 100) * productionEfficiency

  // 晶體礦產量
  const crystalBase = crystalMineLevel * 1000 * Math.pow(1.5, crystalMineLevel)
  const crystalBonuses: ProductionBonus[] = []

  activeOfficerBonuses.forEach(officer => {
    if (officer.resourceBonus > 0) {
      const bonusValue = crystalBase * (officer.resourceBonus / 100)
      crystalBonuses.push({
        name: `officers.${officer.type}`,
        percentage: officer.resourceBonus,
        value: bonusValue,
        source: 'officer'
      })
    }
  })

  // 新增晶體研究科技加成
  if (researchBonus.crystalBonus > 0) {
    const techBonusValue = crystalBase * (1 + totalResourceBonus / 100) * (researchBonus.crystalBonus / 100)
    crystalBonuses.push({
      name: 'research.crystalResearch',
      percentage: researchBonus.crystalBonus,
      value: techBonusValue,
      source: 'technology'
    })
  }

  if (!hasPositiveEnergyBalance) {
    crystalBonuses.push({
      name: 'resources.noEnergy',
      percentage: -100,
      value: -crystalBase * (1 + totalResourceBonus / 100) * (1 + researchBonus.crystalBonus / 100),
      source: 'other'
    })
  }

  const crystalFinal = crystalBase * (1 + totalResourceBonus / 100) * (1 + researchBonus.crystalBonus / 100) * productionEfficiency

  // 重氫合成器產量（受溫度影響）
  // OGame 原版規則：溫度越低，重氫產量越高
  const deuteriumTempBonus = planetLogic.calculateDeuteriumTemperatureBonus(planet.temperature?.max ?? 0)
  const deuteriumBase = deuteriumSynthesizerLevel * 500 * Math.pow(1.5, deuteriumSynthesizerLevel) * deuteriumTempBonus
  const deuteriumBonuses: ProductionBonus[] = []

  // 溫度加成顯示
  if (planet.temperature) {
    const tempBonusPercent = Math.round((deuteriumTempBonus - 1) * 100)
    if (tempBonusPercent !== 0) {
      deuteriumBonuses.push({
        name: 'resources.temperatureBonus',
        percentage: tempBonusPercent,
        value: 0, // 已計入基礎產量
        source: 'other'
      })
    }
  }

  activeOfficerBonuses.forEach(officer => {
    if (officer.resourceBonus > 0) {
      const bonusValue = deuteriumBase * (officer.resourceBonus / 100)
      deuteriumBonuses.push({
        name: `officers.${officer.type}`,
        percentage: officer.resourceBonus,
        value: bonusValue,
        source: 'officer'
      })
    }
  })

  // 新增燃料研究科技加成
  if (researchBonus.deuteriumBonus > 0) {
    const techBonusValue = deuteriumBase * (1 + totalResourceBonus / 100) * (researchBonus.deuteriumBonus / 100)
    deuteriumBonuses.push({
      name: 'research.fuelResearch',
      percentage: researchBonus.deuteriumBonus,
      value: techBonusValue,
      source: 'technology'
    })
  }

  if (!hasPositiveEnergyBalance) {
    deuteriumBonuses.push({
      name: 'resources.noEnergy',
      percentage: -100,
      value: -deuteriumBase * (1 + totalResourceBonus / 100) * (1 + researchBonus.deuteriumBonus / 100),
      source: 'other'
    })
  }

  const deuteriumFinal = deuteriumBase * (1 + totalResourceBonus / 100) * (1 + researchBonus.deuteriumBonus / 100) * productionEfficiency

  // 暗物質收集器產量
  const darkMatterBase = darkMatterCollectorLevel * 25 * Math.pow(1.5, darkMatterCollectorLevel)
  const darkMatterBonuses: ProductionBonus[] = []

  activeOfficerBonuses.forEach(officer => {
    if (officer.darkMatterBonus > 0) {
      const bonusValue = darkMatterBase * (officer.darkMatterBonus / 100)
      darkMatterBonuses.push({
        name: `officers.${officer.type}`,
        percentage: officer.darkMatterBonus,
        value: bonusValue,
        source: 'officer'
      })
    }
  })

  const darkMatterFinal = darkMatterBase * (1 + totalDarkMatterBonus / 100)

  // 能量產量（包含多個來源）
  const fusionReactorLevel = planet.buildings[BuildingType.FusionReactor] || 0
  const solarSatelliteCount = planet.fleet.solarSatellite || 0

  const solarPlantProduction = solarPlantLevel * 50 * Math.pow(1.1, solarPlantLevel)
  const fusionReactorProduction = fusionReactorLevel * 150 * Math.pow(1.15, fusionReactorLevel)

  // 太陽能衛星產出：基於星球溫度計算
  const maxTemp = planet.temperature?.max ?? 0
  const solarSatelliteOutputPerUnit = planetLogic.calculateSolarSatelliteOutput(maxTemp)
  const solarSatelliteProduction = solarSatelliteCount * solarSatelliteOutputPerUnit

  const energyBase = solarPlantProduction + fusionReactorProduction + solarSatelliteProduction

  const energySources: ProductionSource[] = []
  if (solarPlantLevel > 0) {
    energySources.push({
      name: 'buildings.solarPlant',
      level: solarPlantLevel,
      production: solarPlantProduction
    })
  }
  if (fusionReactorLevel > 0) {
    energySources.push({
      name: 'buildings.fusionReactor',
      level: fusionReactorLevel,
      production: fusionReactorProduction
    })
  }
  if (solarSatelliteCount > 0) {
    energySources.push({
      name: 'ships.solarSatellite',
      level: solarSatelliteCount,
      production: solarSatelliteProduction
    })
  }

  const energyBonuses: ProductionBonus[] = []
  activeOfficerBonuses.forEach(officer => {
    if (officer.energyBonus > 0) {
      const bonusValue = energyBase * (officer.energyBonus / 100)
      energyBonuses.push({
        name: `officers.${officer.type}`,
        percentage: officer.energyBonus,
        value: bonusValue,
        source: 'officer'
      })
    }
  })

  const energyFinal = energyBase * (1 + totalEnergyBonus / 100)

  const speed = resourceSpeed

  const scaleBonuses = (bonuses: ProductionBonus[]) =>
    bonuses.map(bonus => ({
      ...bonus,
      value: bonus.value * speed
    }))

  const scaleSources = (sources?: ProductionSource[]) =>
    sources?.map(source => ({
      ...source,
      production: source.production * speed
    }))

  return {
    metal: {
      baseProduction: metalBase * speed,
      buildingLevel: metalMineLevel,
      buildingName: 'buildings.metalMine',
      bonuses: scaleBonuses(metalBonuses),
      finalProduction: metalFinal * speed
    },
    crystal: {
      baseProduction: crystalBase * speed,
      buildingLevel: crystalMineLevel,
      buildingName: 'buildings.crystalMine',
      bonuses: scaleBonuses(crystalBonuses),
      finalProduction: crystalFinal * speed
    },
    deuterium: {
      baseProduction: deuteriumBase * speed,
      buildingLevel: deuteriumSynthesizerLevel,
      buildingName: 'buildings.deuteriumSynthesizer',
      bonuses: scaleBonuses(deuteriumBonuses),
      finalProduction: deuteriumFinal * speed
    },
    darkMatter: {
      baseProduction: darkMatterBase * speed,
      buildingLevel: darkMatterCollectorLevel,
      buildingName: 'buildings.darkMatterCollector',
      bonuses: scaleBonuses(darkMatterBonuses),
      finalProduction: darkMatterFinal * speed
    },
    energy: {
      baseProduction: energyBase * speed,
      buildingLevel: solarPlantLevel,
      buildingName: 'buildings.solarPlant',
      bonuses: scaleBonuses(energyBonuses),
      finalProduction: energyFinal * speed,
      sources: scaleSources(energySources)
    }
  }
}

/**
 * 計算能量消耗詳細breakdown
 */
export const calculateConsumptionBreakdown = (planet: Planet, resourceSpeed: number = 1): ConsumptionBreakdown => {
  // 資源建築
  const metalMineLevel = planet.buildings[BuildingType.MetalMine] || 0
  const crystalMineLevel = planet.buildings[BuildingType.CrystalMine] || 0
  const deuteriumSynthesizerLevel = planet.buildings[BuildingType.DeuteriumSynthesizer] || 0

  // 設施建築
  const roboticsFactoryLevel = planet.buildings[BuildingType.RoboticsFactory] || 0
  const naniteFactoryLevel = planet.buildings[BuildingType.NaniteFactory] || 0
  const shipyardLevel = planet.buildings[BuildingType.Shipyard] || 0
  const researchLabLevel = planet.buildings[BuildingType.ResearchLab] || 0
  const missileSiloLevel = planet.buildings[BuildingType.MissileSilo] || 0
  const terraformerLevel = planet.buildings[BuildingType.Terraformer] || 0
  const darkMatterCollectorLevel = planet.buildings[BuildingType.DarkMatterCollector] || 0

  // 月球建築
  const sensorPhalanxLevel = planet.buildings[BuildingType.SensorPhalanx] || 0
  const jumpGateLevel = planet.buildings[BuildingType.JumpGate] || 0

  // 資源建築消耗
  const metalConsumption = metalMineLevel * 10 * Math.pow(1.1, metalMineLevel)
  const crystalConsumption = crystalMineLevel * 10 * Math.pow(1.1, crystalMineLevel)
  const deuteriumConsumption = deuteriumSynthesizerLevel * 15 * Math.pow(1.1, deuteriumSynthesizerLevel)

  // 設施建築消耗
  const roboticsConsumption = roboticsFactoryLevel * 5 * Math.pow(1.1, roboticsFactoryLevel)
  const naniteConsumption = naniteFactoryLevel * 20 * Math.pow(1.15, naniteFactoryLevel)
  const shipyardConsumption = shipyardLevel * 8 * Math.pow(1.1, shipyardLevel)
  const researchLabConsumption = researchLabLevel * 12 * Math.pow(1.1, researchLabLevel)
  const missileSiloConsumption = missileSiloLevel * 8 * Math.pow(1.1, missileSiloLevel)
  const terraformerConsumption = terraformerLevel * 25 * Math.pow(1.15, terraformerLevel)
  const darkMatterCollectorConsumption = darkMatterCollectorLevel * 10 * Math.pow(1.1, darkMatterCollectorLevel)

  // 月球建築消耗
  const sensorPhalanxConsumption = sensorPhalanxLevel * 15 * Math.pow(1.12, sensorPhalanxLevel)
  const jumpGateConsumption = jumpGateLevel * 50 * Math.pow(1.2, jumpGateLevel)

  const speed = resourceSpeed

  const total =
    metalConsumption +
    crystalConsumption +
    deuteriumConsumption +
    roboticsConsumption +
    naniteConsumption +
    shipyardConsumption +
    researchLabConsumption +
    missileSiloConsumption +
    terraformerConsumption +
    darkMatterCollectorConsumption +
    sensorPhalanxConsumption +
    jumpGateConsumption

  return {
    // 資源建築
    metalMine: {
      buildingLevel: metalMineLevel,
      buildingName: 'buildings.metalMine',
      consumption: metalConsumption * speed
    },
    crystalMine: {
      buildingLevel: crystalMineLevel,
      buildingName: 'buildings.crystalMine',
      consumption: crystalConsumption * speed
    },
    deuteriumSynthesizer: {
      buildingLevel: deuteriumSynthesizerLevel,
      buildingName: 'buildings.deuteriumSynthesizer',
      consumption: deuteriumConsumption * speed
    },
    // 設施建築
    roboticsFactory: {
      buildingLevel: roboticsFactoryLevel,
      buildingName: 'buildings.roboticsFactory',
      consumption: roboticsConsumption * speed
    },
    naniteFactory: {
      buildingLevel: naniteFactoryLevel,
      buildingName: 'buildings.naniteFactory',
      consumption: naniteConsumption * speed
    },
    shipyard: {
      buildingLevel: shipyardLevel,
      buildingName: 'buildings.shipyard',
      consumption: shipyardConsumption * speed
    },
    researchLab: {
      buildingLevel: researchLabLevel,
      buildingName: 'buildings.researchLab',
      consumption: researchLabConsumption * speed
    },
    missileSilo: {
      buildingLevel: missileSiloLevel,
      buildingName: 'buildings.missileSilo',
      consumption: missileSiloConsumption * speed
    },
    terraformer: {
      buildingLevel: terraformerLevel,
      buildingName: 'buildings.terraformer',
      consumption: terraformerConsumption * speed
    },
    darkMatterCollector: {
      buildingLevel: darkMatterCollectorLevel,
      buildingName: 'buildings.darkMatterCollector',
      consumption: darkMatterCollectorConsumption * speed
    },
    // 月球建築
    sensorPhalanx: {
      buildingLevel: sensorPhalanxLevel,
      buildingName: 'buildings.sensorPhalanx',
      consumption: sensorPhalanxConsumption * speed
    },
    jumpGate: {
      buildingLevel: jumpGateLevel,
      buildingName: 'buildings.jumpGate',
      consumption: jumpGateConsumption * speed
    },
    total: total * speed
  }
}
