import { renderCard } from './card/render.js'
import { closeDetail, detailIsOpen, openDetail } from './detail.js'
import { createPlaylist } from './shuffle.js'
import { markSeen } from './state.js'

const INITIAL_MOUNT = 6
const APPEND_CHUNK = 8
const APPEND_WHEN_WITHIN = 4

// Only cards in this window around the active one carry a live <img> src.
// DOM nodes are cheap; decoded images are what exhausts a phone.
const IMAGE_BEFORE = 2
const IMAGE_AFTER = 4

// Above this many mounted cards we prune from the top, correcting scroll
// position so the active card does not visually move.
const MAX_MOUNTED = 260
const PRUNE_CHUNK = 80

const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 12

export function createFeed(container, cards) {
  const playlist = createPlaylist(cards)
  const mounted = [] // { card, el }
  let activeIndex = 0
  let offset = 0 // how many cards have been pruned off the front
  let suppressClick = false

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const index = mounted.findIndex((m) => m.el === entry.target)
        if (index === -1 || index === activeIndex) continue
        setActive(index)
      }
    },
    { root: container, threshold: 0.55 },
  )

  function setImageWindow() {
    const from = Math.max(0, activeIndex - IMAGE_BEFORE)
    const to = Math.min(mounted.length - 1, activeIndex + IMAGE_AFTER)

    mounted.forEach(({ el }, i) => {
      const img = el.querySelector('img[data-src]')
      if (!img) return
      const shouldLoad = i >= from && i <= to
      if (shouldLoad && !img.src) {
        img.src = img.dataset.src
      } else if (!shouldLoad && img.src) {
        img.removeAttribute('src')
        img.classList.remove('is-loaded')
      }
    })
  }

  function setActive(index) {
    activeIndex = index
    const entry = mounted[index]
    if (entry) markSeen(entry.card.id)
    setImageWindow()

    if (mounted.length - activeIndex <= APPEND_WHEN_WITHIN) appendCards(APPEND_CHUNK)
    if (mounted.length > MAX_MOUNTED && activeIndex > PRUNE_CHUNK + IMAGE_BEFORE) prune()
  }

  /**
   * Drop the oldest cards and keep the viewport exactly where it was.
   *
   * Measuring the anchor's offsetTop before and after is deliberate: cards are
   * 100dvh, which changes as mobile browser chrome hides and shows, so a
   * computed `removedCount * cardHeight` would drift.
   */
  function prune() {
    const anchor = mounted[activeIndex]?.el
    if (!anchor) return

    const before = anchor.offsetTop
    const removed = mounted.splice(0, PRUNE_CHUNK)
    for (const { el } of removed) {
      observer.unobserve(el)
      el.remove()
    }
    const after = anchor.offsetTop

    container.scrollTop -= before - after
    activeIndex -= PRUNE_CHUNK
    offset += PRUNE_CHUNK
  }

  function appendCards(count) {
    const fragment = document.createDocumentFragment()
    let added = 0

    for (let i = 0; i < count; i++) {
      const card = playlist.next()
      if (!card) break
      const el = renderCard(card)
      mounted.push({ card, el })
      fragment.append(el)
      added++
    }

    if (!added) return
    container.append(fragment)

    for (const { el } of mounted.slice(-added)) observer.observe(el)
    setImageWindow()
  }

  /* ---------- interaction ---------- */

  container.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    if (detailIsOpen()) return
    if (event.target.closest('a')) return

    const article = event.target.closest('.card')
    if (!article) return
    const entry = mounted.find((m) => m.el === article)
    if (entry) openDetail(entry.card)
  })

  // Long-press opens the original article. Guarded tightly so it can never
  // fire during a scroll — the vertical flick has to stay the dominant gesture.
  let pressTimer = null
  let pressStart = null

  container.addEventListener(
    'touchstart',
    (event) => {
      if (detailIsOpen() || event.touches.length !== 1) return
      const article = event.target.closest('.card')
      if (!article) return
      const entry = mounted.find((m) => m.el === article)
      if (!entry?.card.source?.url) return

      pressStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      pressTimer = setTimeout(() => {
        suppressClick = true
        pressTimer = null
        window.open(entry.card.source.url, '_blank', 'noopener')
      }, LONG_PRESS_MS)
    },
    { passive: true },
  )

  function cancelPress(event) {
    if (!pressTimer) return
    if (event?.touches?.[0] && pressStart) {
      const dx = Math.abs(event.touches[0].clientX - pressStart.x)
      const dy = Math.abs(event.touches[0].clientY - pressStart.y)
      if (dx < LONG_PRESS_SLOP_PX && dy < LONG_PRESS_SLOP_PX) return
    }
    clearTimeout(pressTimer)
    pressTimer = null
  }

  container.addEventListener('touchmove', cancelPress, { passive: true })
  container.addEventListener('touchend', () => cancelPress(), { passive: true })
  container.addEventListener('touchcancel', () => cancelPress(), { passive: true })

  // Keyboard, for desktop testing.
  document.addEventListener('keydown', (event) => {
    if (detailIsOpen()) return
    if (event.key === 'Enter' || event.key === ' ') {
      const entry = mounted[activeIndex]
      if (entry) {
        event.preventDefault()
        openDetail(entry.card)
      }
    }
  })

  appendCards(INITIAL_MOUNT)
  if (mounted[0]) markSeen(mounted[0].card.id)

  return {
    get count() {
      return mounted.length + offset
    },
    close: closeDetail,
  }
}
