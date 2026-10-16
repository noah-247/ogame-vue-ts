import { defineStore } from 'pinia'
import type { Planet, DebrisField } from '@/types/game'
import pkg from '../../package.json'
import { encryptData, decryptData } from '@/utils/crypto'
import { parseVersionedSave, wrapVersionedSave, UNIVERSE_SAVE_VERSION } from '@/logic/saveMigration'

/**
 * 宇宙地图 Store
 * 存储宇宙中的所有星球和残骸场
 * 使用普通 localStorage 存储，不加密（地图数据是静态/共享数据）
 */
export const useUniverseStore = defineStore('universe', {
  state: () => ({
    // 宇宙星球地图：key 格式为 "galaxy:system:position"
    planets: {} as Record<string, Planet>,
    // 残骸场：key 格式为 "galaxy:system:position"
    debrisFields: {} as Record<string, DebrisField>
  }),
  persist: {
    key: `${pkg.name}-universe`,
    storage: localStorage,
    serializer: {
      // M1：写入版本信封 { version, data }（UNIVERSE_SAVE_VERSION）
      serialize: state => encryptData(wrapVersionedSave(state, UNIVERSE_SAVE_VERSION)),
      deserialize: value => {
        try {
          const raw = decryptData(value, { throwOnError: true })
          return parseVersionedSave(raw, UNIVERSE_SAVE_VERSION, 'universe') as Record<string, unknown>
        } catch (error) {
          // 本地损坏沿用旧行为：记错并按空状态启动（严格校验在云/WebDAV 导入边界做）
          console.error(`[${pkg.name}] Failed to parse universe save; starting empty`, error)
          return {}
        }
      }
    }
  }
})
