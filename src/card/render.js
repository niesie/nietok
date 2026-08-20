const TYPE_LABEL = {
  news: 'Dispatch',
  company: 'Business',
  econ: 'Economy',
  markets: 'Markets',
  trade: 'Trade',
  history: 'History',
  attention: 'Attention',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function relativeTime(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(t)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

/** History cards are anchored to a real calendar date, so show it in full. */
export function historyDate(card) {
  const { year, month, day } = card.detail ?? {}
  if (!year || !month || !day) return ''
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

function kickerParts(card) {
  const label = TYPE_LABEL[card.type] ?? 'Dispatch'
  if (card.type === 'history') {
    return [label, historyDate(card)].filter(Boolean)
  }
  // Econ cards lead with the number, so the series name goes here instead of
  // the source — "Economy · Brent crude · 2d ago" reads better than the source.
  if (card.label) {
    return [label, card.label, relativeTime(card.source?.publishedAt)].filter(Boolean)
  }
  return [label, card.source?.name, relativeTime(card.source?.publishedAt)].filter(Boolean)
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Sparkline for econ cards.
 *
 * Drawn on a 0-100 viewBox with preserveAspectRatio="none" so it stretches to
 * whatever box CSS gives it — the shape is what carries meaning, not the
 * aspect ratio. A flat series still renders as a centred line rather than
 * dividing by a zero range.
 */
export function renderSparkline(values) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'spark')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('aria-hidden', 'true')

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const y = (v) => (range === 0 ? 50 : 100 - ((v - min) / range) * 92 - 4)
  const x = (i) => (i / (values.length - 1)) * 100

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')

  const area = document.createElementNS(SVG_NS, 'path')
  area.setAttribute('class', 'spark__area')
  area.setAttribute('d', `${line} L100,100 L0,100 Z`)

  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('class', 'spark__line')
  path.setAttribute('d', line)

  const dot = document.createElementNS(SVG_NS, 'circle')
  dot.setAttribute('class', 'spark__dot')
  dot.setAttribute('cx', x(values.length - 1).toFixed(2))
  dot.setAttribute('cy', y(values[values.length - 1]).toFixed(2))
  dot.setAttribute('r', '2.2')

  svg.append(area, path, dot)
  return svg
}

export function renderCard(card) {
  const article = el('article', `card card--${card.type}`)
  article.dataset.id = card.id
  article.style.setProperty('--accent', `var(--accent-${card.type}, var(--accent-news))`)
  if (!card.image?.url) article.classList.add('card--noimage')

  const media = el('div', 'card__media')

  if (card.spark?.length > 1) {
    // Econ and markets cards: the chart is the image.
    const holder = el('div', 'card__spark')
    holder.append(renderSparkline(card.spark))
    media.append(holder)
  } else if (card.image?.url) {
    const img = document.createElement('img')
    // Held in a data attribute — feed.js only sets src for cards near the
    // viewport, which is what keeps decoded-image memory bounded on a phone.
    img.dataset.src = card.image.url
    img.alt = ''
    img.decoding = 'async'
    img.addEventListener('load', () => img.classList.add('is-loaded'))
    img.addEventListener('error', () => {
      article.classList.add('card--noimage')
      img.remove()
    })
    media.append(img)
  }
  article.append(media, el('div', 'card__scrim'))

  const body = el('div', 'card__body')

  const kicker = el('div', 'kicker')
  kicker.append(el('span', 'kicker__dot'))
  kickerParts(card).forEach((part, i) => {
    if (i > 0) kicker.append(el('span', 'kicker__sep', '·'))
    kicker.append(el('span', i === 0 ? 'kicker__label' : '', part))
  })

  body.append(kicker, el('h2', 'headline', card.headline))
  if (card.dek) body.append(el('p', 'dek', card.dek))

  const foot = el('div', 'card__foot')
  const topics = (card.topics ?? []).slice(0, 3).join(' · ')
  foot.append(el('span', '', topics), el('span', 'card__cue', 'tap for context'))
  body.append(foot)

  article.append(body)
  return article
}
