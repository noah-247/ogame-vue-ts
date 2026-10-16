export const SAVE_VERSION = 1

export interface SaveData extends Record<string, unknown> {
  version: number
}

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

const migrations: Record<number, (save: Record<string, unknown>) => SaveData> = {
  0: migrateV0ToV1
}

export const migrateSave = (raw: unknown): SaveData => {
  if (!isSaveObject(raw)) {
    throw new SaveValidationError('Save data must be a plain object')
  }

  const rawVersion = Object.prototype.hasOwnProperty.call(raw, 'version') ? raw.version : 0
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 0 || rawVersion > SAVE_VERSION) {
    throw new SaveVersionError(`Unsupported save version ${String(rawVersion)}; current version is ${SAVE_VERSION}`)
  }

  let version = rawVersion
  let save: Record<string, unknown>
  try {
    save = JSON.parse(JSON.stringify(raw))
  } catch {
    throw new SaveValidationError('Save data must be JSON-serializable')
  }

  while (version < SAVE_VERSION) {
    const migrate = migrations[version]
    if (!migrate) {
      throw new SaveVersionError(`No migration registered for save version ${version}`)
    }
    save = migrate(save)
    version = save.version as number
  }

  return save as SaveData
}

export function validateSave(save: unknown): asserts save is SaveData {
  if (!isSaveObject(save) || !Number.isInteger(save.version) || save.version !== SAVE_VERSION) {
    throw new SaveValidationError(`Save data must contain version ${SAVE_VERSION}`)
  }
}
