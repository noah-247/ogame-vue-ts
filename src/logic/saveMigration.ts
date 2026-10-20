import { decryptData } from '@/utils/crypto'
import { createDefaultContract } from '@/logic/autopilotBilling'
import type { AutopilotContract } from '@/types/game'

export const SAVE_VERSION = 3
// ---- universe / npc 雙 key 版本化（M1） ----
// universe 與 npc 存檔各用獨立 key 持久化，此前無版本信封；
// 新寫入統一包 { version, data } 信封，讀取時相容無信封的 v0 舊存檔。
export const UNIVERSE_SAVE_VERSION = 1
export const NPC_SAVE_VERSION = 1

export interface SaveData extends Record<string, unknown> {
  version: number
}

export type MigrationRegistry = Record<number, (save: Record<string, unknown>) => SaveData>

export class SaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class SaveDecryptError extends SaveError {}
export class SaveVersionError extends SaveError {}
export class SaveValidationError extends SaveError {}

const isSaveObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const migrateV0ToV1 = (save: Record<string, unknown>): SaveData => ({ ...save, version: 1 })

/**
 * v1 → v2：自動成長副官（M1）。
 * - 副官配置預設即「未啟用」，舊存檔無需補欄位（引擎把缺失視為禁用）。
 * - 等待項沒有 source 標記的一律視為玩家手動（B11 交接語義），不做回填。
 * 因此遷移只需抬升版本號並做一次結構深複製，保持冪等。
 */
const migrateV1ToV2 = (save: Record<string, unknown>): SaveData => ({ ...save, version: 2 })

const BILLING_CONTRACT_STATUSES = ['inactive', 'active', 'paused_manual', 'paused_funds', 'terminated'] as const

/**
 * 手工/部分合約的欄位回填：已知欄位按型別校驗後保留，未知欄位丟棄，缺失欄位用 fallback 補預設。
 */
const fillMissingContractFields = (
  raw: Record<string, unknown>,
  fallback: AutopilotContract
): AutopilotContract => {
  const contract: AutopilotContract = { ...fallback }
  const target = contract as unknown as Record<string, unknown>
  const assign = (key: string, ok: (v: unknown) => boolean): void => {
    const v = raw[key]
    if (v !== undefined && ok(v)) target[key] = v
  }
  assign('plan', v => v === 'free' || v === 'standard')
  assign('status', v => typeof v === 'string' && (BILLING_CONTRACT_STATUSES as readonly string[]).includes(v))
  assign('payerPlanetId', v => typeof v === 'string')
  assign('servicePlanetIds', v => Array.isArray(v) && v.every(i => typeof i === 'string'))
  assign('autoRenew', v => typeof v === 'boolean')
  for (const key of [
    'accruedMicroMetal',
    'accruedMicroCrystal',
    'accruedMicroDeuterium',
    'dutySecondsAcc',
    'totalConsumedMetal',
    'totalConsumedCrystal',
    'totalConsumedDeuterium'
  ]) {
    assign(key, v => typeof v === 'number' && Number.isFinite(v))
  }
  assign('needsBillingConfirm', v => typeof v === 'boolean')
  assign('needsBillingNotice', v => typeof v === 'boolean')
  return contract
}

/**
 * v2 → v3：自動成長副官付費制（v3）。
 * - 為 Player 補 autopilotContract（預設 plan:'free'、status:'inactive'、autoRenew:false）。
 * - 舊存檔若有用副官（任一星球 autopilot.enabled 或帝國研究副官 enabled）：
 *   不自動開始扣款（status 保持 inactive），標記 needsBillingConfirm，等確認門使用者選擇。
 * - 沒用過副官的舊存檔：標記 needsBillingNotice，一次性展示新制說明。
 * - 已有（手工）合約：只補缺欄位，不覆蓋已有值。
 * 冪等：遷移只跑一次（版本號抬升），且回填邏輯對已遷移合約是穩定不動點。
 */
const migrateV2ToV3 = (save: Record<string, unknown>): SaveData => {
  const migrated: Record<string, unknown> = { ...save, version: 3 }
  if (isSaveObject(migrated.player)) {
    const player = migrated.player as Record<string, unknown>
    const planets = Array.isArray(player.planets) ? player.planets : []
    const enabledPlanetIds = planets
      .filter(
        (p): p is Record<string, unknown> =>
          isSaveObject(p) && isSaveObject(p.autopilot) && p.autopilot.enabled === true
      )
      .map(p => String(p.id ?? ''))
    const empireUsed =
      isSaveObject(player.empireResearchAutopilot) && player.empireResearchAutopilot.enabled === true
    const hadAutopilot = enabledPlanetIds.length > 0 || empireUsed
    const payerPlanetId =
      planets.length > 0 && isSaveObject(planets[0]) ? String(planets[0].id ?? '') : ''
    const fallback = createDefaultContract(payerPlanetId, enabledPlanetIds, 'free')

    let contract: AutopilotContract
    if (isSaveObject(player.autopilotContract)) {
      const raw = player.autopilotContract
      contract = fillMissingContractFields(raw, fallback)
      if (typeof raw.needsBillingConfirm !== 'boolean') contract.needsBillingConfirm = hadAutopilot
      if (typeof raw.needsBillingNotice !== 'boolean') contract.needsBillingNotice = !hadAutopilot
    } else {
      contract = { ...fallback, needsBillingConfirm: hadAutopilot, needsBillingNotice: !hadAutopilot }
    }
    migrated.player = { ...player, autopilotContract: contract }
  }
  return migrated as SaveData
}

const migrations: MigrationRegistry = {
  0: migrateV0ToV1,
  1: migrateV1ToV2,
  2: migrateV2ToV3
}

export const migrateSave = (raw: unknown, registry: MigrationRegistry = migrations, target: number = SAVE_VERSION): SaveData => {
  if (!isSaveObject(raw)) {
    throw new SaveValidationError('Save data must be a plain object')
  }

  const rawVersion = Object.prototype.hasOwnProperty.call(raw, 'version') ? raw.version : 0
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 0 || rawVersion > target) {
    throw new SaveVersionError(`Unsupported save version ${String(rawVersion)}; current version is ${target}`)
  }

  let version = rawVersion
  let save: Record<string, unknown>
  try {
    save = JSON.parse(JSON.stringify(raw))
  } catch {
    throw new SaveValidationError('Save data must be JSON-serializable')
  }

  while (version < target) {
    const migrate = registry[version]
    if (!migrate) {
      throw new SaveVersionError(`No migration registered for save version ${version}`)
    }
    save = migrate(save)
    if (save.version !== version + 1) {
      throw new SaveVersionError(`Migration from save version ${version} expected version ${version + 1}, got ${String(save.version)}`)
    }
    version = save.version as number
  }

  return save as SaveData
}

export function validateSave(save: unknown): asserts save is SaveData {
  if (!isSaveObject(save) || !Number.isInteger(save.version) || save.version !== SAVE_VERSION) {
    throw new SaveValidationError(`Save data must contain version ${SAVE_VERSION}`)
  }
}

/** 為存檔包上版本信封 */
export const wrapVersionedSave = (data: unknown, version: number): Record<string, unknown> => ({
  version,
  data
})

/**
 * 讀版本信封（嚴格校驗，損壞給明確錯誤）：
 * - 非物件 → SaveValidationError
 * - 無 version 欄位 → 視為 v0 舊存檔，整體即 data（向後相容）
 * - version 非整數 / 為負 / 超過當前版本 → SaveVersionError
 * - 有 version 無 data → SaveValidationError
 */
export const parseVersionedSave = (raw: unknown, currentVersion: number, name: string): unknown => {
  if (!isSaveObject(raw)) {
    throw new SaveValidationError(`${name} save must be a plain object`)
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'version')) {
    return raw // v0：無信封，整體即 data
  }
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > currentVersion) {
    throw new SaveVersionError(`Unsupported ${name} save version ${String(version)}; current version is ${currentVersion}`)
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'data')) {
    throw new SaveValidationError(`${name} save version ${version} is missing the data envelope`)
  }
  return (raw as { data: unknown }).data
}

/**
 * 校驗遊戲主存檔的結構與版本（雲存檔/WebDAV 匯入前的嚴格校驗）：
 * version 必須為 0..SAVE_VERSION 的整數，且含 player 物件。
 * 透過則返回遷移後的存檔；損壞/版本不支援時拋 typed SaveError。
 */
export const validateGameSaveStructure = (raw: unknown): SaveData => {
  const migrated = migrateSave(raw)
  validateSave(migrated)
  if (!isSaveObject(migrated.player)) {
    throw new SaveValidationError('Game save is missing player data')
  }
  return migrated
}

/**
 * WebDAV/檔案匯入前的嚴格校驗（讀存檔時校驗版本與結構，損壞給明確錯誤不靜默吞）。
 * 接受兩種格式：
 * 1. 字串：整體即遊戲主存檔密文（舊格式）
 * 2. 物件：{ game: 密文, universe?: 密文|null, npcs?: 密文|null }
 * 校驗透過不拋異常；失敗拋 typed SaveError（呼叫方把 message 展示給使用者）。
 */
export const validateSaveImportBundle = (importData: unknown): void => {
  const strictDecrypt = (ciphertext: unknown, name: string): unknown => {
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
      throw new SaveValidationError(`${name} save must be a non-empty encrypted string`)
    }
    try {
      return decryptData(ciphertext, { throwOnError: true })
    } catch {
      throw new SaveDecryptError(`${name} save is corrupted: decryption failed`)
    }
  }

  if (typeof importData === 'string') {
    // 舊格式：整體即遊戲主存檔密文
    validateGameSaveStructure(strictDecrypt(importData, 'game'))
    return
  }
  if (!isSaveObject(importData)) {
    throw new SaveValidationError('Import data must be an encrypted save string or a { game, universe, npcs } bundle object')
  }
  if (!('game' in importData) || importData.game == null) {
    throw new SaveValidationError('Import bundle is missing the game save')
  }
  validateGameSaveStructure(strictDecrypt(importData.game, 'game'))
  if (importData.universe != null) {
    parseVersionedSave(strictDecrypt(importData.universe, 'universe'), UNIVERSE_SAVE_VERSION, 'universe')
  }
  if (importData.npcs != null) {
    parseVersionedSave(strictDecrypt(importData.npcs, 'npcs'), NPC_SAVE_VERSION, 'npcs')
  }
}
