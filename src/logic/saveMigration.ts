export const SAVE_VERSION = 2

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

const migrations: MigrationRegistry = {
  0: migrateV0ToV1,
  1: migrateV1ToV2
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
