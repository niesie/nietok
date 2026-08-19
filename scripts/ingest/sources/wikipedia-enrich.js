import { buildUrl, fetchWithRetry } from '../../lib/http.js'

const API = 'https://en.wikipedia.org/w/api.php'

// `extracts` caps at 20 titles per query (pageimages allows 50), so 20 is the
// binding limit for asking for both in one round trip.
const BATCH_SIZE = 20

// Ask MediaWiki to render this width rather than rewriting the URL ourselves.
// Hand-editing the /NNNpx-/ segment produces 400s on large source files, where
// only already-rendered sizes are served.
const THUMB_WIDTH = 1024

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
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
 * Fetch a renderable thumbnail URL and the full intro text for each title.
 *
 * One batched call serves two purposes: a URL MediaWiki can actually serve at
 * a usable width, and enough prose for the detail overlay to be worth opening
 * (the on-this-day feed's own extract is a sentence or two).
 *
 * @param {string[]} titles
 * @returns {Promise<Map<string, {image: string|null, extract: string|null}>>}
 */
export async function enrichWikipediaPages(titles) {
  const unique = [...new Set(titles.filter(Boolean))]
  const result = new Map()

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const url = buildUrl(API, {
      action: 'query',
      format: 'json',
      formatversion: 2,
      prop: 'pageimages|extracts',
      piprop: 'thumbnail',
      pithumbsize: THUMB_WIDTH,
      exintro: 1,
      explaintext: 1,
      exlimit: BATCH_SIZE,
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
      // Enrichment is an upgrade, never a requirement — the caller keeps the
      // feed's own thumbnail and extract if this fails.
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
        extract: page.extract?.trim() || null,
      }
      result.set(page.title, entry)
      const original = aliases.get(page.title)
      if (original) result.set(original, entry)
    }
  }

  return result
}
