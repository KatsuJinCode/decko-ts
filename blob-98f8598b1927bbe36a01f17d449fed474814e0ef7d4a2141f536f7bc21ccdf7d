# The compound-create server-time residual: root-caused and fixed

Branch `port/compound-time-20261026` (lane checkout
`C:/localProjects/decko-ts-compound-time-20261026`, a linked worktree of
`C:/localProjects/decko-ts-release-lead` created by the lane-copy tool,
node_modules shared by junction), from the newest pushed tip of
`deploy/full-candidate-20261103` (`5131d2ac4`, the v24 candidate). Fix
commit `4576a18f1`, pushed forward-only.

## The root cause, one sentence

On a pointer/list-typed new-card or edit form whose options chain resolves
the `Card[:all]` fallback (card-mod-layout-0.20.0 `set/abstract/items/
options_api.rb:48`), the port ran the fallback card's own CQL search with
NO limit, while Ruby bounds that search at 100 items (`*all` is Set-typed
and the Set cardtype includes the search machinery: card-mod-rules-0.20.0
`set/type/set.rb:1` `include_set Type::SearchType` -> card-mod-search-0.20.0
`set/type/search_type.rb:2` `include_set Abstract::CqlSearch` ->
`set/abstract/0_search/search_params.rb:41-43` `def default_limit; 100;
end`), so the deck's `{}` CQL matched the whole deck, every result row was
seated into the render map, and then every list-typed result was swept as a
pointer host by `enrichPointerListItemsClosure` - the hundreds of
statements the budget leg recorded.

The defect was one line: `src/card/render.ts` `ensurePointerEditorOptions`
modeled `o_card.try(:default_limit).to_i` (options_api.rb:42,45) as 50 for
the `*content_options` rule arm and 0 (unlimited) for the `*all` arm. The
rule arm's 50 is right (card-mod-list-0.20.0 `set/right/content_options.rb:
3-6`); the `*all` arm's 0 missed the search machinery's own
`default_limit`, which the Set cardtype carries. The fix gives the
non-rule arm Ruby's 100.

## How it was profiled

`tools/diagnose-compound-create-ladder.mjs` (new, committed) boots the same
local stack the signed-in exercise boots (same deck copy, same bundle, same
keep-alive loopback transport), signs the seeded administrator in over
plain HTTP, and drives the budget leg's own shapes plus controls, recording
per request the pipeline POSTs, statements, db wall, and every statement's
SQL and arguments. The committed run's before/after table is below. The
wave-level attribution (which loop, which query pattern) came from
temporary `DECKO_WAVE_TRACE` instrumentation in the same files, run during
profiling and removed before the fix commit; the committed probe needs no
engine changes.

What the trace showed, in order:

1. `[options]` on a compound create form resolved the options chain to
   `source=all` (no `*content options` rule for the compound name, the
   right part not a cardtype).
2. The `*all` card's `{}` content ran as a CQL search matching the whole
   deck; the render's seat count crossed 1,000 / 3,000 / 6,000 / 12,000 /
   18,000 inside `prefetchSearchResultRows <- runSearch <-
   ensurePointerEditorOptions`.
3. `enrichPointerListItemsClosure` then processed 3,883 pointer-like hosts
   among the seated rows (the deck holds 3,727 List-typed cards), merged
   6,787 item names into one wave, and `seatNamesByWave` issued 808
   junction-chain statements over 13,094 bound tuples.
4. The compound Pointer form's total: 936 statements. The simple-name
   controls (existing-card forms, the simple edit page) carried 84-209
   statements and never reached the `*all` arm.

## Measured before/after (same probe, same deck copy, same shapes)

| shape | before (fix reverted) | after (committed tip) |
|---|---|---|
| `/new/Pointer?card[name]=<card>+<card>` (compound create form) | 11,290 ms / 936 stmts | **644 ms / 155 stmts** |
| `/new/Pointer?card[name]=<card>+<missing>` | 11,687 ms / 937 stmts | **650 ms / 156 stmts** |
| `/<host>+<role>/edit` (the ledger's 9.5 s / 511-stmt row) | 6,630 ms / 821 stmts | **355 ms / 97 stmts** |
| the same edit page, warm | 8,010 ms / 820 stmts | **31 ms / 3 stmts** |
| control: `/new/RichText` simple form | 1,829 ms / 168 stmts | 1,231 ms / 168 stmts |
| control: `/<person>/edit` simple edit page | 1,720 ms / 126 stmts | 1,142 ms / 126 stmts |

The before numbers are one probe run at the reverted tree (the fix line set
back to 0, then restored; the red-check run of the pin test below is the
same revert), the after numbers the committed-tip run. Wall times move
between runs with machine load; the statement counts are the fix's
signature and they are stable: 936 -> 155, 821 -> 97, controls unchanged.
The recorded ledger's own before rows (the held-mx whole-run record:
13.9 s / 594, 11.9 s / 866, 9.5 s / 511, 6.6 s / 297) sit on the same
shapes.

## Proof

1. **The budget leg green.** The whole signed-in family exercise at the
   committed tip (`node tools/edge-signed-in-exercise.mjs --deck
   C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/
   deck.sqlite3 --out .runtime/compound-time/whole-family/report.md`):
   **330 / 332 checks passed**, and section 9 reads
   `PASS no signed-in page exceeded 3 s of server time` and
   `PASS no save exceeded 3 s of server time` with empty slow lists
   (`overBudgetOwnWorkRequests: 0`, `slowestOwnWorkMs: 2913` in the run's
   own server-time receipt). The v24 roll's receipt recorded the same
   exercise at 329 / 332 with THREE named residuals, the server-time leg
   among them; this run's only failures are the two sibling residuals
   below. Capability coverage: 95 covered, 1 partial, 0 not covered,
   1 out of scope (of 98).
2. **The family exercise holds.** The two failures are exactly the named
   sibling-lane residuals: N9 (a cardtype card's stored body does not
   render in its content view) and the P5 `*type_plus_right` set leg. Both
   fail the same way at the base tip per the anchor-regression receipt;
   they are sibling lanes' work and remain.
3. **No regression in the battery or suites.**
   - `tsc --noEmit`: clean (exit 0).
   - The new pin test and its five neighbours
     (`pointer-options-all-arm-default-limit.test.ts`,
     `options-card-cql-parse-boundary.test.ts`,
     `card-mod-list-select-editor.test.ts`,
     `card-mod-list-checkbox-editor.test.ts`,
     `set-host-options-chain-boundary.test.ts`,
     `item-slot-type-option.test.ts`): 37 / 37 passed.
   - The correctness gate (`node tools/test-gates.mjs run correctness`):
     7,467 passed / 9 failed / 252 skipped. All 9 failures are one
     environmental cause, present at the base: `Error: MySQL 8.4.11 server
     binary not found at C:\localProjects\.mysql-test-cache\8.4.11\...
     mysqld.exe` - the mysqld binary is not downloaded on this machine, so
     the MySQL-family suites never execute; the failure is not a behavior
     change (the roll receipt records the same missing-binary reason).
   - The parity gate (`node tools/test-gates.mjs run parity`): 1,847
     passed / 16 failed / 50 skipped. The 16 failures were re-run at the
     reverted tree and fail IDENTICALLY there (16 failed both ways), so
     they are pre-existing base failures (line-anchor pins on files this
     lane never touched, an archive-path ENOENT, exercise-state asserts),
     not regressions.
4. **The pin is red at the unlimited arm.**
   `tests/card/mod-loader/pointer-options-all-arm-default-limit.test.ts`
   seeds a deck whose `*all` carries the `{}` CQL and 150 readable filler
   cards, renders the edit view of a pointer whose options resolve to the
   `*all` arm, and pins the select editor's standard options at exactly
   100. Measured at the reverted tree: 152 standard options / 154 total
   (2 failed). At the committed tip: exactly 100 / 102 total (2 passed).

## What this round does not claim

- **N9 and P5 are not closed.** They fail identically at the base tip and
  are named sibling-lane work.
- **Nothing deploys.** Every measurement is the local stack over a copy of
  the source deck. No live request was made, no host touched.
- **The `/new/Search` editor shape is untouched.** The plus-card Search
  form carried 294 statements before and after (its cost is the search
  editor's own surface, not the options walk); it measured 1.5-2.3 s on
  this machine's probe and inside the budget in the family run.
- **The `*all` arm's option ORDER beyond the first 100 is not byte-pinned.**
  No recorded fixture renders this arm's option list (the captured pointer
  fixtures resolve through the `*content_options` rule or the by-name arm
  on decks far below 100 cards); the budget leg and the family exercise are
  the graded surfaces and both hold.
