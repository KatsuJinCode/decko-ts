# The rule-candidate walk, narrowed to the keys the save asks for (2026-10-20)

Continues `save-path-rule-resolution-narrowing-2026-10-20.md` (a94561e1), which
corrected the attribution, landed the per-key walk for the `self` lookup, and
measured the rule-closure swap dead as a replacement for
`firstApplicableReadRule`.

That round left one thing unmeasured: the per-key walk it had just landed was
never tried on the caller that actually costs the save. This round did that,
and the save's five whole-deck walks are gone.

Branch `perf/savepath-rule-resolution-20261020`, base a94561e1, worktrees
`C:/localProjects/decko-ts-savepath-lanes-a94561e1` (the change) and
`C:/localProjects/decko-ts-savepath-base-a94561e1` (the untouched base, for the
before/after suites).

## 1. Headline

| | |
|---|---|
| Landed | `firstApplicableReadRule` resolves its candidates with the PER-KEY walk, not the whole-deck universe |
| Equivalence | **19,469 composed keys checked on the serving deck, 0 wrong, 0 missing, 0 invented.** Rule-shaped subset: 1,489 checked, 0 wrong |
| The save | whole-deck universe walks **5 → 0**. Save db wall **933 → 363 ms**, statement-exec **549 → 91 ms** |
| Still rejected | the rule-closure walk (a94561e1: 3× slower). Four cuts are now measured dead, one worked |
| Open, unchanged | the walk composes through TRASHED sides; Ruby does not. 38 names on the serving deck. Needs a parity decision of its own |

## 2. The mechanism the previous round missed

a94561e1 established that all five whole-deck walks belong to
`firstApplicableReadRule` (`set-read-rule.ts:273`), not to the `self` lookup. It
then measured one replacement for them — the rule-closure walk — found it 3×
slower, and concluded the cost was structural.

The premise underneath that was not tested. `firstApplicableReadRule` asks for
**five keys** (the ladder's own tag: `wholeDeck | n=5 | person+company+*type_plu_right+*read`)
and `resolveRuleIdsByKeys` answers them by composing **every card in the deck**.
The narrowing that was actually available had already been built one function
away and never pointed at this caller.

**Why the memo does not save it.** `expireAfterWrite`
(`card-action-engine.ts:6043`) calls `expireRuleResolutionCache`, which drops
the whole per-driver entry — universe and content memos together. A save
interleaves reads with committed writes, so each post-write resolution finds no
universe and rebuilds one from scratch. That is why the cost is 5× one walk
rather than one: `expireRuleResolutionCache` is called at 12 sites in
`card-action-engine.ts` and there is no seam that could narrow it without
per-key dependency tracking, which is where the bugs live (the cache's own doc
says so).

So the memo can never amortize this walk, and the only lever left is to not run
it. That is what this round does.

## 3. What landed

`resolveRuleIdsByComposedKeys` (`read-rules.ts`) — the id-only projection of the
per-key walk `resolveComposedNameIdsByKeys`, mirroring `resolveRuleIdsByKeys`'s
shape exactly: sorted key order, one entry per requested key that resolves,
absent for a key that does not.

`firstApplicableReadRule` now calls it instead of `resolveRuleIdsByKeys`. That
is the whole production change: one call site, one new export, both docs
updated to stop naming the old caller.

**The shape match is what makes this a substitution and not a rewrite.** The
old caller did `resolved.get(key)` and skipped on `undefined`; so does the new
one. The `overlay` precedence, the candidate iteration order, and the
`fetchCardsRow` + `trash !== 0` re-check on the resolved id are all untouched.

**The ambiguous key is still not guessed.** A key two cards both compose (a
stored compound key and a junction over the same sides — `cards.key` is UNIQUE,
so the two meet only that way) is handed to the whole-deck walk, whose Map
collapses it by output order. `walkComposedNames` returns `[row.id]` for those
(`read-rules.ts:941-944`). The serving deck has **0** of them, so the fallback
never fires there; the fixture pins that it fires, and that it fires for exactly
the ambiguous key.

## 4. Equivalence

### 4.1 On the fixture — the representative rule set the pins already seeded

`tests/card/permissions/rule-candidate-per-key-resolution-equivalence.test.ts`,
reusing `seedComposedNameDeck` and `wholeDeckUniverse` from the landed `self`
contract rather than growing a second fixture. 26 tests:

- identical maps over **every** composed name the deck has, entry order included;
- the rule-shaped candidates answered to the same ids (`*all+*read` → 13,
  `set_a+set_b+*read` → 17 over a two-level spine, `*read` → 12);
- misses pinned in both walks (`beta+gamma` — the trashed junction that composes
  nothing — plus two absent keys at several depths), because a miss is the
  fail-open direction;
- an **ambiguous rule-shaped key** (`set_a+set_b+*read` composed by junction 17
  and stored by a new card 18): the narrow path returns exactly one id, and it is
  the id the universe Map decides;
- the cost claim as an **observation, not a timing**: the counted driver's SQL
  log contains **zero** whole-deck universe statements for an unambiguous
  candidate list, and **exactly one** when a candidate is ambiguous. A
  zero-statement pass cannot fake the first assertion, because the same call is
  asserted to have issued statements at all.

### 4.2 On the serving deck — the population that matters

`tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`
drives the **shipped functions** through `LocalSqliteDriver` against
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`
(read-only). It skips, and says so, when the deck is absent rather than passing
on an empty population; `DECKO_SERVING_DECK` overrides the path.

```
deck: 19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous (0 rule-shaped)
equivalence over ALL composed keys:  19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys:   1489 checked, 0 wrong
save-shape cost, 5 cold calls of 5 candidates each:
  whole-deck walk: 92.4, 89.7, 103.8, 110.9, 89.9 ms  (total 486.7 ms)
  per-key walk:    1.4, 1.2, 1.1, 1.0, 1.0 ms         (total  5.7 ms)
  ratio: 85.4x
```

Three things that measurement settles that the fixture cannot:

- **The population is a superset.** Every composed name is checked, not just the
  rule-shaped subset, so a shape the call site does not reach today is covered.
- **The ambiguity census is 0.** The fallback is a safety property here, not a
  cost — so the 85.4× is the real number, not one discounted by hidden fallbacks.
- **The cost is per-call, not per-generation.** Each timing opens a fresh
  driver, because a save drops the memo at every write and measuring through one
  driver would let the first walk warm the second and report a number no save
  ever experiences.

## 5. Before / after on the graded save

`tools/diagnose-owner-save-statement-ladder.mjs`, same worktree, same deck, the
two runs minutes apart on the same machine.

| measure | BEFORE (a94561e1, bundle `bbd08b61`) | AFTER (bundle `b274a6b6`) |
|---|---:|---:|
| pipeline POSTs | 439 | 484 |
| statements | 597 | 689 |
| db wall (ms) | 933 | **363** |
| save statement-exec (ms) | 549 | **91** |
| **whole-deck universe walks** | **5** (460 ms) | **0** |
| walk share of statement-exec | 84% | 0% |
| CONTROL edit page statement-exec (ms) | 852 | 744 |

**Read the count, not the milliseconds.** The control page — which this branch
does not touch, and which resolves through the rule-closure walk — moved 852 →
744 ms, so the machine was about 13% faster during the AFTER run. The headline
is therefore stated as a COUNT: the whole-deck statement appears **0 times** in
the save's statement sequence, against 5 in the base's. That is
machine-independent. The milliseconds are consistent with it and are reported
as measured, not adjusted.

**The counts went UP, and that is the trade.** 439 → 484 POSTs, 597 → 689
statements. The per-key walk issues a handful of small statements per segment
level where the universe walk issued one enormous one. That is the whole design:
more round trips, far less work. Net db wall is down 61% and statement-exec is
down 83%.

## 6. Tests run

All on this branch, against an unmodified baseline worktree at a94561e1 for the
before column.

| suite | at a94561e1 | this branch |
|---|---|---|
| `npx vitest run tests/card/permissions/` | 17 passed \| 4 skipped (21 files), 164 passed \| 8 skipped (172 tests) | **19 passed \| 4 skipped (23 files), 191 passed \| 8 skipped (199 tests)** |
| `npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts` | 1 failed \| 61 passed (62 files), 5 failed \| 762 passed (767 tests) | **1 failed \| 61 passed (62 files), 5 failed \| 762 passed (767 tests)** |
| `npx tsc --noEmit` | 3 errors | **3 errors, identical** |

**No green suite turned red.** The write suite is identical test-for-test
against the base.

The 5 failures are `tests/card/actions/atomic-saves.test.ts` "MySQL 8.4
(native)", all `Error: Table 'atomic_1.sqlite_master' doesn't exist` — no MySQL
server on this machine, so the adapter fell back to SQLite. Verified
pre-existing by running `npx vitest run tests/card/actions/atomic-saves.test.ts`
in a clean worktree at a94561e1: same 5 failures, same cause.

The 3 typecheck errors are `tests/card/actions/write-path-races.test.ts` lines
132, 526, 526 — a file this branch does not touch. Same 3 at the base.

The permission suite's +2 files / +27 tests are this lane's pins.

## 7. Reproduce

```
git worktree add C:/localProjects/decko-ts-savepath-base-a94561e1 --detach a94561e1
git worktree add C:/localProjects/decko-ts-savepath-lanes-a94561e1 perf/savepath-rule-resolution-20261020

node tools/bundle-bunny-edge-engine.mjs
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-BEFORE.json   # base worktree
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-AFTER.json    # branch worktree

npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts
```

The ladder tool records `source` as the last COMMIT, so the AFTER run reports
`a94561e1` with the change uncommitted in the worktree. The `bundleSha256` is
the field that distinguishes the two runs: `bbd08b61` (base) against
`b274a6b6` (branch).

## 8. Where the five rejected cuts stand now

| cut | verdict |
|---|---|
| (a) push the requested key into the final projection | no speedup (ff235c5c) |
| (b) `UNION ALL` + final `DISTINCT` | 20–30% slower (ff235c5c) |
| (c) drop the `self` resolver call | wrong answer (ff235c5c) |
| (d) route `firstApplicableReadRule` to the rule-closure walk | 3× slower (a94561e1) |
| **(e) route it to the per-key walk** | **85× faster, equivalent on 19,469 keys (this round)** |

Cut (d) and cut (e) were the same idea — narrow the five-key question — and they
came out opposite ways. The rule-closure walk narrows by **seed** (it only
starts from cards on rule spines) and pays five `MATERIALIZED` edge CTEs to do
it. The per-key walk narrows by **segment runs of the requested keys** and pays
nothing to start. On this deck the difference between "returns 13× fewer rows"
and "returns 13× fewer rows" is worth 85×.

## 9. Still open, unchanged

- **The trashed-side divergence.** Both walks compose through a TRASHED side
  (`r.key IS NOT NULL`, no trash clause); Ruby filters `trash: false` at every
  `id()` (`prototype/lib/card/lexicon.rb:120-128`). 38 composed names on the
  serving deck resolve only through one. Reproduced by both walks, not corrected
  by either — changing it changes permission decisions. Pinned as current
  behavior; needs a parity decision of its own.
- **The `expireRuleResolutionCache` blast radius is untouched.** The memo is
  still dropped wholesale at every write. That is right while the only expensive
  thing behind it was the universe, and it is now much cheaper — but any future
  memo added to that entry inherits the same 12-call-site invalidation.
- **The ladder's save ladder still rebuilds per-key walks per write.** The
  per-key walk is ~1 ms, so the remaining 91 ms of statement-exec is not
  rule resolution any more.
