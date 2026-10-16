import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSave, serializeSave } from '@/logic/saveIo'
import { SAVE_VERSION, SaveError } from '@/logic/saveMigration'
import { decryptData } from '@/utils/crypto'
import newGame from '../fixtures/new-game.json'
import midGame from '../fixtures/mid-game.json'

afterEach(() => vi.restoreAllMocks())

describe('save encryption round trip', () => {
  it.each([
    ['new game', newGame],
    ['mid game', midGame]
  ])('preserves the %s fixture and current version', (_name, state) => {
    const original = JSON.stringify(state)
    const ciphertext = serializeSave(state)

    expect(ciphertext).not.toBe(original)
    expect(decryptData(ciphertext)).toEqual({ ...state, version: SAVE_VERSION })
    expect(parseSave(ciphertext)).toEqual(state)
    expect(JSON.stringify(state)).toBe(original)
  })

  it('adds the current version without mutating state', () => {
    const state = { player: { planets: [], technologies: {} } }

    expect(parseSave(serializeSave(state))).toEqual({ ...state, version: SAVE_VERSION })
    expect(state).not.toHaveProperty('version')
  })

  it('does not silently persist a failed encryption result', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const state: Record<string, unknown> = {}
    state.circular = state

    expect(() => serializeSave(state)).toThrow(SaveError)
  })
})
