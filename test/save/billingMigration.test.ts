import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateSave, SAVE_VERSION } from '@/logic/saveMigration'
import {
  applyBillingConfirmation,
  canAutopilotWork,
  dismissBillingNotice,
  hasLegacyAutopilotUsage,
  shouldShowBillingConfirm,
  shouldShowBillingNotice
} from '@/logic/autopilotBilling'
import { deserializeGameSave, resetSaveLock, serializeGameSave } from '@/stores/gameSaveSerializer'
import type { Player } from '@/types/game'
import midGame from '../fixtures/mid-game.json'
import { restore, setNow } from '../utils/time'

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

const timestamp = 1792108800000
let entries: Map<string, string>

beforeEach(() => {
  resetSaveLock()
  entries = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value)
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  setNow(timestamp)
})

afterEach(() => {
  restore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** 構造一個 v2 存檔（無 autopilotContract 欄位），可選帶舊副官啟用標記 */
const mkV2Save = (withAutopilot: boolean, empireAutopilot = false): Record<string, unknown> => {
  const save = JSON.parse(JSON.stringify(midGame)) as Record<string, unknown>
  save.version = 2
  const player = save.player as Record<string, unknown> & { planets: Record<string, unknown>[] }
  delete player.autopilotContract
  if (withAutopilot) {
    const planet = player.planets[0] as Record<string, unknown>
    planet.autopilot = {
      enabled: true,
      mode: 'auto',
      paused: false,
      targets: [],
      reserve: {},
      workHourThreshold: 7200,
      resumeThreshold: 5400,
      allowPrereqAutoBuild: false,
      minFreeSpace: 0
    }
  }
  if (empireAutopilot) {
    player.empireResearchAutopilot = { enabled: true, mode: 'auto', paused: false, targets: [] }
  }
  return save
}

const migratedPlayer = (save: Record<string, unknown>): Player =>
  (migrateSave(save).player as unknown) as Player

describe('v2→v3 副官付費遷移', () => {
  it('沒有副官的存檔：補預設合約（plan free / status inactive / autoRenew false），標記 notice 旗標', () => {
    const player = migratedPlayer(mkV2Save(false))
    const c = player.autopilotContract!

    expect(migrateSave(mkV2Save(false)).version).toBe(SAVE_VERSION)
    expect(c.plan).toBe('free')
    expect(c.status).toBe('inactive')
    expect(c.autoRenew).toBe(false)
    expect(c.payerPlanetId).toBe('planet1')
    expect(c.servicePlanetIds).toEqual([])
    expect(c.needsBillingConfirm).toBe(false)
    expect(c.needsBillingNotice).toBe(true)
    expect(hasLegacyAutopilotUsage(player)).toBe(false)
  })

  it('舊存檔有用副官：needsBillingConfirm=true，且 status 保持 inactive（不自動扣款）', () => {
    const player = migratedPlayer(mkV2Save(true))
    const c = player.autopilotContract!

    expect(hasLegacyAutopilotUsage(player)).toBe(true)
    expect(c.needsBillingConfirm).toBe(true)
    expect(c.needsBillingNotice).toBe(false)
    // 不自動開始扣款：status 仍是 inactive，不是 active
    expect(c.status).toBe('inactive')
    expect(canAutopilotWork(c)).toBe(false)
    // payer 預設母星（第一顆星球），services 預設原本開過副官的星球
    expect(c.payerPlanetId).toBe('planet1')
    expect(c.servicePlanetIds).toEqual(['planet1'])
  })

  it('帝國研究副官啟用也算用過副官', () => {
    const player = migratedPlayer(mkV2Save(false, true))
    expect(hasLegacyAutopilotUsage(player)).toBe(true)
    expect(player.autopilotContract!.needsBillingConfirm).toBe(true)
  })

  it('冪等：遷移兩次結果一致', () => {
    const once = migrateSave(mkV2Save(true))
    const twice = migrateSave(once)
    expect(twice).toEqual(once)
    expect(twice.version).toBe(3)
  })

  it('已有部分合約：只補缺欄位，不覆蓋已有值', () => {
    const v2 = mkV2Save(false)
    ;(v2.player as Record<string, unknown>).autopilotContract = {
      plan: 'standard',
      status: 'paused_manual'
    }
    const c = migratedPlayer(v2).autopilotContract!

    expect(c.plan).toBe('standard')
    expect(c.status).toBe('paused_manual')
    expect(c.payerPlanetId).toBe('planet1')
    expect(c.servicePlanetIds).toEqual([])
    expect(c.autoRenew).toBe(false)
    expect(c.accruedMicroMetal).toBe(0)
    expect(c.totalConsumedMetal).toBe(0)
    expect(c.needsBillingConfirm).toBe(false)
    expect(c.needsBillingNotice).toBe(true)
  })

  it('確認門：繼續使用 → active/standard 開始計費，旗標清除', () => {
    const player = migratedPlayer(mkV2Save(true))
    expect(shouldShowBillingConfirm(player)).toBe(true)

    applyBillingConfirmation(player, 'continue')
    const c = player.autopilotContract!
    expect(c.status).toBe('active')
    expect(c.plan).toBe('standard')
    expect(canAutopilotWork(c)).toBe(true)
    expect(c.needsBillingConfirm).toBe(false)
    expect(c.needsBillingNotice).toBe(false)
    expect(shouldShowBillingConfirm(player)).toBe(false)
  })

  it('確認門：暫停副官 → paused_manual 不扣款，旗標清除', () => {
    const player = migratedPlayer(mkV2Save(true))

    applyBillingConfirmation(player, 'pause')
    const c = player.autopilotContract!
    expect(c.status).toBe('paused_manual')
    expect(canAutopilotWork(c)).toBe(false)
    expect(c.needsBillingConfirm).toBe(false)
    expect(c.needsBillingNotice).toBe(false)
  })

  it('確認門：選擇後重讀不重彈；notice 關閉後也不重彈', () => {
    const confirmed = migratedPlayer(mkV2Save(true))
    applyBillingConfirmation(confirmed, 'pause')
    expect(shouldShowBillingConfirm(confirmed)).toBe(false)
    expect(shouldShowBillingNotice(confirmed)).toBe(false)

    const noticed = migratedPlayer(mkV2Save(false))
    expect(shouldShowBillingNotice(noticed)).toBe(true)
    expect(shouldShowBillingConfirm(noticed)).toBe(false)
    dismissBillingNotice(noticed)
    expect(shouldShowBillingNotice(noticed)).toBe(false)
  })

  it('序列化往返：合約欄位（含旗標、累計值）不丟失', () => {
    const player = migratedPlayer(mkV2Save(true))
    applyBillingConfirmation(player, 'continue')
    const c = player.autopilotContract!
    c.dutySecondsAcc = 125
    c.accruedMicroMetal = 123456
    c.totalConsumedMetal = 42
    c.totalConsumedCrystal = 7
    c.totalConsumedDeuterium = 3

    const state = { ...(midGame as Record<string, unknown>), player: JSON.parse(JSON.stringify(player)) }
    const roundTripped = deserializeGameSave(serializeGameSave(state))
    expect((roundTripped.player as Player).autopilotContract).toEqual(c)
    expect(entries.size).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('遷移後的 inactive 合約不會被計費（守衛）', () => {
    const c = migratedPlayer(mkV2Save(true)).autopilotContract!
    expect(c.status).toBe('inactive')
    expect(canAutopilotWork(c)).toBe(false)
    expect(canAutopilotWork(undefined)).toBe(false)
  })
})
