import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Detect which country a card is about, so the reader can be shown where.
 *
 * Curated rather than generated from the 173 country names in world.json.
 * Auto-matching on names alone misfires badly: "Georgia" is usually the US
 * state, "Jordan" and "Chad" are usually people, and "turkey" is usually a
 * bird. Demonyms carry most of the signal in news writing anyway — headlines
 * say "Israeli strikes" and "Russian forces", not "strikes by Israel".
 */
const ALIASES = {
  US: ['united states', 'u.s.', 'usa', 'america', 'american', 'washington', 'white house', 'pentagon', 'trump'],
  RU: ['russia', 'russian', 'moscow', 'kremlin', 'putin'],
  UA: ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'zelensky', 'zelenskyy'],
  CN: ['china', 'chinese', 'beijing', 'xi jinping'],
  IR: ['iran', 'iranian', 'tehran'],
  IL: ['israel', 'israeli', 'jerusalem', 'netanyahu', 'idf'],
  PS: ['palestine', 'palestinian', 'gaza', 'west bank', 'hamas'],
  IN: ['india', 'indian', 'new delhi', 'modi'],
  PK: ['pakistan', 'pakistani', 'islamabad'],
  GB: ['united kingdom', 'britain', 'british', 'london', 'downing street', 'uk government'],
  DE: ['germany', 'german', 'berlin', 'bundestag'],
  FR: ['france', 'french', 'paris', 'macron', 'elysee'],
  IT: ['italy', 'italian', 'rome', 'meloni'],
  ES: ['spain', 'spanish', 'madrid'],
  NL: ['netherlands', 'dutch', 'amsterdam', 'the hague'],
  PL: ['poland', 'polish', 'warsaw'],
  TR: ['turkey', 'turkish', 'ankara', 'istanbul', 'erdogan', 'türkiye'],
  SA: ['saudi arabia', 'saudi', 'riyadh'],
  AE: ['united arab emirates', 'emirati', 'abu dhabi', 'dubai'],
  QA: ['qatar', 'qatari', 'doha'],
  YE: ['yemen', 'yemeni', 'houthi', 'sanaa'],
  SY: ['syria', 'syrian', 'damascus'],
  LB: ['lebanon', 'lebanese', 'beirut', 'hezbollah'],
  IQ: ['iraq', 'iraqi', 'baghdad'],
  EG: ['egypt', 'egyptian', 'cairo'],
  JP: ['japan', 'japanese', 'tokyo'],
  KR: ['south korea', 'south korean', 'seoul'],
  KP: ['north korea', 'north korean', 'pyongyang', 'kim jong'],
  TW: ['taiwan', 'taiwanese', 'taipei'],
  AF: ['afghanistan', 'afghan', 'kabul', 'taliban'],
  MM: ['myanmar', 'burmese', 'burma', 'naypyidaw'],
  ID: ['indonesia', 'indonesian', 'jakarta'],
  PH: ['philippines', 'filipino', 'manila'],
  VN: ['vietnam', 'vietnamese', 'hanoi'],
  TH: ['thailand', 'thai', 'bangkok'],
  AU: ['australia', 'australian', 'canberra'],
  CA: ['canada', 'canadian', 'ottawa'],
  MX: ['mexico', 'mexican', 'mexico city'],
  BR: ['brazil', 'brazilian', 'brasilia', 'lula'],
  AR: ['argentina', 'argentine', 'argentinian', 'buenos aires', 'milei'],
  VE: ['venezuela', 'venezuelan', 'caracas', 'maduro'],
  CO: ['colombia', 'colombian', 'bogota'],
  CL: ['chile', 'chilean', 'santiago'],
  ZA: ['south africa', 'south african', 'pretoria', 'johannesburg'],
  NG: ['nigeria', 'nigerian', 'abuja', 'lagos'],
  ET: ['ethiopia', 'ethiopian', 'addis ababa'],
  KE: ['kenya', 'kenyan', 'nairobi'],
  SD: ['sudan', 'sudanese', 'khartoum'],
  LY: ['libya', 'libyan', 'tripoli'],
  ML: ['mali', 'malian', 'bamako'],
  NE: ['niger', 'nigerien', 'niamey'],
  CD: ['democratic republic of the congo', 'drc', 'congolese', 'kinshasa'],
  SO: ['somalia', 'somali', 'mogadishu'],
  MA: ['morocco', 'moroccan', 'rabat'],
  DZ: ['algeria', 'algerian', 'algiers'],
  TN: ['tunisia', 'tunisian', 'tunis'],
  BY: ['belarus', 'belarusian', 'minsk', 'lukashenko'],
  RS: ['serbia', 'serbian', 'belgrade'],
  GR: ['greece', 'greek', 'athens'],
  SE: ['sweden', 'swedish', 'stockholm'],
  NO: ['norway', 'norwegian', 'oslo'],
  FI: ['finland', 'finnish', 'helsinki'],
  DK: ['denmark', 'danish', 'copenhagen'],
  CH: ['switzerland', 'swiss', 'geneva', 'bern'],
  AT: ['austria', 'austrian', 'vienna'],
  BE: ['belgium', 'belgian', 'brussels'],
  IE: ['ireland', 'irish', 'dublin'],
  PT: ['portugal', 'portuguese', 'lisbon'],
  HU: ['hungary', 'hungarian', 'budapest', 'orban'],
  RO: ['romania', 'romanian', 'bucharest'],
  CZ: ['czech', 'czechia', 'prague'],
  KZ: ['kazakhstan', 'kazakh', 'astana'],
  AM: ['armenia', 'armenian', 'yerevan'],
  AZ: ['azerbaijan', 'azerbaijani', 'baku'],
  GE: ['georgian government', 'tbilisi', 'republic of georgia'],
  MD: ['moldova', 'moldovan', 'chisinau'],
  CU: ['cuba', 'cuban', 'havana'],
  HT: ['haiti', 'haitian', 'port-au-prince'],
  NZ: ['new zealand', 'wellington'],
  BD: ['bangladesh', 'bangladeshi', 'dhaka'],
  LK: ['sri lanka', 'sri lankan', 'colombo'],
  NP: ['nepal', 'nepali', 'kathmandu'],
}

// Built once: longest aliases first, so "south korea" wins over "korea" and
// "united states" is never shadowed by a shorter fragment.
const PATTERNS = Object.entries(ALIASES)
  .flatMap(([iso, terms]) => terms.map((term) => ({ iso, term })))
  .sort((a, b) => b.term.length - a.term.length)
  .map(({ iso, term }) => ({
    iso,
    // Word boundaries, so "Mali" does not match "Malian ambassador" twice or
    // fire inside "Somalia".
    re: new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi'),
  }))

let worldCache = null

export async function loadWorld(dataDir = join(process.cwd(), 'public', 'data')) {
  if (worldCache) return worldCache
  try {
    worldCache = JSON.parse(await readFile(join(dataDir, 'world.json'), 'utf8'))
  } catch {
    worldCache = null
  }
  return worldCache
}

/**
 * The country a card is most about, or null.
 *
 * Scored by mention count rather than first match: a story about Iranian
 * threats to shipping mentions several places, and the one named most is
 * usually the subject.
 */
export function detectCountry(text) {
  if (!text) return null
  const scores = new Map()

  for (const { iso, re } of PATTERNS) {
    const matches = text.match(re)
    if (!matches) continue
    scores.set(iso, (scores.get(iso) ?? 0) + matches.length)
  }

  if (scores.size === 0) return null
  const [best] = [...scores.entries()].sort((a, b) => b[1] - a[1])
  return best[0]
}

/** Tag every card with a country code where one is confidently detectable. */
export async function tagGeography(cards, dataDir) {
  const world = await loadWorld(dataDir)
  if (!world) return { tagged: 0 }

  let tagged = 0
  for (const card of cards) {
    const iso = detectCountry(`${card.headline} ${card.dek ?? ''}`)
    // Only tag what the map can actually draw.
    if (!iso || !world.countries[iso]) continue
    card.geo = iso
    card.detail.geo = { iso, name: world.countries[iso].name }
    tagged++
  }
  return { tagged }
}
