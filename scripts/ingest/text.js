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

/**
 * A period after one of these does not end a sentence. Without the guard,
 * "the U.S. Navy" and "Dr. Smith" both become paragraph breaks.
 */
const ABBREVIATION = /(?:^|\s)(?:[A-Z]|Mr|Mrs|Ms|Dr|Prof|St|Mt|Gen|Col|Capt|Sgt|Lt|Rev|Hon|No|Vol|vs|etc|c|ca|approx|e\.g|i\.e)\.$/

/** A break is only plausible if what follows starts like a new sentence. */
const STARTS_SENTENCE = /^\s+["'“‘(]?[A-Z0-9]/

/**
 * Group a wall of prose into paragraphs at sentence boundaries.
 *
 * Wikipedia's search index stores article text as a single unbroken string —
 * no newlines at all — and the detail overlay makes paragraphs by splitting on
 * them. Rendered raw it is one unreadable block on a phone.
 *
 * The article's own breaks are kept where it has them; the ones we add are
 * whitespace only, so no word is moved, dropped or reordered.
 */
export function paragraphize(text, target = 420) {
  const clean = (text ?? '').trim()
  if (!clean) return ''

  // Keep whatever breaks the article already has, then split any block that is
  // still a wall on a phone — a real 2000-character paragraph is no easier to
  // read than a synthetic one.
  return clean
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (block.length > WALL ? splitBlock(block, target) : block))
    .join('\n\n')
}

/** Longer than this and a paragraph is a wall, whoever wrote it. */
const WALL = 800

function splitBlock(clean, target) {
  const paragraphs = []
  let buffer = ''
  let cursor = 0

  for (const m of clean.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length
    const head = clean.slice(0, end)
    if (ABBREVIATION.test(head) || !STARTS_SENTENCE.test(clean.slice(end))) continue

    buffer += clean.slice(cursor, end)
    cursor = end
    if (buffer.length >= target) {
      paragraphs.push(buffer.trim())
      buffer = ''
    }
  }

  // Whatever is left over joins the final paragraph rather than becoming a
  // one-line orphan.
  const tail = (buffer + clean.slice(cursor)).trim()
  if (tail) {
    if (tail.length < 120 && paragraphs.length) paragraphs[paragraphs.length - 1] += ` ${tail}`
    else paragraphs.push(tail)
  }

  return paragraphs.join('\n\n')
}
