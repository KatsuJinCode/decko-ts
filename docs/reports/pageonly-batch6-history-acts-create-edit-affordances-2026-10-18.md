# Page-only batch 6 — witnessed actions 51-60 of the value-ranked list (2026-10-18)

Lane: `reference-harness/browser/probe-pageonly-batch6-history-acts-create-edit-affordances.mjs`
Final receipt: `.runtime/exhaustive/probe-pageonly-batch6-final2/probe-batch6-result.json`
(preceded by the identical `-final` run: 9 GREEN / 1 RED twice consecutively)
Engine/fixture: `reference-harness/browser/engines/ts.json` on
`reference-harness/fixtures/synthetic-v1` — the engine and fixture the
2026-10-18 exhaustive re-grade used.

## Window derivation (ranks 51-60)

The taken ranks 1-50 are the union of the five committed probe files' ranked
lists (bc81fbb5 / 5bdda29f / cacce253 / 93771deb / 7deabd7e; batches 4 and 5
double-record ACT-184/186/188/189, so the union is 41 distinct ids of the 101
page-only actions in `.runtime/exhaustive/2026-10-18-regrade/run-meta.json`).
Subtracting them leaves 60 unseen ids; subtracting the skips the committed
lanes recorded on direct reads leaves exactly THIRTEEN ids with no committed
instrument: ACT-038, ACT-054, ACT-070, ACT-071, ACT-072, ACT-073, ACT-074,
ACT-076, ACT-079, ACT-080, ACT-081, ACT-082, ACT-083.

Ranks 51-60 (this lane) take the first ten in the actions file's own surface
order; **ranks 61-63 (ACT-081/082/083, E10/E12/E23) remain for the next
lane.** The two history ids lead because their nearest committed instrument
cannot see their contract at all: `tools/edge-signed-in-exercise/checks-cover-b.mjs:1110-1116`
(the H1 leg) requires only `status === 200 && /act|change|edit|history/i.test(html)`
over the whole page html — a navbar word passes it — while ACT-054's contract is
precisely "the history page lists the card's acts (not just a 200)". No
committed instrument counts a card's acts.

## True state per action (final run)

| rank | action | state | evidence |
|---|---|---|---|
| 51 | ACT-038 a card's history view renders | **works** | two real acts seeded (create + a real edit through the card's own edit form, POST `/update/…` 200); `/Harness_B6_Hist_*/history` answered 200 with `.card-slot.history-view ALL TYPE-rich_text` and 2 accordion items. The card page itself offered NO history link (`viaLink: null`) — the direct walk is the route that renders. |
| 52 | ACT-054 the history page lists the card's acts, not just a 200 | **works** | 2 act entries with DISTINCT act ids `105617` (#2 Ada Admin 29 days ago edit, newest first) and `105615` (#1 Ada Admin add_circle), each with an expand button; expanding the newest shows an action list (`hasActionList: true`) |
| 53 | ACT-070 C8 duplicate-name create refused | **works** | typed "Home" into the real /new/RichText form, submitted: POST `/card/create` → **422**, error panel in the page text, Home's id+content byte-identical before/after |
| 54 | ACT-071 C10 /new URL content preset stored | **works** | editor held `<p>B6 preset marker …</p>` before submit; POST 200; stored `db_content` carries the marker; fresh card page shows it |
| 55 | ACT-072 C16 checkbox pointer input stored | **works** | edit modal offered 2 checkboxes (`pointer_checkbox-…` values `Harness_B6_Pick_One` / `Harness_B6_Pick_Two`); checked Pick_Two, POST 200, the pointer JUNCTION's stored content is `Harness_B6_Pick_Two`, fresh page shows it |
| 56 | ACT-073 C18 select pointer input stored | **works** | same right with `*input type` flipped to select: the edit form offered a `<select>` with both option cards; chose Pick_One, POST 200, junction content `Harness_B6_Pick_One`, fresh page shows it |
| 57 | ACT-074 C12 structured card's new form offers subcards | **works** | staged `…+*type+*structure` = `{{+director}} {{+lead}}`; `/new/…` renders BOTH (`form-group card-editor RIGHT-director +director`) |
| 58 | ACT-076 E17 rename updates the origin slot | **works** | board's name-row edit link → rename form → POST 200; board text then carries the new name; DB shows old row gone, renamed row live |
| 59 | ACT-079 E6 link button inserts a rendering reference | **broken+fixed (engine-side)** | before: the Apply button carried no `data-tinymce-id` (`wireId: null`) and the editor content stayed at the seed after Apply+Save (runs 1-2). After the fix: wire binds to the owning editor (`wireId === editorId`), Apply inserts `[[Home\|B6 home link …]]`, POST 200 stores it, and the fresh page renders one link whose href resolves to `/Home` |
| 60 | ACT-080 E8 nest image editor inserts a nest with view+size | **broken+open (residual is the picker's card name, not the insert)** | the wire half is FIXED by this lane's change (Apply binds; `{{ image01 \| view: titled; size: small }}` is inserted, stored and persisted). The RED is the image-picker sub-clause: on this fixture the picker offers ONE option, the engine's phantom `image01` (a card that does not exist: `SELECT COUNT(*) FROM cards WHERE name='image01'` = 0), so no real image can be selected and the fresh page renders zero images |

## Engine-side break found and fixed

**Mechanism.** `reference_editor.rb:18-24`'s `apply_tm_snippet_data` binds the
Apply button to the TinyMCE instance that opened the dialog through the
REQUEST's `tinymce_id`; the port's editor views emit
`data-tinymce-id` from `RenderEngineLike#requestEditorParams`
(`src/card/mod-loader/mods/card-mod-tinymce_editor.ts:663` — the attribute is
DROPPED when the request carried no `tinymce_id`), which
`src/card/render.ts:1342` assigns per render pass from `params.editorParams`.

The Bunny edge entry threads those query keys
(`src/server/worker-shared-surface.ts:164-198`, `EDITOR_PARAM_KEYS` — its own
comment records that the edge twin carried the mapping first). **The LOCAL
serving host never did**: `vm-staging-server.mjs` built `renderParams` only on
the new-card route, so every locally served `modal_link_editor` /
`modal_nest_image` chrome dropped the wire and the client's Apply could not
bind its editor. That is why the 10:19:23Z edge full run (c9d7d2ea) had E6/E8
GREEN with `wire.expected === wire.actual` while the graded local engine broke
both.

**Fix** (`vm-staging-server.mjs`): `editorWireParamsFromQuery()` reads
`tinymce_id` / `tm_snippet_raw` / `tm_snippet_start` from the request, and the
single-segment, multi-segment and new-card render calls pass them as
`editorParams`.

**Proof run this lane, signed in, in-browser fetch of the dialog views:**
before — `realCardLink`/`realCardImage` 200 with the Apply button
`<button name="button" type="submit" data-bs-dismiss="modal" class="_link-apply …">`
(no `data-tinymce-id`); after — the same buttons carry
`data-tinymce-id="diag-editor-1"`. Probe runs 3+ show ACT-079 GREEN end to end.

**Absent-params arm unchanged**: no `tinymce_id` in the query ⇒
`editorParams` is not added ⇒ `requestEditorParams` stays undefined ⇒ the
attribute is dropped exactly as before.

## ACT-080 residual, with its mechanism

The nest-image picker's select2 search is issued relative to the current page's
card name, which the upstream client script resolves in `cardFromEditor`:

- `vendor/edge-script-source-snapshot.js:57` —
  `($(editor).attr('data-card-id') and "~#{$(editor).attr('card-id')}") or
  $(editor).attr('data-card-link-name')`
- the served formgroup carries `data-card-id` (and `data-card-link-name`), NOT a
  bare `card-id` attribute — `src/card/mod-loader/mods/card-mod-edit.ts:919-922`
  (the port of `formgroup_div_args`), which is also what Ruby renders.

So the guard's FIRST operand is truthy and the interpolation reads the absent
`card-id` attribute: every dialog request lands on `/~undefined`. Measured in
the final receipt: `dialogRequests[0] = "…/~undefined?view=modal_link_editor&&tm_snippet_start=0&tinymce_id=…"`.

That is harmless for the dialog chrome (the views render on any card — which is
why this lane's wire fix makes Apply work) but fatal for the picker's search:
`/~undefined?view=image_complete&term=logo` answers a full HTML absent-card page
(23,845 bytes, never JSON), so select2 gets no options and the only choice left
is the server-rendered phantom `image01`.

Why this is NOT fixed here, stated plainly: the two candidate repairs are (a)
emitting a bare `card-id` attribute on the port's card-editor div, a deliberate
deviation from the Ruby-documented `formgroup_div_args` bytes, or (b) editing
the vendored upstream script snapshot, which carries a pinned
`vendor/decko-coded-attachments/provenance.json`. Either is an engine-wide
change with a blast radius far past this window, both need a rebuilt `dist`
(another lane's build was in flight throughout), and neither can be proven
against the edge twin from here. The finding is recorded with its evidence
instead, and no leg was weakened to accommodate it.

## Probe-instrument defects found and corrected (each with the run that exposed it)

1. C16/C18 staging wrote the rule at `<right>+<setting>`; the rule belongs at
   `<right>+*right+<setting>` (the shape `checks-cover-b.mjs`
   `buildPointerInput` uses) — run 1 offered zero checkboxes.
2. The E17 leg read the board through a `visit()` helper that returns only
   `{status,url}`, not html — run 1 graded its own missing read-back RED while
   the DB already proved the rename landed; the leg now reads the live board
   text.
3. Junction rows carry a NULL `name` column, so a name lookup can never read a
   stored pointer's content — the pointer legs now resolve the row by its
   left/right ids (`api.junctionContent`).
4. The pointer edit affordance is a JS handler: a synthesized actionability
   click is swallowed and no modal opens (run 6 evidence: the page carried only
   the navbar's `new_card` form). The legs now dispatch the event, as the
   ACT-079/ACT-080 legs already did, and record the located form's identity.

## Foreign-writes quarantine

`brandonDojoTech tmp/quarantine-foreign-tree-writes-20261018/pageonly-batch6-foreign-writes.json`
+ `.sha256`: recorded with sha256 (13 entries at the time of record — 2 modified
engine sources copied, 11 untracked foreign test files/dirs hashed; refreshed
at commit time). Nothing foreign was touched, staged, or committed by this
lane; only `vm-staging-server.mjs`, the new probe and this report are in it.

## Not run this lane

The regrade's 241-check full suite was NOT run (the ask names the ten witnessed
affordances, and the suite was not requested); the only checks run are the
probe's own legs, `node --check` on both edited files, and the in-browser
dialog-wire fetches quoted above.