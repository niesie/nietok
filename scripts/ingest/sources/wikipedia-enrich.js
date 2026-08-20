import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildUrl, fetchWithRetry } from '../../lib/http.js'
import { paragraphize } from '../text.js'

const API = 'https://en.wikipedia.org/w/api.php'

const UA = 'nietok/0.1 (personal news reader)'

// pageimages and pageprops batch at 50; only extracts are restricted.
const META_BATCH = 50

/**
 * MediaWiki allows batched extracts only with `exintro`, which returns the
 * lead section alone. Some leads are three sentences — Wang Yangming's is 751
 * characters, a caption rather than something to read. Taking the body means
 * one request per article, which is why the disk cache below exists.
 */
// Three, not eight. Eight concurrent body renders plus the ordinary feed
// traffic was enough to get the whole of Wikimedia rate-limiting us.
const EXTRACT_CONCURRENCY = 3

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

/** Reference markers: [1], [a], [iv]. */
const FOOTNOTE = /\[(?:\d{1,3}|[a-z]|[ivx]{1,4})\]/g

/**
 * Maintenance templates, which the search index keeps and TextExtracts strips —
 * 177 "[citation needed]" across 95 articles, which is not something to put on
 * a card.
 *
 * An explicit list rather than removing every bracket, because square brackets
 * are also how an editor marks their own words inside a quotation — "[Kennedy]
 * refused", "accused [of using chemical weapons]" — and those are prose.
 */
const MAINTENANCE = new RegExp(
  '\\[(?:' +
    '[^\\]\\n]{0,40}(?:needed|missing)' +
    '|permanent dead link|dead link|link removed|failed verification' +
    '|original research|not in citation given|better source|third-party source' +
    '|unreliable source\\?|self-published source\\?|neutrality is disputed' +
    '|update|specify|sic|clarification|dubious|disputed|vague|quantify|weasel words?' +
    '|(?:according to whom|by whom|in whose opinion|who|whom|when|which|why|where|how|relevant)\\?' +
    ')\\]',
  'gi',
)

function stripEditorial(text) {
  return text
    .replace(MAINTENANCE, '')
    .replace(FOOTNOTE, '')
    // Removing a marker mid-sentence leaves a doubled space or an orphaned
    // space before punctuation.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
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
 * This was 900 — near enough to "only rescue the truly stunted" — because a
 * body cost a whole request and about 7 seconds. Off the search index a body
 * costs a fiftieth of a batched request, so there is no longer a reason to
 * ration them, and a 1200-character lead is still a summary rather than
 * something to read. Above 3000 the lead is already longer than a card shows.
 */
const TOP_UP_BELOW = 3000

/**
 * Time budget for the render fallback only.
 *
 * The batched index pass has no budget because it does not need one. This
 * covers the handful of articles CirrusSearch has no document for, where the
 * cost is back to ~7s each.
 */
const TOP_UP_BUDGET_MS = 60_000

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
        headers: { 'Api-User-Agent': UA },
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

/**
 * Article bodies from the search index, 50 at a time.
 *
 * `prop=extracts` without `exintro` makes Wikipedia render the whole article to
 * plain text on demand: one request per article, and about 7 seconds each under
 * sustained load — 94 articles took 700s and mostly timed out of their budget.
 *
 * CirrusSearch has already done that rendering to build the search index, so
 * `prop=cirrusdoc` hands back the stored plaintext with nothing to parse. The
 * same 94 articles come back in 7.8 seconds, batched, and none are missed.
 *
 * The one thing the index does not keep is paragraph breaks, which is what
 * `paragraphize` puts back.
 */
async function fetchIndexedBodies(titles) {
  const bodies = new Map()

  for (const batch of chunk(titles, META_BATCH)) {
    let data
    try {
      data = await fetchWithRetry(
        buildUrl(API, {
          action: 'query',
          format: 'json',
          formatversion: 2,
          prop: 'cirrusdoc',
          redirects: 1,
          titles: batch.join('|'),
        }),
        { ttlMs: 0, retries: 2, timeoutMs: 45_000, headers: { 'Api-User-Agent': UA } },
      )
    } catch {
      continue // the per-article fallback below still has a go at these
    }

    const aliases = new Map()
    for (const r of data?.query?.redirects ?? []) aliases.set(r.to, r.from)
    for (const n of data?.query?.normalized ?? []) aliases.set(n.to, n.from)

    for (const page of data?.query?.pages ?? []) {
      const raw = page.cirrusdoc?.[0]?.source?.text
      if (!raw) continue
      const body = paragraphize(stripEditorial(raw)).slice(0, STORE_CHARS)
      bodies.set(page.title, body)
      const original = aliases.get(page.title)
      if (original) bodies.set(original, body)
    }
  }

  return bodies
}

/** Network only — the caller has already checked the disk cache. */
async function fetchBody(title) {
  const url = buildUrl(API, {
    action: 'query',
    format: 'json',
    formatversion: 2,
    prop: 'extracts',
    explaintext: 1,
    redirects: 1,
    titles: title,
  })

  // Give up quickly rather than retrying three times with backoff. These are
  // interchangeable units of work against a shared time budget: one article
  // spending 30s in backoff costs ~20 other articles their fetch, and the one
  // that failed is picked up by the next run anyway.
  const data = await fetchWithRetry(url, {
    ttlMs: 0, // the disk cache above is the real one
    retries: 1,
    timeoutMs: 12_000,
    headers: { 'Api-User-Agent': UA },
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

  const started = Date.now()
  let filled = 0
  let cacheHits = 0

  /** Take a body if it is genuinely more to read than what we already have. */
  const accept = (title, body) => {
    const entry = result.get(title)
    if (!body || !entry || body.length <= (entry.extract?.length ?? 0)) return false
    entry.extract = body
    filled++
    return true
  }

  // Cached bodies first — they cost nothing and shrink the fetch list.
  const uncached = []
  for (const title of thin) {
    const cached = await readCached(title)
    if (cached === null) {
      uncached.push(title)
      continue
    }
    cacheHits++
    accept(title, cached)
  }

  // One batched pass over the search index gets nearly all of the rest.
  const indexed = uncached.length ? await fetchIndexedBodies(uncached) : new Map()
  const missed = []
  for (const title of uncached) {
    const body = indexed.get(title)
    if (!body) {
      missed.push(title)
      continue
    }
    await writeCached(title, body)
    accept(title, body)
  }

  // Anything the index had no document for falls back to the slow renderer,
  // under a time budget because it is one request per article.
  const deadline = Date.now() + TOP_UP_BUDGET_MS
  let next = 0
  let failed = 0
  let ranOut = 0
  let firstError = null

  const workers = Array.from({ length: Math.min(EXTRACT_CONCURRENCY, missed.length) }, async () => {
    while (next < missed.length) {
      const title = missed[next++]
      if (Date.now() > deadline) {
        ranOut++
        continue
      }
      try {
        accept(title, await fetchBody(title))
      } catch (err) {
        // The lead we already have is still usable, and the next run retries.
        failed++
        firstError ??= String(err?.message ?? err).slice(0, 90)
      }
    }
  })

  await Promise.all(workers)

  // Anything long enough to be a wall gets broken up, whatever it came from —
  // leads usually carry their own paragraphs, but not always.
  for (const entry of result.values()) {
    if ((entry.extract?.length ?? 0) > 900) entry.extract = paragraphize(entry.extract)
  }

  if (thin.length) {
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    console.log(
      `  wikipedia: topped up ${filled}/${thin.length} thin lead(s) in ${secs}s ` +
        `(${cacheHits} cached, ${indexed.size} indexed, ${missed.length - ranOut - failed} rendered, ` +
        `${failed} failed, ${ranOut} out of time)`,
    )
    if (firstError) console.log(`  wikipedia: first top-up failure — ${firstError}`)
  }

  return result
}
