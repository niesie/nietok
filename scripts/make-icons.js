/**
 * Generates the PWA icons with no image dependencies.
 *
 * The mark is a globe ring crossed by a meridian line. Everything sits inside
 * the centre 80% so the maskable variant survives Android's circular crop.
 *
 * Run: node scripts/make-icons.js
 */
import { crc32, deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public', 'icons')

const BG = [0x0a, 0x0a, 0x0b]
const PAPER = [0xf4, 0xf2, 0xee]
const AMBER = [0xe8, 0xb0, 0x4b]

const SS = 3 // supersampling factor per axis

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData) >>> 0)
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Each scanline is prefixed with a filter byte (0 = None).
  const stride = size * 3
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Returns the colour at a sample point, or null for background. */
function sample(x, y, size) {
  const c = size / 2
  const dx = x - c
  const dy = y - c

  const outer = size * 0.3
  const thickness = size * 0.055
  const dist = Math.hypot(dx, dy)

  // Meridian bar: crosses the globe and extends slightly past it.
  const barHalfHeight = size * 0.027
  const barHalfWidth = size * 0.4
  if (Math.abs(dy) <= barHalfHeight && Math.abs(dx) <= barHalfWidth) return AMBER

  // Globe ring.
  if (dist <= outer && dist >= outer - thickness) return PAPER

  return null
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 3)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          const colour = sample(px, py, size) ?? BG
          r += colour[0]
          g += colour[1]
          b += colour[2]
        }
      }

      const n = SS * SS
      const i = (y * size + x) * 3
      pixels[i] = Math.round(r / n)
      pixels[i + 1] = Math.round(g / n)
      pixels[i + 2] = Math.round(b / n)
    }
  }

  return encodePng(size, pixels)
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0a0a0b"/>
  <circle cx="256" cy="256" r="139.4" fill="none" stroke="#f4f2ee" stroke-width="28.2"/>
  <rect x="51.2" y="242.2" width="409.6" height="27.6" fill="#e8b04b"/>
</svg>
`

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  for (const size of [180, 192, 512]) {
    await writeFile(join(OUT_DIR, `icon-${size}.png`), render(size))
    console.log(`wrote icons/icon-${size}.png`)
  }

  await writeFile(join(OUT_DIR, 'icon.svg'), SVG)
  console.log('wrote icons/icon.svg')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
