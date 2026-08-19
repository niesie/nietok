import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { affordableRequests, collectBatch, perRequestCost, selectCandidates, submitBatch } from './batch.js'
import { describe, loadLedger, recordSpend, runQuotaUsd, saveLedger } from './budget.js'

/**
 * LLM enrichment, gated by a hard monthly cap.
 *
 * The cycle is deliberately split across runs: this run collects whatever the
 * previous one submitted, then submits a new batch. Nothing waits on a batch to
 * finish, so a stuck or slow batch costs no CI time — the cards simply arrive
 * enriched on the next run instead.
 */
export async function runEnrichment({ dataDir, dryRun, estimateOnly, existingDetails }) {
  const ledgerPath = join(dataDir, 'llm-budget.json')
  const pendingPath = join(dataDir, 'pending-batch.json')

  const apiKey = process.env.ANTHROPIC_API_KEY
  let ledger = await loadLedger(ledgerPath)

  const quota = runQuotaUsd(ledger)
  const affordable = affordableRequests(quota)

  // Named `budget`, not `ledger` — the raw ledger object travels on the state
  // under `ledger`, and having the human-readable summary share that key made
  // the no-key early return still look like a usable ledger downstream.
  const report = {
    budget: describe(ledger),
    perRequest: `$${perRequestCost().toFixed(5)}`,
    affordableThisRun: affordable,
  }

  // Without a key there is nothing to collect, but --llm-estimate still needs
  // the ledger and quota to report what a real run would submit.
  if (!apiKey) {
    return {
      ...report,
      skipped: 'ANTHROPIC_API_KEY not set',
      parallels: [],
      ledger,
      ledgerPath,
      pendingPath,
      quota,
      affordable,
      estimateOnly,
    }
  }

  // ---- 1. Collect whatever the previous run submitted ----
  const parallels = []
  const reasonings = []
  let pending = null
  try {
    pending = JSON.parse(await readFile(pendingPath, 'utf8'))
  } catch {
    pending = null
  }

  if (pending?.batchId) {
    try {
      const result = await collectBatch(pending.batchId, apiKey)
      if (result.done) {
        parallels.push(...result.verified)
        reasonings.push(...result.reasonings)
        ledger = recordSpend(ledger, result.usage)
        report.collected = {
          batch: pending.batchId,
          precedentsClaimed: result.claimed,
          precedentsVerified: result.verified.length,
          precedentsRejected: result.claimed - result.verified.length,
          reasonings: result.reasonings.length,
          errored: result.errored,
          cost: `$${(result.usage.inputTokens * 5e-7 + result.usage.outputTokens * 2.5e-6).toFixed(5)}`,
        }
        // Mark every id we paid for, so cards that produced nothing are not
        // asked about again on the next run.
        report.attempted = pending.submittedIds ?? []
        if (!dryRun) await writeFile(pendingPath, JSON.stringify({ batchId: null }))
      } else {
        report.collected = { batch: pending.batchId, status: result.status, note: 'still processing' }
        return { ...report, parallels, reasonings }
      }
    } catch (err) {
      report.collectError = err.message
      if (!dryRun) await writeFile(pendingPath, JSON.stringify({ batchId: null }))
    }
  }

  return {
    ...report,
    parallels,
    reasonings,
    ledger,
    ledgerPath,
    pendingPath,
    quota,
    affordable,
    estimateOnly,
  }
}

/** Second half: choose candidates and submit. Separated so the caller can rank first. */
export async function submitNextBatch(state, cards, existingDetails) {
  const { ledger, ledgerPath, pendingPath, affordable, estimateOnly } = state

  // Belt and braces: never reach the SDK without a key, whatever the state.
  if (!process.env.ANTHROPIC_API_KEY && !estimateOnly) {
    return { submitted: 0, note: 'ANTHROPIC_API_KEY not set' }
  }
  if (!ledger || !ledgerPath) return { submitted: 0, note: 'enrichment not initialised' }
  if (affordable <= 0) return { submitted: 0, note: 'run quota exhausted' }

  const candidates = selectCandidates(cards, existingDetails, affordable)
  if (candidates.length === 0) return { submitted: 0, note: 'no candidates needing enrichment' }

  if (estimateOnly) {
    return {
      submitted: 0,
      note: `estimate only — would submit ${candidates.length} request(s), ~$${(candidates.length * perRequestCost()).toFixed(5)}`,
    }
  }

  const { batchId, submitted, submittedIds, breakdown } = await submitBatch(
    candidates,
    process.env.ANTHROPIC_API_KEY,
    existingDetails,
  )
  await writeFile(pendingPath, JSON.stringify({ batchId, submittedIds, submittedAt: new Date().toISOString() }))
  await saveLedger(ledgerPath, ledger)

  return { submitted, batchId, breakdown }
}

export async function persistLedger(state) {
  if (state?.ledger && state?.ledgerPath) await saveLedger(state.ledgerPath, state.ledger)
}
