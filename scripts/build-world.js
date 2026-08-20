import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { fetchWithRetry } from './lib/http.js'

/**
 * Build the world map the client draws.
 *
 * Natural Earth 1:110m, public domain. Projected to equirectangular and
 * rounded, because a phone-sized locator map needs shape recognition, not
 * survey accuracy — and every extra decimal is payload every reader downloads.
 */
const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'

const WIDTH = 1000
const HEIGHT = 500

// One decimal place on a 1000-unit canvas is ~0.1px — invisible, and it roughly
// halves the file.
const PRECISION = 1

// Drops sub-pixel wobble along coastlines. At this scale the Norwegian fjords
// are noise; the outline of Norway is the point.
const MIN_SEGMENT = 1.2

// Skips islands too small to see. Without this, the file is mostly atolls.
const MIN_RING_AREA = 3

const project = ([lon, lat]) => [
  ((lon + 180) / 360) * WIDTH,
  ((90 - lat) / 180) * HEIGHT,
]

const round = (n) => Number(n.toFixed(PRECISION))

/** Shoelace area, used only to decide whether a ring is worth keeping. */
function ringArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum / 2)
}

function simplify(ring) {
  const projected = ring.map(project)
  const kept = [projected[0]]
  for (const point of projected.slice(1)) {
    const last = kept[kept.length - 1]
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_SEGMENT) kept.push(point)
  }
  return kept.length >= 4 ? kept : null
}

function ringsOf(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((poly) => poly[0])
  return []
}

function toPath(geometry) {
  const parts = []
  for (const ring of ringsOf(geometry)) {
    const simplified = simplify(ring)
    if (!simplified || ringArea(simplified) < MIN_RING_AREA) continue
    const d = simplified.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join('')
    parts.push(`${d}Z`)
  }
  return parts.join('')
}

async function main() {
  console.log('fetching Natural Earth 110m…')
  const geo = await fetchWithRetry(SOURCE, { ttlMs: 30 * 24 * 60 * 60 * 1000, timeoutMs: 90_000 })

  const countries = {}
  let skipped = 0

  for (const feature of geo.features ?? []) {
    const p = feature.properties ?? {}
    const iso = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2
    if (!iso || iso === '-99') {
      skipped++
      continue
    }
    const d = toPath(feature.geometry)
    if (!d) {
      skipped++
      continue
    }
    countries[iso] = { d, name: p.NAME_EN ?? p.NAME ?? iso }
  }

  const out = { width: WIDTH, height: HEIGHT, countries }
  const dir = join(process.cwd(), 'public', 'data')
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'world.json')
  const body = JSON.stringify(out)
  await writeFile(path, body)

  console.log(`countries: ${Object.keys(countries).length} (skipped ${skipped})`)
  console.log(`size: ${(body.length / 1024).toFixed(0)} KB raw`)
  console.log(`-> ${path}`)
}

main().catch((err) => {
  console.error('build-world failed:', err)
  process.exit(1)
})
