import { historyDate, relativeTime } from './card/render.js'

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

function build(card) {
  scroller.replaceChildren()
  root.style.setProperty('--accent', `var(--accent-${card.type}, var(--accent-news))`)

  const kicker =
    card.type === 'history'
      ? historyDate(card)
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

  const meta = el('div', 'detail__meta')
  if (card.type === 'history' && card.detail?.year) {
    meta.append(metaRow('When', historyDate(card)))
    if (card.detail.articleTitle) meta.append(metaRow('Subject', card.detail.articleTitle))
  } else {
    if (card.detail?.section) meta.append(metaRow('Section', card.detail.section))
    if (card.detail?.byline) meta.append(metaRow('By', card.detail.byline))
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

export function openDetail(card) {
  build(card)
  root.hidden = false
  scroller.scrollTop = 0
  // Force a frame so the transform transition actually runs from 100%.
  requestAnimationFrame(() => {
    root.classList.add('is-open')
    isOpen = true
  })
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
