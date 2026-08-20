// Freshness half-life in hours, per card type. History is anchored to its
// anniversary date, so a long half-life keeps a card from twelve days ago alive
// while still favouring today's date.
const HALF_LIFE_HOURS = {
  news: 24,
  company: 36,
  econ: 72,
  markets: 24,
  trade: 96,
  history: 24 * 10,
  // Refreshed daily, and a spike is only interesting while it is happening.
  attention: 30,
  default: 48,
}

function freshness(card, now) {
  const published = Date.parse(card.source?.publishedAt ?? '')
  if (!Number.isFinite(published)) return 0.3
  const ageHours = Math.max(0, (now - published) / 3_600_000)
  const halfLife = HALF_LIFE_HOURS[card.type] ?? HALF_LIFE_HOURS.default
  return Math.pow(0.5, ageHours / halfLife)
}

/**
 * How well the card will actually render. An image-forward feed punishes
 * cards with no image, and a card with no dek has nothing to say on its face.
 */
function prominence(card) {
  let score = 0.4
  if (card.image?.url) score += 0.35
  if ((card.dek ?? '').length > 80) score += 0.15
  if ((card.topics ?? []).length > 0) score += 0.1
  return Math.min(1, score)
}

export function rank(cards, now = Date.now()) {
  for (const card of cards) {
    card.score = Number((freshness(card, now) * (0.45 + 0.55 * prominence(card))).toFixed(4))
  }
  return cards.sort((a, b) => b.score - a.score)
}
