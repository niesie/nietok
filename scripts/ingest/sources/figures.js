import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FIGURES } from '../../../content/figures.js'
import { inferRegion, inferTopics, makeCard, makeId } from '../normalize.js'
import { rotatingSlice, rotationSignature } from '../rotate.js'
import { enrichWikipediaPages } from './wikipedia-enrich.js'

const REFRESH_AFTER_HOURS = 20

// How many of the pool appear on any given day. At ~250 figures this cycles
// roughly every five days, so a card returns after a gap rather than sitting
// in the feed permanently.
const DAILY_SLICE = 48

// A card needs a life, not a stub.
const MIN_EXTRACT = 300

// The LLM writes from this, so it has to carry enough to write from — but a
// whole biography would cost more per card than the story is worth.
const MAX_EXTRACT = 1800

const SPREAD_DAYS = 21

/** Stable pseudo-age so evergreen cards interleave rather than arrive as a block. */
function spreadDate(title) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  return new Date(Date.now() - (((hash % (SPREAD_DAYS * 24)) + 6) * 3_600_000)).toISOString()
}

/** Same apparatus-stripping as the topic cards — see history-topics.js. */
function cleanExtract(text) {
  return text
    .replace(
      /[;,]?\s*(?:Arabic|Persian|Hebrew|Greek|Latin|Chinese|Japanese|Korean|Sanskrit|Hindi|Urdu|Russian|Turkish|Amharic|Ge'ez)\s*:\s*[^,;.()]*/gi,
      '',
    )
    .replace(/\([^)]*(?:[ˈˌːɑɛɪɔʊəθðʃʒŋ]|[A-Z]{2,}-)[^)]*\)/g, '')
    // Native-script name glosses: "(杉原 千畝, Sugihara Chiune; 1 January 1900…".
    .replace(/[(,;]\s*[^\x00-\x7F][^,;)]*/g, (m) => (m.startsWith('(') ? '(' : ''))
    // The empty lead the removed gloss leaves behind: "Arkhipov (; 30 January…".
    .replace(/\(\s*[;,]\s*/g, '(')
    .replace(/\(\s*[;,\s]*\)/g, '')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/,\s*(is|was|are|were)\b/g, ' $1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function trimToSentence(text, max) {
  if (text.length <= max) return text
  const window = text.slice(0, max)
  const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
  return cut > max * 0.4 ? window.slice(0, cut + 1).trim() : `${window.trim()}…`
}

export async function fetchFigures({ dataDir = join(process.cwd(), 'public', 'data') } = {}) {
  const statePath = join(dataDir, 'figures.json')

  // Reuse only a slice computed by this code, this pool and this day.
  const signature = rotationSignature({
    shape: 'figure-v2',
    poolSize: FIGURES.length,
    slice: DAILY_SLICE,
  })

  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    if (state.signature === signature && Array.isArray(state.cards) && state.cards.length) {
      return { cards: state.cards, skipped: 'reused, same slice' }
    }
  } catch {
    // No state — fetch.
  }

  // Today's slice, not the whole pool — see rotate.js.
  const todays = rotatingSlice(FIGURES, DAILY_SLICE, 0)
  const byTitle = new Map(todays.map((f) => [f.title, f]))
  const pages = await enrichWikipediaPages([...byTitle.keys()])

  const cards = []
  const missing = []

  for (const [title, figure] of byTitle) {
    const page = pages.get(title)
    if (!page?.extract || page.extract.length < MIN_EXTRACT) {
      missing.push(title)
      continue
    }

    const name = title.replace(/_\(.*\)$/, '').replace(/_/g, ' ')
    const extract = trimToSentence(cleanExtract(page.extract), MAX_EXTRACT)
    const topics = inferTopics(name, extract)

    cards.push(
      makeCard({
        id: makeId('figure', title),
        type: 'figure',
        headline: name,
        label: figure.era,
        // Replaced by the LLM hook once enrichment lands. Until then the
        // article's own opening still says who this was.
        dek: trimToSentence(extract, 240),
        image: page.image ? { url: page.image, credit: 'Wikimedia Commons' } : null,
        source: {
          name: 'Wikipedia',
          url: `https://en.wikipedia.org/wiki/${title}`,
          publishedAt: spreadDate(title),
        },
        topics,
        region: inferRegion(topics),
        detail: {
          kind: 'figure',
          name,
          era: figure.era,
          extract,
          qid: page.qid ?? null,
        },
      }),
    )
  }

  try {
    await writeFile(
      statePath,
      JSON.stringify({ signature, fetchedAt: new Date().toISOString(), cards }),
    )
  } catch {
    // Losing the cache costs a re-fetch, not correctness.
  }

  return {
    cards,
    skipped: missing.length ? `${missing.length} article(s) missing or too thin` : undefined,
  }
}
