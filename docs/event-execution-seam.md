# event-execution-seam.md — the ModEventFn execution seam report

Worktree `C:\localProjects\decko-ts-lane-eventseam`, branch `lane-eventseam`,
branched off pass13-int `d6b1957` (carries the 31 core-event declarations).
node_modules junctioned to the main repo (`cmd /c mklink /J`). No push, no
merge, no deploy, no default-deck composition change.

## Scope, and what landed

Scope: "wire the ModEventFn execution seam so the 30 stubbed core events can
run … Design the seam against Ruby's event semantics (declaration,
triggering stage, skip/changing conditions), implement the dispatcher for
the core events' stage, wire the first REAL batch of bodies (the ones the
tests can exercise: janitor/reference events that operate on the test
deck), stub the rest honestly." All of it landed:

- **The dispatcher** — `src/card/mod-loader/mod-event-dispatch.ts`, the
  execution half mod-event-registry.ts's header explicitly does not own.
  It ports Ruby's applicability algebra line-for-line, each gate citing
  its source: `event_applies?` (card-1.110.0 lib/card/set/event/all.rb:16-22);
  `on_condition_applies?` (all.rb:32-35) with the `:save -> [create,
  update]` expansion (set/event/options.rb:70); `changed`/`changing_
  condition_applies?` (all.rb:69-77, alias :77) gated to `:update` only,
  with Card::Dirty's alias map (dirty.rb:11-13: `type -> type_id`,
  `content -> db_content`) and DirtyNames folding side changes into name
  (dirty.rb:57-60); `skip_condition_applies?` (set/event/skip_and_trigger.rb
  :80-84 — a plain `skip=` entry stops only events that declared
  `skip: :allowed`; a `skip_event!` `:force` entry stops anything);
  `trigger_condition_applies?` (:86-90); `when_condition_applies?`
  (all.rb:79-85); set scoping via `set_condition_applies?` (all.rb:26-29 —
  `all/`-pattern files universal, scoped files consult a `setMember`
  resolver). Stage walk per lib/card/director.rb:12-28; no-stage `after:`
  events run in their target's stage directly behind it (options.rb:73-86
  keeps `@stage` nil when `after:` is present); integration-stage failures
  are rescued into the report (lib/card.rb:163-171
  `rescuing_if_integration`), all other stages propagate.
- **The save-path wiring** — `CardActionEngineOptions.modEvents` (the
  `ModEventRuntime` composition: registry + deck deps + named predicates +
  act-level skip/forceSkip/trigger lists + `setMember` + `onReport`). The
  engine dispatches the director stages it has: initialize,
  prepare_to_validate, validate, prepare_to_store, store, finalize (per
  card save, sides included), integrate (act level, before the notify
  hooks). Every dispatch no-ops when no runtime is composed — the default
  for every pre-existing caller.
- **The first REAL batch** — the five reference janitors
  (mod/core/set/all/reference_events.rb) now carry REAL `ModEventFn`
  bodies in core-mod.ts, delegating to the engine's own port modules
  (refresh-references-out.ts, refresh-references-in.ts,
  update-referer-content.ts). The takeover contract: when one of these
  names is registered at the runtime, the engine's built-in call for that
  behavior STANDS DOWN (`EVENT_TAKEOVER_BUILTINS` in card-action-engine.ts)
  — Ruby's shape, where the event IS the code. Unregistered names keep the
  built-in; registered STUBS never suppress their built-in.
- **The skip machinery is alive on the save path for the first time**:
  `coreModEventPredicates` (core-mod.ts) ports `skip_update_referers?`
  (reference_events.rb:34-36 = `skip_event? :update_referer_content`);
  a runtime with `skip: ["update_referer_content"]` now produces the
  Ruby rename outcome — referer content untouched, the skip twin
  `update_referer_references_out` fires, and `refresh_references_in`'s
  `unmap_referees` arm opens (`action == :update &&
  skip_update_referers?`, reference_events.rb:23) — the arm the pre-seam
  save path could never reach (refresh-references-in.ts header).
- **The seam API grew the fields admin-surface named as missing**
  (docs/admin-surface.md divergence #6): `ModEventRegistration.skip:
  "allowed"`, `.changing:` (the event.rb:57 alias), `.trigger: "required"`;
  `RegisteredModEvent` carries them; the declarations now port verbatim —
  `validate_uniqueness_of_name` + `validate_renaming` (name_events.rb:12,
  :46) and `update_referer_content` (reference_events.rb:6) carry
  `skip: "allowed"`; `check_for_cards_of_type_when_type_changed` carries
  `changing: ["type"]` (cardtype.rb:19-20). `ModEventCard` widened per its
  own doc promise ("the seam widens it as stages wire in"): key, action,
  trash, typeId, nameBeforeAct, changedFields, act (ModEventActState).
  `ModEventFn` gained the third `ctx` param (ModEventContext: driver,
  lexicon, stage, `skipEvent()`); 1-2-param bodies stay assignable.
- **The rest stub honestly** — the other 26 core events keep stub bodies
  with the per-event remainder notes in core-mod.ts's header (autoname,
  codename, content/drafts, the name validators as built-in engine
  behavior, subcards, trash write path, type validators, notable_exception).
  `admin_tasks` keeps its ported task runner (direct-call exercised).

## Failing tests first (the red run)

`npx vitest run tests/card/mod-loader/mod-event-dispatch.test.ts
tests/card/actions/event-seam-save-path.test.ts --maxWorkers=2
--no-file-parallelism` BEFORE implementation existed →
- mod-event-dispatch.test.ts: file-level `Error: Cannot find module
  '../../../src/card/mod-loader/mod-event-dispatch.js'`
- event-seam-save-path.test.ts: 4 failed (no reports, built-ins ran, skip
  unheeded) | 1 passed (the empty-registry guard, which pins current
  behavior and passes by design pre- and post-seam).

Final state: 19 passed (19) across the two files — 12 dispatcher units
(stage walk, after:-inheritance, save-expansion, changed gates + dirty
aliases, skip/force-skip/trigger, when:-predicate + predicate-unresolved,
set scoping, error propagation vs integration isolation) and 7 save-path
tests (create/rename/delete through the seam with report proof, the
skip-machinery rename, the empty-registry fallback).

Two defects the batch's own tests caught during the green run:
1. My skip tests initially hung the skip list off the card's act state;
   the dispatcher walks the RUNTIME's lists (the act hash, Ruby's
   `(act_card || self).skip_hash` — the engine copies it onto the card for
   bodies). Test fixed, dispatcher unchanged.
2. The skip-rename test's planted stale row sat on a LIVE referer, which
   the skip twin's rebuild legitimately sweeps (referersOf selects by
   `referee_id = id`, update-referer-content.ts:180-193 — live cards
   only); the honest survivor of the unmap arm is a row with a DANGLING
   referer. Test re-planted; engine unchanged.

## Gates, all run this session (exact commands)

- `npx tsc --noEmit --pretty false` → TSC_EXIT=0
- `node scripts/check-scoped.mjs` → "[check-scoped] tsc: 0 active
  error(s), 0 suppressed" + "[check-scoped] PASS"
- `npx vitest run tests/card/render --maxWorkers=2 --no-file-parallelism`
    lane : 33 failed | 456 passed (489), 18 files failed of 62
    base  : pass13-int worktree (d6b1957), tests/ portion 18 failing files
    failure-set diff (file-level, ANSI-stripped): NEW_FAILURES_VS_BASE=0
    FIXED_VS_BASE=0
- `npx vitest run tests/card/mod-loader --maxWorkers=2
   --no-file-parallelism`
    lane : 61 failed | 1015 passed (1076), 21 files failed of 55
    base  : tests/ portion 21 failing files
    failure-set diff: NEW_FAILURES_VS_BASE=0 FIXED_VS_BASE=0
- Extra (not asked, run because the lane edits the write path):
  `npx vitest run tests/card/actions …` — lane 52 passed (52) of 8 files;
  base tests/ portion 47 passed (47) of 7 (the +5 are this lane's new
  save-path file). Zero failures either side.

Gate environment disclosures:
1. The base worktree (C:/localProjects/decko-ts-pass13-int) carries stale
   UNTRACKED `dist/tests/` output its vitest run also collected (108
   files = 2×54), so its raw totals double-count; the failure-set diff
   was computed on `tests/`-path failing FILES only, both sides.
2. The fresh lane worktree lacked the 207 MB gitignored corpus artifact
   (`benchmarks/corpus-v2/bench-corpus-v2.sqlite3`, CORPUS_DB for
   structure-universe-junction-key.test.ts) — the first lane render run
   showed that file as a NEW failure (`SqliteError: unable to open
   database file`), an environment artifact, not a code defect; fixed by
   hardlinking the file in (`cmd /c mklink /H`), after which the diff was
   EMPTY.
3. `core-mod-admin-views.test.ts > WITH the mod: every one of the 13
   names dispatches` fails IDENTICALLY on base (UnsupportedViewError:
   view (warning) not supported for mod: core) — a pre-existing member of
   the base failure set (the merge pass's composition changed dispatch
   surface after the admin lane's standalone measurement), not a lane
   regression; it is inside both failure sets the diff compares.

Gate artifacts: tmp-gate-{render,modloader,actions}-lane-eventseam.log +
-failures.txt (+ the base modloader log) in the worktree (untracked;
reproducible from the commands). One test-run side effect left in the
tree UNCOMMITTED: benchmarks/results/depth-sweep-ts.json — a benchmark
test rewrites it on every suite run (measured_at bump only; diff is 44
twin-line timestamp/result pairs); the merge pass should discard or keep
it per its own runs.

## Surface divergences, each deliberate and cited at the code

1. **Takeover is name-level and limited to the real batch**
   (EVENT_TAKEOVER_BUILTINS, card-action-engine.ts): only the five
   reference janitors' built-ins stand down when registered. The other
   core events run as the engine's built-in ports; a registered STUB
   never suppresses its built-in (that would break the save). When a
   stub event's body is ported later, its name joins the set — the
   merge pass ordering follow-up lanes owns that sequence.
2. **Stage placement in the port**: the validate-stage seam runs AFTER
   the engine's built-in validations (Ruby interleaves them as events in
   definition order — the port's built-ins ARE those events); the
   storage-phase seams fire only for PERSISTED saves (the writer's no-op
   guard runs first — Ruby's director walks the stages regardless, but
   the port pins events to saves that produced an action); Ruby's
   pre-write store mutations (set_content) stay built-in (the `after`
   merge above the seam is that port). Disclosed at each site.
3. **Integrate dispatch is act-level** (before dispatchSavePathIntegrations
   — notify is itself an integration event, card-mod-follow
   set/all/notify.rb:13-16), not per-subcard; per-card integrate walks
   are a named remainder.
4. **Unresolvable `when:` predicates skip with report reason
   "predicate-unresolved"** instead of Ruby's NoMethodError save-abort
   (all.rb:81 `send block`) — a dispatcher cannot kill a save over a
   predicate its runtime has not ported; the skip is report-visible, and
   the mod-loader unit test pins it.
5. **`after:` ordering** is a stable reorder (target directly behind),
   the documented contract of mod-manifest.ts:209-212 — Ruby implements
   it via ActiveSupport callback chains with prepend semantics; the port
   does not model chains beyond the after-rule.
6. **Fallback interleave**: with a partially-registered runtime, the
   dispatcher's fired bodies all run BEFORE the unregistered built-in
   thunks at the same finalize seam (dispatch first, then fallbacks) —
   Ruby would interleave them in one definition-order walk. The five
   real-batch names are usually all-or-nothing (they load as one file),
   so the mixed case is the mod-composition corner, documented here.

## Merge notes for the next pass

- Composition is still untouched (core is NOT in defaultDeckSources);
  with core composed, saves would start firing the five janitor bodies
  through the seam INSTEAD of the built-ins — byte-parity is what the
  save-path tests pin (same rows, same content, same action counts).
- The predicate/setMember/host runtime fields are the composition seam a
  boot wire-up must fill: `predicates: coreModEventPredicates` plus the
  render engine's ModEngineHost.
- The 26 stub bodies' remainders keep the ordering notes in core-mod.ts's
  header; the next natural batches are all/trash.rb (manage_trash/
  validate_delete/delete_children — the write path owns their semantics
  already) and all/content.rb (set_content needs pre-write store-stage
  mutation, divergence #2's boundary).

## Files

- src/card/mod-loader/mod-event-dispatch.ts — the dispatcher (stage walk
  + the five condition gates + reports)
- src/card/mod-loader/mod-manifest.ts — widened ModEventCard,
  ModEventActState, skip/changing/trigger fields, ModEventFn's ctx param
- src/card/mod-loader/mod-event-registry.ts — RegisteredModEvent carries
  the new fields; header points at the dispatcher
- src/card/mod-loader/mods/core-mod.ts — the five real bodies,
  coreModEventPredicates, verbatim skip/changing declarations
- src/card/actions/card-action-engine.ts — the modEvents option, per-save
  event cards, seven stage seams, the takeover contract
- tests/card/mod-loader/mod-event-dispatch.test.ts — 12 tests
- tests/card/actions/event-seam-save-path.test.ts — 5 tests (new file;
  the 6th describe block's empty-registry guard included)
- tests/card/mod-loader/{card-mod-history,card-mod-permissions,
  card-mod-virtual}.test.ts — direct-call sites pass the new ctx arg
  ({} as never; the assertions unchanged)
- docs/event-execution-seam.md — this receipt
