/**
 * Show a slice of an evergreen pool each day, not all of it.
 *
 * Topic and figure cards never change — the same articles and the same people,
 * every run. Putting the whole pool in the feed means that once you have seen
 * them, you have seen them, and the seen-card penalty can only push them down
 * rather than replace them.
 *
 * A rotating window fixes that without needing more content: the pool cycles
 * over `pool / slice` days, so any given day feels curated and a card returns
 * after a gap rather than every session. Adding entries lengthens the cycle
 * instead of thickening the feed.
 *
 * Deterministic by UTC day, so every run in a day agrees — which matters
 * because the retention pass drops whatever the current run did not emit.
 */
export function dayNumber(now = new Date()) {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000)
}

/**
 * @param {Array} items      the whole pool, in a stable order
 * @param {number} slice     how many to surface today
 * @param {number} [offsetSeed] shifts one pool's phase against another's, so
 *                              topics and figures do not both restart together
 */
/**
 * Cache signature for a rotating source.
 *
 * A plain age timer is not enough. The cached slice was computed by a specific
 * pool, a specific slice size and a specific day — change any of them and the
 * stored cards are wrong, but a 20-hour timer happily serves them anyway. That
 * is how the first rotation deploy shipped and changed nothing: CI reused a
 * state file written before rotation existed.
 *
 * Including the day number also means the cache expires exactly when the slice
 * does, which is what a rotating source actually wants.
 */
export function rotationSignature({ shape, poolSize, slice, now = new Date() }) {
  return `${shape}:${poolSize}:${slice}:${dayNumber(now)}`
}

export function rotatingSlice(items, slice, offsetSeed = 0, now = new Date()) {
  if (items.length <= slice) return items

  // Advance by a whole slice per day so consecutive days do not overlap.
  const start = ((dayNumber(now) + offsetSeed) * slice) % items.length
  const out = []
  for (let i = 0; i < slice; i++) out.push(items[(start + i) % items.length])
  return out
}
