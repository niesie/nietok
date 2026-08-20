import { XMLParser } from 'fast-xml-parser'

import { fetchWithRetry } from '../../lib/http.js'
import { canonicalUrl, inferRegion, inferTopics, makeCard, makeId, stripHtml } from '../normalize.js'

/**
 * Named outlets, chosen for the perspectives the Guardian alone cannot give:
 * Brussels policy, and non-Western framing of the same events.
 *
 * Euractiv is deliberately absent — its feed returns 403 to non-browser
 * clients. The ECB feed is absent because its items carry no description,
 * which would produce cards with nothing on their face.
 */
/**
 * `limit` is per feed, and deliberately uneven.
 *
 * The feed should read as Western coverage with regular non-Western
 * perspective, not an even split — an even split gave every outlet 30 slots
 * and buried the story of the day under thirteen national front pages.
 *
 * `strict` feeds must additionally pass a geopolitical relevance test. Some
 * outlets publish a general national front page rather than a world desk, and
 * without the gate they contribute celebrity and sport rather than news.
 */
const FEEDS = [
  // ---- Core Western coverage ----
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', topics: [], limit: 26 },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', topics: [], limit: 12 },
  { name: 'Politico EU', url: 'https://www.politico.eu/feed/', topics: ['eu'], limit: 12 },
  { name: 'Deutsche Welle', url: 'https://rss.dw.com/rdf/rss-en-world', topics: ['eu'], limit: 14 },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', topics: ['eu'], limit: 20 },

  // ---- Regular non-Western perspective, in smaller measure ----
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', topics: ['mena'], limit: 14 },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', topics: ['mena'], limit: 8 },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', topics: ['china', 'asia'], limit: 12, strict: true },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/', topics: ['asia'], limit: 12 },
  { name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', topics: ['asia'], limit: 6, strict: true },
  { name: 'Africanews', url: 'https://www.africanews.com/feed/rss', topics: ['africa'], limit: 12, strict: true },
  { name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', topics: ['africa'], limit: 10, strict: true },
  { name: 'MercoPress', url: 'https://en.mercopress.com/rss/', topics: ['americas'], limit: 10 },
  { name: 'Buenos Aires Herald', url: 'https://buenosairesherald.com/feed', topics: ['americas'], limit: 8 },
  { name: 'The Moscow Times', url: 'https://www.themoscowtimes.com/rss/news', topics: ['ru-ua'], limit: 12 },
]

const DEFAULT_LIMIT = 12

/**
 * Obvious non-news. This exists because Times of India's front page supplied
 * WWE results, NFL injuries, Bollywood feuds and horoscopes to what is
 * supposed to be a geopolitics feed.
 */
const NOISE = /\b(bollywood|box office|wwe|nfl|nba|ipl|cricket|premier league|la liga|transfer window|horoscope|zodiac|astrolog|recipe|viral (reel|video)|streamer|youtuber|influencer|celebrity|actress|superstar|web series|trailer (out|drop)|teaser|grammy|oscars?|red carpet|wedding|dating|boyfriend|girlfriend|fashion week|beauty pageant|reality show|box-office|tarot|numerolog)\b/i

/** Enough signal that a story is about the world rather than a local incident. */
const GEOPOLITICAL = /\b(government|minister|president|prime minister|parliament|election|vote|policy|sanction|tariff|trade|treaty|summit|diplomat|embassy|military|troops|war|conflict|ceasefire|protest|strike|economy|economic|inflation|central bank|budget|court|law|border|migrant|refugee|nuclear|energy|oil|gas|climate|un |united nations|nato|eu |european union|security|crisis|talks|deal|agreement|aid|corruption|coup|rebel|militant|killed|attack)\b/i

function isUsable(headline, dek, strict) {
  const text = `${headline} ${dek}`
  if (NOISE.test(text)) return false
  if (strict && !GEOPOLITICAL.test(text)) return false
  return true
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

/** RSS 2.0, RDF and Atom all appear in this feed set; normalise the shapes. */
function extractItems(doc) {
  if (doc?.rss?.channel) return asArray(doc.rss.channel.item)
  if (doc?.feed?.entry) return asArray(doc.feed.entry)
  // RDF feeds (DW) nest items at the document root, not under channel.
  const rdf = doc?.['rdf:RDF'] ?? doc?.RDF
  if (rdf?.item) return asArray(rdf.item)
  return []
}

function textOf(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  // fast-xml-parser puts mixed content under #text
  return String(value['#text'] ?? '')
}

function linkOf(item) {
  if (typeof item.link === 'string') return item.link
  const links = asArray(item.link)
  // Atom: prefer rel="alternate", else the first with an href.
  const alternate = links.find((l) => l?.['@_rel'] === 'alternate' && l?.['@_href'])
  if (alternate) return alternate['@_href']
  const withHref = links.find((l) => l?.['@_href'])
  if (withHref) return withHref['@_href']
  return textOf(item.link) || item.guid?.['#text'] || textOf(item.guid) || ''
}

/**
 * Images hide in four different places depending on the feed, and an
 * image-forward feed cannot afford to miss them.
 */
function imageOf(item) {
  const media = asArray(item['media:content']).find((m) => m?.['@_url'])
  if (media) return media['@_url']

  const thumb = asArray(item['media:thumbnail']).find((m) => m?.['@_url'])
  if (thumb) return thumb['@_url']

  const enclosure = asArray(item.enclosure).find(
    (e) => e?.['@_url'] && String(e['@_type'] ?? '').startsWith('image'),
  )
  if (enclosure) return enclosure['@_url']

  // Last resort: the first <img> inside the description or content HTML.
  const html = `${textOf(item.description)} ${textOf(item['content:encoded'])}`
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html)
  return match ? match[1] : null
}

function dateOf(item) {
  const raw =
    textOf(item.pubDate) || textOf(item.published) || textOf(item.updated) || textOf(item['dc:date'])
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

/**
 * Trim to a sentence boundary.
 *
 * A hard character slice cut headlines mid-word — "the minister said the
 * agreement would" — which reads as a bug rather than a summary.
 */
function trimToSentence(text, max) {
  if (text.length <= max) return text
  const window = text.slice(0, max)
  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
  if (sentence > max * 0.4) return window.slice(0, sentence + 1).trim()
  const word = window.lastIndexOf(' ')
  return `${window.slice(0, word > 0 ? word : max).trim()}…`
}

async function fetchFeed(feed) {
  const xml = await fetchWithRetry(feed.url, {
    as: 'text',
    ttlMs: 20 * 60 * 1000,
    headers: {
      // Several of these 403 a bare bot user-agent.
      'user-agent': 'Mozilla/5.0 (compatible; nietok/0.1; +https://niesie.github.io/nietok/)',
      accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  })

  const items = extractItems(parser.parse(xml))
  const limit = feed.limit ?? DEFAULT_LIMIT
  const cards = []

  for (const item of items) {
    if (cards.length >= limit) break

    const headline = stripHtml(textOf(item.title))
    const link = linkOf(item)
    if (!headline || !link) continue

    const rawDek = stripHtml(textOf(item.description) || textOf(item.summary))
    if (!isUsable(headline, rawDek, feed.strict)) continue

    const dek = trimToSentence(rawDek, 300)

    // Some feeds carry the article body in content:encoded. Where they do, the
    // detail view has something the card face does not — otherwise "tap for
    // context" showed the same sentence back, which is worse than no button.
    const body = stripHtml(textOf(item['content:encoded']))
    const extract = body.length > dek.length + 120 ? trimToSentence(body, 1400) : null

    const url = canonicalUrl(link)
    const topics = [...new Set([...inferTopics(headline, rawDek), ...feed.topics])]
    const image = imageOf(item)

    cards.push(
      makeCard({
        id: makeId(url),
        type: 'news',
        headline,
        dek,
        image: image ? { url: image, credit: feed.name } : null,
        source: { name: feed.name, url, publishedAt: dateOf(item) },
        topics,
        region: inferRegion(topics),
        detail: { outlet: feed.name, ...(extract ? { extract } : {}) },
      }),
    )
  }

  return cards
}

export async function fetchRss() {
  const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)))

  const cards = []
  const failed = []

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      cards.push(...result.value)
    } else {
      // One dead feed must not take the other six with it.
      failed.push(FEEDS[i].name)
    }
  })

  return {
    cards,
    skipped: failed.length ? `${failed.length} feed(s) failed: ${failed.join(', ')}` : undefined,
  }
}
