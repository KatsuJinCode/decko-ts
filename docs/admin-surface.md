# admin-surface.md — the core mod's admin surface report

Worktree `C:\localProjects\decko-ts-lane-admin`, branch `lane-admin`, one
commit off pass12-int `0722964` (merge pass 12 — the newest integration;
carries lane-mod-a, lane-mod-b, lane-defaultlayout). node_modules junctioned
to the main repo (`cmd /c mklink /J`). No push, no merge, no deploy, no
default-deck composition change.

## Scope, and what landed

Scope: "port the core mod's admin surface: its 13 missing views and begin the
31 unported events," per deliverables/mod-coverage-authoritative-2026-09-28.md:91
("admin :core/:warning, mod :roles, type/mod's 10 config views … 31 admin/
save events unported"). All of it landed:

- **The 13 view names = 18 view registrations** across three set files.
  The recount (tmp/wrong-goal-hunt/mod-coverage-recount-raw.json, `core`
  entry: 13 htmlViewNames) counts DISTINCT names; the gem declares 18 views
  under them — set/self/admin.rb (:core, :warning), set/self/mod.rb
  (:cardtypes, :settings, :tasks, :configurations, :roles), set/type/mod.rb
  (:core, :description, :settings, :cardtypes, :configurations, :tasks,
  :styles, :scripts, :gem_info, :depends_on, :views). All 18 registered in
  `src/card/mod-loader/mods/core-mod.ts` — the core mod's first manifest
  (the seed layer carries no admin surface).
- **The 31 events all declare** in the manifest (the recount's 31 names
  match; pinned by tests/card/mod-loader/core-mod-events-registry.test.ts).
  First batch ported: `event :admin_tasks` (set/self/admin.rb:24-38) — the
  event behind the task table the admin :core view renders. Its body's
  task-runner machinery is ported and test-exercised through direct calls:
  `runTaskFromTaskBasket` (params selection, basket miss, irreversible
  gating, policy dispatch), `notAllowedMessage` (the verbatim
  Card::Error::PermissionDenied bytes, carrying the task's LINK TEXT per
  self/admin.rb:48-52), `irreversiblesTasksAllowed` (the config read). The
  other 30 declare with stub fns exactly like card-mod-history's six; the
  per-event body remainders are itemized in core-mod.ts's header (write
  path, director stages, reference janitors, lexicon — none of which a
  declaration can carry). The ModEventFn execution seam is unwired
  engine-wide (mod-event-registry.ts header) — unchanged by this lane.
- **The minimal admin runtime** the views need, as engine config, not
  invented behavior: `src/card/mod-loader/mods/core-admin-runtime.ts` —
  CORE_TASK_BASKET (empty_trash/clear_cache/regenerate_assets, oracle-probed
  insertion order), CORE_WARNING_BASKET ([:no_email_delivery]),
  CONFIG_TITLE, ADMIN_CONFIG (24 mods' config/admin.yml + core's own,
  verbatim incl. the "clear_cash" yml typo), MOD_SPECS (all 33 card-mod
  gemspecs from gems/specifications/),
  MOD_DESCRIPTION_KEYS (only format ships a `<mod>_mod_description` key),
  and the engine-config reads (performDeliveries default TRUE = the Rails
  default; allowIrreversibleAdminTasks default FALSE). Per-engine state
  (codename→name map, responsible-role map, mod-card list) warms in the
  manifest's prepareEngine from three batched reads — the port of Ruby's
  process-global Card[code] + rule-cache lookups for the sync ViewFn
  surface.

## Honesty boundary: everything is RENDERED-UNPINNED

No Ruby-oracle capture exists for any of these views (confirmed:
tmp/raw-ground-truth carries none of the 13 names). Every
expectation in tests/card/mod-loader/core-mod-admin-views.test.ts is
derived from the gem sources (cited per assertion) plus TWO READ-ONLY
oracle probes run here for the structural facts no source file
carries — scripts committed as
tests/card/mod-loader/oracle-probe-core-admin-facts.rb and
oracle-probe-core-mod-fetch.rb, run:
`cd tools/oracle/decko-oracle-app && RAILS_ENV=development bundle exec decko runner <script>`
Probed facts (read-only; zero card writes; the only disk effect is Rails'
own tmp/cache population, the established capture instrument's routine
behavior):

| fact | probed value | feeds |
|---|---|---|
| basket[:tasks] order | [empty_trash, clear_cache, regenerate_assets, (carrierwave's delete_upload_tmp_files)] | task table row order; task mod/irreversible flags |
| basket[:warnings] | [no_email_delivery, recaptcha_config_issues] | core's contribution = [:no_email_delivery] (recaptcha's is card-mod-recaptcha's) |
| Cardio.config.allow_irreversible_admin_tasks | false | runner default |
| Card.config.action_mailer.perform_deliveries | false (deck's config/application.rb:19 — a DECK choice; Rails default true) | :warning predicate default |
| spec.files for installed card-mod gems | [] (installed gemspecs carry no s.files) | :gem_info's empty files accordion — no file-list transcription needed |
| Cardio::Mod.fetch("core").spec | nil | mod: core renders no spec-backed sections; :gem_info returns nil |
| mod cards | 34, named "mod: account" … "mod: virtual", codenames mod_* | the runtime's mod-card warm + name sort |
| responsible_role shape | rule-walk item codenames (e.g. *structure → ["shark"] on that deck) | the *update-rule candidate walk (self → type → all), oracle-verified candidate order in set-patterns/rule-names.ts:17-24 |
| card_mods dependency slice | ["mod_-edit", …] — name[8..] off-by-one, verbatim | :depends_on / :gem_info accordion items |

No byte verification against a capture is claimed anywhere.

## Failing tests first (the red run)

tests/card/mod-loader/core-mod-admin-views.test.ts and
core-mod-events-registry.test.ts were written and run BEFORE the
implementation existed:
`npx vitest run tests/card/mod-loader/core-mod-*.test.ts` →
"Test Files 2 failed (2) / Tests no tests" (module-not-found on
core-mod.js). Then the implementation landed; final state 29 passed (29)
across the two files.

Two defects the batch's own tests caught during the green run (not assumed):
1. taskRowHtml emitted the task LINK without its `<td>` cell wrapper —
   the toBe diff showed `<tr><a …>` where Ruby's TableHelper#row wraps
   every cell (table.rb:71-79 cell()). Fixed.
2. The chain-aware dispatch never engaged until the test bound
   `engine.modLoader` — installInto runs the prepare phase only
   (mod-loader.ts:370-377); the engine binds the PROCESS-WIDE default
   loader at construction (render.ts:466-468). No existing mod test binds
   the field, i.e. every prior mod suite dispatched through the FLAT
   last-wins table. These are the first render-level tests to exercise the
   per-card chain (the actual Ruby MRO semantic).

## Gates, all run this session (exact commands)

- `npx tsc --noEmit` → TSC_EXIT=0
- `node scripts/check-scoped.mjs` → "[check-scoped] PASS"
- `npx vitest run tests/card/render --maxWorkers=2 --no-file-parallelism`
    lane : 28 failed | 328 passed (356), 18 files failed of 58
    base  : 28 failed | 328 passed (356), 18 files failed of 58
    (base worktree C:/localProjects/decko-ts-lane-admin-base, detached at
    0722964 = the branch's parent, own node_modules junction)
    sorted failure-set diff: NEW_FAILURES_VS_BASE=0 FIXED_VS_BASE=0
- `npx vitest run tests/card/mod-loader --maxWorkers=2 --no-file-parallelism`
    lane : 28 failed | 969 passed (997), 13 files failed of 46
    base  : 28 failed | 940 passed (968), 13 files failed of 44
    failure-set diff: NEW_FAILURES_VS_BASE=0 (the +29 passing = this
    lane's two new files; the 28 failures are the same names on both)

Gate artifacts: tmp-gate-{render,modloader}-{lane,base}-full.log +
-failures.txt in the worktree (untracked; reproducible from the commands).

## Surface divergences, each deliberate and cited at the code

1. **Flat-table exposure**: the loader registers every view BOTH flat and
   chain-aware. Core loads FIRST in bundle order, so in a composed deck a
   later mod's same-name registration overwrites the flat record and the
   CHAIN dispatch is what serves these views — set-scoped (Self::Admin
   only for *admin, Self::Mod only for the Mod card, Type::Mod only for
   mod-typed cards). The known empty-chain masking defect
   (mod-views-a-lane.md batch 3) is unchanged engine behavior, out of
   lane scope.
2. **self/mod.rb's `def content`** (item_codes) renders "#{mod}_mod" over
   Cardio.mods OBJECTS — probe-2 shows its oracle bytes are object-inspect
   strings with memory addresses, i.e. unreproducible. NOT ported; the Mod
   card's :content keeps stored-content behavior. Same call for
   self/version.rb's Cardio::Version.release override.
3. **self/trash.rb's view :core** (the trash table + restore links) is the
   19th :core registration of the 13-name surface; it needs the trash
   query + restore write path and is OUTSIDE the named rows. NOT
   ported — *trash's :core keeps the base view. Named remainder.
4. **self/mod.rb's global views** index grouped[view] unguarded (Ruby
   raises NoMethodError when NO mod carries that category); the port
   renders the h1 with an empty body — a headless engine cannot 500.
5. **Codename-symbol nests whose codename is absent** (e.g. Mod:tasks'
   empty_trash item, which is not a codename card) render the engine's
   unknown-card nest shape; Ruby renders the not_found view of an errored
   new card (format/nest/fetch.rb:8-20). Real decks' tested paths (real
   codename cards) are unaffected.
6. **`skip: :allowed`** (validate_uniqueness_of_name, validate_renaming,
   update_referer_content) and **`changing: :type`**
   (check_for_cards_of_type_when_type_changed) have no manifest field;
   recorded in core-mod.ts's file comments until the execution seam
   grows the API.
7. **Ruby's String#hash** (the accordion collapse-id context,
   all/admin.rb:96) is per-process SipHash — the port emits a stable
   stand-in; tests mask it exactly like data-slot-id.

## Merge notes for the next pass

- Composition is ONE LINE: add `core: coreMod` to default-mod-deck.ts's
  MANIFESTS (ORACLE_BUNDLE_ORDER already carries "core" at index 0, so
  portedBundleOrder() picks it up first). DONE at pass14-int
  (lane-admincompose) — the gate discipline this lane ran measured the
  manifest in isolation; the composed-deck whole-suite surface is the
  merge pass's measurement, receipted in docs/admin-compose.md.
- The lane's own collision audit: no seed-table view collides with the 13
  names except :core (chain-scoped, see #1); the render + mod-loader
  failure sets are untouched.
- tmp/wrong-goal-hunt/mod-views-a-lane.md's cross-mod seam note stands:
  box_bottom's dependencies (card-mod-history) are unaffected by this lane.

## Files

- src/card/mod-loader/mods/core-mod.ts — the manifest (24 set-file
  entries, 18 views, 31 events, 1 settingOpts, prepareEngine) + the view
  emitters + the admin_tasks runner
- src/card/mod-loader/mods/core-admin-runtime.ts — the engine-config
  registries + the per-engine warm
- tests/card/mod-loader/core-mod-admin-views.test.ts — 21 tests
- tests/card/mod-loader/core-mod-events-registry.test.ts — 8 tests
- tests/card/mod-loader/oracle-probe-core-admin-facts.rb,
  oracle-probe-core-mod-fetch.rb — the read-only probes (committed
  provenance; rerunnable against the oracle app)
- docs/admin-surface.md — this receipt
