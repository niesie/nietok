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
  fetch (parallel, failure-isolated) → normalize → dedupe → rank → quota → write
       ↓
public/data/feed.json
       ↓
src/main.js → src/feed.js → src/card/render.js + src/detail.js
```

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

## Status

Phase 1. Guardian + Wikipedia "on this day", news and history cards.

Known and expected: news supply is the binding constraint — with ~120 news
cards at 56% of the mix, content starts repeating around card 212. Phase 2
(GDELT + RSS) is what fixes it.
