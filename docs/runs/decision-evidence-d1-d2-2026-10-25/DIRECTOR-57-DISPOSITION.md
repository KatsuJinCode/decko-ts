# Decision 1 evidence: the 57 director definitions, dispositioned against the port

Repo: KatsuJinCode/decko-ts, branch `port/d1d2-verify-20261025`, base c29e4c3f
(origin/deploy/full-candidate-20261102, the newest pushed roll tip). Produced
2026-10-25 by the d1-d2 verification lane.

## Provenance

- Ruby side enumerated from the PINNED gems: `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-1.110.0/lib/card/director.rb` + `director/*.rb` (10 files).
- The row's def roster and per-def oracle probes: `fixtures/captured/card-director-methods-ruby-oracle.json` (regenerated at this tree by the treewalk instrument; counts PORTED 25 / PORTED-INLINE 30 / NAMED-COLLAPSE 6 / SKIP 1 / GAP 57).
- Independent re-enumeration this lane: a direct `def` scan of the pinned bytes finds 123 defs; the instrument's roster of 119 excludes the two `initialize` and two `to_s` constructor/inspection defs (director.rb:147/:208, subdirector_array.rb:13, class_methods.rb:101). Every one of the 57 gap rows below matches the pinned bytes at name + file + line exactly (checked programmatically, 57/57 exact).
- Prior mapping receipts: `docs/runs/treewalk-row-conversion-2026-10-22/reg-treewalk-c2-director-rb-director-rb-9/RECEIPT.md` (the workbatch-c lane's mechanism finding, confirmed unchanged here) and the treewalk README.

## The one-paragraph verdict

The port binds NONE of the 57 names (the instrument's GAP=57 stands at this tree).
The behaviors split three ways: the INLINED rows (25) live in the action engine's
fixed-sequence act lifecycle (the stage dispatches, the ActWriter's act/action rows,
the per-stage event cards, the post-write expiry, the subcard walk); the CARRIED
ELSEWHERE rows (7) live in the delayed-job module (the two event_delay defs with their
act/env/auth context) and the eat pod (Card.ensure's public semantics with its four
private helpers); and the NO-CARRIER rows (25) are carried by nothing because the
mechanism they served does not exist in the port: the director REGISTRY and the
per-card stage-pointer bookkeeping. That absence is the deliberate architecture
difference the receipt names (workbatch-c, 2026-10-25): one engine instance per save
with stages at fixed call sites replaces a registry of directors advancing pointers.
Whether the OBSERVABLE behavior matches is Decision 1's second half: the three
recorded-trace comparisons in TRACE-COMPARISONS.md, where the port reproduces Ruby's
per-step status, row deltas, actions, events, mail and files.

## The 57-row disposition table

| def | Ruby | visibility | pinned deck reaches it | port mechanism | where the behavior lives |
| --- | --- | --- | --- | --- | --- |
| `unregister` | director.rb:172 | public | unreachable | NO-CARRIER | no registry to unregister from: a save's director state lives and dies with its engine instance (src/card/actions/card-action-engine.ts:633); the ActWriter's per-request act state closes with the save (write-path.ts:733 currentActId, :361/:564 finalizeActCard) |
| `appoint` | director.rb:185 | public | external | NO-CARRIER | no registry: the engine instance constructed per save IS the per-act director (src/card/actions/card-action-engine.ts:633); subcard saves ride the same act by flag, not by registry lookup (src/card/actions/card-action-engine.ts:1444, :1529, :4850-4851 isActCard:false) |
| `main_director` | director.rb:202 | public | unreachable | NO-CARRIER | the act-owning engine is identified by its writer, not a registry: writer.currentActId() (src/card/actions/card-action-engine.ts:4129, :4144) and the one-act-per-request guard (src/card/actions/card-action-engine.ts:4142-4146, act.rb:64-68) |
| `replace_card` | director.rb:217 | public | external | INLINED-FIELD | Ruby swaps a renewed card object into its director; the port's stages re-read the live row each time they need card state (src/card/actions/card-action-engine.ts:903 fetchRowById in the integration walk; storedCard()/eventCard() built from the current row at :4902-4916, :4181-4193), so a renewed card needs no director swap |
| `prepare_for_phases` | director/all.rb:14 | public | external | INLINED-STAGE | the AR before-save hook that calls prepare_for_phases; the port's equivalent boundary is the save entry before its first stage dispatch (src/card/actions/card-action-engine.ts:3183/:4401 initialize, after atomicSave opens) |
| `clear_action_specific_attributes` | director/all.rb:98 | public | external | INLINED-FIELD | each stage receives a freshly built event card instead of an AR model with action attrs: eventCard()/storedCard() per stage (src/card/actions/card-action-engine.ts:4181-4193 carries changedFields explicitly; :4902-4916) |
| `start_new_act` | director/all.rb:114 | private | internal-reachable | INLINED-MECHANISM | the act row is the ActWriter's lazy INSERT INTO card_acts on the first persisted action (write-path.ts:766), plus the all-no-op act INSERT (src/card/actions/card-action-engine.ts:4147-4155) and the one-act-per-request guard (src/card/actions/card-action-engine.ts:4142-4146) |
| `add_to_act` | director/all.rb:121 | private | internal-reachable | INLINED-MECHANISM | each card's action joins the act through the ActWriter's save (src/card/actions/card-action-engine.ts:4834-4861 writer.updateCard with actId; creates at :3387/:3576); subactions join the act's result (src/card/actions/card-action-engine.ts:4122-4124) |
| `ensuring` | director/card_class.rb:64 | private | external | CARRIED-ELSEWHERE | Card.ensure's public semantics live in the eat pod's ensure() (src/card/pods/eat.ts:123, conflict mode at :137 via conflictMode), which resolves, creates or updates in one call; the private block-wrapper chain below it has no port counterpart because the pod's ensure is one function |
| `fetch_for_ensure_with_codename_and_name` | director/card_class.rb:93 | private | internal-reachable | CARRIED-ELSEWHERE | the pod's ensure resolves codename then name and compares their ids in the same walk: the fetch_for_ensure site at eat.ts:154-176 (codename row, then the name's id, the other-card arm when they differ); the advanced/conflict branch ensureAdvanced eat.ts:297 |
| `fetch_and_assign` | director/card_class.rb:102 | private | internal-reachable | CARRIED-ELSEWHERE | same walk: the id-or-row resolution then the create-or-update decision (eat.ts:154-176, liveIdByName/rowById then ensureAdvanced or the direct build) |
| `ensuring_purity` | director/card_class.rb:110 | private | internal-reachable | CARRIED-ELSEWHERE | the pod's ensure always operates on a purity-shaped input (an attrs map, never a live AR model), so Ruby's purity wrapper's model-rebuilding work has no separate step to carry (eat.ts:123) |
| `act_director` | director/class_methods.rb:9 | public | external | NO-CARRIER | reads/writes the act's main director in the registry; the port's act-level handle is the engine+writer pair itself (src/card/actions/card-action-engine.ts:4129, :4144; delayed-job carries the act id, not the director: delayed-job.ts:80-81) |
| `directors` | director/class_methods.rb:13 | public | internal-reachable | NO-CARRIER | the registry hash itself; the port binds no per-request director map (state lives on the engine instance, src/card/actions/card-action-engine.ts:633) |
| `clear` | director/class_methods.rb:31 | public | port-bound | NO-CARRIER | per-request registry teardown; the port's per-request state is garbage-collected with the engine instance (src/card/actions/card-action-engine.ts:633) - nothing to clear |
| `include_id?` | director/class_methods.rb:65 | public | unreachable | NO-CARRIER | registry membership test; no registry |
| `card_changed` | director/class_methods.rb:80 | public | external | NO-CARRIER | Ruby re-points a registry entry when the card's identity changes; the port's stages re-read rows by id/name (src/card/actions/card-action-engine.ts:903, :4902-4916) and renames write through the same save's writer, so no entry needs re-pointing |
| `deep_delete` | director/class_methods.rb:94 | public | external | NO-CARRIER | Ruby removes a director and its subdirectors from the registry; the port has no registry entries to remove |
| `new_director` | director/class_methods.rb:107 | private | internal-reachable | NO-CARRIER | director-class instantiation; the port has one director class, the engine itself (src/card/actions/card-action-engine.ts:633) |
| `running_act?` | director/class_methods.rb:115 | private | internal-reachable | INLINED-FIELD | the fetch-layer behavior (an act running changes fetch behavior) is carried by the writer's act state during a save (writer.currentActId(), src/card/actions/card-action-engine.ts:4129, :4860) |
| `run_job_with_act` | director/event_delay.rb:29 | public | internal-reachable | CARRIED-ELSEWHERE | the delayed-job module carries the act context on every IntegrateWithDelayJob row (delayed-job.ts:80-81 actId = Ruby's Card::Director.act&.id; the handler YAML at :199-230) and the engine performs the event within the restored act: performDelayedJob (src/card/actions/card-action-engine.ts:1082-1104) re-resolves the act via delayedJobAct and runs the hook inside it |
| `with_env_and_auth` | director/event_delay.rb:35 | public | internal-reachable | CARRIED-ELSEWHERE | the same rows carry Card::Env.serialize and Card::Auth.serialize (delayed-job.ts:55-70, serialized into the handler YAML at :211-228, auth.rb:40-42), which is what Ruby's with_env_and_auth restores; the perform side reads the same job (src/card/actions/card-action-engine.ts:1082) |
| `validation_phase_callback?` | director/phases.rb:9 | public | unreachable | NO-CARRIER | ActiveRecord callback-name introspection (:validation => ...); the port's stage boundaries are explicit call sites (src/card/actions/card-action-engine.ts:3183-3187, :3252), not AR callbacks, so there are no callback names to introspect |
| `integration_phase_callback?` | director/phases.rb:13 | public | unreachable | NO-CARRIER | same mechanism class; the integration phase is the engine's afterCommit block (src/card/actions/card-action-engine.ts:4168-4194), not an AR callback |
| `prepare_for_phases` | director/phases.rb:17 | public | external | INLINED-STAGE | the AR before-save hook that calls prepare_for_phases; the port's equivalent boundary is the save entry before its first stage dispatch (src/card/actions/card-action-engine.ts:3183/:4401 initialize, after atomicSave opens) |
| `validation_phase` | director/phases.rb:24 | public | unreachable | INLINED-STAGE | the AR around-callback running the validation phase; the port runs the same three stages as explicit dispatches (initialize + prepare_to_validate src/card/actions/card-action-engine.ts:3183-3187/:4401-4430, validate :3252/:4510) |
| `catch_up_to_stage` | director/run.rb:5 | public | external | NO-CARRIER | advances a director's stage pointer; the port has no per-card stage pointer - every stage runs exactly once per save at its fixed site |
| `run_delayed_event` | director/run.rb:13 | public | external | CARRIED-ELSEWHERE | the queued event is performed by performDelayedJob (src/card/actions/card-action-engine.ts:1082-1104, the event re-resolved from the act context delayedJobAct); the row it performs is the one delayedEventJob builds (src/card/actions/card-action-engine.ts:962-973, :992) and delayed-job.ts serializes (:199-230) |
| `handle_stage` | director/run.rb:44 | private | internal-reachable | INLINED-STAGE | runModEventStage runs one stage's registered events for one card (mod-event-dispatch.ts:776), called from dispatchEventStage (src/card/actions/card-action-engine.ts:6781-6840) |
| `run_stage_callbacks` | director/run.rb:56 | private | external | INLINED-STAGE | the explicit stage dispatches are the callback runs (prepare_to_store + store: src/card/actions/card-action-engine.ts:4862-4863, :4915-4916) |
| `run_subcard_stages` | director/run.rb:68 | private | external | INLINED-STAGE | subcards do not walk stages through a parent director: each subcard save rides the same act and runs its own stages (src/card/actions/card-action-engine.ts:1444, :1529 isActCard:false), and the act card's finalize defers past them (src/card/actions/card-action-engine.ts:4069) |
| `each_subcard_director` | director/run.rb:75 | private | internal-reachable | INLINED-MECHANISM | the port's subcard enumeration is the act result's subaction walk (src/card/actions/card-action-engine.ts:5644) over the save input's subcard collection (src/card/actions/card-action-engine.ts:6852, :6866-6880) |
| `run_final_stage_callbacks` | director/run.rb:83 | private | internal-reachable | INLINED-STAGE | the finalize dispatch (src/card/actions/card-action-engine.ts:7145 dispatchEventStage("finalize"), deferred past subcard saves at :4069) |
| `upto_stage` | director/run.rb:87 | private | internal-reachable | NO-CARRIER | stage-pointer arithmetic between directors; no per-card stage pointers exist |
| `valid_next_stage?` | director/run.rb:94 | private | internal-reachable | NO-CARRIER | guards stage-pointer advance; the port's sequence is fixed code, not an advanceable pointer |
| `valid_card?` | director/run.rb:105 | private | internal-reachable | NO-CARRIER | re-validates the card object before running a stage; the port re-reads the row per stage and refuses by throwing (src/card/actions/card-action-engine.ts:2354-2358: "the port refuses by throwing, so a refusal never reaches the seam"), so there is no card object whose validity can lapse |
| `check_skipped_stage` | director/run.rb:109 | private | internal-reachable | INLINED-MECHANISM | skip bookkeeping rides the runtime instead: the act's skip list filters events per stage at dispatch (src/card/actions/card-action-engine.ts:6797-6804 skip merge, actSkipList) |
| `ahead_of_parent?` | director/run.rb:116 | private | internal-reachable | NO-CARRIER | subcard-vs-parent stage-pointer comparison; the port's ordering is the engine's fixed defer (finalize past subcards, src/card/actions/card-action-engine.ts:4069), not a pointer comparison |
| `stage_symbol` | director/stages.rb:15 | public | external | INLINED-FIELD | the stage identity is the ModEventStage value itself, threaded through dispatchEventStage (src/card/actions/card-action-engine.ts:6781) and read by event predicates; the full symbol list is the port's stage union (mod-manifest.ts:169-180, all of Ruby's stages incl. after_integrate/integrate_with_delay/extend) |
| `stage_index` | director/stages.rb:25 | public | external | INLINED-STAGE | Ruby's SYMBOLS order (stages.rb:7-9) is the port's fixed dispatch sequence: initialize/prepare_to_validate/validate (src/card/actions/card-action-engine.ts:3183-3252), prepare_to_store/store (:4915-4916), finalize (:7145), integrate (:4179), integrate ordered before notify (:900-975) |
| `stage_ok?` | director/stages.rb:38 | public | external | NO-CARRIER | guards event bodies re-entering stages out of order; a port event body runs only inside its dispatched stage (runModEventStage, mod-event-dispatch.ts:776), so the guard's condition is unreachable |
| `finished_stage?` | director/stages.rb:45 | public | unreachable | NO-CARRIER | stage-pointer comparison; no pointer |
| `reset_stage` | director/stages.rb:49 | public | external | NO-CARRIER | resets the stage pointer; no pointer |
| `previous_stage_index` | director/stages.rb:55 | private | external | NO-CARRIER | stage-pointer arithmetic; no pointer |
| `previous_stage_symbol` | director/stages.rb:60 | private | external | NO-CARRIER | stage-pointer arithmetic; no pointer |
| `in_or_before?` | director/stages.rb:68 | private | external | NO-CARRIER | stage comparison against a pointer; a port hook's stage is fixed at registration and filtered per run (src/card/actions/card-action-engine.ts:942-943, :968), so no runtime comparison is needed |
| `in_or_after?` | director/stages.rb:76 | private | external | NO-CARRIER | same mechanism class |
| `stage_test` | director/stages.rb:84 | private | internal-reachable | NO-CARRIER | Ruby's test helper for asserting a card's stage; the port's parity tests drive stages through the engine directly (the battery harness), so no assertion shim exists |
| `after_store` | director/store.rb:5 | public | external | INLINED-MECHANISM | the port's after-store work runs at the post-write site: "the port's own place for the work is the POST-WRITE expiry, which is where Ruby's after_store callback lands" (src/card/actions/card-action-engine.ts:2268-2270, the update_lexicon carrier :2284-2293) |
| `after_store?` | director/store.rb:12 | public | internal-reachable | INLINED-MECHANISM | registered-body checks answer it: runtime.registry.all().find(...) (src/card/actions/card-action-engine.ts:2391, :2293 hasRegisteredBody :2397-2400) |
| `store_with_subcards` | director/store.rb:37 | private | internal-reachable | INLINED-STAGE | the store stage dispatch for persisted saves (src/card/actions/card-action-engine.ts:4915-4916, :4862-4863) with the subcard saves riding the same act (src/card/actions/card-action-engine.ts:4850-4851) |
| `run_after_store_callbacks` | director/store.rb:47 | private | internal-reachable | INLINED-MECHANISM | the post-write sequence: expireAfterWrite (src/card/actions/card-action-engine.ts:4878) and the deferred finalize arm (:4069) |
| `store_pre_subcards` | director/store.rb:53 | private | internal-reachable | INLINED-STAGE | subcard saves run inside the act card's walk before its deferred finalize (src/card/actions/card-action-engine.ts:4069, :1444, :1529); Ruby's pre/post split exists because AR saves the parent once - the port's single walk covers both orders |
| `store_post_subcards` | director/store.rb:57 | private | internal-reachable | INLINED-STAGE | same walk; subaction results join the act's result after the act card's own save (src/card/actions/card-action-engine.ts:4122-4124) |
| `trigger_storage_phase_callback` | director/store.rb:65 | private | internal-reachable | INLINED-STAGE | the store dispatch runs inside the write transaction (src/card/actions/card-action-engine.ts:4915-4916 within atomicSave; the storage-phase AR callback has no port counterpart) |
| `initialize_with_subcards` | director/subdirector_array.rb:5 | public | external | INLINED-MECHANISM | the port's subcard collection is built from the save input (prepareSubcardCollection, src/card/actions/card-action-engine.ts:6866-6880; field pendingSubcardCollection :6852), not from instantiating per-subcard directors |
| `fetch_new` | director/subdirector_array.rb:39 | private | internal-reachable | INLINED-MECHANISM | subcard engines are constructed during the walk as needed (src/card/actions/card-action-engine.ts:1444, :1529), one per subcard save riding the act; there is no array to fetch from |

Kind counts: CARRIED-ELSEWHERE 7, INLINED-FIELD 4, INLINED-MECHANISM 9, INLINED-STAGE 12, NO-CARRIER 25 (total 57).

## What would falsify this

- A saved act whose recorded `events` order diverges from Ruby's (the traces' events field is the stage machinery made visible).
- A save where the port's fixed sequence misses a stage Ruby ran (the three comparisons would show a missing events entry or a row-delta mismatch).
- A delayed-job run whose act/env/auth context a port worker cannot restore (the handler YAML carries all three at delayed-job.ts:199-230 and performDelayedJob restores the act at ENG:1082; the path is NOT exercised by the battery: Ruby's trace records delaying:false, and the port's drive passes no delayedJobs config, whose documented default is the same inline integrate_with_delay - ENG:496-502).

## The adversarial second pass (this lane, same session, re-derivation)

No second agent was available; the pass re-derived every conclusion from the captures with fresh
checks. What it attacked and what changed:

- The 57-row gem match was re-verified against MY OWN enumeration of the pinned bytes (not the
  fixture's roster): 57/57 name+file+line exact. The instrument's 119 vs a naive scan's 123 was
  reconciled: the four extras are two `initialize` and two `to_s` defs the instrument excludes.
- The no-registry claim was re-checked mechanically: a grep of src/card for `class Director`,
  `DirectorRegistry`, `directors.set`, `appoint` answers nothing - the port binds no registry.
- The event_delay mapping was STRENGTHENED after the pass: the first draft cited only the row
  builder; the pass found the perform side (performDelayedJob, ENG:1082) and the handler YAML's
  act/env/auth serialization (delayed-job.ts:199-230), and both rows now cite both ends.
- The ensure mapping was CORRECTED: the first draft's line range for the pod's fetch_or_create arm
  was too tight; the pass located the named fetch_for_ensure site (eat.ts:154) and the rows now
  cite it.
- The delaying claim was RESTATED: the port's drive trace carries no delaying field (the
  comparator compares steps, not the envelope), so the equivalent-posture claim now stands on the
  recorded Ruby delaying:false plus the engine's documented omitted-config default (ENG:496-502),
  named as such.
- The mail difference was traced to the comparator's own normalization (compare.mjs:224-227 folds
  every unfollow URL to a placeholder), so the comparator's mail PASS carries one deliberately
  normalized declared difference; TRACE-COMPARISONS.md enumerates it as such.

