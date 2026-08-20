import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { linkHistoryToNews, linkNewsToNews, linkSameDay } from './crosslink.js'
import { dedupe } from './dedupe.js'
import { tagGeography } from './geo.js'
import { persistLedger, runEnrichment, submitNextBatch } from './enrich/index.js'
import { applyQuota } from './quota.js'
import { rank } from './rank.js'
import { writeFeed } from './write.js'
import { fetchAttention } from './sources/attention.js'
import { fetchFigures } from './sources/figures.js'
import { fetchFred } from './sources/fred.js'
import { fetchGdelt } from './sources/gdelt.js'
import { fetchGuardian } from './sources/guardian.js'
import { fetchHistoryTopics } from './sources/history-topics.js'
import { fetchRss } from './sources/rss.js'
import { fetchOnThisDay } from './sources/wikimedia.js'

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    // Walks the enrichment queue and prints projected cost without calling
    // anything. Run this before the first uncapped run.
    'llm-estimate': { type: 'boolean', default: false },
    'llm-cap': { type: 'string' },
  },
  strict: false,
})

const DRY_RUN = args['dry-run']
const LIMIT = args.limit ? Number(args.limit) : null
const ESTIMATE_ONLY = args['llm-estimate']
if (args['llm-cap']) process.env.LLM_MONTHLY_CAP_USD = args['llm-cap']

const SOURCES = [
  { name: 'guardian', run: fetchGuardian },
  { name: 'rss', run: fetchRss },
  { name: 'wikimedia:onthisday', run: fetchOnThisDay },
  { name: 'history:topics', run: fetchHistoryTopics },
  { name: 'history:figures', run: fetchFigures },
  { name: 'fred', run: fetchFred },
  { name: 'attention', run: fetchAttention },
  // GDELT is deliberately not registered — see sources/gdelt.js for why.
  // Re-add `{ name: 'gdelt', run: fetchGdelt }` to turn it back on.
]

async function main() {
  console.log(`nietok ingest — ${DRY_RUN ? 'DRY RUN' : 'live'}${LIMIT ? `, limit ${LIMIT}` : ''}`)

  const collected = []
  const report = []

  // Sources run in parallel but are failure-isolated: one API being down
  // contributes zero cards and a warning, and never fails the build.
  const results = await Promise.allSettled(SOURCES.map(({ run }) => run()))

  results.forEach((result, i) => {
    const { name } = SOURCES[i]
    if (result.status === 'rejected') {
      report.push({ source: name, cards: 0, status: `FAILED: ${result.reason?.message ?? result.reason}` })
      return
    }
    const { cards = [], skipped } = result.value ?? {}
    collected.push(...cards)
    report.push({ source: name, cards: cards.length, status: skipped ? `skipped (${skipped})` : 'ok' })
  })

  console.table(report)

  const deduped = dedupe(collected)
  console.log(`collected ${collected.length} -> ${deduped.length} after dedupe`)

  const ranked = rank(deduped)
  // Quota rather than a plain slice, so a --limit sample reflects the real mix.
  const finalCards = LIMIT ? applyQuota(ranked, LIMIT) : ranked

  // Cross-linking runs after ranking so history-to-news picks the strongest
  // current stories, and after the limit so a sample links within itself.
  const dataDir = join(process.cwd(), 'public', 'data')

  const geo = await tagGeography(finalCards, dataDir)
  console.log(`geography: ${geo.tagged} of ${finalCards.length} cards placed on the map`)

  linkSameDay(finalCards)
  linkHistoryToNews(finalCards)
  linkNewsToNews(finalCards)

  const byType = finalCards.reduce((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }), {})
  console.log('by type:', byType)

  const withImages = finalCards.filter((c) => c.image?.url).length
  console.log(`with images: ${withImages}/${finalCards.length}`)

  // A source that silently returns nothing looks identical to a thin news day
  // unless we say so explicitly.
  const dead = report.filter((r) => r.cards === 0)
  if (dead.length) {
    console.warn(`\n⚠ ${dead.length} source(s) contributed nothing:`)
    for (const d of dead) console.warn(`  - ${d.source}: ${d.status}`)
  }

  // Under public/ so Vite serves it in dev and copies it into dist/ on build.
  const path = join(process.cwd(), 'public', 'data', DRY_RUN ? 'feed.sample.json' : 'feed.json')
  // ---- LLM enrichment (Phase 4) ----
  // Runs after ranking so only cards worth seeing are ever candidates, and
  // reads the previous details so a card is never paid for twice.
  let existingDetails = {}
  try {
    const raw = await readFile(join(dataDir, DRY_RUN ? 'details.sample.json' : 'details.json'), 'utf8')
    existingDetails = JSON.parse(raw)?.details ?? {}
  } catch {
    existingDetails = {}
  }

  const enrichState = await runEnrichment({ dataDir, dryRun: DRY_RUN, estimateOnly: ESTIMATE_ONLY, existingDetails })
  console.log('\nllm budget:', enrichState.budget, `| per request ${enrichState.perRequest}`)
  if (enrichState.skipped) console.log('llm: skipped —', enrichState.skipped)
  if (enrichState.collected) console.log('llm collected:', enrichState.collected)
  if (enrichState.collectError) console.warn('llm collect failed:', enrichState.collectError)

  // Attach verified parallels, and mark every card we paid to ask about so a
  // "no precedent found" answer is not purchased again next run.
  const byId = new Map(finalCards.map((c) => [c.id, c]))

  /**
   * Reasoning replaces the computed context on the card face, because that
   * context ("up 0.3 points on a year ago") was the thing that made economic
   * cards not worth a swipe. The computed line is kept in the detail.
   */
  const applyReasoning = (card, reasoning) => {
    if (!card || !reasoning) return
    if (!card.detail.computedContext) card.detail.computedContext = card.dek
    card.detail.reasoning = reasoning
    card.dek = reasoning
  }

  // A figure's hook replaces the encyclopedia opening on the card face; the
  // story and impact go to the overlay.
  const applyFigure = (card, figure) => {
    if (!card || !figure?.hook) return
    card.detail.figure = figure
    card.dek = figure.hook
  }

  // Re-apply anything a previous run already paid for.
  for (const card of finalCards) {
    const prior = existingDetails[card.id]
    if (prior?.reasoning) applyReasoning(card, prior.reasoning)
    if (prior?.parallel) card.detail.parallel = prior.parallel
    if (prior?.parallelAttempted) card.detail.parallelAttempted = true
    if (prior?.reasoningAttempted) card.detail.reasoningAttempted = true
    if (prior?.figure) applyFigure(card, prior.figure)
    if (prior?.figureAttempted) card.detail.figureAttempted = true
  }

  for (const parallel of enrichState.parallels ?? []) {
    const card = byId.get(parallel.cardId)
    if (card) card.detail.parallel = parallel
  }
  for (const { cardId, reasoning } of enrichState.reasonings ?? []) {
    applyReasoning(byId.get(cardId), reasoning)
  }

  for (const figure of enrichState.figures ?? []) {
    applyFigure(byId.get(figure.cardId), figure)
  }

  // Mark every id we paid to ask about, so a null answer is not bought twice.
  for (const raw of enrichState.attempted ?? []) {
    const card = byId.get(raw.slice(2))
    if (!card) continue
    if (raw.startsWith('e-')) card.detail.reasoningAttempted = true
    else if (raw.startsWith('f-')) card.detail.figureAttempted = true
    else card.detail.parallelAttempted = true
  }

  if (enrichState.parallels?.length || enrichState.reasonings?.length) {
    console.log(
      `llm: attached ${enrichState.parallels?.length ?? 0} precedent(s), ${enrichState.reasonings?.length ?? 0} reasoning(s)`,
    )
  }

  const submitted = await submitNextBatch(enrichState, finalCards, existingDetails)
  console.log('llm submit:', submitted)
  await persistLedger(enrichState)

  const history = finalCards.filter((c) => c.type === 'history')
  console.log('history context:', {
    sameDay: history.filter((c) => c.detail.sameDay?.length).length,
    chain: history.filter((c) => c.detail.chain).length,
    facts: history.filter((c) => c.detail.facts).length,
    relatedNews: history.filter((c) => c.detail.relatedNews?.length).length,
    of: history.length,
  })

  const written = await writeFeed(finalCards, { path, dryRun: DRY_RUN })
  if (written.pruned && Object.values(written.pruned).some(Boolean)) {
    const p = written.pruned
    console.log(
      `retention pruned: ${p.noise} noise, ${p.offTopic} off-topic, ${p.outletCap} over outlet cap`,
    )
  }
  console.log(`\nwrote ${written.total} cards -> ${written.path}`)
  console.log(`      ${written.detailCount} details -> ${written.detailPath}`)

  if (finalCards.length === 0) {
    console.error('no cards produced — check the source report above')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('ingest failed:', err)
  process.exit(1)
})
