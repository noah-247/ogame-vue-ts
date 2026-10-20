import { defineStore } from 'pinia'
import type {
  Planet,
  Player,
  BuildQueueItem,
  FleetMission,
  BattleResult,
  SpyReport,
  Officer,
  SpiedNotification,
  NPCActivityNotification,
  IncomingFleetAlert,
  MissileAttack,
  AchievementStats,
  AchievementProgress,
  WebDAVConfig
} from '@/types/game'
import { TechnologyType, OfficerType } from '@/types/game'
import { initializeAchievementStats, initializeAchievements } from '@/logic/achievementLogic'
import type { Locale } from '@/locales'
import pkg from '../../package.json'
import { serializeGameSave, deserializeGameSave } from '@/stores/gameSaveSerializer'

export const useGameStore = defineStore('game', {
  state: () => ({
    gameTime: Date.now(),
    // BLK-1 虛擬時間偏移（毫秒，持久化）：gameNow = Date.now() + timeOffset。
    // 快轉只增加 offset，遊戲時鐘隨真實時間持續推進，不凍結、不倒退。
    timeOffset: 0,
    isPaused: false,
    gameSpeed: 1,
    battleToFinish: true, // 戰鬥到底模式：false=經典模式(6回合平局)，true=戰鬥到底(最多100回合)
    player: {
      id: 'player1',
      name: '',
      planets: [] as Planet[],
      technologies: {} as Record<TechnologyType, number>,
      officers: {} as Record<OfficerType, Officer>,
      researchQueue: [] as BuildQueueItem[],
      waitingResearchQueue: [],
      fleetMissions: [] as FleetMission[],
      missileAttacks: [] as MissileAttack[],
      battleReports: [] as BattleResult[],
      spyReports: [] as SpyReport[],
      spiedNotifications: [] as SpiedNotification[],
      npcActivityNotifications: [] as NPCActivityNotification[],
      missionReports: [],
      incomingFleetAlerts: [] as IncomingFleetAlert[],
      giftNotifications: [],
      giftRejectedNotifications: [],
      points: 0,
      bonusPoints: 0,
      isGMEnabled: false, // 明確設定 GM 模式預設為 false
      lastVersionCheckTime: 0, // 最後一次檢查版本的時間戳，預設為0
      achievementStats: initializeAchievementStats() as AchievementStats,
      achievements: initializeAchievements() as Record<string, AchievementProgress>
    } as Player,
    currentPlanetId: '',
    isDark: '',
    locale: 'zh-CN' as Locale,
    npcNameLocale: 'en' as 'en' | 'auto', // NPC 名稱語言：'en' 固定英文，'auto' 跟隨介面語言
    notificationSettings: {
      browser: false,
      inApp: true,
      suppressInFocus: false,
      types: {
        construction: true,
        research: true,
        unlock: true
      }
    },
    webdavConfig: null as WebDAVConfig | null
  }),
  actions: {
    async requestBrowserPermission(): Promise<boolean> {
      if (!('Notification' in window)) return false

      if (Notification.permission === 'granted') return true

      const permission = await Notification.requestPermission()
      return permission === 'granted'
    }
  },
  getters: {
    currentPlanet(): Planet | undefined {
      return this.player.planets.find(p => p.id === this.currentPlanetId)
    },
    getMoonForPlanet(): (planetId: string) => Planet | undefined {
      return (planetId: string) => {
        return this.player.planets.find(p => p.parentPlanetId === planetId && p.isMoon)
      }
    }
  },
  persist: {
    key: pkg.name,
    storage: localStorage,
    serializer: {
      serialize: state => serializeGameSave(state),
      deserialize: value => deserializeGameSave(value)
    }
  }
})
