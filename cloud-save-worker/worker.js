const DAY = 24 * 60 * 60 * 1000
const INTERVAL = 30 * 60 * 1000
const MAX_CIPHERTEXT_BYTES = 1024 * 1024
const TOO_LARGE = Symbol('payload_too_large')
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Cache-Control': 'no-store'
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers }
  })

const hashAuth = async auth => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth)))
const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const matchesAuthHash = (actual, expected) => {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return false
  let difference = 0
  for (let index = 0; index < actual.length; index++) {
    difference |= actual[index] ^ parseInt(expected.slice(index * 2, index * 2 + 2), 16)
  }
  return difference === 0
}

const getQuota = (record, now) => {
  const syncTimes = (Array.isArray(record?.syncTimes) ? record.syncTimes : [])
    .filter(time => Number.isFinite(time) && time > now - DAY)
    .sort((first, second) => first - second)
  const remainingToday = Math.max(0, 5 - syncTimes.length)
  const latest = syncTimes.at(-1)
  const dailyRetry = syncTimes.length >= 5 ? syncTimes[syncTimes.length - 5] + DAY - now : 0
  const intervalRetry = latest === undefined ? 0 : latest + INTERVAL - now
  const retryAfter = Math.max(0, Math.ceil(Math.max(dailyRetry, intervalRetry) / 1000))
  return { syncTimes, remainingToday, retryAfter }
}

const readPayload = async request => {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_CIPHERTEXT_BYTES * 6 + 4096) {
      await reader.cancel()
      return TOO_LARGE
    }
    chunks.push(value)
  }
  return JSON.parse(await new Blob(chunks).text())
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
    const { pathname } = new URL(request.url)
    if (pathname === '/health' && request.method === 'GET') return json({ ok: true })
    const match = /^\/save\/([^/]+)$/.exec(pathname)
    if (!match) return json({ error: 'not_found' }, 404)
    let username
    try {
      username = decodeURIComponent(match[1]).toLowerCase()
    } catch {
      return json({ error: 'invalid_username' }, 400)
    }
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) return json({ error: 'invalid_username' }, 400)
    if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405)

    try {
      let payload
      if (request.method === 'PUT') {
        try {
          payload = await readPayload(request)
        } catch {
          return json({ error: 'invalid_json' }, 400)
        }
        if (payload === TOO_LARGE) return json({ error: 'payload_too_large' }, 413)
        if (!payload || typeof payload.ciphertext !== 'string' || !payload.ciphertext || typeof payload.clientHash !== 'string') {
          return json({ error: 'invalid_payload' }, 400)
        }
        if (new TextEncoder().encode(payload.ciphertext).byteLength > MAX_CIPHERTEXT_BYTES) {
          return json({ error: 'payload_too_large' }, 413)
        }
      }

      const auth = request.method === 'PUT' ? payload.auth : /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1]
      if (typeof auth !== 'string' || !/^[a-f0-9]{64}$/.test(auth)) return json({ error: 'unauthorized' }, 401)
      const authHash = await hashAuth(auth)
      const key = `save:${username}`
      const existing = await env.SAVES.get(key, 'json')
      if (existing && !matchesAuthHash(authHash, existing.authHash)) return json({ error: 'unauthorized' }, 401)
      const now = Date.now()
      const quota = getQuota(existing, now)
      if (request.method === 'GET') {
        if (!existing) return json({ error: 'not_found' }, 404)
        return json({ ciphertext: existing.ciphertext, clientHash: existing.clientHash, updatedAt: existing.updatedAt })
      }

      if (quota.retryAfter > 0) {
        return json(
          {
            error: 'rate_limited',
            reason: quota.remainingToday === 0 ? 'daily_limit' : 'too_frequent',
            retryAfter: quota.retryAfter,
            remainingToday: quota.remainingToday
          },
          429,
          { 'Retry-After': String(quota.retryAfter) }
        )
      }

      const record = {
        authHash: toHex(authHash),
        ciphertext: payload.ciphertext,
        clientHash: payload.clientHash,
        updatedAt: now,
        syncTimes: [...quota.syncTimes, now].slice(-10)
      }
      await env.SAVES.put(key, JSON.stringify(record))
      const nextQuota = getQuota(record, now)
      return json({ ok: true, updatedAt: now, remainingToday: nextQuota.remainingToday, retryAfter: nextQuota.retryAfter })
    } catch {
      return json({ error: 'internal_error' }, 500)
    }
  }
}
