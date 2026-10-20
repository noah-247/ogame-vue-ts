import { ref, onMounted, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'

type Theme = 'light' | 'dark'

const isDark = ref<boolean>(false)

export const useTheme = () => {
  const gameStore = useGameStore()

  // 初始化主題
  onMounted(() => {
    if (!gameStore.isDark) {
      // 首次訪問，使用系統主題偏好
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
      gameStore.isDark = isDark.value ? 'dark' : 'light'
    } else {
      // 從 gameStore 讀取儲存的主題（Pinia會自動從localStorage恢復）
      const savedTheme = gameStore.isDark as Theme
      isDark.value = savedTheme === 'dark'
    }
    applyTheme()
  })

  // 監聽主題變化
  watch(isDark, () => {
    applyTheme()
    gameStore.isDark = isDark.value ? 'dark' : 'light'
  })

  // 應用主題
  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // 切換主題
  const toggleTheme = () => {
    isDark.value = !isDark.value
  }

  return {
    isDark,
    toggleTheme
  }
}
