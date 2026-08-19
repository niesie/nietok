import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { applyQuota } from './quota.js'

const MAX_AGE_DAYS = 45
const MAX_CARDS = 1500

async function readExisting(path) {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.cards) ? parsed.cards : []
  } catch {
    return []
  }
}

/**
 * Merge this run's cards into the existing feed.
 *
 * Existing cards win on the enrichment fields. That is what makes "never
 * re-enrich" true in Phase 4: once a card carries LLM text, a later run that
 * re-fetches the same article must not overwrite it and pay for it twice.
 */
function merge(existing, incoming) {
  const byId = new Map(existing.map((card) => [card.id, card]))

  for (const card of incoming) {
    const prior = byId.get(card.id)
    if (!prior) {
      byId.set(card.id, card)
      continue
    }
    byId.set(card.id, {
      ...card,
      // Preserve anything a previous run paid for or computed.
      dek: prior.enriched?.dek ? prior.dek : card.dek,
      entities: prior.entities?.length ? prior.entities : card.entities,
      related: prior.related?.length ? prior.related : card.related,
      ...(prior.enriched ? { enriched: prior.enriched } : {}),
      firstSeen: prior.firstSeen ?? card.firstSeen,
    })
  }

  return [...byId.values()]
}

export async function writeFeed(cards, { path, dryRun = false } = {}) {
  // A dry run should show what *this* run produced. Merging into a previous
  // sample makes the counts accumulate and misrepresents the source report.
  const existing = dryRun ? [] : await readExisting(path)
  const now = Date.now()

  const stamped = cards.map((card) => ({ ...card, firstSeen: card.firstSeen ?? new Date(now).toISOString() }))
  let merged = merge(existing, stamped)

  const cutoff = now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  merged = merged.filter((card) => {
    const seen = Date.parse(card.firstSeen ?? card.source?.publishedAt ?? '')
    return !Number.isFinite(seen) || seen >= cutoff
  })

  // Quota-capped, not a global score slice — see quota.js for why.
  merged = applyQuota(merged, MAX_CARDS)

  const payload = {
    generatedAt: new Date(now).toISOString(),
    count: merged.length,
    cards: merged,
  }

  const body = JSON.stringify(payload, null, dryRun ? 2 : 0)

  if (!dryRun) {
    // A run where every source failed must not wipe a good feed.
    if (merged.length === 0 && existing.length > 0) {
      throw new Error('refusing to write an empty feed over an existing one')
    }
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)

  return { total: merged.length, added: merged.length - existing.length, path }
}
