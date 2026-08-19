import { SERIES } from '../../../content/series.js'
import { buildUrl, fetchWithRetry } from '../../lib/http.js'
import { inferRegion, makeCard, makeId } from '../normalize.js'

const BASE = 'https://api.stlouisfed.org/fred'

// Ten years of history: enough for "highest since" to reach something
// meaningful and for a standard deviation that isn't dominated by last month.
const YEARS_OF_HISTORY = 10
const SPARK_POINTS = 64

// A markets card has to earn its place — without this the feed fills with
// "the S&P moved 0.2%" every single day.
const NOTABLE_SIGMA = 1.5

/**
 * Every card has to earn its place, not just markets ones.
 *
 * Giving a full screen to "ECB deposit rate 2.3%, up 0.3 points on a year ago"
 * is a waste of a swipe: it is a reading, not news. Of 67 economic cards on the
 * first pass, 39 said nothing beyond the current value. A series now needs to
 * be doing something genuinely unusual to appear at all.
 */
const NOTABILITY = {
  // A record or multi-year extreme.
  EXTREME_YEARS: 3,
  // Standard deviations from the ten-year mean.
  Z_SCORE: 1.5,
  // A single-period move this many sigma against the series' own volatility.
  MOVE_SIGMA: 2,
  // Year-on-year change in the top/bottom decile of this series' own history.
  YOY_PERCENTILE: 0.9,
}

/**
 * How old the newest observation may be, by publication frequency.
 *
 * FRED keeps discontinued series queryable, so a dead one returns a perfectly
 * well-formed response with years-old numbers. Euro area unemployment
 * (LRHUTTTTEZM156S) shipped in the live feed presenting a January 2023 figure
 * as current — the API gave no hint anything was wrong. Anything past these
 * bounds is dropped rather than published as today's number.
 */
const MAX_STALENESS_DAYS = { D: 14, W: 30, BW: 45, M: 120, Q: 300, SA: 550, A: 800 }
const DEFAULT_STALENESS_DAYS = 200

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function prettyDate(iso) {
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

function formatValue(value, { format, unit }) {
  const abs = Math.abs(value)
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'percentPlain':
      return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
    case 'usd':
      return `$${value.toFixed(2)}${unit ?? ''}`
    case 'usdBillions':
      return `${value < 0 ? '−' : ''}$${(abs / 1000).toFixed(1)}bn`
    case 'usdMillions':
      return `${value < 0 ? '−' : ''}$${(abs / 1000).toFixed(1)}bn`
    case 'usdWhole':
      return `$${Math.round(value).toLocaleString('en-US')}${unit ?? ''}`
    case 'index':
      return value.toFixed(1)
    default:
      // Explicit locale: the default follows the machine, and on a European
      // one "7692" formats as "7.692", which reads as seven point six.
      return abs >= 1000
        ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : value.toFixed(2)
  }
}

const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

// A record has to actually span some time to be worth saying. Counting
// observations instead would make "highest since" mean six days ago on a daily
// series, which is true and useless.
const MIN_EXTREME_DAYS = 120

/** Index series are meaningless as levels — convert to year-over-year percent. */
function toYoyPercent(points) {
  // Infer the observations-per-year from spacing so this works for monthly and
  // quarterly series alike.
  if (points.length < 3) return []
  const gapDays = (Date.parse(points[1].date) - Date.parse(points[0].date)) / 86_400_000
  const perYear = gapDays > 200 ? 1 : gapDays > 60 ? 4 : 12

  const out = []
  for (let i = perYear; i < points.length; i++) {
    const prior = points[i - perYear].value
    if (!prior) continue
    out.push({ date: points[i].date, value: ((points[i].value - prior) / prior) * 100 })
  }
  return out
}

/**
 * The "so what" line, computed rather than written.
 *
 * FRED returns the whole series, so the context that makes a number mean
 * something — is this high? higher than last year? — is arithmetic, not
 * commentary. This is what stands in for an LLM in Phase 1.
 */
function computeStats(points, config) {
  const latest = points[points.length - 1]
  const previous = points[points.length - 2] ?? null

  // Year-ago comparison, by date rather than by index, so it survives gaps.
  const yearAgoTarget = Date.parse(latest.date) - 365 * 86_400_000
  let yearAgo = null
  for (let i = points.length - 1; i >= 0; i--) {
    if (Date.parse(points[i].date) <= yearAgoTarget) {
      yearAgo = points[i]
      break
    }
  }

  // "Highest since": walk back to the last observation at least this high.
  let extreme = null
  const isHigh = points.slice(0, -1).every((p) => p.value <= latest.value)
  const isLow = points.slice(0, -1).every((p) => p.value >= latest.value)

  if (isHigh) {
    extreme = { kind: 'highest', since: null }
  } else if (isLow) {
    extreme = { kind: 'lowest', since: null }
  } else {
    let i = points.length - 2
    while (i >= 0 && points[i].value < latest.value) i--
    const higherAt = i
    i = points.length - 2
    while (i >= 0 && points[i].value > latest.value) i--
    const lowerAt = i

    const highSince = points[higherAt + 1]?.date ?? null
    const lowSince = points[lowerAt + 1]?.date ?? null
    const highDays = highSince ? daysBetween(latest.date, highSince) : 0
    const lowDays = lowSince ? daysBetween(latest.date, lowSince) : 0

    if (highDays >= MIN_EXTREME_DAYS && highDays >= lowDays) {
      extreme = { kind: 'highest', since: highSince }
    } else if (lowDays >= MIN_EXTREME_DAYS) {
      extreme = { kind: 'lowest', since: lowSince }
    }
  }

  const values = points.map((p) => p.value)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)

  const changes = points.slice(1).map((p, i) => p.value - points[i].value)
  const changeMean = changes.reduce((a, b) => a + b, 0) / (changes.length || 1)
  const changeSd = Math.sqrt(
    changes.reduce((a, b) => a + (b - changeMean) ** 2, 0) / (changes.length || 1),
  )

  const delta = previous ? latest.value - previous.value : null
  const yoyDelta = yearAgo ? latest.value - yearAgo.value : null

  return {
    latest,
    previous,
    yearAgo,
    delta,
    yoyDelta,
    yoyPct: yearAgo && yearAgo.value ? ((latest.value - yearAgo.value) / Math.abs(yearAgo.value)) * 100 : null,
    extreme,
    z: sd ? (latest.value - mean) / sd : 0,
    moveSigma: changeSd && delta !== null ? Math.abs(delta) / changeSd : 0,
  }
}

/**
 * Every year-on-year change this series has ever posted, so today's can be
 * judged against its own history rather than an arbitrary threshold. A 3%
 * move is dramatic for unemployment and nothing for natural gas.
 */
function yoyHistory(points) {
  const out = []
  let j = 0
  for (let i = 0; i < points.length; i++) {
    const target = Date.parse(points[i].date) - 365 * 86_400_000
    while (j < i && Date.parse(points[j + 1]?.date ?? 0) <= target) j++
    const prior = points[j]
    if (!prior || prior === points[i] || !prior.value) continue
    if (Date.parse(points[i].date) - Date.parse(prior.date) < 300 * 86_400_000) continue
    out.push(Math.abs(((points[i].value - prior.value) / Math.abs(prior.value)) * 100))
  }
  return out
}

function percentileOf(sorted, value) {
  if (sorted.length === 0) return 0
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo / sorted.length
}

/** Decide whether this reading is worth a whole screen, and say why. */
function assessNotability(stats, points) {
  const reasons = []

  const extremeAgeYears = stats.extreme?.since
    ? (Date.parse(stats.latest.date) - Date.parse(stats.extreme.since)) / (365 * 86_400_000)
    : stats.extreme
      ? Infinity // no `since` means it is the extreme of the whole window
      : 0

  if (stats.extreme && extremeAgeYears >= NOTABILITY.EXTREME_YEARS) reasons.push('extreme')
  if (Math.abs(stats.z) >= NOTABILITY.Z_SCORE) reasons.push('far-from-average')
  if (stats.moveSigma >= NOTABILITY.MOVE_SIGMA) reasons.push('sharp-move')

  if (stats.yoyPct !== null) {
    const history = yoyHistory(points).sort((a, b) => a - b)
    if (percentileOf(history, Math.abs(stats.yoyPct)) >= NOTABILITY.YOY_PERCENTILE) {
      reasons.push('unusual-year')
    }
  }

  return { notable: reasons.length > 0, reasons, extremeAgeYears }
}

function contextSentence(stats, config) {
  const parts = []

  if (stats.yoyDelta !== null) {
    const direction = stats.yoyDelta > 0 ? 'up' : 'down'
    // Check the rounded figure, not the raw one — otherwise a change of 0.04
    // is reported as "down 0.0 points on a year ago".
    if (config.format === 'percent' || config.format === 'percentPlain') {
      const rounded = Math.abs(stats.yoyDelta).toFixed(1)
      if (Number(rounded) > 0) parts.push(`${direction} ${rounded} points on a year ago`)
    } else if (stats.yoyPct !== null) {
      const rounded = Math.abs(stats.yoyPct).toFixed(0)
      if (Number(rounded) > 0) parts.push(`${direction} ${rounded}% on a year ago`)
    }
  }

  if (stats.extreme) {
    const word = stats.extreme.kind
    parts.push(
      stats.extreme.since
        ? `${word} since ${prettyDate(stats.extreme.since)}`
        : `${word} in ${YEARS_OF_HISTORY} years`,
    )
  }

  if (parts.length === 0 && Math.abs(stats.z) > 1) {
    parts.push(`${Math.abs(stats.z).toFixed(1)}σ ${stats.z > 0 ? 'above' : 'below'} the ten-year average`)
  }

  if (parts.length === 0) return 'Little changed on the year.'
  return `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.`
}

/** Even spacing keeps the sparkline honest about time. */
function downsample(points, target) {
  if (points.length <= target) return points
  const step = (points.length - 1) / (target - 1)
  const out = []
  for (let i = 0; i < target; i++) out.push(points[Math.round(i * step)])
  return out
}

async function fetchSeries(config, key, start) {
  const meta = await fetchWithRetry(
    buildUrl(`${BASE}/series`, { series_id: config.id, api_key: key, file_type: 'json' }),
    { ttlMs: 24 * 60 * 60 * 1000 },
  )

  const data = await fetchWithRetry(
    buildUrl(`${BASE}/series/observations`, {
      series_id: config.id,
      api_key: key,
      file_type: 'json',
      observation_start: start,
      sort_order: 'asc',
    }),
    { ttlMs: 6 * 60 * 60 * 1000 },
  )

  const points = (data?.observations ?? [])
    .filter((o) => o.value !== '.' && o.value !== '')
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value))

  return { meta: meta?.seriess?.[0] ?? null, points }
}

export async function fetchFred() {
  const key = process.env.FRED_KEY
  if (!key) return { cards: [], skipped: 'FRED_KEY not set' }

  const start = new Date()
  start.setFullYear(start.getFullYear() - YEARS_OF_HISTORY)
  const startStr = start.toISOString().slice(0, 10)

  const cards = []
  const skipped = [] // genuinely broken: fetch failed, stale, too few points
  const unremarkable = [] // healthy but not doing anything worth a screen

  for (const config of SERIES) {
    let raw
    try {
      raw = await fetchSeries(config, key, startStr)
    } catch (err) {
      skipped.push(`${config.id}: ${err.message}`)
      continue
    }

    let points = raw.points
    if (config.transform === 'yoy_pct') points = toYoyPercent(points)
    if (points.length < 8) {
      skipped.push(`${config.id}: only ${points.length} usable observations`)
      continue
    }

    // Staleness gate. A discontinued series looks identical to a live one in
    // the response; only the observation date gives it away.
    const freq = raw.meta?.frequency_short ?? ''
    const limit = MAX_STALENESS_DAYS[freq] ?? DEFAULT_STALENESS_DAYS
    const ageDays = (Date.now() - Date.parse(points[points.length - 1].date)) / 86_400_000
    if (ageDays > limit) {
      skipped.push(`${config.id}: stale (${Math.round(ageDays)}d old, ${freq} limit ${limit}d)`)
      continue
    }

    const stats = computeStats(points, config)
    const notability = assessNotability(stats, points)

    if (process.env.FRED_DEBUG) {
      console.log(
        `${config.id.padEnd(20)} z=${stats.z.toFixed(2).padStart(6)} moveSigma=${stats.moveSigma.toFixed(2).padStart(6)}` +
          ` yoyPct=${String(stats.yoyPct === null ? 'null' : stats.yoyPct.toFixed(1)).padStart(7)}` +
          ` extreme=${stats.extreme ? `${stats.extreme.kind}/${stats.extreme.since ?? 'window'}` : 'none'}` +
          ` ageY=${notability.extremeAgeYears === Infinity ? 'inf' : notability.extremeAgeYears.toFixed(1)}` +
          ` -> ${notability.reasons.join('+') || 'NOT NOTABLE'}`,
      )
    }

    // Markets keep their tighter same-day rule; everything else must be doing
    // something genuinely unusual to be worth a screen.
    if (config.notableOnly) {
      if (stats.moveSigma < NOTABLE_SIGMA && !notability.notable) continue
    } else if (!notability.notable) {
      unremarkable.push(config.id)
      continue
    }

    const value = formatValue(stats.latest.value, config)
    const spark = downsample(points, SPARK_POINTS).map((p) => Number(p.value.toFixed(4)))

    cards.push(
      makeCard({
        // Deliberately excludes the observation date. One card per series,
        // updated in place — including the date would mint a new card on every
        // new datapoint and leave the superseded ones sitting in the feed for
        // the full 45-day retention window.
        id: makeId('fred', config.id),
        type: config.type,
        // The number is the card. The series name rides in the kicker.
        headline: value,
        label: config.label,
        dek: contextSentence(stats, config),
        image: null,
        source: {
          name: 'FRED',
          url: `https://fred.stlouisfed.org/series/${config.id}`,
          publishedAt: new Date(`${stats.latest.date}T12:00:00Z`).toISOString(),
        },
        topics: config.topics ?? ['economy'],
        region: inferRegion(config.topics ?? []),
        detail: {
          seriesId: config.id,
          label: config.label,
          title: raw.meta?.title ?? config.label,
          units: config.transform === 'yoy_pct' ? 'Percent change from a year ago' : (raw.meta?.units ?? null),
          frequency: raw.meta?.frequency ?? null,
          value,
          asOf: stats.latest.date,
          spark,
          sparkFrom: points[Math.max(0, points.length - SPARK_POINTS)]?.date ?? points[0].date,
          sparkTo: stats.latest.date,
          stats: {
            previous: stats.previous ? formatValue(stats.previous.value, config) : null,
            yearAgo: stats.yearAgo ? formatValue(stats.yearAgo.value, config) : null,
            extreme: stats.extreme,
            z: Number(stats.z.toFixed(2)),
            yoyPct: stats.yoyPct === null ? null : Number(stats.yoyPct.toFixed(1)),
          },
          // Why this cleared the bar — also the input the reasoning prompt uses.
          notability: notability.reasons,
        },
      }),
    )
  }

  // Keep these apart in the report. Folding "nothing happened today" into
  // "the API failed" is how a real outage hides behind a quiet market.
  const notes = []
  if (unremarkable.length) notes.push(`${unremarkable.length} unremarkable`)
  if (skipped.length) notes.push(`${skipped.length} UNAVAILABLE: ${skipped.join('; ')}`)

  return { cards, skipped: notes.length ? notes.join(' | ') : undefined }
}
