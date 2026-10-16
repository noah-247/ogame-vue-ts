import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSave, serializeSave } from '@/logic/saveIo'
import { SAVE_VERSION, SaveError } from '@/logic/saveMigration'
import { decryptData } from '@/utils/crypto'
import { initializeAchievements, initializeAchievementStats } from '@/logic/achievementLogic'
import type { Player } from '@/types/game'
import type { FixturePlayer } from '../fixtures/types'
import newGame from '../fixtures/new-game.json'
import midGame from '../fixtures/mid-game.json'
import legacyGame from '../fixtures/new-game-v0.json'

const _newGamePlayer: FixturePlayer = newGame.player
const _newGamePlayerExact: Record<Exclude<keyof typeof newGame.player, keyof Player>, never> = _newGamePlayer
const _midGamePlayer: FixturePlayer = midGame.player
const _midGamePlayerExact: Record<Exclude<keyof typeof midGame.player, keyof Player>, never> = _midGamePlayer
const _legacyGamePlayer: FixturePlayer = legacyGame.player
const _legacyGamePlayerExact: Record<Exclude<keyof typeof legacyGame.player, keyof Player>, never> = _legacyGamePlayer
void _newGamePlayerExact
void _midGamePlayerExact
void _legacyGamePlayerExact

afterEach(() => vi.restoreAllMocks())

describe('save encryption round trip', () => {
  it.each([
    ['new game', newGame],
    ['legacy game', legacyGame],
    ['mid game', midGame]
  ])('uses actual initialized achievement data in the %s fixture', (_name, state) => {
    expect(state.player.achievementStats).toEqual(initializeAchievementStats())
    expect(state.player.achievements).toEqual(initializeAchievements())
  })

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
    expect(console.error).toHaveBeenCalledWith('[ogame-vue-ts] Failed to encrypt save data')
  })
})
