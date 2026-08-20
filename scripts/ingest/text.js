/**
 * Trim text to a sentence boundary.
 *
 * Shared because three sources had their own copy and all three had the same
 * bug: they searched for '. ' — a period followed by a space. Wikipedia's
 * plain-text extracts separate sentences with a newline, so on those the
 * search found nothing and the text was chopped mid-word instead:
 * "…an early cradle of civilization, producing several c…".
 *
 * Matching a terminator followed by any whitespace fixes it, and also handles
 * a closing quote or bracket after the full stop.
 */
const SENTENCE_END = /[.!?]["'”’)\]]?(?=\s|$)/g

export function trimToSentence(text, max) {
  const clean = (text ?? '').trim()
  if (clean.length <= max) return clean

  const window = clean.slice(0, max)

  let cut = -1
  for (const m of window.matchAll(SENTENCE_END)) cut = m.index + m[0].length

  // Only honour a boundary that leaves a useful amount of text — otherwise a
  // stray "Dr." near the start would truncate the whole passage.
  if (cut > max * 0.4) return window.slice(0, cut).trim()

  const word = window.lastIndexOf(' ')
  return `${window.slice(0, word > 0 ? word : max).trim()}…`
}

/** The opening sentences, for a card face. */
export function opening(text, max = 300) {
  return trimToSentence(text, max)
}
