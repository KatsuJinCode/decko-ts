# Actions (write-path action layer) port notes

How the card ACTION layer (Set / Save / Update / Delete) works in the Ruby
truth source and how `src/card/actions/` ports it. Every claim carries a
`file:method` or `file:line` cite into the installed gems:

- `card` — `C:\Ruby33-x64\lib\ruby\gems\3.3.0\gems\card-1.110.0`
- `card-mod-history` — `...\gems\card-mod-history-0.20.0`
- `card-mod-permissions` — `...\gems\card-mod-permissions-0.20.0`
- `activerecord-7.2.3.2`

Ported surface: `src/card/actions/card-action-engine.ts` (`CardActionEngine`:
`createCard` / `updateCard` / `deleteCard` + the `applyAction` dispatch),
`name-validation.ts`, `type-resolution.ts`, `junction-cycle-detection.ts`,
`types.ts`. Tests: `tests/card/actions/` (33) on real better-sqlite3 storage
loaded with `db/schema.sqlite.sql`. The engine builds on the ActWriter
(`src/card/history/write-path.ts`, see docs/history-port-notes.md) for every
row write; one `applyAction` call = one save request = one act.

---

## 1. Entry points and the act model

| Ruby | Cite | Port |
|---|---|---|
| `Card.create! opts` | `lib/card/director/card_class.rb:5-9` (`card = new opts; card.save!`) | `createCard` |
| `Card#update!` / `#save!` | `lib/card/director/all.rb:46-61` (both wrap `act { super }`) | `updateCard` |
| `Card#delete!` | `mod/core/set/all/trash.rb:11-21` (`add_to_trash args { update! args.merge(trash: true) }`) | `deleteCard` |
| one act per request | `director/all.rb:114-119` (`start_new_act` -> `Director.run_act`); subcards join the supercard's director (`director/store.rb:37-58`) | one `ActWriter` per `applyAction` call; side cards / obstacles / child deletes join it |

## 2. Create (Set)

Event chain ported, in Ruby order:

1. **Name legality** — `event :validate_name` -> `validate_legality_of_name`
   (`mod/core/set/all/name_events.rb:35-47`): length > 255, blank,
   `name_incomplete?` (a blank part; the `superleft&.autoname?` escape needs
   subcard context the action layer does not have), banned characters
   (`name.valid?`). Port: `validateNameLegality`, throws `name-illegal`.
2. **Type resolution** — `extract_type_id!`
   (`mod/core/set/all/type.rb:81-92`): `:type_id` (0 -> nil) > `:type_code`
   (`type_id_from_codename`, :96-99, `Card::Codename.id`) > `:type`
   (`type_id_from_cardname`, :100-103, Lexicon), each failing with "not a
   known type" via `type_id_or_error` (:104-110); `validate_type`
   (:24-30) adds "no such type" when the type card does not resolve
   (`type_card` = `quick_fetch(type_id)`, :32-35). **Default**: with no type
   given, `ensure_type_id` (:62-70) falls to the template —
   `type_id_from_template` — which for the core deck is the `*default` rule
   card; `Card.default_type_id` is `Card.fetch_type_id %i[all default]`
   (:3-5) = the type_id OF the `*all+*default` rule card itself. Seed truth:
   `mod/core/data/fixtures/real/cards.yml` `cards_011` = id 11,
   left_id 7 (`*all`), right_id 8 (`*default`), **type_id 2** (the basic
   cardtype). Port: `defaultTypeId` fetches `:all+:default` and takes its
   `typeId`.
3. **Uniqueness** — `validate_uniqueness_of_name` (name_events.rb:19-26):
   `Lexicon.id key` fast check ("cannot detect if card is in trash"), then
   the live re-fetch `Card.where(id: existing_id, trash: false).take`.
   Port: `assertNameAvailable` (lexicon + live re-check, `name-conflict`).
4. **Sides** — `prepare_left_and_right` (:68-73) resolves/creates sides;
   `prepare_new_side` (:118-125) turns a missing side into a subcard saved
   in the same act. Ruby dedupes via `Director.card(sidename)` (:121), so
   "A+A" gets ONE new card for both sides. Port: `ensureSides` (dedupe by
   key; left resolved first — `prepare_side :left` runs before `:right`).
   Side actions get `super_action_id` = the junction's action id
   (`super_action` = `@supercard.current_action`,
   `card-mod-history set/all/history/events.rb:85-92`).
5. **Revival** — `event :manage_trash, :prepare_to_store, on: :create`
   (`mod/core/set/all/trash.rb:23-27`) runs `pull_from_trash!` (:57-62):
   `Lexicon.lex_query(lex).merge(trash: true)` — a matching TRASHED row's id
   is reused (`db_attributes["id"] = trashed_card...`; `@from_trash = true`),
   `self.trash = false`. Port: `findTrashedCardByLex` (lex_query + trash = 1)
   + an `ActWriter.updateCard` that flips the row to the new record's
   attributes; see section 6 for the action-type correction.
6. **History rows** — the ActWriter contract: create actions carry ZERO
   change rows (`first_create?`, events.rb:31-32 + history.rb:38-40), the
   act row inserts lazily with NULL card_id and is claimed by
   `finalize_act` (events.rb:48-50). `createCard` forces trash = 0
   (manage_trash), `current_revision_id` stays NULL (no runtime writer).

## 3. JUNCTION SEMANTICS (the verified answer)

**Post-2020, compound names are VIRTUAL — junction rows
(left_id/right_id) are the truth, and renaming a part writes NO rows for
its junction descendants.**

- The 2020 Lexicon migration made it so:
  `mod/core/data/schema/20200718051236_compound_names_do_not_store_name_and_key.rb`:
  `change_column_null :cards, :name/:key, true` +
  `Card.where.not(left_id: nil).in_batches.update_all name: nil, key: nil`.
  Unique pair index added by `20200805200729_add_unique_pair_indices.rb`
  (`add_index :cards, %i[left_id right_id], unique: true`).
- **Creating** a simple card writes `cards.name` + `cards.key`
  (`name=` / `key=`, `lib/card/name/all.rb:20-26`: `write_attribute :name,
  (@name.simple? ? @name.s : nil)` — compound cards write NULL).
  Creating/rewiring a junction writes only left_id/right_id.
- **Renaming** a simple card writes exactly ONE row — its own
  (name + key columns, one `:update` action, change rows for the tracked
  fields that moved). `update_subcard_names` (name/all.rb:31-38) touches
  only UNSAVED in-memory subcards; nothing cascades to storage.
- **What DOES follow a rename**: caches. `event :update_referer_content`
  (`mod/core/set/all/reference_events.rb:13-19`) walks
  `each_descendant` (descendants = junctions naming the card,
  `lib/card/name/all/descendants.rb:42-48`) calling `rename_as_descendant`
  (:40-47) = `self.action = :update` (memory only) + `expire` +
  `Card::Lexicon.update self` — **cache/lexicon maintenance, zero row
  writes**. Port: `refreshDescendantCaches` mirrors the expire + Lexicon
  writes; verified by a test that pins the junction row byte-equal across a
  part rename while the composed name follows.
- **Referer CONTENT rewrites** (`content_quietly=` ->
  `update_column :db_content`, reference_events.rb:32-36) are Ruby writes
  that BYPASS history (no act/action/change rows) — the port defers them
  with the card_references layer (noted in section 9).
- **How compound renames are even detected**: the name COLUMN never moves
  (NULL -> NULL), so `changed: :name` events fire via
  `lib/card/dirty.rb:57-60` — `DirtyNames#name_is_changing? = super ||
  left_id_is_changing? || right_id_is_changing?`. The port's `nameChanged`
  implements exactly this disjunction (column diff OR side-id diff);
  a compound VARIANT (same sides) is a no-op save, as in Ruby.

## 4. Rename guards (Save/Update)

`event :validate_renaming` (name_events.rb:55-61), on `:update`,
`changed: :name`, skipped when `name_before_act == name` (key equality —
"just changing to new variant", cardname.rb#==):

- content changing in the same save -> error (`content_is_changing?`);
- type changing -> error;
- `detect_illegal_compound_names` (:83-88): simple -> compound while
  `child_ids(:right)` exist ("illegal name change; existing names end in
  +<old>"). `changing_existing_tag_to_compound?` (:90-101, the
  validate_name twin) is the same condition seen from legality — a card in
  use as a TAG (live rows with `right_id = id`) cannot become compound.
- uniqueness (section 2.3) and legality re-run for the new name.
- **Trash-name obstacle** — `event :rename_in_trash` (name_events.rb:62-66):
  `Card.find_by_key_and_trash(name.key, true)` (only simple names have a
  stored key) is renamed `"#{name}*trash"` via `rename_as_trash_obstacle`
  (:76-81) — its own action in the SAME act, no `super_action_id`
  (`@supercard` is nil; it is not a subcard).
- Port throws `rename-conflict` / `name-conflict` / `name-illegal` for
  these; Ruby adds validation errors and aborts before any row write —
  same observable outcome.

## 5. Cycle detection (a deliberate port guard)

The deliverable mandates rejecting Set/Save that would make a card its own
ancestor. **Ruby does not reject**: the direct case (a side resolving to the
card's own id) is RESTRUCTURED by `prepare_obstructed_side`
(name_events.rb:143-150 — `clear_name` NULLs the row's name/key/left/right
and the side becomes a fresh subcard), and an INDIRECT cycle (rename a part
so an existing junction becomes its own ancestor, e.g. X + Y = J, then
rename X to "J+Z") is not detected anywhere — grep over lib/ + mod/core/
found no cyclic-name check. The port REJECTS both with a `cycle` error
(`assertNotOwnAncestor`: BFS over left/right edges, trash excluded, visited
set): a self-ancestor makes composed-name reads diverge (the recursive
Lexicon walk, `lexicon.rb#lex_to_name` :43-47, never terminates), so under
the virtual-name design the guard is a correctness requirement. Runs BEFORE
side creation / obstacle writes so a rejection persists nothing. On creates
it is unreachable (a brand-new card has no id to cycle to) and is skipped.

## 6. Delete (trash flip) and revival (action typing)

- **Delete** = update save with `trash: true` (`add_to_trash`,
  trash.rb:70-72); `identify_action` (`director/all.rb:19-28`) turns the
  flip into `:delete` (action_type 2 — the trash branch outranks create).
  Port: `ActWriter.trashCard`; already-trashed cards come back as a no-op
  (the ActWriter contract).
- **System-card guard** — `validate_delete` (trash.rb:31-34): codenamed
  cards undeletable (port: `protected-card`). The `*all`-tag and
  account-edits checks (:37-49) need rules/account machinery — deferred.
- **Child cascade** — `delete_children` (trash.rb:52-59) walks `each_child`
  (`(left_id = id or right_id = id) and trash is false`,
  descendants.rb:26-31) and deletes recursively. Children are deleted
  WITHOUT re-running validate_delete: subcards save via
  `@card.save! validate: false, as_subcard: true`
  (`director/store.rb:70-73`) — ported as-is (a codenamed PART survives; a
  codenamed junction child is trashed silently). Every child action carries
  `super_action_id` = its DIRECT parent's action id.
- **Revival action type** — a create that reuses a trashed row is a
  `:create` action in Ruby: `identify_action`'s `new_card?` branch is true
  because `@from_trash` is set (`states.rb:6-8` —
  `(new_record? || !@from_trash.nil?) && !trash?`). The ActWriter models the
  row reuse as an `:update` (it has no revival entry), so the engine
  corrects the action row afterwards:
  `UPDATE card_actions SET action_type = 0`. The rest of the machinery is
  Ruby-exact through the writer: `first_create?` is false (the card has
  history), so `store_card_changes` DOES run — the create action carries
  change rows for the fields that differ from the trashed row (trash
  serializes "f", db_content the new value). The backfill check cannot
  fire: a trashed card always has >= 2 prior actions (its create + the
  delete flip).

## 7. Permission gate (basic) and the concurrency answer

- **Anonymous gate**: `Auth.current_id` falls back to `Card::AnonymousID`
  (`lib/card/auth/current.rb:7-9`); `signed_in? = current_id != AnonymousID`
  (:43-47); the ID constants are codename-generated (`codename.rb:108`,
  `Card.const_get_or_set("#{codename.camelize}ID")`). A null actor or an
  actor named `*anonymous` makes the engine read-only — every action throws
  `anonymous-actor` before any row read/write. **The full permission
  machinery (`ok?`, `check_permissions`, rule-based `who_can` —
  card-mod-permissions set/all/permissions.rb:22-51,
  `lib/card/auth/permissions.rb:7-18 always_ok?`) is deliberately NOT
  built**; the seam is the optional `canWrite?(card, actor)` hook,
  consulted per action (with a new-card placeholder for creates), falsy ->
  `permission-denied`.
- **Optimistic locking: Ruby has NONE — the port adds none.** The cards
  table carries no `lock_version` (`card-1.110.0/db/schema.rb:73-96` —
  ActiveRecord optimistic locking requires that column), and there is no
  `lock!` / `with_lock` / `lock_version` reference anywhere in the save
  paths (grep over card-1.110.0 lib/ + mod/core/ is clean). Saves are
  last-write-wins through plain AR UPDATEs, exactly like the ActWriter's
  one-batch-per-operation model. The conditional "take an expected db
  content stamp where Ruby would" therefore resolves to: Ruby wouldn't, so
  the port doesn't. (The `detect_conflict` event,
  card-mod-history events.rb:41-46, is an EDIT-FORM conflict aid keyed on
  `last_action_id_before_edit` UI state, not a storage-level lock.)

## 8. Cache coherence after actions

Ruby's post-save maintenance, ported through the FetchEngine seam
(`expireAfterWrite` / `refreshDescendantCaches`):

- `Card#expire` after EVERY save (`director/phases.rb:56-57`, integration
  ensure; cache/all.rb:17-24: both key versions via `name_before_act`,
  the legacy "~id" key, the left card). View caches are the render wave's.
- **Lexicon cache**: `event :update_lexicon` (name_events.rb:84-88,
  `changed: :name`): create -> `Lexicon.add` (lexicon.rb:86-91 — write
  id->name and lex->id), update -> `Lexicon.update` (:33-36 = add +
  `expire_lex lex_before_act` :93-95). **Deletes clean nothing** — Ruby has
  no `Lexicon.delete` caller on the trash path (grep-verified; the stale
  lex->id entry until the next cache reset is Ruby's own wart, ported
  as-is). Rename-descendant refreshes per section 3.
- Codename writes reset the codehash (`reset_codename_cache`,
  mod/core/set/all/codename.rb:9-13).

## 9. Documented divergences (each a decision)

1. **Cycle rejection instead of restructure** (section 5) — port guard,
   deliverable-mandated; stricter than Ruby.
2. **Revival action-type correction** (section 6) — one follow-up UPDATE
   because the ActWriter has no revival entry; crash between the two calls
   would leave action_type 1 (the same between-driver-calls risk class the
   history notes already document).
3. **Cross-card action-row insert order**: Ruby's belongs_to autosave
   inserts the SUPERcard's action row before its subcards'; the port
   creates side rows first (their ids are needed for the junction row) and
   PATCHES `super_action_id` afterwards. Same rows and linkage; ids within
   one act order differently. Per-card ordering (what `actions.first` /
   `create_action` read, lib/card.rb:172) is unaffected.
4. **Junction revival with trashed sides**: Ruby's `pull_from_trash!` runs
   before side creation with `-1` placeholders (`assign_side_id`,
   name/all.rb:58-63) so the junction lex cannot match; the subsequent
   INSERT would violate the unique pair index. The port creates/revives the
   sides first, so the junction lex resolves and the junction row is
   revived — the sensible outcome Ruby cannot reach.
5. **Deferred with their owners** (wave 3+): referer content rewrites
   (references layer), full permission resolution, `update_ancestor_
   timestamps` id feed (history_card_ids — the writer input exists),
   rule/template-driven default content, `validate_delete`'s `*all`-tag and
   account-edits guards, rollback/draft APIs above the writer.

## 10. Tests

`tests/card/actions/` on real in-memory SQLite (LocalSqliteDriver, DDL from
db/schema.sqlite.sql), synthetic fixtures only (`actions-test-storage.ts`
seeds the type cards, `*all` / `*default` / the `*all+*default` rule card,
and one content card — the seed-shape of the gem's cards.yml):

- `create.test.ts` (9): row conformance (cards/acts/actions, zero changes),
  type by id/code/name/default + unknown-type errors, legality rejections,
  uniqueness, anonymous rejection (null + named) writing nothing, canWrite
  seam, junction create with subcard side creation + super_action_id patch,
  A+A dedupe, junction uniqueness.
- `update.test.ts` (13): content save rows + stamps, no-op idempotency
  (nothing persisted, stamps untouched), missing/trashed targets, simple
  rename (name row, key not tracked, fetch coherence), rename guards
  (content+rename, live-name, tag-to-compound, variant allowed), trash-name
  obstacle (same act, own action, no super_action), VIRTUAL rename cascade
  (junction row byte-equal, composed name follows, warm caches coherent),
  junction rewire (right_id change row only, side created as subcard),
  direct + indirect cycle rejection, junction -> simple rename.
- `delete.test.ts` (7): delete action typing + trash change row + fetch
  asymmetry, idempotent re-delete, protected codename card, missing/anonymous,
  recursive cascade with per-level super_action_id, parts survive, diamond
  visited-set, subcard deletes skip validate_delete.
- `revive.test.ts` (4): trash + resurrect with row-id reuse, action_type 0
  correction, change rows (trash "f" + content), prior history intact,
  contentless revival resets attributes, junction revival, live-name
  conflict after revival.

## 11. State-parity status (honest split)

- **Source-verified** (file+line above, executed against real storage in
  tests): every row shape the ActWriter contract defines; the event-chain
  ordering; junction truth (NULL columns, pair uniqueness, virtual rename
  cascade); revival id reuse + create typing; delete typing + cascade +
  super_action linkage; no optimistic locking.
- **NOT yet verified against a live Ruby oracle**: byte-level fixture
  comparison of a Ruby-produced act (needs an oracle capture rung that
  performs writes — fixtures/captured/ holds read-side captures only);
  the exact row order within multi-card acts (section 8.3 divergence);
  `rename_as_descendant`'s full descendant set on deep graphs (port walks
  both edges like `each_descendant`, but no Ruby run replayed it yet).
  These are upgrade candidates for the oracle-harness write rung.
