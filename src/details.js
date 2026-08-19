/**
 * Detail payloads live in a separate file that loads after first paint.
 *
 * The card faces are what block the app appearing; the long text, timelines
 * and fact panels are only needed once something is tapped. Fetching them
 * separately keeps the opening payload small without making a request per tap.
 */
let details = null
let pending = null

export function loadDetails(baseUrl) {
  if (pending) return pending
  pending = fetch(`${baseUrl}data/details.json`, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((payload) => {
      details = payload?.details ?? {}
      return details
    })
    .catch(() => {
      // The feed still works without these; cards fall back to their dek.
      details = {}
      return details
    })
  return pending
}

/** Synchronous read — null while the file is still in flight. */
export function getDetail(id) {
  return details ? (details[id] ?? null) : null
}

/** Await the load, for the case where a tap beats the fetch. */
export async function awaitDetail(id) {
  if (details) return details[id] ?? null
  await pending
  return details?.[id] ?? null
}

export function detailsReady() {
  return details !== null
}
