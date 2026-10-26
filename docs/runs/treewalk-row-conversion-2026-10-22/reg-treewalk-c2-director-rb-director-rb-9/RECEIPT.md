# reg-treewalk-c2-director-rb-director-rb-9

- Ruby's file set: `card-1.110.0/lib/card/director.rb + director/.rb (9)`
- The row's own label: `director.rb` + `director/*.rb` (9)
- 10 Ruby file(s), 119 def(s).
- PORTED 25 / PORTED-INLINE 35 / NAMED-COLLAPSE 10 / SKIP 1 / INERT-API 0 / GAP 48.

## Verdict: WORKING ON IT

The port does not carry 48 of the row's defs: the forty-eight defs the port does not carry are the nine director/ sub-files (the run and stage walk, the store, the phases, the class methods, the card-class helpers, the event-delay pair, the act entry points and the subdirector array), while the row's own director.rb surface is closed - the port's source names all eleven of its methods (src/card/history/write-path.ts, the ActWriter class doc) and carries the act's main director, the act's sharing and the joining card by the writer's two pointers, the act card id and the act id.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `prepare_for_phases` | all.rb:14 | public | external |
| `clear_action_specific_attributes` | all.rb:98 | public | external |
| `start_new_act` | all.rb:114 | private | internal-reachable |
| `add_to_act` | all.rb:121 | private | internal-reachable |
| `ensuring` | card_class.rb:64 | private | external |
| `fetch_for_ensure_with_codename_and_name` | card_class.rb:93 | private | internal-reachable |
| `fetch_and_assign` | card_class.rb:102 | private | internal-reachable |
| `ensuring_purity` | card_class.rb:110 | private | internal-reachable |
| `act_director` | class_methods.rb:9 | public | external |
| `directors` | class_methods.rb:13 | public | internal-reachable |
| `include_id?` | class_methods.rb:65 | public | unreachable |
| `card_changed` | class_methods.rb:80 | public | external |
| `deep_delete` | class_methods.rb:94 | public | external |
| `new_director` | class_methods.rb:107 | private | internal-reachable |
| `running_act?` | class_methods.rb:115 | private | internal-reachable |
| `run_job_with_act` | event_delay.rb:29 | public | internal-reachable |
| `with_env_and_auth` | event_delay.rb:35 | public | internal-reachable |
| `validation_phase_callback?` | phases.rb:9 | public | unreachable |
| `integration_phase_callback?` | phases.rb:13 | public | unreachable |
| `prepare_for_phases` | phases.rb:17 | public | external |
| `validation_phase` | phases.rb:24 | public | unreachable |
| `run_delayed_event` | run.rb:13 | public | external |
| `handle_stage` | run.rb:44 | private | internal-reachable |
| `run_stage_callbacks` | run.rb:56 | private | external |
| `run_subcard_stages` | run.rb:68 | private | external |
| `each_subcard_director` | run.rb:75 | private | internal-reachable |
| `run_final_stage_callbacks` | run.rb:83 | private | internal-reachable |
| `upto_stage` | run.rb:87 | private | internal-reachable |
| `valid_next_stage?` | run.rb:94 | private | internal-reachable |
| `valid_card?` | run.rb:105 | private | internal-reachable |
| `check_skipped_stage` | run.rb:109 | private | internal-reachable |
| `ahead_of_parent?` | run.rb:116 | private | internal-reachable |
| `stage_symbol` | stages.rb:15 | public | external |
| `stage_index` | stages.rb:25 | public | external |
| `stage_ok?` | stages.rb:38 | public | external |
| `finished_stage?` | stages.rb:45 | public | unreachable |
| `previous_stage_index` | stages.rb:55 | private | external |
| `previous_stage_symbol` | stages.rb:60 | private | external |
| `in_or_before?` | stages.rb:68 | private | external |
| `in_or_after?` | stages.rb:76 | private | external |
| `stage_test` | stages.rb:84 | private | internal-reachable |
| `store_with_subcards` | store.rb:37 | private | internal-reachable |
| `run_after_store_callbacks` | store.rb:47 | private | internal-reachable |
| `store_pre_subcards` | store.rb:53 | private | internal-reachable |
| `store_post_subcards` | store.rb:57 | private | internal-reachable |
| `trigger_storage_phase_callback` | store.rb:65 | private | internal-reachable |
| `initialize_with_subcards` | subdirector_array.rb:5 | public | external |
| `fetch_new` | subdirector_array.rb:39 | private | internal-reachable |

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-round1b-20261024` in KatsuJinCode/decko-ts.

## Workbatch-c lane, 2026-10-25: the row stays WORKING, the blocker named

The workbatch-c lane examined this row for closure and names the mechanism
that blocks it. The row's 57 gaps are the director REGISTRY, the run/stage
machinery and the store machinery of a per-act director architecture. The
port carries the stage semantics by a different architecture, not by a
parallel mechanism a row close could cite: the action engine
(src/card/actions/card-action-engine.ts) dispatches an act's stages in one
call - `dispatchEventStage("initialize" | "prepare_to_validate" |
"validate" | "prepare_to_store" | "store" | "finalize" | "integrate")` at
card-action-engine.ts:1224-1225, :3077-3081 and the store/integrate sites -
which is Ruby's Director::Stages::SYMBOLS order (stages.rb:7-9) without a
Director object, a registry (appoint/unregister/main_director/directors),
a subdirector array, or ActiveRecord's callback-borne stage boundaries the
run.rb and store.rb halves hang off. A faithful port of the 57 defs would
replace the engine's act lifecycle with Ruby's director architecture -
wiring the registry through the save path is an architecture decision above
a row close, and porting the defs unwired would be dead code pretending to
be a close. The lane leaves the row WORKING and moves on; the instrument at
this branch's tip still answers GAP=57 for it, unchanged.

## The director.rb surface, closed (port/treewalk-director-20261026, 2026-10-26)

The roster's REAL-GAP note for this row named seven defs of `director.rb`
(`main?`, `head?`, `unregister`, `appoint`, `need_act`, `main_director`,
`replace_card`) and said: port the named methods. The rig measured four of
them as gaps at this tip (`unregister`, `appoint`, `main_director`,
`replace_card`); the other three already carried a disposition. What landed:

1. The port's own source now names ALL ELEVEN of `director.rb`'s methods
   and the port's counterpart for each (src/card/history/write-path.ts:246,
   the ActWriter class doc), the two sites where the act's facts live name
   the Ruby method they answer (write-path.ts:773 for `need_act`, :970 for
   `main?`), and the engine names the joining card's save
   (src/card/actions/card-action-engine.ts, `saveSubcardsInWriter`).
2. A named test pins the port's act lifecycle against real SQLite storage:
   tests/card/actions/director-act-lifecycle.test.ts (4 cases, all passing
   at this tip).
3. The pinned bytes were executed again for the row's 238 probes and the
   fixture was regenerated
   (fixtures/captured/card-director-methods-ruby-oracle.json).
4. The rig's own measurement of this row at this tip: GAP 53 -> 48, and the
   row's own `director.rb` gap count 4 -> 0. Every one of the row's 48
   remaining gaps is in one of the nine `director/` sub-files.

| def | Ruby | the pinned deck reaches it | the port's counterpart | the rig |
| --- | --- | --- | --- | --- |
| `main?` | director.rb:160 | 0 calls | the writer's `isActCardOp`: the one operation that claims act-card status is the act's main card (write-path.ts:250, :970) | PORTED |
| `head?` | director.rb:164 | 0 calls | no counterpart: the port has no director chain and no per-card stage index (write-path.ts:268) | PORTED |
| `register` | director.rb:168 | 0 calls | no counterpart: the port has no director registry to add to (write-path.ts:280) | PORTED-INLINE |
| `unregister` | director.rb:172 | 0 calls | no counterpart: the port has no director registry, so the registry has nothing to remove (write-path.ts:271) | NAMED-COLLAPSE |
| `delete` | director.rb:176 | 0 calls | no counterpart: the port has no director object, so there is no director state to clear (write-path.ts:282) | NAMED-COLLAPSE |
| `appoint` | director.rb:185 | 1 call (director/all.rb:122) | the joining save inside the SAME writer: the joining card's action row carries the act id, and the joining card runs its own stage walk from "initialize" (write-path.ts:261; card-action-engine.ts, `saveSubcardsInWriter`) | PORTED-INLINE |
| `abort` | director.rb:191 | 32 calls in the deck | the engine's rollback arm: an aborted act runs no integration phase (card-action-engine.ts, the `withinRollback` arm) | PORTED-INLINE |
| `need_act` | director.rb:195 | 1 call (director.rb:199), and the deck's history mod reads it when it builds the action row (card-mod-history-0.20.0/set/all/history/events.rb:76) | the writer's lazy act INSERT: the card_acts row is created with the first persisted action of the request, and every later operation of that request reuses it (write-path.ts:257, :773) | PORTED-INLINE |
| `main_director` | director.rb:202 | 2 calls (director.rb:196, :205) | the pair (`actCardId`, `currentActId`): the act's card and the act's row. There is no chain to walk up, because the port has no director objects (write-path.ts:253) | PORTED-INLINE |
| `replace_card` | director.rb:217 | 1 call (director/subdirector_array.rb:46) | no counterpart: the port has no director object to re-point at another card object, because a card in the port is its row, addressed by id (write-path.ts:274) | NAMED-COLLAPSE |
| `update_card` | director.rb:225 | 0 calls | no counterpart, for the same reason: the card a save writes IS the row (write-path.ts:277) | PORTED |

### What four of the rig's labels rest on, named

Four of `director.rb`'s labels rest on a NAME-LEVEL match rather than on the
port's own claim, and this receipt says so rather than leaving the reader to
find it:

- `main?` is PORTED through `card/mod-loader/mods/card-mod-history.ts:1907`,
  a `const main` binding in the history mod, whose file cites
  `set/event/all.rb`. The rig's citation rule reads that citation as this
  row's `all.rb`, because the leaf is unique in the row's file set and the
  rule matches a citation that ENDS with the leaf. The port's own claim for
  `main?` is `write-path.ts:250`.
- `head?` is PORTED through `card/render/head-views.ts:87` for the same
  reason (`set/all/head.rb`). The port's own claim for `head?` is the
  collapse at `write-path.ts:268`.
- `register` is PORTED-INLINE through `card/set-patterns/registry.ts:15`
  (`lib/card/set/pattern/class_methods.rb#register`, another gem's file with
  the row's `class_methods.rb` leaf). The port's own claim for `register` is
  the collapse at `write-path.ts:280`.
- `update_card` is PORTED through `card/actions/card-action-engine.ts:3738`,
  the port's own `updateCard` declaration, whose file cites
  `lib/card/director/card_class.rb`. The port's own claim for `update_card`
  is the collapse at `write-path.ts:277`.

The rig's rules are its own, stated in its own header ("the port file must
cite this row's Ruby source, and the file must carry the def's name"), so
this lane did not change them: a change to the rig's citation rule reaches
every one of the family's 62 rows, 17 of them closed DONE, and belongs to
the family's own lane rather than to one row's lane. The measurement is the
rig's; the port's claims are the port's; this receipt gives both.

### The remaining forty-eight, and the mechanism

The forty-eight defs the port does not carry are the nine `director/`
sub-files: the run and stage walk (`director/run.rb` 11, `director/stages.rb`
9), the store (`director/store.rb` 5), the phases (`director/phases.rb` 4),
the class methods (`director/class_methods.rb` 7), the card-class helpers
(`director/card_class.rb` 4), the event-delay pair (`director/event_delay.rb`
2), the act entry points (`director/all.rb` 4) and the subdirector array
(`director/subdirector_array.rb` 2). They are the per-act director
architecture itself: a registry of director objects, a parent chain, a
per-card stage index and ActiveRecord's callback-borne stage boundaries.
The port carries that machinery by a different mechanism, the action engine
dispatching an act's stages in one call
(src/card/actions/card-action-engine.ts, `dispatchEventStage`), and the port
has no director objects to hang a faithful counterpart on. Porting those
defs unwired would be dead code pretending to be a close, so the row keeps
its bucket with the gap named, exactly as the workbatch-c lane left it.

### The commands this lane ran

- `node tools/treewalk-family-row-disposition.mjs reg-treewalk-c2-director-rb-director-rb-9`
  - at this tip before the port edits: `files=10 defs=119 PORTED=25 INLINE=32 SKIP=1 GAP=53`
  - at this tip after the port edits: `files=10 defs=119 PORTED=25 INLINE=35 SKIP=1 GAP=48`
- `DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems DECKO_TREEWALK_CAPTURE_OUT=fixtures/captured/card-director-methods-ruby-oracle.json ruby tests/server/oracle-capture-card-gem-row-methods-ruby.rb reg-treewalk-c2-director-rb-director-rb-9`
  - exit 0, 238 probes over the pinned bytes
- `./node_modules/.bin/vitest run tests/server/treewalk-row-disposition-parity.test.ts`
  - 204 passed (204)
- `./node_modules/.bin/vitest run tests/card/actions/director-act-lifecycle.test.ts`
  - 4 passed (4)

Branch: `port/treewalk-director-20261026` in KatsuJinCode/decko-ts.

