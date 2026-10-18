import { decryptData } from '@/utils/crypto'
import { createDefaultContract } from '@/logic/autopilotBilling'
import type { AutopilotContract } from '@/types/game'

export const SAVE_VERSION = 3
// ---- universe / npc 双 key 版本化（M1） ----
// universe 与 npc 存档各用独立 key 持久化，此前无版本信封；
// 新写入统一包 { version, data } 信封，读取时兼容无信封的 v0 旧存档。
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
 * v1 → v2：自动成长副官（M1）。
 * - 副官配置缺省即「未启用」，旧存档无需补字段（引擎把缺失视为禁用）。
 * - 等待项没有 source 标记的一律视为玩家手动（B11 交接语义），不做回填。
 * 因此迁移只需抬升版本号并做一次结构深拷贝，保持幂等。
 */
const migrateV1ToV2 = (save: Record<string, unknown>): SaveData => ({ ...save, version: 2 })

const BILLING_CONTRACT_STATUSES = ['inactive', 'active', 'paused_manual', 'paused_funds', 'terminated'] as const

/**
 * 手工/部分合约的字段回填：已知字段按类型校验后保留，未知字段丢弃，缺失字段用 fallback 补默认。
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
 * v2 → v3：自动成长副官付费制（v3）。
 * - 为 Player 补 autopilotContract（默认 plan:'free'、status:'inactive'、autoRenew:false）。
 * - 旧存档若有用副官（任一星球 autopilot.enabled 或帝国研究副官 enabled）：
 *   不自动开始扣款（status 保持 inactive），标记 needsBillingConfirm，等确认门用户选择。
 * - 没用过副官的旧存档：标记 needsBillingNotice，一次性展示新制说明。
 * - 已有（手工）合约：只补缺字段，不覆盖已有值。
 * 幂等：迁移只跑一次（版本号抬升），且回填逻辑对已迁移合约是稳定不动点。
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

/** 为存档包上版本信封 */
export const wrapVersionedSave = (data: unknown, version: number): Record<string, unknown> => ({
  version,
  data
})

/**
 * 读版本信封（严格校验，损坏给明确错误）：
 * - 非对象 → SaveValidationError
 * - 无 version 字段 → 视为 v0 旧存档，整体即 data（向后兼容）
 * - version 非整数 / 为负 / 超过当前版本 → SaveVersionError
 * - 有 version 无 data → SaveValidationError
 */
export const parseVersionedSave = (raw: unknown, currentVersion: number, name: string): unknown => {
  if (!isSaveObject(raw)) {
    throw new SaveValidationError(`${name} save must be a plain object`)
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'version')) {
    return raw // v0：无信封，整体即 data
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
 * 校验游戏主存档的结构与版本（云存档/WebDAV 导入前的严格校验）：
 * version 必须为 0..SAVE_VERSION 的整数，且含 player 对象。
 * 通过则返回迁移后的存档；损坏/版本不支持时抛 typed SaveError。
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
 * WebDAV/文件导入前的严格校验（读存档时校验版本与结构，损坏给明确错误不静默吞）。
 * 接受两种格式：
 * 1. 字符串：整体即游戏主存档密文（旧格式）
 * 2. 对象：{ game: 密文, universe?: 密文|null, npcs?: 密文|null }
 * 校验通过不抛异常；失败抛 typed SaveError（调用方把 message 展示给用户）。
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
    // 旧格式：整体即游戏主存档密文
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
