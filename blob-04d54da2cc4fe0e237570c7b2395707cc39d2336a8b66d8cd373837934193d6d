# Round 2 of the save path's statement ladder: block batching

The owner-card save still issued 526 pipeline POSTs for 593 statements after
round 1's transaction read memo (cff0c8d9): the engine awaits every answer,
so one statement rode each POST (the capture's tick data: 526 distinct ticks,
max 1 POST per tick — no passive coalescing is possible). On the live host
every POST is a network round trip, so wall = hops x hop latency. Measured
after this commit: **439 POSTs (-16.5%)** for 597 statements (+4) on the same
journey; at the live host's ~13 ms/hop that is ~1.1 s off the save. The +4
statements ride POSTs that already exist, so the hop count is the honest
live-host currency and it is what the ask's gate measures.

Mechanism, per seam — the rule is: only statements that are read-only AND are
issued at the same sequence point (no write between them) may share a POST;
an ordered pipeline answers each exactly as its individual round trip did.

1. `ActWriter.updateCard` pre-reads (src/card/history/write-path.ts): the
   actionCount / ownDraftCount / firstNonDraftAction reads rode three POSTs.
   All three are reads of card_acts/card_actions issued before this
   operation's own writes; they now ride one `driver.batch` (one POST). The
   firstNonDraftAction read used to run only when `actionCountAtFinalize ===
   2`; it now always executes (read-only, result still only consulted under
   the condition) — that is most of the +4 statements.
2. `ActWriter.createCard` first_create? count: the `SELECT COUNT(*) ...`
   that used to follow the operation's batch as its own POST is now a
   trailing statement of that same batch — server-side order unchanged, so
   it reads the exact post-insert state the separate round trip read (-1
   POST per created card).
3. `CardActionEngine.bumpAncestorTimestamps` (the :integrate stage's nester
   walk, post-commit): the nester batches already existed; the LIVENESS rows
   (`isLive`, one row fetch per nester) and the expiry loop (one row fetch +
   junction side fetches per ancestor) rode one POST each. The walk is now
   level-wise: per level, one nester batch + one liveness batch; the expiry
   loop fetches every ancestor row in one batch and seats the junction sides'
   lexicon entries through `DbLexicon.noteIdToLexRow`/`noteIdToLexMiss`
   (which write exactly what `idToLex`'s own cache write writes for the same
   db-read row) in one batch per closure round, skipping ids the lexicon
   already holds (`heldIdEntry`, new — mirrors `lexEntryKnown`'s read order).
   The walk's result set is the old recursion's (nesters at levels 1..6,
   descent only through live nesters); it feeds a Set and one order-free
   IN-list UPDATE, so collecting it breadth-first cannot change what the
   walk names.

Correctness proofs:

- `npx tsc --noEmit` clean.
- `npx vitest run tests/card/actions/` — 507 passed, 5 failed; the 5 are the
  pre-existing MySQL-8.4 `Table 'atomic_1.sqlite_master' doesn't exist`
  failures, reproduced on a HEAD copy of the tree with this commit's changes
  removed (control run, same 5 tests, same error).
- `npx vitest run tests/server/` — 507 passed, 0 failed, 14 skipped.
- `npx vitest run tests/card/fetch/` — 89 passed (the lexicon seating's
  home).
- Measurement: tools/diagnose-owner-save-statement-ladder.mjs before
  (docs/reports/receipts/save-ladder-before-block-batching-2026-10-18.json,
  526 POSTs / 593 statements, source 856e7007) and after
  (docs/reports/receipts/save-ladder-after-block-batching-my-changes-only-
  2026-10-18.json, 439 POSTs / 597 statements, working tree = 856e7007 plus
  exactly this commit's source changes).

Measurement honesty: two earlier after-runs (436 POSTs) measured a tree that
also carried another lane's in-flight, uncommitted bunny-db.ts junction-index
change (modified 14:16, before those runs built); they are superseded by the
my-changes-only run above, which is the number this commit claims. The
superseded runs are not committed.
