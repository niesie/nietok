/**
 * Feed quality rules, shared between ingest and retention.
 *
 * These live outside the RSS source on purpose. Filtering only what is newly
 * fetched leaves everything already in the feed untouched for the full 45-day
 * retention window — so tightening a filter appeared to change nothing, while
 * 86 stale celebrity and sport cards sat in the feed from before the rule
 * existed. Retention has to apply the same standard as ingestion.
 */

/**
 * Obvious non-news for a geopolitics feed.
 *
 * A blocklist is inherently leaky — badminton, golf and an actor's clarification
 * all walked straight through the first version. It catches the common cases;
 * the geopolitical test below is what actually holds the line for outlets that
 * publish a general national front page.
 */
export const NOISE =
  /\b(bollywood|box office|wwe|nfl|nba|ipl|cricket|badminton|golf|tennis|athletics|marathon|pre-quarters|quarter-?finals?|semi-?finals?|world cup|premier league|la liga|transfer window|horoscope|zodiac|astrolog|recipe|viral (reel|video)|streamer|youtuber|influencer|celebrity|actors?|actress|superstar|web series|trailer (out|drop)|teaser|grammy|oscars?|red carpet|wedding|dating|boyfriend|girlfriend|fashion week|beauty pageant|reality show|box-office|tarot|numerolog)\b/i

/** Enough signal that a story is about the world rather than a local incident. */
export const GEOPOLITICAL =
  /\b(government|minister|president|prime minister|parliament|election|vote|policy|sanction|tariff|trade|treaty|summit|diplomat|embassy|military|troops|war|conflict|ceasefire|protest|strike|economy|economic|inflation|central bank|budget|court|law|border|migrant|refugee|nuclear|energy|oil|gas|climate|un |united nations|nato|eu |european union|security|crisis|talks|deal|agreement|aid|corruption|coup|rebel|militant|killed|attack)\b/i

export function isUsable(headline, dek, strict) {
  const text = `${headline} ${dek}`
  if (NOISE.test(text)) return false
  if (strict && !GEOPOLITICAL.test(text)) return false
  return true
}

/**
 * How many cards each outlet may hold in the retained feed.
 *
 * Roughly three times its per-run intake: enough that a story stays around for
 * a day or two, not so much that one prolific outlet crowds out the rest as
 * cards accumulate. Anything not listed is treated as a small outlet.
 */
export const RETENTION_CAP = {
  // Core Western coverage — generous, this is meant to be the backbone.
  'The Guardian': 200,
  'BBC World': 70,
  'France 24': 55,
  'Deutsche Welle': 40,
  'Politico EU': 32,
  'NPR World': 32,
  // Regular outside perspective, in smaller measure. Roughly twice per-run
  // intake: enough to persist a day, not enough to dominate as cards pile up.
  'Al Jazeera': 28,
  'South China Morning Post': 24,
  'The Diplomat': 24,
  'The Moscow Times': 24,
  'Africanews': 24,
  'AllAfrica': 20,
  'MercoPress': 20,
  'Arab News': 16,
  'Buenos Aires Herald': 16,
  'Times of India': 12,
}

/**
 * Outlets publishing a general national front page rather than a world desk.
 * Their cards must clear the geopolitical test at retention as well as at
 * ingestion, because a keyword blocklist alone lets sport and entertainment
 * through — and anything already in the feed never sees the ingest filter.
 */
export const STRICT_OUTLETS = new Set([
  'Times of India',
  'South China Morning Post',
  'Africanews',
  'AllAfrica',
])

const DEFAULT_RETENTION_CAP = 20
const NEWS_TYPES = new Set(['news', 'company'])

/**
 * Apply current quality rules to the whole retained feed, not just new cards.
 *
 * Returns the kept cards plus a breakdown, because a silent drop of 400 cards
 * is exactly the kind of thing that should appear in the run report.
 */
const ECON_TYPES = new Set(['econ', 'markets', 'trade'])

/**
 * Drop economic cards the current run did not re-emit.
 *
 * These are one-card-per-series, updated in place, and a series only becomes a
 * card while it is doing something unusual. When it stops, the card has to go —
 * otherwise it sits in the feed for 45 days as exactly the thing the notability
 * gate exists to prevent: "US high-yield credit spread 2.8%, down 0.1 points",
 * with no sparkline and no reasoning because it predates both.
 *
 * Guarded on the incoming set actually containing economic cards, so a FRED
 * outage cannot silently delete the entire economics section.
 */
export function pruneSupersededEcon(cards, incomingIds) {
  const incomingEcon = cards.some((c) => ECON_TYPES.has(c.type) && incomingIds.has(c.id))
  if (!incomingEcon) return { kept: cards, dropped: 0 }

  let dropped = 0
  const kept = cards.filter((card) => {
    if (!ECON_TYPES.has(card.type)) return true
    if (incomingIds.has(card.id)) return true
    dropped++
    return false
  })
  return { kept, dropped }
}

export function pruneRetained(cards) {
  const dropped = { noise: 0, offTopic: 0, outletCap: 0 }

  const surviving = cards.filter((card) => {
    if (!NEWS_TYPES.has(card.type)) return true
    const text = `${card.headline} ${card.dek ?? ''}`
    if (NOISE.test(text)) {
      dropped.noise++
      return false
    }
    if (STRICT_OUTLETS.has(card.source?.name) && !GEOPOLITICAL.test(text)) {
      dropped.offTopic++
      return false
    }
    return true
  })

  // Highest-scoring first, so a cap keeps the best of an outlet rather than
  // whichever happened to be fetched first.
  const perOutlet = new Map()
  const kept = []

  for (const card of [...surviving].sort((a, b) => b.score - a.score)) {
    if (!NEWS_TYPES.has(card.type)) {
      kept.push(card)
      continue
    }
    const outlet = card.source?.name ?? 'unknown'
    const cap = RETENTION_CAP[outlet] ?? DEFAULT_RETENTION_CAP
    const used = perOutlet.get(outlet) ?? 0
    if (used >= cap) {
      dropped.outletCap++
      continue
    }
    perOutlet.set(outlet, used + 1)
    kept.push(card)
  }

  return { kept, dropped }
}
