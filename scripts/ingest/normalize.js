import { createHash } from 'node:crypto'

/**
 * The single card shape the frontend renders. Every source adapter must emit
 * this; nothing downstream knows which API a card came from.
 *
 * @typedef {object} Card
 * @property {string} id          Stable across runs — enrichment is keyed on it.
 * @property {'news'|'econ'|'markets'|'company'|'history'|'trade'} type
 * @property {string} headline
 * @property {string} dek         1-3 sentences. Source-authored in Phase 1.
 * @property {{url:string, credit:string}|null} image
 * @property {{name:string, url:string, publishedAt:string}} source
 * @property {string[]} topics
 * @property {string[]} entities  Wikidata QIDs. Populated in Phase 3.
 * @property {string|null} region
 * @property {number} score       Freshness x prominence. Set by rank.js.
 * @property {string[]} related   Card ids.
 * @property {object} detail      Type-specific payload for the overlay.
 */

export function makeId(...parts) {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)
}

/** Strip tracking params so the same article from two feeds dedupes to one id. */
export function canonicalUrl(raw) {
  try {
    const url = new URL(raw)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|CMP|cmp)/i.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return raw
  }
}

/** Guardian ships HTML in trailText; the card face is plain text. */
export function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const TOPIC_PATTERNS = [
  ['ru-ua', /\b(ukrain|russia|kyiv|moscow|putin|zelensky|donbas|crimea)/i],
  ['mena', /\b(israel|gaza|palestin|iran|syria|lebanon|hezbollah|houthi|red sea|saudi|yemen)/i],
  ['china', /\b(china|beijing|taiwan|xi jinping|hong kong|south china sea)/i],
  ['eu', /\b(european union|brussels|eurozone|ecb|nato|european commission|euro)/i],
  ['energy', /\b(oil|gas|opec|pipeline|lng|energy|petrol|crude|nuclear power)/i],
  ['trade', /\b(tariff|sanction|export control|trade war|supply chain|semiconductor|chip)/i],
  ['defence', /\b(military|missile|troops|defence|defense|weapons|army|navy|airstrike)/i],
  ['economy', /\b(inflation|gdp|recession|central bank|interest rate|unemployment|debt)/i],
  ['africa', /\b(africa|sahel|nigeria|ethiopia|sudan|congo|egypt)/i],
  ['americas', /\b(united states|washington|white house|brazil|mexico|venezuela|argentina)/i],
  ['asia', /\b(india|japan|korea|pakistan|indonesia|philippines|vietnam)/i],
]

/** Cheap keyword classification. Phase 3 replaces this with Wikidata entities. */
export function inferTopics(...texts) {
  const haystack = texts.filter(Boolean).join(' ')
  const topics = []
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(haystack)) topics.push(topic)
  }
  return topics
}

const REGION_BY_TOPIC = {
  'ru-ua': 'europe',
  mena: 'mena',
  china: 'asia',
  eu: 'europe',
  africa: 'africa',
  americas: 'americas',
  asia: 'asia',
}

export function inferRegion(topics) {
  for (const topic of topics) {
    if (REGION_BY_TOPIC[topic]) return REGION_BY_TOPIC[topic]
  }
  return null
}

/** Fill in defaults so every adapter returns the same shape. */
export function makeCard(partial) {
  return {
    id: partial.id,
    type: partial.type,
    headline: partial.headline,
    dek: partial.dek ?? '',
    image: partial.image ?? null,
    source: partial.source,
    topics: partial.topics ?? [],
    entities: partial.entities ?? [],
    region: partial.region ?? null,
    score: 0,
    related: [],
    detail: partial.detail ?? {},
  }
}
