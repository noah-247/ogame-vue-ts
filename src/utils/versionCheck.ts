import pkg from '../../package.json'

export interface VersionInfo {
  version: string
  releaseNotes: string
  downloadUrl: string
}

// 檢查GitHub最新版本
export const checkLatestVersion = async (lastCheckTime: number, updateCheckTime: (time: number) => void): Promise<VersionInfo | null> => {
  const now = Date.now()
  const oneHour = 60 * 60 * 1000 // 1小時

  // 如果距離上次檢查不到1小時，跳過
  if (now - lastCheckTime < oneHour) {
    return null
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${pkg.author.name}/${pkg.name}/releases/latest`)

    if (!response.ok) {
      console.error('Failed to fetch latest version:', response.status)
      // 更新檢查時間，避免頻繁請求失敗的API
      updateCheckTime(now)
      throw new Error(`Failed to fetch version: ${response.status}`)
    }

    const data = await response.json()
    const githubVersion = data.tag_name?.replace(/^v/, '') // 移除開頭的 'v' (如 v1.2.0 -> 1.2.0)

    // 更新最後檢查時間
    updateCheckTime(now)

    // 比較版本號
    if (githubVersion && githubVersion !== pkg.version) {
      return {
        version: githubVersion,
        releaseNotes: data.body || '',
        downloadUrl: `https://github.com/${pkg.author.name}/${pkg.name}/releases/latest`
      }
    }
    return null
  } catch (error) {
    console.error('Error checking version:', error)
    // 更新檢查時間，避免頻繁請求失敗的API
    updateCheckTime(now)
    throw error
  }
}

// 檢查是否可以進行版本檢查（距離上次檢查是否超過1小時）
export const canCheckVersion = (lastCheckTime: number): boolean => {
  const now = Date.now()
  const oneHour = 60 * 60 * 1000 // 1小時
  return now - lastCheckTime >= oneHour
}
