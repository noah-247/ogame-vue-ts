/**
 * 格式化數字為英文單位（K, M, B, T, Q）
 * @param num 數字
 * @param decimals 小數位數，預設2
 * @returns 格式化後的字串
 */
export const formatNumber = (num: number, decimals: number = 2): string => {
  if (num >= 1_000_000_000_000_000) {
    return (num / 1_000_000_000_000_000).toFixed(decimals) + 'Q'
  } else if (num >= 1_000_000_000_000) {
    return (num / 1_000_000_000_000).toFixed(decimals) + 'T'
  } else if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(decimals) + 'B'
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(decimals) + 'M'
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(decimals) + 'K'
  }
  return Math.floor(num).toString()
}

/**
 * 獲取資源顏色類（根據佔用率）
 * @param current 當前數量
 * @param max 最大容量
 * @returns Tailwind CSS 類名
 */
export const getResourceColor = (current: number, max: number): string => {
  const ratio = current / max
  if (ratio >= 1) return 'text-red-600 dark:text-red-400'
  if (ratio >= 0.7) return 'text-yellow-600 dark:text-yellow-400'
  return ''
}
/**
 * 格式化相對時間（用於顯示"多久之前"）
 * @param seconds 秒數
 * @param t 翻譯函式
 * @returns 格式化後的相對時間字串
 */
export const formatRelativeTime = (seconds: number, t: (key: string) => string): string => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (days > 0) {
    return `${days}${t('time.days')}${hours}${t('time.hours')}`
  }
  if (hours > 0) {
    return `${hours}${t('time.hours')}${minutes}${t('time.minutes')}`
  }
  if (minutes > 0) {
    return `${minutes}${t('time.minutes')}`
  }
  return `${secs}${t('time.seconds')}`
}

/**
 * 格式化時間（秒轉為 年:天:時:分:秒）
 * @param seconds 秒數
 * @returns 格式化後的時間字串
 * 例如：
 * 1:02:03:04:05
 * 02:03:04:05
 * 03:04:05
 */
export const formatTime = (seconds: number): string => {
  const YEAR = 365 * 86400
  const years = Math.floor(seconds / YEAR)
  seconds %= YEAR
  const days = Math.floor(seconds / 86400)
  seconds %= 86400
  const hours = Math.floor(seconds / 3600)
  seconds %= 3600
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const h = hours.toString().padStart(2, '0')
  const m = minutes.toString().padStart(2, '0')
  const s = secs.toString().padStart(2, '0')
  if (years > 0) {
    return `${years}:${days}:${h}:${m}:${s}`
  }
  if (days > 0) {
    return `${days}:${h}:${m}:${s}`
  }
  return `${h}:${m}:${s}`
}

/**
 * 格式化日期
 * @param timestamp 時間戳
 * @returns 格式化後的日期字串
 */
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 檢查資源是否充足並返回對應的顏色類
 * @param available 當前可用資源數量
 * @param required 所需資源數量
 * @returns Tailwind CSS 類名（資源不足時返回紅色）
 */
export const getResourceCostColor = (available: number, required: number): string => {
  if (available < required) {
    return 'text-red-600 dark:text-red-400'
  }
  return ''
}
