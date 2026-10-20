import { ref, computed, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { loadLocale, getLocale, isLocaleLoaded, type Locale, type TranslationSchema } from '@/locales'

// 全域性載入狀態
const isLoading = ref(false)
const currentMessages = ref<TranslationSchema | null>(null)

export const useI18n = () => {
  const gameStore = useGameStore()

  const currentLocale = computed(() => gameStore.locale)

  // 初始化或切換語言時載入
  const ensureLocaleLoaded = async (locale: Locale) => {
    if (isLocaleLoaded(locale)) {
      currentMessages.value = getLocale(locale)
      return
    }

    isLoading.value = true
    try {
      currentMessages.value = await loadLocale(locale)
    } finally {
      isLoading.value = false
    }
  }

  // 監聽語言變化
  watch(
    currentLocale,
    async newLocale => {
      await ensureLocaleLoaded(newLocale)
    },
    { immediate: true }
  )

  // 獲取當前訊息（同步，使用快取或預設語言）
  const messages = computed(() => currentMessages.value || getLocale(currentLocale.value))

  // 獲取翻譯文字的輔助函式
  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.')
    let value: unknown = messages.value

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        return key // 如果找不到翻譯，返回原始 key
      }
    }

    let result = typeof value === 'string' ? value : key

    // 替換引數佔位符
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
      })
    }

    return result
  }

  const setLocale = async (locale: Locale) => {
    // 預載入語言檔案
    await ensureLocaleLoaded(locale)
    // 然後切換
    gameStore.locale = locale
  }

  return {
    t,
    locale: currentLocale,
    setLocale,
    messages,
    isLoading: computed(() => isLoading.value)
  }
}
