import { seenSet } from './state.js'

const BUCKETS = [
  { name: 'news', types: ['news', 'company', 'attention'], weight: 0.55 },
  { name: 'econ', types: ['econ', 'markets', 'trade'], weight: 0.2 },
  { name: 'history', types: ['history'], weight: 0.25 },
]

const MAX_RUN = 2 // never three cards from the same bucket in a row

/**
 * How far you should be able to scroll before anything repeats.
 *
 * A bucket holding N cards can supply at most N/HORIZON of the feed without
 * cycling inside that window, so its draw weight is capped there. Without this
 * the target mix silently overdraws a thin bucket: 16 economic cards asked to
 * fill 20% of the feed repeat every 80 cards, which dragged the first repeat
 * from card 212 down to card 73 the moment econ cards were added.
 *
 * The cap lifts on its own as a bucket grows.
 */
const REPEAT_HORIZON = 400

function bucketOf(card) {
  return BUCKETS.find((b) => b.types.includes(card.type))?.name ?? 'news'
}

/**
 * Order a bucket for one pass through it.
 *
 * Score dominates so fresh, well-illustrated cards surface early, but the
 * random factor keeps the order from being identical on every reload, and
 * already-seen cards are pushed down rather than removed — that is what lets
 * the feed loop forever instead of dead-ending.
 */
function weightedOrder(cards) {
  const seen = seenSet()
  return cards
    .map((card) => ({
      card,
      key: (card.score + 0.05) * (0.55 + 0.45 * Math.random()) * (seen.has(card.id) ? 0.3 : 1),
    }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.card)
}

/**
 * An endless, mix-controlled sequence of cards.
 *
 * Returns { next() } which never runs out: when a bucket empties it is
 * reshuffled and refilled.
 */
export function createPlaylist(cards) {
  const pools = {}
  for (const bucket of BUCKETS) {
    pools[bucket.name] = cards.filter((c) => bucketOf(c) === bucket.name)
  }

  const queues = {}
  for (const bucket of BUCKETS) {
    queues[bucket.name] = weightedOrder(pools[bucket.name])
  }

  // Cap each bucket's draw weight by what it can actually supply, then let the
  // others absorb the slack via the proportional pick below.
  const active = BUCKETS.filter((b) => pools[b.name].length > 0).map((bucket) => ({
    ...bucket,
    weight: Math.min(bucket.weight, pools[bucket.name].length / REPEAT_HORIZON),
  }))

  let lastBucket = null
  let runLength = 0
  let lastId = null

  function pickBucket() {
    // Exclude the current bucket if it has already run MAX_RUN times and
    // something else is available to break the streak.
    let eligible = active
    if (lastBucket && runLength >= MAX_RUN) {
      const others = active.filter((b) => b.name !== lastBucket)
      if (others.length) eligible = others
    }

    const total = eligible.reduce((sum, b) => sum + b.weight, 0)
    let roll = Math.random() * total
    for (const bucket of eligible) {
      roll -= bucket.weight
      if (roll <= 0) return bucket.name
    }
    return eligible[eligible.length - 1].name
  }

  function take(name) {
    if (queues[name].length === 0) queues[name] = weightedOrder(pools[name])
    return queues[name].shift()
  }

  return {
    get size() {
      return cards.length
    },
    next() {
      if (active.length === 0) return null

      const name = pickBucket()
      let card = take(name)

      // A one-card bucket would otherwise repeat back-to-back.
      if (card && card.id === lastId && queues[name].length > 0) card = take(name)
      if (!card) return null

      runLength = name === lastBucket ? runLength + 1 : 1
      lastBucket = name
      lastId = card.id
      return card
    },
  }
}
