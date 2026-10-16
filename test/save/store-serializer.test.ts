import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../../package.json'
import { SaveDecryptError, SaveValidationError, SaveVersionError } from '@/logic/saveMigration'
import { deserializeGameSave, resetSaveLock, serializeGameSave } from '@/stores/gameSaveSerializer'
import { encryptData } from '@/utils/crypto'
import type { Player } from '@/types/game'
import type { FixturePlayer } from '../fixtures/types'
import { restore, setNow } from '../utils/time'
import legacyGame from '../fixtures/new-game-v0.json'
import newGame from '../fixtures/new-game.json'
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

describe('game store persistence serializer', () => {
  it('backs up damaged ciphertext, reports why and returns an empty patch without crashing', () => {
    const ciphertext = 'damaged ciphertext'
    entries.set(pkg.name, ciphertext)

    expect(deserializeGameSave(ciphertext)).toEqual({})
    expect(entries.get(`${pkg.name}.corrupted.${timestamp}`)).toBe(ciphertext)
    expect(entries.get(pkg.name)).toBe(ciphertext)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('original ciphertext preserved'), expect.any(SaveDecryptError))
  })

  it('backs up future-version ciphertext rather than silently downgrading it', () => {
    const ciphertext = encryptData({ ...newGame, version: 999 })

    expect(deserializeGameSave(ciphertext)).toEqual({})
    expect(entries.get(`${pkg.name}.corrupted.${timestamp}`)).toBe(ciphertext)
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.any(SaveVersionError))
  })

  it('backs up decrypted invalid data without applying it to the store', () => {
    const ciphertext = encryptData(null)

    expect(deserializeGameSave(ciphertext)).toEqual({})
    expect(entries.get(`${pkg.name}.corrupted.${timestamp}`)).toBe(ciphertext)
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.any(SaveValidationError))
  })

  it('keeps distinct backups when two failures share a timestamp', () => {
    deserializeGameSave('first broken ciphertext')
    deserializeGameSave('second broken ciphertext')

    expect(entries.get(`${pkg.name}.corrupted.${timestamp}`)).toBe('first broken ciphertext')
    expect(entries.get(`${pkg.name}.corrupted.${timestamp}.1`)).toBe('second broken ciphertext')
  })

  it('does not crash even when storage refuses the backup', () => {
    const backupError = new Error('Storage quota exceeded')
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw backupError }
    })

    expect(deserializeGameSave('broken')).toEqual({})
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('back up original ciphertext'), expect.any(SaveDecryptError), backupError)
  })

  it('migrates old AES ciphertext to v1 without making a corrupted backup', () => {
    const ciphertext = encryptData(legacyGame)
    const { version: _version, ...state } = newGame

    expect(deserializeGameSave(ciphertext)).toEqual(state)
    expect(entries.size).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([newGame, midGame])('round-trips valid v1 state through the exact store adapter', state => {
    const { version: _version, ...expected } = state
    expect(deserializeGameSave(serializeGameSave(state))).toEqual(expected)
    expect(entries.size).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })
})
