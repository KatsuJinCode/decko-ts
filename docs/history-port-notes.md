# History write-path port notes

How the card HISTORY/WRITE PATH (card_acts / card_actions / card_changes)
works in the Ruby truth source and how `src/card/history/` ports it. Every
claim carries a `file:method` cite into the installed gems:

- `card` — `gems/card-1.110.0`
- `card-mod-history` — `...\gems\card-mod-history-0.20.0`
- ActiveRecord/ActiveModel — `...\gems\activerecord-7.2.3.2` /
  `...\gems\activemodel-7.2.3.2`

Ported surface: `src/card/history/{act,action,change,write-path}.ts`
(`ActWriter`, one instance = one save request = one act). Tests:
`tests/card/history/` — 44 tests against real better-sqlite3 storage loaded
with `db/schema.sqlite.sql`.

---

## 1. The Ruby trail — which code produces which rows

### 1.1 Request framing (the act)

| Ruby | Cite | Row effect |
|---|---|---|
| `Director.run_act` binds the request's act card | `card/lib/card/director/all.rb:114` (`start_new_act`), `director/class_methods.rb:17` (`run_act`) | none yet |
| The act object is created once per request, ip only | `director/class_methods.rb:27` `need_act` → `Card::Act.new ip_address: Env.ip` | `card_acts` NOT yet inserted — `card_id` is NULL at insert time |
| Each card's save builds a `Card::Action` in the initialize stage | `card-mod-history set/all/history/events.rb:15` `event :assign_action`, `:74` `new_action` (`act: director.need_act, action_type: action, draft: draft_action?, super_action: super_action`) | none yet (unsaved record) |
| The action type is decided before validation | `card/lib/card/director/all.rb:19` `identify_action` (`trash && trash_changed?` → `:delete`; `new_card?` → `:create`; else `:update`) | — |
| A "delete" is an update save with `trash: true` | `card/mod/core/set/all/trash.rb:11-21` (`delete`/`delete!` → `add_to_trash`), `:70` `add_to_trash` | — |
| The act row INSERTs as part of the FIRST action's save | `card-mod-history set/all/history/events.rb:26` `event :finalize_action` → `@current_action.update! card_id: id`; the action's `belongs_to :act` autosaves the new act first (`activerecord-7.2.3.2/lib/active_record/autosave_association.rb:514`) | `card_acts` INSERT (`card_id` NULL), then `card_actions` INSERT |
| act.actor_id fills from the current user at act save | `card-mod-history lib/card/act.rb:131` `assign_actor` (`self.actor_id ||= Auth.current_id`) | `card_acts.actor_id` |
| act.acted_at is a Rails create-timestamp | `act.rb:64` `timestamp_attributes_for_create << "acted_at"` | `card_acts.acted_at` |
| The act's primary card is written LAST, as its own UPDATE | `events.rb:48` `event :finalize_act, after: :finalize_action, when: :act_card?` → `Card::Director.act.update! card_id: id` | `UPDATE card_acts SET card_id` |

### 1.2 The changes (card_changes)

| Ruby | Cite | Row effect |
|---|---|---|
| Which fields are tracked | `card-mod-history lib/card/change.rb:25` `TRACKED_FIELDS = %w[name type_id db_content trash left_id right_id]`; `field` column stores the 0-based index (`change.rb:47` `field_index`, `:60` `field=`) | `card_changes.field` = 0..5 |
| Which fields changed (diff) | `card-mod-history set/all/history.rb:51` `changed_fields` = `TRACKED_FIELDS & (changed_attribute_names_to_save | saved_changes.keys)` | only changed fields get rows on updates |
| Change rows for a normal save | `events.rb:23` (`finalize_action` docstring) / `:102` `store_card_changes` → `store_each_history_field` (`:108`) with `self[field]` (the new value) | `card_changes` INSERT per changed field, value = after-value |
| **Plain create stores NO change rows** | `events.rb:31-32`: `first_create?` (`history.rb:38`: current action `:create` && `action_count == 1`) skips `store_card_changes` | create action rows exist with ZERO changes |
| **The create action's changes are backfilled at the FIRST later update/delete** | `events.rb:31` `store_card_changes_for_create_action if first_change?` (`history.rb:32`: action_type != create && `action_count == 2` && `create_action.card_changes.empty?`); values from `attribute_before_act` (`card/lib/card/dirty.rb:23`) = the pre-act row state | 6 change rows (all TRACKED_FIELDS) on the CREATE action, valued with before-values, inserted BEFORE the update's own rows so ids sort first (`events.rb:29` NOTE — `last_change_on` sorts by id) |
| Seed data confirms the lazy design | `card-1.110.0/mod/core/data/fixtures/real/card_changes.yml` is `{}` while `card_actions.yml` carries action_type-0 rows | — |
| Empty saves persist nothing | `events.rb:34` else-branch: no changed fields && no pre-existing changes → `@current_action.delete` (a no-op for the never-saved action) | no action row, no act row, no cards UPDATE (ActiveRecord skips no-op saves) |
| Draft saves | `card/mod/core/set/all/content.rb:12` `event :save_draft, :store, on: :update, when: :draft?` → `save_content_draft content; abort :success` (row save rolls back); `card-mod-history set/all/history.rb:88` `save_content_draft` → `clear_drafts` then `acts.create { act.ar_actions.build(draft: true, card_id: id, action_type: :update).card_changes.build(field: :db_content, value: content) }` | fresh act + draft action (draft=1) + ONE db_content change, inserted immediately; cards row untouched |
| Draft cleanup on real saves | `content.rb:8` (`set_content` calls `clear_drafts`) → `card/lib/card/content/all.rb:33` (`drafts.created_by(Auth.current_id).each(&:delete)`); changes cascade (`card-mod-history lib/card/action.rb:30` `dependent: :delete_all`) | actor's draft actions + their changes deleted |
| Ancestor timestamp bump | `events.rb:1` `event :update_ancestor_timestamps, :integrate` → `Card.where(id: ids).update_all(updater_id: ..., updated_at: ...)` | ancestor cards' stamps move |
| action_type storage | `card-mod-history lib/card/action.rb:42` `TYPE_OPTIONS = %i[create update delete]`, `:90` `action_type=` stores the index | `card_actions.action_type` = 0/1/2 |
| comment column | never written by core history; the only core-suite writer is the attachment mod storing the original filename (`card-mod-carrierwave set/abstract/attachment.rb:23`) | stays NULL |

### 1.3 The cards row itself (stamps the history derives from)

| Ruby | Cite | Effect |
|---|---|---|
| creator/updater stamping | `card-mod-account set/all/account.rb:20` `event :set_stamper, :prepare_to_validate` — `updater_id = Auth.current_id`; `creator_id = updater_id if new_card?` | `cards.creator_id` frozen at create; `updater_id` moves per save |
| Compound cards store NULL name/key | `card/lib/card/name/all.rb:20` (`name=` writes `name.s` only when simple, else NULL), `:64` (`key=` same) | `cards.name`/`cards.key` NULL for compound cards; `left_id`/`right_id` carry the structure |
| Cards row write happens in the :store stage, BEFORE finalize history | `card/lib/card/director/phases.rb:34` `storage_phase` (around_save), events then the row write (`director/store.rb:37` `store_with_subcards`), then `:finalize` (`phases.rb:38`) | cards INSERT/UPDATE precedes act/action/changes |

### 1.4 What card_revisions actually is (the "legacy compat" answer)

**There is no runtime writer for `card_revisions` or `cards.current_revision_id`
anywhere in card-1.110.0 or decko-0.20.0.** Verified by grep over both gems:
the only references are the schema definition (`db/schema.rb`), the cleanup
migration `mod/core/data/schema/20130106052640_table_cleanup.rb` (drops
`card_revisions.created_by`), the conversion migration
`mod/core/data/schema/20141001105348_move_revisions_to_actions.rb` (moves every
legacy revision INTO card_acts/card_actions/card_changes: act from
`rev.creator_id`/`rev.created_at`, action_type 0 for the card's first revision
with changes field 0..3 = name/type_id/content/trash, action_type 1 otherwise
with only field 2), and `lib/cardio/seed.rb:86` which strips
`current_revision_id` from seed dumps. The production dump carries 89,593
legacy rows (docs/schema-notes.md) — frozen pre-2014 data, not a live writer.
"Revisions" in 1.110 are virtual, reconstructed from changes
(`card-mod-history set/all/history/revision.rb`). The port therefore never
writes these columns; a test pins that (`tests/card/history/write-path.test.ts`,
"legacy revision tables").

---

## 2. Semantic decisions in the port

1. **One `ActWriter` = one save request = one act.** Ruby binds the act per
   request (`Director.run_act`); a second `card.update!` from scratch starts a
   new request and a new act. Multi-card saves inside one request share the
   act (`act.rb:8-11` docstring; tested).
2. **Act insert is lazy and NULL-carded.** `card_acts` inserts (with `card_id`
   NULL) when the first action row of the request persists — the
   `belongs_to` autosave ordering — and `finalize_act` writes `card_id`
   afterwards as its own UPDATE, exactly Ruby's two steps. The default
   act-card claim is "the first operation on the writer" (the common request
   shape); subcard-first orchestration overrides via `isActCard` /
   constructor `actCardId`.
3. **Field codes are the 0-based TRACKED_FIELDS index** (name=0, type_id=1,
   db_content=2, trash=3, left_id=4, right_id=5), pinned three ways in the
   Ruby source (change.rb:25; migration 20141001105348 inserts 0..3;
   events.rb:108 stores via `field:` names). **The comments in
   db/schema.sqlite.sql and src/server/schema.ts claim "name=1, content=2,
   type_id=3" — that is wrong for this engine version and should be corrected
   by the schema stream** (both files are outside this stream's boundary).
4. **Value serialization** (`change.ts#serializeChangeValue`): the value
   column is mediumtext → `ActiveRecord::Type::Text` <
   `ActiveModel::Type::String` (`abstract_mysql_adapter.rb:729`,
   `activerecord/lib/active_record/type/text.rb:6`); serialize is
   `Numeric → to_s`, `true → "t"`, `false → "f"`, String as-is, nil → NULL
   (`activemodel/lib/active_model/type/immutable_string.rb:48`). The port's
   `CardFieldState` carries raw storage shapes, so trash 0/1 is cast to
   boolean first (`changeValueForField`; AR casts tinyint(1) via
   `Type::Boolean#cast_value`, `boolean.rb:39`, 0 ∈ FALSE_VALUES).
5. **changed_fields from before/after snapshots.** Ruby diffs ActiveRecord
   dirty state across the act (`history.rb:51` union of unsaved and last-saved
   changes). The port diffs explicit pre-act/post-act row snapshots. A value
   that changes and reverts WITHIN one act (via subsaves) would get a change
   row in Ruby and none in the port — a documented, vanishingly rare
   divergence.
6. **action_count includes drafts** (`history.rb:42` has no draft filter) and
   Ruby evaluates it AFTER the :store-stage `clear_drafts` deleted the
   actor's drafts and after the action row itself is saved. The port
   replicates the observable state: own drafts are subtracted (they are about
   to be deleted in the same operation), other actors' drafts count
   (suppressing the backfill — tested), and +1 for the action about to be
   inserted.
7. **Atomicity model.** Each operation is one `driver.batch()` (one
   transaction on the local adapters) with id read-back via bookkeeping
   `SELECT last_insert_rowid()` statements and `MAX(id) FROM card_actions`
   subqueries for change rows that reference the batch's own action insert
   (the backfill INSERTs between would reset `last_insert_rowid()`). The
   cards-row INSERT of a create runs first in its own driver call (its id is
   needed to build the rest) — a crash between driver calls can leave a
   partial row set, the same shape Ruby's janitorial cleanups exist for
   (`act.rb:28` `delete_cardless`, `act.rb:33` `delete_actionless`,
   `change.rb:30` `delete_actionless`, `action/admin.rb` `delete_cardless`).
   The driver contract has no multi-statement transaction-with-reads seam;
   if one lands (decko-commons/decko#1282 follow-up), `updateCard`/`saveDraft`
   collapse into a single batch.
8. **id read-back portability.** `insertReturningId` uses the driver's
   `lastInsertRowId` when surfaced, else `SELECT last_insert_rowid()`. Both
   are connection-scoped, same as ActiveRecord's LAST_INSERT_ID() usage.
   Remote drivers must keep per-connection semantics (conformance-suite
   concern for the drivers stream).
9. **Defensive divergence:** a card with NO create action row (pre-history
   data) hitting the backfill condition would crash Ruby
   (`create_action.card_changes` on nil); the port skips the backfill.
10. **createCard forces trash=0** (`manage_trash`, trash.rb:23) and asserts
    `first_create?`'s action_count == 1 (unreachable otherwise — refuse to
    guess). Revival from trash (`pull_from_trash!`, trash.rb:59 — an UPDATE
    that reuses the trashed row's id) is deferred with the fetch layer.
11. **Divergence note on `history?`:** cards can opt out of history
    (`card-mod-history set/all/history.rb:2`; only `right/*autoname` overrides
    to false, `card/mod/core/set/right/autoname.rb:3`). The writer has no
    flag; the call layer (wave 3 events) decides whether to record.

## 3. Deferred to wave 3 (and later)

- **Auth integration**: `Auth.current_id` → `actorId` / stamper wiring;
  `Env.ip` capture; `assignActor`'s `||=` fill is exported for that layer.
- **Subcard orchestration**: the Director's breadth-first staging, `super_action`
  resolution ordering (`delete_as_subcard`, trash.rb:78), pre/post-store
  subcard sequencing. The row semantics (super_action_id passthrough, shared
  act, act-card claim) are in place and tested.
- **Reference maintenance** (`card_references`) and its feed into
  `update_ancestor_timestamps` (`history_card_ids` — `nestee_ids`,
  history.rb:10-26). The ancestor bump itself is ported; the id list is a
  caller input.
- **Cache expiry / evented callbacks**: `Action#expire` after_save
  (action.rb:44), `Card.expire` for ancestors (events.rb:6), Director clear
  (class_methods.rb:31) — cache layer is a later wave.
- **Attachment fields**: comment = original filename
  (card-mod-carrierwave attachment.rb:23); the comment passthrough exists.
- **Rollback/revert machinery**: `rollback_actions` (events.rb:40),
  `make_last_action_the_initial_action` (history.rb:69), `clear_history`.
- **Pull-from-trash revival** (`manage_trash` → `pull_from_trash!`): reuse of
  the trashed row id, needing the fetch/lexicon layer.
- **Janitorial tasks**: `delete_cardless` / `delete_actionless` /
  `empty_trash` (basket tasks, trash.rb:1).
- **Draft selection/read views** (history views, act renderers) — read-side.

## 4. Oracle verification list

Fixture-check against the production dump once the oracle harness lands its
capture rungs (fixtures/captured/ is empty today):

1. **card_changes.field codes**: production rows must carry 0..5 per
   TRACKED_FIELDS (not the 1-based scheme the local schema comments claim).
   Settles decision 3 definitively.
2. **Value serialization of "odd" values**: trash rows stored as "t"/"f",
   type_id/left_id/right_id as decimal strings, NULL for unset fields
   (esp. compound cards' `name` change rows). Confirms decision 4 against
   real AR writes rather than AR source reading.
3. **Create actions with zero change rows** in production (lazy backfill —
   cards never edited since creation), and create-action backfills whose six
   values equal the card's first-update-era state.
4. **Change id ordering**: for each card, create-action change ids < first
   update-action change ids (events.rb NOTE).
5. **card_acts.card_id NULL rows**: should be rare/absent in production
   (finalize_act always lands); if NULLs exist they identify aborted requests
   — informs whether the port's insert-NULL-then-UPDATE needs an aborted-
   request path.
6. **comment column population**: expect only attachment-ish rows
   (filenames), never user text.
7. **ip_address shapes** (IPv4/IPv6/NULL distribution) for Env.ip parity.
8. **action_type distribution**: only 0/1/2 present; draft rows are
   action_type 1 with draft=1 (save_content_draft), confirming no other
   action_type values were ever written.
9. **card_revisions/current_revision_id**: confirm the legacy table is
   frozen (max created_at predates the 2014 migration) and
   current_revision_id is NULL (or stale) across production — supports
   never writing it.
