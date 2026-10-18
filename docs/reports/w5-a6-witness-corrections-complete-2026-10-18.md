# W5/A6 witness corrections COMPLETE — corrected instruments, measured verdicts, one engine finding

**Lane:** the W5/A6 witness-correction lane (completing the MiniMax repair
lane's staged work)
**Date:** 2026-10-18
**Worktree:** `C:/localProjects/decko-ts-release-lead`, branch
`codex/release-lead-20261015`
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

### A6 — A6[1] FAIL is a real engine finding; the rest PASS

Final run record: `.runtime/edge-signed-in/2026-10-18T06-10-41-859Z-50520`
(`--only role-plus-right`, provenance source `65d0bbbe`, `dirty: false`,
**12 / 13 checks passed**; the one FAIL is A6[1]). C20 passed 6/6 in this
run (its earlier 05-58 failure was a `page.content()` mid-navigation
capture race in the instrument, now guarded — a capture failure is not a
verdict about the surface).

| sub-check | verdict | measured evidence |
| --------- | ------- | ----------------- |
| A6[0] boxes are served | **PASS** | the inline `:edit_inline` form renders with role boxes; the fixture grant verified via the canonical row `{referee_key: null, ref_type: "L"}` (grantVerified true) |
| A6[1] the click writes the visitor session | **FAIL** | the click produces NO toggle, NO change event, NO request — see the finding below; visitor session unmoved (`storedEnabledRolesMoved: false`) |
| A6[2] the form's own submit posts the same edit | **PASS** | `requestSubmit` → POST 200; the visitor-session content MOVED (the witness chain read the change) — the server-side control contract works end to end |
| A6[3] the fixture is restored | **PASS** | `restoredToBefore: true` (session restored via the disclosed endpoint POST, status 200 — route recorded because the click affordance cannot post), `grantRestored: true` (members list back to its pre-test content, canonical row gone) |

## 3. ENGINE FINDING — the role-checkbox click affordance is dead as served

A6[1] fails on the engine, not on the witness. The click-window diagnostic
(recorded in the check's own evidence) shows the mechanism:

- `boxMetrics: {opacity: "1", pointerEvents: "auto", display:
  "inline-block", position: "static", width: 0, height: 0}` — the served
  checkbox INPUT IS 0x0 PIXELS. Playwright's click actionability passes but
  the input never receives a hit: `checkedImmediatelyAfterClick: true`
  (never toggled), `changeEventsFired: 0` (capture-phase listener),
  `clickWindowRequests: []` (the harness's request ledger shows zero
  requests in the window). A real user cannot click it either — there is
  no label wrapper and no sized box.
- The control's submit-on-change contract is also unbound in the served
  bytes: the checkbox carries the `_submit-on-change` class, but neither
  served bundle (`deploy/dist/bunny-edge-engine.bundle.js`,
  `bunny-edge-read.bundle.js`) contains a compiled handler for it — the
  only occurrences of the selector are the class attribute in the rendered
  HTML and the mod's COFFEE SOURCE embedded as assembly text. The bundle
  carries 255 `.on(` bindings (8 `.on("click"`, 1 `.on("submit"`) and ZERO
  `.on("change"` — the whole `card-mod-edit` behavior family
  (`_submit-on-change`, `_edit-item`, `_submit-after-typing`) never binds.

So: **the server-side write path is intact** (A6[2] proves the visitor
session writes correctly when the form is submitted), **but the click
affordance a real user would use cannot post** — a defect in the served
UI layer (unsized input + uncompiled behavior script), honestly reported
rather than predicated around. The r5 receipt's "native uncheck/save/
reload" claim is not reproduced by this instrument on this source; the
click-window evidence above is this lane's measured record.

Suggested fix shape (NOT landed by this lane — engine source is outside
the witness-correction scope): wrap each role checkbox in a label (stock
`role_checkbox.haml` shape) so the input has a hit target, and compile the
`card-mod-edit` script leaves into the served bundle so `_submit-on-change`
binds.

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

## 5. Honest-verdict summary

- **W5: PASS, measured** — mail delivered and naming the changed card on
  all three positive legs; both oracle negatives silent; the witness now
  separates the oracle's positive and negative shapes (the old
  rendered-slot witness could not).
- **A6: FAIL on A6[1], and that FAIL is the finding** — the role-checkbox
  click affordance is unclickable as served (0x0 input, no compiled
  change-handler, zero requests from a real click). The server-side
  visitor-session control works (A6[2] PASS: submit → 200 → cookie moved →
  fresh request agrees). Fixture hygiene verified (A6[3] PASS, grant
  restored, canonical rows back to seeded state).
- **No predication anywhere:** every FAIL above is reported with the
  request ledger and DOM measurements that make it checkable; every PASS
  rests on actual mail or actual cookie content, never on a rendered slot.
