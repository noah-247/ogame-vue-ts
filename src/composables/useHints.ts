/**
 * 弱引導系統 - 非阻塞式、可關閉的頁面提示
 * 用溫和的引導替代強制性教程
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'

// 提示定義 - 使用者首次訪問頁面時顯示一次
export interface Hint {
  id: string
  route: string // 顯示此提示的路由路徑
  titleKey: string // 標題的 i18n 鍵
  messageKey: string // 訊息的 i18n 鍵
  icon?: string // 可選的圖示名稱
  delay?: number // 顯示前的延遲毫秒數（預設 500）
}

// 所有可用的提示
const hints: Hint[] = [
  {
    id: 'overview_intro',
    route: '/overview',
    titleKey: 'hints.overview.title',
    messageKey: 'hints.overview.message',
    icon: 'home',
    delay: 1000
  },
  {
    id: 'buildings_intro',
    route: '/buildings',
    titleKey: 'hints.buildings.title',
    messageKey: 'hints.buildings.message',
    icon: 'building',
    delay: 500
  },
  {
    id: 'research_intro',
    route: '/research',
    titleKey: 'hints.research.title',
    messageKey: 'hints.research.message',
    icon: 'flask',
    delay: 500
  },
  {
    id: 'shipyard_intro',
    route: '/shipyard',
    titleKey: 'hints.shipyard.title',
    messageKey: 'hints.shipyard.message',
    icon: 'rocket',
    delay: 500
  },
  {
    id: 'fleet_intro',
    route: '/fleet',
    titleKey: 'hints.fleet.title',
    messageKey: 'hints.fleet.message',
    icon: 'plane',
    delay: 500
  },
  {
    id: 'galaxy_intro',
    route: '/galaxy',
    titleKey: 'hints.galaxy.title',
    messageKey: 'hints.galaxy.message',
    icon: 'globe',
    delay: 500
  },
  {
    id: 'diplomacy_intro',
    route: '/diplomacy',
    titleKey: 'hints.diplomacy.title',
    messageKey: 'hints.diplomacy.message',
    icon: 'handshake',
    delay: 500
  },
  {
    id: 'messages_intro',
    route: '/messages',
    titleKey: 'hints.messages.title',
    messageKey: 'hints.messages.message',
    icon: 'mail',
    delay: 500
  },
  {
    id: 'defense_intro',
    route: '/defense',
    titleKey: 'hints.defense.title',
    messageKey: 'hints.defense.message',
    icon: 'shield',
    delay: 500
  },
  {
    id: 'officers_intro',
    route: '/officers',
    titleKey: 'hints.officers.title',
    messageKey: 'hints.officers.message',
    icon: 'users',
    delay: 500
  },
  {
    id: 'simulator_intro',
    route: '/battle-simulator',
    titleKey: 'hints.simulator.title',
    messageKey: 'hints.simulator.message',
    icon: 'swords',
    delay: 500
  },
  {
    id: 'campaign_intro',
    route: '/campaign',
    titleKey: 'hints.campaign.title',
    messageKey: 'hints.campaign.message',
    icon: 'map',
    delay: 500
  },
  {
    id: 'achievements_intro',
    route: '/achievements',
    titleKey: 'hints.achievements.title',
    messageKey: 'hints.achievements.message',
    icon: 'trophy',
    delay: 500
  },
  {
    id: 'ranking_intro',
    route: '/ranking',
    titleKey: 'hints.ranking.title',
    messageKey: 'hints.ranking.message',
    icon: 'medal',
    delay: 500
  },
  {
    id: 'settings_intro',
    route: '/settings',
    titleKey: 'hints.settings.title',
    messageKey: 'hints.settings.message',
    icon: 'settings',
    delay: 500
  },
  {
    id: 'gm_intro',
    route: '/gm',
    titleKey: 'hints.gm.title',
    messageKey: 'hints.gm.message',
    icon: 'wand',
    delay: 500
  }
]

// 全域性UI狀態（不需要持久化）
const currentHint = ref<Hint | null>(null)
const isHintVisible = ref(false)

let hintTimeout: ReturnType<typeof setTimeout> | null = null

export const useHints = () => {
  const router = useRouter()
  const gameStore = useGameStore()

  // 確保 dismissedHints 陣列已初始化
  if (!gameStore.player.dismissedHints) {
    gameStore.player.dismissedHints = []
  }

  // 確保 hintsEnabled 已初始化（預設為 true）
  if (gameStore.player.hintsEnabled === undefined) {
    gameStore.player.hintsEnabled = true
  }

  // 檢查提示是否已被關閉
  const isHintDismissed = (hintId: string): boolean => {
    return gameStore.player.dismissedHints?.includes(hintId) ?? false
  }

  // 檢查當前路由是否應該顯示提示
  const checkForHint = (routePath: string) => {
    if (!gameStore.player.hintsEnabled) return

    // 清除任何待顯示的提示
    if (hintTimeout) {
      clearTimeout(hintTimeout)
      hintTimeout = null
    }

    // 導航時隱藏當前提示
    isHintVisible.value = false
    currentHint.value = null

    // 查詢此路由對應的提示
    const hint = hints.find(h => routePath.startsWith(h.route))
    if (!hint) return

    // 檢查是否已經關閉過
    if (isHintDismissed(hint.id)) return

    // 延遲後顯示提示
    const delay = hint.delay ?? 500
    hintTimeout = setTimeout(() => {
      currentHint.value = hint
      isHintVisible.value = true
    }, delay)
  }

  // 關閉當前提示（不再顯示）
  const dismissHint = (dontShowAgain = true) => {
    if (currentHint.value && dontShowAgain) {
      if (!gameStore.player.dismissedHints) {
        gameStore.player.dismissedHints = []
      }
      if (!gameStore.player.dismissedHints.includes(currentHint.value.id)) {
        gameStore.player.dismissedHints.push(currentHint.value.id)
      }
    }
    isHintVisible.value = false
    currentHint.value = null
  }

  // 暫時關閉提示（下次訪問還會顯示）
  const closeHint = () => {
    isHintVisible.value = false
    currentHint.value = null
  }

  // 重置所有提示（重新顯示）
  const resetHints = () => {
    gameStore.player.dismissedHints = []
  }

  // 切換提示開關
  const setHintsEnabled = (enabled: boolean) => {
    gameStore.player.hintsEnabled = enabled
    if (!enabled) {
      isHintVisible.value = false
      currentHint.value = null
    }
  }

  // 監聽路由變化
  watch(
    () => router.currentRoute.value.path,
    newPath => {
      checkForHint(newPath)
    },
    { immediate: true }
  )

  return {
    // 狀態
    currentHint: computed(() => currentHint.value),
    isHintVisible: computed(() => isHintVisible.value),
    hintsEnabled: computed(() => gameStore.player.hintsEnabled ?? true),
    dismissedCount: computed(() => gameStore.player.dismissedHints?.length ?? 0),
    totalHints: computed(() => hints.length),

    // 操作
    dismissHint,
    closeHint,
    resetHints,
    setHintsEnabled,
    checkForHint
  }
}
