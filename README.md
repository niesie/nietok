# Nietok

A doomscroll feed for geopolitics, economics and history. Vertical snap feed,
phone-first, installable as a PWA.

The browser only ever reads static files. A Node script does all API ingestion
on a schedule and commits `public/data/feed.json` — which is what lets this run
with no server, no CORS problems, and no API key in client code.

## Setup

```sh
npm install
cp .env.example .env      # then fill in GUARDIAN_KEY
npm run ingest            # writes public/data/feed.json
npm run dev -- --host     # open the Network URL on your phone
```

`.env` is gitignored and must stay that way — **this repo is public**, so
anything committed is world-readable. In CI the keys come from GitHub Secrets.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, bound to the LAN so a phone can reach it |
| `npm run build` | Static build into `dist/` |
| `npm run ingest` | Fetch every source, write `public/data/feed.json` |
| `npm run ingest -- --dry-run` | Same, but writes `feed.sample.json` and commits nothing |
| `npm run ingest -- --dry-run --limit 40` | A small, mix-preserving sample for eyeballing |
| `node scripts/make-icons.js` | Regenerate the PWA icons |

## How it fits together

```
scripts/ingest/index.js
  fetch (parallel, failure-isolated)
    → normalize → dedupe → rank → quota → crosslink → write
       ↓                    ↓
  feed.json (481 KB)   details.json (1877 KB)
  card faces only      text, timelines, facts
       ↓                    ↓
  blocks first paint   loaded in background
       ↓
src/main.js → src/feed.js → src/card/render.js + src/detail.js
```

**The payload is split** because everything used to load before the first card
appeared. Faces are 136 KB gzipped; the long text, timelines and fact panels are
another 487 KB that nothing needs until you tap something, so they load after
first paint (`src/details.js`). Tapping before that lands opens the overlay from
the face and fills in when it arrives — no spinner, no per-tap request.

**`public/data/` is not in git.** It is regenerated every CI run and carried
between runs by the Actions cache. Committing ~2.3 MB every three hours would
add roughly a gigabyte of history a year for content that is rebuilt anyway —
and the commit-and-push was itself what made concurrent runs race each other.
Run `npm run ingest` after cloning.

**Sources** (`scripts/ingest/sources/`) each return `{ cards }` and are
independently key-gated. One being down logs a warning and contributes zero
cards; it never fails the build. Every source goes through `scripts/lib/http.js`
for retry, backoff, per-host pacing and an on-disk cache — the cache is what
keeps local iteration off the Guardian daily quota.

**`quota.js`** caps the feed per type bucket rather than by a global score sort.
Without it history floods everything: it carries a 10-day half-life and
outnumbers news several times over, so the top N by score is nearly all history
and the app silently stops being a news reader.

**`src/shuffle.js`** builds the endless client-side sequence — roughly 55% news
/ 20% econ / 25% history, freshness-weighted, never three of one type in a row,
seen cards pushed down rather than removed so it loops instead of dead-ending.

**`src/feed.js`** mounts cards and keeps a live `<img>` src only for the cards
near the viewport. DOM nodes are cheap; decoded images are what exhausts a
phone. Past ~260 mounted cards it prunes from the top and corrects `scrollTop`
by measuring the anchor's `offsetTop` before and after — cards are `100dvh`,
which changes as mobile browser chrome hides and shows, so arithmetic on a
fixed card height would drift.

**`src/detail.js`** is a fixed-position overlay, never a route change and never
a scroll. The feed sits underneath untouched, so scroll position cannot be
lost. Swipe down to dismiss — but only when the inner content is already at the
top, otherwise it would hijack normal reading scroll.

## Historical context

History cards carry four kinds of context, all deterministic — no LLM involved.

| Section | Source | Coverage |
|---|---|---|
| **Also on this day** — same calendar date across years, as a timeline | Already in the feed; costs nothing | 387/387 |
| **Part of / sequence** — the event's place in a chain (battle → campaign → war) | Wikidata `P361`/`P155`/`P156` | 207/387 |
| **Facts** — participants, location, casualties | Wikidata `P710`/`P276`/`P17`/`P1120` | 282/387 |
| **In today's feed** — current stories sharing its topics | Topic overlap with news cards | 291/387 |

The Wikidata pass resolves labels in two batched phases — claims for every
requested id, then one deduplicated lookup for every id those claims referenced.
Resolving per card would be thousands of requests; deduplicating across the run
makes it a few dozen.

## Status

Phase 1. Guardian + Wikipedia "on this day", news and history cards.

Known and expected: news supply is the binding constraint — with ~120 news
cards at 56% of the mix, content starts repeating around card 212. Phase 2
(GDELT + RSS) is what fixes it.
