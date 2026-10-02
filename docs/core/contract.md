# The shared Decko contract

Status: scope-bound, evidence-anchored. Recorded 2026-09-21.
Scope: the runtime-independent behavioral spec both implementations
(Ruby `card-1.110.0` / `decko-0.20.0` and TypeScript `decko-ts`) MUST
satisfy in order to claim a feature is "Decko" rather than
runtime-specific. Architecture direction lives in `architecture.md`;
governance in `governance.md`; issue mapping in `work-board.md`.
Provenance is per-statement in `contract-evidence.md`.

A statement is **proven** when an oracle byte/row comparison or a
live-Ruby probe passes in CI on the current code; **pinned-synthetic**
when the test reproduces the Ruby behavior on a synthetic deck but no
oracle capture covers it; **divergent-documented** when the port
deliberately differs and the divergence is named in code, in a stream
note, and in `contract-evidence.md`; **unported** when the Ruby
mechanism has no TS code yet and the work is queued.

## Conventions every statement inherits

- **One save request = one act.** Multiple cards updated together share
  a single `card_acts` row; each card still gets its own `card_actions`
  row (`director/all.rb:114-119`; `events.rb:88-92`,
  card-mod-history-0.20.0; `tests/card/history/write-path.test.ts`).
- **Virtual name storage.** Compound cards (`A+B`) store NULL in
  `cards.name` / `cards.key` and carry their identity in
  `left_id` / `right_id`; the `Lexicon` reconstructs composed names
  on read. Renaming a part writes NO rows for its descendants
  (`mod/core/data/schema/20200718051236_compound_names_do_not_store_name_and_key.rb`;
  `lib/card/name/all.rb:20-26, 31-38`; `docs/actions-port-notes.md` §3;
  `tests/card/fetch/oracle-replay.test.ts`).
- **Trash = `0/1`.** Booleans serialize to `t` / `f` for `card_changes.value`
  only; the `cards.trash` column carries `0` / `1` integers
  (`card-mod-history-0.20.0/lib/card/change.rb`; `docs/schema-notes.md`).
- **Change field codes are 0-based.** `TRACKED_FIELDS =
  %w[name type_id db_content trash left_id right_id]` →
  name=0, type_id=1, db_content=2, trash=3, left_id=4, right_id=5
  (`card-mod-history-0.20.0/lib/card/change.rb:25`; fact, not policy).
- **Action types are 0/1/2.** `TYPE_OPTIONS = %i[create update delete]`
  → create=0, update=1, delete=2 (`card-mod-history-0.20.0/lib/card/action.rb:42,90-92`).
- **Card revisions are a frozen legacy surface.** No runtime writer
  exists for `card_revisions` or `cards.current_revision_id` since the
  2014 migration
  (`mod/core/data/schema/20141001105348_move_revisions_to_actions.rb`;
  `docs/history-port-notes.md` §1.4; `docs/schema-notes.md` "card_revisions"
  row).

## 1. PERSISTENCE

Persistence is "what a save of each card shape writes to storage", so the
contract here is byte-shape exactness of the `card_acts` / `card_actions`
/ `card_changes` / `cards` / `card_references` rows Ruby produces for each
save class. Test surface: `tests/card/history/**`, `tests/card/actions/**`,
`tests/card/conformance/write-path.test.ts`, `fixtures/write-conformance/*`.

### P1.1 Save classification

- **P1.1.a** A save with `trash: true` is typed `action_type=2` (delete),
  not `update`, and carries a single `card_changes` row with
  `field=3 (trash)` and `value="t"`
  (`director/all.rb:19-28`; `card-mod-history-0.20.0 set/all/history/events.rb`;
  `trash.rb:70-72`). TS evidence: `tests/card/actions/delete.test.ts` —
  proven on synthetic deck.
- **P1.1.b** A save creating a new card row is typed `action_type=0`
  (create) and carries ZERO `card_changes` rows on first creation
  (`events.rb:31-32`; `history.rb:38-40`; `first_create?`).
  TS evidence: `tests/card/history/write-path.test.ts` —
  proven on real storage; `fixtures/write-conformance/01-create-simple.jsonl` —
  proven via oracle replay.
- **P1.1.c** A save resurrecting a trashed row reuses the row id, is typed
  `action_type=0`, and carries change rows only for the fields that
  differ from the trashed row (`states.rb:6-8` `@from_trash` branch;
  `events.rb:88-92`). TS evidence: `tests/card/actions/revive.test.ts` —
  proven on synthetic deck (documented divergence: the TS ActWriter
  emits an initial `update` action and the engine follows with a
  corrective `action_type=0` UPDATE — `docs/actions-port-notes.md` §6
  divergence 2).

### P1.2 Change row contents

- **P1.2.a** Every change row carries the AFTER value of one
  TRACKED_FIELDS entry; the `field` column is the 0-based index
  (`change.rb:25,47,60`). TS evidence: `tests/card/history/change.test.ts`
  + `tests/card/history/write-path.test.ts` — proven on real storage.
- **P1.2.b** Value serialization: integer-typed fields (`type_id`,
  `left_id`, `right_id`) serialize as `Integer#to_s` (decimal strings);
  booleans (`trash`) serialize as `"t"` / `"f"`; everything else is
  stored as text (`activemodel-7.2.3.2/lib/active_model/type/immutable_string.rb:48-56`;
  `activerecord/lib/active_record/type/text.rb`). TS evidence:
  `src/card/history/change.ts#serializeChangeValue` — proven on real
  storage + oracle replay (scenarios 1–8 with int-id normalization
  for fields 1/4/5).
- **P1.2.c** On the first save AFTER a create that wrote no changes,
  the create action receives a backfill of one change row per
  TRACKED_FIELDS entry, valued with the pre-act row state, inserted
  BEFORE the update's own change rows so change ids sort first
  (`events.rb:29 NOTE`; `history.rb:32,42`; `events.rb:95-100,108-115`).
  TS evidence: scenario 03 of `fixtures/write-conformance/` (the
  update-content scenario) and `tests/card/history/write-path.test.ts` —
  proven on real storage + oracle replay.

### P1.3 Card row composition

- **P1.3.a** A simple card write sets `cards.name` and `cards.key`;
  a compound card write leaves `cards.name` and `cards.key` NULL
  and sets `cards.left_id` / `cards.right_id`
  (`lib/card/name/all.rb:20-26`; `mod/core/data/schema/20200718051236_compound_names_do_not_store_name_and_key.rb`).
  TS evidence: `tests/card/fetch/oracle-replay.test.ts` (10 smoke
  card records byte-exact) — proven against captured Ruby fixture.
- **P1.3.b** A pair `(left_id, right_id)` is UNIQUE
  (`mod/core/data/schema/20200805200729_add_unique_pair_indices.rb`).
  TS evidence: `tests/server/schema.test.ts` CHECK enforcement +
  `tests/card/fetch/lexicon.test.ts` — proven on real storage.

### P1.4 Read-rule derivation on save

- **P1.4.a** A save whose `type_id` or `name` changed runs
  `set_read_rule` as a `:store` event and writes the resolved
  `read_rule_id` and `read_rule_class` columns on the target card
  (`card-mod-permissions-0.20.0/set/all/permissions.rb:1-5`).
  TS evidence: `tests/card/conformance/write-path.test.ts` scenario
  07 — **divergent-documented**: TS does not implement
  `set_read_rule`; the field divergence is recorded in
  `docs/write-conformance-notes.md` §scenario 07 (TS 7 vs Ruby 9
  change rows).
- **P1.4.b** The `read_rule_id` and `read_rule_class` are NOT
  re-derived at fetch time from a fully-ruled deck; the stored value
  is the read-time source (`permissions.rb:142`; corpus has 0 rows
  where `trash=0 AND read_rule_id IS NULL`). TS evidence:
  `tests/card/permissions/read-permission.test.ts` — pinned-synthetic
  on the corpus union-math proof.

### P1.5 Card references

- **P1.5.a** A save whose `content` or `name` changes rebuilds the
  outgoing `card_references` rows: an `I` (include / nest) row for
  every `{{name}}` reference and a `P` (partial) row for every
  `{{a|b}}` fragment, with `referer_id` = the saved card and
  `referee_id` = the resolved target card's id (or NULL when the
  target is unresolved)
  (`mod/core/set/all/reference_events.rb:2-4,13-19,32-36`).
  TS evidence: `tests/card/conformance/write-path.test.ts` scenario
  08 — **divergent-documented**: TS does not populate
  `card_references`; the table exists and the driver reads it but
  no writer populates it (P4 stream is queued — see
  `docs/upstream-parity-plan-1282.md` §Persistence).

### P1.6 Migrations and the 2014 history migration

- **P1.6.a** Pre-2014 `card_revisions` data is migrated into
  `card_acts` / `card_actions` / `card_changes` with action_type=0 for
  the card's first revision (change rows for fields 0..3 = name,
  type_id, db_content, trash) and action_type=1 otherwise (only
  field 2 = db_content)
  (`mod/core/data/schema/20141001105348_move_revisions_to_actions.rb`).
  TS evidence: `tests/card/history/write-path.test.ts` "legacy
  revision tables" — proven by writing through the engine and
  confirming `card_revisions` and `cards.current_revision_id` are
  untouched.
- **P1.6.b** No runtime code in card-1.110.0 / decko-0.20.0 writes to
  `card_revisions` or `cards.current_revision_id`; production rows
  there are frozen pre-2014 data
  (`docs/history-port-notes.md` §1.4 grep evidence).
  TS evidence: same pin test — proven by absence.

### P1.7 Atomicity and idempotence

- **P1.7.a** A save with no changed fields AND no pre-existing
  changes produces NO `card_acts` / `card_actions` / `card_changes`
  rows (the never-saved action is deleted; AR skips no-op card
  updates)
  (`events.rb:34`; `set/all/history.rb:51`). TS evidence:
  `tests/card/actions/update.test.ts` "no-op idempotency" — proven
  on synthetic deck.
- **P1.7.b** One `applyAction` call = one act. Multi-card saves
  (junction creates with subcards, recursive deletes) share the act
  with `super_action_id` linking the child action row to its parent's
  action id (`director/store.rb:37-58, 70-73`; `events.rb:85-92`).
  TS evidence: `tests/card/actions/create.test.ts` (junction
  create) + `delete.test.ts` (cascade) + scenario 02 of
  `fixtures/write-conformance/` — proven on real storage +
  oracle replay.

## 2. SEMANTICS

Semantics is the algebraic and interpretive layer: name algebra
guarantees, CQL evaluation order and match semantics, rule resolution
precedence, permission party model. Test surface: `tests/card/name/**`,
`tests/cql/**`, `tests/card/set-patterns/**`, `tests/card/rules/**`,
`tests/card/permissions/**`.

### S2.1 Name algebra

- **S2.1.a** A name string composed of N parts joined by `+` carries
  N `+`-separated parts; `parts[0..-2]` is the trunk, `parts[-1]`
  is the tag (or "right" part). The left and right accessors
  (`DeckoName#left`, `#leftName`, `#right`, `#rightName`, `#trunk`,
  `#trunkName`, `#tag`, `#tagName`) match the
  `Cardname#left` / `#right` / `#trunk` / `#tag` machinery
  (`cardname-0.20.0/lib/cardname/parts.rb`; `docs/name-port-notes.md`
  ported-surface table). TS evidence: `tests/card/name/name-port.test.ts`
  — proven by 243 tests against live Ruby oracle.
- **S2.1.b** Two names compare equal when their keys compare equal
  (`Cardname#==` via `key`; `parts.rb`). Equality is invariant of
  inflected forms (`Editor Notes` and `editor_note` have the same
  key after singularize). TS evidence: same suite + the
  reconciliation tests `tests/cql/reconciliation.test.ts` —
  proven by oracle.
- **S2.1.c** A name string is invalid if any of its parts matches the
  banned-character regex `[banned_chars + joint]`; the joint (`+`)
  is itself banned inside parts
  (`Cardname.banned_re` at `cardname-0.20.0/lib/cardname/class_methods.rb:40-41`;
  `predicates.rb:19-25`). TS evidence: `tests/card/name/name-port.test.ts`
  "DeckoName.bannedCharacters / isValid" — proven against the live
  gem.
- **S2.1.d** `to_s` on an empty name returns `""` (Ruby nil-to_s
  semantics); `Card.fetch("")` returns nil; a `{{}}` nest reference
  consumes the blank mark and renders the EMPTY STRING. The nil card
  takes `view/permission.rb:36-39`'s unknown arm, where `alter_unknown`
  answers the truthy `:unknown` view, so the denial arm
  (`card-mod-format-0.20.0 set/all/html/error.rb:185-189`) is never
  reached (`fetch/retrieve.rb:9-12`). TS evidence:
  `tests/card/render/unknown-nest-blank-reference.test.ts` — proven on
  the source-truth capture (shard-000006 entry 10488 renders its `{{}}`
  as nothing on both its content and open surfaces). Corpus entry 636
  (`thez+*right+*default`) carries a denial span on its open surface;
  that is this entry's anomaly, not the rule.

### S2.2 Relative-name absolutization

- **S2.2.a** A contextual part `_main`, `_user`, `_left`, `_right`,
  `_self`, `_whole`, `_N` (ordinal), `_L*R` (partmap), or `_rrr`
  (relative regex) resolves against the absolute `context` argument
  via the `contextual.rb#absolutize_contextual_parts` machinery
  (`lib/cardname/contextual.rb`; `lib/card/query/card_query/normalization.rb:57`).
  TS evidence: `tests/cql/reconciliation.test.ts` (30 tests) +
  `tests/card/name/name-port.test.ts` — proven against live oracle.
- **S2.2.b** `_main` resolves through `Card::Env.params[:main_name]`
  with a blank-extreme fill when the param is nil
  (`card-1.110.0 lib/card/name.rb#params`;
  `lib/cardname/contextual.rb:108`). TS evidence: reconciliation
  tests with an injectable environment (`src/card/name/environment.ts`)
  — pinned-synthetic (the bare gem crashes on `_main`-with-nil-params
  on a non-`english`-loaded Ruby; the app path uses `english`).

### S2.3 CQL semantics

- **S2.3.a** A CQL value clause on `name` is key-ified through
  `to_name.key` before SQL is generated (`Value#standard_sql` at
  `lib/card/query/value.rb:29`); a clause on `content` reads the
  `db_content` column (column map `name: "key", content: "db_content"`
  at `value.rb:8`). TS evidence: `tests/cql/parser.test.ts` +
  `tests/cql/sql-generation.test.ts` — proven against live oracle.
- **S2.3.b** Name-relational clauses (`type:`, `left:`, `right:`,
  `last_edited_by:`, `created_by:`, `part:`, `plus:`, `left_plus:`,
  `right_plus:`) resolve name strings through the Lexicon during
  interpretation (`Tie#restrict`, `Tie#id_from_val` sentinel -999
  at `lib/card/query/card_query/tie.rb`); an unresolvable name sends
  the row to the -999 sentinel and the result is empty
  (`card_query/relational_attributes.rb`). TS evidence:
  `tests/cql/name-resolution.test.ts` + `tests/cql/execution.test.ts`
  — proven with `DbLexicon.peekId` and 11/11 oracle replay.
- **S2.3.c** CQL reference clauses (`refer_to`, `link_to`, `include`,
  `nest`, `referred_to_by`, `linked_to_by`, `included_by`,
  `nested_by`) join `card_references` by `referer_id` /
  `referee_id`; `member_of` expands to `referred_to_by` with the
  members codename; the `_none` value is `is_present = 0`
  (`lib/card/query/card_query/reference_attributes.rb`). TS evidence:
  `tests/cql/sql-generation.test.ts` — proven against live oracle.
- **S2.3.d** The default `match` clause is a LITERAL substring
  scan over raw columns (`name` for the name side, `db_content` for
  the content side) — Ruby's `escape_regexp_characters`
  (`lib/card/query/value/match_value.rb:33-36,53-62`) backslashes
  every non-word character in the value, so metacharacters in the
  query match themselves; `~~term` is the only prefix that
  passes the value through as a raw server regex
  (`match_value.rb:46-47` comment). TS evidence:
  `tests/cql/oracle-match-replay.test.ts` (27/30 strict) +
  `tests/cql/execution.test.ts` — proven against the MySQL-rung
  capture (`fixtures/captured/cql-mysql-match.json`).
- **S2.3.e** Match reads the raw ROW columns; the junction row's
  NULL name column never matches the name-REGEXP side, and NULL
  operands propagate (NULL never matches anything). TS evidence:
  `tests/cql/oracle-match-replay.test.ts` "compound_child_name_token"
  + `tests/cql/execution.test.ts` NULL-propagation pin — proven
  against MySQL capture.
- **S2.3.f** The match value resolves through the server's regex
  engine — MariaDB 11.4 = PCRE, MySQL 8 = ICU, MySQL 5.7 = Henry
  Spencer. Case folding follows the column's collation
  (`utf8mb4_general_ci` in the captured deck). TS evidence: the
  MySQL-capture battery (`fixtures/captured/cql-mysql-match.json`,
  27/30 entries pass strict parity in `oracle-match-replay.test.ts`)
  — proven. The 3 JS dialect misses (`[[:alpha:]]`, `[[:<:]]`,
  `\p{...}` in raw `~~` patterns) are pinned as the dialect-
  translation gap and routed to throw-on-untranslated
  (`docs/cql-match-decision.md`).

### S2.4 Set-pattern lookup precedence

- **S2.4.a** The pattern lookup table for any card lists patterns in
  most-specific-first order: `self`, `type_plus_right`, `right`,
  `rule`, `rstar`, `star`, `type`, `all_plus`, `all`. The order
  comes from `register` front-inserting into `Pattern.concrete`
  (`lib/card/set/pattern/class_methods.rb:13-18`); the core
  `mod/core/set_pattern/NN_*.rb` files load in sorted order with no
  `:index` opt, so `nil.to_i == 0` and the result is reverse file
  order. TS evidence:
  `tests/card/set-patterns/oracle-parity.test.ts` + the table in
  `docs/set-patterns-port-notes.md` (verified live via
  `set-pattern-oracle-probe.rb`) — proven.
- **S2.4.b** Each pattern declares an `anchor_parts_count` (1 for
  anchorless patterns like `all` / `star` / `rule`, 2 for `right`,
  the type's name for `type`, etc.); a pattern's applicability is
  the conjunction of `pattern_applies?` (default `true`; `*` patterns
  require `name.star?`, `*+` patterns require `compound?`,
  `+*right` patterns require `compound?`, etc.) and a set-card
  existence check (`anchor_card` resolved)
  (`lib/card/set/pattern/base.rb`; `mod/core/set_pattern/04_star.rb`,
  `05_rstar.rb`, `06_rule.rb`). TS evidence: same suite — proven
  by live oracle probe.
- **S2.4.c** The rule cache key is the codename-form key
  `[anchor_id, pattern_code, setting_code].compact.join("+")` with
  no stars (`lib/card/rule/cache.rb#lookup_key`); a `Set+*read`
  rule card writes the entry `set_id + "+" + setting_code`. TS
  evidence: `tests/card/rules/lookup.test.ts` — proven on
  synthetic deck; the codename registry is a deferred surface
  (`docs/rules-port-notes.md` "Codename registry integration").

### S2.5 Rule resolution and read-rule cascade

- **S2.5.a** For a card, the read-rule walk is the first hit of
  `<pattern_precedence set_names> + "+*" + setting_code` against
  the rule cache (`lib/card/rule/all.rb#rule_id_lookup`;
  `lib/card/set/pattern/all.rb:23,66-68`). Preference rules add
  `<setting>+<userId>` and `<setting>+<allId>` to the candidate list
  (`Rule::All#preference_card_id`). TS evidence:
  `tests/card/rules/lookup.test.ts` + `tests/card/rules/integration.test.ts`
  — proven on synthetic deck.
- **S2.5.b** The read check is the conjunction of `Auth.always_ok?`
  and `Auth.as_card.read_rules_hash[read_rule_id]`
  (`card-mod-permissions-0.20.0/set/all/permissions.rb:139-146`).
  TS evidence: `tests/card/permissions/read-permission.test.ts` —
  proven on synthetic + corpus (113 roleful members swept).
- **S2.5.c** `always_ok?` short-circuits for DeckoBot
  (`lib/card/auth/permissions.rb:8-13`) and for any actor whose
  `all_enabled_roles` includes `AdministratorID`
  (`card-mod-account-0.20.0 set/abstract/account_holder.rb:63-65`).
  TS evidence:
  `tests/card/permissions/read-permission-actors.test.ts` —
  pinned-synthetic + corpus union-math proof.
- **S2.5.d** The actor's parties for the read check are
  `[AnyoneID, AnyoneSignedInID?, ...role_ids_from_role_member_cards,
  self_id]`. Anonymous's parties are `[AnyoneID, AnonymousID]` (no
  roles); the role statement reads member ids from
  `card_references` (`ref_type "L"`, `referee_key IS NULL`) — the
  list layer's `card_references` writes carry the membership
  (`card-mod-list-0.20.0 set/abstract/id_list.rb:33-47`). TS evidence:
  `tests/card/permissions/read-permission-actors.test.ts` +
  `tests/card/permissions/read-permission-actors-corpus.test.ts`
  (113 roleful members swept) — proven.

### S2.6 Permission party model (write side)

- **S2.6.a** `Auth.current_id` always resolves to a real card id
  (AnonymousID by default; `lib/card/auth/current.rb:7-9`); the
  AnonymousID and DeckoBotID constants are boot-time
  `codename.rb:108` lookups, not literal integers
  (`lib/card/codename.rb:108`). TS evidence:
  `tests/card/auth/session-store.test.ts` — proven on synthetic
  deck; the values are resolved per-call from the deck's
  `cards.codename` column, not assumed.
- **S2.6.b** An empty / unknown / expired / revoked bearer token
  re-signs as Anonymous (`current.rb:58-63` degradation path;
  `auth/token.rb:25-30`). TS evidence:
  `tests/card/auth/session-store.test.ts` "dead-card returns null" +
  "expired token rejects" + `tests/card/permissions/read-permission-actors.test.ts`
  "viewerFromToken" — pinned-synthetic on token semantics;
  proven on real storage for the session-row shape.
- **S2.6.c** A session row's stored token is `sha256(raw_token)`,
  never the raw bytes; lookup is `token_hash = ?` + constant-time
  compare + expiry + card-resolution check, in that fixed order
  (`docs/auth-port-notes.md` decision 5). TS evidence:
  `tests/card/auth/session-store.test.ts` "constant-time compare"
  mutation test — proven on real storage.

## 3. RENDERING

Rendering is the byte surface the engine emits for a `(card, view,
options)` triple. Test surface: `tests/card/render/**`,
`fixtures/captured/smoke.json`, `fixtures/corpus/shard-*.jsonl`,
`fixtures/write-conformance/`.

### R3.1 View registry behavior

- **R3.1.a** The html-format view registry resolves a view name to a
  callable that takes the format's view options object (`voo`) and
  returns the view's HTML string. A view with `perms: :none` skips
  the read check entirely; a view with `perms: <task>` runs the
  task-specific check before dispatch
  (`card-1.110.0 lib/card/view/permission.rb:13-15,25-27`;
  `card-mod-format-0.20.0 set/all/html/menu.rb`).
  TS evidence: `src/card/permissions/view-perms.ts` +
  `tests/card/render/view-perms-gate.test.ts` —
  pinned-synthetic against the gem's directive table.
- **R3.1.b** A `render :x` with `opts[:skip_perms] = true` skips the
  permission gate entirely (`permission.rb:25-27`); the
  UNDERSCORE render form (`render "_x"`) sets `skip_perms = true`
  automatically (`lib/card/format/method_delegation.rb:5-9,48-55`).
  TS evidence: `tests/card/render/view-perms-gate.test.ts` —
  pinned-synthetic.
- **R3.1.c** A request for an UNREGISTERED view raises
  `Card::Error::UnsupportedView` (`lib/card/format/render.rb:59-63`).
  TS evidence: `tests/card/render/render-engine.test.ts` —
  proven on synthetic deck.

### R3.2 Slot and nest markup bytes

- **R3.2.a** Every rendered card slot emits a `<div class="card-slot
  VIEWNAME-VIEW SET_KEY_FRAGMENTS...">` wrapper with the card's
  `data-card-id` and `data-card-name` attributes, and a deterministic
  `data-slot-id` of 20 lowercase hex chars (`SecureRandom.hex(10)`)
  (`card-mod-format-0.20.0 set/all/html/wrap.rb:33-35`;
  `slot_attributes:26-31`, `wrap_classes:94-99`,
  `wrap_data:37-48`). TS evidence:
  `tests/card/render/render-engine.test.ts` +
  `tests/card/render/oracle-replay.test.ts` (20/20 smoke views)
  — proven.
- **R3.2.b** A `{{name}}` nest reference at parse time becomes a
  `<span class="card-slot NEST-VIEW SET_KEY_FRAGMENTS...">` for
  the resolved card, with the nest view applied as the requested
  view (no slot wrap when `wrap: :none` is on the requested view);
  a `{{name|view}}` form uses `view` as the requested view
  (`card-mod-format-0.20.0 set/all/base.rb`; `card-mod-format
  set/all/nest.rb`). TS evidence: `tests/card/render/oracle-replay.test.ts`
  + `tests/card/render/junction-depth-closure.test.ts` (depth 1..4
  chains) — proven.
- **R3.2.c** Attribute escaping in the slot's `data-bs-*` /
  `href` / `class` fields uses `& < > " '` → `&amp; &lt; &gt;
  &#34; &#39;` (`actionview-7.2.3.2 .../tag_helper.rb:310-323`,
  `core_ext/erb/util.rb:10-18`). TS evidence:
  `src/card/render/slot-html.ts#h()` +
  `tests/card/render/help-popover-corpus-replay.test.ts` —
  proven (the captured corpus bytes contain `&#39;` and `&amp;nbsp;`).
- **R3.2.d** Inclusion closure prefetch is constant in queries per
  page render regardless of inclusion depth: one batched round trip
  of N closure statements + M permission/structure/universe
  statements, with the prefetch batch size determined by closure
  size, not inclusion depth
  (`decko-commons/decko#1282`; `docs/render-fix-notes.md`;
  `tests/card/render/depth-sweep.test.ts` — 1..32 depths yield
  constant statement and round-trip counts). TS evidence: depth
  sweep pins `statementsByDepth = {1,2,4,8,...} → {11,11,11,11,...}`
  and `roundTripsByDepth = {1,2,4,8,...} → {5,5,5,5,...}` against
  the seeded deck — proven.

### R3.3 Unknown-card substitution

- **R3.3.a** A nest fetch miss NEVER raises; the fetch returns a
  NEW card with the referenced name and the context card as
  supercard, marked unknown (`Card::Fetch::Results#results`
  at `card-1.110.0/lib/card/fetch/results.rb:8-15`;
  `lib/card/format/nest/fetch.rb:48-58`). The render then
  substitutes the unknown card's view by `unknown:` config:
  - `perms: :none` skips unknown substitution (`skip_check?`).
  - `unknown: true` renders as requested
    (`permission.rb:40`).
  - Otherwise the substituted view is the nest's `unknown:` opt
    or the view definition's `unknown:` config
    (`Card::Format::Error#view_for_unknown`,
    `lib/card/format/error.rb:18-25`), per the html table:
    `mini_bar`, `mini_unknown`, `bar_left`, `bar_menu`, `bar_body`
    → `unknown: true`;
    `closed`, `bar`, `full_bar` → `:mini_bar`;
    `bar_middle`, `bar_right`, `titled_content` → `:blank`;
    `labeled` → `:labeled`; `labeled_content`,
    `one_line_content`, `raw_one_line_content` → `:mini_unknown`;
    everything else → `:unknown`. TS evidence:
  - `tests/card/render/unknown-nest-corpus-replay.test.ts` (4
    corpus entries, all 16 views byte-exact)
  - `src/card/render/format.ts#viewForUnknown` /
    `RenderFormat.nest` (the substitution table) — proven.
- **R3.3.b** A blank reference `{{}}` skips fetch entirely and
  renders the EMPTY STRING: the nil card takes the unknown arm, where
  `alter_unknown` (`states.rb:52-58,65-67`) answers the truthy
  `:unknown` view, so `altered_view` (`card-1.110.0
  lib/card/format/error.rb:27-33`) never reaches the `:denial` arm
  (`card-1.110.0 lib/card/fetch/retrieve.rb:9-12`). TS evidence:
  `tests/card/render/unknown-nest-blank-reference.test.ts` — proven on
  the source-truth capture (shard-000006 entry 10488, `{{}}` rendering
  as nothing on its content and open surfaces). Corpus entry 636
  (`thez+*right+*default`) carries a denial span on its open surface;
  that is this entry's anomaly, and the denial form
  (`card-mod-format-0.20.0 set/all/html/error.rb:185-189`) is what this
  row's behavior read as before it was adjudicated against Ruby's own
  source trace.

### R3.4 Denial spans

- **R3.4.a** A view whose `view_perms` task fails renders the
  QUIET denial span
  `<span class="denied"><!-- Sorry, you don't have permission (TASK) --></span>`
  where `TASK` is the failing task symbol (one of `:create`,
  `:update`, `:delete`, `:read`, or a method-predicate symbol —
  interpolated as `""` for non-CRUD predicates because Ruby
  interpolates `false` as empty)
  (`lib/card/view/permission.rb:46-50,56-64`;
  `card-mod-format-0.20.0 set/all/html/error.rb:185-189`).
  TS evidence: `tests/card/permissions/read-permission.test.ts` +
  `tests/card/render/permission-corpus-replay.test.ts` +
  `tests/card/render/view-perms-gate.test.ts` — proven on
  corpus denied views.
- **R3.4.b** The denial-substitution for `:menu` is `:blank`
  (i.e. empty string); the substitution is configurable per view
  via `denial: :view` (`lib/card/format/error.rb:27-31`;
  `card-mod-format-0.20.0 set/all/html/menu.rb:8`).
  TS evidence: the registry in `view-perms.ts#viewDenialView` —
  pinned-synthetic against the gem directive table; corpus
  census confirms all 124,632 captured denials are `(read)`.
- **R3.4.c** A denied card's `:title` view (which carries
  `perms: :none`) STILL renders the title bytes; the base-format
  definition is preserved across the html-format redefinition
  because view settings are defined as separate methods on the
  set's format module
  (`card-1.110.0 lib/card/set/format/abstract_format/view_opts.rb:59-64`;
  `card-mod-format-0.20.0 set/all/title.rb:2`). TS evidence:
  `tests/card/permissions/read-permission.test.ts` "title of denied
  card renders" + corpus: 0/999 captured `:title` views of denied
  cards are denied — proven.
- **R3.4.d** Loud (focal) denial — the page-layer
  "Sorry, you don't have permission..." framed page — is only
  emitted on `focal? = show_layout? ? main? : depth.zero?` page
  renders (`card-mod-format-0.20.0 set/all/html/error.rb:191-210`;
  `lib/card/format/nesting/subformat.rb:41`); the captured
  corpus is never focal. TS evidence: corpus census — **pinned-
  synthetic / unported** (loud denial is documented as a page-
  layer remainder, not exercised on the corpus surface;
  `docs/permissions-port-notes.md` "Loud denial").

### R3.5 Help-popover content

- **R3.5.a** The `:menu` view's help anchor renders the card's
  `*help` rule content (the applicable rule card's `db_content`,
  processed through `process_content chunk_list: :references`) as
  `data-bs-content`, escaped with the `& < > " '` table. A card with
  no help rule and no registration emits
  `data-bs-content="&amp;nbsp;"`. A RULE-card's help-text appends
  a `(N <setting> rules)` count link with N from
  `Setting#count = Card.search left: {type: SetID}, right: id,
  return: :count`
  (`card-mod-format-0.20.0 set/all/html/menu.rb:35-37,54-56,
  103-107`; `card-mod-help-0.20.0 set/all/help.rb`;
  `card-mod-bootstrap-0.20.0 set/all/bootstrap/helper.rb:46-57`;
  `card-mod-rules-0.20.0 set/rule/board_rules_editor.rb:17-19`;
  `card-mod-rules-0.20.0 set/type/setting.rb:12-14`).
  TS evidence:
  `tests/card/render/help-popover.test.ts` +
  `tests/card/render/help-popover-corpus-replay.test.ts`
  (14/14 proof entries byte-exact on shard-000000) — proven.
- **R3.5.b** The `*help` rule load is a single batched deck-wide
  query (rule cards + transitive sides + per-setting rule counts),
  issued once per engine and cached for warm renders
  (`lib/card/rule/cache.rb:10-27`;
  `docs/help-popover-parity-notes.md` §"Query shape"). TS evidence:
  query-shape pins in `help-popover.test.ts` — proven.

### R3.6 Structure templates

- **R3.6.a** A persisted card with NULL or empty `db_content` renders
  its set's `<set>+*structure` rule template's `db_content` in place
  of its own content. The walk is the first hit of
  `<set_name>+*structure` in pattern-precedence order, and a hit
  whose `db_content == "_self"` falls through to the card's own
  content. A NULL template's `db_content` falls through
  (`card-1.110.0 lib/card/content/all.rb:8-10,17-19,25-27`;
  `card-mod-content-0.20.0 set/all/templating.rb:11-13,19-33,
  40-42,44-48`).
  TS evidence: `tests/card/rules/structure-templates.test.ts` (20
  tests) + `tests/card/render/structure-corpus-replay.test.ts`
  (sampled gate, 14/14 entries / 23 views byte-exact) — proven
  on the sampled subset; full 465-entry sweep blocked on the
  prefetch CTE perf cost (`docs/structure-templates-parity-notes.md`
  §"Honest remainder").

### R3.7 Slot class set keys

- **R3.7.a** The slot wrapper's class attribute carries the card's
  pattern safe-set keys, in reverse lookup order
  (`lib/card/set/pattern/all.rb:40-42`):
  `safe_set_keys = patterns.map(&:safe_key).reverse * " "`.
  Each `safe_key` is `caps_code` for an anchorless pattern, or
  `caps_code-<anchor.safe_key>` for an anchored pattern
  (`lib/card/set/pattern/base.rb:70-73`).
  TS evidence:
  `tests/card/render/render-engine.test.ts` — proven on
  synthetic deck. The pre-fix star / rstar / rule keys are
  documented divergences (`docs/set-keys-parity-notes.md`).

## 4. SIDE EFFECTS

Side effects are the events emitted, jobs queued, mail/notification
triggers fired, cache invalidations performed, and authentication
transitions executed around a save or render. Test surface:
`tests/card/history/**`, `tests/card/actions/**`,
`tests/card/auth/**`, `tests/card/mod-loader/**`. The E1/E2 streams
are not yet built; the contract for the side-effect layer is what
Ruby ships today (citations) and the current TS evidence is
"unported" with a citation pinning the future work.

### E4.1 References refresh

- **E4.1.a** A save whose `content` changed calls
  `refresh_references_out` (`mod/core/set/all/reference_events.rb:2-4`),
  which rebuilds the outgoing `card_references` rows for the saved
  card (P5.a above) AND recursively for each referer card whose
  stored content references this card (a referer's stored content
  rewrites via `content_quietly=` — `update_column :db_content`,
  `reference_events.rb:32-36` — and bypasses history).
  TS evidence: **divergent-documented** (P1.5.a) — the
  references refresh is not implemented (`docs/upstream-parity-plan-1282.md`
  §Persistence P4).

### E4.2 Codename events

- **E4.2.a** A save whose `codename` column changes resets the
  codehash: `reset_codename_cache` runs at
  `mod/core/set/all/codename.rb:9-13`. TS evidence: **unported**
  — the codename event is in the actions-port deferral list
  (`docs/actions-port-notes.md` §9).
- **E4.2.b** Codename values are normalized to snake_case at write
  time (`Card::Codename.id` derives the snake_case form from the
  card name via `underscore`)
  (`lib/card/codename.rb:108`;
  `activesupport-7.2.3.2 lib/active_support/inflector/methods.rb`).
  TS evidence: `src/card/name/inflect.ts#underscore` (the
  ActiveSupport inflection substrate, transcription-verified) —
  proven by 329 inflection battery rows in
  `tests/card/name/name-port.test.ts`.

### E4.3 Notification triggers

- **E4.3.a** A save on a card watched by a follower card fires
  `Card::Mailer` for each follower (`card-mod-follow-0.20.0`;
  `card-mod-email-0.20.0`); the email transport is ActionMailer
  with Delayed Job for async delivery. TS evidence: **unported**
  — E1 stream is queued (mailers/notifications — no code).
  `docs/upstream-parity-plan-1282.md` §Side effects.

### E4.4 File operations and asset side effects

- **E4.4.a** A save on an attachment-typed card persists the file
  via CarrierWave (`card-mod-carrierwave-0.20.0
  set/abstract/attachment.rb:23`); the original filename is
  recorded in `card_actions.comment`. TS evidence: **unported**
  (attachment mod territory).

### E4.5 Cache invalidation

- **E4.5.a** Every save calls `Card#expire`
  (`card-1.110.0 lib/card/director/phases.rb:56-57` integration
  ensure), which deletes both key versions (`card.key` and
  `card.key_before_act`), deletes the legacy `~<id>` key, expires
  view-cache keys, and recursively expires the left card of a
  compound name
  (`lib/card/cache/all.rb:17-24,104-108`,
  `cache/all.rb:39-43`). TS evidence:
  `src/card/fetch/cache.ts#expireName` + `expireCard` + the
  `clear_drafts` / `expire :shared` / `expire :temporary` reset
  family — proven by `tests/card/fetch/cache.test.ts` (13 tests).
- **E4.5.b** The Lexicon cache update path is
  `event :update_lexicon` (`mod/core/set/all/name_events.rb:84-88`)
  — creates write `id -> name` and `lex -> id`; updates write
  the new and expire the old (`lexicon.rb:33-36,93-95`); deletes
  clean nothing (Ruby's own wart — `docs/actions-port-notes.md`
  §8). TS evidence:
  `src/card/fetch/lexicon.ts#writeTemp` / `deleteFor` +
  `tests/card/fetch/lexicon.test.ts` (14 tests) — proven.

### E4.6 Authentication transitions

- **E4.6.a** A `signin` call writes the actor id to the request
  session under `session_user_key = :"user_<db>"`
  (`card-1.110.0 lib/card/auth/current.rb:35-41,82-84`).
  TS evidence: `src/card/auth/session-store.ts#createSession` +
  `tests/card/auth/session-store.test.ts` — proven on real
  storage with bearer-token shape (the engine's chosen
  unification of Rails cookie sessions and JWTs — see
  `docs/auth-port-notes.md` decision 3).
- **E4.6.b** A signout revokes the session row; a token signin
  validates `exp` and rejects an expired or unknown user
  (`auth/token.rb:17-30`). TS evidence:
  `tests/card/auth/session-store.test.ts` "revokeSession" +
  "validate expired / unknown token" — proven.

### E4.7 Mod save-hooks

- **E4.7.a** A save fires a mod's `:store` and `:finalize` events
  in the order registered by the mod loader, with the all-set
  base modules included first (`lib/cardio/mod/loader.rb:16-21`;
  `registrar.rb:42-49`). TS evidence:
  `src/card/mod-loader.ts` + `tests/card/mod-loader/` (28 tests,
  card-mod-help proven end-to-end against a live sha-stable Ruby
  capture of 34 mod load order, `:help` / `:help_text` / `:lead`
  views byte-exact) — proven.
- **E4.7.b** A mod's `setting_opts` (Setting definitions) register
  on `Card::Setting` with a fixed-position group, leave nil holes
  for occupied slots, and run `register_preference`
  (`lib/card/set/advanced_api.rb:10-14`;
  `lib/card/setting.rb:63-72,95-99,101-110`). TS evidence:
  `SettingRegistry` in `src/card/mod-loader/mod-registrar.ts` —
  proven on synthetic deck + the help-mod capture.

### E4.8 Drafts and rollback

- **E4.8.a** A `save_draft` event creates a fresh act with
  `draft=1`, one action with `action_type=1 (update)`, one
  `card_changes` row (`field=2 (db_content)`, value=draft text);
  the `cards` row is NOT touched
  (`mod/core/set/all/content.rb:12`;
  `card-mod-history-0.20.0 set/all/history.rb:88`). TS evidence:
  `tests/card/history/write-path.test.ts` "draft saves" — proven
  on real storage.
- **E4.8.b** A non-draft save deletes the current actor's draft
  actions for this card before the new act is created
  (`content.rb:8` -> `content/all.rb:33-39`). TS evidence:
  same test — proven.

## Spot-checks

Five citation spot-checks against the installed gems, run during this
document's authoring:

1. **change.rb TRACKED_FIELDS** — `card-mod-history-0.20.0/lib/card/change.rb:25`:
   `TRACKED_FIELDS = %w[name type_id db_content trash left_id right_id].freeze`.
   Verified at the line; field indices 0..5 match this document.
2. **action.rb TYPE_OPTIONS** — `card-mod-history-0.20.0/lib/card/action.rb:42,90-92`:
   `TYPE_OPTIONS = %i[create update delete].freeze` and
   `write_attribute :action_type, TYPE_OPTIONS.index(value)`. Verified
   at the line; indices 0/1/2 match.
3. **permissions.rb ok_to_read?** — `card-mod-permissions-0.20.0/set/all/permissions.rb:139-146`:
   `return true if Auth.always_ok?; self.read_rule_id ||= permission_rule_id :read;
   return true if Auth.as_card.read_rules_hash[read_rule_id]`. Verified
   at the lines; the read check shape matches this document.
4. **view/permission.rb altered_view / view_perms** —
   `card-1.110.0/lib/card/view/permission.rb:13-15,25-27`:
   `view_perms` = `setting(:perms) || :read`; `skip_check?` =
   `normalized_options[:skip_perms] || view_perms == :none`. Verified
   at the lines; the gate order matches this document.
5. **predicate.rb valid?** — `cardname-0.20.0/lib/cardname/predicates.rb:19-25`:
   `return true if self.class.nothing_banned?; !parts.find { |pt| pt.match self.class.banned_re }`.
   The banned regex lives at
   `cardname-0.20.0/lib/cardname/class_methods.rb:40-41`
   (`/[#{Regexp.escape(banned_array + [joint]).join}]/`). Verified at
   the lines; the ban-shape matches this document.

## Cross-references

- Architecture direction: `architecture.md`.
- Governance and gates: `governance.md`.
- Acceptance work: `work-board.md`, issue #4 (`parity`),
  issue #6 (`auth`), issue #10 (`migration`).
- Per-statement evidence (test file + status): `contract-evidence.md`.
- Stream notes (current implementation evidence):
  `docs/upstream-parity-plan-1282.md` and the per-stream
  `docs/*.md` notes (history-port-notes, actions-port-notes,
  name-port-notes, cql-port-notes, cql-execution-notes,
  cql-match-decision, fetch-port-notes, permissions-port-notes,
  permission-actors-notes, view-perms-notes, render-fix-notes,
  unknown-nest-notes, set-keys-parity-notes, help-popover-parity-notes,
  structure-templates-parity-notes, mod-loader-port-notes,
  auth-port-notes, schema-notes, write-conformance-notes,
  gherkin-port-notes, replay-harness, oracle-harness).
