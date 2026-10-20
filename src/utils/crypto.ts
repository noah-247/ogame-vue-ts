import CryptoJS from 'crypto-js'
import pkg from '../../package.json'

// 資料加密
export const encryptData = (data: any): string => {
  try {
    const jsonStr = JSON.stringify(data)
    return CryptoJS.AES.encrypt(jsonStr, pkg.name).toString()
  } catch (error) {
    console.error(error)
  }
  return ''
}

// 資料解密
export const decryptData = (data: string, options: { throwOnError?: boolean } = {}): any => {
  try {
    const bytes = CryptoJS.AES.decrypt(data, pkg.name)
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8)
    return JSON.parse(decryptedStr)
  } catch (error) {
    if (options.throwOnError) throw error
    console.error(error)
    return {}
  }
}
