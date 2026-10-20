/**
 * 艦隊倉儲邏輯模組
 * 處理艦隊倉儲容量計算和使用量統計
 */

import type { Planet, Fleet } from '@/types/game'
import { ShipType, BuildingType, TechnologyType } from '@/types/game'
import { SHIPS, FLEET_STORAGE_CONFIG, BUILDINGS, TECHNOLOGIES } from '@/config/gameConfig'

/**
 * 計算艦隊當前使用的倉儲量
 * @param fleet 艦隊物件
 * @returns 當前使用的倉儲量
 */
export const calculateFleetStorageUsage = (fleet: Fleet): number => {
  let totalUsage = 0

  for (const shipType of Object.values(ShipType)) {
    const shipCount = fleet[shipType] || 0
    const shipConfig = SHIPS[shipType]
    totalUsage += shipCount * shipConfig.storageUsage
  }

  return totalUsage
}

/**
 * 計算星球的最大艦隊倉儲容量
 * @param planet 星球物件
 * @param technologies 玩家的科技等級
 * @returns 最大艦隊倉儲容量
 */
export const calculateMaxFleetStorage = (planet: Planet, technologies: Record<TechnologyType, number>): number => {
  // 1. 基礎倉儲
  let maxStorage = FLEET_STORAGE_CONFIG.baseStorage

  // 2. 造船廠建築加成（每個星球獨立）
  const shipyardLevel = planet.buildings[BuildingType.Shipyard] || 0
  const shipyardBonus = BUILDINGS[BuildingType.Shipyard].fleetStorageBonus || 0
  maxStorage += shipyardLevel * shipyardBonus

  // 3. 機庫建築加成（每個星球獨立）
  const hangarLevel = planet.buildings[BuildingType.Hangar] || 0
  const hangarBonus = BUILDINGS[BuildingType.Hangar].fleetStorageBonus || 0
  maxStorage += hangarLevel * hangarBonus

  // 4. 計算機技術全域性加成
  const computerTechLevel = technologies[TechnologyType.ComputerTechnology] || 0
  const computerTechBonus = TECHNOLOGIES[TechnologyType.ComputerTechnology].fleetStorageBonus || 0
  maxStorage += computerTechLevel * computerTechBonus

  return maxStorage
}

/**
 * 計算建造佇列中的艦船倉儲使用量
 * @param buildQueue 建造佇列
 * @returns 佇列中艦船的倉儲使用量
 */
export const calculateQueueFleetStorageUsage = (buildQueue: Array<{ type: string; itemType: string; quantity?: number }>): number => {
  let queueUsage = 0

  for (const item of buildQueue) {
    if (item.type === 'ship') {
      const shipType = item.itemType as ShipType
      const quantity = item.quantity || 0
      const shipConfig = SHIPS[shipType]
      queueUsage += quantity * shipConfig.storageUsage
    }
  }

  return queueUsage
}

/**
 * 檢查是否有足夠的艦隊倉儲空間建造新艦船
 * @param planet 星球物件
 * @param shipType 要建造的艦船型別
 * @param quantity 要建造的數量
 * @param technologies 玩家的科技等級
 * @returns 是否有足夠的空間
 */
export const hasEnoughFleetStorage = (
  planet: Planet,
  shipType: ShipType,
  quantity: number,
  technologies: Record<TechnologyType, number>
): boolean => {
  const currentUsage = calculateFleetStorageUsage(planet.fleet)
  const queueUsage = calculateQueueFleetStorageUsage(planet.buildQueue)
  const maxStorage = calculateMaxFleetStorage(planet, technologies)
  const newShipUsage = SHIPS[shipType].storageUsage * quantity

  return currentUsage + queueUsage + newShipUsage <= maxStorage
}

/**
 * 計算當前可以建造的最大艦船數量（基於倉儲限制）
 * @param planet 星球物件
 * @param shipType 要建造的艦船型別
 * @param technologies 玩家的科技等級
 * @returns 最大可建造數量
 */
export const getMaxBuildableShips = (planet: Planet, shipType: ShipType, technologies: Record<TechnologyType, number>): number => {
  const currentUsage = calculateFleetStorageUsage(planet.fleet)
  const maxStorage = calculateMaxFleetStorage(planet, technologies)
  const availableStorage = maxStorage - currentUsage
  const shipStorageUsage = SHIPS[shipType].storageUsage

  if (shipStorageUsage === 0) return Number.MAX_SAFE_INTEGER

  // 如果當前已經超限（艦隊返回等情況），則不允許建造新艦船
  if (availableStorage <= 0) return 0

  return Math.floor(availableStorage / shipStorageUsage)
}

/**
 * 安全地新增艦船到星球（會檢查艦隊倉儲容量上限）
 * @param planet 星球物件
 * @param fleet 要新增的艦船
 * @param technologies 玩家的科技等級
 * @returns 實際新增的艦船數量和溢位的艦船數量
 */
export const addFleetSafely = (
  planet: Planet,
  fleet: Partial<Record<ShipType, number>>,
  technologies: Record<TechnologyType, number>
): { added: Partial<Record<ShipType, number>>; overflow: Partial<Record<ShipType, number>> } => {
  const maxStorage = calculateMaxFleetStorage(planet, technologies)
  let currentUsage = calculateFleetStorageUsage(planet.fleet)

  const added: Partial<Record<ShipType, number>> = {}
  const overflow: Partial<Record<ShipType, number>> = {}

  for (const [shipType, count] of Object.entries(fleet)) {
    if (count <= 0) continue

    const ship = shipType as ShipType
    const shipStorageUsage = SHIPS[ship].storageUsage

    // 計算可以新增多少艘（不超過容量上限）
    const spaceAvailable = Math.max(0, maxStorage - currentUsage)
    const maxCanAdd = shipStorageUsage > 0 ? Math.floor(spaceAvailable / shipStorageUsage) : count
    const actuallyAdded = Math.min(count, maxCanAdd)
    const overflowed = count - actuallyAdded
    if (actuallyAdded > 0) {
      planet.fleet[ship] = (planet.fleet[ship] || 0) + actuallyAdded
      added[ship] = actuallyAdded
      currentUsage += actuallyAdded * shipStorageUsage
    }

    if (overflowed > 0) {
      overflow[ship] = overflowed
    }
  }

  return { added, overflow }
}
