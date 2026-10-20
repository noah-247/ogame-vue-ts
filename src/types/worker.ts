import type { Fleet, Resources } from './game'
import { DefenseType } from './game'

/**
 * Worker 訊息型別
 */
export const WorkerMessageType = {
  // 戰鬥模擬相關
  SIMULATE_BATTLE: 'SIMULATE_BATTLE',
  CALCULATE_PLUNDER: 'CALCULATE_PLUNDER',
  CALCULATE_DEBRIS: 'CALCULATE_DEBRIS',

  // 通用響應
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
} as const

export type WorkerMessageType = (typeof WorkerMessageType)[keyof typeof WorkerMessageType]

/**
 * 戰鬥方資料
 */
export interface BattleSideData {
  ships: Partial<Fleet>
  defense?: Partial<Record<DefenseType, number>>
  weaponTech?: number
  shieldTech?: number
  armorTech?: number
}

/**
 * 戰鬥模擬結果
 */
export interface BattleSimulationResult {
  winner: 'attacker' | 'defender' | 'draw'
  rounds: number
  attackerLosses: Partial<Fleet>
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  attackerRemaining: Partial<Fleet>
  defenderRemaining: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  roundDetails: Array<{
    round: number
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
    attackerRemainingPower: number
    defenderRemainingPower: number
  }>
}

/**
 * Worker 訊息基礎介面
 */
export interface WorkerMessageBase {
  id: string
  type: WorkerMessageType
}

/**
 * Worker 請求訊息
 */
export interface WorkerRequestMessage extends WorkerMessageBase {
  payload: unknown
}

/**
 * Worker 響應訊息
 */
export interface WorkerResponseMessage extends WorkerMessageBase {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * 戰鬥模擬請求
 */
export interface SimulateBattleRequest extends WorkerRequestMessage {
  type: typeof WorkerMessageType.SIMULATE_BATTLE
  payload: {
    attacker: BattleSideData
    defender: BattleSideData
    maxRounds?: number
  }
}

/**
 * 掠奪計算請求
 */
export interface CalculatePlunderRequest extends WorkerRequestMessage {
  type: typeof WorkerMessageType.CALCULATE_PLUNDER
  payload: {
    defenderResources: Resources
    attackerFleet: Partial<Fleet>
  }
}

/**
 * 殘骸場計算請求
 */
export interface CalculateDebrisRequest extends WorkerRequestMessage {
  type: typeof WorkerMessageType.CALCULATE_DEBRIS
  payload: {
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
  }
}

/**
 * 所有 Worker 請求型別
 */
export type WorkerRequest = SimulateBattleRequest | CalculatePlunderRequest | CalculateDebrisRequest
