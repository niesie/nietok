import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CACHE_DIR = join(process.cwd(), '.cache')

// Minimum gap between requests to the same host. Wikimedia and GDELT both
// throttle aggressively on bursts, so we pace rather than wait for a 429.
const HOST_INTERVAL_MS = {
  // Raised from 200ms. Fetching full article bodies alongside the on-this-day
  // feed tripped Wikimedia's rate limiter, and the 429 landed on the
  // anniversary source rather than on the requests that caused it — taking 393
  // cards out of the feed. Wikipedia is not a resource to be aggressive with.
  'api.wikimedia.org': 700,
  'en.wikipedia.org': 700,
  'query.wikidata.org': 1000,
  // GDELT throttles hard — at 6s spacing four of six queries still came back
  // 429. Pacing is cheaper than burning four retry cycles per query.
  'api.gdeltproject.org': 12_000,
  default: 100,
}

const lastRequestAt = new Map()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pace(host) {
  const interval = HOST_INTERVAL_MS[host] ?? HOST_INTERVAL_MS.default
  const last = lastRequestAt.get(host) ?? 0
  const wait = last + interval - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt.set(host, Date.now())
}

function cachePath(url) {
  const hash = createHash('sha1').update(url).digest('hex')
  return join(CACHE_DIR, `${hash}.json`)
}

async function readCache(url, ttlMs) {
  if (!ttlMs) return null
  try {
    const raw = await readFile(cachePath(url), 'utf8')
    const { at, body } = JSON.parse(raw)
    if (Date.now() - at > ttlMs) return null
    return body
  } catch {
    return null
  }
}

async function writeCache(url, body) {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cachePath(url), JSON.stringify({ at: Date.now(), body }))
  } catch {
    // A cache write failure must never fail an ingest run.
  }
}

/**
 * Fetch with retry, exponential backoff, per-host pacing and an on-disk cache.
 *
 * Every source adapter goes through this. The disk cache is what makes local
 * iteration free — re-running the ingest during development replays responses
 * instead of burning the Guardian daily quota.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {'json'|'text'} [opts.as='json']
 * @param {number} [opts.ttlMs=0]     Cache TTL. 0 disables caching.
 * @param {number} [opts.retries=3]
 * @param {number} [opts.timeoutMs=20000]
 * @param {Record<string,string>} [opts.headers]
 */
export async function fetchWithRetry(url, opts = {}) {
  const { as = 'json', ttlMs = 0, retries = 3, timeoutMs = 20_000, headers = {} } = opts

  const cached = await readCache(url, ttlMs)
  if (cached !== null) return as === 'json' ? JSON.parse(cached) : cached

  const host = new URL(url).host
  let lastError

  for (let attempt = 0; attempt <= retries; attempt++) {
    await pace(host)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'nietok/0.1 (personal news reader)', ...headers },
      })

      // Retry only what is worth retrying. A 404 or 401 will never succeed.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 1000 + Math.random() * 500, 30_000)
        lastError = new Error(`${res.status} ${res.statusText} for ${url}`)
        if (attempt < retries) {
          await sleep(backoff)
          continue
        }
        throw lastError
      }

      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)

      const body = await res.text()
      if (ttlMs) await writeCache(url, body)
      return as === 'json' ? JSON.parse(body) : body
    } catch (err) {
      lastError = err
      // AbortError and network failures are both worth another go.
      if (attempt < retries) {
        await sleep(Math.min(2 ** attempt * 1000 + Math.random() * 500, 30_000))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new Error(`fetch failed for ${url}`)
}

/** Build a URL with query params, skipping null/undefined/empty values. */
export function buildUrl(base, params = {}) {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}
