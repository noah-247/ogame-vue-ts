/**
 * WebDAV 同步服務
 * 支援將存檔上傳到 WebDAV 伺服器（如堅果雲、Nextcloud、NAS等）
 * 注意：WebDAV 配置儲存在 gameStore.webdavConfig 中，與使用者資料一起持久化
 */

import type { WebDAVConfig } from '@/types/game'

// 重新匯出型別以保持向後相容
export type { WebDAVConfig }

export interface WebDAVFile {
  name: string
  path: string
  size: number
  lastModified: Date
  isDirectory: boolean
}

// WebDAV 訊息 key（用於 i18n）
export const WebDAVMessageKey = {
  // 連線相關
  connectionSuccess: 'webdav.connectionSuccess',
  connectionSuccessDirectoryCreated: 'webdav.connectionSuccessDirectoryCreated',
  authFailed: 'webdav.authFailed',
  directoryNotExist: 'webdav.directoryNotExist',
  connectionFailedHttp: 'webdav.connectionFailedHttp',
  networkError: 'webdav.networkError',
  connectionError: 'webdav.connectionError',

  // 上傳相關
  uploadSuccess: 'webdav.uploadSuccess',
  noWritePermission: 'webdav.noWritePermission',
  insufficientStorage: 'webdav.insufficientStorage',
  uploadFailedHttp: 'webdav.uploadFailedHttp',
  uploadError: 'webdav.uploadError',

  // 下載相關
  fileNotExist: 'webdav.fileNotExist',
  downloadFailedHttp: 'webdav.downloadFailedHttp',
  downloadError: 'webdav.downloadError',

  // 列表相關
  listFailedHttp: 'webdav.listFailedHttp',
  listError: 'webdav.listError',

  // 刪除相關
  deleteFailedHttp: 'webdav.deleteFailedHttp',
  deleteError: 'webdav.deleteError'
} as const

export type WebDAVMessageKeyType = (typeof WebDAVMessageKey)[keyof typeof WebDAVMessageKey]

export interface WebDAVResult {
  success: boolean
  messageKey: WebDAVMessageKeyType
  messageParams?: Record<string, string | number>
  fileName?: string
  data?: string
  files?: WebDAVFile[]
}

// 構建 Authorization header
const buildAuthHeader = (config: WebDAVConfig): string => {
  const credentials = btoa(`${config.username}:${config.password}`)
  return `Basic ${credentials}`
}

// 規範化 URL 路徑
const normalizePath = (serverUrl: string, basePath: string, fileName?: string): string => {
  let url = serverUrl.replace(/\/+$/, '')
  let path = basePath.replace(/^\/+/, '').replace(/\/+$/, '')

  if (path) {
    url = `${url}/${path}`
  }

  if (fileName) {
    url = `${url}/${fileName}`
  }

  return url
}

// 測試 WebDAV 連線
export const testWebDAVConnection = async (config: WebDAVConfig): Promise<WebDAVResult> => {
  try {
    const url = normalizePath(config.serverUrl, config.basePath)

    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildAuthHeader(config),
        Depth: '0',
        'Content-Type': 'application/xml'
      }
    })

    if (response.ok || response.status === 207) {
      return { success: true, messageKey: WebDAVMessageKey.connectionSuccess }
    }

    if (response.status === 401) {
      return { success: false, messageKey: WebDAVMessageKey.authFailed }
    }

    if (response.status === 404) {
      // 嘗試建立目錄
      const createResult = await createDirectory(config, config.basePath)
      if (createResult) {
        return { success: true, messageKey: WebDAVMessageKey.connectionSuccessDirectoryCreated }
      }
      return { success: false, messageKey: WebDAVMessageKey.directoryNotExist }
    }

    return { success: false, messageKey: WebDAVMessageKey.connectionFailedHttp, messageParams: { status: response.status } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // CORS 錯誤的處理
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return { success: false, messageKey: WebDAVMessageKey.networkError }
    }
    return { success: false, messageKey: WebDAVMessageKey.connectionError, messageParams: { error: errorMessage } }
  }
}

// 建立目錄
const createDirectory = async (config: WebDAVConfig, path: string): Promise<boolean> => {
  try {
    const url = normalizePath(config.serverUrl, path)

    const response = await fetch(url, {
      method: 'MKCOL',
      headers: {
        Authorization: buildAuthHeader(config)
      }
    })

    return response.ok || response.status === 201
  } catch (error) {
    console.error('Failed to create directory:', error)
    return false
  }
}

// 上傳存檔到 WebDAV
export const uploadToWebDAV = async (config: WebDAVConfig, data: string, fileName?: string): Promise<WebDAVResult> => {
  try {
    // 生成帶時間戳的檔名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const actualFileName = fileName || `ogame-save-${timestamp}.json`
    const url = normalizePath(config.serverUrl, config.basePath, actualFileName)

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: buildAuthHeader(config),
        'Content-Type': 'application/json'
      },
      body: data
    })

    if (response.ok || response.status === 201 || response.status === 204) {
      return { success: true, messageKey: WebDAVMessageKey.uploadSuccess, fileName: actualFileName }
    }

    if (response.status === 401) {
      return { success: false, messageKey: WebDAVMessageKey.authFailed }
    }

    if (response.status === 403) {
      return { success: false, messageKey: WebDAVMessageKey.noWritePermission }
    }

    if (response.status === 507) {
      return { success: false, messageKey: WebDAVMessageKey.insufficientStorage }
    }

    return { success: false, messageKey: WebDAVMessageKey.uploadFailedHttp, messageParams: { status: response.status } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, messageKey: WebDAVMessageKey.uploadError, messageParams: { error: errorMessage } }
  }
}

// 解析 PROPFIND XML 響應
const parsePropfindResponse = (xml: string, _basePath: string): WebDAVFile[] => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const responses = doc.getElementsByTagNameNS('DAV:', 'response')
  const files: WebDAVFile[] = []

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i]
    if (!response) continue
    const href = response.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || ''
    const displayName = response.getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent
    const contentLength = response.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent
    const lastModified = response.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent
    const resourceType = response.getElementsByTagNameNS('DAV:', 'resourcetype')[0]
    const isCollection = resourceType ? resourceType.getElementsByTagNameNS('DAV:', 'collection').length > 0 : false

    // 解碼 URL 編碼的路徑
    const decodedHref = decodeURIComponent(href)
    const fileName = displayName || decodedHref.split('/').filter(Boolean).pop() || ''

    // 跳過目錄本身和非 JSON 檔案
    if (isCollection) continue
    if (!fileName.endsWith('.json')) continue

    files.push({
      name: fileName,
      path: decodedHref,
      size: parseInt(contentLength || '0', 10),
      lastModified: lastModified ? new Date(lastModified) : new Date(),
      isDirectory: false
    })
  }

  // 按修改時間降序排序（最新的在前）
  return files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
}

// 列出 WebDAV 目錄中的存檔檔案
export const listWebDAVFiles = async (config: WebDAVConfig): Promise<WebDAVResult> => {
  try {
    const url = normalizePath(config.serverUrl, config.basePath)

    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildAuthHeader(config),
        Depth: '1',
        'Content-Type': 'application/xml'
      }
    })

    if (!response.ok && response.status !== 207) {
      if (response.status === 401) {
        return { success: false, messageKey: WebDAVMessageKey.authFailed }
      }
      if (response.status === 404) {
        return { success: false, messageKey: WebDAVMessageKey.directoryNotExist }
      }
      return { success: false, messageKey: WebDAVMessageKey.listFailedHttp, messageParams: { status: response.status } }
    }

    const xml = await response.text()
    const files = parsePropfindResponse(xml, config.basePath)

    return { success: true, messageKey: WebDAVMessageKey.connectionSuccess, files }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, messageKey: WebDAVMessageKey.listError, messageParams: { error: errorMessage } }
  }
}

// 從 WebDAV 下載存檔
export const downloadFromWebDAV = async (config: WebDAVConfig, fileName: string): Promise<WebDAVResult> => {
  try {
    const url = normalizePath(config.serverUrl, config.basePath, fileName)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config)
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, messageKey: WebDAVMessageKey.authFailed }
      }
      if (response.status === 404) {
        return { success: false, messageKey: WebDAVMessageKey.fileNotExist }
      }
      return { success: false, messageKey: WebDAVMessageKey.downloadFailedHttp, messageParams: { status: response.status } }
    }

    const data = await response.text()
    return { success: true, messageKey: WebDAVMessageKey.connectionSuccess, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, messageKey: WebDAVMessageKey.downloadError, messageParams: { error: errorMessage } }
  }
}

// 刪除 WebDAV 檔案
export const deleteFromWebDAV = async (config: WebDAVConfig, fileName: string): Promise<WebDAVResult> => {
  try {
    const url = normalizePath(config.serverUrl, config.basePath, fileName)

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: buildAuthHeader(config)
      }
    })

    if (response.ok || response.status === 204) {
      return { success: true, messageKey: WebDAVMessageKey.connectionSuccess }
    }

    if (response.status === 401) {
      return { success: false, messageKey: WebDAVMessageKey.authFailed }
    }

    if (response.status === 404) {
      return { success: true, messageKey: WebDAVMessageKey.connectionSuccess } // 檔案不存在也視為刪除成功
    }

    return { success: false, messageKey: WebDAVMessageKey.deleteFailedHttp, messageParams: { status: response.status } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, messageKey: WebDAVMessageKey.deleteError, messageParams: { error: errorMessage } }
  }
}
