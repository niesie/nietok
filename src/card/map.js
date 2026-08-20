const SVG_NS = 'http://www.w3.org/2000/svg'

let worldPromise = null

/**
 * Loaded once, lazily, and shared.
 *
 * 38KB gzipped is cheap but not free, so it is fetched the first time a map is
 * actually opened rather than on app start — most sessions never need it.
 */
function loadWorld() {
  if (!worldPromise) {
    worldPromise = fetch(`${import.meta.env.BASE_URL}data/world.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return worldPromise
}

/** Bounding box of an SVG path's coordinates, used to frame the subject. */
function boundsOf(d) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [, x, y] of d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) {
    const px = Number(x)
    const py = Number(y)
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }

  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

/**
 * A locator map: the whole world faint, the subject country lit.
 *
 * Framed on the subject with generous padding rather than zoomed tight —
 * "where is Bab-el-Mandeb" is answered by the neighbours, not by the outline
 * of Yemen filling the frame.
 */
export async function renderMap(iso) {
  const world = await loadWorld()
  const subject = world?.countries?.[iso]
  if (!subject) return null

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'map')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `Map showing ${subject.name}`)

  const bounds = boundsOf(subject.d)
  if (bounds) {
    const w = Math.max(bounds.maxX - bounds.minX, 12)
    const h = Math.max(bounds.maxY - bounds.minY, 12)
    // Enough context to recognise the region, clamped so a small country is not
    // magnified into an unrecognisable blob and Russia still fits.
    const pad = Math.min(Math.max(w, h) * 1.9, 210)
    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    const size = Math.min(Math.max(w, h) + pad * 2, world.width)
    const x = Math.max(0, Math.min(cx - size / 2, world.width - size))
    const y = Math.max(0, Math.min(cy - size / 2, world.height - size / 2))
    svg.setAttribute('viewBox', `${x} ${y} ${size} ${size / 2}`)
  } else {
    svg.setAttribute('viewBox', `0 0 ${world.width} ${world.height}`)
  }

  const context = document.createElementNS(SVG_NS, 'g')
  context.setAttribute('class', 'map__context')
  for (const [code, country] of Object.entries(world.countries)) {
    if (code === iso) continue
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', country.d)
    context.append(path)
  }

  const highlight = document.createElementNS(SVG_NS, 'path')
  highlight.setAttribute('class', 'map__subject')
  highlight.setAttribute('d', subject.d)

  svg.append(context, highlight)
  return { svg, name: subject.name }
}
