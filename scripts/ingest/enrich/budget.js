import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * The spend cap, enforced in code rather than estimated in a spreadsheet.
 *
 * €2/month ≈ $2.20. The API bills in USD, so the cap is held in USD to avoid
 * pretending we know today's exchange rate.
 */
const DEFAULT_CAP_USD = 2.2

// claude-haiku-4-5 through the Batch API: $1/$5 per MTok, halved.
export const PRICING = { inputPerToken: 0.5 / 1e6, outputPerToken: 2.5 / 1e6 }

// The cron fires every 3 hours.
const RUNS_PER_DAY = 8

export function capUsd() {
  const raw = Number(process.env.LLM_MONTHLY_CAP_USD)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CAP_USD
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function empty() {
  return { month: currentMonth(), spentUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0, runs: 0 }
}

export async function loadLedger(path) {
  try {
    const ledger = JSON.parse(await readFile(path, 'utf8'))
    // A new calendar month starts from zero.
    if (ledger.month !== currentMonth()) return empty()
    return { ...empty(), ...ledger, month: ledger.month }
  } catch {
    // No ledger means either the first run or an evicted CI cache. Starting
    // from zero is the risky direction, which is exactly why the Anthropic
    // Console spend limit is the authoritative backstop, not this file.
    return empty()
  }
}

export async function saveLedger(path, ledger) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(ledger, null, 2))
}

export function estimateCost({ inputTokens = 0, outputTokens = 0 }) {
  return inputTokens * PRICING.inputPerToken + outputTokens * PRICING.outputPerToken
}

export function remainingUsd(ledger) {
  return Math.max(0, capUsd() - ledger.spentUsd)
}

/**
 * What this single run may spend: the month's remainder divided by the runs
 * left in it. One runaway build cannot eat the month.
 */
export function runQuotaUsd(ledger, now = new Date()) {
  const remaining = remainingUsd(ledger)
  if (remaining <= 0) return 0

  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate()
  const daysLeft = Math.max(1, daysInMonth - now.getUTCDate() + 1)
  const runsLeft = Math.max(1, daysLeft * RUNS_PER_DAY)

  // Strictly even pacing. An earlier version allowed a run to take up to a
  // tenth of the remaining budget as "headroom", which projected to $5.53 a
  // month against a $2.20 cap — the cap still held, but enrichment would have
  // switched off around the 12th and stayed off. Spread thin is better than
  // spent early.
  return remaining / runsLeft
}

export function recordSpend(ledger, { inputTokens = 0, outputTokens = 0, calls = 0 }) {
  return {
    ...ledger,
    spentUsd: Number((ledger.spentUsd + estimateCost({ inputTokens, outputTokens })).toFixed(6)),
    inputTokens: ledger.inputTokens + inputTokens,
    outputTokens: ledger.outputTokens + outputTokens,
    calls: ledger.calls + calls,
  }
}

export function describe(ledger) {
  const cap = capUsd()
  return {
    month: ledger.month,
    spent: `$${ledger.spentUsd.toFixed(4)}`,
    cap: `$${cap.toFixed(2)}`,
    remaining: `$${remainingUsd(ledger).toFixed(4)}`,
    runQuota: `$${runQuotaUsd(ledger).toFixed(4)}`,
    calls: ledger.calls,
  }
}
