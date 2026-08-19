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

/** "Also on this day" — a vertical timeline, with this card marked. */
function renderSameDay(detail, card) {
  if (!detail.sameDay?.length) return null
  const wrap = section(`Also on ${Number(detail.day)} ${MONTH_NAMES[Number(detail.month) - 1]}`)
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

/** Where the event sits in a sequence: part-of nesting, and what it follows. */
function renderChain(detail) {
  const chain = detail.chain
  if (!chain) return null
  const wrap = section('Context')

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

/** The point of the whole app: this history, against today's news. */
function renderRelatedNews(detail) {
  if (!detail.relatedNews?.length) return null
  const wrap = section('In today’s feed')
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
  scroller.append(el('h1', 'detail__headline', card.headline))

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

  // The dek is the standfirst. Only show it when the longer text doesn't
  // already open with the same words, otherwise the view starts by repeating
  // itself.
  const dek = card.dek?.trim() ?? ''
  if (dek && !extract.startsWith(dek.slice(0, 60))) {
    body.append(el('p', 'detail__lead', dek))
  }

  // Phase 1 has no LLM text: this is the source's own prose — the Guardian
  // article body or the Wikipedia intro.
  const paragraphs = (extract || dek).split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)
  for (const paragraph of paragraphs) body.append(el('p', null, paragraph))

  scroller.append(body)

  // The four context sections, in the order they earn their place: where this
  // sits in a sequence, the hard facts, the same-day timeline, then today.
  for (const node of [renderChain(d), renderFacts(d), renderSameDay(d, card), renderRelatedNews(d)]) {
    if (node) scroller.append(node)
  }

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
