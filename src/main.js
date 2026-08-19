import './styles/app.css'
import { loadDetails } from './details.js'
import { createFeed } from './feed.js'

const bootEl = document.getElementById('boot')
const statusEl = document.getElementById('boot-status')

function fail(message) {
  statusEl.textContent = message
  bootEl.classList.remove('is-hidden')
}

async function start() {
  const base = import.meta.env.BASE_URL
  const url = `${base}data/feed.json`

  let payload
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    payload = await res.json()
  } catch (err) {
    fail(`could not load the feed — ${err.message}. run \`npm run ingest\` first.`)
    return
  }

  const cards = Array.isArray(payload?.cards) ? payload.cards : []
  if (cards.length === 0) {
    fail('the feed is empty. run `npm run ingest` to populate it.')
    return
  }

  createFeed(document.getElementById('feed'), cards)

  // Deliberately not awaited — detail text, timelines and fact panels are
  // several times the size of the card faces and are only needed on tap.
  loadDetails(base)

  bootEl.classList.add('is-hidden')
  setTimeout(() => {
    bootEl.hidden = true
  }, 400)

  const generated = payload.generatedAt ? new Date(payload.generatedAt) : null
  console.info(
    `nietok — ${cards.length} cards${generated ? `, generated ${generated.toLocaleString()}` : ''}`,
  )
}

start()
