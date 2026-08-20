import { renderMap } from './card/map.js'
import { historyDate, relativeTime } from './card/render.js'
import { awaitDetail, detailsReady, getDetail } from './details.js'

const CLOSE_THRESHOLD_PX = 90
const CLOSE_VELOCITY = 0.55

const root = document.getElementById('detail')
const scroller = document.getElementById('detail-scroll')

let isOpen = false
let dragStartY = null
let dragStartAt = 0
let dragging = false

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function metaRow(label, value) {
  const row = el('div')
  row.append(el('strong', null, label), document.createTextNode(value))
  return row
}

function section(title) {
  const wrap = el('section', 'detail__section')
  wrap.append(el('h2', 'detail__sectionTitle', title))
  return wrap
}

/**
 * Other events sharing this calendar date.
 *
 * This is a coincidence of the calendar, not a timeline of the event, and
 * presenting it as "the timeline" was misleading — so it is titled as the
 * curiosity it is, and suppressed entirely when the card has a real
 * event sequence to show instead.
 */
function renderSameDay(detail, card) {
  if (!detail.sameDay?.length) return null
  if (hasChain(detail)) return null
  const wrap = section(`Also on ${Number(detail.day)} ${MONTH_NAMES[Number(detail.month) - 1]}, other years`)
  const list = el('ol', 'timeline')

  const entries = [...detail.sameDay, { id: card.id, year: detail.year, headline: card.headline, self: true }]
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))

  for (const entry of entries) {
    const item = el('li', `timeline__item${entry.self ? ' timeline__item--self' : ''}`)
    item.append(el('span', 'timeline__year', String(entry.year ?? '')))
    item.append(el('span', 'timeline__text', entry.headline))
    list.append(item)
  }
  wrap.append(list)
  return wrap
}

function hasChain(detail) {
  const c = detail.chain
  return Boolean(c && ((c.partOf?.length ?? 0) + (c.follows?.length ?? 0) + (c.followedBy?.length ?? 0)))
}

/**
 * The timeline of the event itself — what it was part of, what led to it and
 * what came after, from Wikidata's structured relations. This is what a
 * reader means by "timeline"; the same-date list above is not.
 */
function renderChain(detail) {
  const chain = detail.chain
  if (!chain) return null
  const wrap = section('Timeline of this event')

  if (chain.partOf?.length) {
    const nest = el('ul', 'chain chain--nested')
    for (const entry of chain.partOf) nest.append(el('li', 'chain__item', entry.label))
    wrap.append(el('div', 'detail__label', 'Part of'), nest)
  }

  const sequence = el('ul', 'chain')
  for (const entry of chain.follows ?? []) {
    sequence.append(el('li', 'chain__item chain__item--before', `← ${entry.label}`))
  }
  for (const entry of chain.followedBy ?? []) {
    sequence.append(el('li', 'chain__item chain__item--after', `→ ${entry.label}`))
  }
  if (sequence.childElementCount) {
    wrap.append(el('div', 'detail__label', 'Sequence'), sequence)
  }

  return wrap.childElementCount > 1 ? wrap : null
}

/** Participants, location, casualties — the hard facts. */
function renderFacts(detail) {
  const facts = detail.facts
  if (!facts) return null
  const wrap = section('Facts')
  const grid = el('dl', 'facts')

  const rows = [
    ['Participants', facts.participants?.map((f) => f.label).join(', ')],
    ['Location', facts.location?.map((f) => f.label).join(', ')],
    ['Country', facts.country?.map((f) => f.label).join(', ')],
    ['Deaths', facts.deaths ? facts.deaths.toLocaleString() : null],
  ]

  let any = false
  for (const [label, value] of rows) {
    if (!value) continue
    any = true
    grid.append(el('dt', null, label), el('dd', null, value))
  }

  if (!any) return null
  wrap.append(grid)
  return wrap
}

/**
 * A verified historical precedent for a current story.
 *
 * Sits above everything else on a news card: it is the one thing here that no
 * amount of keyword matching could produce, and every one shown has had its
 * Wikipedia article confirmed to exist.
 */
function renderParallel(detail) {
  const p = detail.parallel
  if (!p?.title) return null

  const wrap = section('Historical precedent')
  const box = el('div', 'precedent')

  const head = el('div', 'precedent__head')
  head.append(el('span', 'precedent__year', String(p.year)))
  head.append(el('span', 'precedent__title', p.title))
  box.append(head)

  box.append(el('p', 'precedent__body', p.parallel))

  if (p.url) {
    const link = el('a', 'precedent__link', 'Read about it →')
    link.href = p.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    box.append(link)
  }

  wrap.append(box)
  return wrap
}

/**
 * Where this is happening.
 *
 * A geopolitics app with no geography was a real gap — "Bab-el-Mandeb" means
 * nothing to most readers without seeing it. Rendered asynchronously and
 * appended in place, so the overlay opens immediately and the map arrives when
 * the world file has loaded.
 */
function renderGeo(detail, scroller) {
  if (!detail.geo?.iso) return
  const wrap = section('Where')
  const holder = el('div', 'map__holder')
  wrap.append(holder, el('div', 'map__caption', detail.geo.name))
  scroller.append(wrap)

  renderMap(detail.geo.iso)
    .then((result) => {
      if (result) holder.append(result.svg)
      else wrap.remove()
    })
    .catch(() => wrap.remove())
}

/**
 * The same indicator in other countries.
 *
 * A single national figure is a number with nothing to measure it against —
 * "random economic data from the US index only, without any context" was
 * exactly the complaint. Ranked, with this card's country marked.
 */
function renderPeers(detail) {
  const peers = detail.peers
  if (!peers?.entries?.length) return null

  const wrap = section(peers.group)
  const list = el('ol', 'peers')

  for (const entry of peers.entries) {
    const isSelf = entry.id === detail.seriesId
    const row = el('li', `peers__row${isSelf ? ' peers__row--self' : ''}`)
    row.append(el('span', 'peers__country', entry.country))
    row.append(el('span', 'peers__value', entry.display))
    list.append(row)
  }

  wrap.append(list)
  return wrap
}

/** Econ cards: the series behind the number. */
function renderSeries(detail) {
  if (!detail.seriesId) return null
  const wrap = section('The series')
  const grid = el('dl', 'facts')

  const rows = [
    ['Measure', detail.title],
    // The computed line moves here once reasoning takes the card face.
    ['Reading', detail.computedContext],
    ['Units', detail.units],
    ['Frequency', detail.frequency],
    ['As of', detail.asOf],
    ['Previous', detail.stats?.previous],
    ['A year ago', detail.stats?.yearAgo],
    [
      'vs 10y average',
      detail.stats?.z != null
        ? `${detail.stats.z > 0 ? '+' : ''}${detail.stats.z.toFixed(2)}σ`
        : null,
    ],
  ]

  for (const [label, value] of rows) {
    if (!value) continue
    grid.append(el('dt', null, label), el('dd', null, String(value)))
  }

  if (!grid.childElementCount) return null
  wrap.append(grid)
  return wrap
}

/** The point of the whole app: this history, against today's news. */
function renderRelatedNews(detail, card) {
  if (!detail.relatedNews?.length) return null
  // From a history card these are today's echoes; from a news card they are
  // the same subject as another newsroom saw it.
  const wrap = section(card?.type === 'history' ? 'In today’s feed' : 'Elsewhere on this subject')
  const list = el('ul', 'related')

  for (const entry of detail.relatedNews) {
    const item = el('li', 'related__item')
    if (entry.url) {
      const link = el('a', 'related__link', entry.headline)
      link.href = entry.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      item.append(link)
    } else {
      item.append(el('span', 'related__link', entry.headline))
    }
    if (entry.source) item.append(el('span', 'related__source', entry.source))
    list.append(item)
  }

  wrap.append(list)
  return wrap
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function build(card, detail) {
  const d = detail ?? {}
  scroller.replaceChildren()
  root.style.setProperty('--accent', `var(--accent-${card.type}, var(--accent-news))`)

  const kicker =
    card.type === 'history'
      ? historyDate({ detail: d })
      : `${card.source?.name ?? ''} · ${relativeTime(card.source?.publishedAt)}`
  scroller.append(el('div', 'detail__kicker', kicker))
  // An econ card's headline is bare number — meaningless without its series
  // name, which lives in the kicker on the card face.
  scroller.append(
    el('h1', 'detail__headline', card.label ? `${card.label}: ${card.headline}` : card.headline),
  )

  if (card.image?.url) {
    const figure = el('figure', 'detail__figure')
    const img = document.createElement('img')
    img.src = card.image.url
    img.alt = ''
    img.loading = 'lazy'
    figure.append(img)
    if (card.image.credit) figure.append(el('figcaption', 'detail__credit', card.image.credit))
    scroller.append(figure)
  }

  const body = el('div', 'detail__body')
  const extract = card.detail?.extract?.trim() ?? ''
  const dek = card.dek?.trim() ?? ''

  // The dek is the standfirst. Only show it when the longer text doesn't
  // already open with the same words, otherwise the view starts by repeating
  // itself.
  if (dek && !extract.startsWith(dek.slice(0, 60))) {
    body.append(el('p', 'detail__lead', dek))
  }

  // Only the longer text goes here. Falling back to the dek meant that a card
  // with no article body rendered the same sentence twice — once as the lead,
  // once as the body — which is what "press for more context and it's just the
  // same sentence" looked like.
  if (extract) {
    for (const paragraph of extract.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)) {
      body.append(el('p', null, paragraph))
    }
  }

  if (body.childElementCount) scroller.append(body)

  // The four context sections, in the order they earn their place: where this
  // sits in a sequence, the hard facts, the same-day timeline, then today.
  for (const node of [
    renderParallel(d),
    renderPeers(d),
    renderSeries(d),
    renderChain(d),
    renderFacts(d),
    renderSameDay(d, card),
    renderRelatedNews(d, card),
  ]) {
    if (node) scroller.append(node)
  }

  renderGeo(d, scroller)

  const meta = el('div', 'detail__meta')
  if (card.type === 'history' && d.year) {
    meta.append(metaRow('When', historyDate({ detail: d })))
    if (d.articleTitle) meta.append(metaRow('Subject', d.articleTitle))
  } else {
    if (d.section) meta.append(metaRow('Section', d.section))
    if (d.byline) meta.append(metaRow('By', d.byline))
    if (card.source?.publishedAt) {
      meta.append(metaRow('Published', new Date(card.source.publishedAt).toLocaleString()))
    }
  }
  meta.append(metaRow('Source', card.source?.name ?? 'Unknown'))
  scroller.append(meta)

  if (card.topics?.length) {
    const tags = el('div', 'detail__tags')
    for (const topic of card.topics) tags.append(el('span', 'tag', topic))
    scroller.append(tags)
  }

  const actions = el('div', 'detail__actions')
  if (card.source?.url) {
    const link = el('a', 'btn btn--primary', `Read at ${card.source.name ?? 'source'}`)
    link.href = card.source.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    actions.append(link)
  }
  const close = el('button', 'btn', 'Close')
  close.type = 'button'
  close.addEventListener('click', closeDetail)
  actions.append(close)
  scroller.append(actions)
}

export async function openDetail(card) {
  // Open immediately with whatever is already loaded — the face alone is
  // enough for a headline, image and summary, so the overlay never waits on a
  // network round trip to appear.
  build(card, getDetail(card.id))
  root.hidden = false
  scroller.scrollTop = 0
  requestAnimationFrame(() => {
    root.classList.add('is-open')
    isOpen = true
  })

  // If the tap beat the details fetch, fill in once it lands.
  if (!detailsReady()) {
    const detail = await awaitDetail(card.id)
    if (isOpen && detail) {
      const scrollTop = scroller.scrollTop
      build(card, detail)
      scroller.scrollTop = scrollTop
    }
  }
}

export function closeDetail() {
  if (!isOpen) return
  root.classList.remove('is-dragging')
  root.style.transform = ''
  root.classList.remove('is-open')
  isOpen = false
  setTimeout(() => {
    if (!isOpen) root.hidden = true
  }, 320)
}

export function detailIsOpen() {
  return isOpen
}

/* ---------- swipe-to-dismiss ----------
 * The overlay must never feel like a page you navigated to. Dragging down
 * dismisses it, but only when the inner content is already scrolled to the
 * top — otherwise this would hijack normal reading scroll.
 */
function onTouchStart(event) {
  if (!isOpen || event.touches.length !== 1) return
  const fromGrabber = event.target.closest('.detail__grabber')
  if (!fromGrabber && scroller.scrollTop > 0) return
  dragStartY = event.touches[0].clientY
  dragStartAt = Date.now()
  dragging = false
}

function onTouchMove(event) {
  if (dragStartY === null) return
  const delta = event.touches[0].clientY - dragStartY

  if (delta <= 0) {
    if (!dragging) dragStartY = null
    return
  }

  if (!dragging) {
    dragging = true
    root.classList.add('is-dragging')
  }
  root.style.transform = `translateY(${delta}px)`
  if (event.cancelable) event.preventDefault()
}

function onTouchEnd(event) {
  if (dragStartY === null) return
  const endY = event.changedTouches[0].clientY
  const delta = endY - dragStartY
  const velocity = delta / Math.max(1, Date.now() - dragStartAt)

  dragStartY = null
  root.classList.remove('is-dragging')

  if (dragging && (delta > CLOSE_THRESHOLD_PX || velocity > CLOSE_VELOCITY)) {
    root.style.transform = ''
    closeDetail()
  } else {
    root.style.transform = ''
  }
  dragging = false
}

root.addEventListener('touchstart', onTouchStart, { passive: true })
root.addEventListener('touchmove', onTouchMove, { passive: false })
root.addEventListener('touchend', onTouchEnd, { passive: true })
root.addEventListener('touchcancel', onTouchEnd, { passive: true })

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDetail()
})
