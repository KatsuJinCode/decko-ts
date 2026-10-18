# The 3-second server-time budget — reproduction, fix attribution, and the live leg's remaining cost (2026-10-18)

Report entries worked: "Signed-in pages and saves blow the 3-second server-time
budget" (broken-things line 38, matrix ACT-063/ACT-064) and "Save-without-close
answers 200 but does not store" (broken-things line 44, matrix ACT-092).
Every number below was produced in this session; the commands are named.

## 1. Entry line 38, local leg: the named instrument now passes — fix predates this session, proof is new

The named instrument is `tools/edge-signed-in-exercise.mjs`'s "9. timings"
section (`edge-signed-in-exercise.mjs:1114-1128`): every ledgered request's
`Server-Timing` `total;dur` must be ≤ 3000 ms (pages and saves separately).

Reproduction run, this session, unmodified instrument, full scale:

    node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/2026-10-18T-prefix-timing-repro-53c86269/report.md

Result: **236/239 checks passed**, and both timing rows PASS:

    PASS  no signed-in page exceeded 3 s of server time
    PASS  no save exceeded 3 s of server time
    observed 3877 engine requests; slowest server totals: [{"path":"/new/Search?card%5Bname%5D=Harness_CB_Role%2B*","ms":2697, ...}]

(The 3 failures are not this entry: the two conflict-revision-refresh checks —
failing identically in the 2026-10-17T23:03Z and 23:28Z runs, so a pre-existing
pair owned elsewhere — and the stock `widgets.twimg.com` mixed-content asset
audit, report entry 9.)

Why the evidence's numbers do not reproduce: the graded fails rode the LOCAL
instrument's transport. `tools/edge-signed-in-exercise/lib/deterministic-loopback-fetch.mjs:6-24`
measured the decomposition: one pipeline POST cost ~13-15 ms through Node's
global fetch dispatcher (process-state-dependent) versus ~0.4-0.7 ms through a
keep-alive agent, and `BunnyDbDriver` binds `fetch.bind(globalThis)` at
construction (`src/card/drivers/bunny-db.ts:285` area), so the save's ~390
pipeline POSTs paid ~5.3 s of transport wall against ~342 ms of SQLite.
Commit `1a7b8b34` pinned the loopback transport in `stack.mjs` and measured the
same save 5,878 ms → 749 ms with an identical statement ladder. The 23:03Z
Oct-17 run that still failed (5,859 ms) was the deliberate verify-only REVERT
(`31cae5ff` "revert the loopback transport pin to reproduce the graded
save-latency failure"); `7f89739f` restored it and the 23:28Z run's saves
passed. Provenance note: the reproduction run above started at 08:41:20Z from
`53c86269` (custody: clean); two sibling agents' commits landed on the branch
mid-build (`955df0c5` — capabilities.json only; `6b047d7e` — the
recent-changes instrument and its test only). Neither touches engine source;
the built bundle is byte-for-byte 53c86269's engine.

## 2. Entry line 38, live leg: diagnosed to per-save round trips; needs an operator decision

The entry's second pointer is the LIVE deployment: `POST
/update/Brandon_WilliamsCraig` at 5,130 ms with `db;dur=4,809;stmt=367`
(`C:/localProjects/decko-ts-turn-on-editing/docs/runs/edge-signed-in-exercise-live-4f2c817d-2026-10-16.md:97`).
On the live host every pipeline POST is a real network round trip
(~13 ms measured in that header), so the live wall is hop count × hop latency.
The transport pin is a local-harness fix and does not change the hop count.

New diagnostic (this session):
`node tmp/diagnose-owner-save-statement-ladder.mjs` (committed as
`tools/diagnose-owner-save-statement-ladder.mjs`), which boots the same local
stack the harness boots, inserts only a statement recorder between the engine
and the local-hrana pipeline, and re-posts the owner card's own edit form
verbatim (output: `tmp/save-ladder-diagnosis-prefix.json`):

    POST /update/Brandon_WilliamsCraig → 303; 691 pipeline POSTs, 758 statements, db wall 1,054 ms (557 ms SQLite)

The ladder's composition (shapes by count): `SELECT * FROM cards WHERE id = ?`
×259, `SELECT codename FROM cards WHERE id = ?` ×92, junction lookups
(left_id+right_id) ×55, `SELECT DISTINCT referer_id FROM card_references
WHERE ref_type='I'` ×41, key lookups ×35. The sequence shows the mechanism:
the save writes each of the Person card's subcards (+image, +bio,
+how_to_contact_me, +description, …) through an identical ~25-statement block
that re-reads the same constant ids (the parent row, codename rows, the
subcard row) — every statement its own one-statement pipeline POST. The READ
path already batches (the edit page: 102 statements in 12 POSTs via the live
ring store, `src/card/live/live-store-driver.ts`); the SAVE path does not.

What statement-count reduction alone can and cannot do (simulated against the
captured sequence, exact rules in the probe's report):

| rule                                        | wire stmts | projected live save (13 ms/hop) |
|---------------------------------------------|-----------|--------------------------------|
| today                                       | 758 (691 POSTs) | ~4.8-5.1 s (matches the live evidence) |
| per-table invalidation on any write          | 559       | ~3.9 s |
| + id-scoped invalidation, codename immutable | 512       | ~3.6 s |
| perfect memo (distinct (sql,args) floor)     | 401       | ~2.8 s — zero margin |

Conclusion: even a perfect transaction-scoped read memo cannot reliably bring
the live save under 3 s. The remaining lever is batching the save path's read
ladder the way the render path already batches (ring prefetch + local answer),
or a live-host transport improvement; both are deploy-scale work whose final
proof requires publishing to the production site — an operator decision, not a
session-sized engine change. The probe, the captured ladder, and the
simulations above are the working material for that decision.

## 3. Entry line 44 (E16 Save-without-close): the recorded fail was the instrument, repaired at 03e7db01; the check passes on this tree

The graded evidence (`native-whole-50717cca report.md:136`:
`{"boardStillOpen":1,"writeStatus":200,"storedAfterSave":false}`) was produced
by a check whose content-write threw on a visibility:hidden tinymce textarea
and silently saved the OLD content twice (two 200 POSTs storing "Harness save
before"). Commit `03e7db01` repaired the check (`checks-cover-b.mjs:1007-1048`:
write through the owning TinyMCE editor, fail the attempt when the content
never lands) and reproduced the old evidence pre-fix
(`tmp/e16-only-rerun-2026-10-17.log`). Ten consecutive full runs passed it
between 2026-10-17T19:05Z and 23:55Z.

This session's fresh run of the named check, on this tree:

    node tools/edge-signed-in-exercise.mjs --only cover-b --case E16 --out .runtime/edge-signed-in/2026-10-18T-e16-check-current-tree/report.md

Result: **PASS — `{"boardStillOpen":1,"writeStatus":200,"storedAfterSave":true}`**
(4/4 report rows PASS, zero FAIL; the process exit is 1 because a `--only`
selection always sets `coverageIncomplete` — `edge-signed-in-exercise.mjs:1227`
— not because a check failed). The engine's save-without-close stores what the
browser sends; there is no engine defect left to fix under this entry.

## 4. What changed in the tree for this work

- `tools/diagnose-owner-save-statement-ladder.mjs` — the save-ladder
  diagnostic (this session's instrument for section 2).
- This report. No engine source changed: the local leg's fix already exists
  (`1a7b8b34`), and the live leg's real fix is operator-scale (section 2).

## 5. Fresh instrument runs, this session

| run | command | result |
|-----|---------|--------|
| full whole-harness reproduction | `node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/2026-10-18T-prefix-timing-repro-53c86269/report.md` | 236/239; timing rows PASS |
| E16 check on this tree | `node tools/edge-signed-in-exercise.mjs --only cover-b --case E16 --out .runtime/edge-signed-in/2026-10-18T-e16-check-current-tree/report.md` | E16 PASS, `storedAfterSave:true` (4/4 rows) |
| save-ladder probe | `node tmp/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-diagnosis-prefix.json` | 691 POSTs / 758 stmts / 1,054 ms db wall |
