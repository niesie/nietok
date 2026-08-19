import Anthropic from '@anthropic-ai/sdk'

import { enrichWikipediaPages } from '../sources/wikipedia-enrich.js'
import { estimateCost } from './budget.js'
import {
  ECON_SCHEMA,
  ECON_SYSTEM,
  PARALLEL_SCHEMA,
  PARALLEL_SYSTEM,
  econUserMessage,
  parallelUserMessage,
} from './prompts.js'

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 300

// Rough per-request estimate used to size a batch against the run quota.
// Deliberately generous: overestimating means we submit fewer requests than we
// could afford, which is the safe direction to be wrong in.
const EST_INPUT_TOKENS = 420
const EST_OUTPUT_TOKENS = MAX_TOKENS

// Cards you will actually scroll past. Enriching the long tail would spend the
// month's budget on things nobody sees.
const MAX_PER_RUN = 24

const MIN_PRECEDENT_AGE_YEARS = 25

export function perRequestCost() {
  return estimateCost({ inputTokens: EST_INPUT_TOKENS, outputTokens: EST_OUTPUT_TOKENS })
}

/** How many requests fit inside this run's quota. */
export function affordableRequests(quotaUsd) {
  return Math.max(0, Math.min(MAX_PER_RUN, Math.floor(quotaUsd / perRequestCost())))
}

const ECON_TYPES = new Set(['econ', 'markets', 'trade'])

/**
 * Pick what to enrich.
 *
 * Economic cards come first. They already survived the notability gate, so
 * every one is a multi-year extreme or a sharp move — and a bare number with
 * "up 0.3 points" was the whole complaint. There are only ~30 of them, so
 * funding them first costs little and leaves the rest for precedents.
 *
 * Enrichment is written onto the card and persists, so each costs money
 * exactly once in its life.
 */
export function selectCandidates(cards, existingDetails, limit) {
  const needsEcon = cards
    .filter((card) => ECON_TYPES.has(card.type))
    .filter((card) => {
      const prior = existingDetails[card.id]
      return !prior?.reasoning && !prior?.reasoningAttempted
    })
    .sort((a, b) => b.score - a.score)
    .map((card) => ({ task: 'econ', card }))

  const needsParallel = cards
    .filter((card) => card.type === 'news' || card.type === 'company')
    .filter((card) => (card.topics?.length ?? 0) > 0 && card.headline)
    .filter((card) => {
      const prior = existingDetails[card.id]
      // `attempted` records a card we already paid for and got nothing back
      // from, so we do not pay to re-ask the same question forever.
      return !prior?.parallel && !prior?.parallelAttempted
    })
    .sort((a, b) => b.score - a.score)
    .map((card) => ({ task: 'parallel', card }))

  return [...needsEcon, ...needsParallel].slice(0, limit)
}

/** custom_id carries the task type so results can be routed on collection. */
const encodeId = (task, cardId) => `${task === 'econ' ? 'e' : 'p'}-${cardId}`
const decodeId = (raw) => ({
  task: raw.startsWith('e-') ? 'econ' : 'parallel',
  cardId: raw.slice(2),
})

export async function submitBatch(candidates, apiKey, detailsById = {}) {
  const client = new Anthropic({ apiKey })

  const requests = candidates.map(({ task, card }) => {
    const isEcon = task === 'econ'
    return {
      custom_id: encodeId(task, card.id),
      params: {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: isEcon ? ECON_SYSTEM : PARALLEL_SYSTEM,
        messages: [
          {
            role: 'user',
            content: isEcon
              ? econUserMessage(card, detailsById[card.id] ?? card.detail ?? {})
              : parallelUserMessage(card),
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: isEcon ? ECON_SCHEMA : PARALLEL_SCHEMA },
        },
      },
    }
  })

  const batch = await client.messages.batches.create({ requests })
  return {
    batchId: batch.id,
    submitted: requests.length,
    submittedIds: candidates.map(({ task, card }) => encodeId(task, card.id)),
    breakdown: {
      econ: candidates.filter((c) => c.task === 'econ').length,
      parallel: candidates.filter((c) => c.task === 'parallel').length,
    },
  }
}

/**
 * Verify each claimed precedent against Wikipedia before it can reach a card.
 *
 * The model can name an event that does not exist, or attach the wrong article
 * title to a real one. A title that resolves to no article is dropped rather
 * than published — this is the difference between a precedent and a plausible
 * sentence.
 */
async function verify(parallels) {
  const titles = parallels.map((p) => p.wikipediaTitle).filter(Boolean)
  if (titles.length === 0) return []

  const pages = await enrichWikipediaPages(titles)
  const thisYear = new Date().getUTCFullYear()

  return parallels
    .map((p) => {
      const page = pages.get(p.wikipediaTitle)
      if (!page?.extract) return null // no such article — drop it
      if (!Number.isFinite(p.year) || thisYear - p.year < MIN_PRECEDENT_AGE_YEARS) return null
      return {
        cardId: p.cardId,
        title: p.title,
        year: p.year,
        parallel: p.parallel,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wikipediaTitle.replace(/ /g, '_'))}`,
        image: page.image ?? null,
        extract: page.extract.slice(0, 400),
      }
    })
    .filter(Boolean)
}

/**
 * Collect a batch submitted by an earlier run.
 *
 * Returns done:false while it is still processing, so the caller leaves the
 * pending record in place and tries again next run.
 */
export async function collectBatch(batchId, apiKey) {
  const client = new Anthropic({ apiKey })

  const batch = await client.messages.batches.retrieve(batchId)
  if (batch.processing_status !== 'ended') {
    return { done: false, status: batch.processing_status }
  }

  const rawParallels = []
  const reasonings = []
  let inputTokens = 0
  let outputTokens = 0
  let errored = 0
  let total = 0

  for await (const entry of await client.messages.batches.results(batchId)) {
    total++
    if (entry.result?.type !== 'succeeded') {
      errored++
      continue
    }
    const message = entry.result.message
    inputTokens += message.usage?.input_tokens ?? 0
    outputTokens += message.usage?.output_tokens ?? 0

    const text = message.content?.find((b) => b.type === 'text')?.text
    if (!text) continue

    const { task, cardId } = decodeId(entry.custom_id)

    try {
      const parsed = JSON.parse(text)
      if (task === 'econ') {
        if (parsed.reasoning?.trim()) reasonings.push({ cardId, reasoning: parsed.reasoning.trim() })
      } else if (parsed.found && parsed.wikipediaTitle) {
        rawParallels.push({ cardId, ...parsed })
      }
    } catch {
      // A malformed response costs nothing further; skip it.
    }
  }

  const verified = await verify(rawParallels)

  return {
    done: true,
    verified,
    reasonings,
    claimed: rawParallels.length,
    errored,
    usage: { inputTokens, outputTokens, calls: total },
  }
}
