import { getGameNow } from './gameTime'
import type { Planet, Resources } from '@/types/game'
import { ShipType, DefenseType, BuildingType } from '@/types/game'
import { MOON_CONFIG, PLANET_CONFIG, FLEET_STORAGE_CONFIG } from '@/config/gameConfig'
import { generateId } from '@/utils/id'
import * as oreDepositLogic from './oreDepositLogic'

/**
 * 建立初始星球
 */
export const createInitialPlanet = (playerId: string, planetName: string = 'Home Planet'): Planet => {
  const initialPlanet: Planet = {
    id: 'planet1',
    name: planetName,
    ownerId: playerId,
    position: { galaxy: 1, system: 1, position: 1 },
    resources: {
      metal: 500,
      crystal: 500,
      deuterium: 0,
      darkMatter: 0,
      energy: 0
    },
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

  // 初始化建築等級
  Object.values(BuildingType).forEach(building => {
    initialPlanet.buildings[building] = 0
  })

  // 初始化礦脈儲量
  initialPlanet.oreDeposits = oreDepositLogic.generateOreDeposits(initialPlanet.position)

  // 初始化溫度
  initialPlanet.temperature = generatePlanetTemperature(initialPlanet.position.position)

  return initialPlanet
}

/**
 * 建立NPC星球
 */
export const createNPCPlanet = (
  npcId: number,
  position: { galaxy: number; system: number; position: number },
  planetPrefix: string = 'Planet'
): Planet => {
  const npcPlanet: Planet = {
    id: `npc_planet_${npcId}`,
    name: `${planetPrefix} ${position.galaxy}:${position.system}:${position.position}`,
    ownerId: `npc_${npcId}`,
    position,
    resources: {
      metal: Math.floor(Math.random() * 10000) + 5000,
      crystal: Math.floor(Math.random() * 5000) + 2000,
      deuterium: Math.floor(Math.random() * 2000) + 500,
      darkMatter: Math.floor(Math.random() * 100),
      energy: 0
    },
    buildings: {} as Record<BuildingType, number>,
    fleet: {
      [ShipType.LightFighter]: Math.floor(Math.random() * 50),
      [ShipType.HeavyFighter]: Math.floor(Math.random() * 20),
      [ShipType.Cruiser]: Math.floor(Math.random() * 10),
      [ShipType.Battleship]: Math.floor(Math.random() * 5),
      [ShipType.Battlecruiser]: Math.floor(Math.random() * 3),
      [ShipType.Bomber]: Math.floor(Math.random() * 2),
      [ShipType.Destroyer]: Math.floor(Math.random() * 2),
      [ShipType.SmallCargo]: Math.floor(Math.random() * 10),
      [ShipType.LargeCargo]: Math.floor(Math.random() * 5),
      [ShipType.ColonyShip]: 0,
      [ShipType.Recycler]: 0,
      [ShipType.EspionageProbe]: 0,
      [ShipType.SolarSatellite]: Math.floor(Math.random() * 20),
      [ShipType.DarkMatterHarvester]: 0,
      [ShipType.Deathstar]: 0
    },
    defense: {
      [DefenseType.RocketLauncher]: Math.floor(Math.random() * 100),
      [DefenseType.LightLaser]: Math.floor(Math.random() * 50),
      [DefenseType.HeavyLaser]: Math.floor(Math.random() * 20),
      [DefenseType.GaussCannon]: Math.floor(Math.random() * 10),
      [DefenseType.IonCannon]: Math.floor(Math.random() * 10),
      [DefenseType.PlasmaTurret]: Math.floor(Math.random() * 5),
      [DefenseType.SmallShieldDome]: Math.random() > 0.5 ? 1 : 0,
      [DefenseType.LargeShieldDome]: Math.random() > 0.8 ? 1 : 0,
      [DefenseType.AntiBallisticMissile]: Math.floor(Math.random() * 3),
      [DefenseType.InterplanetaryMissile]: Math.floor(Math.random() * 2),
      [DefenseType.PlanetaryShield]: 0
    },
    buildQueue: [],
    waitingBuildQueue: [], // 等待佇列
    lastUpdate: getGameNow(),
    maxSpace: 200,
    maxFleetStorage: FLEET_STORAGE_CONFIG.baseStorage,
    isMoon: false
  }

  // 初始化所有建築等級為0
  // 實際的建築等級會在 initializeNPCByDistance 中根據距離難度系統設定
  // 這裡只做基礎初始化，避免隨機設定不合理的等級（如月球專屬建築）
  Object.values(BuildingType).forEach(building => {
    npcPlanet.buildings[building] = 0
  })

  // 初始化礦脈儲量
  npcPlanet.oreDeposits = oreDepositLogic.generateOreDeposits(npcPlanet.position)

  // 初始化溫度
  npcPlanet.temperature = generatePlanetTemperature(npcPlanet.position.position)

  return npcPlanet
}

/**
 * 計算月球生成機率
 */
export const calculateMoonChance = (debrisField: Resources): number => {
  const totalDebris = debrisField.metal + debrisField.crystal
  if (totalDebris < MOON_CONFIG.minDebrisField) return 0

  const chance = MOON_CONFIG.baseChance + Math.floor(totalDebris / MOON_CONFIG.chancePerDebris)
  return Math.min(chance, MOON_CONFIG.maxChance)
}

/**
 * 建立月球
 * @param parentPlanet 母星球
 * @param position 座標
 * @param playerId 玩家ID
 * @param moonSuffix 月球名稱字尾
 * @param diameter 月球直徑(km)，用於計算銷燬機率
 */
export const createMoon = (
  parentPlanet: Planet,
  position: { galaxy: number; system: number; position: number },
  playerId: string,
  moonSuffix: string = "'s Moon",
  diameter?: number
): Planet => {
  const moonId = generateId('moon')
  const moon: Planet = {
    id: moonId,
    name: `${parentPlanet.name}${moonSuffix}`,
    ownerId: playerId,
    position: { ...position },
    resources: {
      metal: 0,
      crystal: 0,
      deuterium: 0,
      darkMatter: 0,
      energy: 0
    },
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
    maxSpace: MOON_CONFIG.baseFields, // OGame規則：月球初始只有1格空間
    maxFleetStorage: FLEET_STORAGE_CONFIG.baseStorage,
    isMoon: true,
    parentPlanetId: parentPlanet.id,
    diameter: diameter || MOON_CONFIG.minDiameter // 月球直徑(km)
  }

  // 初始化建築等級
  Object.values(BuildingType).forEach(building => {
    moon.buildings[building] = 0
  })

  return moon
}

/**
 * 計算月球空間上限
 * OGame規則：月球初始1格，月球基地每級+30格
 */
export const calculateMoonMaxSpace = (moon: Planet): number => {
  if (!moon.isMoon) return 0
  const lunarBaseLevel = moon.buildings[BuildingType.LunarBase] || 0
  return MOON_CONFIG.baseFields + lunarBaseLevel * MOON_CONFIG.lunarBaseFieldsBonus
}

/**
 * 計算行星空間上限
 */
export const calculatePlanetMaxSpace = (planet: Planet, terraformingTechLevel: number): number => {
  if (planet.isMoon) return 0

  // 基礎空間
  let maxSpace = PLANET_CONFIG.baseSize

  // 地形改造器增加的空間
  const terraformerLevel = planet.buildings[BuildingType.Terraformer] || 0
  maxSpace += terraformerLevel * PLANET_CONFIG.terraformerSpaceBonus

  // 地形改造技術全域性增加空間
  maxSpace += terraformingTechLevel * PLANET_CONFIG.terraformingTechSpaceBonus

  return maxSpace
}

/**
 * 根據星球位置生成溫度範圍
 * OGame 原版規則：位置1-3靠近恆星（高溫），位置13-15遠離恆星（低溫）
 * 溫度影響太陽能衛星產能和重氫合成器產量
 *
 * 位置1: +220°C ~ +260°C (極熱)
 * 位置2: +180°C ~ +220°C
 * 位置3: +100°C ~ +140°C
 * 位置4: +60°C ~ +100°C
 * 位置5: +30°C ~ +70°C
 * 位置6: +10°C ~ +50°C
 * 位置7: -10°C ~ +30°C
 * 位置8: -30°C ~ +10°C (溫和)
 * 位置9: -50°C ~ -10°C
 * 位置10: -70°C ~ -30°C
 * 位置11: -100°C ~ -60°C
 * 位置12: -130°C ~ -90°C
 * 位置13: -160°C ~ -120°C
 * 位置14: -190°C ~ -150°C
 * 位置15: -220°C ~ -180°C (極冷)
 */
export const generatePlanetTemperature = (position: number): { min: number; max: number } => {
  // 基礎溫度曲線：位置1最熱，位置15最冷
  // 使用線性插值，從位置1的240°C到位置15的-200°C
  const baseTemp = 240 - (position - 1) * 31.4 // 每個位置降低約31.4°C

  // 溫度範圍通常在40°C左右波動
  const variation = 20
  const randomOffset = Math.floor(Math.random() * variation * 2) - variation // -20 to +20

  const maxTemp = Math.round(baseTemp + randomOffset)
  const minTemp = maxTemp - 40 // 最低溫比最高溫低40°C

  return { min: minTemp, max: maxTemp }
}

/**
 * 計算太陽能衛星基於溫度的能量產出
 * OGame 原版公式：(maxTemp + 160) / 6 (向下取整)
 * 溫度越高，太陽能衛星產能越高
 */
export const calculateSolarSatelliteOutput = (maxTemperature: number): number => {
  // 確保最小產出為0，避免極冷星球產生負能量
  return Math.max(0, Math.floor((maxTemperature + 160) / 6))
}

/**
 * 計算重氫合成器基於溫度的產量修正係數
 * OGame 原版規則：溫度越低，重氫產量越高
 * 公式：1.36 - 0.004 * maxTemp (轉換為百分比係數)
 * 在溫度-40°C時產量最高（約156%），溫度高時產量低
 */
export const calculateDeuteriumTemperatureBonus = (maxTemperature: number): number => {
  // 返回乘數，例如：-40°C時返回1.52，+100°C時返回0.96
  return 1.36 - 0.004 * maxTemperature
}

/**
 * 檢查是否可以放棄殖民地
 * @param planets 玩家所有星球
 * @param planetId 要放棄的星球ID
 * @returns 是否可以放棄及原因
 */
export const canAbandonColony = (
  planets: Planet[],
  planetId: string
): { canAbandon: boolean; reason?: string } => {
  const planet = planets.find(p => p.id === planetId)
  if (!planet) {
    return { canAbandon: false, reason: 'errors.planetNotFound' }
  }

  // 主星（第一個非月球星球）不能放棄
  const mainPlanet = planets.find(p => !p.isMoon)
  if (mainPlanet && mainPlanet.id === planetId) {
    return { canAbandon: false, reason: 'errors.cannotAbandonHomePlanet' }
  }

  // 檢查是否有正在進行的建造佇列
  if (planet.buildQueue.length > 0) {
    return { canAbandon: false, reason: 'errors.hasBuildQueue' }
  }

  // 檢查是否有艦隊在該星球
  const hasFleet = Object.values(planet.fleet).some(count => count > 0)
  if (hasFleet) {
    return { canAbandon: false, reason: 'errors.hasFleetOnPlanet' }
  }

  // 檢查是否有防禦在該星球
  const hasDefense = Object.values(planet.defense).some(count => count > 0)
  if (hasDefense) {
    return { canAbandon: false, reason: 'errors.hasDefenseOnPlanet' }
  }

  return { canAbandon: true }
}

/**
 * 放棄殖民地
 * @param planets 玩家所有星球
 * @param planetId 要放棄的星球ID
 * @returns 放棄後的星球列表
 */
export const abandonColony = (planets: Planet[], planetId: string): Planet[] => {
  const planet = planets.find(p => p.id === planetId)
  if (!planet) return planets

  // 如果放棄的是行星，同時刪除其月球
  if (!planet.isMoon) {
    return planets.filter(p => p.id !== planetId && p.parentPlanetId !== planetId)
  }

  // 如果放棄的是月球，只刪除月球
  return planets.filter(p => p.id !== planetId)
}
