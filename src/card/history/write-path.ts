// The history WRITE PATH: acts, actions, and changes recorded for card
// create / update / delete, ported from the Ruby truth.
//
// Ruby saves one card through a Director-run pipeline (card-1.110.0/lib/
// card/director/): the cards row is written in the :store stage, and the
// history rows are written in the :finalize stage
// (card-mod-history set/all/history/events.rb):
//
//   event :assign_action, :initialize, when: :actionable? do
//     @current_action = new_action            # Action.new(act:, action_type:, draft:, super_action:)
//   end
//   event :finalize_action, :finalize, when: :finalize_action? do
//     if changed_fields.present?
//       @current_action.update! card_id: id   # action row INSERT (autosaves the act row)
//       store_card_changes_for_create_action if first_change?
//       store_card_changes unless first_create?
//     elsif @current_action.card_changes.reload.empty?
//       @current_action.delete                # no changes -> no action row at all
//       @current_action = nil
//     end
//   end
//   event :finalize_act, after: :finalize_action, when: :act_card? do
//     Card::Director.act.update! card_id: id  # act's primary card
//   end
//
// This module reproduces that row behavior against the SQLDatabaseDriver
// seam. The caller drives the per-card sequencing (subcard orchestration,
// events like reference maintenance, cache expiry — wave 3); the writer owns
// everything from "this card's state changed" to "the storage rows exist".

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import type { CardsRow, SQLBoolean } from "../../server/schema.js";
import { sqlDateTime } from "./act.js";
import { actionTypeCode, identifyAction } from "./action.js";
import {
  changeValueForField,
  diffTrackedFields,
  trackedFieldIndex,
  type CardFieldState,
  type TrackedField,
} from "./change.js";
import type { ReadRuleRecord } from "../permissions/set-read-rule.js";

/** Re-exported for callers that build snapshots next to the writer. */
export type { CardFieldState };

export interface ActWriterOptions {
  /** The storage seam. */
  driver: SQLDatabaseDriver;
  /** Account responsible for this act's history rows. Ruby fills the act's
   *  actor_id from Auth.current_id at act save (act.rb:131-134 assign_actor)
   *  and the card's creator_id/updater_id from the same value
   *  (card-mod-account set/all/account.rb:20-23, event :set_stamper). Wave 3
   *  wires the real auth layer; until then this is the actor passthrough. */
  actorId: number;
  /** Env.ip stand-in for card_acts.ip_address
   *  (director/class_methods.rb:27-29). */
  ipAddress?: string | null;
  /** Clock for every timestamp this act writes. Defaults to () => new Date(). */
  now?: () => Date;
  /** The act's primary card id when it already exists (update/delete
   *  requests). For a create request the primary card is created inside the
   *  act and claims act-card status automatically. */
  actCardId?: number;
}

/** The cards-row attributes a create writes (all others stay NULL — see the
 *  column notes in createCard). */
export interface CreateCardInput {
  /** Simple cards: the name string. Compound cards: NULL — they carry
   *  left_id/right_id instead (lib/card/name/all.rb:20-21). */
  name: string | null;
  /** Downcased key; NULL for compound cards (lib/card/name/all.rb:64-66).
   *  Derived by the name stream, never by this writer. */
  key: string | null;
  type_id: number;
  db_content?: string | null;
  left_id?: number | null;
  right_id?: number | null;
  codename?: string | null;
  /** The read-rule pair the set_read_rule store event derives
   *  (card-mod-permissions set/all/permissions.rb:1-5): Ruby assigns the
   *  attributes during the :store stage, so the INSERT carries them. The
   *  engine computes them; this writer only places the values. */
  readRule?: ReadRuleRecord;
  /** card_actions.super_action_id passthrough for subcard actions
   *  (events.rb:88-92: the supercard's current action). */
  superActionId?: number | null;
  /** Explicitly mark this create as the act's primary card. Defaults to
   *  "the first operation on the writer" (the common request shape); see
   *  ActWriter docs. */
  isActCard?: boolean;
  /** card_actions.comment on the CREATE action — the attachment mod's
   *  :save_original_filename writes the original upload filename there on
   *  create saves too (card-mod-carrierwave set/abstract/attachment.rb
   *  :20-24; the update path already carried comment). Defaults to NULL. */
  comment?: string | null;
}

export interface UpdateCardInput {
  cardId: number;
  /** The card's tracked fields as they sit in the DB before this save
   *  (snapshot taken with cardFieldStateFromRow). */
  before: CardFieldState;
  /** The tracked fields after this save. */
  after: CardFieldState;
  /** Required when `name` changes: the new cards.key value (name= also
   *  writes key=, lib/card/name/all.rb:20-23). Ignored otherwise. */
  key?: string | null;
  /** card_actions.super_action_id passthrough (events.rb:88-92). */
  superActionId?: number | null;
  /** card_actions.comment is NOT written by the core history machinery; the
   *  only core-suite writer is the attachment mod storing the original
   *  filename (card-mod-carrierwave set/abstract/attachment.rb:23). Kept as
   *  a passthrough for that parity; defaults to NULL. */
  comment?: string | null;
  /** Cards whose updated_at/updater_id are bumped by this save — port of
   *  event :update_ancestor_timestamps (events.rb:1-7,
   *  `Card.where(id: ids).update_all(updater_id: Auth.current_id,
   *  updated_at: Time.now)`). The ancestor list comes from the reference
   *  graph (history_card_ids), which is a later wave; pass [] to skip. */
  ancestorCardIds?: number[];
  /** The read-rule pair the set_read_rule store event derived for this
   *  save (fires when type or name changed — permissions.rb:1-5): Ruby
   *  assigns the attributes before the row save, so the UPDATE carries
   *  them alongside the tracked fields (they are NOT tracked fields — no
   *  change rows). */
  readRule?: ReadRuleRecord;
  /** Explicitly mark this save as the act's primary card's own action.
   *  Defaults to "the first operation on the writer" (the common request
   *  shape); see ActWriter docs. */
  isActCard?: boolean;
  /** Fields the caller asserts are dirty BEYOND the tracked-field diff —
   *  unioned into `changed` when the diff comes up empty. Needed because
   *  Ruby's dirty flag for a mounted attachment is the ASSIGNMENT, not the
   *  computed value: re-uploading a file with the same extension computes
   *  an intermediate identifier equal to the current db_content, yet the
   *  save is real (new action row, new bytes, :correct_identifier rewrite —
   *  card-mod-carrierwave attachment.rb's mount assignment + event pair).
   *  Without this the no-op detection below silently drops the attachment
   *  save. */
  dirtyFields?: readonly TrackedField[];
}

export interface SavedAction {
  actId: number;
  actionId: number;
}

export interface CreatedCard extends SavedAction {
  cardId: number;
}

/** TRACKED_FIELDS in storage order — the order Ruby's
 *  store_card_changes_for_create_action iterates
 *  (events.rb:108-115, `fields ||= Card::Change::TRACKED_FIELDS`). */
const ALL_TRACKED_WRITE_ORDER: (keyof CardFieldState)[] = [
  "name",
  "type_id",
  "db_content",
  "trash",
  "left_id",
  "right_id",
];

/**
 * One save "request". All history rows recorded through one ActWriter share
 * one card_acts row ("if a given web form submission updates the contents of
 * three cards, then the submission will result in the recording of three
 * actions, each of which is tied to one act" — act.rb:8-11), and the act row
 * is inserted lazily when the first action row is persisted — in Ruby the
 * act is only `Card::Act.new`ed up front (director/class_methods.rb:27-29)
 * and INSERTs as part of the first action's save via belongs_to autosave
 * (activerecord-7.2.3.2/lib/active_record/autosave_association.rb:514-515).
 *
 * The act row is inserted with card_id NULL — Ruby's Act.new never sets one
 * — and the act's primary card is written by the finalize_act port
 * (`UPDATE card_acts SET card_id`), exactly the two-step Ruby performs
 * (events.rb:48-50). Which operation is the act card's own: the constructor
 * may pin `actCardId`; otherwise the FIRST operation claims act-card status
 * (the common request shape: the request starts on its act card). A
 * subcard-first orchestration (wave 3) must pass `isActCard: false` on the
 * subcard operations and `isActCard: true` on the act card's operation, or
 * construct the writer with `actCardId` once known.
 */
export class ActWriter {
  private readonly driver: SQLDatabaseDriver;
  private readonly actorId: number;
  private readonly ipAddress: string | null;
  private readonly clock: () => Date;
  private actCardId: number | undefined;
  private actId: number | null = null;

  constructor(options: ActWriterOptions) {
    this.driver = options.driver;
    this.actorId = options.actorId;
    this.ipAddress = options.ipAddress ?? null;
    this.clock = options.now ?? (() => new Date());
    this.actCardId = options.actCardId;
  }

  // -----------------------------------------------------------------------
  // create — Ruby: :create action, cards row INSERT, and (first_create?)
  // NO change rows. The create action's changes are stored lazily by the
  // first later update (see updateCard).
  // -----------------------------------------------------------------------

  async createCard(input: CreateCardInput): Promise<CreatedCard> {
    this.assertNameKeyConvention(input.name, input.key, input.left_id, input.right_id);
    const ts = sqlDateTime(this.clock());
    const trash: SQLBoolean = 0; // event :manage_trash forces trash false on create
    // (mod/core/set/all/trash.rb:23-27); revival from trash reuses the old
    // row via a different path and is deferred (docs/history-port-notes.md).

    const cardId = await this.insertReturningId(
      `INSERT INTO cards
         (name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [
        input.name,
        input.key,
        input.codename ?? null,
        input.left_id ?? null,
        input.right_id ?? null,
        ts,
        ts,
        this.actorId, // creator_id = updater_id = Auth.current_id (set_stamper)
        this.actorId,
        input.readRule?.readRuleClass ?? null, // set_read_rule store event
        input.readRule?.readRuleId ?? null, // (permissions.rb:1-5)
        trash,
        input.type_id,
        input.db_content ?? null,
      ],
    );

    const stmts: SQLStatement[] = [];
    const actIdSelect = this.pushClearDraftsAndAct(stmts, cardId, ts);
    const actionIdSelect = this.pushInsertAction(stmts, {
      cardId,
      superActionId: input.superActionId ?? null,
      actionType: actionTypeCode("create"),
      draft: 0,
      comment: input.comment ?? null,
    });
    const { actId, actionId } = await this.runBatch(stmts, { actIdSelect, actionIdSelect });

    // finalize_action: first_create? (set/all/history.rb:38-40 —
    // "@current_action.action_type == :create && action_count == 1") skips
    // change storage entirely; a plain create leaves card_changes untouched
    // (seed truth: mod/core/data/fixtures/real/card_changes.yml is empty
    // while card_actions.yml is full of create rows).
    const actionCount = await this.actionCount(cardId);
    if (actionCount !== 1) {
      // first_create? is false; Ruby would then run store_card_changes for
      // the create action. Unreachable for a fresh INSERT — refuse to guess.
      throw new Error(
        `createCard: expected exactly 1 action row for card ${cardId}, found ${actionCount}`,
      );
    }

    await this.finalizeActCard(cardId, this.isActCardOp(cardId, input.isActCard));
    return { cardId, actId: this.requireActId(actId), actionId: requireId(actionId) };
  }

  // -----------------------------------------------------------------------
  // update / delete — Ruby: :update or :delete action; change rows only for
  // fields that differ from the pre-act DB state.
  // -----------------------------------------------------------------------

  async updateCard(input: UpdateCardInput): Promise<SavedAction | null> {
    let changed = diffTrackedFields(input.before, input.after);
    if (changed.length === 0 && input.dirtyFields !== undefined) {
      // Caller-asserted dirty fields (the mounted-attachment assignment —
      // see UpdateCardInput.dirtyFields): a real save even when the computed
      // values equal the pre-act state.
      changed = [...input.dirtyFields];
    }
    if (changed.length === 0) {
      // finalize_action else-branch (events.rb:34-37): with no changed
      // fields and no pre-existing changes the action row is never saved,
      // and ActiveRecord skips the cards-row UPDATE entirely (no-op save).
      return null;
    }
    if (changed.includes("name")) {
      if (input.key === undefined) {
        throw new Error(
          "updateCard: a name change requires `key` (name= writes key=; lib/card/name/all.rb:20-23)",
        );
      }
      this.assertNameKeyConvention(
        input.after.name,
        input.key,
        input.after.left_id,
        input.after.right_id,
      );
    }

    const actionType = identifyAction({
      trashBefore: input.before.trash,
      trashAfter: input.after.trash,
      isNewCard: false,
    });
    const ts = sqlDateTime(this.clock());

    // Pre-reads (single-writer assumption as in ActiveRecord; the values are
    // re-derivable, not authoritative, so no locking is attempted).
    const actionCountBefore = await this.actionCount(input.cardId);
    // first_change? (set/all/history.rb:32-36 — action_type != :create &&
    // action_count == 2 && create_action.card_changes.empty?). Ruby counts
    // AFTER the :store-stage clear_drafts (event :set_content,
    // mod/core/set/all/content.rb:8) deleted this actor's drafts and after
    // `@current_action.update! card_id: id` saved the new action row, so the
    // port subtracts the drafts the batch is about to clear and adds the
    // action it is about to insert.
    const ownDrafts = await this.ownDraftCount(input.cardId);
    const actionCountAtFinalize = actionCountBefore - ownDrafts + 1;
    let backfill: { createActionId: number } | null = null;
    if (actionType !== "create" && actionCountAtFinalize === 2) {
      const createAction = await this.firstNonDraftAction(input.cardId);
      if (createAction !== undefined) {
        if ((await this.changeCount(createAction.id)) === 0) {
          backfill = { createActionId: createAction.id };
        }
      }
      // No create action row (e.g. pre-history card): Ruby would crash on
      // create_action.card_changes; the port skips the backfill instead.
    }

    const stmts: SQLStatement[] = [];
    const actIdSelect = this.pushClearDraftsAndAct(stmts, input.cardId, ts);
    const updateCardsIndex = this.pushUpdateCardsRow(stmts, input, changed, ts);
    const actionIdSelect = this.pushInsertAction(stmts, {
      cardId: input.cardId,
      superActionId: input.superActionId ?? null,
      actionType: actionTypeCode(actionType),
      draft: 0,
      comment: input.comment ?? null,
    });
    if (backfill !== null) {
      // store_card_changes_for_create_action (events.rb:95-100): the create
      // action gets one change per TRACKED_FIELDS entry, valued with the
      // pre-act state (attribute_before_act — lib/card/dirty.rb:23-33; for
      // fields this act changed that is the pre-save value, for untouched
      // fields the current value, which is the same pre-act row either way).
      // These rows are inserted BEFORE the update's own changes so their ids
      // sort earlier (events.rb:29-31 NOTE — last_change_on orders by id).
      for (const field of ALL_TRACKED_WRITE_ORDER) {
        this.pushInsertChange(stmts, { kind: "id", id: backfill.createActionId }, field, input.before[field]);
      }
    }
    // store_card_changes (events.rb:102-106): one change per changed field,
    // valued with the post-act state (self[field]). The rows reference the
    // action inserted earlier in this batch via a MAX(id) subquery scoped to
    // the card: the statements in between (the create-action backfill) only
    // touch card_changes, so the subquery still resolves to this save's
    // action row inside the atomic batch — unlike last_insert_rowid(), which
    // every INSERT resets.
    for (const field of changed) {
      this.pushInsertChange(stmts, { kind: "newActionRow", cardId: input.cardId }, field, input.after[field]);
    }
    // integration stage, event :update_ancestor_timestamps (events.rb:1-7,
    // `Card.where(id: ids).update_all(updater_id: Auth.current_id,
    // updated_at: Time.now)`). Ruby's cache expiry for the ancestors is
    // wave 3.
    const ancestors = input.ancestorCardIds ?? [];
    if (ancestors.length > 0) {
      stmts.push({
        sql: `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id IN (${ancestors
          .map(() => "?")
          .join(", ")})`,
        params: [ts, this.actorId, ...ancestors],
      });
    }

    const { actId, actionId, results } = await this.runBatch(stmts, {
      actIdSelect,
      actionIdSelect,
    });

    const saved = { actId: this.requireActId(actId), actionId: requireId(actionId) };
    const updateResult = results[updateCardsIndex];
    if (updateResult.rowsAffected !== 1) {
      throw new Error(
        `updateCard: cards row ${input.cardId} not updated (rowsAffected=${updateResult.rowsAffected})`,
      );
    }
    await this.finalizeActCard(input.cardId, this.isActCardOp(input.cardId, input.isActCard));
    return saved;
  }

  /** `card.delete!` = an update save with trash: true
   *  (mod/core/set/all/trash.rb:11-21, :70-72); identify_action turns the
   *  trash flip into a :delete action. Already-trashed cards come back as a
   *  no-op (trash_changed? false -> plain :update with no changed fields).
   *  Child cards are deleted as subcards with their own delete actions in
   *  the same act (trash.rb:46-57 delete_children) — pass each child through
   *  updateCard with superActionId (subcard orchestration is wave 3). */
  async trashCard(input: {
    cardId: number;
    before: CardFieldState;
    superActionId?: number | null;
    ancestorCardIds?: number[];
  }): Promise<SavedAction | null> {
    const after: CardFieldState =
      input.before.trash === 1 ? input.before : { ...input.before, trash: 1 };
    return this.updateCard({ ...input, after });
  }

  // -----------------------------------------------------------------------
  // drafts — card-mod-history set/all/history.rb:88-94
  // -----------------------------------------------------------------------

  /** Draft saves record history WITHOUT touching the cards row: the
   *  save_draft event runs in the :store stage and aborts the act
   *  (mod/core/set/all/content.rb:12-15, `save_content_draft content;
   *  abort :success` — the storage-phase abort rolls the row save back), so
   *  only the draft's own rows persist: a fresh act (history.rb:88-94
   *  `acts.create` always builds its own), an action with draft=true and
   *  action_type :update, and one db_content change, all created immediately
   *  (unlike the lazy create-action backfill). save_content_draft clears the
   *  current actor's earlier drafts for this card first (history.rb:88-90,
   *  super -> clear_drafts). */
  async saveDraft(input: { cardId: number; content: string | null }): Promise<SavedAction> {
    const ts = sqlDateTime(this.clock());
    const stmts: SQLStatement[] = [];
    this.pushClearOwnDrafts(stmts, input.cardId);
    const actIdSelect = this.pushInsertAct(stmts, input.cardId, ts); // always a NEW act
    const actionIdSelect = this.pushInsertAction(stmts, {
      cardId: input.cardId,
      superActionId: null,
      actionType: actionTypeCode("update"),
      draft: 1,
      comment: null,
    });
    this.pushInsertChange(stmts, { kind: "newActionRow", cardId: input.cardId }, "db_content", input.content);
    const { actId, actionId } = await this.runBatch(stmts, { actIdSelect, actionIdSelect });
    return { actId: this.requireActId(actId), actionId: requireId(actionId) };
  }

  /** Deletes this writer's actor's draft actions (and their changes) for one
   *  card — clear_drafts (lib/card/content/all.rb:33-35,
   *  `drafts.created_by(Card::Auth.current_id).each(&:delete)`, with
   *  card_changes dependent: :delete_all, action.rb:30-33). */
  async clearOwnDrafts(cardId: number): Promise<void> {
    const stmts: SQLStatement[] = [];
    this.pushClearOwnDrafts(stmts, cardId);
    await this.driver.batch(stmts);
  }

  /** The act row's id once at least one action has been persisted. */
  currentActId(): number | null {
    return this.actId;
  }

  // -----------------------------------------------------------------------
  // internals
  // -----------------------------------------------------------------------

  /** :store stage clear_drafts (event :set_content) plus the lazy act INSERT
   *  when this operation is the act's first persisted action. The act row is
   *  inserted with card_id NULL (Ruby's Act.new sets only the ip; the
   *  primary card is written by finalize_act). Returns the batch index of
   *  the act-id read-back SELECT, or undefined when the act row already
   *  exists. */
  private pushClearDraftsAndAct(
    stmts: SQLStatement[],
    draftsCardId: number,
    ts: string,
  ): number | undefined {
    this.pushClearOwnDrafts(stmts, draftsCardId);
    if (this.actId !== null) return undefined;
    return this.pushInsertAct(stmts, null, ts);
  }

  /** act INSERT on the first persisted action of the act (belongs_to
   *  autosave — see the class doc). acted_at is the Rails create-timestamp
   *  (act.rb:64-68); actor_id the assign_actor fill (act.rb:131-134). */
  private pushInsertAct(
    stmts: SQLStatement[],
    cardId: number | null,
    actedAt: string,
  ): number {
    stmts.push({
      sql: "INSERT INTO card_acts (card_id, actor_id, acted_at, ip_address) VALUES (?, ?, ?, ?)",
      params: [cardId, this.actorId, actedAt, this.ipAddress],
    });
    stmts.push({ sql: "SELECT last_insert_rowid() AS id", params: [] });
    return stmts.length - 1;
  }

  /** action row INSERT. When the act row is inserted in the same batch, the
   *  card_act_id is supplied as SQL last_insert_rowid() (batch statements
   *  share one connection; the id read-back SELECT between the two INSERTs
   *  does not reset it). Returns the batch index of the action-id read-back
   *  SELECT. */
  private pushInsertAction(
    stmts: SQLStatement[],
    input: {
      cardId: number;
      superActionId: number | null;
      actionType: number;
      draft: SQLBoolean;
      comment: string | null;
    },
  ): number {
    const actIdSql = this.actId === null ? "last_insert_rowid()" : "?";
    const params =
      this.actId === null
        ? [input.cardId, input.superActionId, input.actionType, input.draft, input.comment]
        : [
            input.cardId,
            this.actId,
            input.superActionId,
            input.actionType,
            input.draft,
            input.comment,
          ];
    stmts.push({
      sql: `INSERT INTO card_actions
              (card_id, card_act_id, super_action_id, action_type, draft, comment)
            VALUES (?, ${actIdSql}, ?, ?, ?, ?)`,
      params,
    });
    stmts.push({ sql: "SELECT last_insert_rowid() AS id", params: [] });
    return stmts.length - 1;
  }

  /** One card_changes row. `actionId` either names a known action row (the
   *  create-action backfill) or is "newActionRow", meaning the change belongs
   *  to the action row inserted earlier in the same batch — referenced with a
   *  MAX(id) subquery scoped to the card, which stays correct even when other
   *  INSERTs (the backfill rows) run in between. */
  private pushInsertChange(
    stmts: SQLStatement[],
    actionId: { kind: "id"; id: number } | { kind: "newActionRow"; cardId: number },
    field: keyof CardFieldState,
    value: string | number | SQLBoolean | null,
  ): void {
    if (actionId.kind === "newActionRow") {
      stmts.push({
        sql: `INSERT INTO card_changes (card_action_id, field, value)
              VALUES ((SELECT MAX(id) FROM card_actions WHERE card_id = ?), ?, ?)`,
        params: [actionId.cardId, trackedFieldIndex(field), changeValueForField(field, value)],
      });
      return;
    }
    stmts.push({
      sql: "INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)",
      params: [actionId.id, trackedFieldIndex(field), changeValueForField(field, value)],
    });
  }

  /** clear_drafts for this writer's actor, set-based: the changes first
   *  (dependent: :delete_all), then the draft action rows themselves. */
  private pushClearOwnDrafts(stmts: SQLStatement[], cardId: number): void {
    const draftPredicate = `card_actions.card_id = ?
      AND card_actions.draft = 1
      AND card_actions.card_act_id IN (SELECT id FROM card_acts WHERE actor_id = ?)`;
    stmts.push({
      sql: `DELETE FROM card_changes WHERE card_action_id IN
              (SELECT id FROM card_actions WHERE ${draftPredicate})`,
      params: [cardId, this.actorId],
    });
    stmts.push({
      sql: `DELETE FROM card_actions WHERE ${draftPredicate}`,
      params: [cardId, this.actorId],
    });
  }

  /** ActiveRecord writes only the changed attributes plus updated_at; name=
   *  also writes key= (lib/card/name/all.rb:20-23). updater_id comes from
   *  set_stamper (card-mod-account set/all/account.rb:20-22). Returns the
   *  statement's batch index for the rowsAffected assertion. */
  private pushUpdateCardsRow(
    stmts: SQLStatement[],
    input: UpdateCardInput,
    changed: (keyof CardFieldState)[],
    ts: string,
  ): number {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const field of changed) {
      sets.push(`${field} = ?`);
      params.push(input.after[field]);
    }
    if (changed.includes("name")) {
      sets.push("key = ?");
      params.push(input.key ?? null);
    }
    if (input.readRule !== undefined) {
      // set_read_rule store event (permissions.rb:1-5): the pair rides the
      // same row UPDATE (Ruby assigns the attributes pre-store). Not tracked
      // fields — no change rows exist for them.
      sets.push("read_rule_class = ?", "read_rule_id = ?");
      params.push(input.readRule.readRuleClass, input.readRule.readRuleId);
    }
    sets.push("updated_at = ?", "updater_id = ?");
    params.push(ts, this.actorId);
    stmts.push({
      sql: `UPDATE cards SET ${sets.join(", ")} WHERE id = ?`,
      params: [...params, input.cardId],
    });
    return stmts.length - 1;
  }

  /** Runs one operation's statements as one atomic batch, reads generated
   *  ids back from the bookkeeping SELECTs, and caches the act id. */
  private async runBatch(
    stmts: SQLStatement[],
    reads: { actIdSelect?: number; actionIdSelect?: number },
  ): Promise<{ actId?: number; actionId?: number; results: SQLQueryResult[] }> {
    const results = await this.driver.batch(stmts);
    const out: { actId?: number; actionId?: number; results: SQLQueryResult[] } = { results };
    if (reads.actIdSelect !== undefined) {
      out.actId = selectId(results[reads.actIdSelect]);
    }
    if (reads.actionIdSelect !== undefined) {
      out.actionId = selectId(results[reads.actionIdSelect]);
    }
    if (out.actId !== undefined) this.actId = out.actId;
    return out;
  }

  /** Event :finalize_act (events.rb:48-50, `Card::Director.act.update!
   *  card_id: id`): the act's primary card, written as its own UPDATE — the
   *  row was inserted with card_id NULL. Only the act card's own operation
   *  reaches here; subcard operations return early. */
  private async finalizeActCard(cardId: number, isActCard: boolean): Promise<void> {
    if (!isActCard || this.actId === null) return;
    if (this.actCardId !== undefined && this.actCardId !== cardId) {
      throw new Error(
        `ActWriter: card ${cardId} claims act-card status already held by card ${this.actCardId}`,
      );
    }
    this.actCardId = cardId;
    await this.driver.query("UPDATE card_acts SET card_id = ? WHERE id = ?", [
      cardId,
      this.actId,
    ]);
  }

  /** Resolve whether this operation is the act card's own action: an
   *  explicit input wins; otherwise a pinned actCardId decides; otherwise
   *  the first operation claims act-card status (documented default). */
  private isActCardOp(cardId: number, explicit: boolean | undefined): boolean {
    if (explicit !== undefined) {
      if (explicit && this.actCardId !== undefined && this.actCardId !== cardId) {
        throw new Error(
          `ActWriter: card ${cardId} claims act-card status already held by card ${this.actCardId}`,
        );
      }
      if (explicit) this.actCardId = cardId;
      return explicit;
    }
    if (this.actCardId !== undefined) return this.actCardId === cardId;
    this.actCardId = cardId;
    return true;
  }

  private requireActId(readBack?: number): number {
    const id = this.actId ?? readBack;
    if (id === undefined || id === null) {
      throw new Error("ActWriter: no act row persisted yet");
    }
    return id;
  }

  /** INSERT plus id read-back. Drivers that surface lastInsertRowId (the
   *  local SQLite adapters) avoid the extra round trip; the fallback uses
   *  SQLite's connection-scoped last_insert_rowid(), the same mechanism
   *  ActiveRecord relies on. */
  private async insertReturningId(sql: string, params: unknown[]): Promise<number> {
    const result = await this.driver.query(sql, params);
    if (result.lastInsertRowId !== undefined) {
      return Number(result.lastInsertRowId);
    }
    const rows = await this.driver.query<{ id: number }>("SELECT last_insert_rowid() AS id", []);
    return Number(rows.rows[0].id);
  }

  /** Card::Action count INCLUDING drafts — set/all/history.rb:42-44
   *  (`Card::Action.where(card_id: ...)` has no draft filter). */
  private async actionCount(cardId: number): Promise<number> {
    const result = await this.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?",
      [cardId],
    );
    return Number(result.rows[0].n);
  }

  /** This writer's actor's draft-action count for one card — the rows the
   *  :store-stage clear_drafts is about to delete (same predicate as
   *  pushClearOwnDrafts, built from drafts.created_by,
   *  lib/card/content/all.rb:33-35). */
  private async ownDraftCount(cardId: number): Promise<number> {
    const result = await this.driver.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card_actions
       WHERE card_actions.card_id = ? AND card_actions.draft = 1
         AND card_actions.card_act_id IN (SELECT id FROM card_acts WHERE actor_id = ?)`,
      [cardId, this.actorId],
    );
    return Number(result.rows[0].n);
  }

  /** create_action — the card's first non-draft action
   *  (set/all/history/actions.rb:21-23 `@create_action ||= actions.first`,
   *  with Card#actions = draft [nil, false] ordered by id, lib/card.rb:172). */
  private async firstNonDraftAction(
    cardId: number,
  ): Promise<{ id: number; action_type: number } | undefined> {
    const result = await this.driver.query<{ id: number; action_type: number }>(
      `SELECT id, action_type FROM card_actions
       WHERE card_id = ? AND (draft IS NULL OR draft = 0)
       ORDER BY id LIMIT 1`,
      [cardId],
    );
    return result.rows[0];
  }

  private async changeCount(actionId: number): Promise<number> {
    const result = await this.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_changes WHERE card_action_id = ?",
      [actionId],
    );
    return Number(result.rows[0].n);
  }

  /** cards.name/key carry simple names only; compound cards are NULL there
   *  and identified by left_id/right_id (lib/card/name/all.rb:20-21, :64-66). */
  private assertNameKeyConvention(
    name: string | null,
    key: string | null,
    leftId: number | null | undefined,
    rightId: number | null | undefined,
  ): void {
    const compound = (leftId ?? null) !== null || (rightId ?? null) !== null;
    if (compound && (name !== null || key !== null)) {
      throw new Error(
        "ActWriter: compound cards (left_id/right_id set) must carry name = key = NULL",
      );
    }
    if (!compound && (name === null || key === null)) {
      throw new Error("ActWriter: simple cards require both name and key");
    }
  }
}

function requireId(id: number | undefined): number {
  if (id === undefined) {
    throw new Error("ActWriter: id read-back returned no row (last_insert_rowid unavailable)");
  }
  return id;
}

function selectId(result: SQLQueryResult): number | undefined {
  const row = result.rows[0] as { id: number } | undefined;
  return row === undefined ? undefined : Number(row.id);
}

/** Snapshot a cards row's tracked fields in the raw attribute form the
 *  change-value store uses (`self[field]` — events.rb:102-106). */
export function cardFieldStateFromRow(row: CardsRow): CardFieldState {
  return {
    name: row.name,
    type_id: row.type_id,
    db_content: row.db_content,
    trash: row.trash,
    left_id: row.left_id,
    right_id: row.right_id,
  };
}
