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
import type { MigrationRegistry, SaveData } from '@/logic/saveMigration'
import type { Player } from '@/types/game'
import type { FixturePlayer } from '../fixtures/types'
import newGame from '../fixtures/new-game.json'
import legacyGame from '../fixtures/new-game-v0.json'
import midGame from '../fixtures/mid-game.json'

const _newGamePlayer: FixturePlayer = newGame.player
const _newGamePlayerExact: Record<Exclude<keyof typeof newGame.player, keyof Player>, never> = _newGamePlayer
const _legacyGamePlayer: FixturePlayer = legacyGame.player
const _legacyGamePlayerExact: Record<Exclude<keyof typeof legacyGame.player, keyof Player>, never> = _legacyGamePlayer
const _midGamePlayer: FixturePlayer = midGame.player
const _midGamePlayerExact: Record<Exclude<keyof typeof midGame.player, keyof Player>, never> = _midGamePlayer
void _newGamePlayerExact
void _legacyGamePlayerExact
void _midGamePlayerExact

afterEach(() => vi.restoreAllMocks())

describe('save migrations', () => {
  it('runs every step of an injected migration chain through its target version', () => {
    const registry: MigrationRegistry = {
      0: save => ({ ...save, version: 1, step0: true }),
      1: save => ({ ...save, version: 2, step1: true }),
      2: save => ({ ...save, version: 3, step2: true })
    }

    expect(migrateSave({ version: 0 }, registry, 3)).toEqual({ version: 3, step0: true, step1: true, step2: true })
  })

  it('rejects a migration that forgets to bump the version', () => {
    const registry: MigrationRegistry = { 0: save => ({ ...save }) as SaveData }

    expect(() => migrateSave({ version: 0 }, registry, 1)).toThrow(SaveVersionError)
    expect(() => migrateSave({ version: 0 }, registry, 1)).toThrow('expected version 1, got 0')
  })

  it('rejects a migration that skips a version', () => {
    const registry: MigrationRegistry = { 0: save => ({ ...save, version: 2 }) }

    expect(() => migrateSave({ version: 0 }, registry, 1)).toThrow(SaveVersionError)
    expect(() => migrateSave({ version: 0 }, registry, 1)).toThrow('expected version 1, got 2')
  })

  it('rejects a missing step in an injected migration chain', () => {
    const registry: MigrationRegistry = { 0: save => ({ ...save, version: 1 }) }

    expect(() => migrateSave({ version: 0 }, registry, 2)).toThrow(SaveVersionError)
    expect(() => migrateSave({ version: 0 }, registry, 2)).toThrow('No migration registered for save version 1')
  })

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
