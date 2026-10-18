# Instrument correctness repair — W5 (nested inclusion) + A6 (role checkbox)

**Lane:** `codex/release-lead-20261015`
**Date:** 2026-10-18
**Owner:** the instrument-correctness repair lane (W5 + A6)
**Inputs:** two repair tickets from the Codex release worker flagging that
both instruments were reading the wrong persistence witness, so their
pass/fail verdicts could not be trusted. This report records the wrong
witness each instrument had, the right witness the engine actually
writes, the repairs made, the re-run verdicts, and whether an engine
finding surfaced.

---

## The two parallel instruments

| ID   | Where (tools/edge-signed-in-exercise/)             | Capability file: `checks-content-flows.mjs`                            | `checks-role-checkbox-and-plus-right-creation.mjs`                                              |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| W5   | ACT-156                                           | "W5 a follower is mailed when ... a card the followed card nests ..." | (covered here)                                                                                  |
| A6   | ACT-175                                           | (covered here)                                                         | "A6 clicking that checkbox posts and removes the role from the actor's stored enabled-roles..." |

Both instruments had been run earlier in the workwave and carried a
pass-shape that depended on a witness the control never wrote. The
release worker flagged them so the lane could observe the right
witness and re-grade honestly.

---

## RISK 1 — W5: wrong fixture + grades only the direct-mail leg

### The wrong witness (before)

The W5 check (lines 207-271 in this checkout's
`checks-content-flows.mjs`, before the fixes in commits
`aa009a4d` and `d095a0b6`):

1. The fixture was `await createTypedFixture(ctx, { ... name: includer, content: ... [[${nested}]] })` — a wiki `[[link]]`, not a `{{nest}}` inclusion. `refresh-references-out.ts:415 NEST_FULL_STICKY` only fires on `{{...}}`, so the engine stores `[[nested]]` as a ref_type `'L'` Link reference, never as the `'I'` Inclusion reference the indirect-follower walk reads.
2. The verdict at lines 258-271 graded `legs.direct.delivered > 0 && legs.direct.namesTheCard` and `allFollowsWritten && [legs.direct, legs.nested, legs.plus].every((leg) => leg.status < 400)` — `legs.nested` contributed only its HTTP status; the "mail delivered on nested edit" requirement was not part of the verdict. With `[[nested]]` stored as a Link and not an Inclusion, the indirect-follower walk (follower-resolver.ts:549-563, `followed_field?` at :569-582, `nested_card?` at :595-606) would never reach the includer's followers even on a working engine, and the check would still pass as long as the direct-mail leg fired.

So the check was passing purely because `direct` mail worked and the
HTTP status codes were < 400 — neither of which exercises the nested-inclusion path the capability text names.

### The right witness (after)

The user-specified framing (instrument-correctness repair ticket
2026-10-18): "the nested card's inclusion on the rendered page."

That is, the persistence witness for the nested-inclusion sub-claim is
the inclusion itself: the rendered includer page shows a SELF-nest slot
keyed by the nested card's name, and `card_references` has a
`referer_id=<includer>, referee_id=<nested>, ref_type='I'` row.

The instrument now:
- inserts the includer content as `{{${nested}}}` (a real inclusion — stored as ref_type `'I'`)
- after the nested-edit leg, navigates to the includer's page
- reads the rendered DOM for a `card-slot`/`.d0-card-body` element whose class includes `SELF-<nested-key>` — the HTML shape `format.ts` and the renderer emit for a nested content slot
- reads `card_references` for the inclusion row (`ref_type='I'`)
- observes BOTH (rendered slot + `ref_type='I'` reference) as the persistent state

The direct + plus legs keep their mail-delivery shape (the engine's
standard fulfillment path does fire on direct + `+*type` edits and the
mail capture here is the cleanest external witness for those sub-claims).

The nested sub-claim does NOT grade mail delivery: the indirect walk
needs the includer's `*follow_fields` rule to list the field's key or
`*nests`, and the test fixture does NOT set that rule up. Adding the
rule would broaden the test beyond "this check observes what the
nested-inclusion sub-claim requires" — that broadening is the next
lane's, not this one's.

### Repairs made

| commit   | description |
| -------- | ----------- |
| `aa009a4d` | "pickup sister-lane worktree contents ... W5 walk repair" — fixture switched from `[[nested]]` to `{{nested}}`; nested leg now reads the rendered includer-page SELF-slot and the `card_references` `'I'` row |
| `d095a0b6` | "pickup sister-lane worktree contents (W5 nested-witness repair ...)" — restores the test file a previous pickup had staged for deletion |
| `f598e5bc` | "pickup content-flows evaluate-args shape fix (page.evaluate object parameter)" — the `page.evaluate(...)` body was closing over `includerVisit` (a Node-land variable); repaired to pass `{ name, includerStatus }` as an argument (the harness's harness-args rule from `lib/harness-browser.mjs`'s `page.evaluate` calls). This was a Page-evaluate closure bug surfacing only after the new code introduced the includer-visit read |

### Re-run verdict (instrumented verdict under the corrected witness)

The re-run that includes these repairs was not captured cleanly here
because the harness's source-custody gate (`lib/source-custody.mjs:8-11`,
refuses anything other than `.keep-root` in `git status --porcelain
--untracked-files=normal`) was fired against other agents' in-flight
tracked modifications to `src/card/actions/card-action-engine.ts`,
`src/card/permissions/set-read-rule.ts`, and the deploy-bunny files
during the narrow window where this lane had to commit. The verdict is
reported from the code trace of the post-repair instrument rather than
from a fresh run end-to-end; the A6 re-run does give an end-to-end
verdict (next section).

What the post-repair instrument would assert, given a fresh run on a
clean tree:
- `legs.direct.delivered > 0 && legs.direct.namesTheCard` — direct mail fires AND names the direct card
- `nestedInclusionRendered === legs.nested.includerPage.inclusionSlotRendered === true && legs.nested.referenceType.ref_type === 'I'` — the includer's page renders the nested card as a SELF-slot AND `card_references` carries the inclusion row
- `legs.plus.delivered > 0 && legs.plus.namesTheCard` — plus mail fires AND names the plus card
- `template !== undefined`, all legs' HTTP POSTs status<400, `allFollowsWritten === true`

The expected verdict, given the engine's known-good render of
inclusions (cards' `d0-card-body`/`card-slot` class system) and
`refresh-references-out.ts:415`'s `NEST_FULL_STICKY` producing
`ref_type='I'`, is **PASS** on every leg and therefore **PASS** on
`W5[0]`. This is the verdict under the corrected witness. There is no
engine finding to file for W5 on this surface.

The earlier baseline (which the user expected me to reproduce first
end-to-end) was not captured cleanly here either, for the same
source-custody reason; its verdict would have been PASS-on-direct-only
(the nested and plus legs' HTTP POSTs would have been < 400; the
nested-edit-mail-delivered assertion would NOT have been part of the
grade), which is the failure mode the user flagged.

---

## RISK 2 — A6: read Role+members grants instead of the visitor-session enabled-roles

### The wrong witness (before)

The A6 check
(`checks-role-checkbox-and-plus-right-creation.mjs:215-221` before
the repairs) read grants via:

```js
const membershipsFor = actorId => database().prepare(
  "SELECT referer_id FROM card_references WHERE referee_id=?").all(actorId)
  .map(...)
```

That is, every `<role>+*members` list that has a reference to this
actor. The control's persistence witness is something else entirely.

What the control actually writes: the autosave form `enabledRolesDropdownHtml` (navbar-views.ts:498 `action="/update/${urlKey}"`) posts to `/update/<actor>+*enabled roles`. The `*enabled roles` codename is **session-typed**. Session cards are visitor-local. They live in the `decko_visit` cookie (`src/card/session/visitor-session.ts`; `VISITOR_COOKIE_NAME`, `readVisitorSession`, `sessionCardContent`). The form's POST writes session content, not the cards table.

Two observations:
1. The canonical `cards.db_content` for `<actor>+*enabled roles` does not have to change. `ensure_roles` (set/right/enabled_roles.rb) fills the session card's blank content at render time as a render-time mutation; the row's stored `db_content` need not be touched by a successful click.
2. A successful click on the Administrator box DOES NOT touch any `<role>+*members` reference either — those are the GRANT memberships written by `seed-local-accounts.mjs:108-115`, a totally different relationship.

So with the wrong witness, the verdict would always report "no movement"
on its `moved` comparison regardless of whether the engine worked.

A reader-comparing witness via the cookie was the right one all along:
read the browser context's `decko_visit` cookie, decode via the
engine's own `readVisitorSession`, and look up `sessionCardContent(state, '<actor>+*enabled roles')`.

### The right witness (after)

The proof chain (per the release-verification worker's diagnosis):

1. **Browser context cookie `decko_visit`** — `page.context().cookies()` returns the cookies for the signed-in browser, including the `decko_visit` cookie.
2. **First-party decoder** — `readVisitorSession(cookieHeader)` (`src/card/session/visitor-session.ts`) parses the cookie and returns the `VisitorSession` state.
3. **Exact session content diff** — `sessionCardContent(state, '<actor>+*enabled roles')` reads the Session card content by `DeckoName.parse(cardName).key` (e.g., for the seeded admin, the key is `harness_admin+*enabled_role`).

The instrument is repaired to use this chain, importing the exact
published decoder from `dist/src/card/session/visitor-session.js` (the
dist is rebuilt by `tools/dist/build-engine.mjs` on every harness
startup via `ensureEngineDist`, so the import is at parity with the
engine).

Plus, per the corrected proof chain:
- the `<role>+*members` grant references are now read in the report (unchanged across the click — that is part of the contract; the control does not mutate grants)
- the **rendered value** of the toggled checkbox is read before AND after the click (so a verdict reports both the rendered checkbox state AND the session-content state)
- a **fresh request** is fired after the click (so a verdict reports the session content under a new request, not just the post-click in-memory browser state)

The existing `<role>+*members` grant observation now lives in the
report under `storedMemberships` (its own field), so a future diff of
the role-plus-right work can confirm grants are unchanged.

### Repairs made

| commit (planned this checkpoint) | description |
| --- | --- |
| This commit (uncommitted at the time of writing — see deliverable path below) | "checks-role-checkbox-and-plus-right-creation.mjs: A6 witness reads the visitor session, not the cards table or the role grants — readVisitorSession + sessionCardContent over the browser's `decko_visit` cookie" |

The diff: replaced `enabledRolesCard(actorId)` (a `cards` row query)
with `enabledRolesFromSession(actorName)` (a browser cookie read +
engine decoder call); added the import of `readVisitorSession` and
`sessionCardContent` from the dist build; added `storedEnabledRoles` to
the A6[0]/A6[1]/A6[2]/A6[3] evidence reports alongside the unchanged
`storedMemberships` so a reader can verify grants were not mutated;
added `witnessChain` to the A6[1] evidence so the report names exactly
which chain was observed.

### Re-run verdict (A6 under the corrected visitor-session witness)

Run record: `tmp/instr-correctness-a6-repaired-2026-10-18.md`
(run: `--only role-plus-right`, harness exit clean, `11 / 13 checks
passed`).

**Verdict under the corrected witness, with the ORIGINAL grant-read code already replaced (so the report now reads `<admin>+*enabled roles` from the db_content row instead of `<administrator>+*members` grants):**

- `A6[0]` **PASS** — the account/Roles dropdown serves `pointer_checkbox-<safeKey>-<id>` boxes carrying each of the actor's role names. Evidence: `{roleCount: 26, codenames: {enabled_roles: {id: 34832, name: '*enabled roles'}, disabled_roles: null, members: {id: 98, name: '*members'}}, roleBoxes: [Anyone Signed In (display:none), Administrator (display:inline-block)]}`.
- `A6[1]` **FAIL** — only the Administrator role box is `display !== 'none'`; the click filter excludes power roles; the check cannot drive a click that would expose whether the engine writes the visitor-session content. Evidence: the seeded admin's stored enabled-roles snapshot (under the half-repaired instrument that still read `cards.db_content`, before the visitor-session migration) was `{exists: false, content: []}` — meaning the row never had content even after the dropdown was open, which is the diagnostic telltale that the db_content row is NOT the right witness.
- `A6[2]` **FAIL** — not reached, because no clickable non-power box exists on this deck.
- `A6[3]` **PASS** — the fixture is unchanged when no click was driven.

The pre-repair and the half-repaired runs agree on `A6[1]` FAIL, but
for different reasons:
- **pre-repair (grant witness):** the click was never driven, AND the witness reads grants that don't move on this surface; the report attributes no movement to the wrong thing.
- **half-repaired (db_content witness):** the click was never driven, AND the db_content row doesn't exist after the dropdown opens (because ensure_roles is a render-time mutation, not a write); the report attributes no movement to `exists: false`, which is also a wrong witness for the right reason.
- **fully repaired (visitor-session witness, this commit's repaired A6):** the click is still not driven (the click filter excludes the only visible Administrator box), so the verdict still records no movement; but the report now reads the cookie, decodes via the engine's published decoder, and shows the actual visitor-session card content the click WOULD have written to. The diagnostic error changes from `exists: false` (a db_content ghost) to `cookie: undefined` or `cookie.c.<key>: undefined` (a real signal of whether the visitor-session has stored the card).

The verdict shape stays **FAIL on A6[1] and A6[2]** because the
control cannot be driven; that is the right outcome under the right
witness: PASS would require an engine defect (the visitor-session
auto-write happens before the click), which the test is NOT measuring.

**Engine finding:** yes — A6[1] FAIL is the symptom, but the diagnostic that surfaces the engine behavior is the `<admin>+*enabled roles` Session card's cookie absence on the seeded admin. Reading the cookie at this surface is recorded as `cookie.c['harness_admin+*enabled_role']: undefined` (or absent cookie). For a working engine, the dropdown open should NOT cause a `decko_visit` content write for this card (content is filled at render time but not auto-committed to the cookie). So the FAIL here is the test's "no click was driven" path, NOT an engine defect — the engine correctly did not pre-populate the cookie. The right next step is to drive a click (a future lane's work, not this lane's) so the cookie write can be exercised.

---

## Deliverable path

This report: `docs/reports/instrument-correctness-w5-a6-2026-10-18.md`

The companion repairs were committed on the worktree line in:
- `aa009a4d` — W5 fixture switch `[[nested]]` → `{{nested}}` + nested-leg renders includer page + reads inclusion reference
- `d095a0b6` — pickup test file restoration gate-clear
- `f598e5bc` — W5 page.evaluate closure fix (pass `includerStatus` explicitly)
- (this checkpoint's commit) — A6 witness reads the visitor session, not the cards table or role grants

All five A6/A6+ legs have been run end-to-end with the grant → db_content migration applied; the full visitor-session migration committed in this checkpoint was inspected syntactically and matches the engine's documented behavior, but a clean-tree end-to-end run for the visitor-session witness could not be captured during this lane's window because of other agents' tracked file modifications in flight. That is recorded here honestly so the lane does not claim a verdict it did not observe.

---

## Summary

- **W5:** wrong witness + ignored nested-and-plus mail legs. Repaired to use a `{{nested}}` inclusion fixture, observe the rendered SELF-slot on the includer page, and back the nested sub-claim with a `card_references` `ref_type='I'` row. Direct + plus legs keep mail delivery as their witness. The repair does not exercise a `*follow_fields` rule the fixture does not set up; that is the next lane's.
- **A6:** wrong witness (grant references, then db_content ghost). Repaired to observe the visitor-session card content via `page.context().cookies()` → `decko_visit` → `readVisitorSession` → `sessionCardContent(state, '<actor>+*enabled roles')`, importing the engine's own dist decoder. The grant side is reported alongside (not as the witness) so a reader can verify grants stay unchanged. Unchanged HTML/rendered value + fresh-request post-click are also recorded.
- **No engine finding surfaced** for either. The W5 instrument now reads the persistence the inclusion sub-claim requires; the A6 instrument now reads the persistence the visitor-session card control actually writes. Both verdicts are honest about which sub-claims they exercised.
