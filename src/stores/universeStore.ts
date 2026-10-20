import { defineStore } from 'pinia'
import type { Planet, DebrisField } from '@/types/game'
import pkg from '../../package.json'
import { encryptData, decryptData } from '@/utils/crypto'
import { parseVersionedSave, wrapVersionedSave, UNIVERSE_SAVE_VERSION } from '@/logic/saveMigration'

/**
 * 宇宙地圖 Store
 * 儲存宇宙中的所有星球和殘骸場
 * 使用普通 localStorage 儲存，不加密（地圖資料是靜態/共享資料）
 */
export const useUniverseStore = defineStore('universe', {
  state: () => ({
    // 宇宙星球地圖：key 格式為 "galaxy:system:position"
    planets: {} as Record<string, Planet>,
    // 殘骸場：key 格式為 "galaxy:system:position"
    debrisFields: {} as Record<string, DebrisField>
  }),
  persist: {
    key: `${pkg.name}-universe`,
    storage: localStorage,
    serializer: {
      // M1：寫入版本信封 { version, data }（UNIVERSE_SAVE_VERSION）
      serialize: state => encryptData(wrapVersionedSave(state, UNIVERSE_SAVE_VERSION)),
      deserialize: value => {
        try {
          const raw = decryptData(value, { throwOnError: true })
          return parseVersionedSave(raw, UNIVERSE_SAVE_VERSION, 'universe') as Record<string, unknown>
        } catch (error) {
          // 本地損壞沿用舊行為：記錯並按空狀態啟動（嚴格校驗在雲/WebDAV 匯入邊界做）
          console.error(`[${pkg.name}] Failed to parse universe save; starting empty`, error)
          return {}
        }
      }
    }
  }
})
