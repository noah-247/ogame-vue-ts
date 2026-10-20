/**
 * 戰鬥模擬 Worker
 * 在獨立執行緒中處理計算密集型的戰鬥模擬任務
 *
 * 戰鬥公式實現見 ./battleEngine.ts（OGame 原版公式）；
 * 本檔案僅保留掠奪/殘骸計算與 Worker 訊息分發，介面保持不變。
 */
import type { Fleet, Resources } from '@/types/game'
import { ShipType, DefenseType } from '@/types/game'
import { SHIPS, DEFENSES } from '@/config/gameConfig'
import type { WorkerRequestMessage, WorkerResponseMessage, BattleSideData } from '@/types/worker'
import { WorkerMessageType } from '@/types/worker'
import { simulateBattle } from './battleEngine'

/**
 * 計算掠奪的資源
 */
const calculatePlunder = (defenderResources: Resources, attackerFleet: Partial<Fleet>): Resources => {
  let totalCapacity = 0
  for (const [shipType, count] of Object.entries(attackerFleet)) {
    const config = SHIPS[shipType as ShipType]
    totalCapacity += config.cargoCapacity * count
  }

  const availableResources = {
    metal: Math.floor(defenderResources.metal * 0.5),
    crystal: Math.floor(defenderResources.crystal * 0.5),
    deuterium: Math.floor(defenderResources.deuterium * 0.5),
    darkMatter: Math.floor(defenderResources.darkMatter * 0.5),
    energy: 0
  }

  const totalAvailable =
    availableResources.metal + availableResources.crystal + availableResources.deuterium + availableResources.darkMatter

  if (totalCapacity >= totalAvailable) {
    return availableResources
  }

  const ratio = totalCapacity / totalAvailable
  return {
    metal: Math.floor(availableResources.metal * ratio),
    crystal: Math.floor(availableResources.crystal * ratio),
    deuterium: Math.floor(availableResources.deuterium * ratio),
    darkMatter: Math.floor(availableResources.darkMatter * ratio),
    energy: 0
  }
}

/**
 * 計算殘骸場
 */
const calculateDebrisField = (
  attackerLosses: Partial<Fleet>,
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
): Resources => {
  let totalMetal = 0
  let totalCrystal = 0

  for (const [shipType, count] of Object.entries(attackerLosses)) {
    const config = SHIPS[shipType as ShipType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  for (const [shipType, count] of Object.entries(defenderLosses.fleet)) {
    const config = SHIPS[shipType as ShipType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  for (const [defenseType, count] of Object.entries(defenderLosses.defense)) {
    const config = DEFENSES[defenseType as DefenseType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  return {
    metal: Math.floor(totalMetal),
    crystal: Math.floor(totalCrystal),
    deuterium: 0,
    darkMatter: 0,
    energy: 0
  }
}

// ============================================================================
// Worker 訊息處理
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const { id, type, payload } = event.data

  try {
    let result: unknown

    switch (type) {
      case WorkerMessageType.SIMULATE_BATTLE: {
        const {
          attacker,
          defender,
          maxRounds = 6
        } = payload as {
          attacker: BattleSideData
          defender: BattleSideData
          maxRounds?: number
        }
        result = simulateBattle(attacker, defender, maxRounds)
        break
      }

      case WorkerMessageType.CALCULATE_PLUNDER: {
        const { defenderResources, attackerFleet } = payload as {
          defenderResources: Resources
          attackerFleet: Partial<Fleet>
        }
        result = calculatePlunder(defenderResources, attackerFleet)
        break
      }

      case WorkerMessageType.CALCULATE_DEBRIS: {
        const { attackerLosses, defenderLosses } = payload as {
          attackerLosses: Partial<Fleet>
          defenderLosses: {
            fleet: Partial<Fleet>
            defense: Partial<Record<DefenseType, number>>
          }
        }
        result = calculateDebrisField(attackerLosses, defenderLosses)
        break
      }

      default:
        throw new Error(`Unknown message type: ${type}`)
    }

    // 傳送成功響應
    const response: WorkerResponseMessage = {
      id,
      type: WorkerMessageType.SUCCESS,
      success: true,
      data: result
    }
    self.postMessage(response)
  } catch (error) {
    // 傳送錯誤響應
    const response: WorkerResponseMessage = {
      id,
      type: WorkerMessageType.ERROR,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
    self.postMessage(response)
  }
}
