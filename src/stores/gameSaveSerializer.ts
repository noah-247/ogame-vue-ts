import pkg from '../../package.json'
import { parseSave, serializeSave } from '@/logic/saveIo'
import type { SaveData } from '@/logic/saveMigration'

export const serializeGameSave = serializeSave

export const deserializeGameSave = (ciphertext: string): SaveData | Record<string, never> => {
  try {
    return parseSave(ciphertext)
  } catch (error) {
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
    return {}
  }
}
