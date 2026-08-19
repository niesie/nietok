import { buildUrl, fetchWithRetry } from '../../lib/http.js'
import { canonicalUrl, inferRegion, inferTopics, makeCard, makeId, stripHtml } from '../normalize.js'

const ENDPOINT = 'https://content.guardianapis.com/search'

// The backbone sections. Guardian's own editorial filtering means these are
// already close to what we want, so no extra keyword gate is needed here.
const SECTIONS = [
  { section: 'world', type: 'news' },
  { section: 'politics', type: 'news' },
  { section: 'business', type: 'company' },
]

/**
 * Guardian's thumbnail field is ~500px, which looks soft full-bleed on a
 * phone. The image element carries larger assets, so prefer those when the
 * response includes them.
 */
function pickImage(result) {
  const elements = result.elements ?? []
  const imageEl = elements.find((el) => el.relation === 'main' && el.type === 'image')

  if (imageEl?.assets?.length) {
    const usable = imageEl.assets
      .map((a) => ({ url: a.file, width: Number(a.typeData?.width ?? 0) }))
      .filter((a) => a.url && a.width > 0 && a.width <= 2000)
      .sort((a, b) => b.width - a.width)
    if (usable.length) {
      return { url: usable[0].url, credit: result.fields?.byline ?? 'The Guardian' }
    }
  }

  if (result.fields?.thumbnail) {
    return { url: result.fields.thumbnail, credit: result.fields?.byline ?? 'The Guardian' }
  }
  return null
}

// Enough for the detail view to be worth opening, without the full body of 120
// articles bloating the payload every phone downloads on load.
const EXCERPT_CHARS = 1400

/** Trim to a paragraph break where possible, a sentence otherwise. */
function excerpt(bodyText = '') {
  const clean = bodyText.replace(/\r/g, '').trim()
  if (!clean) return ''
  if (clean.length <= EXCERPT_CHARS) return clean

  const window = clean.slice(0, EXCERPT_CHARS)
  const paragraph = window.lastIndexOf('\n\n')
  if (paragraph > EXCERPT_CHARS * 0.5) return `${window.slice(0, paragraph).trim()}…`

  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('." '))
  if (sentence > EXCERPT_CHARS * 0.5) return `${window.slice(0, sentence + 1).trim()}…`

  return `${window.trim()}…`
}

export async function fetchGuardian({ pageSize = 40 } = {}) {
  const key = process.env.GUARDIAN_KEY
  if (!key) {
    return { cards: [], skipped: 'GUARDIAN_KEY not set' }
  }

  const cards = []

  for (const { section, type } of SECTIONS) {
    const url = buildUrl(ENDPOINT, {
      'api-key': key,
      section,
      'page-size': pageSize,
      'order-by': 'newest',
      'show-fields': 'trailText,thumbnail,byline,headline,bodyText',
      'show-elements': 'image',
    })

    // 30 min TTL: the cron runs every 3h, so this only ever helps local reruns.
    const data = await fetchWithRetry(url, { ttlMs: 30 * 60 * 1000 })

    if (data?.response?.status !== 'ok') {
      throw new Error(`Guardian returned status "${data?.response?.status}" for ${section}`)
    }

    for (const result of data.response.results ?? []) {
      const headline = stripHtml(result.fields?.headline ?? result.webTitle ?? '')
      const dek = stripHtml(result.fields?.trailText ?? '')
      if (!headline) continue

      const link = canonicalUrl(result.webUrl)
      const topics = inferTopics(headline, dek)

      cards.push(
        makeCard({
          id: makeId(link),
          type,
          headline,
          dek,
          image: pickImage(result),
          source: {
            name: 'The Guardian',
            url: link,
            publishedAt: result.webPublicationDate,
          },
          topics,
          region: inferRegion(topics),
          detail: {
            section: result.sectionName ?? section,
            byline: result.fields?.byline ?? null,
            extract: excerpt(result.fields?.bodyText ?? ''),
          },
        }),
      )
    }
  }

  return { cards }
}
