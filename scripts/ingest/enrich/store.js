import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Durable store of everything the LLM has ever written, keyed by card id.
 *
 * Enrichment used to live only in details.json, which is rebuilt from the
 * cards currently in the feed. That was fine until cards started rotating: a
 * figure leaves today's slice, its detail is not written, and when it returns
 * six days later nothing remembers it was ever enriched — so it is written and
 * paid for again. At 262 figures on a six-day cycle that is roughly $1.18 a
 * month spent reproducing text we already had, against a $2.20 cap.
 *
 * Card ids are stable content hashes, so an entry stays valid for as long as
 * the card can come back.
 */
const FILE = 'enrichment.json'

// Figures and economic series are bounded, but news ids churn constantly and
// each carries a precedent or an attempt marker. Cap by recency so the file
// cannot grow without limit.
const MAX_ENTRIES = 6000

export async function loadEnrichment(dataDir) {
  try {
    const raw = JSON.parse(await readFile(join(dataDir, FILE), 'utf8'))
    return raw?.entries ?? {}
  } catch {
    return {}
  }
}

export async function saveEnrichment(dataDir, entries) {
  const ids = Object.keys(entries)

  let kept = entries
  if (ids.length > MAX_ENTRIES) {
    kept = Object.fromEntries(
      ids
        .map((id) => [id, entries[id]])
        .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
        .slice(0, MAX_ENTRIES),
    )
  }

  await writeFile(
    join(dataDir, FILE),
    JSON.stringify({ savedAt: new Date().toISOString(), entries: kept }),
  )
  return Object.keys(kept).length
}

/** Copy stored enrichment onto a card. */
export function applyStored(card, entry) {
  if (!card || !entry) return
  if (entry.figure) {
    card.detail.figure = entry.figure
    card.dek = entry.figure.hook
  }
  if (entry.reasoning) {
    if (!card.detail.computedContext) card.detail.computedContext = card.dek
    card.detail.reasoning = entry.reasoning
    card.dek = entry.reasoning
  }
  if (entry.parallel) card.detail.parallel = entry.parallel
  if (entry.figureAttempted) card.detail.figureAttempted = true
  if (entry.reasoningAttempted) card.detail.reasoningAttempted = true
  if (entry.parallelAttempted) card.detail.parallelAttempted = true
}

/** Record what a card now carries, so it survives the card leaving the feed. */
export function remember(entries, cardId, patch) {
  const prior = entries[cardId] ?? {}
  entries[cardId] = { ...prior, ...patch, at: Date.now() }
}
