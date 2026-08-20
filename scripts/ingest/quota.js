/**
 * Target feed mix. The client does the weighted shuffle, but it can only hit
 * these ratios if the JSON actually supplies enough of each bucket — so the
 * cap has to be allocated per bucket, not taken off a global score sort.
 *
 * Without this, history floods everything: it carries a 10-day half-life and
 * outnumbers news several times over, so the top N by score is nearly all
 * history and the feed silently stops being a news app.
 */
const BUCKETS = [
  { name: 'news', types: ['news', 'company', 'attention'], share: 0.55 },
  { name: 'econ', types: ['econ', 'markets', 'trade', 'quiz'], share: 0.2 },
  { name: 'history', types: ['history'], share: 0.25 },
]

function bucketOf(card) {
  return BUCKETS.find((b) => b.types.includes(card.type))?.name ?? 'news'
}

/**
 * Allocate `cap` slots across buckets by share, giving any bucket's unused
 * allowance back to the buckets that can still fill it.
 *
 * That redistribution is what keeps Phase 1 working: there are no econ sources
 * yet, so a strict 20% reservation would leave a fifth of the feed empty.
 */
function allocate(available, cap) {
  const allocation = Object.fromEntries(BUCKETS.map((b) => [b.name, 0]))
  let remaining = cap
  let active = BUCKETS.filter((b) => available[b.name] > 0)

  while (remaining > 0 && active.length > 0) {
    const totalShare = active.reduce((sum, b) => sum + b.share, 0)
    let progressed = false

    for (const bucket of active) {
      const want = Math.floor((remaining * bucket.share) / totalShare)
      const room = available[bucket.name] - allocation[bucket.name]
      const take = Math.max(0, Math.min(want, room))
      if (take > 0) {
        allocation[bucket.name] += take
        progressed = true
      }
    }

    const used = BUCKETS.reduce((sum, b) => sum + allocation[b.name], 0)
    remaining = cap - used
    active = active.filter((b) => available[b.name] > allocation[b.name])

    // Rounding can leave a handful of slots that no proportional pass claims.
    if (!progressed) {
      for (const bucket of active) {
        if (remaining <= 0) break
        const room = available[bucket.name] - allocation[bucket.name]
        const take = Math.min(room, remaining)
        allocation[bucket.name] += take
        remaining -= take
      }
      break
    }
  }

  return allocation
}

/** Cap `cards` to `cap` entries while preserving the target type mix. */
export function applyQuota(cards, cap) {
  if (cards.length <= cap) return [...cards].sort((a, b) => b.score - a.score)

  const grouped = Object.fromEntries(BUCKETS.map((b) => [b.name, []]))
  for (const card of cards) grouped[bucketOf(card)].push(card)
  for (const list of Object.values(grouped)) list.sort((a, b) => b.score - a.score)

  const available = Object.fromEntries(BUCKETS.map((b) => [b.name, grouped[b.name].length]))
  const allocation = allocate(available, cap)

  return BUCKETS.flatMap((b) => grouped[b.name].slice(0, allocation[b.name])).sort(
    (a, b) => b.score - a.score,
  )
}
