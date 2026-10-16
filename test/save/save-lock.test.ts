import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import { toast } from 'vue-sonner'
import pkg from '../../package.json'
import { parseSave } from '@/logic/saveIo'
import { SaveError, SAVE_VERSION } from '@/logic/saveMigration'
import { deserializeGameSave, isSaveLocked, resetSaveLock, serializeGameSave } from '@/stores/gameSaveSerializer'
import { encryptData } from '@/utils/crypto'
import legacyGame from '../fixtures/new-game-v0.json'
import newGame from '../fixtures/new-game.json'

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

let entries: Map<string, string>
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value) },
  removeItem: (key: string) => { entries.delete(key) }
}
let pinia: ReturnType<typeof createPinia>
let useGameStore: typeof import('@/stores/gameStore').useGameStore

beforeEach(async () => {
  entries = new Map()
  vi.stubGlobal('localStorage', storage)
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  resetSaveLock()
  const gameStore = await import('@/stores/gameStore')
  useGameStore = gameStore.useGameStore
  pinia = createPinia()
  pinia.use(createPersistedState())
  createApp({}).use(pinia)
})

afterEach(() => {
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('failed hydration save lock with the real game store and persistence plugin', () => {
  it('preserves damaged ciphertext after mutations and notifies only once', () => {
    const ciphertext = 'damaged ciphertext'
    storage.setItem(pkg.name, ciphertext)

    const store = useGameStore(pinia)

    expect(isSaveLocked()).toBe(true)
    store.$patch({ gameSpeed: 99 })
    expect(store.gameSpeed).toBe(99)
    expect(storage.getItem(pkg.name)).toBe(ciphertext)
    expect(() => serializeGameSave(store.$state)).toThrow(SaveError)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('存档无法读取/版本过新，已暂停自动存档')

    deserializeGameSave('another broken')
    expect(toast.error).toHaveBeenCalledOnce()
  })

  it('preserves unsupported future ciphertext after mutations', () => {
    const ciphertext = encryptData({ ...newGame, version: 999 })
    storage.setItem(pkg.name, ciphertext)

    const store = useGameStore(pinia)

    expect(isSaveLocked()).toBe(true)
    store.$patch({ gameSpeed: 99 })
    expect(storage.getItem(pkg.name)).toBe(ciphertext)
    expect(() => serializeGameSave(store.$state)).toThrow(SaveError)
    expect(toast.error).toHaveBeenCalledOnce()
  })

  it('hydrates v0 without writing, then writes migrated to current version on the first mutation', () => {
    const ciphertext = encryptData(legacyGame)
    storage.setItem(pkg.name, ciphertext)

    const store = useGameStore(pinia)

    expect(isSaveLocked()).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(store.$state.player.name).toBe(legacyGame.player.name)
    expect(store.$state).not.toHaveProperty('version')
    expect(storage.getItem(pkg.name)).toBe(ciphertext)

    store.$patch({ gameSpeed: 99 })
    const upgradedCiphertext = storage.getItem(pkg.name)!
    expect(upgradedCiphertext).not.toBe(ciphertext)
    expect(parseSave(upgradedCiphertext).version).toBe(SAVE_VERSION)
    expect(parseSave(upgradedCiphertext).gameSpeed).toBe(99)
  })
})
