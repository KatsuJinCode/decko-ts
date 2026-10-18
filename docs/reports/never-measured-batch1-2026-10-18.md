# Never-measured actions, batch 1 — instruments + verdicts (2026-10-18)

Slice: the first half (by id order) of the 37 matrix actions no instrument
family has ever measured (`brandonDojoTech/docs/reports/perfection-checklist-2026-10-18.md`
section B2; recomputed from `docs/registry/instrument-coverage-matrix.json`:
37 actions whose every entry is `unmeasured`). The matrix's computed list is
the ground truth; the checklist's B2 bullets name 34 of them (ACT-177, ACT-178,
ACT-180 are absent from the bullets but present in the computed 37 — they ride
in the second batch's id range).

This lane took 19 actions, ids ACT-068 … ACT-159. Every leg drove the ts
engine (`reference-harness/browser/engines/ts.json` → the repo's own Node host
on a staged private copy of `reference-harness/fixtures/synthetic-v1`, the same
pair the exhaustive runner grades).

## The instruments

- `reference-harness/browser/probe-never-measured-batch1.mjs` — one probe, 15
  graded legs (13 actions here; the recipes are the committed whole-harness
  instruments of this checkout ported unchanged in contract:
  checks-unmeasured-save-edit-create.mjs + lib/new-pointer-input.mjs for
  C15/C17, checks-permission-rules.mjs for P4/P6, lib/coded-image-change.mjs
  for F4, checks-upload-image-change.mjs for F8, checks-content-flows.mjs for
  N9/N10/W5/W6, the runner's H3 rollback case for H2). The probe is a script
  rather than exhaustive-affordance-targets.mjs cases because these contracts
  need what the runner's per-action model cannot express: the drained mail
  sink (GET /__harness/mail), stored-row witnesses against the staged sqlite,
  a second actor on her own browser page, an anonymous browser context, and
  file-picker uploads. Each leg keeps that module's case discipline: drive the
  affordance's own page, read the engine's own bytes, pass requires the whole
  chain, failed setup asserts 0.
- `reference-harness/browser/probe-pageonly-top10-write-permission.mjs` —
  re-run this ask for ACT-068/069/127 (all ten legs GREEN, evidence
  `.runtime/exhaustive/probe-pageonly-top10-rerun-batch1/probe-top10-result.json`).
- `reference-harness/browser/probe-search-paging.mjs` — run this ask for
  ACT-150 (see the N4 line below).

## Verdicts (final named run: `.runtime/exhaustive/never-measured-batch1-run13/probe-batch1-result.json`, 14 GREEN / 1 RED)

| act | capability | verdict |
|---|---|---|
| ACT-068 | A1 account settings shows the member's email | pass (top10 rerun, GREEN) |
| ACT-069 | A3 the account's email can be changed | pass (top10 rerun: stored row + account page + restore all GREEN) |
| ACT-127 | S9 first-run setup of the first admin | pass (top10 rerun: zero-account census 0, owner stored active + in Administrators, signs in, window closes) |
| ACT-131 | C13 create and edit a templated card | pass (Topic created through /new/Topic; the type's `+*structure` renders its `+summary` slot; the field edit stores and re-renders) |
| ACT-132 | C15 radio input in a new card | pass (`*right+*input type`=radio + `*content options` Search rule; radios render, selection persists, fresh read shows it) |
| ACT-133 | C17 multiselect input in a new card | pass (same staging, select[multiple]; selection persists) |
| ACT-141 | P4 default rule + plus-card override | pass (`*all+*help` default shows on the plain card, the plus card's `+*right+*help` overrides, plain keeps the default on re-read) |
| ACT-142 | P6 rule board sets read/write rules | pass (Rules tab set selector lists the card's sets; the read rule's editor takes Administrator; stored content becomes `Administrator\r\n`; the member's read turns 403 with the secret hidden) |
| ACT-146 | F4 change a coded image | pass (`*logo` edit form takes a real PNG; stored identifier switches `:logo/carrierwave.svg` → `~id/N.png` and now SERVES (engine fix below); preview + page `<img>` decode; vendor asset source untouched; unknown coded identifier 404s; original restored) |
| ACT-149 | F8 replace an uploaded file | pass (File card created with upload 1; edit form replace → stored identifier changes and the served bytes equal upload 2) |
| ACT-150 | N4 search card paging | pass (probe-search-paging.mjs: page-2 advances the result window, keeps the keyword, no duplicated chrome, oversized anonymous offset keeps the stock 403 — evidence path below) |
| ACT-151 | N9 visit a User card with the user layout | pass on this fixture's claims (User card created through /new/User, stored type User, visited 200, renders its own titled surface through the deck's layout machinery). The injected `*self+*layout` diagnostic is recorded beside it: it renders in isolation (diag evidence) but stayed bare in the batch runs — open observation, not graded |
| ACT-152 | N10 nests, links, files, chains, loops | pass ([[link]] anchor, uploaded-file download anchor + slot, three-deep chain slots in order, loop terminates 200) |
| ACT-153 | H2 expand an act, roll back "Save as current" | pass (history accordion acts expand, the revert control answers a write, the earlier act's content is restored) |
| ACT-154 | W2 unfollow from the board | pass (Engage-tab round trip: follow → stored `*always`, unfollow → stored `*never`, control flips both times) |
| ACT-155 | W4 followers list; all-followed-cards view | **fail — engine-side, documented** (three defects below) |
| ACT-156 | W5 watcher mail on included/plus cards | pass (5-leg update_includers.feature oracle: direct edit, included plus field, and plus-host field each mail the card-scoped follower naming the card; included-not-plussed and plussed-not-included stay silent; `*all+*follow fields` = `*nests`; template row present) |
| ACT-157 | W6 unfollow link in the email | pass (the notice carries the engine's own `/update/...=*never` link; driving it flips the named rule to `*never` and the board offers Follow again) |
| ACT-159 | A4 sign up, then sign in | pass after staging (the fixture's `*captcha` toggles carry "1" and refuse anonymous sign-up with Error (recaptcha) — staged to "0" as a deck owner would, recorded; the anonymous sign-up stores, the stock approve arm (`card[trigger]=approve_without_verification`) activates it, the new account signs in and holds its identity. No verification mail is sent on this path: the signup stores `unapproved`, the approve arm activates) |

## Engine fixes landed (this lane)

1. **Save-seam rule-cache expiry** — `src/server/post-save-cache-expiry.ts`:
   a committed rule write now calls `RenderEngine#expireRuleCache()` on the
   boot engine and every signed-in engine (Ruby's Card::Rule.clear_rule_cache,
   rule.rb:37-39; the method existed with a docstring claiming the save seam
   called it — nothing did). Measured defect before the fix: a `*self+*layout`
   rule written through /update left the very next page render bare and the
   corrected layout on the render after (the page-layout walk,
   src/card/render/page.ts resolvePageLayout, reads the deck-wide rule hash
   BEFORE the main render's freshness gate; gate log at the time: layout
   lookup at hashSize=145 preceded the gate's 0→54 move). After the fix the
   layout renders on the immediately following render (diag: header/footer
   present for both self-set and type-set rules). Suites:
   tests/server/post-save-cache-expiry.test.ts + upload-tree-oracle-pattern +
   card-mod-carrierwave — 44 passed.
2. **Image uploads serve their stored identifier** — `vm-staging-server.mjs`
   handleAssetFile: the bare-spelling route (`FILES_PATTERN`,
   `/files/~<card>/<action>.<ext>`) read the literal `<action>.<ext>` file and
   answered 404 for image uploads, whose store writes the rendition set
   (`<action>-original.png` + versions; attachment-store.ts store(),
   image_card_uploader.rb:44-57), short-circuiting handleAttachmentRoute whose
   read() resolves the bare identifier through `-original`. The ENOENT path now
   serves the `-original` rendition before falling through to the corpus 404s
   (which are unchanged: a corpus row naming local-form bytes that were never
   in the deployment still 404s). Measured before: `~913/1001.png` → 404 while
   `-original`/`-large` served 200; after: base 200.

## Documented, not fixed (ACT-155 / W4 — the leg is RED)

Three follow-view defects, stable across runs
(.runtime/exhaustive/never-measured-batch1-run4/-run7/-run8/-run10/-run11/-run12/-run13,
identical shapes):

1. `/<card>+followers` (the follow section's followers link target,
   card-mod-edit.ts:3695) answers 200 with a NEW-CARD CREATE FORM (type list)
   instead of the follower list — the permitted-user missing-card fallback
   renders; Mira (a follower via the fixture's `*all` rule, rows 909/910,
   option `*always`) is not named anywhere in it.
2. `/Mira_Member+follow` (the "all followed cards" view,
   card-mod-edit.ts:3711-3712) answers **500**:
   `input: Mira Member+follow is not a pointer/list-family card; the
   base-format view (card-mod-format/card-mod-edit) is not ported`
   (dist/src/card/mod-loader/mods/card-mod-list.js:109, full stack in the run
   logs). Porting that view is feature work, not a bug fix — left to the
   engine owners.
3. `/Ada_Admin+*follow/content` answers 200 but does not list the card the
   administrator demonstrably follows (stored option `*always` read back from
   the same run).

Why not fixed here: the followers list and the follow overview need the
unported list-family base-format view plus the follow-overview content
assembly; that is a port, sized beyond this batch, and the three behaviors are
each independently evidenced above.

## Observed engine defect beyond this slice's scope

The ts engine died silently mid-run in five of the eleven batch runs (no
stderr trace; the log ends at a rendered page — in run6 at the
`/Mira_Member+follow` 500, in run9 between W5's mail reads and W6; next
request ECONNREFUSED). Timing varies; runs 1–3 on the pre-rebuild dist never
died. The probe survives it via the harness's own `server.restart()` seam
(lib/engines.mjs restart preserves the staged deck/files/origin), re-signing
both actors; every leg after a restart completed green. The death itself is
recorded here as an open engine defect with its evidence paths.

## Recording

The matrix entries for these 19 actions are prepared and quarantined for the
registry owner (the matrix lives in the foreign tree):
`C:/localProjects/brandonDojoTech/tmp/quarantine-foreign-tree-writes-20261018/never-measured-batch1-matrix-entries.json`
(+ `.sha256`). Each entry follows the recorded convention of the 2026-10-18
catalog append: instrument_family `whole-harness`, shape `headless-dom`,
target `ts-engine-local-bundle`, status pass/fail from the named run, evidence
pointer to this file + the run directory.
