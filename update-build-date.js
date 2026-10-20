import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJsonPath = join(__dirname, 'package.json')

try {
  // 讀取 package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  // 更新構建日期
  packageJson.buildDate = new Date().toLocaleString()
  // 寫回 package.json (保持格式化，縮排2個空格)
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8')
} catch (error) {
  console.error('Failed to update build date:', error)
  process.exit(1)
}
