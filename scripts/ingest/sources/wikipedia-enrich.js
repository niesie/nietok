import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildUrl, fetchWithRetry } from '../../lib/http.js'

const API = 'https://en.wikipedia.org/w/api.php'

// pageimages and pageprops batch at 50; only extracts are restricted.
const META_BATCH = 50

/**
 * MediaWiki allows batched extracts only with `exintro`, which returns the
 * lead section alone. Some leads are three sentences — Wang Yangming's is 751
 * characters, a caption rather than something to read. Taking the body means
 * one request per article, which is why the disk cache below exists.
 */
const EXTRACT_CONCURRENCY = 8

// Article bodies barely change, and re-fetching ~750 of them every three hours
// would be absurd. Kept out of public/ so it is cached by CI but not deployed.
const CACHE_DIR = join(process.cwd(), '.wiki-cache')
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Stored generously; each consumer trims to what its card needs.
const STORE_CHARS = 6000

function cacheKey(title) {
  return join(CACHE_DIR, `${Buffer.from(title).toString('base64url').slice(0, 120)}.json`)
}

async function readCached(title) {
  try {
    const { at, extract } = JSON.parse(await readFile(cacheKey(title), 'utf8'))
    return Date.now() - at > CACHE_TTL_MS ? null : extract
  } catch {
    return null
  }
}

async function writeCached(title, extract) {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cacheKey(title), JSON.stringify({ at: Date.now(), extract }))
  } catch {
    // A cache miss next time is the only cost.
  }
}

/** Tracking params the REST API bolts on; they serve us nothing. */
export function stripTracking(url) {
  try {
    const u = new URL(url)
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) u.searchParams.delete(key)
    }
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Plain-text extracts render headings as "== History ==" and keep the
 * reference-list scaffolding at the foot. Neither belongs on a card.
 */
function cleanBody(text) {
  return text
    // Everything from the appendices onward is bibliography, not prose.
    .split(/\n=+\s*(?:See also|References|Notes|Further reading|External links|Bibliography|Sources|Citations)\s*=+/i)[0]
    .replace(/\n=+\s*[^=\n]+\s*=+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Only extracts are restricted to one page per request when `exintro` is
// dropped, so the lead comes back in the same batched call as the image.
const INTRO_BATCH = 20

/**
 * Below this, go and fetch the article body.
 *
 * Leads average around 2000 characters, which reads fine. The ones that do not
 * are the problem — Wang Yangming's lead is 751 characters, a caption rather
 * than something to read.
 *
 * Fetching every body would be better still, and the content is excellent when
 * you do: average 4284 characters, almost nothing left thin. But it is one
 * request per article and Wikipedia takes about 5.8 seconds to render a full
 * article to plain text, which projects to 48 minutes for a single run. So
 * this targets only leads that are genuinely too short to read.
 */
const TOP_UP_BELOW = 900

/**
 * Stop starting new body fetches after this long.
 *
 * At ~6s each, an unbounded top-up can add tens of minutes to a run. Whatever
 * is not reached keeps its lead this time and is picked up by a later run —
 * the disk cache accumulates, so the backlog drains over a few runs and then
 * only genuinely new articles cost anything.
 */
const TOP_UP_BUDGET_MS = 90_000

/** Image, Wikidata id and lead extract, batched. */
async function fetchMeta(titles, thumbWidth) {
  const result = new Map()

  for (const batch of chunk(titles, INTRO_BATCH)) {
    const url = buildUrl(API, {
      action: 'query',
      format: 'json',
      formatversion: 2,
      prop: 'pageimages|pageprops|extracts',
      ppprop: 'wikibase_item',
      piprop: 'thumbnail',
      pithumbsize: thumbWidth,
      exintro: 1,
      explaintext: 1,
      exlimit: INTRO_BATCH,
      redirects: 1,
      titles: batch.join('|'),
    })

    let data
    try {
      data = await fetchWithRetry(url, {
        ttlMs: 7 * 24 * 60 * 60 * 1000,
        headers: { 'Api-User-Agent': 'nietok/0.1 (personal news reader)' },
      })
    } catch {
      continue
    }

    // `redirects` means the title we asked for may differ from the one we get
    // back, so map both ways.
    const aliases = new Map()
    for (const r of data?.query?.redirects ?? []) aliases.set(r.to, r.from)
    for (const n of data?.query?.normalized ?? []) aliases.set(n.to, n.from)

    for (const page of data?.query?.pages ?? []) {
      if (page.missing) continue
      const entry = {
        image: page.thumbnail?.source ? stripTracking(page.thumbnail.source) : null,
        qid: page.pageprops?.wikibase_item ?? null,
        extract: page.extract?.trim() || null,
        canonical: page.title,
      }
      result.set(page.title, entry)
      const original = aliases.get(page.title)
      if (original) result.set(original, entry)
    }
  }

  return result
}

async function fetchBody(title) {
  const cached = await readCached(title)
  if (cached !== null) return cached

  const url = buildUrl(API, {
    action: 'query',
    format: 'json',
    formatversion: 2,
    prop: 'extracts',
    explaintext: 1,
    redirects: 1,
    titles: title,
  })

  const data = await fetchWithRetry(url, {
    ttlMs: 0, // the disk cache above is the real one
    headers: { 'Api-User-Agent': 'nietok/0.1 (personal news reader)' },
  })

  const page = data?.query?.pages?.[0]
  if (page?.missing || !page?.extract) return null

  const body = cleanBody(page.extract).slice(0, STORE_CHARS)
  await writeCached(title, body)
  return body
}

/**
 * Image, Wikidata id and a full-body extract for each title.
 *
 * @param {string[]} titles
 */
export async function enrichWikipediaPages(titles) {
  const unique = [...new Set(titles.filter(Boolean))]

  // One batched pass for image, Wikidata id and lead text.
  const result = await fetchMeta(unique, 1024)

  // Then the article body, but only where the lead is too short to read.
  const thin = [...result.entries()]
    .filter(([, entry]) => (entry.extract?.length ?? 0) < TOP_UP_BELOW)
    .map(([title]) => title)

  const deadline = Date.now() + TOP_UP_BUDGET_MS
  let next = 0
  let filled = 0

  const workers = Array.from({ length: Math.min(EXTRACT_CONCURRENCY, thin.length) }, async () => {
    while (next < thin.length) {
      // A cached body costs nothing, so check the cache even past the deadline;
      // only fresh network fetches are budgeted.
      const title = thin[next++]
      const cached = await readCached(title)
      if (cached === null && Date.now() > deadline) continue

      try {
        const body = cached ?? (await fetchBody(title))
        const entry = result.get(title)
        if (body && entry && body.length > (entry.extract?.length ?? 0)) {
          entry.extract = body
          filled++
        }
      } catch {
        // The lead we already have is still usable.
      }
    }
  })

  await Promise.all(workers)

  if (thin.length) {
    console.log(`  wikipedia: topped up ${filled}/${thin.length} thin lead(s)`)
  }

  return result
}
