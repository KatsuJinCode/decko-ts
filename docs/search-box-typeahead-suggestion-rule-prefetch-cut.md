# The navbar typeahead: cutting the suggestion view's unused rule prefetch

## What this pins

`/*search/search_box_complete.json` is the navbar search box's autocomplete
source. `src/card/render/navbar-views.ts:267` renders
`data-completepath="/*search/search_box_complete.json"` into the search input on
every page, and the deck script fetches one of these per keystroke. `/*search`
answers once per SUBMITTED query; this answers once per CHARACTER typed, so it
is the highest request-rate action the search flow has. It is the endpoint
`docs/cold-autocomplete-render-path.md` already made cold-fast, on a different
axis: that work removed 1,600-2,400 statements from the COLD first request. The
work here is about what each request still does once it is warm.

## The bottleneck, named

Measured with the instrument below against the local harness stack over a
21,688-card copy of Brandon's deck: every request issued the SAME 62 SQL
statements regardless of the term, and the request-local live render
(`src/card/live/live-render.ts`) took SIX discovery passes to converge. The
`DECKO_LIVE_DEBUG` pass trace for one warm request:

```
PASS 3 pending=1225 asked=7   ...
PASS 4 pending=145  asked=13  ["Person+image+*type plus right",
                                "Person+bio+*type plus right",
                                "Person+how to contact me+*type plus right", ...]
PASS 5 pending=18   asked=68  ["{\"type\": \"bootswatch_skin\", ...}",
                                "Person+Project(s) Organizing+*type plus right", ...]
```

`Person+<field>+*type plus right`, one per field of the `Person` cardtype, is
the `*content options` rule set. It came from ONE place:
`RenderEngine#primePreparedCardDerivedState` collects
`ruleNamesForCard(card, setting)` for
`["*content options", "*help", "*structure", "*default"]` over every card the
render seats (`src/card/render.ts:4118-4133` before this change) and fetches
and seats all of them.

**Mechanism.** The JSON `search_box_complete` bare view renders three labels
and one icon per suggestion. Stock `card-mod-search set/all/autocomplete.rb`
and `set/self/search.rb` compose
`autocomplete_item :goto, goto_autocomplete_icon, autocomplete_label`; the label
is `card.name` and the icon is the card's `+image` core
(`src/card/mod-loader/mods/card-mod-search.ts:671-701`, `786-879`). No display
rule of any kind is read. So every rule row the collect gathered was fetched,
seated, and then waited on by the live render's completion rule
(`live-render.ts:470`, `493-501`) for nothing — and the completion rule is why
the request could not answer until the last of them landed. The engine already
knew this: `render.ts:2004` exempts exactly this view from the deck-wide help
resolver for the same reason. The rule-candidate collection beside it was the
same class of work and had no such exemption.

The cost was not mostly SQL time (the removed statements were individually
cheap); it was the extra discovery passes, the row decode, the composition and
seating of thousands of rule rows, and the round trips they forced.

## The change

`src/card/render.ts` only. `renderHeld` computes one local,

```
const suggestionLabelsOnly = this.liveRequest && params.format === "json"
                          && view === "search_box_complete";
```

and passes it to `primePreparedCardDerivedState`, which uses it to skip the
rule-candidate collection. Nothing else changes: the type prime still runs (the
icons read a card's `+image`, whose composition needs its type row), and every
other render — HTML, the unbatched route, every other view — is untouched.

The flag is a render-frame local, not an engine field, on purpose: a page
render nests `renderHeld` for every layout slot, and an engine field would read
back the innermost frame's answer by the time an outer frame's next await
resumed.

## Measurements

Instrument: `tools/perf/search-box-latency/compare-search-box-latency.mjs`
(two child processes, one local stack each, round-robin interleaved, the first
arm alternating per term) with
`measure-search-box-latency.mjs` for the single-arm and per-phase view. Deck:
`tmp/search-box-latency/deck.sqlite3`, a copy of the 21,688-card speedprobe
deck with `tools/deploy/build-nest-index.mjs` run (`current (version 2)` — the
copy as found was at version 1 and served by walking its nest closure, which
would have measured a degraded deck). 30 terms: the owner's three keystrokes
(`202`, `2026`, `202609`, from `lib/owner-checks.mjs`) plus a fixed stride over
the deck's alphabet-sorted names, each cut to a realistic prefix. No
randomness; the list is printed into every report.

Paired, both arms live at the same time, same deck, same session:

| Actor | n | before p50 | after p50 | before p95 | after p95 | SQL stmts |
|---|---:|---:|---:|---:|---:|---:|
| admin | 30 | 775 ms | 666 ms (−14.1%) | 963 ms | 905 ms (−6.0%) | 62 → 41 |
| admin | 120 | 656 ms | 589 ms (−10.2%) | 741 ms | 700 ms (−5.5%) | 62 → 41 |
| anonymous | 30 | 749 ms | 685 ms (−8.5%) | 1188 ms | 975 ms (−17.9%) | 61 → 38 |
| anonymous | 120 | 694 ms | 644 ms (−7.2%) | 842 ms | 743 ms (−11.8%) | 61 → 38 |

The after arm answered faster on 26/30 and 102/120 (admin) and 26/30 and
106/120 (anonymous) terms. Paired per-term delta p50 is −55 to −62 ms across
all four runs.

**The 30-query p95 is one sample.** At n=30 the nearest-rank p95 is the 29th of
30 sorted values, so it is essentially the second-slowest request; the n=120
rows exist because of that and are the ones to read for the tail.

## Byte parity

Every run above compared the two arms' complete response bodies for every term:
**identical on 30/30 and 120/120, both actors** (two independent runs each of
the single-arm capture agreed: 61,355 bytes across the 30 admin responses and
43,027 across the 30 anonymous ones). The harness binds an ephemeral loopback
port per boot and this view's items carry absolute urls, so each run's own
origin is normalized to a fixed token before comparison — without that a diff
drowns in port noise.

`tests/deploy/bunny-cold-autocomplete-batching.test.ts` independently asserts
`DECKO_LIVE_RENDER=1` and `=0` produce identical JSON for this view across
anonymous/member/administrator actors and ordinary/exact/restricted/virtual
names, and that no card row is mutated.

## Two measurement traps this lane hit, kept because they will bite again

**Two local stacks must not share a process.** `startStack` writes the stack's
settings into the shared `process.env` (edge-host.mjs:74-79), so the SECOND
`startStack` overwrites `DECKO_DB_URL`; the first stack's engine, which reads
`process.env` at request time, then issues every statement at the second
stack's database. `startStack` also replaces the shared `globalThis.fetch`.
Measured directly on this lane: after two boots `process.env.DECKO_DB_URL`
equalled stack 2's hrana URL while stack 1's own URL differed, stack 1's ledger
stayed at zero across 120 requests, and stack 2's absorbed both arms' SQL. An
in-process two-arm comparison produced plausible-looking numbers and none of
them were sound. `run-one-search-box-latency-arm.mjs` is one stack per process
for exactly this reason.

**Two separate before/after runs on this machine do not agree.** The same 30
queries measured minutes apart, with other lanes' work on the box, moved the p50
by tens of milliseconds — enough to invert a real effect. That is why the
paired instrument exists. An earlier single-process A/B on this lane reported
p50 −10.6% and p95 **+1.4%** (a regression) from a setup that was not actually
comparing two independent stacks; those numbers are discarded, not reported as a
tail regression.

## What was NOT changed, and why

The remaining SQL hot spot after the cut is ten `wideningStatements`
(`src/card/live/request-store.ts:339`) per request — the live store's frontier
fetch, already batched into few trips, ~11 ms each. The remaining per-request JS
is `flushSpeculative` / `frontier` / the compact row decode and `Lexicon#idToLex`
(already memoized through `cacheFetch`, `src/card/fetch/lexicon.ts:394`). None
of those is repetition of work nobody reads; they are the batched discovery
machinery and SQLite itself. Cutting them would mean adding a mechanism with its
own lifetime cost, which the doctrine reserves for irreducibly heavy work, and
that is not this lane's brief.

No synthetic query-count regression test is claimed. `docs/cold-autocomplete-render-path.md`
records that a proposed ceiling for this path passed even when batching was
deliberately omitted and was therefore removed; that decision stands and is not
quietly reversed here. The claim this work rests on is a measurement plus byte
parity, reproducible with the two tools in this directory.

## Reproducing

```powershell
node tools/dist/build-engine.mjs
node tools/deploy/build-nest-index.mjs --db tmp/search-box-latency/deck.sqlite3
node tools/bundle-bunny-edge-engine.mjs                      # AFTER bundle
node tools/perf/search-box-latency/measure-search-box-latency.mjs --n 30 --actor admin
node tools/perf/search-box-latency/compare-search-box-latency.mjs `
  --before <before.bundle.js> --after tmp/search-box-latency/bundles/after.bundle.js --n 30 --actor admin
```

The deck copy and its credentials come from `tmp/speedprobe/` in the release
checkout; credentials are read, never printed. Nothing here touches a deployed
site: these are local numbers about a local stack over a local deck, and the
deployed-edge verdict stays with the live-acceptance lane.
