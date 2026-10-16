import { decryptData, encryptData } from '@/utils/crypto'
import { migrateSave, SAVE_VERSION, SaveDecryptError, SaveError, validateSave } from '@/logic/saveMigration'
import type { SaveData } from '@/logic/saveMigration'

export const serializeSave = (state: Record<string, unknown>): string => {
  const ciphertext = encryptData({ ...state, version: SAVE_VERSION })
  if (!ciphertext) throw new SaveError('Failed to encrypt save data')
  return ciphertext
}

export const parseSave = (ciphertext: string): SaveData => {
  let raw: unknown
  try {
    raw = decryptData(ciphertext, { throwOnError: true })
  } catch {
    throw new SaveDecryptError('Failed to decrypt save: ciphertext is empty, invalid or does not contain valid JSON')
  }
  const save = migrateSave(raw)
  validateSave(save)
  return save
}
