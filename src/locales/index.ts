// 預設語言（打包在主包中）
import zhCN from './zh-CN'

export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'de' | 'ru' | 'ko' | 'ja' | 'es-LA'

export type TranslationSchema = typeof zhCN

// 語言載入器 - 使用動態匯入實現按需載入
// 注意: 各語言檔案可能有細微差異，缺失的鍵會在執行時回退到 key 本身
type LocaleModule = { default: TranslationSchema }
const localeLoaders: Record<Locale, () => Promise<LocaleModule>> = {
  'zh-CN': () => Promise.resolve({ default: zhCN }),
  'zh-TW': () => import('./zh-TW') as unknown as Promise<LocaleModule>,
  en: () => import('./en') as unknown as Promise<LocaleModule>,
  de: () => import('./de') as unknown as Promise<LocaleModule>,
  ru: () => import('./ru') as unknown as Promise<LocaleModule>,
  ko: () => import('./ko') as unknown as Promise<LocaleModule>,
  ja: () => import('./ja') as unknown as Promise<LocaleModule>,
  'es-LA': () => import('./es-LA') as unknown as Promise<LocaleModule>
}

// 已載入的語言快取
const loadedLocales: Partial<Record<Locale, TranslationSchema>> = {
  'zh-CN': zhCN // 預設語言預載入
}

/**
 * 非同步載入指定語言
 * @param locale 語系（如 zh-TW）
 * @returns 語言翻譯物件
 */
export const loadLocale = async (locale: Locale): Promise<TranslationSchema> => {
  // 如果已經載入過，直接返回快取
  if (loadedLocales[locale]) {
    return loadedLocales[locale]!
  }

  // 動態載入語言檔案
  const loader = localeLoaders[locale]
  if (!loader) {
    console.warn(`Locale "${locale}" not found, falling back to zh-CN`)
    return zhCN
  }

  try {
    const module = await loader()
    loadedLocales[locale] = module.default
    return module.default
  } catch (error) {
    console.error(`Failed to load locale "${locale}":`, error)
    return zhCN
  }
}

/**
 * 同步獲取已載入的語言（如果未載入則返回預設語言）
 * @param locale 語系（如 zh-TW）
 * @returns 語言翻譯物件
 */
export const getLocale = (locale: Locale): TranslationSchema => {
  return loadedLocales[locale] || zhCN
}

/**
 * 檢查語言是否已載入
 * @param locale 語系（如 zh-TW）
 */
export const isLocaleLoaded = (locale: Locale): boolean => {
  return locale in loadedLocales
}

export const localeNames: Record<Locale, string> = {
  'zh-CN': '簡體中文',
  'zh-TW': '繁體中文',
  en: 'English',
  de: 'Deutsch',
  ru: 'Русский',
  ko: '한국어',
  ja: '日本語',
  'es-LA': 'Español (LA)'
}

/**
 * 根據瀏覽器語言檢測並返回應用支援的語言
 * @returns 偵測到的語系
 */
export const detectBrowserLocale = (): Locale => {
  // 獲取瀏覽器語言
  const browserLang = navigator.language || (navigator.languages && navigator.languages[0]) || 'zh-CN'
  const lang = browserLang.toLowerCase()

  // 對映瀏覽器語言到應用支援的語言
  if (lang.startsWith('zh-tw') || lang.startsWith('zh-hant') || lang.startsWith('zh-hk') || lang.startsWith('zh-mo')) {
    return 'zh-TW'
  } else if (lang.startsWith('zh')) {
    return 'zh-CN'
  } else if (lang.startsWith('ja')) {
    return 'ja'
  } else if (lang.startsWith('ko')) {
    return 'ko'
  } else if (lang.startsWith('en')) {
    return 'en'
  } else if (lang.startsWith('de')) {
    return 'de'
  } else if (lang.startsWith('ru')) {
    return 'ru'
  } else if (lang.startsWith('es')) {
    return 'es-LA'
  }
  // 預設返回簡體中文
  return 'zh-CN'
}
