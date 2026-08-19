import { buildUrl, fetchWithRetry } from '../../lib/http.js'

const API = 'https://www.wikidata.org/w/api.php'
const BATCH_SIZE = 50 // wbgetentities caps here

// Properties worth showing. Split by how they render: the chain properties
// become a sequence, the fact properties become a panel.
const CHAIN_PROPS = {
  P361: 'partOf', // part of — a battle inside its campaign inside its war
  P155: 'follows',
  P156: 'followedBy',
}

const FACT_PROPS = {
  P710: 'participants',
  P276: 'location',
  P17: 'country',
  P1120: 'deaths',
}

const TIME_PROPS = {
  P585: 'pointInTime',
  P580: 'startTime',
  P582: 'endTime',
}

// Bound the fan-out: each extra value becomes another label to resolve, and
// three participants is already more than the panel can usefully show.
const MAX_VALUES_PER_PROP = 3

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Wikidata times look like "+1944-08-19T00:00:00Z" with a precision code. */
function parseTime(claim) {
  const value = claim?.mainsnak?.datavalue?.value
  if (!value?.time) return null
  const match = /^([+-])(\d{4})-(\d{2})-(\d{2})/.exec(value.time)
  if (!match) return null
  const [, sign, year, month, day] = match
  const precision = value.precision ?? 11
  const yearNum = Number(year) * (sign === '-' ? -1 : 1)
  if (precision <= 9) return { year: yearNum, text: String(Math.abs(yearNum)) + (yearNum < 0 ? ' BC' : '') }
  if (precision === 10) return { year: yearNum, month: Number(month), text: `${year}-${month}` }
  return { year: yearNum, month: Number(month), day: Number(day), text: `${year}-${month}-${day}` }
}

function qidValues(entity, prop) {
  const claims = entity?.claims?.[prop] ?? []
  return claims
    .filter((c) => c.mainsnak?.datavalue?.value?.id)
    .slice(0, MAX_VALUES_PER_PROP)
    .map((c) => c.mainsnak.datavalue.value.id)
}

function quantityValue(entity, prop) {
  const claim = entity?.claims?.[prop]?.[0]
  const amount = claim?.mainsnak?.datavalue?.value?.amount
  if (!amount) return null
  const n = Number(amount.replace('+', ''))
  return Number.isFinite(n) ? n : null
}

async function getEntities(ids, props) {
  const out = new Map()

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const url = buildUrl(API, {
      action: 'wbgetentities',
      format: 'json',
      formatversion: 2,
      ids: batch.join('|'),
      props,
      languages: 'en',
    })

    try {
      const data = await fetchWithRetry(url, {
        ttlMs: 30 * 24 * 60 * 60 * 1000, // structured history rarely changes
        headers: { 'Api-User-Agent': 'nietok/0.1 (personal news reader)' },
      })
      for (const [id, entity] of Object.entries(data?.entities ?? {})) {
        if (!entity.missing) out.set(id, entity)
      }
    } catch {
      // Context is an upgrade, never a requirement.
    }
  }

  return out
}

/**
 * Build timeline and fact context for a set of Wikidata entities.
 *
 * Two passes: claims for the requested ids, then labels for every id those
 * claims referenced. Resolving labels one card at a time would be thousands of
 * requests; deduping across the whole run makes it a few dozen.
 *
 * @param {string[]} qids
 * @returns {Promise<Map<string, object>>} qid -> context
 */
export async function fetchWikidataContext(qids) {
  const unique = [...new Set(qids.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const entities = await getEntities(unique, 'claims')

  // Pass one: pull raw ids out of the claims.
  const raw = new Map()
  const referenced = new Set()

  for (const [qid, entity] of entities) {
    const context = { chain: {}, facts: {}, times: {} }

    for (const [prop, key] of Object.entries(CHAIN_PROPS)) {
      const values = qidValues(entity, prop)
      if (values.length) {
        context.chain[key] = values
        values.forEach((v) => referenced.add(v))
      }
    }

    for (const [prop, key] of Object.entries(FACT_PROPS)) {
      if (prop === 'P1120') {
        const deaths = quantityValue(entity, prop)
        if (deaths) context.facts.deaths = deaths
        continue
      }
      const values = qidValues(entity, prop)
      if (values.length) {
        context.facts[key] = values
        values.forEach((v) => referenced.add(v))
      }
    }

    for (const [prop, key] of Object.entries(TIME_PROPS)) {
      const time = parseTime(entity?.claims?.[prop]?.[0])
      if (time) context.times[key] = time
    }

    raw.set(qid, context)
  }

  // Pass two: one deduped label lookup for everything referenced above.
  const labelEntities = await getEntities([...referenced], 'labels')
  const label = (id) => labelEntities.get(id)?.labels?.en?.value ?? null

  const result = new Map()
  for (const [qid, context] of raw) {
    const resolve = (ids) => (ids ?? []).map((id) => ({ id, label: label(id) })).filter((e) => e.label)

    const chain = {}
    for (const key of Object.values(CHAIN_PROPS)) {
      const entries = resolve(context.chain[key])
      if (entries.length) chain[key] = entries
    }

    const facts = {}
    for (const key of Object.values(FACT_PROPS)) {
      if (key === 'deaths') continue
      const entries = resolve(context.facts[key])
      if (entries.length) facts[key] = entries
    }
    if (context.facts.deaths) facts.deaths = context.facts.deaths

    if (Object.keys(chain).length || Object.keys(facts).length || Object.keys(context.times).length) {
      result.set(qid, { chain, facts, times: context.times })
    }
  }

  return result
}
