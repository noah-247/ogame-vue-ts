import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, test } from 'node:test'
import { createApp, nextTick } from 'vue'
import { createPinia, defineStore } from 'pinia'
import persistedstate from 'pinia-plugin-persistedstate'
import CryptoJS from 'crypto-js'
import worker from '../cloud-save-worker/worker.js'
import {
  CLOUD_SAVE_STORAGE_KEY, CLOUD_SAVE_STORAGE_KEYS, CloudSaveError, DEFAULT_CLOUD_SAVE_URL,
  downloadCloudSave, getCloudSaveStatus, loadCloudSaveWorkerUrl,
  saveCloudSaveWorkerUrl, uploadCloudSave
} from '../src/logic/cloudSaveLogic'
import { decryptData, encryptData } from '../src/utils/crypto'

const DAY = 86400000
const INTERVAL = 1800000
const originalNow = Date.now
const originalFetch = globalThis.fetch
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
let now: number
let values: Map<string, string>
let records: Map<string, string>
let writes: number
let requests: Request[]
let password: string
let gameStore: { isPaused: boolean }
let reloads: number
const state = { player: { id: 'test', planets: [] }, currentPlanetId: '', gameSpeed: 1 }
const universe = { galaxies: [{ id: 1, systems: [1, 2, 3] }] }
const npcs = { npcs: [{ id: 'npc-1', name: '測試 NPC', planets: [] }] }
const bundle = { game: state, universe, npcs }
const credentials = () => ({ username: 'tester', password, workerUrl: DEFAULT_CLOUD_SAVE_URL })
const authKey = () => CryptoJS.PBKDF2(password, 'auth:tester', { keySize: 256 / 32, iterations: 10000, hasher: CryptoJS.algo.SHA256 }).toString()
const download = (options = credentials()) => downloadCloudSave(options, gameStore)
const decodeBundle = (ciphertext: string) => {
  const envelope = JSON.parse(ciphertext)
  assert.equal(envelope.version, 2)
  assert.equal(envelope.compression, 'gzip')
  const key = CryptoJS.PBKDF2(password, 'tester', { keySize: 256 / 32, iterations: 10000, hasher: CryptoJS.algo.SHA256 })
  const compressed = CryptoJS.AES.decrypt(envelope.data, key, { iv: CryptoJS.enc.Hex.parse(envelope.iv) })
  return JSON.parse(gunzipSync(Buffer.from(compressed.toString(CryptoJS.enc.Hex), 'hex')).toString())
}
const encodeBundle = (value: unknown, secret = password) => {
  const plaintext = JSON.stringify(value)
  const iv = CryptoJS.lib.WordArray.random(16)
  const key = CryptoJS.PBKDF2(secret, 'tester', { keySize: 256 / 32, iterations: 10000, hasher: CryptoJS.algo.SHA256 })
  const data = CryptoJS.AES.encrypt(CryptoJS.lib.WordArray.create(gzipSync(plaintext)), key, { iv }).toString()
  return { ciphertext: JSON.stringify({ version: 2, compression: 'gzip', iv: iv.toString(), data }), clientHash: CryptoJS.SHA256(plaintext).toString() }
}
const env = {
  SAVES: {
    async get(key: string) { return JSON.parse(records.get(key) || 'null') },
    async put(key: string, value: string) { writes++; records.set(key, value) }
  }
}
const request = (path: string, method = 'GET', body?: unknown, auth: string | null = authKey()) => worker.fetch(new Request(`https://worker.test${path}`, {
  method,
  headers: method === 'GET' && auth !== null ? { Authorization: `Bearer ${auth}` } : undefined,
  body: body === undefined ? undefined : JSON.stringify(auth !== null && body && typeof body === 'object' && !Array.isArray(body) ? { ...body, auth } : body)
}), env)
const seed = (times: number[]) => records.set('save:tester', JSON.stringify({
  authHash: CryptoJS.SHA256(authKey()).toString(), ciphertext: 'opaque', clientHash: 'hash', updatedAt: times.at(-1), syncTimes: times
}))
const expectError = (code: string) => (error: unknown) => error instanceof CloudSaveError && error.code === code

beforeEach(() => {
  now = Date.UTC(2026, 9, 16, 12)
  Date.now = () => now
  values = new Map()
  records = new Map()
  writes = 0
  requests = []
  password = randomUUID()
  gameStore = { isPaused: false }
  reloads = 0
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size },
      clear: () => values.clear()
    }
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { reload: () => { reloads++ } } }
  })
  globalThis.fetch = async (url, options) => {
    const incoming = new Request(String(url), options)
    requests.push(incoming.clone())
    return worker.fetch(incoming, env)
  }
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData(state))
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEYS.universe, encryptData(universe))
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEYS.npcs, encryptData(npcs))
})

afterEach(() => {
  Date.now = originalNow
  globalThis.fetch = originalFetch
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

test('health and OPTIONS include CORS and do not write KV', async () => {
  const health = await request('/health')
  assert.deepEqual(await health.json(), { ok: true })
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), '*')
  const preflight = await request('/save/tester', 'OPTIONS')
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('Access-Control-Allow-Methods')!, /PUT/)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers')!, /Authorization/)
  assert.equal(writes, 0)
})

test('invalid usernames, methods and missing saves return appropriate errors with CORS', async () => {
  for (const username of ['ab', 'a'.repeat(21), 'has%20space', '%E4%B8%AD%E6%96%87', '%ZZ', 'name%2Fpart']) {
    const response = await request(`/save/${username}`)
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  }
  assert.equal((await request('/save/tester', 'DELETE')).status, 405)
  const missing = await request('/save/tester')
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: 'not_found' })
})

test('PUT validates JSON, required fields and UTF-8 ciphertext size before writing', async () => {
  const malformed = await worker.fetch(new Request('https://worker.test/save/tester', { method: 'PUT', body: '{' }), env)
  assert.equal(malformed.status, 400)
  for (const payload of [null, false, [], {}, { ciphertext: 12, clientHash: 'hash' }, { ciphertext: '', clientHash: 'hash' }, { ciphertext: 'data' }]) {
    assert.equal((await request('/save/tester', 'PUT', payload)).status, 400)
  }
  assert.equal((await request('/save/tester', 'PUT', { ciphertext: 'a'.repeat(1024 * 1024 + 1), clientHash: 'hash' })).status, 413)
  assert.equal((await request('/save/tester', 'PUT', { ciphertext: '中'.repeat(350000), clientHash: 'hash' })).status, 413)
  assert.equal(writes, 0)
})

test('PUT accepts exactly 1 MiB and stores ciphertext untouched using one write', async () => {
  const ciphertext = 'a'.repeat(1024 * 1024)
  const result = await request('/save/tester', 'PUT', { ciphertext, clientHash: 'hash' })
  assert.equal(result.status, 200)
  assert.equal(writes, 1)
  const record = JSON.parse(records.get('save:tester')!)
  assert.deepEqual(record, { authHash: CryptoJS.SHA256(authKey()).toString(), ciphertext, clientHash: 'hash', updatedAt: now, syncTimes: [now] })
  assert.deepEqual(await (await request('/save/tester')).json(), { ciphertext, clientHash: 'hash', updatedAt: now })
  assert.equal(writes, 1)
})

test('GET and PUT reject missing, malformed or incorrect auth without exposing data or consuming quota', async () => {
  const payload = { ciphertext: 'private ciphertext', clientHash: 'hash' }
  assert.equal((await request('/save/tester', 'PUT', payload)).status, 200)
  const original = records.get('save:tester')
  const validAuth = authKey()
  const firstByteMismatch = `${validAuth[0] === '0' ? '1' : '0'}${validAuth.slice(1)}`
  const lastByteMismatch = `${validAuth.slice(0, -1)}${validAuth.at(-1) === '0' ? '1' : '0'}`
  for (const auth of [null, '', 'bad', '0'.repeat(64), lastByteMismatch, firstByteMismatch]) {
    for (const method of ['GET', 'PUT']) {
      const result = await request('/save/tester', method, method === 'PUT' ? payload : undefined, auth)
      assert.equal(result.status, 401)
      assert.deepEqual(await result.json(), { error: 'unauthorized' })
      assert.equal(result.headers.get('Access-Control-Allow-Origin'), '*')
    }
  }
  assert.equal(records.get('save:tester'), original)
  assert.equal(writes, 1)
  now += INTERVAL
  assert.equal((await request('/save/tester', 'PUT', { ...payload, ciphertext: 'updated' })).status, 200)
  assert.equal(writes, 2)
  assert.equal(JSON.parse(records.get('save:tester')!).authHash, CryptoJS.SHA256(authKey()).toString())
})

test('first PUT requires auth and legacy records without authHash cannot be claimed', async () => {
  const payload = { ciphertext: 'data', clientHash: 'hash' }
  assert.equal((await request('/save/tester', 'PUT', payload, null)).status, 401)
  assert.equal((await request('/save/tester', 'GET', undefined, null)).status, 401)
  assert.equal(records.size, 0)
  records.set('save:tester', JSON.stringify(payload))
  for (const method of ['GET', 'PUT']) {
    assert.equal((await request('/save/tester', method, method === 'PUT' ? payload : undefined)).status, 401)
  }
  assert.equal(writes, 0)
})

test('client and Worker normalize username case for encryption, authentication, storage and cooldown', async () => {
  await uploadCloudSave({ ...credentials(), username: 'TeStEr' })
  assert.equal(new URL(requests[0].url).pathname, '/save/tester')
  assert.equal(records.has('save:TeStEr'), false)
  assert.deepEqual(decodeBundle(JSON.parse(records.get('save:tester')!).ciphertext), bundle)
  assert.equal((await request('/save/TESTER')).status, 200)
  assert.equal(await uploadCloudSave(credentials()), 'unchanged')
  assert.equal(requests.length, 1)
  assert.deepEqual(getCloudSaveStatus('TESTER', DEFAULT_CLOUD_SAVE_URL), getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL))
  await download({ ...credentials(), username: 'TESTER' })
  assert.equal(reloads, 1)
  assert.deepEqual(decryptData(localStorage.getItem(CLOUD_SAVE_STORAGE_KEY)!), state)
  assert.equal((await request('/save/TeStEr', 'PUT', { ciphertext: 'data', clientHash: 'hash' }, '0'.repeat(64))).status, 401)
})

test('30-minute interval is enforced and the exact boundary is accepted', async () => {
  seed([now - INTERVAL + 1000])
  const blocked = await request('/save/tester', 'PUT', { ciphertext: 'data', clientHash: 'hash' })
  assert.equal(blocked.status, 429)
  assert.deepEqual(await blocked.json(), { error: 'rate_limited', reason: 'too_frequent', retryAfter: 1, remainingToday: 4 })
  assert.equal(blocked.headers.get('Retry-After'), '1')
  assert.equal(writes, 0)
  now += 1000
  assert.equal((await request('/save/tester', 'PUT', { ciphertext: 'data', clientHash: 'hash' })).status, 200)
})

test('five uploads use a rolling 24-hour window, not a midnight reset', async () => {
  const times = [now - DAY + 1000, now - 4 * INTERVAL, now - 3 * INTERVAL, now - 2 * INTERVAL, now - INTERVAL]
  seed(times)
  const blocked = await request('/save/tester', 'PUT', { ciphertext: 'data', clientHash: 'hash' })
  assert.equal(blocked.status, 429)
  assert.deepEqual(await blocked.json(), { error: 'rate_limited', reason: 'daily_limit', retryAfter: 1, remainingToday: 0 })
  assert.equal(writes, 0)
  now += 1000
  const accepted = await request('/save/tester', 'PUT', { ciphertext: 'data', clientHash: 'hash' })
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).remainingToday, 0)
  assert.equal(JSON.parse(records.get('save:tester')!).syncTimes.length, 5)
})

test('expired timestamps are removed and daily retry also respects the interval', async () => {
  seed([now - DAY, now - 1])
  const blocked = await request('/save/tester', 'PUT', { ciphertext: 'data', clientHash: 'hash' })
  assert.equal((await blocked.json()).remainingToday, 4)
  seed([now - DAY + 1000, now - 4 * INTERVAL, now - 3 * INTERVAL, now - 2 * INTERVAL, now - 1])
  const daily = await request('/save/tester', 'PUT', { ciphertext: 'data', clientHash: 'hash' })
  assert.equal((await daily.json()).retryAfter, 1800)
})

test('KV failures return a generic error without leaking internals', async () => {
  const response = await worker.fetch(new Request('https://worker.test/save/tester', { headers: { Authorization: `Bearer ${authKey()}` } }), {
    SAVES: { async get() { throw new Error('private details') } }
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'internal_error' })
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
})

test('upload derives separate encryption/auth keys, compresses all states and does not persist credentials', async () => {
  assert.equal(await uploadCloudSave(credentials()), 'uploaded')
  const payload = await requests[0].json()
  assert.deepEqual(Object.keys(payload).sort(), ['auth', 'ciphertext', 'clientHash'])
  assert.equal(payload.auth, authKey())
  assert.equal(payload.clientHash, CryptoJS.SHA256(JSON.stringify(bundle)).toString())
  assert.ok(!JSON.stringify(payload).includes(password))
  assert.ok(!JSON.stringify(payload).includes('currentPlanetId'))
  assert.ok(!JSON.stringify([...values]).includes(password))
  assert.ok(!JSON.stringify([...values]).includes(payload.auth))
  assert.deepEqual(decodeBundle(payload.ciphertext), bundle)
  assert.equal(values.get('cloudSave.lastUploadedHash'), payload.clientHash)
  assert.equal(values.get('cloudSave.dayCount'), '1')
  assert.deepEqual(getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL), { lastSyncAt: now, remainingToday: 4, retryAfter: 1800 })
})

test('encryption and authentication explicitly derive keys with SHA256 instead of library defaults', async context => {
  const derive = CryptoJS.PBKDF2
  context.mock.method(CryptoJS, 'PBKDF2', (...args: Parameters<typeof derive>) => {
    assert.equal(args[2]?.hasher, CryptoJS.algo.SHA256)
    return derive(...args)
  })
  await uploadCloudSave(credentials())
  await download()
  assert.equal(reloads, 1)
})

test('unchanged state does not make another request even when local encryption is randomized', async () => {
  await uploadCloudSave(credentials())
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData(state))
  assert.equal(await uploadCloudSave(credentials()), 'unchanged')
  assert.equal(requests.length, 1)
})

test('different usernames and Worker endpoints do not share upload hash or cooldown', async () => {
  await uploadCloudSave(credentials())
  assert.equal(await uploadCloudSave({ ...credentials(), username: 'another' }), 'uploaded')
  records.clear()
  assert.equal(await uploadCloudSave({ ...credentials(), workerUrl: 'https://other.test' }), 'uploaded')
  assert.equal(requests.length, 3)
})

test('changed state is locally rate-limited and cooldown survives a midnight crossing', async () => {
  now = Date.UTC(2026, 9, 16, 23, 59)
  await uploadCloudSave(credentials())
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData({ ...state, gameSpeed: 2 }))
  now += 60000
  await assert.rejects(uploadCloudSave(credentials()), expectError('rateLimited'))
  assert.equal(requests.length, 1)
  assert.equal(getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL).retryAfter, 1740)
})

test('fifth local upload disables uploads until the oldest timestamp expires', async () => {
  for (let index = 0; index < 5; index++) {
    localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData({ ...state, gameSpeed: index + 1 }))
    await uploadCloudSave(credentials())
    now += INTERVAL
  }
  const status = getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL)
  assert.equal(status.remainingToday, 0)
  assert.equal(status.retryAfter, (DAY - 5 * INTERVAL) / 1000)
  now += DAY
  assert.equal(getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL).remainingToday, 5)
})

test('server 429 retryAfter and remainingToday update the local display without a KV write', async () => {
  seed([now - 1000])
  await assert.rejects(uploadCloudSave(credentials()), expectError('rateLimited'))
  const status = getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL)
  assert.equal(status.retryAfter, 1799)
  assert.equal(status.remainingToday, 4)
  assert.equal(writes, 0)
})

test('download restores local-key encryption, including during an upload cooldown', async () => {
  await uploadCloudSave(credentials())
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData({ ...state, gameSpeed: 9 }))
  await download()
  assert.deepEqual(decryptData(localStorage.getItem(CLOUD_SAVE_STORAGE_KEY)!), state)
  assert.equal(requests[1].method, 'GET')
  assert.equal(requests[1].headers.get('Authorization'), `Bearer ${authKey()}`)
  assert.equal(new URL(requests[1].url).search, '')
  assert.equal(gameStore.isPaused, true)
  assert.equal(reloads, 1)
  assert.equal(writes, 1)
})

test('a download persists its hash before reload and skips the first unchanged upload without consuming quota', async () => {
  const remote = encodeBundle(bundle)
  records.set('save:tester', JSON.stringify({ ...remote, authHash: CryptoJS.SHA256(authKey()).toString() }))
  values.set('cloudSave.scope', 'https://other.test/save/another')
  values.set('cloudSave.lastUploadedHash', 'stale hash')
  window.location.reload = () => {
    assert.equal(values.get('cloudSave.lastUploadedHash'), remote.clientHash)
    reloads++
  }
  await download()
  assert.equal(await uploadCloudSave(credentials()), 'unchanged')
  assert.equal(requests.length, 1)
  assert.equal(writes, 0)
  assert.equal(reloads, 1)
  assert.deepEqual(getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL), { lastSyncAt: now, remainingToday: 5, retryAfter: 0 })
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData({ ...state, gameSpeed: 2 }))
  assert.equal(await uploadCloudSave(credentials()), 'uploaded')
  assert.equal(writes, 1)
})

test('three-save round-trip pauses before fetch, then backs up and replaces all keys without yielding', async () => {
  await uploadCloudSave(credentials())
  const originals = new Map<string, string>()
  for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) {
    const local = encryptData({ localOnly: key })
    localStorage.setItem(key, local)
    originals.set(key, local)
  }
  const fetchWorker = globalThis.fetch
  globalThis.fetch = async (...args) => {
    assert.equal(gameStore.isPaused, true)
    assert.equal([...values.keys()].some(key => key.includes('-cloudbackup-')), false)
    return fetchWorker(...args)
  }
  const setItem = localStorage.setItem
  let yielded = false
  const replaced: string[] = []
  localStorage.setItem = (key, value) => {
    if (Object.values(CLOUD_SAVE_STORAGE_KEYS).includes(key)) {
      for (const [originalKey, original] of originals) assert.equal(localStorage.getItem(`${originalKey}-cloudbackup-${now}`), original)
      replaced.push(key)
      queueMicrotask(() => { yielded = true })
    }
    setItem(key, value)
  }
  window.location.reload = () => {
    assert.equal(yielded, false)
    assert.deepEqual(replaced, Object.values(CLOUD_SAVE_STORAGE_KEYS))
    for (const [name, key] of Object.entries(CLOUD_SAVE_STORAGE_KEYS)) {
      assert.deepEqual(decryptData(localStorage.getItem(key)!), bundle[name as keyof typeof bundle])
    }
    reloads++
  }
  await download()
  assert.equal(reloads, 1)
  assert.equal(gameStore.isPaused, true)
})

test('successful downloads remove every old backup before writing and retain only the latest group', async () => {
  await uploadCloudSave(credentials())
  for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) {
    values.set(`${key}-cloudbackup-${now - DAY}`, 'old backup')
    values.set(`${key}-cloudbackup-${now - INTERVAL}`, 'another old backup')
  }
  values.set('legacy-save-cloudbackup-old', 'legacy backup')
  values.set('unrelated-setting', 'keep')
  const setItem = localStorage.setItem
  const originals = new Map<string, string>()
  localStorage.setItem = (key, value) => {
    if (key.includes('-cloudbackup-')) {
      assert.ok([...values.keys()].filter(storedKey => storedKey.includes('-cloudbackup-')).every(storedKey => storedKey.endsWith(`-cloudbackup-${now}`)))
    }
    setItem(key, value)
  }
  for (let index = 0; index < 2; index++) {
    now += 1000
    for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) {
      const local = encryptData({ localOnly: key, index })
      localStorage.setItem(key, local)
      originals.set(key, local)
    }
    await download()
    assert.deepEqual([...values.keys()].filter(key => key.includes('-cloudbackup-')).sort(),
      Object.values(CLOUD_SAVE_STORAGE_KEYS).map(key => `${key}-cloudbackup-${now}`).sort())
    for (const [key, original] of originals) assert.equal(localStorage.getItem(`${key}-cloudbackup-${now}`), original)
    assert.equal(values.get('unrelated-setting'), 'keep')
  }
  assert.equal(reloads, 2)
})

test('real Pinia persistence subscribers cannot overwrite restored saves before reload', async () => {
  await uploadCloudSave(credentials())
  const pinia = createPinia().use(persistedstate)
  const app = createApp({})
  app.use(pinia)
  const stores = Object.entries(CLOUD_SAVE_STORAGE_KEYS).map(([name, key]) => defineStore(`cloud-test-${name}`, {
    state: () => ({ isPaused: false, stale: true }),
    persist: { key, storage: localStorage, serializer: { serialize: encryptData, deserialize: decryptData } }
  })(pinia))
  gameStore = stores[0]
  for (const store of stores) store.stale = false
  await nextTick()
  window.location.reload = () => {
    for (const [name, key] of Object.entries(CLOUD_SAVE_STORAGE_KEYS)) {
      assert.deepEqual(decryptData(localStorage.getItem(key)!), bundle[name as keyof typeof bundle])
    }
    reloads++
  }
  await download()
  await nextTick()
  assert.equal(reloads, 1)
  for (const [name, key] of Object.entries(CLOUD_SAVE_STORAGE_KEYS)) {
    assert.deepEqual(decryptData(localStorage.getItem(key)!), bundle[name as keyof typeof bundle])
  }
  for (const store of stores) store.$dispose()
})

test('missing or empty auxiliary stores are allowed, and downloads back up absent local keys as empty objects', async () => {
  localStorage.removeItem(CLOUD_SAVE_STORAGE_KEYS.universe)
  localStorage.removeItem(CLOUD_SAVE_STORAGE_KEYS.npcs)
  await uploadCloudSave(credentials())
  assert.deepEqual(decodeBundle((await requests[0].json()).ciphertext), { game: state, universe: {}, npcs: {} })
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEYS.universe, encryptData({}))
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEYS.npcs, encryptData({}))
  assert.equal(await uploadCloudSave(credentials()), 'unchanged')
  for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) localStorage.removeItem(key)
  await download()
  for (const [name, key] of Object.entries(CLOUD_SAVE_STORAGE_KEYS)) {
    assert.deepEqual(decryptData(localStorage.getItem(key)!), name === 'game' ? state : {})
    assert.deepEqual(decryptData(localStorage.getItem(`${key}-cloudbackup-${now}`)!), {})
  }
})

test('a missing game save is rejected without overwriting a good remote save', async () => {
  await uploadCloudSave(credentials())
  const remote = records.get('save:tester')
  localStorage.removeItem(CLOUD_SAVE_STORAGE_KEY)
  await assert.rejects(uploadCloudSave(credentials()), expectError('noLocalSave'))
  for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) localStorage.removeItem(key)
  await assert.rejects(uploadCloudSave(credentials()), expectError('noLocalSave'))
  assert.equal(records.get('save:tester'), remote)
  assert.equal(requests.length, 1)
  assert.equal(writes, 1)
})

test('a download can recover an empty corrupt local save while backing up its exact original value', async () => {
  await uploadCloudSave(credentials())
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, '')
  await download()
  assert.deepEqual(decryptData(localStorage.getItem(CLOUD_SAVE_STORAGE_KEY)!), state)
  assert.equal(localStorage.getItem(`${CLOUD_SAVE_STORAGE_KEY}-cloudbackup-${now}`), '')
  assert.equal(reloads, 1)
})

test('corrupt or structurally invalid game saves are rejected before requesting the remote save', async context => {
  await uploadCloudSave(credentials())
  const remote = records.get('save:tester')
  context.mock.method(console, 'error', () => {})
  for (const local of ['', 'corrupt ciphertext', encryptData(state).slice(0, 20),
    ...[null, [], 'text', 42, {}, { unrelated: true }, { player: null }, { player: [] }, { player: 'invalid' }].map(encryptData)]) {
    localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, local)
    await assert.rejects(uploadCloudSave(credentials()), expectError('invalidLocalSave'))
  }
  assert.equal(records.get('save:tester'), remote)
  assert.equal(requests.length, 1)
  assert.equal(writes, 1)
})

test('changes in either auxiliary store participate in the upload hash', async () => {
  await uploadCloudSave(credentials())
  for (const key of [CLOUD_SAVE_STORAGE_KEYS.universe, CLOUD_SAVE_STORAGE_KEYS.npcs]) {
    now += INTERVAL
    localStorage.setItem(key, encryptData({ changed: key }))
    assert.equal(await uploadCloudSave(credentials()), 'uploaded')
  }
  assert.equal(writes, 3)
})

test('gzip allows highly compressible bundles larger than 1 MiB to round-trip', async () => {
  const large = { ...universe, large: '星系'.repeat(600000) }
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEYS.universe, encryptData(large))
  await uploadCloudSave(credentials())
  const payload = await requests[0].json()
  assert.ok(new TextEncoder().encode(JSON.stringify({ ...bundle, universe: large })).byteLength > 1024 * 1024)
  assert.ok(new TextEncoder().encode(payload.ciphertext).byteLength < 1024 * 1024)
  localStorage.removeItem(CLOUD_SAVE_STORAGE_KEYS.universe)
  await download()
  assert.deepEqual(decryptData(localStorage.getItem(CLOUD_SAVE_STORAGE_KEYS.universe)!), large)
})

test('backup failure cleans up partial writes after fetch without replacing saves or changing the pause state', async () => {
  records.set('save:tester', JSON.stringify({ ...encodeBundle(bundle), authHash: CryptoJS.SHA256(authKey()).toString() }))
  const original = new Map(values)
  const setItem = localStorage.setItem
  for (const paused of [false, true]) {
    for (const failAt of [1, 2, 3]) {
      let backupWrites = 0
      localStorage.setItem = (key, value) => {
        if (key.includes('-cloudbackup-') && ++backupWrites === failAt) throw new Error('quota exceeded')
        setItem(key, value)
      }
      gameStore.isPaused = paused
      await assert.rejects(download(), expectError('storageFailed'))
      assert.equal(backupWrites, failAt)
      assert.equal(gameStore.isPaused, paused)
      assert.deepEqual(values, original)
    }
  }
  assert.equal(requests.length, 6)
  assert.equal(reloads, 0)
})

test('a replacement write failure rolls back local keys and does not reload', async () => {
  await uploadCloudSave(credentials())
  values.set('cloudSave.lastUploadedHash', 'previous upload hash')
  const originals = new Map<string, string>()
  for (const key of Object.values(CLOUD_SAVE_STORAGE_KEYS)) {
    const local = encryptData({ localOnly: key })
    localStorage.setItem(key, local)
    originals.set(key, local)
  }
  const setItem = localStorage.setItem
  let fail = true
  localStorage.setItem = (key, value) => {
    if (key === CLOUD_SAVE_STORAGE_KEYS.universe && fail) {
      fail = false
      throw new Error('quota exceeded')
    }
    setItem(key, value)
  }
  await assert.rejects(download(), expectError('storageFailed'))
  for (const [key, original] of originals) assert.equal(localStorage.getItem(key), original)
  assert.equal(values.get('cloudSave.lastUploadedHash'), 'previous upload hash')
  assert.equal(gameStore.isPaused, false)
  assert.equal(reloads, 0)
})

test('wrong password and tampered hashes never overwrite the local save', async () => {
  await uploadCloudSave(credentials())
  values.set(`${CLOUD_SAVE_STORAGE_KEY}-cloudbackup-old`, 'previous backup')
  const original = new Map(values)
  await assert.rejects(download({ ...credentials(), password: randomUUID() }), expectError('unauthorized'))
  assert.deepEqual(values, original)
  const record = JSON.parse(records.get('save:tester')!)
  record.clientHash = 'tampered'
  records.set('save:tester', JSON.stringify(record))
  for (let index = 0; index < 2; index++) {
    await assert.rejects(download(), expectError('decryptFailed'))
    assert.deepEqual(values, original)
  }
})

test('passwords shorter than eight characters cannot upload or download, and exactly eight are accepted', async () => {
  for (const secret of ['', '1', '1234567']) {
    const options = { ...credentials(), password: secret }
    const code = secret ? 'passwordTooShort' : 'passwordRequired'
    await assert.rejects(uploadCloudSave(options), expectError(code))
    await assert.rejects(download(options), expectError(code))
    assert.equal(gameStore.isPaused, false)
  }
  assert.equal(requests.length, 0)
  password = '12345678'
  assert.equal(await uploadCloudSave(credentials()), 'uploaded')
  await download()
  assert.equal(reloads, 1)
})

test('invalid credentials, insecure URLs, non-object saves and incompressible oversized saves are not uploaded', async () => {
  await assert.rejects(uploadCloudSave({ ...credentials(), username: 'ab' }), expectError('invalidUsername'))
  await assert.rejects(uploadCloudSave({ ...credentials(), password: '' }), expectError('passwordRequired'))
  for (const workerUrl of ['http://public.test', 'https://user:secret@public.test', 'https://public.test?secret=test']) {
    await assert.rejects(uploadCloudSave({ ...credentials(), workerUrl }), expectError('invalidUrl'))
  }
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData([]))
  await assert.rejects(uploadCloudSave(credentials()), expectError('invalidLocalSave'))
  localStorage.setItem(CLOUD_SAVE_STORAGE_KEY, encryptData({ ...state, large: randomBytes(1100000).toString('base64') }))
  await assert.rejects(uploadCloudSave(credentials()), expectError('tooLarge'))
  assert.equal(requests.length, 0)
})

test('missing remote save, network errors and malformed responses leave local data unchanged', async () => {
  values.set(`${CLOUD_SAVE_STORAGE_KEY}-cloudbackup-old`, 'previous backup')
  const original = new Map(values)
  await assert.rejects(download(), expectError('notFound'))
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(download(), expectError('requestFailed'))
  await assert.rejects(uploadCloudSave(credentials()), expectError('requestFailed'))
  globalThis.fetch = async () => new Response('invalid json')
  await assert.rejects(download(), expectError('requestFailed'))
  assert.deepEqual(values, original)
})

test('non-JSON 401, 404, 413 and 429 errors preserve status handling and retry countdown', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [404, 'notFound'], [413, 'tooLarge']] as const) {
    globalThis.fetch = async () => new Response('<html>proxy error</html>', { status })
    await assert.rejects(download(), expectError(code))
    assert.equal(gameStore.isPaused, false)
  }
  globalThis.fetch = async () => new Response('<html>rate limited</html>', { status: 429, headers: { 'Retry-After': '97' } })
  await assert.rejects(uploadCloudSave(credentials()), error => {
    assert.ok(error instanceof CloudSaveError)
    assert.equal(error.code, 'rateLimited')
    assert.equal(error.retryAfter, 97)
    return true
  })
  assert.equal(getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL).retryAfter, 97)
  now += 1000
  assert.equal(getCloudSaveStatus('tester', DEFAULT_CLOUD_SAVE_URL).retryAfter, 96)
  assert.equal(reloads, 0)
})

test('authorized ciphertext encrypted with a different key is rejected after decryption', async () => {
  records.set('save:tester', JSON.stringify({ ...encodeBundle(bundle, randomUUID()), authHash: CryptoJS.SHA256(authKey()).toString() }))
  const originals = Object.values(CLOUD_SAVE_STORAGE_KEYS).map(key => localStorage.getItem(key))
  await assert.rejects(download(), expectError('decryptFailed'))
  assert.deepEqual(Object.values(CLOUD_SAVE_STORAGE_KEYS).map(key => localStorage.getItem(key)), originals)
  assert.equal(gameStore.isPaused, false)
  assert.equal(reloads, 0)
})

test('advanced endpoint settings validate before persisting and reject embedded credentials', () => {
  assert.equal(loadCloudSaveWorkerUrl(), DEFAULT_CLOUD_SAVE_URL)
  assert.equal(saveCloudSaveWorkerUrl('  https://other.test/base/  '), 'https://other.test/base')
  assert.equal(loadCloudSaveWorkerUrl(), 'https://other.test/base')
  assert.throws(() => saveCloudSaveWorkerUrl(`https://user:${password}@other.test`), expectError('invalidUrl'))
  assert.ok(!JSON.stringify([...values]).includes(password))
  assert.equal(saveCloudSaveWorkerUrl('http://localhost:8787/'), 'http://localhost:8787')
  values.set('cloudSave.workerUrl', 'invalid url')
  assert.equal(loadCloudSaveWorkerUrl(), DEFAULT_CLOUD_SAVE_URL)
})

test('re-encryption uses a fresh IV and state encrypted with the wrong shape is rejected', async () => {
  await uploadCloudSave(credentials())
  const first = JSON.parse((await requests[0].json()).ciphertext)
  now += INTERVAL
  localStorage.removeItem('cloudSave.lastUploadedHash')
  await uploadCloudSave(credentials())
  const second = JSON.parse((await requests[1].json()).ciphertext)
  assert.notEqual(first.iv, second.iv)
  assert.notEqual(first.data, second.data)
  const original = localStorage.getItem(CLOUD_SAVE_STORAGE_KEY)
  for (const invalid of [{}, { game: null, universe, npcs }, { game: [], universe, npcs }, { game: state, universe: [], npcs }, { game: state, universe, npcs: null }]) {
    records.set('save:tester', JSON.stringify({ ...encodeBundle(invalid), authHash: CryptoJS.SHA256(authKey()).toString() }))
    await assert.rejects(download(), expectError('decryptFailed'))
  }
  assert.equal(localStorage.getItem(CLOUD_SAVE_STORAGE_KEY), original)
  assert.equal(reloads, 0)
})
