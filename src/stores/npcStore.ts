import { defineStore } from 'pinia'
import type { NPC } from '@/types/game'
import pkg from '../../package.json'
import { encryptData, decryptData } from '@/utils/crypto'
import { parseVersionedSave, wrapVersionedSave, NPC_SAVE_VERSION } from '@/logic/saveMigration'

/**
 * NPC Store
 * 儲存和管理所有NPC資料
 */
export const useNPCStore = defineStore('npc', {
  state: () => ({
    npcs: [] as NPC[],
    lastGrowthCheck: {} as Record<string, number> // npcId -> timestamp
  }),
  persist: {
    key: `${pkg.name}-npcs`,
    storage: localStorage,
    serializer: {
      // M1：寫入版本信封 { version, data }（NPC_SAVE_VERSION）
      serialize: state => encryptData(wrapVersionedSave(state, NPC_SAVE_VERSION)),
      deserialize: value => {
        try {
          const raw = decryptData(value, { throwOnError: true })
          return parseVersionedSave(raw, NPC_SAVE_VERSION, 'npcs') as Record<string, unknown>
        } catch (error) {
          // 本地損壞沿用舊行為：記錯並按空狀態啟動（嚴格校驗在雲/WebDAV 匯入邊界做）
          console.error(`[${pkg.name}] Failed to parse npcs save; starting empty`, error)
          return {}
        }
      }
    }
  }
})
