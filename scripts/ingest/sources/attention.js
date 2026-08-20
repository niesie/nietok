import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { WATCHLIST } from '../../../content/watchlist.js'
import { fetchWithRetry } from '../../lib/http.js'
import { inferRegion, inferTopics, makeCard, makeId } from '../normalize.js'

// The Wikimedia pageviews endpoint answers in ~5s, so 150 sequential requests
// took 13 minutes — longer than the entire rest of the ingest. Eight at a time
// stays well inside their rate limit and brings it under two minutes.
const CONCURRENCY = 8

// Pageview data is published once a day, so sweeping every three-hourly run
// re-fetches numbers that cannot have changed. Results are cached in
// public/data, which CI already carries between runs.
const REFRESH_AFTER_HOURS = 20

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user'

const WINDOW_DAYS = 32

// Below this a "spike" is somebody's seminar reading list, not the world's
// attention. Bab-el-Mandeb sits near 2,500/day at rest; obscure articles that
// triple from 40 views mean nothing.
const MIN_DAILY_VIEWS = 400

// Measured against seven other watchlist entries sitting between 0.8x and 1.4x
// on the same day the Strait of Hormuz hit 2.3x, so this cleanly separates a
// real move from ordinary variation.
const SPIKE_RATIO = 1.7

const MAX_CARDS = 8

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`

function titleOf(article) {
  return decodeURIComponent(article).replace(/_/g, ' ')
}

/**
 * The baseline excludes the last week.
 *
 * Comparing today against an average that already contains the spike would
 * flatten exactly the events worth surfacing — a story running hot for five
 * days would drag its own baseline up and disappear.
 */
function assess(views) {
  if (views.length < 14) return null

  const recent = views.slice(-3)
  const baselineDays = views.slice(0, -7)
  if (baselineDays.length < 7) return null

  const baseline = baselineDays.reduce((a, b) => a + b, 0) / baselineDays.length
  const latest = Math.max(...recent)
  if (baseline <= 0 || latest < MIN_DAILY_VIEWS) return null

  return { baseline, latest, ratio: latest / baseline }
}

async function fetchArticle(article) {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS)

  const data = await fetchWithRetry(`${API}/${article}/daily/${stamp(start)}/${stamp(end)}`, {
    ttlMs: 6 * 60 * 60 * 1000,
    headers: { 'Api-User-Agent': 'nietok/0.1 (personal news reader)' },
  })

  const items = data?.items ?? []
  return { article, views: items.map((i) => i.views), dates: items.map((i) => i.timestamp) }
}

export async function fetchAttention({ dataDir = join(process.cwd(), 'public', 'data') } = {}) {
  const statePath = join(dataDir, 'attention.json')

  // Reuse yesterday's sweep if the numbers cannot have moved.
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    const ageHours = (Date.now() - Date.parse(state.fetchedAt)) / 3_600_000
    if (ageHours < REFRESH_AFTER_HOURS && Array.isArray(state.cards) && state.cards.length) {
      return { cards: state.cards, skipped: `reused, ${Math.round(ageHours)}h old` }
    }
  } catch {
    // No state, or unreadable — fall through and sweep.
  }

  const failed = []

  const settled = await mapWithConcurrency(WATCHLIST, CONCURRENCY, async (article) => {
    try {
      return await fetchArticle(article)
    } catch {
      // A missing or renamed article must not fail the source.
      failed.push(article)
      return null
    }
  })

  const spikes = []
  for (const series of settled) {
    if (!series) continue
    const verdict = assess(series.views)
    if (!verdict || verdict.ratio < SPIKE_RATIO) continue
    spikes.push({ ...series, ...verdict })
  }

  // Only the sharpest few. Attention cards are a garnish, not a section.
  spikes.sort((a, b) => b.ratio - a.ratio)

  const cards = spikes.slice(0, MAX_CARDS).map((s) => {
    const title = titleOf(s.article)
    const topics = inferTopics(title)
    const multiple = s.ratio >= 10 ? Math.round(s.ratio) : Number(s.ratio.toFixed(1))

    return makeCard({
      // No date in the id: one card per subject, updated in place, so a story
      // running hot for a week does not mint seven near-identical cards.
      id: makeId('attention', s.article),
      type: 'attention',
      headline: title,
      label: 'Sudden interest',
      dek: `Lookups are running ${multiple}× their usual rate — ${Math.round(s.latest).toLocaleString('en-US')} a day against a normal ${Math.round(s.baseline).toLocaleString('en-US')}.`,
      image: null,
      spark: s.views,
      source: {
        name: 'Wikipedia pageviews',
        url: `https://en.wikipedia.org/wiki/${s.article}`,
        publishedAt: new Date().toISOString(),
      },
      topics,
      region: inferRegion(topics),
      detail: {
        article: s.article,
        title,
        ratio: multiple,
        latest: Math.round(s.latest),
        baseline: Math.round(s.baseline),
        spark: s.views,
        windowDays: WINDOW_DAYS,
        // What this measures, stated on the card rather than assumed.
        method:
          'Daily article views over the past month, comparing the last three days against the preceding three weeks.',
      },
    })
  })

  try {
    await writeFile(statePath, JSON.stringify({ fetchedAt: new Date().toISOString(), cards }))
  } catch {
    // Losing the cache costs a re-sweep, not correctness.
  }

  const notes = []
  if (spikes.length > MAX_CARDS) notes.push(`${spikes.length - MAX_CARDS} further spikes not shown`)
  if (failed.length) notes.push(`${failed.length} article(s) unavailable`)

  return { cards, skipped: notes.length ? notes.join(' | ') : undefined }
}
