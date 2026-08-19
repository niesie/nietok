const SEEN_KEY = 'nietok:seen:v1'
const MAX_SEEN = 4000

function load() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

const seen = load()
let flushTimer = null

function flush() {
  try {
    // Keep the tail — the most recently seen ids are the ones worth suppressing.
    const ids = [...seen].slice(-MAX_SEEN)
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  } catch {
    // Private mode or a full quota must not break the feed.
  }
}

export function hasSeen(id) {
  return seen.has(id)
}

export function markSeen(id) {
  if (!id || seen.has(id)) return
  seen.add(id)
  // Writing on every card change would hit localStorage once per swipe.
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 1200)
}

export function seenSet() {
  return seen
}
