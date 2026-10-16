import pkg from '../../package.json'
import { toast } from 'vue-sonner'
import type { StateTree } from 'pinia'
import { parseSave, serializeSave } from '@/logic/saveIo'
import { SaveError } from '@/logic/saveMigration'
import { detectBrowserLocale, getLocale } from '@/locales'

let saveLocked = false
let lockNotified = false

export const isSaveLocked = (): boolean => saveLocked

export const resetSaveLock = (): void => {
  saveLocked = false
  lockNotified = false
}

export const serializeGameSave = (state: StateTree): string => {
  if (saveLocked) {
    throw new SaveError('Save is locked after a failed hydration; refusing to overwrite the stored save')
  }
  return serializeSave(state)
}

export const deserializeGameSave = (ciphertext: string): Record<string, unknown> => {
  try {
    const save = parseSave(ciphertext)
    const { version: _version, ...state } = save
    return state
  } catch (error) {
    saveLocked = true
    const backupKey = `${pkg.name}.corrupted.${Date.now()}`
    try {
      let availableKey = backupKey
      let suffix = 1
      while (localStorage.getItem(availableKey) !== null) {
        availableKey = `${backupKey}.${suffix++}`
      }
      localStorage.setItem(availableKey, ciphertext)
      console.error(`[${pkg.name}] Failed to load save; original ciphertext preserved at ${availableKey}`, error)
    } catch (backupError) {
      console.error(`[${pkg.name}] Failed to load save and back up original ciphertext`, error, backupError)
    }
    if (!lockNotified) {
      lockNotified = true
      const locale = typeof navigator === 'undefined' ? 'zh-CN' : detectBrowserLocale()
      toast.error(getLocale(locale).settings.saveLockedNotice)
    }
    return {}
  }
}
