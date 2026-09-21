# Read-permission port notes (the READ side of the rule algebra)

Stream: read-permission (render path). Ruby gems:
`card-1.110.0`, `card-mod-permissions-0.20.0`, `card-mod-account-0.20.0`,
`card-mod-format-0.20.0`.

## The Ruby mechanism, file + line

1. **View permission hook** — `lib/card/view/permission.rb`
   - `:13-15 view_perms`: `setting(:perms) || :read` — every view checks
     read unless its definition carries `perms:`.
   - `:25-27 skip_check?`: skip when render options carry `skip_perms` or
     `view_perms == :none`.
   - `:19-23 altered_view`: `alter_unknown || denial` — unknown-card
     substitution runs BEFORE the denial (both wired in the TS
     `RenderFormat.renderView`, unknown first).
   - `:46-50 denial` + `:56-64 denied_task`: the first failing task of
     view_perms; for read that is `card.ok?(:read)`.
2. **The read check** — card-mod-permissions `set/all/permissions.rb`
   - `:139-146 ok_to_read?`: `Auth.always_ok?` short-circuit (DeckoBot);
     `read_rule_id ||= permission_rule_id(:read)`; allowed iff
     `Auth.as_card.read_rules_hash[read_rule_id]`.
   - `:1-5 set_read_rule` store event: `read_rule_id`/`read_rule_class`
     are DERIVED ON SAVE and stored on the cards row — the render-time
     check reads the stored value (all 49,829 non-trash corpus rows carry
     it; verified `read_rule_id IS NULL AND trash=0` count = 0).
   - `:55-61 permission_rule_id`: `_left`-rule indirection for compound
     cards, else `rule_card_id(:read)` (set-pattern precedence).
3. **The actor's readable set** — card-mod-account
   `set/abstract/account_holder.rb`
   - `:27-29 parties`: `all_enabled_roles + [id]`.
   - `:40 all_enabled_roles`: `[]` when `id == AnonymousID`.
   - `:51-53 read_rules_hash` + `:115-123 fetch_read_rules`: the union of
     `Card::Rule.read_rule_cache[party]` over `[AnyoneID] + parties`. For
     Anonymous the parties are exactly `[AnyoneID, AnonymousID]`.
4. **The deck-wide grant graph** — `lib/card/rule/read_rule_cache.rb`
   (`:7-18` SQL): `{ referee_id (party) -> [read_rule_id] }` from
   `card_references` of read rule cards (`right = *read`, left a Set-type
   card). Deliberately REFERENCE-based, not content-based: a rule grants
   the parties its content links to, as resolved at save time. (The
   corpus deck's rule contents are plain names while their grants live in
   card_references — matching the refs is what matches Ruby's bytes.)
5. **The denial markup** — card-mod-format `set/all/html/error.rb`
   - `:75-77 view :denial`: `focal? ? loud_denial : quiet_denial`.
   - `:185-189 quiet_denial`:
     `<span class="denied"><!-- Sorry, you don't have permission (#{@denied_task}) --></span>`
     — `@denied_task` is "read".
   - `lib/card/format/error.rb:27-31 view_for_denial`: a view's `denial:`
     directive substitutes another view; `:menu` → `:blank`
     (`set/all/html/menu.rb:8`; `blank` is `""`, `set/all/base.rb:109`).
   - Focal/loud: `lib/card/format/nesting/subformat.rb:41` + html_format
     `:16 focal? = show_layout? ? main? : depth.zero?`. The capture
     (`benchmarks/capture-corpus.rb` renders `card.format.render(view)`)
     has `show_layout?` true and `main?` false → every captured denial is
     QUIET. The engine's render surface never sets main, so quiet is the
     whole byte contract here; loud (`:191-210`, framed "Sorry" page) is a
     page-layer remainder.
6. **Why :title of a denied card still renders** — card-mod-format
   `set/all/title.rb:2` `view :title, compact: true, perms: :none` is a
   BASE-format definition; `view_setting` methods are defined on the
   module where `view` ran
   (`lib/card/set/format/abstract_format/view_opts.rb:59-64`) and the
   html-format body redefinition (`:12`) does not touch them. The corpus
   agrees: 0/999 captured :title views of denied cards are denied.

## Markup contract (byte oracle: fixtures/corpus/*)

- Denied view (:closed/:open/:content): the ENTIRE view output is exactly

  ```
  <span class="denied"><!-- Sorry, you don't have permission (read) --></span>
  ```

  No card-slot wrapper, no data attributes (Ruby's denial replaces the
  view before `wrap_and_render`).
- Denied :menu → `""` (the :blank denial view).
- Denied :title → the normal title view bytes.
- Nest of a denied card inside a readable host: the span appears at the
  nest position of the host's rendered view; the denied card's content is
  never processed (Ruby denies before any body runs — the TS
  `renderView` short-circuit gives the same guarantee).

## The TS port

- `src/card/permissions/view-perms.ts` — the perms/denial directive
  registry for the ported views (`title`/`blank` → `:none`; `menu` →
  denial `:blank`), plus `quietDenial()`.
- `src/card/permissions/read-rules.ts` —
  - `readPermissionStatements()`: the party-codename lookup, the
    ReadRuleCache SQL (ReadID/SetID as scalar subqueries), and a
    has-read-rules gate; three independent statements, ONE `driver.batch`.
  - `readPermissionStateFromResults()`: `{ readableRuleIds, hasReadRules,
    parties }` — the port of `read_rules_hash`.
  - `canReadByStoredRule()`: the pure stored-id check (production shape;
    Ruby always has the value).
  - `canReadByRuleLookup()`: the live `permission_rule_id` walk for rows
    missing the stored id — candidate rule names via the landed
    set-pattern registry, resolved through the composed-key closure (the
    prefetch walk's `resolved` CTE) so NULL-key junction rules resolve at
    any depth in one statement.
- `src/card/render.ts` — engine integration: the permission state
  resolves once per engine, FOLDED into the closure batch
  (`PrefetchContext.additionalStatements` → `PrefetchStats.additionalResults`
  in `src/card/render/prefetch.ts`) so a cold render stays ONE round trip;
  verdicts (`deniedVerdicts`, card id → boolean) are computed in the
  prepare phase; the sync render path only does set lookups.
  `resetCaches()` clears both.
- `src/card/render/format.ts` — `renderView` runs
  `engine.isDenied(card)` after visibility processing and BEFORE the
  before-hook/view dispatch (Ruby: `altered_view` inside `voo.process`,
  before `wrap_and_render`); a denial returns the span (or the `denial:`
  view) instead of the view body. `RenderEngineLike.isDenied` is the one
  new interface member.

## Query shape (decko-commons/decko#1282)

- Cold render: the three permission statements ride the EXISTING closure
  batch — `batches: 1` unchanged, `statements +3`. Pinned in
  tests/card/permissions/read-permission.test.ts
  (`lastRenderStats.batches === 1`, `additionalResults.length === 3`) and
  reflected in the depth-sweep statement pins (6 → 9, round trips 5 → 5).
- Warm render: zero permission queries (state memoized per engine,
  verdicts memoized per card); the existing warm pins stay 0/0.
- Stored-id cards cost zero extra anything (pure Set membership). The
  live-rule fallback costs one statement per fallback card, once per
  engine (memoized), and is skipped entirely in rule-less decks
  (`hasReadRules: false`).

## Corpus counts (shard-000000, the gate shard)

| class | before stream | after stream |
| --- | --- | --- |
| renders total | 2426 | 2426 |
| pass | 1698 | unchanged by this stream (permission classes now proven by tests/card/render/permission-corpus-replay.test.ts) |
| permissionPending (denied-start views, skipped) | 816 | 816 skipped — see flip recipe below |
| realFail | 510 (other streams: help-popover content, RULE set-key, search cores, CAPTURE_ERROR views) | not this stream's classes; the replay driver is cross-stream red at baseline and stays red until those land |

Whole-corpus capture: 180,442 views, 98,747 (55%) denied-start — all
quiet spans.

## Flip recipe (permissionPending → JUDGED)

The engine is ready. The replay driver
(benchmarks/corpus-v2/replay-shard.test.ts) skips views whose expected
bytes start with the denied span AND seeds cards without the permission
columns. To flip:

1. Seed `read_rule_id`/`read_rule_class` (tests/.../render-test-storage.ts
   `SeedOptions.readRuleId` now supports them).
2. Seed the read-rule universe per shard — exactly what
   tests/card/render/permission-corpus-seeding.ts does (all *read rule
   cards, their set cards, their card_references rows, the
   anyone/anyone_signed_in/anonymous/read/set codename cards).
3. Drop the `permissionSkipped` skip and let denied views replay; denied
   views are self-contained bytes, so the only judged risk left in them is
   the permission verdict itself, which this stream validates against the
   capture in tests/card/render/permission-corpus-replay.test.ts.

Without step 2 the verdicts would be computed from partial rule data and
mis-allow/mis-deny — the seeding enrichment is required, not optional.

## Documented divergences (deliberate)

- **Rule-less decks**: Ruby denies everything (`read_rules_hash` empty,
  `read_rules_hash[nil]` → false). Every real deck bootstraps
  `*all+*read` (card/auth/setup.rb:44), so the port treats "no read rule
  cards at all" as "no permission data" and renders. This keeps every
  rule-less synthetic test deck meaningful; the corpus deck is fully
  ruled and unaffected.
- **Partial decks + fallback**: the live-walk fallback runs only when the
  seed contains the BOOTSTRAP rule `*all+*read` — the completeness proof
  that the read-rule universe is present. Fragment seeds (per-shard
  replay seeds without the rule cards) keep the fallback off entirely:
  a partial candidate set resolving to a members-only rule would
  otherwise fabricate denials for cards Ruby rendered in full. With the
  full universe seeded, a candidate-miss still allows (a card whose
  applicable rule is absent cannot honestly be denied); in a complete
  deck `*all+*read` always resolves, so this is the non-bootstrapped
  edge only.
- **Non-anonymous actors**: parties beyond `Anyone`/`AnyoneSignedIn`/self
  (deck roles via account member cards, `role_ids_from_role_member_cards`)
  are not resolved — the account/roles wave. The engine currently resolves
  the Anonymous corpus viewer; `readPermissionStateFromResults(results,
  actorId, signedIn)` is the seam (pass the signed-in actor id +
  `signedIn: true`; role party ids extend `parties`).
- **Loud denial** (focal page renders, error.rb:191-210): page-layer; the
  engine render surface is non-focal in every captured context.
- **`skip_perms` render option / per-view non-read perms** (e.g.
  `perms: :update` views): not exercised by the captured surface; the
  registry shape in view-perms.ts is where they land.

## Tests

- tests/card/permissions/read-permission.test.ts — unit deck: readable /
  denied / title-of-denied / menu-blank / nest-of-denied / stored-vs-fallback
  verdicts / rule-less divergence / query-shape pins.
- tests/card/render/permission-corpus-replay.test.ts +
  permission-corpus-seeding.ts — corpus byte parity: denied picks
  (structural), readable controls, denied-title, mid-denied (host nesting
  a denied card), all byte-exact against fixtures/corpus/shard-000000.
