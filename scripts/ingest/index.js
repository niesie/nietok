import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { linkHistoryToNews, linkSameDay } from './crosslink.js'
import { dedupe } from './dedupe.js'
import { applyQuota } from './quota.js'
import { rank } from './rank.js'
import { writeFeed } from './write.js'
import { fetchGuardian } from './sources/guardian.js'
import { fetchOnThisDay } from './sources/wikimedia.js'

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
  },
  strict: false,
})

const DRY_RUN = args['dry-run']
const LIMIT = args.limit ? Number(args.limit) : null

const SOURCES = [
  { name: 'guardian', run: fetchGuardian },
  { name: 'wikimedia:onthisday', run: fetchOnThisDay },
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
  linkSameDay(finalCards)
  linkHistoryToNews(finalCards)

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
  const history = finalCards.filter((c) => c.type === 'history')
  console.log('history context:', {
    sameDay: history.filter((c) => c.detail.sameDay?.length).length,
    chain: history.filter((c) => c.detail.chain).length,
    facts: history.filter((c) => c.detail.facts).length,
    relatedNews: history.filter((c) => c.detail.relatedNews?.length).length,
    of: history.length,
  })

  const written = await writeFeed(finalCards, { path, dryRun: DRY_RUN })
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
