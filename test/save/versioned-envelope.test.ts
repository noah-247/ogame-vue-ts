import { describe, expect, it } from 'vitest'
import { encryptData } from '@/utils/crypto'
import {
  NPC_SAVE_VERSION,
  SAVE_VERSION,
  SaveDecryptError,
  SaveValidationError,
  SaveVersionError,
  UNIVERSE_SAVE_VERSION,
  parseVersionedSave,
  validateGameSaveStructure,
  validateSaveImportBundle,
  wrapVersionedSave
} from '@/logic/saveMigration'
import newGame from '../fixtures/new-game.json'

describe('versioned save envelopes (universe / npcs 雙 key 版本化)', () => {
  it('round-trips a versioned envelope', () => {
    const data = { planets: { '1:1:1': { id: 'x' } }, debrisFields: {} }
    const raw = wrapVersionedSave(data, UNIVERSE_SAVE_VERSION)

    expect(raw).toEqual({ version: UNIVERSE_SAVE_VERSION, data })
    expect(parseVersionedSave(raw, UNIVERSE_SAVE_VERSION, 'universe')).toEqual(data)
  })

  it('treats an envelope-less save as legacy v0 and returns it as data', () => {
    const legacy = { planets: {}, debrisFields: {} }

    expect(parseVersionedSave(legacy, UNIVERSE_SAVE_VERSION, 'universe')).toBe(legacy)
    expect(parseVersionedSave({ npcs: [] }, NPC_SAVE_VERSION, 'npcs')).toEqual({ npcs: [] })
  })

  it('rejects a future version without downgrading', () => {
    const raw = wrapVersionedSave({}, 999)

    expect(() => parseVersionedSave(raw, UNIVERSE_SAVE_VERSION, 'universe')).toThrow(SaveVersionError)
    expect(() => parseVersionedSave(raw, UNIVERSE_SAVE_VERSION, 'universe')).toThrow('999')
  })

  it('rejects non-object input with a clear error', () => {
    for (const raw of [null, 'broken', 42, []]) {
      expect(() => parseVersionedSave(raw, UNIVERSE_SAVE_VERSION, 'universe')).toThrow(SaveValidationError)
    }
  })

  it('rejects a versioned envelope missing the data field', () => {
    expect(() => parseVersionedSave({ version: 1 }, UNIVERSE_SAVE_VERSION, 'universe')).toThrow(SaveValidationError)
    expect(() => parseVersionedSave({ version: 1 }, UNIVERSE_SAVE_VERSION, 'universe')).toThrow(/data/i)
  })
})

describe('validateGameSaveStructure', () => {
  it('accepts a migratable game save with player data', () => {
    const save = validateGameSaveStructure(newGame)

    expect(save.version).toBe(SAVE_VERSION)
  })

  it('rejects a save without player data', () => {
    expect(() => validateGameSaveStructure({ version: 2 })).toThrow(SaveValidationError)
    expect(() => validateGameSaveStructure({ version: 2 })).toThrow(/player/i)
  })

  it('rejects a future game version', () => {
    expect(() => validateGameSaveStructure({ ...newGame, version: 999 })).toThrow(SaveVersionError)
  })

  it('rejects damaged input', () => {
    expect(() => validateGameSaveStructure('not an object')).toThrow(SaveValidationError)
    expect(() => validateGameSaveStructure(null)).toThrow(SaveValidationError)
  })
})

describe('validateSaveImportBundle (WebDAV/檔案匯入嚴格校驗)', () => {
  const validBundle = () => ({
    game: encryptData(newGame),
    universe: encryptData(wrapVersionedSave({ planets: {}, debrisFields: {} }, UNIVERSE_SAVE_VERSION)),
    npcs: encryptData(wrapVersionedSave({ npcs: [], lastGrowthCheck: {} }, NPC_SAVE_VERSION))
  })

  it('accepts a valid bundle without throwing', () => {
    expect(() => validateSaveImportBundle(validBundle())).not.toThrow()
  })

  it('accepts the legacy string format (whole file is game ciphertext)', () => {
    expect(() => validateSaveImportBundle(encryptData(newGame))).not.toThrow()
  })

  it('accepts legacy envelope-less universe/npcs saves', () => {
    const bundle = {
      ...validBundle(),
      universe: encryptData({ planets: {}, debrisFields: {} }),
      npcs: encryptData({ npcs: [] })
    }

    expect(() => validateSaveImportBundle(bundle)).not.toThrow()
  })

  it('rejects a corrupted game ciphertext with a typed error', () => {
    expect(() => validateSaveImportBundle({ ...validBundle(), game: 'broken' })).toThrow(SaveDecryptError)
    expect(() => validateSaveImportBundle({ ...validBundle(), game: 'broken' })).toThrow(/game/i)
  })

  it('rejects a bundle missing the game save', () => {
    const { game: _game, ...noGame } = validBundle()
    void _game

    expect(() => validateSaveImportBundle(noGame)).toThrow(SaveValidationError)
    expect(() => validateSaveImportBundle(noGame)).toThrow(/game/i)
  })

  it('rejects a universe save with an unsupported version', () => {
    const bundle = {
      ...validBundle(),
      universe: encryptData(wrapVersionedSave({}, 999))
    }

    expect(() => validateSaveImportBundle(bundle)).toThrow(SaveVersionError)
    expect(() => validateSaveImportBundle(bundle)).toThrow(/universe/i)
  })

  it('rejects a corrupted universe ciphertext', () => {
    expect(() => validateSaveImportBundle({ ...validBundle(), universe: 'broken' })).toThrow(SaveDecryptError)
  })

  it('rejects non-object, non-string input', () => {
    expect(() => validateSaveImportBundle(42)).toThrow(SaveValidationError)
    expect(() => validateSaveImportBundle(null)).toThrow(SaveValidationError)
    expect(() => validateSaveImportBundle([])).toThrow(SaveValidationError)
  })

  it('allows a bundle without universe/npcs keys', () => {
    expect(() => validateSaveImportBundle({ game: encryptData(newGame) })).not.toThrow()
  })
})
