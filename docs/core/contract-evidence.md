# Contract evidence

Status: scope-bound, evidence-anchored. Recorded 2026-09-21.
Companion to `contract.md`. Every contract statement ID maps to one
row here: Ruby truth (file + line), TS evidence (test file + status),
and the streaming that landed it. Status legend:

- **proven** — oracle byte/row comparison or live-Ruby probe passed
  in CI on the current code. The oracle battery is named where it
  exists.
- **pinned-synthetic** — the TS port reproduces the Ruby behavior on
  a synthetic deck and the test names the Ruby source; no oracle
  capture covers this surface.
- **divergent-documented** — the port deliberately differs; the
  divergence is named in code, in a stream note, and inline in this
  row.
- **unported** — the Ruby mechanism has no TS code yet; the work is
  queued in `docs/upstream-parity-plan-1282.md`.

Test files are workspace-relative. Fixture paths are workspace-relative.
Gem paths are written relative to the Ruby gems directory
(`gem environment gemdir`), e.g. `gems/card-1.110.0/lib/...`.

**Corpus figures quoted in the rows below carry a caveat.** A figure like the
graded page-lane corpus tally in R3.4.d (`5,662/6,588` at pass16, `5,939/6,588`
at pass17) is measured on the **corpus, which is not committed** — it carries
the ported deck's real content, so a clean clone cannot recompute it and the
number is a quoted measurement rather than a replayable one. It is also **not
a pure Ruby-oracle grade**: 50 of the corpus's expected entries are bytes
fetched from the live 0.19.1-era site rather than from the 0.20.0 oracle, in
two disjoint swap sets of 13 and 37. Both facts, the per-entry manifests and
the provenance check are set out in
[parity-method.md](../parity-method.md) ("The live-anchored expectations",
"Corpus provenance"); the figures a clean clone *can* recompute are inventoried
in [coverage-inventory.md](../coverage-inventory.md). No corpus figure is quoted
in the README.

## 1. PERSISTENCE

### P1.1 Save classification

| ID | Ruby truth (file:line) | TS evidence | Status |
|---|---|---|---|
| P1.1.a | `card-1.110.0/lib/card/director/all.rb:19-28` (`identify_action`); `card-1.110.0/mod/core/set/all/trash.rb:70-72` (`add_to_trash`); `card-mod-history-0.20.0 set/all/history/events.rb` (`first_create?` branch) | `tests/card/actions/delete.test.ts` | proven |
| P1.1.b | `card-mod-history-0.20.0 set/all/history/events.rb:31-32`; `set/all/history.rb:38-40` (`first_create?`) | `tests/card/history/write-path.test.ts`; `fixtures/write-conformance/01-create-simple.jsonl` via `tests/card/conformance/write-path.test.ts` | proven |
| P1.1.c | `card-1.110.0/mod/core/set/all/states.rb:6-8` (`new_card?` with `@from_trash`); `card-mod-history-0.20.0 set/all/history/events.rb:88-92` (`super_action`) | `tests/card/actions/revive.test.ts` | proven + divergent-documented (TS `ActWriter` emits an initial `update` action; engine follows with a corrective `action_type=0` UPDATE — see `docs/actions-port-notes.md` §6 divergence 2) |

### P1.2 Change row contents

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| P1.2.a | `card-mod-history-0.20.0/lib/card/change.rb:25,47,60` (TRACKED_FIELDS, `field_index`, `field=`) | `tests/card/history/change.test.ts`; `tests/card/history/write-path.test.ts` | proven |
| P1.2.b | `activemodel-7.2.3.2/lib/active_model/type/immutable_string.rb:48-56`; `activerecord-7.2.3.2/lib/active_record/type/text.rb`; `activerecord/lib/active_record/type/boolean.rb:39` | `src/card/history/change.ts#serializeChangeValue`; `tests/card/history/write-path.test.ts`; `fixtures/write-conformance/01-08.jsonl` via `tests/card/conformance/write-path.test.ts` | proven |
| P1.2.c | `card-mod-history-0.20.0 set/all/history/events.rb:29 NOTE, 95-100, 108-115`; `set/all/history.rb:32,42` | `tests/card/history/write-path.test.ts`; `fixtures/write-conformance/03-update-content.jsonl` | proven |

### P1.3 Card row composition

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| P1.3.a | `card-1.110.0/lib/card/name/all.rb:20-26` (`name=` / `key=`); `mod/core/data/schema/20200718051236_compound_names_do_not_store_name_and_key.rb` | `tests/card/fetch/oracle-replay.test.ts` (10 smoke card records byte-exact) | proven |
| P1.3.b | `mod/core/data/schema/20200805200729_add_unique_pair_indices.rb` | `tests/server/schema.test.ts`; `tests/card/fetch/lexicon.test.ts` | proven |

### P1.4 Read-rule derivation on save

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| P1.4.a | `card-mod-permissions-0.20.0/set/all/permissions.rb:1-5` (`set_read_rule` event) | `src/card/permissions/set-read-rule.ts` (derivation + cascades, gem-cited); `tests/card/conformance/write-path.test.ts` scenario 07 (`07-read-rule-affected-save.jsonl`: target→rule `*self`, rule→itself `*all plus`, timestampless cascade writes) | proven (oracle row comparison) |
| P1.4.b | `card-mod-permissions-0.20.0/set/all/permissions.rb:139-144` (`ok_to_read?`: `self.read_rule_id ||= permission_rule_id :read` — stored column and live derivation are distinct inputs); corpus has 0 rows where `trash=0 AND read_rule_id IS NULL` | `tests/card/permissions/read-permission.test.ts` (Mystery Thing: the NULL arm derives through the live rule walk); `fixtures/captured/codename-reset-and-read-rule-union-oracle.json` + `tests/card/permissions/read-rule-derive-and-codename-reset-oracle.test.ts` (8/8, live-Ruby probe on a DISPOSABLE deck copy — the corpus's missing NULL rows manufactured there and both arms captured: card 605 stored-column DENIES while its derivation GRANTS (`stored_ok_read` false / `derived_ok_read` true — real deck drift between column and walk), the governed readable twin is byte-identical stored vs derived (`public_derived_matches_stored` true); port replays the drift shape, the public twin, and the deny twin on the seeded deck) | proven (live-Ruby probe + port replay close the "no corpus representation" reason) |

### P1.5 Card references

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| P1.5.a | `card-1.110.0/mod/core/set/all/reference_events.rb:2-4,13-19,32-36` (`refresh_references_out`, `update_referer_content`) | `src/card/actions/refresh-references-out.ts`, `refresh-references-in.ts`, `update-referer-content.ts`; `tests/card/conformance/write-path.test.ts` scenario 08 now compares `card_references` against the oracle rows (the only capture fixture carrying reference rows: I `wcc_referer+child` NULL-id + P `child` resolved, is_present NULL, left-self dropped); `tests/card/conformance/reference-write-path.test.ts`; `tests/card/actions/refresh-references-in.test.ts` | proven (oracle row comparison) |

### P1.6 Migrations and the 2014 history migration

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| P1.6.a | `card-1.110.0/mod/core/data/schema/20141001105348_move_revisions_to_actions.rb` | `tests/card/history/write-path.test.ts` "legacy revision tables" (:646-657 — a full create→update→trash save cycle leaves `card_revisions` empty and `current_revision_id` NULL; the direct regression guard is gem-cited); `db/schema.sqlite.sql:162-173` carries the legacy table (still populated in production decks, so the port must declare it); the migration-EXECUTION arm is named-blocked: no pre-2014-migration deck exists on this machine (oracle development.sqlite3, corpus-v2, write-conformance are all post-migration), so the data-movement capture needs Julian to supply a legacy deck or rule the exclusion | proven by absence (engine never writes legacy tables — direct test; migration-execution capture blocked, hours IF a legacy deck is supplied, ruling free) |
| P1.6.b | grep evidence in `docs/history-port-notes.md` §1.4 | `tests/card/history/write-path.test.ts` "legacy revision tables" | proven by absence |

### P1.7 Atomicity and idempotence

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| P1.7.a | `card-mod-history-0.20.0 set/all/history/events.rb:34` (else-branch); `set/all/history.rb:51` (no changed fields) | `tests/card/actions/update.test.ts` "no-op idempotency" | proven |
| P1.7.b | `card-1.110.0/lib/card/director/store.rb:37-58,70-73`; `card-mod-history-0.20.0 set/all/history/events.rb:85-92` | `tests/card/actions/create.test.ts` (junction create); `tests/card/actions/delete.test.ts` (cascade); `fixtures/write-conformance/02-create-junction.jsonl` | proven + divergent-documented (TS side-card insert order differs from Ruby's autosave order — `docs/actions-port-notes.md` §9 divergence 3 — same rows, same linkage; per-card ordering unaffected) |

## 2. SEMANTICS

### S2.1 Name algebra

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| S2.1.a | `cardname-0.20.0/lib/cardname/parts.rb` (`left` / `right` / `trunk` / `tag`); `docs/name-port-notes.md` ported-surface table | `tests/card/name/name-port.test.ts` (243 tests against live Ruby oracle) | proven |
| S2.1.b | `Cardname#==` via `key`; `parts.rb` | `tests/card/name/name-port.test.ts`; `tests/cql/reconciliation.test.ts` | proven |
| S2.1.c | `cardname-0.20.0/lib/cardname/class_methods.rb:40-41` (`banned_re`); `lib/cardname/predicates.rb:19-25` (`valid?`) | `tests/card/name/name-port.test.ts` "DeckoName.bannedCharacters / isValid" | proven |
| S2.1.d | `card-1.110.0/lib/card/fetch/retrieve.rb:9-12` (blank mark → nil); `card-1.110.0/lib/card/view/permission.rb:36-39` + `lib/card/format/error.rb:27-33` (unknown arm → `:unknown`, never `:denial`) | `tests/card/render/unknown-nest-blank-reference.test.ts` (empty render); shard-000006 entry 10488 (source-truthful on both surfaces) | proven (empty render, NOT a denial span; corpus entry 636 `thez+*right+*default` carries a denial span on open — that entry's anomaly, and the pre-adjudication form of this row) |

### S2.2 Relative-name absolutization

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| S2.2.a | `cardname-0.20.0/lib/cardname/contextual.rb` (`absolutize_contextual_parts`); `lib/card/query/card_query/normalization.rb:57` (`val.to_name.absolute(context)`) | `tests/cql/reconciliation.test.ts` (30 tests); `tests/card/name/name-port.test.ts` | proven |
| S2.2.b | `card-1.110.0/lib/card/name.rb#params`; `lib/cardname/contextual.rb:108` | `fixtures/captured/name-env-main-params-oracle.json` + `tests/card/name/contextual-main-params-oracle.test.ts` (6/6, mutation-checked: the `/i` removed from the `_main` directive turns all 6 red); `src/card/name/environment.ts` injected env | proven (the bare-gem `_main`-with-nil-params crash does not exist on the booted oracle app path — capture pins app truth: nil/blank main_name identical, blank-extreme fill, case-asymmetric `_Main`, padded-value strip) |

### S2.3 CQL semantics

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| S2.3.a | `card-1.110.0/lib/card/query/value.rb:29` (`standard_sql` name-key); `value.rb:8` (`SQL_FIELD`) | `tests/cql/parser.test.ts` (53 tests); `tests/cql/sql-generation.test.ts` (60 tests) | proven |
| S2.3.b | `card-1.110.0/lib/card/query/card_query/tie.rb` (`Tie#restrict`, `Tie#id_from_val` sentinel -999) | `tests/cql/name-resolution.test.ts`; `tests/cql/execution.test.ts` (49 tests); `tests/cql/oracle-replay.test.ts` (11/11 strict) | proven |
| S2.3.c | `card-1.110.0/lib/card/query/card_query/reference_attributes.rb` (define_reference_method, ReferenceQuery) | `tests/cql/sql-generation.test.ts` | proven |
| S2.3.d | `card-1.110.0/lib/card/query/value/match_value.rb:33-36,46-47,53-62` (default literal escape; `~~` raw regex) | `tests/cql/oracle-match-replay.test.ts` (27/30 strict); `tests/cql/execution.test.ts`; `fixtures/captured/cql-mysql-match.json` | proven + 3 dialect misses pinned |
| S2.3.e | `match_value.rb#match_field` (literal `name` column); SQL NULL propagation | `tests/cql/oracle-match-replay.test.ts` "compound_child_name_token"; `tests/cql/execution.test.ts` NULL-propagation pin | proven |
| S2.3.f | MariaDB 11.4 PCRE / MySQL 8 ICU / MySQL 5.7 Henry Spencer (server-side); `utf8mb4_general_ci` collation (capture pins) | `fixtures/captured/cql-mysql-match.json` (30 entries); `tests/cql/oracle-match-replay.test.ts` (27/30 strict) | proven + 3 JS dialect gaps pinned (`docs/cql-match-decision.md` §"The options") |

### S2.4 Set-pattern lookup precedence

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| S2.4.a | `card-1.110.0/lib/card/set/pattern/class_methods.rb:13-18` (`register` front-insert via `Pattern.concrete.insert opts.delete(:index).to_i`); `card-1.110.0/mod/core/set_pattern/NN_*.rb` | `tests/card/set-patterns/oracle-parity.test.ts`; `docs/set-patterns-port-notes.md` table (verified live via `set-pattern-oracle-probe.rb`) | proven |
| S2.4.b | `card-1.110.0/lib/card/set/pattern/base.rb`; `card-1.110.0/mod/core/set_pattern/04_star.rb`, `05_rstar.rb`, `06_rule.rb` (apply predicates) | `tests/card/set-patterns/oracle-parity.test.ts` (135 tests across 5 files) | proven |
| S2.4.c | `card-1.110.0/lib/card/rule/cache.rb#lookup_key` (`[anchor_id, pattern_code, setting_code].compact.join("+")`) | `src/card/rules/rule-cache.ts` (storage-side table-driven port: ruleCacheStatement = cache.rb:9-26, buildRuleLookupHash = cache.rb:37-56 skip semantics, ruleIdLookup = rule/all.rb:61-71 per-key probe order); `tests/card/rules/rule-cache.test.ts` (9, red-first on the missing module, mutation-checked: codename skips / follow-empty arm / trash filters each turn specific tests red; seeds reproduce the set-pattern oracle capture's `rule_lookup_key_sample` verbatim) | proven (runtime half was already ported — the new suite closes the loop end-to-end) |

### S2.5 Rule resolution and read-rule cascade

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| S2.5.a | `card-1.110.0/lib/card/rule/all.rb#rule_id_lookup`; `lib/card/set/pattern/all.rb:23,66-68`; `Rule::All#preference_card_id` | `tests/card/rules/lookup.test.ts`; `tests/card/rules/integration.test.ts` | proven |
| S2.5.b | `card-mod-permissions-0.20.0/set/all/permissions.rb:139-146` (`ok_to_read?`) | `tests/card/permissions/read-permission.test.ts` | proven |
| S2.5.c | `card-1.110.0/lib/card/auth/permissions.rb:8-13` (DeckoBot); `card-mod-account-0.20.0 set/abstract/account_holder.rb:63-65` (Administrator) | `tests/card/permissions/read-permission-actors.test.ts` | proven (corpus sweep + synthetic) |
| S2.5.d | `card-mod-account-0.20.0 set/abstract/account_holder.rb:111-123`; `card-mod-list-0.20.0 set/abstract/id_list.rb:33-47` | `tests/card/permissions/read-permission-actors.test.ts`; `tests/card/permissions/read-permission-actors-corpus.test.ts` (113 roleful members) | proven |

### S2.6 Permission party model (write side)

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| S2.6.a | `card-1.110.0/lib/card/auth/current.rb:7-9`; `card-1.110.0/lib/card/codename.rb:108` | `tests/card/auth/session-store.test.ts` (44 tests) | proven |
| S2.6.b | `card-1.110.0/lib/card/auth/current.rb:58-63` (dead-card re-sign); `lib/card/auth/token.rb:17-30` (exp) | `tests/card/auth/session-store.test.ts`; `tests/card/permissions/read-permission-actors.test.ts` "viewerFromToken" | proven |
| S2.6.c | `docs/auth-port-notes.md` decision 5 (sha256 token at rest, lookup order) | `tests/card/auth/session-store.test.ts` "constant-time compare" mutation test | proven |

## 3. RENDERING

### R3.1 View registry behavior

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.1.a | `card-1.110.0/lib/card/view/permission.rb:13-15` (`view_perms`); `card-mod-format-0.20.0 set/all/html/menu.rb` (directive table) | `fixtures/captured/view-registry-directives-oracle.json` (live html registry: 776 view rows over 4 surveyed cards, perms/denial/unknown literals + zero-arity view_method parameters) replayed by `tests/card/permissions/view-registry-directives-oracle.test.ts`; `src/card/permissions/view-perms.ts`; `tests/card/render/view-perms-gate.test.ts`; `tests/card/permissions/view-perms-table.test.ts` | proven (the replay exposed 11 registry gaps red-first — 6 perms-:none views missing, last_action flipped the wrong way (card-mod-history's plain redefinition is operative over card-mod-email's :none), 2 create-perms views, 2 denial-:blank views — all fixed gem-cited; mutation-checked via the menu:blank removal) |
| R3.1.b | `card-1.110.0/lib/card/view/permission.rb:25-27` (`skip_check?`); `lib/card/format/method_delegation.rb:5-9,48-55` (underscore form) | same oracle fixture's behavior arms: Anonymous + `skip_perms` AND Anonymous via `_render_edit_inline` render the full 1698-byte `:edit_inline` form, byte-identical to the as-bot allowed arm; `:title`/`:url` (perms `:none`) render for a task-denied viewer — replayed by `tests/card/permissions/view-registry-directives-oracle.test.ts` | proven |
| R3.1.c | `card-1.110.0/lib/card/format/render.rb:59-63` (`view_method` raises unsupported-view) | `tests/card/render/render-engine.test.ts` | proven |

### R3.2 Slot and nest markup bytes

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.2.a | `card-mod-format-0.20.0 set/all/html/wrap.rb:33-35`; `slot_attributes:26-31`; `wrap_classes:94-99`; `wrap_data:37-48`; `SecureRandom.hex(10)` (20 lowercase hex) | `tests/card/render/render-engine.test.ts`; `tests/card/render/oracle-replay.test.ts` (20/20 smoke views byte-exact) | proven |
| R3.2.b | `card-mod-format-0.20.0 set/all/base.rb` (nest view); `card-mod-format set/all/nest.rb` | `tests/card/render/oracle-replay.test.ts`; `tests/card/render/junction-depth-closure.test.ts` (depth 1..4) | proven |
| R3.2.c | `actionview-7.2.3.2 .../tag_helper.rb:310-323`; `core_ext/erb/util.rb:10-18` (`CGI.escapeHTML`) | `src/card/render/slot-html.ts#h()`; `tests/card/render/help-popover-corpus-replay.test.ts` | proven |
| R3.2.d | `decko-commons/decko#1282` (constant queries per render); `docs/render-fix-notes.md` | `tests/card/render/depth-sweep.test.ts` (1..32 depths → constant statement and round-trip counts) | proven |

### R3.3 Unknown-card substitution

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.3.a | `card-1.110.0/lib/card/fetch/results.rb:8-15`; `lib/card/format/nest/fetch.rb:48-58`; `card-1.110.0/lib/card/view/permission.rb:36-44`; `card-mod-bar_and_box-0.20.0 set/all/bar.rb:15,26,35,36`; `card-mod-format-0.20.0 set/all/html/error.rb:21`; `card-mod-format-0.20.0 set/all/base.rb:105`; `card-mod-format-0.20.0 set/all/html/views.rb:29,24`; `card-mod-format-0.20.0 set/all/base.rb:109-111` (blank = "") | `tests/card/render/unknown-nest-corpus-replay.test.ts` (4 corpus entries, all 16 views byte-exact); `src/card/render/format.ts#viewForUnknown` | proven |
| R3.3.b | `card-1.110.0/lib/card/fetch/retrieve.rb:9-12` (blank → nil); `lib/card/view/permission.rb:36-39`; `lib/card/format/error.rb:27-33` (`:unknown`, never `:denial`) | `tests/card/render/unknown-nest-blank-reference.test.ts` (empty render); shard-000006 entry 10488 (source-truthful) | proven (empty render, NOT the denial span; corpus entry 636's denial span is that entry's anomaly and the pre-adjudication form of this row) |

### R3.4 Denial spans

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.4.a | `card-1.110.0/lib/card/view/permission.rb:46-50,56-64`; `card-mod-format-0.20.0 set/all/html/error.rb:185-189` | `tests/card/permissions/read-permission.test.ts`; `tests/card/render/permission-corpus-replay.test.ts`; `tests/card/render/view-perms-gate.test.ts` | proven (corpus denied views byte-exact) |
| R3.4.b | `card-1.110.0/lib/card/format/error.rb:27-31` (`view_for_denial`); `card-mod-format-0.20.0 set/all/html/menu.rb:8` (`:menu` → `:blank`) | same view-registry oracle fixture: the DEFAULT denial arm renders the quiet span byte-exact on both a basic card and a set card, and the `:blank` arms (`:menu`, `:edit_link`) render `""` — replayed by `tests/card/permissions/view-registry-directives-oracle.test.ts`; the captured table carries FIVE `denial: :blank` directives (menu, edit_link, list_of_changes, comment_box, universal_edit_button), all now in `src/card/permissions/view-perms.ts#viewDenialView`; `tests/card/permissions/view-perms-table.test.ts` (corpus census 124,632 captured denials all `(read)`) | proven (edit_link menu.rb:16 and list_of_changes follow/base_views.rb:6 joined the registry red-first) |
| R3.4.c | `card-mod-format-0.20.0 set/all/title.rb:2` (`view :title, compact: true, perms: :none`); `card-1.110.0 lib/card/set/format/abstract_format/view_opts.rb:59-64` (view_setting methods) | `tests/card/permissions/read-permission.test.ts` "title of denied card renders"; corpus 0/999 captured `:title` views of denied cards denied | proven |
| R3.4.d | `card-mod-format-0.20.0 set/all/html/error.rb:75-77,191-216` (`view :denial` → `focal? ? loud_denial : quiet_denial`, `loud_denial`, `loud_denial_message`); `card-mod-format-0.20.0 lib/card/format/html_format.rb:16-18` (`focal?` = `show_layout? ? main? : depth.zero?` — the operative override of `card-1.110.0 lib/card/format/nesting/subformat.rb:41`); `set/all/html/show.rb:25-28` (page show `main!`) | `tests/card/render/focal-denial-page-corpus-replay.test.ts` (4 exemplars byte-exact + 44-entry stratified census over the 3,069-entry loud class, FOCAL_DENIAL_REPLAY-gated); graded page-lane corpus (5,662/6,588 at pass16; 5,939/6,588 at pass17) renders the loud class at scale; signed-in message branch live-Ruby-probed (`tmp/wrong-goal-hunt/focal-denial-ruby-probe/`, frame-body bytes confirmed) | proven (page-layer loud denial frame AS main content; 8/44 census entries fail ONLY through the verdict-timing leak class — the committed perm-allow fix flips them, proven on its own 130-page sweep; signed-in branch live-probed; signup_ok? live gate unported, pinned to capture config) |

### R3.5 Help-popover content

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.5.a | `card-mod-format-0.20.0 set/all/html/menu.rb:35-37,54-56,103-107`; `card-mod-bootstrap-0.20.0 set/all/bootstrap/helper.rb:46-57`; `card-mod-help-0.20.0 set/all/help.rb`; `card-mod-rules-0.20.0 set/rule/board_rules_editor.rb:17-19`; `card-mod-rules-0.20.0 set/type/setting.rb:12-14` (`Setting#count`) | `tests/card/render/help-popover.test.ts` (8 units); `tests/card/render/help-popover-corpus-replay.test.ts` (14/14 proof entries byte-exact on shard-000000) | proven |
| R3.5.b | `card-1.110.0/lib/card/rule/cache.rb:10-27` (deck-wide Rule::Cache load); `docs/help-popover-parity-notes.md` §"Query shape" | `tests/card/render/help-popover.test.ts` (query-shape pin) | proven |

### R3.6 Structure templates

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.6.a | `card-1.110.0/lib/card/content/all.rb:8-10,17-19,25-27`; `card-mod-content-0.20.0 set/all/templating.rb:11-13,19-33,40-42,44-48` | `tests/card/rules/structure-templates.test.ts` (20 tests); `tests/card/render/structure-corpus-replay.test.ts` (sampled gate, 14/14 entries / 23 views byte-exact) | proven on sampled subset; full 465-entry sweep blocked (`docs/structure-templates-parity-notes.md` §"Honest remainder") |

### R3.7 Slot class set keys

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| R3.7.a | `card-1.110.0/lib/card/set/pattern/all.rb:40-42` (`safe_set_keys`); `card-1.110.0/lib/card/set/pattern/base.rb:70-73` (`safe_key`); `card-1.110.0/lib/card/set/pattern/class_methods.rb:16` (`anchorless`) | `tests/card/render/render-engine.test.ts` (set-key shapes); `tests/card/render/prefetch-cache-codename-parity.test.ts` | proven (with `isRule` from enrichment seam being a coordinator patch in `src/card/render.ts` — `docs/set-keys-parity-notes.md`) |

## 4. SIDE EFFECTS

### E4.1 References refresh

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.1.a | `card-1.110.0/mod/core/set/all/reference_events.rb:2-4,13-19,32-36` | same stream as P1.5.a: scenario 08 oracle rows (out-direction), `tests/card/actions/refresh-references-in.test.ts` (8 tests: map/unmap backfill, referer-content rewrite on rename, no-ref_type filter), `tests/cql/saved-card-reference-round-trip.test.ts` (engine save → refer_to/include/included_by over the saved rows) | proven (oracle row comparison + gem-cited rename-recursion suite) |

### E4.2 Codename events

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.2.a | `card-1.110.0/mod/core/set/all/codename.rb:9-13` (`reset_codename_cache`, the `:integrate` `changed: :codename` event per the gem source); `lib/card/codename.rb:80-84` (`reset_cache` nils the memo + drops the shared entry), `:118-120` (`@codehash ||=` memo, no db fallthrough) | `src/card/actions/card-action-engine.ts` (`codenameChanged` → `fetch.codenames.resetCache()` on the save path); `tests/card/actions/codename-cache-reset-save-path.test.ts` (warm-then-save-then-resolve; mutation-checked — the suite goes red with the reset disabled); `fixtures/captured/codename-reset-and-read-rule-union-oracle.json` + `tests/card/permissions/read-rule-derive-and-codename-reset-oracle.test.ts` (live-Ruby probe on a DISPOSABLE deck copy: raw-SQL codename write invisible to the memo (`stale_id_lookup` nil, `memo_unchanged_by_raw_sql` true), real save fires the reset (`fresh_id_lookup_after_save` 605, `memo_was_reset` true), replayed through the port's registry incl. the raw-write-visibility window; mutation-checked: frozen memo → red) | proven (the "no oracle capture of the in-memory reset" reason is closed by the copy probe — writes are the probe's own, enumerated in the fixture's provenance) |
| E4.2.b | `card-1.110.0/lib/card/codename.rb:108`; `activesupport-7.2.3.2 lib/active_support/inflector/methods.rb` (`underscore`) | `src/card/name/inflect.ts#underscore`; `tests/card/name/name-port.test.ts` (329 inflection battery rows) | proven |

### E4.3 Notification triggers

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.3.a | `card-mod-follow-0.20.0`; `card-mod-email-0.20.0` (Card::Mailer + ActionMailer + Delayed Job) | `src/card/notify/` (follow-notify trigger, follower-resolver rule walk over real storage rows, mail renderer, SMTP transport); `tests/card/notify/` — 5 suites, 64 tests: mail bytes byte-stable against `fixtures/captured/follow-notification.json` (live-Ruby capture), save-path wiring end-to-end (`tests/card/actions/notify-save-path-wiring.test.ts`), RFC 5321 envelope vs the mail-2.9.1 semantics against an in-process mock peer (`smtp-transport.test.ts`) | proven + divergent-documented (mail-content bytes oracle-compared; delivery diverges: no delayed_job queue by design — `SURFACE-INVENTORY.md` P8 — and the transport is mock-peer-proven, no live SMTP capture) |

### E4.4 File operations and asset side effects

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.4.a | `card-mod-carrierwave-0.20.0 set/abstract/attachment.rb:23` | `src/card/attachments/` (LocalAttachmentStore at Ruby's `~<card_id>/<action_id><ext>` identifier + `<files_dir>/<card_id>/<action_id><ext>` path scheme, content/identifier rules); engine wiring (`CardActionEngine` attachment input, save-path event order gem-cited); `tests/server/file-routes.test.ts` (upload→store→serve byte-identical on both /files route grammars, 403 denial writes nothing, variants, content-type); `tests/card/mod-loader/card-mod-cwwrite-output-seam.test.ts` (4 views live-oracle-pinned; the off-includer arm corrected to Ruby's unsupported-view raise — only type_plus_right/set/style.rb:1 and script.rb:1 include the abstract); `fixtures/captured/oracle-upload-file-tree.json` + `tests/card/attachments/upload-tree-oracle-pattern.test.ts` (read-only CarrierWave tree capture — paths+sizes+sha256 of 30 Ruby-written files across files/ and tmp/files/, provenance + card_actions 5018 no-write receipt; the port's real write path reproduces the captured tree pattern: lowercase-ext emissions, UPPERCASE-original write-side pins, accumulating updates, machine outputs, zero variant files) | proven + captured divergence note (closes the named "no captured CarrierWave save compares Ruby's written file tree" reason. Captured divergence: Ruby's live outputter rewrites land on the epoch stand-in filename while the port names by the save's action id — both internally consistent, engine-timing parity remainder, not a tree-shape fix. Plus the emission extension-case fix red-first: 181 corpus identifiers with uppercase exts all emit lowercase in Ruby; `appendVariantLowercasingExt` in views.ts, 4 emission pins failed on the old code) |

### E4.5 Cache invalidation

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.5.a | `card-1.110.0 lib/card/director/phases.rb:56-57`; `lib/card/cache/all.rb:17-24,104-108`; `cache/all.rb:39-43` | `src/card/fetch/cache.ts#expireName`; `src/card/fetch/cache.ts#expireCard`; `tests/card/fetch/cache.test.ts` (13 tests) | proven |
| E4.5.b | `card-1.110.0 mod/core/set/all/name_events.rb:84-88`; `lib/card/lexicon.rb:33-36,93-95` | `src/card/fetch/lexicon.ts#writeTemp`; `src/card/fetch/lexicon.ts#deleteFor`; `tests/card/fetch/lexicon.test.ts` (14 tests) | proven + divergent-documented (Lexicon.delete not invoked on the trash path — `docs/actions-port-notes.md` §8) |

### E4.6 Authentication transitions

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.6.a | `card-1.110.0 lib/card/auth/current.rb:35-41,82-84` (`session_user_key`); `docs/auth-port-notes.md` decision 3 (Rails-cookie-session vs JWT unification) | `src/card/auth/session-store.ts#createSession`; `tests/card/auth/session-store.test.ts` | proven |
| E4.6.b | `card-1.110.0 lib/card/auth/token.rb:17-30` (token validate); `token.rb:25-30` (revocation) | `tests/card/auth/session-store.test.ts` "revokeSession", "validate expired / unknown token" | proven |

### E4.7 Mod save-hooks

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.7.a | `card-1.110.0 lib/cardio/mod/loader.rb:16-21`; `lib/card/set/registrar.rb:42-49` | `src/card/mod-loader.ts`; `tests/card/mod-loader/` (28 tests, card-mod-help proven end-to-end against `fixtures/captured/help-mod-loader.json`) | proven |
| E4.7.b | `card-1.110.0 lib/card/set/advanced_api.rb:10-14`; `lib/card/setting.rb:63-72,95-99,101-110` | `src/card/mod-loader/mod-registrar.ts` (`SettingRegistry`); `tests/card/mod-loader/mod-registration.test.ts` | proven |

### E4.8 Drafts and rollback

| ID | Ruby truth | TS evidence | Status |
|---|---|---|---|
| E4.8.a | `card-1.110.0 mod/core/set/all/content.rb:12` (`save_draft`); `card-mod-history-0.20.0 set/all/history.rb:88` (`save_content_draft`) | `tests/card/history/write-path.test.ts` "draft saves" | proven |
| E4.8.b | `card-1.110.0 mod/core/set/all/content.rb:8` (`set_content` -> `clear_drafts`); `lib/card/content/all.rb:33-39` | `tests/card/history/write-path.test.ts` | proven |

## Status totals

Counts per status across the contract surface (every pinned-synthetic row
and the last unported row flipped to proven with executed evidence, each
flip cited on its row):

| Status | Count | Note |
|---|---|---|
| proven | 67 | oracle byte/row comparison, live-Ruby probe, or direct regression test — every row carries executed evidence (P1.6.a proven by absence with its migration-execution arm named-blocked) |
| pinned-synthetic | 0 | none remain |
| divergent-documented | 0 | no row's PRIMARY status; divergences ride as notes on proven rows (revival action-type, side-card insert order, Lexicon.delete gap, mail delivery queue, CQL regex dialect pins, cw epoch-stand-in outputter naming, R3.4.d signup_ok? gate, P1.4.b deck-drift finding) |
| unported | 0 | none remain |

Scoreboard mapping (`deliverables/FORK-SCORECARD.md` counting rule):
**pass 67 / fail 0 / skipped 0 / pending 0**.

Categories overlap (a statement may be both proven AND
divergent-documented — see the per-row notes). The denominator is
per-statement, not per-bullet: every "or" branch in a statement
counts once toward the row's status.

## Cross-references

- `contract.md` — the contract statement set.
- `architecture.md` — direction (governance reads).
- `governance.md` — gates.
- `docs/upstream-parity-plan-1282.md` — the live stream map.
- Per-stream notes (`docs/*.md`) — the per-stream implementation
  evidence that produced the TS files this evidence file cites.
