/**
 * GDELT — NOT CURRENTLY REGISTERED in scripts/ingest/index.js.
 *
 * Kept because it works and may be worth re-enabling from CI, where the
 * source IP differs. Measured here, it lost on three counts against RSS:
 *
 *   - No description field. Its response carries title, url, image, domain and
 *     source country and nothing else, so every card face is missing one of
 *     the three things it has to show. Writing a summary ourselves would mean
 *     publishing text the source never wrote.
 *   - Heavy throttling. Four of six country queries returned 429 even at 12s
 *     spacing between requests, and the backoff added ~4 minutes to a run.
 *   - Redundant coverage. It was here for perspectives outside the
 *     Anglo-American press, and named RSS feeds now cover Africa, Latin
 *     America, the Gulf, Russia and Asia directly — with summaries and images.
 *
 * To re-enable: add `{ name: 'gdelt', run: fetchGdelt }` to SOURCES.
 */
import { buildUrl, fetchWithRetry } from '../../lib/http.js'
import { canonicalUrl, inferRegion, inferTopics, makeCard, makeId, stripHtml } from '../normalize.js'

const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc'

const KEYWORDS = '(sanctions OR diplomacy OR military OR treaty OR tariffs OR election OR summit)'

/**
 * GDELT's real value here is `sourcecountry` — the same events as reported
 * from outside the Anglo-American press, by outlets we would never think to
 * hand-pick.
 */
const COUNTRIES = [
  { code: 'india', topics: ['asia'] },
  { code: 'china', topics: ['china'] },
  { code: 'unitedarabemirates', topics: ['mena'] },
  { code: 'southafrica', topics: ['africa'] },
  { code: 'brazil', topics: ['americas'] },
  { code: 'turkey', topics: ['mena'] },
]

const PER_QUERY = 20

// GDELT throttles aggressively — it returned 429 twice before succeeding in
// testing, even at one request every few seconds. Capping the total keeps the
// ingest from spending minutes on backoff.
const MAX_CARDS = 60

/** GDELT stamps seendate as YYYYMMDDTHHMMSSZ, which Date.parse cannot read. */
function parseSeenDate(raw) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(raw ?? ''))
  if (!m) return new Date().toISOString()
  const [, y, mo, d, h, mi, s] = m
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString()
}

async function fetchCountry({ code, topics }) {
  const url = buildUrl(ENDPOINT, {
    query: `${KEYWORDS} sourcecountry:${code} sourcelang:english`,
    mode: 'artlist',
    format: 'json',
    maxrecords: PER_QUERY,
    timespan: '3d',
    sort: 'hybridrel',
  })

  const data = await fetchWithRetry(url, {
    ttlMs: 60 * 60 * 1000,
    retries: 4, // it 429s routinely; the backoff in http.js does the waiting
  })

  const cards = []

  for (const article of data?.articles ?? []) {
    const headline = stripHtml(article.title ?? '')
    // GDELT returns no description, so a card without an image would be bare
    // type with nothing to say. Those are not worth a full screen.
    if (!headline || !article.socialimage || !article.url) continue

    const link = canonicalUrl(article.url)
    const allTopics = [...new Set([...inferTopics(headline), ...topics])]

    cards.push(
      makeCard({
        id: makeId(link),
        type: 'news',
        headline,
        // Deliberately empty: GDELT gives no summary and inventing one would
        // mean writing text the source never published.
        dek: '',
        image: { url: article.socialimage, credit: article.domain ?? 'via GDELT' },
        source: {
          name: article.domain ?? 'unknown',
          url: link,
          publishedAt: parseSeenDate(article.seendate),
        },
        topics: allTopics,
        region: inferRegion(allTopics),
        detail: {
          outlet: article.domain ?? null,
          sourceCountry: article.sourcecountry ?? null,
          via: 'GDELT',
        },
      }),
    )
  }

  return cards
}

export async function fetchGdelt() {
  const cards = []
  const failed = []

  // Sequential on purpose. Firing six concurrent requests at GDELT reliably
  // trips its rate limiter; http.js paces per host, and this keeps the pacing
  // meaningful rather than queueing six deep.
  for (const country of COUNTRIES) {
    if (cards.length >= MAX_CARDS) break
    try {
      cards.push(...(await fetchCountry(country)))
    } catch {
      failed.push(country.code)
    }
  }

  return {
    cards: cards.slice(0, MAX_CARDS),
    skipped: failed.length ? `${failed.length} quer(ies) failed: ${failed.join(', ')}` : undefined,
  }
}
