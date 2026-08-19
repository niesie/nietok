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
const FEEDS = [
  // Europe / Brussels
  { name: 'Politico EU', url: 'https://www.politico.eu/feed/', topics: ['eu'] },
  { name: 'Deutsche Welle', url: 'https://rss.dw.com/rdf/rss-en-world', topics: ['eu'] },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', topics: ['eu'] },

  // Middle East
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', topics: ['mena'] },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', topics: ['mena'] },

  // Asia
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', topics: ['china', 'asia'] },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/', topics: ['asia'] },
  { name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', topics: ['asia'] },

  // Africa
  { name: 'Africanews', url: 'https://www.africanews.com/feed/rss', topics: ['africa'] },
  { name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', topics: ['africa'] },

  // Latin America
  { name: 'MercoPress', url: 'https://en.mercopress.com/rss/', topics: ['americas'] },
  { name: 'Buenos Aires Herald', url: 'https://buenosairesherald.com/feed', topics: ['americas'] },

  // Russia / Ukraine
  { name: 'The Moscow Times', url: 'https://www.themoscowtimes.com/rss/news', topics: ['ru-ua'] },
]

const PER_FEED_LIMIT = 30

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

  const items = extractItems(parser.parse(xml)).slice(0, PER_FEED_LIMIT)
  const cards = []

  for (const item of items) {
    const headline = stripHtml(textOf(item.title))
    const link = linkOf(item)
    if (!headline || !link) continue

    const dek = stripHtml(textOf(item.description) || textOf(item.summary)).slice(0, 320)
    const url = canonicalUrl(link)
    const topics = [...new Set([...inferTopics(headline, dek), ...feed.topics])]
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
        detail: { outlet: feed.name, extract: dek },
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
