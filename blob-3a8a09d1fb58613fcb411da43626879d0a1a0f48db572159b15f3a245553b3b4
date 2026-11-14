# Row mx-155 - the two named follow-view gaps: the followers view content and the follow-overview assembly

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT). Instrument-coverage-matrix action 154
(ACT-155), capability id W4: "Followers list and 'all followed cards' view".

This is tranche 3 of the family (branch
`port/matrix-journey-tranche-20261020`, base tip `48d1e0dc`). Tranche 2
closed the list-family base-format input view and left two causes named
(`docs/reports/row-mx-155-follow-views-base-format-input-chain-2026-10-21.md`,
the "What is still open" list, items 1 and 2). This tranche closes both:

1. **THE FOLLOWERS VIEW** - `/<card>+*followers` now renders the follower
   NAMES through the LIST core, the way Ruby renders it.
2. **THE FOLLOW-OVERVIEW ASSEMBLY** - `/<User>+*follow` now renders the
   follow/ignore tabs ASSEMBLED from the user's held follow preferences,
   and the member's own view is her editor (200), not the 403
   create-denial.

## What the surfaces measured, before and after

The instrument is the tranche's own diagnostic
(`tmp/diagnose-follow-views.mjs`: boots the ts engine over
`reference-harness/fixtures/synthetic-v1` - the ACT-155 probe's own
fixture - signs in as its two actors, reads the surfaces). Full responses
in `docs/reports/receipts/row-mx-155-follow-view-gaps-2026-10-21.json`;
the runs live under `.runtime/matrix-journey-tranche3-20261021/`.

| surface | before (tip 48d1e0dc) | after |
|---|---|---|
| `/Report_Index+*followers` (the real fixture card, admin) | (not readable: the tranche-2 diagnostic used the nonexistent-card spelling) | **200**, the LIST core's pointer-list wrapper carrying "Mira Member" |
| `/Report+Index+*followers` (the nonexistent left's junction) | 200, the unknown-card create form | **200**, the virtual card's EMPTY pointer list (Ruby's left-nil arm) |
| `/<Admin>+*follow/content` | 200, the create form (the follow editor shell, no rows) | **200**, the tabs + the empty walk's "no entries" row |
| `/<Member>+*follow/content` | **403** (the create-denial for her own set) | **200**, the tabs + her held-rule row (check button + "everything" link) |
| `/<Member>+follow` | 200, the tabs + her row (rode an accidental seat) | **200**, the tabs + her row (seated explicitly) |
| `/<Admin>+follow` | 200, the tabs + "no entries" | **200**, unchanged |

The member's row bytes after
(`.runtime/matrix-journey-tranche3-20261021/follow-views-after4/member-follow-list.html`):
the `follow_item-view` slot for card 910 (`*all+Mira Member+*follow`), the
condition/drop_item hidden fields carrying `*always`, the remove button
(`btn-item-delete` + the check icon), and the link
`<a class="known-card" href="/*all+by_name">everything</a>` - the rule
set's follow label (the *all set's short label, card-1.110.0
mod/core/set_pattern/01_all.rb:4-6).

## The Ruby source, and what the port was missing

Both gaps share one mechanism the port did not model: **the set modules
that override `virtual?`**.

card-1.110.0 mod/core/set/all/states.rb:44-50 defines `virtual?` (the
structure-rule arm the port models in `src/card/fetch/virtual-cards.ts`),
and :60-62 defines `known?` = `real? || virtual?`. Two follow-mod set
modules OVERRIDE the method (`def virtual?; new?; end`), so their cards
are KNOWN with NO database row:

- `card-mod-follow-0.20.0/set/right/followers.rb:22-24` - the
  `<card>+*followers` junction;
- `card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:9-11` - the
  `<User>+*follow` dashboard.

An absent card the fetch answers as UNKNOWN takes the unknown-card arm
(card-mod-format set/all/html/error.rb:81-86 `page_view_for_unknown`:
`ok?(:create) ? :new : super`) - the create form an admin may save, the
403 denial a member cannot. That is exactly what both surfaces rendered
before: the followers page was the create form (the tranche-2 diagnostic
read the nonexistent-card spelling `/Report+Index+followers`, whose
create form looked like "the followers view renders the card's title and
nothing else"), and the member's own `+*follow/content` answered 403 with
"You need permission to create this."

On top of the known-ness, each card's CONTENT was unported:

- the followers junction's content (right/followers.rb:16-22):
  `def content; left ? item_names.to_pointer_content : ""; end` with
  `item_names` = `left.follow_set_card.prototype.follower_names` - the
  follower names (follower_ids.rb:53-55 `follower_names` =
  `followers.map(&:name)`; :63-72 `follower_ids` = direct +
  indirect field followers over each containing set's *follow
  preferences, rule.rb:47-51). The port's `:core` was a passthrough to
  the BASE core over the junction's stored content - a junction has
  none.
- the dashboard's assembly (type_plus_right/user/follow.rb:15-19
  `item_names` = `Card::Rule.preference_names user.name, "follow"`,
  rule.rb:39-45; :39-43 `view :core` = the follow/ignore tabs;
  follow_editor_helper.rb:7-11 the rows walk). The port had all the
  pieces (the seam's `followEditorRows`, the tabs view) but the pieces
  only ran when the REQUESTED view was a seam view - and for the
  row-less dashboard the requested view was the create-form
  substitution, so the assembly never ran; and when it did run, the
  rows' RULE CARDS were never seated into the render map, so the sync
  row renderer answered "no entries".

## The change

- `src/card/render/virtual-card-registry.ts` (new): the registry of set
  modules that override `virtual?`, keyed by set path and matched through
  `cardBelongsToSet` (content-overrides.ts - the codename-based set
  membership the ACT-155 membership pin landed). `known?` for a row-less
  card = membership in a registered virtual set.
- `src/card/mod-loader/mod-manifest.ts` + `src/card/mod-loader.ts`: the
  `virtual` flag (registered per set file during the SetLoader phase,
  cleared on reset) and the `contentKeepsType` flag (a `def content` file
  that declares no `assign_type` keeps the card's type, so the cardtype's
  own core view still dispatches over the overridden raw - the
  `supersedesType: false` arm content-overrides.ts already models for the
  built-in entries). `default-mod-deck.ts` binds the registry process-wide
  at deck boot (the same seam the content-override registry binds).
- `src/card/mod-loader/mods/card-mod-follow.ts`: the two `virtual: true`
  declarations; the followers' `def content` override
  (`followersContentFn` - the names joined through `toPointerContent`,
  array.rb:4-12) with `contentKeepsType: true` (right/followers.rb
  declares only `def content`).
- `src/card/follow/follow-render-seam.ts`: the seam answers the
  follower NAMES (`followerNames` on the bundle - the walk is
  `resolveFollowers`, the same one the follow section's count uses) and
  exposes the set-membership helpers (`isFollowersJunction`,
  `isUserFollowDashboard`, `followSeamRootNeeded`).
- `src/card/render.ts`: the seam gate runs for the two virtual roots'
  OWN views too (`FOLLOW_SEAM_VIEWS.has(view) ||
  followSeamRootNeeded(rootCard)`); the seam-prepare tail seats the
  follower User cards (the junction's pointer-list items - the junction's
  own type is not a list cardtype, so the typeCode-keyed pointer-closure
  walk never seats them) and the editor rows' RULE CARDS (the sync
  `followEditorBody` nests each row's rule card through the cache-only
  `fetchRenderCard`; nothing in the ordinary closure seats them - the
  "no entries" the surfaces rendered before this warm); `seatAbsentRoot`
  marks a registered-virtual card KNOWN (`unknown: false`) instead of
  unknown; the new `knownVirtualCardName` answers the page surface's
  pre-render ask.
- `src/card/render/page.ts`: `page_view_for_unknown` now asks the engine
  whether the absent card is known-virtual before substituting the create
  form (error.rb:81-86 applies to UNKNOWN cards only).
- `src/card/render/views.ts`: the LIST core arm
  (`standard_pointer_core`, pointer-list.ts) also dispatches for the
  followers junction (right/followers.rb:3 `include_set Abstract::List`
  - the junction is in the LIST family by SET membership, not by its own
  type), with the content override supplying the items.

## The oracle-matched tests

- `tests/card/follow/act155-w4-followers-view-content.test.ts` (5 legs):
  the walk answers the follower names; the junction's content view is the
  LIST core over the follower names; the junction seats KNOWN; a
  nonexistent left renders the empty pointer list (the left-nil arm,
  never the create form); a junction no set module makes virtual still
  seats unknown (the registry is set-scoped).
- `tests/card/follow/act155-w4-follow-overview-assembly.test.ts` (4
  legs): the member's :core renders the tabs and her held-rule row (the
  form, the remove button, the "everything" link); the seam's assembly
  carries the preference name and option (rule.rb:39-45's shape); a user
  holding no rules renders the empty walk's "no entries"; the dashboard
  seats KNOWN.

## The battery

- `npx vitest run tests/card/follow/` -> 7 files, 33 tests, all passed
  (the two new files included).
- `npx vitest run tests/card/mod-loader/` -> 121 files, 1895 passed,
  1 skipped.
- `npx vitest run tests/card/render/` -> 260 files: 228 passed, 31
  skipped, 1 failed file with 3 legs - the pre-existing data-absence
  failure (the suite reads the Ruby sources from
  `C:\localProjects\archive\decko-fork-study\...`, paths this machine
  does not carry; recorded at this base in the tranche-1 report).
- `npx tsc --noEmit -p tsconfig.json` -> only the three pre-existing
  diagnostics in `tests/card/actions/write-path-races.test.ts:132` and
  `:526` (recorded at this base since tranche 1; untouched here). No new
  diagnostic.

## What is still open, with the cause named

1. **THE DEPLOY HALF OF THE ROW'S DONE CONDITION.** The row's DONE
   condition waits on the guarded live deploy (the files-area pair armed
   by the operator, the deploy reaching live, and a re-run of the
   followers-probe serving the resolved set). Nothing here deploys and
   nothing touches live.
2. **THE MEMBER'S FOLLOW PREFERENCE LEG (the probe's `storedMember`
   clause).** Unchanged from tranche 2's naming: the probe leg expects the
   member's follow option MATERIALIZED on the card's own +*self set,
   while the fixture's deck-wide rule sits on the *all set and Ruby's
   resolution is the set-pattern walk, not materialization. The probe leg
   stays RED on that clause; this tranche did not change the probe.
3. **THE `+*following` JUNCTION'S VIRTUAL FLAG.** Ruby's right/following.rb
   :4-6 carries the same `def virtual?; new?; end` override, so a
   `<card>+*following` junction is known too - but its signed-in :core
   dispatches `render_rule_editor` (right/following.rb:14-16), whose form
   bytes ride the rules mod's rule_form, and the port has no :core
   registration for that module. Registering the virtual flag without the
   :core view would swap the honest create-form arm for a wrong-core
   render; named here, not half-ported.
4. **THE FOLLOWERS WALK'S CACHE.** Ruby caches follower ids
   (follower_ids.rb:25-45 FOLLOWER_IDS_CACHE_KEY); the port resolves
   fresh per call (the same architecture note the mod's event stubs
   carry). Byte-invisible on these surfaces; named.
