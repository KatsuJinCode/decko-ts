# W5/A6 witness corrections COMPLETE — corrected instruments, measured verdicts, one engine finding

**Lane:** the W5/A6 witness-correction lane (completing the MiniMax repair
lane's staged work)
**Date:** 2026-10-18
**Worktree:** `C:/localProjects/decko-ts-release-lead`, branch
`codex/release-lead-20261015`

**CORRECTION RECORD (2026-10-18T06:2xZ; the superseded text is kept below
unerased):** this report first recorded an ENGINE FINDING — the role
checkbox 0x0 and unclickable — from run 06-10-41 on source `65d0bbbe`.
A sibling lane landed `66d65078` minutes later: the SAME instrument with a
corrected PROTOCOL — the navbar dropdown is opened natively before the
click (plus verified sign-ins and a fixture-only session baseline). The
re-run on the landed tip (`f30a291e`, run 06-17-09, `dirty: false`) measures
**A6 4/4 PASS: the native click posts 200, the box flips, the
visitor-session content moves, the fresh request agrees with the cookie
(`freshRequestContentMatchesCookie: true`), and the restore is the same
checkbox clicked again natively**. The 0x0 measurement was an artifact of
driving the control with its menu CLOSED; the release-verification
worker's r5 receipt ("the native menu works") is confirmed. The finding
section below stands as the historical record of the closed-menu
measurement, annotated — the verdict-of-record is the tip run. **No engine
finding survives on A6. The honest final verdicts: W5 PASS (measured),
A6 PASS 4/4 (measured, 13/13 role-plus-right).**

**Inputs:** the instrument-correctness report
(`docs/reports/instrument-correctness-w5-a6-2026-10-18.md`, whose W5 point
was PREDICTED-FROM-CODE-TRACE (superseded) and whose A6 point was
disqualified per the release-verification worker), the release-verification
worker's A6 diagnosis (visitor-session chain + unchanged Role+members
grants + rendered value + fresh request; canonical db_content NOT
asserted), its grantMemberRole correction (the normal Role+members List
create API — not a synthetic malformed reference), and its W5
positive-fixture guidance (the installed `update_includers.feature`:
included PLUS FIELDS with proper follow_fields; actual mail delivery in
every positive assertion; the oracle negatives retained).

---

## 1. What was corrected

### A6 (`tools/edge-signed-in-exercise/checks-role-checkbox-and-plus-right-creation.mjs`)

The visitor-session witness chain the worker ordered is implemented and
measured end to end:

1. browser context cookie `decko_visit` (`page.context().cookies()`)
2. `readVisitorSession(cookieHeader)` — the engine's own published decoder,
   imported from `dist/src/card/session/visitor-session.js` (rebuilt by
   `ensureEngineDist` on every harness startup, so the decode is at parity
   with the serving engine)
3. `sessionCardContent(state, '<actor>+*enabled roles')` — the exact
   Session content, keyed by `DeckoName.parse(cardName).key`
4. the rendered checkbox state before/after, re-read after the autosave
   reload
5. a fresh request (`page.context().request.get`) whose session content is
   compared against the cookie's

Canonical `cards.db_content` is recorded as `notAsserted` in the check's
own evidence. The `<role>+*members` grant rows are reported alongside
(`storeGrantMemberships`, `grantCanonicalReferenceRows`) so a reader can
verify grants behave as the contract says.

The grant fixture goes through the NORMAL Role+members List create API the
worker ordered: the admin signs in first, then
`POST /update/<Role>+*members` with the member's name appended to the IdList
content; the grant is verified in the database by the CANONICAL reference
row the engine writes — measured: `{referee_id: <member>, referee_key:
null, ref_type: "L"}` — the exact IdList L-row shape the coordination
names, replacing the disqualified `ref_type=''` INSERT. The grant is
revoked at the end by posting the original content back, and the revoke is
verified against the same row (`grantRestored`).

Two storage facts the staged code had wrong, corrected against the schema
(`db/schema.sqlite.sql:167-174`) and the deck's storage conventions:

- the `+*members` list is a JUNCTION row with a NULL `name` column — the
  update URL is composed from the LEFT card's name (`<Role>+*members`);
- `card_references` has no `trash` column.

### W5 (`tools/edge-signed-in-exercise/checks-content-flows.mjs`)

Rebuilt on the oracle (`decko-ruby-reference/decko/features/update_includers.feature`):

- **Positives are included PLUS FIELDS.** The followed includer's content
  nests its own plus field (`{{+author_<stamp>}}`), and the plus card
  (`<includer>+author_<stamp>`) is edited — the oracle's "Watcher should be
  notified of updates to included plus card" scenario. The second positive
  host (`plusHost` + `detail_<stamp>`) covers "a followed card's plus card
  is edited" the same way.
- **Proper follow_fields.** The instrument reads the `*follow_fields` rule
  the indirect walk resolves (`followFieldsRuleContent`) and records it:
  this deck carries the `*all+*follow fields` default with content
  `*nests` (measured row id 22730), so no per-card rule was needed; the
  instrument writes `<host>+*self+*follow fields = *nests` only if the
  default were absent.
- **Actual mail delivery in every positive assertion.** Each positive leg
  drains the owned mail capture, edits, settles, and grades
  `delivered > 0 && namesTheCard` on the mail that arrived during that leg
  alone. The rendered SELF-slot and the `card_references` `ref_type='I'`
  rows are recorded as evidence only — no positive rests on them.
- **The oracle negatives are asserted silent:**
  `includedNotPlussed` (a standalone card nested via `{{...}}` inside the
  FOLLOWED includer — included but not plussed) and `plussedNotIncluded`
  (a plus card of the includer nested nowhere). Both edits must deliver
  zero mail, and both do.

## 2. The measured verdicts (clean committed sources, custody-gated)

### W5 — PASS (measured, not predicted)

Run record: `.runtime/edge-signed-in/2026-10-18T05-54-40-986Z-32448`
(`--only content-flows`, provenance source `5db16a46`, `dirty: false`,
**11 / 11 checks passed**). The W5 leg evidence:

| leg | status | delivered | names the card | oracle shape |
| --- | ------ | --------- | -------------- | ------------ |
| direct | 303 | 1 | yes — `"Harness Admin updated \"Harness_CF_Followed_mvdev4e0\""` | positive |
| nestedPlus (included plus field of the followed includer) | 303 | 1 | yes — names `Harness_CF_Includer_mvdev4e0+author_mvdev4e0` | positive |
| plus (included plus field of the followed plus host) | 303 | 1 | yes — names `Harness_CF_Plus_Host_mvdev4e0+detail_mvdev4e0` | positive |
| includedNotPlussed | 303 | **0** | — | negative: silent |
| plussedNotIncluded | 303 | **0** | — | negative: silent |

Follow rules all `*always`; `*all+*follow fields` = `*nests` (id 22730);
all three inclusion rows stored with `ref_type: 'I'`; the `follower
notification email` template row present.

**The negatives are what retire the old witness decisively:** the silent
`nestedStandalone` card carries the SAME kind of `ref_type='I'` inclusion
row on the followed includer as the mailed plus fields do (all three rows
measured). A rendered-slot / ref-type-I witness cannot distinguish the
mailed case from the silent case — only the plus ancestry plus
`*follow_fields` chain can. The prior PREDICTED-FROM-CODE-TRACE pass is now
superseded by a measured pass on a witness that actually separates the
oracle's positive and negative scenarios.

### A6 — verdict-of-record: PASS 4/4 on the landed tip (13/13 role-plus-right)

**Tip run (verdict-of-record):** `.runtime/edge-signed-in/2026-10-18T06-17-09-979Z-49564`
(`--only role-plus-right`, provenance source `f30a291e`, `dirty: false`,
**13 / 13 checks passed**, C20 6/6 included). Protocol per the sibling
lane's `66d65078`: verified sign-ins (stored-session actor id checked
against the fixture), the grant POST carried by the runner's own
admin-authority context, the navbar dropdown opened NATIVELY before the
click, and a fixture-only session baseline (one requestSubmit so the held
roles start explicit — recorded as `sessionBaselineSetup`, explicitly not
click acceptance).

| sub-check | verdict | measured evidence (tip run) |
| --------- | ------- | --------------------------- |
| A6[0] boxes are served | **PASS** | the inline `:edit_inline` form renders with role boxes; the fixture grant verified via the canonical row `{referee_key: null, ref_type: "L"}` (grantVerified true) |
| A6[1] the click writes the visitor session | **PASS** | native click (menu open) → POST 200; the box flipped checked→unchecked (`checkedImmediatelyAfterClick: false`, `renderedFlipped: true`); the visitor-session content MOVED; the fresh request agrees with the cookie (`freshRequestContentMatchesCookie: true`) |
| A6[2] the form's own submit posts the same edit | **PASS** | submit path answered 200 (the click had already posted; the fallback measured anyway) |
| A6[3] the fixture is restored | **PASS** | `restoreRoute: "the same checkbox, clicked again (natively through the inline form's autosave)"`; `restoredToBefore: true`; `grantRestored: true` (members list back to pre-test content, canonical row gone) |

The full witness chain the worker ordered is what A6[1]'s PASS rests on:
browser `decko_visit` cookie → `readVisitorSession` →
`sessionCardContent(state, '<actor>+*enabled roles')` → the rendered
checkbox state → a fresh request — all five agree on the new content.

**Historical: the closed-menu run (superseded as a verdict, kept as
measured)** — `.runtime/edge-signed-in/2026-10-18T06-10-41-859Z-50520`
(source `65d0bbbe`, 12/13) recorded A6[1] FAIL with `boxMetrics: {width: 0,
height: 0}`, `changeEventsFired: 0`, `clickWindowRequests: []`. That run
drove the control WITHOUT opening the navbar dropdown; on this deck the
role boxes only become a usable hit target inside the opened menu. This
was an instrument-protocol artifact, not an engine defect — the same class
of locator error the worker's 099b0b65 retraction described, reintroduced
from the opposite side and caught by the sibling lane's protocol fix.
(The static observations from that run remain true of the closed-menu
render: the input has no intrinsic size, and the bundle carries no
compiled `.on("change"` binding — the served JS submits the form through
some other path once the menu is open. Neither is a finding; the measured
native round trip is the behavior of record.)

## 3. No engine finding survives (corrected)

The finding this report first claimed — "the role-checkbox click affordance
is dead as served (0x0 input, no compiled change-handler)" — is RETRACTED
as a verdict: it was measured on a page whose navbar dropdown was never
opened. With the menu opened natively (the protocol `66d65078` landed, and
the protocol the worker's r5 receipt always described), the served control
round-trips end to end: click → POST 200 → checkbox flips →
visitor-session content moves → fresh request agrees → re-click restores.
The server-side contract AND the click affordance both work as served.
The release-verification worker's r5 receipt is confirmed by this lane's
own tip-run measurement, and A6 closes as a measured PASS with no engine
finding.

## 4. Commits (this lane's files only; other lanes' in-flight files untouched)

| commit | what |
| ------ | ---- |
| `d7203f19` | the witness corrections: A6 visitor-session chain + normal List-create grant + direction-aware predicate; W5 included-plus-fields fixtures, mail in every positive, oracle negatives |
| `7c109da5` | the `+*members` junction's NULL name column — URL composed from the left card |
| `462db60b` | `card_references` has no `trash` column — predicates dropped |
| `3a7cc9d6` | click-window diagnostic (change counter, box metrics, request ledger); restore fallback |
| `5dd08c28` | session restore via the exact endpoint the form posts, route disclosed |
| `5db16a46` | W5 inclusion-row evidence resolves ids through fixtureCard (NULL-name junctions) |
| `05e0a4d1` | raw captures survive mid-navigation pages; restore POST mirrors the form's fields |
| `65d0bbbe` | grant verification reads the canonical IdList L row; restore-route label reads `APIResponse.status()` |

The sibling modifications that were in flight during this lane
(`src/card/notify/follower-resolver.ts` + its test, the error-page files)
belonged to other lanes and were never staged by this lane; the follower
work landed on its own line as `8a37f6b9`, the error-page fix as
`45354a3a`.

## 5. Honest-verdict summary (final, on the landed tip)

- **W5: PASS, measured** — mail delivered and naming the changed card on
  all three positive legs; both oracle negatives silent; the witness now
  separates the oracle's positive and negative shapes (the old
  rendered-slot witness could not — the silent `nestedStandalone` carries
  the same ref_type='I' inclusion row the mailed plus fields carry).
- **A6: PASS 4/4, measured** on the landed tip (`f30a291e` with the
  sibling lane's `66d65078` protocol fix): the native click posts and the
  full visitor-session witness chain agrees; the grant fixture rides the
  normal Role+members List create API and is verified by the canonical
  IdList L row (`referee_key: null, ref_type: "L"`); fixture hygiene is
  restored natively (re-click) and the temporary grant is revoked and
  db-verified.
- **No engine finding.** The lane's interim finding was an artifact of
  driving the control with its menu closed; it is retracted above with the
  two runs that bracket it, and the worker's r5 receipt is confirmed by
  this lane's own measurement.
- **No predication anywhere:** every verdict rests on actual mail, actual
  cookie content, or actual request-ledger lines — never on a rendered
  slot, and every superseded verdict is kept in the record with the run
  that measures it.
