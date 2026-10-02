# View-permission contract port (stream S5) — full task resolution, skip_perms, non-read denial

Companion to `docs/permissions-port-notes.md` (the read-task wave). This wave
completes the view-permission contract: every view now resolves its REQUIRED
TASK (`view_perms`), the check can be skipped by option, and a failed check of
ANY task renders Ruby's denial substitution. Owned files:
`src/card/permissions/view-perms.ts` (rewritten),
`src/card/permissions/view-task-rules.ts` (new), the tests listed at the end.

## Ruby mechanism (the chain, with citations)

1. **Task resolution** — `Card::View::Permission#view_perms`
   (card-1.110.0 lib/card/view/permission.rb:13-15):
   `setting(:perms) || :read`. `setting(:perms, view)` (permission.rb:29-32)
   -> `format.view_setting` (lib/card/format/render.rb:55-57, a `try` of the
   directive method) -> nil when the view definition carries no directive
   (`view_opts.rb:17` VIEW_SETTINGS includes :perms; :52-56 stores it).
2. **Skip** — `#skip_check?` (permission.rb:25-27):
   `normalized_options[:skip_perms] || view_perms == :none`. The option is
   documented Boolean (lib/card/view/options.rb:73); it is set by explicit
   render/nest opts (card-mod-account set/self/signin.rb:201) or by the
   UNDERSCORE render form — `RENDER_METHOD_RE`
   (lib/card/format/method_delegation.rb:5-9) captures a leading `_`,
   `render_args` (:48-55) sets `args[:skip_perms] = true if underscore`.
3. **Gate order** — voo `#process` (lib/card/view.rb:71-75) -> `ok_view`
   (view.rb:85-88) = `altered_view || requested_view`;
   `#altered_view` (permission.rb:19-23): `return if skip_check?;
   alter_unknown || denial`. The check runs BEFORE view dispatch
   (render.rb:59-63 `view_method` raises the unsupported-view error only
   after a passed check), so a failed check on ANY checked view — ported or
   not — renders the denial instead of raising.
4. **Task check** — `#denied_task` (permission.rb:56-64): the first failing
   entry of `Array.wrap(view_perms)`; CRUD entries (`crud?`, :52-54) check
   `format.ok? task`, any other symbol calls `format.send task` (a
   format/card method — set-scoped predicates like
   card-mod-account set/right/account/views.rb:2 `:verify_url_ok?`).
   `Card::Format::Error#ok?` (lib/card/format/error.rb:5-8):
   `task = :create if task == :update && card.new_card?; card.ok? task`;
   `Card#ok?` memoizes `send "ok_to_#{action}?"` per actor
   (card-mod-permissions set/all/permissions.rb:35-45).
5. **Non-read task bodies** (set/all/permissions.rb):
   - `ok_to_update?` :148-153 = `permit(:update)` — the type-change clause
     is a write-path invariant (no type is assigned mid-render).
   - `ok_to_create?` :120-126 = `permit(:create)`, then junction sides
     `ok_to_create_side` :127-137 — an EXISTING side part passes
     (`part_card&.new_card?` false); a missing part is checked as a virtual
     new card (`send(side, new: {})` -> `part_card.ok?(:create)`).
   - `ok_to_delete?` :155-157 = `permit :delete`.
   - `permit` :113-124 -> `permitted?` :105-110:
     `Auth.as_card.among? who_can(action)`.
   - `who_can` :47-49: the applicable rule card's ITEM ids
     (`permission_rule_card(action).item_cards.map(&:id)`;
     `permission_rule_id` :55-61 = the same set-precedence walk the read
     side uses, setting name swapped).
   - `among?` (card-mod-account set/abstract/account_holder.rb:31-36): any
     item id == AnyoneID or in the actor's parties (:26-28).
6. **Denial rendering** — `#denial` (permission.rb:46-50) ->
   `view_for_denial` (lib/card/format/error.rb:27-31):
   `@denied_task = (crud?(task) && task); view_setting(:denial, view) ||
   :denial`. The quiet span (card-mod-format set/all/html/error.rb:185-189)
   interpolates `@denied_task` — the task symbol for CRUD, "" for predicates
   (Ruby interpolates false as ""). The html :denial view (html/error.rb:83-85)
   is `focal? ? loud_denial : quiet_denial`; the engine surface is never focal.

## What changed

### `src/card/permissions/view-perms.ts` (rewritten; legacy exports kept)

- `resolveViewPerms(view)` — the full directive table: `{check:false}` for
  `perms: :none`, `{check:true, task}` for CRUD directives, predicate shape
  for method directives. The `:none` set now carries every all-set directive
  in the gems (32 views, each cited in the source: title.rb:2/16/20,
  base.rb:14/26/27/28/31/35/39/109, html/header.rb:5/15, html/head.rb,
  error.rb + html/error.rb, email_text.rb:10, notify/base_views.rb).
- CRUD directive table (all-set, cited): edit/edit_name/name_form/edit_type/
  edit_type_form/edit_inline/edit_in_form/board/comment_box -> `:update`;
  new/new_in_modal/simple_new/new_fields -> `:create`.
- `viewDenialView` — added the two other all-set `denial: :blank` views
  (universal_edit_button html/head.rb:46, comment_box comment.rb:46) beside
  the landed menu.
- `viewPermissionDenial(view, input)` — the gate: skip_check? order
  (none -> skip_perms -> check), the format/error.rb:6 update->create
  new-card mapping, the task verdict lookup, and the denial bytes
  (`denial: :blank` -> "", else `quietDenial(task)`).
- `viewPerms`/`quietDenial` keep their exact pre-wave signatures/bytes
  (read-permission wave consumers untouched).
- Registry scoping: NAME-keyed for the all-set html surface (the same flat
  choice as format.ts's unknown-view registry). Set-scoped directives that
  collide resolve to the ALL-SET entry — e.g. :edit_inline is `:update`
  (card-mod-edit set/all/edit_inline.rb:2) even though
  card-mod-layout set/right/enabled_roles.rb:35 defines a `:none` one on that
  right set.

### `src/card/permissions/view-task-rules.ts` (new)

- `viewTaskPermissionStatements()` — ONE statement: every live
  *update/*create/*delete rule card LEFT JOINed to its item references
  (LEFT JOIN so EMPTY rules resolve — Ruby denies on them: `who_can` ->
  [] -> `among?` false; dropping those rows would mis-allow).
- `viewTaskStateFromResults(results, readState)` — inherits alwaysOk +
  viewerParties from the read state (the same `Auth.as_card`); builds
  ruleId -> party-id sets per task plus the hasTaskRules existence gates.
- `taskVerdictForCard` / `allTaskVerdictsForCard` — permit -> party check ->
  (create) junction sides with virtual-new-part recursion. Candidate
  resolution = the read fallback's composed-key closure
  (resolveRuleIdsByKeys, local copy — read-rules.ts is outside this stream's
  edit rights). `undefined` = unverifiable, ALLOWED — the same
  rule-less/partial-seed divergence documented on `canReadByRuleLookup`.

### `src/card/render/format.ts` (minimal, disclosed — the gate call site)

The previous 8-line read-only check block (which called this module's
`viewPerms`/`viewDenialView`/`quietDenial`) is replaced by the single
`viewPermissionDenial` call (format.ts renderView, the `altered_view`
position); `RenderEngineLike` gains ONE optional method:

```ts
taskAllowed?(card: RenderCard, task: Exclude<CrudTask, "read">): boolean | undefined;
```

`undefined` = unverifiable-allowed (the canReadByRuleLookup contract).
Behavior is byte-identical for the current surface (every registered view is
:read or :none; the only observable deltas are honesty fixes: an unregistered
`:none` view on a denied card now raises unsupported-view like Ruby's
skip-then-dispatch order instead of masking with a denial span).

## EXACT COORDINATOR PATCH (render.ts — not applied; render.ts is coordinator-held)

Wires the engine half of `taskAllowed`. Zero cost when unused: the state
loads only when a rendered ROOT view resolves a non-read task
(`viewRequiresTask`), and the current registry never triggers it, so existing
query-shape pins hold.

```ts
// 1. import (top, with the other permissions imports):
import {
  allTaskVerdictsForCard,
  viewRequiresTask,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
} from "./permissions/view-task-rules.js";
import type { CrudTask } from "./permissions/view-perms.js";
import type { WriteTask } from "./permissions/view-task-rules.js";

// 2. fields (beside deniedVerdicts):
  /** ok_to_<task>? state for the non-read view tasks — loaded once per
   *  engine, on the first render whose ROOT view demands a non-read task
   *  (docs/view-perms-notes.md). Cleared on resetCaches(). */
  private taskState: ViewTaskState | undefined;
  /** card key -> allowed verdicts per write task (the ensureVerdicts
   *  model; undefined entries mean unverifiable). Cleared on resetCaches(). */
  private taskVerdicts = new Map<string, Record<WriteTask, boolean | undefined>>();

// 3. in render(), right after `await this.ensureVerdicts();`:
    await this.ensureTaskVerdicts(view);

// 4. methods (beside ensureVerdicts):
  /** Prepares the non-read task verdicts when the requested view needs
   *  them: one batch for the who_can universe, then one candidate
   *  resolution per prepared card (memoized — warm renders stay at zero
   *  queries). Read/none-only renders skip entirely. */
  private async ensureTaskVerdicts(view: string): Promise<void> {
    if (this.readPermission === undefined) return;
    if (!viewRequiresTask(view)) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    for (const card of this.renderCards.values()) {
      if (card.id === undefined || this.taskVerdicts.has(card.key)) continue;
      this.taskVerdicts.set(
        card.key,
        await allTaskVerdictsForCard(
          this.fetcher,
          { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
          this.taskState,
        ),
      );
    }
  }

// 5. RenderEngineLike implementation (beside isDenied):
  /** ok_to_<task>? for the non-read view tasks (docs/view-perms-notes.md). */
  taskAllowed(card: RenderCard, task: WriteTask): boolean | undefined {
    if (this.readPermission?.alwaysOk) return true;
    return this.taskVerdicts.get(card.key)?.[task];
  }

// 6. resetCaches() additions:
    this.taskState = undefined;
    this.taskVerdicts.clear();
```

Patch cost: ONE extra batch + up to one query per prepared card, ONCE per
engine, and only when a root view actually demands a non-read task — never
on the read/none surface (all four corpus views, the whole current registry).

## Corpus proof (constraint 1, stated plainly)

- Census over ALL ten shards (tests/card/permissions/view-perms-table.test.ts
  `captureCorpusDenialLabels`): the captured bytes contain 124,632 denial
  spans and EVERY one labels `(read)`; no other label occurs. The capture
  rendered exactly four views (closed 9,910 / title 9,910 / content 8,284 /
  open 8,284) — all :read-default or :none.
- Therefore NO captured view exercises a non-read task, and no corpus entry
  can discriminate the task-resolution table's non-read entries. Those are
  proven against the gems instead: each table row cites the view definition
  (see the source). The corpus DOES pin this wave's read-side byte
  neutrality (all read-denial/blank fixtures stay green) and the :none skip
  (`:title` renders full bytes on cards whose `:open` is denied).
- The non-read byte contract is pinned synthetically against the gems in
  tests/card/render/view-perms-gate.test.ts (`(update)` span, skip_perms,
  new-card `(create)` label).

## Documented divergences / honest remainder

- **Method-predicate perms** (`perms: :verify_url_ok?`, `:needs_setup?`,
  `:can_configure?` — card-mod-account right/account/views.rb:2,6,
  type/user.rb:10, card-mod-format type/cardtype.rb:53,61): set-scoped, none
  ported. `resolveViewPerms` models the shape and the gate passes them
  (Ruby would `format.send` the method); no table entry exists for them, so
  the branch is currently unreachable (documented, defensive).
- **Flat registry limit**: set-scoped directives are not modeled; collisions
  resolve to the all-set entry (see :edit_inline above). A future
  set-aware directive table supersedes both flat registries.
- **Virtual create-side parts** resolve only name-based patterns
  (`*self` skipped for new cards per pattern/all.rb; `*type` needs a type —
  Ruby's `Card.new` would apply the deck's default type, a config the render
  engine does not model). Reachable only for `:create`-gated views (none
  registered).
- **Nested update-gated views** (`{{x|edit}}` inside a read-rooted render)
  are not covered by the root-view trigger in the ensureTaskVerdicts patch;
  that patch would need a nest-options scan to cover them.
  Unreachable on the captured surface (no edit views registered).
- **Direct `:denial` renders** (`render(:denial)` on a denied card): Ruby
  renders the quiet span with an empty task label (`@denied_task` unset);
  the port's view registry does not register `:denial` (views.ts is R1's),
  so it raises unsupported-view. view_for_denial substitutions (the corpus
  shape) are unaffected.
- **`ok_to_read?` set-scoped overrides** (right+account etc.) and
  `Card.config.read_only` remain unmodeled, as in the read wave.
- **Loud denial / error_status 403** remain page-layer (read-wave note).

## Tests

- tests/card/permissions/view-perms-table.test.ts — registry vs the gems'
  directives; skip_check? paths; denial substitution incl. the new-card
  mapping; quiet_denial bytes; the whole-corpus denial-label census pin.
- tests/card/permissions/view-task-verdicts.test.ts — seeded-deck
  ok_to_update?/create?/delete?: who_can party sets, EMPTY-rule deny,
  Anyone-party allow, candidate precedence (*self over *type over *all),
  composed-key junction resolution, always-ok short-circuit, rule-less
  divergence, junction side checks (existing parts pass; missing parts deny
  as virtual new cards).
- tests/card/render/view-perms-gate.test.ts — the format gate end to end
  with a stub engine: read denial bytes, menu blank, :none title pass-through,
  `(update)` span, update-allowed dispatch, skip_perms, no-hook fall-through,
  unknown-card precedence, hook task set (non-read only).

## Gate results (2026-09-21, this stream)

- `npx tsc --noEmit`: clean for every file this stream touched/created.
  Remaining repo errors are other streams' in-flight files:
  tests/card/conformance/write-path.test.ts (write-conformance stream),
  tests/tools/migrate/*.test.ts (migration-tools stream, .mjs declarations).
- `npx vitest run tests/card/permissions tests/card/render`: 108/109 green.
  The one red, tests/card/render/render-engine.test.ts "renders chains of
  depth 1/2/4/8 with a CONSTANT query count" (`expected 11 to be less than
  11`), is NOT this stream's: with this stream's format.ts gate neutralized
  (pre-wave code restored temporarily), the failure reproduces identically —
  the +1 statement comes from the in-flight render.ts/rules-stream changes
  (computeIsRule order-parity fetches), attributed to their owners.
