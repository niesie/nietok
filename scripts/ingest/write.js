import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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

/** Details live in a separate file, so read them back to merge alongside. */
async function readExistingDetails(path) {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed?.details ?? {}
  } catch {
    return {}
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
      dek: prior.enriched?.dek ? prior.dek : card.dek,
      entities: prior.entities?.length ? prior.entities : card.entities,
      related: prior.related?.length ? prior.related : card.related,
      ...(prior.enriched ? { enriched: prior.enriched } : {}),
      firstSeen: prior.firstSeen ?? card.firstSeen,
    })
  }

  return [...byId.values()]
}

/**
 * Everything a card face needs to render. Deliberately small: this file blocks
 * first paint, so anything only the detail overlay reads belongs in the other
 * one.
 */
function toFace(card) {
  const face = {
    id: card.id,
    type: card.type,
    headline: card.headline,
    dek: card.dek,
    image: card.image,
    source: card.source,
    topics: card.topics,
    region: card.region,
    score: card.score,
    firstSeen: card.firstSeen,
  }

  // Econ cards have no photograph — the sparkline is what makes them look like
  // anything at all, so it has to travel with the face. 64 numbers per card.
  if (card.detail?.spark?.length) face.spark = card.detail.spark
  if (card.label) face.label = card.label

  return face
}

export async function writeFeed(cards, { path, dryRun = false } = {}) {
  const detailPath = join(dirname(path), dryRun ? 'details.sample.json' : 'details.json')

  const existing = dryRun ? [] : await readExisting(path)
  const existingDetails = dryRun ? {} : await readExistingDetails(detailPath)
  const now = Date.now()

  const stamped = cards.map((card) => ({
    ...card,
    firstSeen: card.firstSeen ?? new Date(now).toISOString(),
  }))
  let merged = merge(existing, stamped)

  const cutoff = now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  merged = merged.filter((card) => {
    const seen = Date.parse(card.firstSeen ?? card.source?.publishedAt ?? '')
    return !Number.isFinite(seen) || seen >= cutoff
  })

  merged = applyQuota(merged, MAX_CARDS)

  if (!dryRun && merged.length === 0 && existing.length > 0) {
    throw new Error('refusing to write an empty feed over an existing one')
  }

  // Split. A card whose detail this run did not produce keeps the detail a
  // previous run wrote, so a transient source failure does not blank it.
  const faces = merged.map(toFace)
  const details = {}
  for (const card of merged) {
    const incoming = card.detail && Object.keys(card.detail).length ? card.detail : null
    const detail = incoming ?? existingDetails[card.id] ?? null
    if (detail) details[card.id] = detail
  }

  await mkdir(dirname(path), { recursive: true })

  const indent = dryRun ? 2 : 0
  await writeFile(
    path,
    JSON.stringify({ generatedAt: new Date(now).toISOString(), count: faces.length, cards: faces }, null, indent),
  )
  await writeFile(
    detailPath,
    JSON.stringify({ generatedAt: new Date(now).toISOString(), details }, null, indent),
  )

  return {
    total: faces.length,
    added: faces.length - existing.length,
    path,
    detailPath,
    detailCount: Object.keys(details).length,
  }
}
