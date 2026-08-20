import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { HISTORY_TOPICS } from '../../../content/history-topics.js'
import { inferRegion, inferTopics, makeCard, makeId } from '../normalize.js'
import { rotatingSlice, rotationSignature } from '../rotate.js'
import { enrichWikipediaPages } from './wikipedia-enrich.js'

// Encyclopedia articles do not change hourly, and there are ~140 of them.
const REFRESH_AFTER_HOURS = 20

// Offset by 3 days against the figures pool so the two do not restart on the
// same day and hand the reader an entirely new history section at once.
const DAILY_SLICE = 56
const PHASE_OFFSET = 3

// Below this the article is a stub and the card would have nothing to say.
const MIN_EXTRACT = 260

// Enough to be worth reading, not so much that the overlay becomes an essay.
const MAX_EXTRACT = 1200

/**
 * Strip the apparatus Wikipedia opens articles with.
 *
 * Plain-text extracts keep the shell of pronunciation guides and script
 * glosses after the markup is removed, so leads arrive as "Sumer ( SOO-mər)",
 * "Epic of Gilgamesh ()" and "Ziggurat ( ); Cuneiform: 𒅆𒂍𒉪". None of it
 * survives being read aloud, and on a card it reads as broken text.
 */
function cleanExtract(text) {
  return text
    // Script glosses: "; Cuneiform: 𒅆𒂍𒉪," and friends.
    .replace(
      /[;,]?\s*(?:Cuneiform|Akkadian|Sumerian|Egyptian|Arabic|Persian|Hebrew|Greek|Latin|Chinese|Japanese|Korean|Sanskrit|Hindi|Urdu|Russian|Turkish)\s*:\s*[^,;.()]*/gi,
      '',
    )
    // Parenthetical pronunciation: IPA symbols, or respellings like "SOO-mər".
    .replace(/\([^)]*(?:[ˈˌːɑɛɪɔʊəθðʃʒŋ]|[A-Z]{2,}-)[^)]*\)/g, '')
    // Whatever is left that is empty or punctuation-only.
    .replace(/\(\s*[;,\s]*\)/g, '')
    .replace(/\s+([,;.])/g, '$1')
    // A comma stranded by the removed gloss: "A ziggurat, is a type of…".
    .replace(/,\s*(is|was|are|were|refers)\b/g, ' $1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Trim to a sentence so a card never ends mid-thought. */
function trimToSentence(text, max) {
  if (text.length <= max) return text
  const window = text.slice(0, max)
  const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
  return cut > max * 0.4 ? window.slice(0, cut + 1).trim() : `${window.trim()}…`
}

const SPREAD_DAYS = 14

/** A stable pseudo-age derived from the title, so ordering does not churn. */
function spreadDate(title) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  const hoursBack = (hash % (SPREAD_DAYS * 24)) + 12
  return new Date(Date.now() - hoursBack * 3_600_000).toISOString()
}

/** The first sentence or two — what goes on the card face. */
function opening(extract) {
  const trimmed = trimToSentence(extract, 260)
  return trimmed
}

export async function fetchHistoryTopics({ dataDir = join(process.cwd(), 'public', 'data') } = {}) {
  const statePath = join(dataDir, 'history-topics.json')

  // Reuse only a slice computed by this code, this pool and this day.
  const signature = rotationSignature({
    shape: 'topic-v2',
    poolSize: HISTORY_TOPICS.length,
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
  const todays = rotatingSlice(HISTORY_TOPICS, DAILY_SLICE, PHASE_OFFSET)
  const byTitle = new Map(todays.map((t) => [t.title, t]))
  const pages = await enrichWikipediaPages([...byTitle.keys()])

  const cards = []
  const thin = []

  for (const [title, topic] of byTitle) {
    const page = pages.get(title)
    if (!page?.extract || page.extract.length < MIN_EXTRACT) {
      thin.push(title)
      continue
    }

    const display = title.replace(/_\(.*\)$/, '').replace(/_/g, ' ')
    const cleaned = cleanExtract(page.extract)
    const extract = trimToSentence(cleaned, MAX_EXTRACT)
    const topics = inferTopics(display, cleaned)

    cards.push(
      makeCard({
        id: makeId('history-topic', title),
        // Its own type, not 'history'. Retention has to be able to tell an
        // evergreen topic card from a date-anchored anniversary, because only
        // the former should disappear when it leaves the daily rotation.
        type: 'topic',
        headline: display,
        // The era replaces the date in the kicker: these cards are not
        // anchored to an anniversary, so showing one would be a lie.
        label: topic.era,
        dek: opening(cleaned),
        image: page.image ? { url: page.image, credit: 'Wikimedia Commons' } : null,
        source: {
          name: 'Wikipedia',
          url: `https://en.wikipedia.org/wiki/${title}`,
          // These are evergreen, so there is no honest date — but stamping
          // them all "now" would make 129 topic cards permanently outrank
          // every anniversary card, which decays. Spread deterministically
          // across the past fortnight instead: stable between runs, varied
          // enough that they interleave rather than arriving as a block.
          publishedAt: spreadDate(title),
        },
        topics,
        region: inferRegion(topics),
        detail: {
          kind: 'topic',
          era: topic.era,
          articleTitle: display,
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
    skipped: thin.length ? `${thin.length} article(s) too thin or missing` : undefined,
  }
}
