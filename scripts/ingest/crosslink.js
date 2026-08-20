const MAX_SAME_DAY = 8
const MAX_RELATED_NEWS = 3

const NEWS_TYPES = new Set(['news', 'company', 'econ', 'markets', 'trade'])

/**
 * "Also on this day" — other events sharing a calendar date, across years.
 *
 * Costs nothing: the on-this-day source already fetched a rolling window of
 * dates, so the whole timeline is sitting in the card set already.
 */
export function linkSameDay(cards) {
  const byDate = new Map()

  for (const card of cards) {
    if (card.type !== 'history') continue
    const { month, day } = card.detail ?? {}
    if (!month || !day) continue
    const key = `${month}-${day}`
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key).push(card)
  }

  for (const [, sameDate] of byDate) {
    const sorted = [...sameDate].sort((a, b) => (a.detail.year ?? 0) - (b.detail.year ?? 0))

    for (const card of sameDate) {
      const others = sorted.filter((c) => c.id !== card.id)
      if (others.length === 0) continue

      // Keep the entries nearest in time to this card rather than the first
      // eight of the century — a 1707 card should not be surrounded by 1990s.
      const year = card.detail.year ?? 0
      const nearest = [...others]
        .sort((a, b) => Math.abs((a.detail.year ?? 0) - year) - Math.abs((b.detail.year ?? 0) - year))
        .slice(0, MAX_SAME_DAY)
        .sort((a, b) => (a.detail.year ?? 0) - (b.detail.year ?? 0))

      card.detail.sameDay = nearest.map((c) => ({
        id: c.id,
        year: c.detail.year,
        headline: c.headline,
      }))
    }
  }

  return cards
}

/**
 * Connect a news card to the same story as told by other outlets.
 *
 * Half the news cards carry no article body — the feed only supplied a
 * standfirst — so opening them added nothing beyond the sentence already on
 * the card face. This is the answer that uses what the app actually has:
 * sixteen outlets, so the context worth showing is how somebody else framed
 * the same events.
 *
 * Matches are restricted to a different outlet on purpose. Three more BBC
 * stories is a list; the BBC, Al Jazeera and SCMP on one subject is a view.
 */
export function linkNewsToNews(cards) {
  const news = cards
    .filter((c) => NEWS_TYPES.has(c.type) && (c.topics?.length ?? 0) > 0)
    .sort((a, b) => b.score - a.score)

  if (news.length < 2) return cards

  for (const card of news) {
    const topics = new Set(card.topics ?? [])
    if (topics.size === 0) continue

    const matches = []
    for (const item of news) {
      if (item.id === card.id) continue
      if (item.source?.name === card.source?.name) continue
      const overlap = (item.topics ?? []).filter((t) => topics.has(t))
      // One shared topic is too loose — "economy" alone connects almost
      // everything. Two means they are plausibly about the same thing.
      if (overlap.length < 2) continue
      matches.push({ item, overlap: overlap.length })
      if (matches.length >= MAX_RELATED_NEWS * 4) break
    }

    if (matches.length === 0) continue

    card.detail.relatedNews = matches
      .sort((a, b) => b.overlap - a.overlap || b.item.score - a.item.score)
      .slice(0, MAX_RELATED_NEWS)
      .map(({ item }) => ({
        id: item.id,
        headline: item.headline,
        source: item.source?.name ?? null,
        url: item.source?.url ?? null,
      }))
  }

  return cards
}

/**
 * Connect a history card to current stories sharing its topics.
 *
 * This is the app's thesis running in reverse, and it is what stops the
 * history and news halves reading as two unrelated apps bolted together.
 */
export function linkHistoryToNews(cards) {
  const news = cards
    .filter((c) => NEWS_TYPES.has(c.type) && (c.topics?.length ?? 0) > 0)
    .sort((a, b) => b.score - a.score)

  if (news.length === 0) return cards

  for (const card of cards) {
    if (card.type !== 'history') continue
    const topics = new Set(card.topics ?? [])
    if (topics.size === 0) continue

    const matches = []
    for (const item of news) {
      const overlap = (item.topics ?? []).filter((t) => topics.has(t))
      if (overlap.length === 0) continue
      matches.push({ item, overlap: overlap.length })
      // `news` is score-sorted, so once we have enough strong matches we can
      // stop rather than scanning every article for every history card.
      if (matches.length >= MAX_RELATED_NEWS * 4) break
    }

    if (matches.length === 0) continue

    card.detail.relatedNews = matches
      .sort((a, b) => b.overlap - a.overlap || b.item.score - a.item.score)
      .slice(0, MAX_RELATED_NEWS)
      .map(({ item }) => ({
        id: item.id,
        headline: item.headline,
        source: item.source?.name ?? null,
        // Carried so the entry is tappable rather than a dead-end label.
        url: item.source?.url ?? null,
      }))
  }

  return cards
}
