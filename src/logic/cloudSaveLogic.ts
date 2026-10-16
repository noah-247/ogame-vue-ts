import CryptoJS from 'crypto-js'
import pkg from '../../package.json'
import { decryptData, encryptData } from '@/utils/crypto'

export const DEFAULT_CLOUD_SAVE_URL = 'https://ogame-save.pagi.workers.dev'
export const CLOUD_SAVE_STORAGE_KEY = pkg.name
export const CLOUD_SAVE_STORAGE_KEYS = {
  game: CLOUD_SAVE_STORAGE_KEY,
  universe: `${CLOUD_SAVE_STORAGE_KEY}-universe`,
  npcs: `${CLOUD_SAVE_STORAGE_KEY}-npcs`
} as const
const DAY = 24 * 60 * 60 * 1000
const INTERVAL = 30 * 60 * 1000
const PREFIX = 'cloudSave.'
const MAX_BYTES = 1024 * 1024

type CloudSaveErrorCode =
  | 'invalidUsername'
  | 'passwordRequired'
  | 'passwordTooShort'
  | 'invalidUrl'
  | 'noLocalSave'
  | 'invalidLocalSave'
  | 'tooLarge'
  | 'rateLimited'
  | 'notFound'
  | 'unauthorized'
  | 'decryptFailed'
  | 'requestFailed'
  | 'storageFailed'

export class CloudSaveError extends Error {
  readonly code: CloudSaveErrorCode
  readonly retryAfter: number
  readonly remainingToday: number

  constructor(code: CloudSaveErrorCode, retryAfter = 0, remainingToday = 5) {
    super(code)
    this.code = code
    this.retryAfter = retryAfter
    this.remainingToday = remainingToday
  }
}

export interface CloudSaveCredentials {
  username: string
  password: string
  workerUrl: string
}

interface RateLimit {
  remainingToday: number
  retryAt: number
  observedAt: number
}

interface CloudSaveResponse {
  ciphertext?: string
  clientHash?: string
  updatedAt?: number
  remainingToday?: number
  retryAfter?: number
}

export const isValidCloudUsername = (username: string) => /^[a-zA-Z0-9_-]{3,20}$/.test(username)

const normalizeUrl = (value: string) => {
  try {
    const url = new URL(value.trim() || DEFAULT_CLOUD_SAVE_URL)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
      throw new Error()
    }
    return url.toString().replace(/\/+$/, '')
  } catch {
    throw new CloudSaveError('invalidUrl')
  }
}

const getScope = (username: string, workerUrl: string) => `${normalizeUrl(workerUrl)}/save/${username.toLowerCase()}`
const read = (key: string) => localStorage.getItem(PREFIX + key)
const write = (key: string, value: string | number) => localStorage.setItem(PREFIX + key, String(value))

export const loadCloudSaveWorkerUrl = () => {
  try {
    return normalizeUrl(read('workerUrl') || DEFAULT_CLOUD_SAVE_URL)
  } catch {
    return DEFAULT_CLOUD_SAVE_URL
  }
}

export const saveCloudSaveWorkerUrl = (value: string) => {
  const url = normalizeUrl(value)
  try {
    write('workerUrl', url)
  } catch {
    throw new CloudSaveError('storageFailed')
  }
  return url
}

const readJson = <Value>(key: string, fallback: Value): Value => {
  try {
    return JSON.parse(read(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

const readTimes = (now: number): number[] => {
  const times = readJson<unknown>('syncTimes', [])
  return Array.isArray(times) ? times.filter(time => typeof time === 'number' && Number.isFinite(time) && time > now - DAY) : []
}

const selectScope = (scope: string) => {
  if (read('scope') === scope) return
  for (const key of ['lastUploadedHash', 'lastSyncAt', 'day', 'dayCount', 'syncTimes', 'rateLimit', 'lastDownloadedAt']) {
    localStorage.removeItem(PREFIX + key)
  }
  write('scope', scope)
}

export const getCloudSaveStatus = (username: string, workerUrl: string, now = Date.now()) => {
  const empty = { lastSyncAt: 0, remainingToday: 5, retryAfter: 0 }
  try {
    if (read('scope') !== getScope(username, workerUrl)) return empty
    const times = readTimes(now).sort((first, second) => first - second)
    const lastUpload = Number(read('lastSyncAt')) || 0
    const rate = readJson<RateLimit | null>('rateLimit', null)
    const rateValid = rate && now < rate.observedAt + DAY && (rate.remainingToday > 0 || now < rate.retryAt)
    const dailyRetryAt = times.length >= 5 ? times[times.length - 5]! + DAY : 0
    const retryAt = Math.max(lastUpload ? lastUpload + INTERVAL : 0, dailyRetryAt, rate?.retryAt || 0)
    return {
      lastSyncAt: Math.max(lastUpload, Number(read('lastDownloadedAt')) || 0),
      remainingToday: Math.min(Math.max(0, 5 - times.length), rateValid ? rate.remainingToday : 5),
      retryAfter: Math.max(0, Math.ceil((retryAt - now) / 1000))
    }
  } catch {
    return empty
  }
}

const validate = (credentials: CloudSaveCredentials) => {
  if (!isValidCloudUsername(credentials.username)) throw new CloudSaveError('invalidUsername')
  if (!credentials.password) throw new CloudSaveError('passwordRequired')
  if (credentials.password.length < 8) throw new CloudSaveError('passwordTooShort')
  return getScope(credentials.username, credentials.workerUrl)
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

interface CloudSaveBundle {
  game: Record<string, unknown>
  universe: Record<string, unknown>
  npcs: Record<string, unknown>
}

const deriveKey = (password: string, username: string) =>
  CryptoJS.PBKDF2(password, username.toLowerCase(), { keySize: 256 / 32, iterations: 10000, hasher: CryptoJS.algo.SHA256 })

const deriveAuthKey = (credentials: CloudSaveCredentials) =>
  CryptoJS.PBKDF2(credentials.password, `auth:${credentials.username.toLowerCase()}`, { keySize: 256 / 32, iterations: 10000, hasher: CryptoJS.algo.SHA256 }).toString()

const encryptCloudState = async (plaintext: string, credentials: CloudSaveCredentials) => {
  const compressed = await new Response(new Blob([plaintext]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  const iv = CryptoJS.lib.WordArray.random(16)
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.lib.WordArray.create(new Uint8Array(compressed)), deriveKey(credentials.password, credentials.username), { iv })
  return JSON.stringify({ version: 2, compression: 'gzip', iv: iv.toString(), data: encrypted.toString() })
}

const decryptCloudState = async (ciphertext: string, clientHash: string, credentials: CloudSaveCredentials): Promise<CloudSaveBundle> => {
  try {
    const envelope = JSON.parse(ciphertext)
    if (envelope.version !== 2 || envelope.compression !== 'gzip' || !/^[a-f0-9]{32}$/.test(envelope.iv) || typeof envelope.data !== 'string') throw new Error()
    const decrypted = CryptoJS.AES.decrypt(envelope.data, deriveKey(credentials.password, credentials.username), {
      iv: CryptoJS.enc.Hex.parse(envelope.iv)
    })
    if (decrypted.sigBytes <= 0) throw new Error()
    const bytes = new Uint8Array(decrypted.sigBytes)
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = (decrypted.words[index >>> 2]! >>> (24 - (index % 4) * 8)) & 0xff
    }
    const plaintext = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    if (!plaintext || CryptoJS.SHA256(plaintext).toString() !== clientHash) throw new Error()
    const state: unknown = JSON.parse(plaintext)
    if (!isObject(state) || !isObject(state.game) || !isObject(state.universe) || !isObject(state.npcs)) throw new Error()
    return { game: state.game, universe: state.universe, npcs: state.npcs }
  } catch {
    throw new CloudSaveError('decryptFailed')
  }
}

const saveRateLimit = (scope: string, response: CloudSaveResponse, now: number) => {
  selectScope(scope)
  write('rateLimit', JSON.stringify({
    remainingToday: Math.max(0, Math.min(5, response.remainingToday ?? 5)),
    retryAt: now + Math.max(0, response.retryAfter ?? 0) * 1000,
    observedAt: now
  }))
}

const requestSave = async (scope: string, method: 'GET' | 'PUT', auth: string, payload?: { ciphertext: string; clientHash: string }) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(scope, {
      method,
      headers: payload ? { 'Content-Type': 'application/json' } : { Authorization: `Bearer ${auth}` },
      body: payload ? JSON.stringify({ ...payload, auth }) : undefined,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error'
    })
    if (response.status === 429) {
      const body = await response.json().catch(() => ({})) as CloudSaveResponse | null
      const retryAfter = Math.max(1, Math.ceil(Number(body?.retryAfter) || Number(response.headers.get('Retry-After')) || 1800))
      const remainingToday = Math.max(0, Math.min(5, Number(body?.remainingToday) || 0))
      saveRateLimit(scope, { retryAfter, remainingToday }, Date.now())
      throw new CloudSaveError('rateLimited', retryAfter, remainingToday)
    }
    if (response.status === 404) throw new CloudSaveError('notFound')
    if (response.status === 413) throw new CloudSaveError('tooLarge')
    if (response.status === 401) throw new CloudSaveError('unauthorized')
    if (!response.ok) throw new CloudSaveError('requestFailed')
    const body = await response.json() as CloudSaveResponse
    if (!response.ok || !body || typeof body !== 'object') throw new CloudSaveError('requestFailed')
    return body
  } catch (error) {
    if (error instanceof CloudSaveError) throw error
    throw new CloudSaveError('requestFailed')
  } finally {
    clearTimeout(timeout)
  }
}

export const uploadCloudSave = async (credentials: CloudSaveCredentials): Promise<'uploaded' | 'unchanged'> => {
  const scope = validate(credentials)
  const state = Object.fromEntries(Object.entries(CLOUD_SAVE_STORAGE_KEYS).map(([name, key]) => {
    const localSave = localStorage.getItem(key)
    if (name === 'game' && localSave === null) throw new CloudSaveError('noLocalSave')
    const storedState: unknown = localSave === null ? {} : decryptData(localSave)
    if (!isObject(storedState) || (name === 'game' && !isObject(storedState.player))) throw new CloudSaveError('invalidLocalSave')
    return [name, storedState]
  }))
  const plaintext = JSON.stringify(state)
  const clientHash = CryptoJS.SHA256(plaintext).toString()
  if (read('scope') === scope && read('lastUploadedHash') === clientHash) return 'unchanged'
  const status = getCloudSaveStatus(credentials.username, credentials.workerUrl)
  if (status.retryAfter > 0) throw new CloudSaveError('rateLimited', status.retryAfter, status.remainingToday)
  const ciphertext = await encryptCloudState(plaintext, credentials)
  if (new TextEncoder().encode(ciphertext).byteLength > MAX_BYTES) throw new CloudSaveError('tooLarge')
  const response = await requestSave(scope, 'PUT', deriveAuthKey(credentials), { ciphertext, clientHash })
  const now = Date.now()
  try {
    saveRateLimit(scope, response, now)
    const today = new Date(now).toISOString().slice(0, 10)
    const dayCount = read('day') === today ? Number(read('dayCount')) || 0 : 0
    write('syncTimes', JSON.stringify([...readTimes(now), now].slice(-10)))
    write('lastSyncAt', now)
    write('day', today)
    write('dayCount', dayCount + 1)
    write('lastUploadedHash', clientHash)
  } catch {
    throw new CloudSaveError('storageFailed')
  }
  return 'uploaded'
}

export const downloadCloudSave = async (credentials: CloudSaveCredentials, gameStore: { isPaused: boolean }) => {
  const scope = validate(credentials)
  const wasPaused = gameStore.isPaused
  gameStore.isPaused = true
  const originals = new Map<string, string | null>()
  try {
    const response = await requestSave(scope, 'GET', deriveAuthKey(credentials))
    if (typeof response.ciphertext !== 'string' || typeof response.clientHash !== 'string') throw new CloudSaveError('requestFailed')
    const state = await decryptCloudState(response.ciphertext, response.clientHash, credentials)
    const entries = Object.entries(CLOUD_SAVE_STORAGE_KEYS).map(([name, key]) => {
      const encrypted = encryptData(state[name as keyof CloudSaveBundle])
      if (!encrypted) throw new CloudSaveError('storageFailed')
      return [key, encrypted] as const
    })
    const timestamp = Date.now()
    const backupKeys: string[] = []
    try {
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index)
        if (key?.includes('-cloudbackup-')) localStorage.removeItem(key)
      }
      for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) {
        const original = localStorage.getItem(key)
        originals.set(key, original)
        const backup = original ?? encryptData({})
        if (original === null && !backup) throw new CloudSaveError('storageFailed')
        const backupKey = `${key}-cloudbackup-${timestamp}`
        localStorage.setItem(backupKey, backup)
        backupKeys.push(backupKey)
      }
    } catch {
      for (const key of backupKeys) {
        try { localStorage.removeItem(key) } catch {}
      }
      throw new CloudSaveError('storageFailed')
    }
    try {
      selectScope(scope)
      write('lastDownloadedAt', Date.now())
      for (const [key, encrypted] of entries) localStorage.setItem(key, encrypted)
      write('lastUploadedHash', response.clientHash)
      window.location.reload()
    } catch {
      for (const [key, original] of originals) {
        try {
          if (original === null) localStorage.removeItem(key)
          else localStorage.setItem(key, original)
        } catch {}
      }
      throw new CloudSaveError('storageFailed')
    }
  } catch (error) {
    gameStore.isPaused = wasPaused
    throw error
  }
}
