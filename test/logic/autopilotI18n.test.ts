import { describe, expect, it } from 'vitest'
import en from '@/locales/en'
import de from '@/locales/de'
import es from '@/locales/es-LA'
import ja from '@/locales/ja'
import ko from '@/locales/ko'
import ru from '@/locales/ru'
import zhCN from '@/locales/zh-CN'
import zhTW from '@/locales/zh-TW'

const flatten = (value: object, prefix = ''): Record<string, string> => Object.fromEntries(
  Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof entry === 'string' ? [[path, entry]] : Object.entries(flatten(entry, path))
  })
)
const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

describe('autopilot locale parity', () => {
  const reference = flatten(zhCN.autopilot)
  for (const [locale, dictionary] of Object.entries({ en, de, 'es-LA': es, ja, ko, ru, 'zh-CN': zhCN, 'zh-TW': zhTW })) {
    it(`${locale}: has the same nonempty keys and placeholders`, () => {
      const translated = flatten(dictionary.autopilot)
      expect(Object.keys(translated).sort()).toEqual(Object.keys(reference).sort())
      for (const [key, value] of Object.entries(translated)) {
        expect(value.trim(), key).not.toBe('')
        expect(placeholders(value), key).toEqual(placeholders(reference[key]!))
      }
    })
  }
})
