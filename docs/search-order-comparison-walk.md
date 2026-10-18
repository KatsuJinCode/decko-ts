# Search-order comparison walk — behavior or data?

`reference-harness/live-walk/compare-search-order.mjs` + `lib/search-order-compare.mjs`
are the search-order module of the live walk (sibling of the byte+pixel walk
harness in this directory). The operator's method, instrumented: type
characters into the search box, capture the ORDERED results on both hosts,
account for the expected card-set discrepancy (the live deck has cards ours
lacks and some slightly edited cards), and decide whether the remaining order
differences are BEHAVIOR or just DATA.

## What it walks

Two surfaces per host, per probe term, sequentially within each origin.
The two independent origins answer the same step together; each receives
at most one outstanding request. If both labels name the same origin,
their requests remain sequential too:

- **autocomplete** — the navbox's `data-completepath` (read off the host's
  own rendered home page, never assumed; stock Decko declares
  `/*search/search_box_complete.json?term=<t>`), the JSON array the deck
  script's jQuery UI autocomplete consumes. The request carries
  `x-requested-with: XMLHttpRequest` — only here: the engine renders XHR
  requests without the navbar, so sending the header at the discovery or
  results-page step would strip the very markup those captures parse.
- **results page** — the navbar search form's action on Enter (stock:
  `/*search?query%5Bkeyword%5D=<t>`), parsed to the ordered
  `search-result-list` region (`search-result-item` entries: title =
  `data-card-name`, href = the item's `full-page-link` anchor). This is page
  1 as a person sees it (`paging_limit`, 20 items); paging parity is
  `reference-harness/browser/probe-search-paging.mjs`'s subject.

Default probes: each letter `a`–`z`, plus a set of partial words, plus an
exact card name (override with `--terms` or `--partial`/`--exact`/
`--no-letters`).

## Usage

```
node reference-harness/live-walk/compare-search-order.mjs \
  --host-a http://127.0.0.1:5001 --host-b http://127.0.0.1:5002 \
  [--out tmp/search-order/report.json] [--terms "T,Memo,Topic 003"] \
  [--partial "Topic,Memo"] [--exact "Topic 003"] [--no-letters] [--timeout-ms 15000]
```

Hrefs are normalized against each host's own base, so a live host and a
local port compare path-to-path. Every proof in this repository runs the CLI
against local engines the session booted; pointing it at a live host is the
operator's separate, approved action.

## The verdicts

Per probe term, per surface, one of:

- `order identical on N common results (behavior matches; differences are data)`
  — the intersection (cards present on both hosts) reads in the same order;
  everything the hosts disagree on was verified to be card-set difference.
- `order differs at position k (behavior difference)` — the intersection's
  order diverges; both orderings are printed (in-intersection divergence, or
  full captured orders when the divergence is in selection, below).
- `no common results; cannot read order — differences are data (…)` —
  disjoint captures.
- `no results on either host (nothing to compare)` / `capture failed: …`.

### Reading the cards-only lists

Each cards-only candidate is VERIFIED against the other host by requesting
the card's own page (falling back to `<path>.json` where a page render
fails, e.g. rule cards that 500 on HTML but answer JSON), then split:

- `cards only on host X (absent from the other host's deck)` — the true
  card-set discrepancy: verified 404/410. This is where renames land too
  (the old name is absent, the new name appears on the other side).
- `cards on host X's page only, present on the other host (window edge, not
  deck absence)` — the card exists on both hosts; it merely sits outside the
  other host's captured 20-item page. Expected whenever the decks differ in
  size: extra cards displace the shared tail across the page edge.
- `… presence on the other host UNVERIFIED` — neither 2xx nor 404/410; the
  module never guesses.

### Selection divergence — a behavior difference with no common-order divergence

If the two pages hold DIFFERENT cards that all verify present on both hosts
(bidirectional window edges, zero verified absence, nothing unverified) — or
two non-empty fully-disjoint windows where every card exists on the other
host — the intersection cannot show the divergence, but the selection does:
with identical ranking that combination is impossible (a shared card inside
one host's top-N but outside the other's forces a verified absence on the
opposite side — the card that displaced it). The verdict becomes
`order differs in selection … (behavior difference)` with both full captured
orders shown. Caveat: the proof is airtight only when both hosts use the
same page size (the autocomplete's 8 and the results page's 20); hosts with
different limits can produce bidirectional edges under identical ranking,
and the printed orderings are what a human judges from there.

## The proof (entirely local; two engines this harness boots)

`reference-harness/live-walk/prove/search-order-two-local-engines-proof.mjs`
boots LOCAL ts engines (reference-harness/browser/engines/ts.json) on private
copies of the `synthetic-v1` fixture — no request leaves the machine — and
runs the CLI as a subprocess, so the proven tool is the tool an operator
runs. Every staged deck copy is timestamp-normalized first (distinct
`updated_at` per rowid, identical across copies): the fixture's shared
timestamp makes the results page's `sort: "relevance"` a full tie, and a
tied sort tier has no cross-instance stability — window edges flicker. The
normalization gives the sort a total order so every reported difference is
staged or injected on purpose.

- **PHASE DATA** — engine B's deck adds `Topic 000`, renames `Topic 001` →
  `Topaz 001`, trashes `Topic 002` (the live-vs-ours card-set stand-in;
  world-readability rides the neighbors' denormalized `read_rule_*`, which a
  raw insert must carry or anonymous CQL filters the card out).
- **PHASE BEHAVIOR** — `dist/src/cql/sql.js`'s single ORDER BY template is
  patched to flip every directive's direction (name sort asc→desc,
  relevance desc→asc); engine C boots on a deck sha256-identical to A's.
- **PHASE REVERT** — the dist file is restored byte-exact (sha256 +
  `git status --porcelain dist/` empty) and engine D must reproduce phase
  DATA's verdict matrix exactly. The patch refuses blind (occurrence count
  must be exactly 1) and restores even on failure.

Observed run (full log: `tmp/search-order-lane/proof-run-full.log`):

```
PHASE DATA      summary: {"orderIdentical":20,"orderDiffers":0,"dataOnly":1,"emptyBoth":1,"captureFailed":0} over 11 probe terms x 2 surfaces
[assert] every verdict is data; discrepancy names exactly the staged cards:
           A-only=[Topic 001 Topic 001+related Topic 002 goto:Topic 001 goto:Topic 002]
           B-only=[Topaz 001 Topaz 001+related Topic 000 goto:Topaz 001 goto:Topic 000]
PHASE BEHAVIOR  summary: {"orderIdentical":5,"orderDiffers":15,"dataOnly":0,"emptyBoth":2,"captureFailed":0} over 11 probe terms x 2 surfaces
[assert] 15 verdict(s) read order-differs with EMPTY cards-only lists and no data-only verdicts — pure behavior difference, caught
PHASE REVERT    [assert] dist/src/cql/sql.js byte-exact: sha256 matches the pre-patch digest, git status --porcelain dist/ is empty
[assert] reversion proven: verdict matrix and cards-only sets identical to phase DATA (22 verdicts)
```

The behavior-phase verdict lines show the two orderings, e.g. probe
`Topic 001` on the results page — a clean mirror:

```
host A order: ["Links To Topic 001","Note 031","Note 001","Topic 024+summary","Topic 020+related","Topic 001"]
host B order: ["Topic 001","Topic 020+related","Topic 024+summary","Note 001","Note 031","Links To Topic 001"]
```

Unit controls (pure comparison logic, both capture parsers, verification
split): `node --test reference-harness/live-walk/test/search-order-compare.test.mjs`.
