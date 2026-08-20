import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { pruneRetained, pruneSuperseded } from './quality.js'
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
  // Neighbouring readings belong on the face — a number alone was the whole
  // complaint, and the answer has to be visible without tapping.
  if (card.detail?.related?.length) face.related = card.detail.related
  if (card.geo) face.geo = card.geo

  // A quiz is answered on the card face, so its payload travels with the face
  // rather than the detail — tapping must not wait on a second fetch.
  if (card.type === 'quiz') {
    face.quiz = {
      prompt: card.detail.prompt,
      question: card.detail.question,
      answer: card.detail.answer,
      answerCountry: card.detail.answerCountry,
      anchorCountry: card.detail.anchorCountry,
      multiple: card.detail.multiple,
      entries: card.detail.entries,
    }
  }

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

  // Current quality rules apply to the whole retained feed, not only to what
  // this run fetched. Without this, tightening a filter changes nothing for 45
  // days while cards ingested under the old rules sit there untouched — which
  // is exactly what happened: the noise filter shipped and the live feed still
  // held 86 celebrity and sport cards from before it existed.
  // Anything the pipeline regenerates each run — economic series, quizzes,
  // anniversaries, and today's slice of topics and figures — is valid only if
  // this run emitted it. News is exempt: it arrives and ages out instead.
  const superseded = pruneSuperseded(merged, new Set(stamped.map((c) => c.id)))
  merged = superseded.kept

  const pruned = pruneRetained(merged)
  merged = pruned.kept

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
    // Surfaced in the run report: dropping several hundred retained cards
    // should be visible, not silent.
    pruned: { ...pruned.dropped, superseded: superseded.dropped },
  }
}
