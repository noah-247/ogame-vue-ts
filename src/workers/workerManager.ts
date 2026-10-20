/**
 * Worker 管理器
 * 統一管理所有 Worker 的建立、通訊和銷燬
 */
import type { WorkerRequestMessage, WorkerResponseMessage, WorkerMessageType } from '@/types/worker'
import { WorkerMessageType as MsgType } from '@/types/worker'
import { toRaw } from 'vue'
import BattleWorker from './battle.worker?worker'

/**
 * Worker 任務介面
 */
interface WorkerTask {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timeout?: ReturnType<typeof setTimeout>
}

/**
 * 將 Vue 響應式物件轉換為普通物件
 * 使用 toRaw() 獲取原始物件，避免 Proxy 無法被 structured clone
 */
const toPlainObject = <T>(obj: T): T => {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  // 使用 toRaw 獲取 Vue 響應式物件的原始值
  const raw = toRaw(obj)

  // 對於陣列，遞迴處理每個元素
  if (Array.isArray(raw)) {
    return raw.map(item => toPlainObject(item)) as unknown as T
  }

  // 對於物件，遞迴處理每個屬性
  if (raw && typeof raw === 'object') {
    const plain: any = {}
    for (const key in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        plain[key] = toPlainObject(raw[key])
      }
    }
    return plain
  }

  return raw
}

/**
 * Worker 管理類
 */
class WorkerManager {
  private battleWorker: Worker | null = null
  private pendingTasks: Map<string, WorkerTask> = new Map()
  private messageIdCounter = 0
  private readonly defaultTimeout = 10000 // 30秒超時

  /**
   * 初始化戰鬥 Worker
   */
  private initBattleWorker(): void {
    if (this.battleWorker) return

    this.battleWorker = new BattleWorker()
    this.setupWorkerHandlers(this.battleWorker, 'Battle')
  }

  /**
   * 設定 Worker 訊息處理器
   */
  private setupWorkerHandlers(worker: Worker, workerName: string): void {
    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const { id, success, data, error } = event.data

      const task = this.pendingTasks.get(id)
      if (!task) {
        console.warn(`[WorkerManager] No pending task found for message ID: ${id}`)
        return
      }

      // 清除超時定時器
      if (task.timeout) {
        clearTimeout(task.timeout)
      }

      // 移除任務
      this.pendingTasks.delete(id)

      // 處理響應
      if (success) {
        task.resolve(data)
      } else {
        task.reject(new Error(error || 'Worker task failed'))
      }
    }

    worker.onerror = (error: ErrorEvent) => {
      console.error(`[WorkerManager] ${workerName} worker error:`, error)
      // 拒絕所有待處理的任務
      for (const task of this.pendingTasks.values()) {
        if (task.timeout) clearTimeout(task.timeout)
        task.reject(new Error(`${workerName} worker crashed`))
      }
      this.pendingTasks.clear()

      // 清除對應的 worker 引用
      if (workerName === 'Battle') {
        this.battleWorker = null
      }
    }
  }

  /**
   * 生成唯一的訊息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`
  }

  /**
   * 根據訊息型別獲取對應的 Worker
   */
  private getWorkerByType(type: WorkerMessageType): Worker {
    // 戰鬥相關訊息使用 battleWorker
    if (type === MsgType.SIMULATE_BATTLE || type === MsgType.CALCULATE_PLUNDER || type === MsgType.CALCULATE_DEBRIS) {
      this.initBattleWorker()
      return this.battleWorker!
    }

    throw new Error(`Unknown message type: ${type}`)
  }

  /**
   * 傳送訊息到 Worker 並等待響應
   */
  private sendMessage<T>(type: WorkerMessageType, payload: unknown, timeout: number = this.defaultTimeout): Promise<T> {
    const worker = this.getWorkerByType(type)

    if (!worker) {
      return Promise.reject(new Error('Worker initialization failed'))
    }

    const id = this.generateMessageId()

    return new Promise<T>((resolve, reject) => {
      // 設定超時
      const timeoutId = setTimeout(() => {
        this.pendingTasks.delete(id)
        reject(new Error(`Worker task timeout after ${timeout}ms`))
      }, timeout)

      // 儲存任務
      this.pendingTasks.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout: timeoutId
      })

      // 傳送訊息（使用 toPlainObject 轉換 Vue Proxy 物件，然後使用瀏覽器內建的 structured clone）
      const message: WorkerRequestMessage = { id, type, payload: toPlainObject(payload) }
      worker.postMessage(message)
    })
  }

  /**
   * 戰鬥模擬
   */
  public async simulateBattle(params: {
    attacker: {
      ships: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['ships']
      defense?: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['defense']
      weaponTech?: number
      shieldTech?: number
      armorTech?: number
    }
    defender: {
      ships: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['ships']
      defense?: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['defense']
      weaponTech?: number
      shieldTech?: number
      armorTech?: number
    }
    maxRounds?: number
  }): Promise<ReturnType<typeof import('@/utils/battleSimulator').simulateBattle>> {
    return this.sendMessage(MsgType.SIMULATE_BATTLE, params)
  }

  /**
   * 計算掠奪資源
   */
  public async calculatePlunder(params: {
    defenderResources: Parameters<typeof import('@/utils/battleSimulator').calculatePlunder>[0]
    attackerFleet: Parameters<typeof import('@/utils/battleSimulator').calculatePlunder>[1]
  }): Promise<ReturnType<typeof import('@/utils/battleSimulator').calculatePlunder>> {
    return this.sendMessage(MsgType.CALCULATE_PLUNDER, params)
  }

  /**
   * 計算殘骸場
   */
  public async calculateDebris(params: {
    attackerLosses: Parameters<typeof import('@/utils/battleSimulator').calculateDebrisField>[0]
    defenderLosses: Parameters<typeof import('@/utils/battleSimulator').calculateDebrisField>[1]
  }): Promise<ReturnType<typeof import('@/utils/battleSimulator').calculateDebrisField>> {
    return this.sendMessage(MsgType.CALCULATE_DEBRIS, params)
  }

  /**
   * 銷燬所有 Worker
   */
  public destroy(): void {
    if (this.battleWorker) {
      this.battleWorker.terminate()
      this.battleWorker = null
    }

    // 清除所有待處理的任務
    for (const task of this.pendingTasks.values()) {
      if (task.timeout) clearTimeout(task.timeout)
      task.reject(new Error('Worker manager destroyed'))
    }
    this.pendingTasks.clear()
  }

  /**
   * 獲取待處理任務數量
   */
  public getPendingTaskCount(): number {
    return this.pendingTasks.size
  }
}

// 匯出單例
export const workerManager = new WorkerManager()
