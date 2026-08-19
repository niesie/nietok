import { fetchWithRetry } from '../../lib/http.js'
import { inferRegion, inferTopics, makeCard, makeId } from '../normalize.js'
import { enrichWikipediaPages, stripTracking } from './wikipedia-enrich.js'

const FEED = 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events'

// The /events/ endpoint already excludes births, deaths and holidays, but it
// still returns plenty of sport and culture. Keep what this app is about.
const RELEVANT = /\b(war|treaty|battle|invas|independen|revolution|coup|election|president|parliament|empire|colon|border|alliance|nato|united nations|soviet|republic|sanction|blockade|siege|accord|summit|constitution|assassinat|uprising|annex|partition|referendum|trade|economic|currency|crisis|depression|market crash|nuclear|missile|army|troops|surrender|armistice|occupation)/i

/**
 * Only ever use a URL the API handed us.
 *
 * Rewriting the /NNNpx-/ segment to force a bigger thumbnail looks like it
 * works and mostly does — but on large source files MediaWiki serves only the
 * sizes it has already rendered and returns 400 for anything else. That silently
 * broke roughly half the history images. A renderable larger thumbnail comes
 * from the pageimages API instead (see wikipedia-enrich.js).
 */
function pickImage(page) {
  const original = page?.originalimage
  if (original?.source && Number(original.width ?? 0) <= 2000) {
    return { url: stripTracking(original.source), credit: 'Wikimedia Commons' }
  }
  if (page?.thumbnail?.source) {
    return { url: stripTracking(page.thumbnail.source), credit: 'Wikimedia Commons' }
  }
  return null
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/**
 * Fetch a rolling window of past calendar dates. One day yields only a handful
 * of relevant events, which is not enough to sustain an endless feed — but
 * every card is still anchored to its own real date, so nothing is mislabelled.
 */
export async function fetchOnThisDay({ days = 14 } = {}) {
  const cards = []
  const lookups = [] // parallel to `cards` — the title to enrich each one by
  const now = new Date()

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - offset)
    const month = pad(date.getUTCMonth() + 1)
    const day = pad(date.getUTCDate())

    // These are fixed per calendar date, so a long TTL is safe and keeps
    // repeated local runs off the Wikimedia API entirely.
    const data = await fetchWithRetry(`${FEED}/${month}/${day}`, {
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      headers: { 'Api-User-Agent': 'nietok/0.1 (personal news reader)' },
    })

    for (const event of data?.events ?? []) {
      const text = event.text ?? ''
      if (!text || !RELEVANT.test(text)) continue

      const page = (event.pages ?? []).find((p) => p.extract) ?? event.pages?.[0]
      if (!page) continue

      const year = event.year
      const topics = inferTopics(text, page.extract)

      cards.push(
        makeCard({
          id: makeId('history', month, day, String(year), page.title ?? text.slice(0, 60)),
          type: 'history',
          headline: text,
          dek: page.extract ?? '',
          image: pickImage(page),
          source: {
            name: 'Wikipedia',
            url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
            // Anchor to the anniversary date so freshness ranking treats a card
            // for today's date as more relevant than one from twelve days ago.
            publishedAt: new Date(Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString(),
          },
          topics,
          region: inferRegion(topics),
          detail: {
            year,
            month,
            day,
            articleTitle: page.normalizedtitle ?? page.title ?? null,
            extract: page.extract ?? '',
          },
        }),
      )
      lookups.push(page.title ?? null)
    }
  }

  // One batched pass for a renderable image and the full intro text. Failures
  // here leave the feed's own thumbnail and short extract in place.
  const enriched = await enrichWikipediaPages(lookups)

  cards.forEach((card, i) => {
    const extra = enriched.get(lookups[i])
    if (!extra) return
    if (extra.image) card.image = { url: extra.image, credit: 'Wikimedia Commons' }
    if (extra.extract && extra.extract.length > (card.detail.extract?.length ?? 0)) {
      card.detail.extract = extra.extract
    }
  })

  return { cards }
}
