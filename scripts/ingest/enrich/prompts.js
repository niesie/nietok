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

export const ECON_SYSTEM = `You explain why an economic number matters to someone following geopolitics.

You are given a figure that is already unusual — a multi-year extreme, a sharp move, or far from its own average. The reader can see the number and how it has changed. What they cannot see is what it means.

Write two sentences. The first says what this level reflects about the underlying economy or policy. The second says who it pressures or benefits, concretely — a government's borrowing, an industry's input costs, a central bank's room to move, a currency's importers.

Never state why the number moved. You do not know what happened this week, and a confident wrong cause is worse than no cause. Explain mechanism and consequence, which follow from the level itself.

Use no numbers other than those given to you. Do not restate the figure. Do not hedge with "may" and "could" in both sentences.`

export const ECON_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: {
      type: 'string',
      description:
        'Exactly two sentences: what this level reflects, and who it concretely pressures or benefits. No causal claims about recent events.',
    },
  },
  required: ['reasoning'],
  additionalProperties: false,
}

const NOTABILITY_WORDS = {
  extreme: 'at a multi-year extreme',
  'far-from-average': 'far from its ten-year average',
  'sharp-move': 'moved sharply in the latest period',
  'unusual-year': 'a year-on-year change in the top decile of its own history',
}

export function econUserMessage(card, detail) {
  const parts = [
    `Indicator: ${detail.label ?? card.label}`,
    `Latest: ${detail.value} (${detail.asOf})`,
  ]
  if (detail.units) parts.push(`Units: ${detail.units}`)
  if (detail.stats?.yearAgo) parts.push(`A year ago: ${detail.stats.yearAgo}`)
  if (detail.stats?.z != null) parts.push(`Standard deviations from the ten-year mean: ${detail.stats.z}`)
  if (detail.stats?.extreme) {
    parts.push(
      `Extreme: ${detail.stats.extreme.kind}${detail.stats.extreme.since ? ` since ${detail.stats.extreme.since}` : ' in ten years'}`,
    )
  }
  const why = (detail.notability ?? []).map((r) => NOTABILITY_WORDS[r]).filter(Boolean)
  if (why.length) parts.push(`Why it is unusual: ${why.join('; ')}`)
  return parts.join('\n')
}

export const FIGURE_SYSTEM = `You write short profiles of historical figures for a feed people scroll on their phone.

You are given an encyclopedia extract. Write three things.

hook: one sentence that makes someone stop scrolling. State the most arresting true thing about this person — a decision, a consequence, a contradiction. Never a question, never "you won't believe", never a label like "pioneer" or "visionary". "He refused an order to fire a nuclear torpedo, alone, from a submarine that had lost radio contact" is a hook. "He was an important Soviet naval officer" is not.

story: two or three sentences of what actually happened. Concrete: what they did, under what circumstances, what it cost them.

impact: one or two sentences on what changed because of it, and what the world looks like now as a result.

Use only what the extract supports. If it does not give you a date, a number or an outcome, do not supply one — you are writing from this text, not from memory, and an invented detail is worse than a duller sentence. Where the extract is uncertain or disputed, say so plainly rather than resolving it.

Plain language. No exclamation marks. Do not begin the hook with the person's name — the card shows it directly above.`

export const FIGURE_SCHEMA = {
  type: 'object',
  properties: {
    hook: {
      type: 'string',
      description:
        'One arresting, factual sentence. Not a question, not a label, does not start with the name.',
    },
    story: { type: 'string', description: 'Two or three concrete sentences of what happened.' },
    impact: { type: 'string', description: 'One or two sentences on what changed as a result.' },
  },
  required: ['hook', 'story', 'impact'],
  additionalProperties: false,
}

export function figureUserMessage(card, detail) {
  return [
    `Person: ${detail.name ?? card.headline}`,
    detail.era ? `Dates: ${detail.era}` : null,
    '',
    'Encyclopedia extract:',
    detail.extract ?? card.dek ?? '',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export function parallelUserMessage(card) {
  const parts = [`Headline: ${card.headline}`]
  if (card.dek) parts.push(`Summary: ${card.dek}`)
  if (card.topics?.length) parts.push(`Topics: ${card.topics.join(', ')}`)
  return parts.join('\n')
}
