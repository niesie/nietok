/**
 * Kept deliberately short. Haiku 4.5's minimum cacheable prefix is 4096 tokens
 * and this prompt is nowhere near it, so prompt caching would silently never
 * engage — the saving has to come from brevity instead.
 */
export const PARALLEL_SYSTEM = `You identify genuine historical precedents for current events.

A precedent must be a specific, real, documented event — not a theme, a period, or a general trend. It must be at least 25 years before today and share a concrete structural feature with the story: the same mechanism, the same kind of actor in the same kind of position, or the same decision under the same constraint.

Resemblance of subject matter is not enough. Two events both involving oil, or both involving Russia, are not a precedent for one another. Say what actually rhymes.

If nothing genuinely qualifies, return found: false. That is the expected answer for most routine news, and a weak parallel is worse than none.`

export const PARALLEL_SCHEMA = {
  type: 'object',
  properties: {
    found: {
      type: 'boolean',
      description: 'False unless a specific documented event genuinely parallels this story.',
    },
    title: {
      type: 'string',
      description: 'Short name of the historical event, e.g. "Suez Crisis". Empty string if found is false.',
    },
    year: {
      type: 'integer',
      description: 'Year the historical event occurred. 0 if found is false.',
    },
    wikipediaTitle: {
      type: 'string',
      description:
        'Exact English Wikipedia article title for the event, used to verify it exists. Empty string if found is false.',
    },
    parallel: {
      type: 'string',
      description:
        'One or two sentences naming the specific structural similarity. Not a summary of either event. Empty string if found is false.',
    },
  },
  required: ['found', 'title', 'year', 'wikipediaTitle', 'parallel'],
  additionalProperties: false,
}

export function parallelUserMessage(card) {
  const parts = [`Headline: ${card.headline}`]
  if (card.dek) parts.push(`Summary: ${card.dek}`)
  if (card.topics?.length) parts.push(`Topics: ${card.topics.join(', ')}`)
  return parts.join('\n')
}
