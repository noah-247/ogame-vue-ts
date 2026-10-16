import CryptoJS from 'crypto-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../../package.json'
import { parseSave } from '@/logic/saveIo'
import {
  migrateSave,
  SAVE_VERSION,
  SaveDecryptError,
  SaveError,
  SaveValidationError,
  SaveVersionError,
  validateSave
} from '@/logic/saveMigration'
import { decryptData, encryptData } from '@/utils/crypto'
import newGame from '../fixtures/new-game.json'
import legacyGame from '../fixtures/new-game-v0.json'
import midGame from '../fixtures/mid-game.json'

afterEach(() => vi.restoreAllMocks())

describe('save migrations', () => {
  it('migrates v0 to v1 and preserves every business field', () => {
    const migrated = migrateSave(legacyGame)

    expect(migrated).toEqual(newGame)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(legacyGame).not.toHaveProperty('version')
    expect(migrated.player).not.toBe(legacyGame.player)
    expect((migrated.player as typeof legacyGame.player).planets).not.toBe(legacyGame.player.planets)
  })

  it('deep-copies a mid-game v0 save without changing queues, levels or unknown fields', () => {
    const { version: _version, ...legacy } = midGame
    const original = { ...legacy, extension: { nested: ['preserve me'] } }
    const migrated = migrateSave(original)

    expect(migrated).toEqual({ ...original, version: SAVE_VERSION })
    const player = migrated.player as typeof midGame.player
    player.planets[0]!.buildings.metalMine = 99
    expect(original.player.planets[0]!.buildings.metalMine).toBe(12)
    expect(original).not.toHaveProperty('version')
  })

  it.each([newGame, midGame])('keeps a v1 save unchanged and is idempotent', state => {
    const migrated = migrateSave(state)

    expect(migrated).toEqual(state)
    expect(migrateSave(migrated)).toEqual(state)
    expect(migrated).not.toBe(state)
  })

  it('also accepts an explicitly numbered v0 save', () => {
    expect(migrateSave({ ...legacyGame, version: 0 })).toEqual(newGame)
  })

  it.each([null, undefined, false, 42, 'broken', [], new Date(0), new Map()])('rejects damaged input %s', raw => {
    expect(() => migrateSave(raw)).toThrow(SaveValidationError)
    expect(() => migrateSave(raw)).toThrow(/object/i)
  })

  it.each([999, -1, 1.5, '1', null, undefined, Number.NaN, Infinity])('rejects unsupported version %s explicitly', version => {
    expect(() => migrateSave({ version })).toThrow(SaveVersionError)
    expect(() => migrateSave({ version })).toThrow(String(version))
  })

  it('reports a circular input as a validation error', () => {
    const raw: Record<string, unknown> = {}
    raw.circular = raw
    expect(() => migrateSave(raw)).toThrow(SaveValidationError)
  })

  it.each([{}, null, { version: '1' }, { version: 999 }])('validates the version envelope after migration: %s', raw => {
    expect(() => validateSave(raw)).toThrow(SaveValidationError)
  })
})

describe('strict save parsing', () => {
  it.each(['', 'random non-ciphertext', 'U2FsdGVkX1'])('reports failed decryption as a typed error: %s', ciphertext => {
    expect(() => parseSave(ciphertext)).toThrow(SaveDecryptError)
    expect(() => parseSave(ciphertext)).toThrow(/decrypt/i)
    expect(() => parseSave(ciphertext)).toThrow(SaveError)
  })

  it('rejects successfully decrypted text that is not JSON', () => {
    const ciphertext = CryptoJS.AES.encrypt('not JSON', pkg.name).toString()
    expect(() => parseSave(ciphertext)).toThrow(SaveDecryptError)
  })

  it('preserves the legacy decryptData fallback, but does not mistake it for a valid save', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(decryptData('broken')).toEqual({})
    expect(report).toHaveBeenCalledOnce()
    expect(() => parseSave('broken')).toThrow(SaveDecryptError)
    expect(report).toHaveBeenCalledOnce()
  })

  it('distinguishes valid encrypted empty JSON from failed decryption', () => {
    expect(parseSave(encryptData({}))).toEqual({ version: SAVE_VERSION })
  })

  it('reports invalid decrypted save structures as validation errors', () => {
    expect(() => parseSave(encryptData(null))).toThrow(SaveValidationError)
    expect(() => parseSave(encryptData([]))).toThrow(SaveValidationError)
  })

  it('reports future save versions without downgrading them', () => {
    const ciphertext = encryptData({ ...newGame, version: 999 })
    expect(() => parseSave(ciphertext)).toThrow(SaveVersionError)
    expect(() => parseSave(ciphertext)).toThrow('999')
  })
})
