/** Normalise a headline down to a comparison key. */
function titleKey(headline) {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(the|a|an|of|in|on|to|for|and|as|at|by|with|from)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Two passes: exact id (the same article reached us twice) then normalised
 * headline (the same story reached us from two outlets). The second matters
 * once GDELT and RSS land in Phase 2 — Guardian alone rarely self-duplicates.
 *
 * Ties are broken by preferring the card that has an image, since a duplicate
 * without one is strictly worse in an image-forward feed.
 */
export function dedupe(cards) {
  const byId = new Map()
  for (const card of cards) {
    const existing = byId.get(card.id)
    if (!existing || (!existing.image && card.image)) byId.set(card.id, card)
  }

  const byTitle = new Map()
  for (const card of byId.values()) {
    // History cards legitimately repeat phrasing across years; only collapse news.
    const key = card.type === 'history' ? card.id : `${card.type}:${titleKey(card.headline)}`
    const existing = byTitle.get(key)
    if (!existing || (!existing.image && card.image)) byTitle.set(key, card)
  }

  return [...byTitle.values()]
}
