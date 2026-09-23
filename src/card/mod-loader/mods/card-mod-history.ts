// The card-mod-history gem (card-mod-history-0.20.0), ported through the
// mod loader - the history-tracking mod (acts, actions, changes).
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-history-0.20.0/): eleven set files under set/ (set/all/history.rb
// plus nine files in set/all/history/ and set/all/history_board.rb), twelve
// lib/ files, one stylesheet, one admin config, locales, test data. No
// mod.yml. The WRITE side of the history pipeline (events :assign_action,
// :finalize_action, :finalize_act, :update_ancestor_timestamps, drafts) is
// ALREADY ported against this gem's set/all/history/events.rb - it lives in
// src/card/history/write-path.ts (ActWriter) with act.ts/action.ts/change.ts
// carrying the lib/card/act.rb, lib/card/action.rb and lib/card/change.rb
// row semantics. This module ports the READ side those files do not cover:
//
// - set/all/history.rb card methods: history_card_ids / history_parent_ids /
//   history_ancestor_ids (the reference-graph walk), action_count,
//   has_edits?, diff_args
// - set/all/history/actions.rb card methods: action_ids, all_action_ids,
//   create_action, nth_action, history_actions + the format :html legend
//   helpers (action_legend / content_legend bytes)
// - set/all/history/last.rb: last_action / last_action_id / previous_action /
//   last_change_on (the SQL the changes table is queried with) / revised_at /
//   last_act / acted_at
// - set/all/history/acts.rb: history_acts (the Act.all_with_actions_on SQL,
//   lib/card/act.rb:46-52) and draft_acts
// - set/all/history/revision.rb: revision / revision_attributes /
//   revision_before_action
// - set/all/history/selected.rb query-backed pieces: selected_content /
//   content_at_time_of_selected_action / action_from_id
// - set/all/history/act_listing.rb: ACTION_ICONS + action_icon (the icon-tag
//   bytes, resolved through card-mod-bootstrap's material icon basket)
// - set/all/history/views.rb view :draft_legend - the ONLY html view of the
//   twelve whose bytes need no render-time data (T6 verdict
//   tools/compat-report/mod-compat-report.json, card-mod-history-0.20.0
//   entry: 0/12 html views covered)
// - set/all/history/export.rb hash shapes: act_hash / action_hash /
//   changes_hash / action_hash_list (the json :history/:actions payloads)
// - set/all/history/events.rb predicate: edit_conflict?
// - lib/card/action/changes.rb: the Action<->Change readers (change /
//   value / previous_change / previous_value / sole?) that
//   last_change_on and revision_attributes are built on
// - lib/card/mod/history.rb: acts_per_page = 10
//
// NOT yet ported (honest remainder):
// - eleven html views - history, act, act_legend, action_summary,
//   action_expanded, change, last_action, last_action_verb (views.rb) and
//   creator_credit, updated_by, board_act (history_board.rb) - plus the two
//   json views (export.rb :history/:actions). Their bodies read act/action/
//   change rows, diff objects, and arbitrary CQL searches AT RENDER TIME;
//   a ViewFn is synchronous and the engine's render surface
//   (src/card/render/format.ts RenderEngineLike) exposes prefetched cards
//   only - there is no render-time query seam to drive these reads through.
//   Specific external deps per view: act_legend's bs_layout (defined in a
//   gem not installed here - grep for "def bs_layout" across
//   C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/ matches only the history mod's
//   own four usages); content_legend's Card::Content::Diff chunk renderer
//   IS byte-pinned here (card-1.110.0 lib/card/content/diff.rb:16-21) but
//   the layout around it is not; last_action renders the :acted_at view
//   (card-mod-format-0.20.0 set/all/base.rb:63 - a different mod's view,
//   absent from the TS HTML_VIEWS registry) and nests card.last_actor by
//   id (no id-nest surface); updated_by runs Card.search(updater_of:)
//   (CQL parser support exists - src/cql/parser.ts:515 - but no render-time
//   search execution surface takes a query string).
// - events :detect_conflict body (errors.add + I18n) and :rollback_actions
//   body (process_revert_actions drives update! + abort :success) - the
//   error / abort pipeline is a later wave; edit_conflict? (the
//   detect_conflict guard) IS ported here. ALL SIX event declarations
//   pin into the manifest events[] surface (the fn bodies are stubs -
//   see the events-block header below).
// - lib/card/action/differ.rb diff objects (Card::Content::Diff) and
//   lib/card/action/admin.rb janitors, lib/card/act/act_renderer/* and
//   lib/card/action/action_renderer.rb (the bootstrap act/action renderers
//   behind the unported views)
// - set/all/history.rb write helpers already covered by write-path.ts
//   (save_content_draft -> saveDraft; delete_all_changes /
//   delete_old_actions / make_last_action_the_initial_action are the admin
//   janitors, not ported)
// - assets/style/history.scss - stylesheet mods are a separate surface
// - config/admin.yml (the admin views list) - no TS consumer

import type { SQLDatabaseDriver } from "../../../server/driver.js";
import { sqlDateTime } from "../../history/act.js";
import type {
  CardActsRow,
  CardActionsRow,
  CardChangesRow,
  CardsRow,
} from "../../../server/schema.js";
import {
  ACTION_TYPE_CODES,
  actionTypeFromCode,
  type ActionType,
} from "../../history/action.js";
import {
  TRACKED_FIELDS,
  trackedFieldByIndex,
  trackedFieldIndex,
  type TrackedField,
} from "../../history/change.js";
import type {
  DeckoModManifest,
  ModEventFn,
} from "../mod-manifest.js";
import type { ViewFn } from "../../render/format.js";

// ---------------------------------------------------------------------------
// row shapes the reader returns (the ActiveRecord attribute surface)
// ---------------------------------------------------------------------------

/** One card_acts row (Card::Act - lib/card/act.rb:22-28 attributes). */
export type HistoryActRow = CardActsRow;

/** One card_actions row (Card::Action - lib/card/action.rb attributes; the
 *  draft column reads 0/1/NULL in SQLite, ActiveRecord casts tinyint(1)). */
export type HistoryActionRow = CardActionsRow;

/** A Card::Change as the reader hands it back: the field as its NAME
 *  (change.rb:67-69, `TRACKED_FIELDS[read_attribute(:field)]`) and the
 *  stored value (serialized string, or - for the synthesized current-state
 *  changes of changes.rb:72-84 - the raw attribute: boolean for trash,
 *  integer for type_id). */
export interface HistoryChangeRow {
  cardActionId: number;
  field: TrackedField;
  value: string | number | boolean | null;
}

/** The revision hashes (revision.rb:2-26): tracked field -> value. The
 *  revision_before_action no-previous-action case stores the literal
 *  `trash: true` (revision.rb:23-25). */
export type RevisionState = Partial<Record<TrackedField, string | number | boolean | null>>;

// ---------------------------------------------------------------------------
// config (lib/card/mod/history.rb:1)
// ---------------------------------------------------------------------------

/** Cardio::Railtie.config.acts_per_page = 10 - the default page size the
 *  act listings page by (act_listing.rb:73-75 reads
 *  `Card.config.acts_per_page || 10`; the railtie config is where the 10
 *  comes from). */
export const HISTORY_ACTS_PER_PAGE = 10;

/** history.rb:63-65 diff_args: `{ diff_format: :text }` - the options the
 *  Differ's content_diff_object builds Card::Content::Diff with
 *  (differ.rb:78-86 reads card.include_set_modules.diff_args). */
export const HISTORY_DIFF_ARGS = { diffFormat: "text" } as const;

// ---------------------------------------------------------------------------
// set/all/history.rb - the reference-graph walk + counters
// ---------------------------------------------------------------------------

/** nesting_ids (history.rb:98-102): the DISTINCT referer/referee ids of this
 *  card's type-I (inclusion) references. nestee_ids
 *  (history.rb:55-57) queries (referee_id WHERE referer_id = id) - the cards
 *  THIS card nests; nester_ids (history.rb:59-61) the reverse. */
async function nestingIds(
  driver: SQLDatabaseDriver,
  returnField: "referee_id" | "referer_id",
  whereField: "referee_id" | "referer_id",
  cardId: number,
): Promise<number[]> {
  const result = await driver.query<{ nid: number | null }>(
    `SELECT DISTINCT ${returnField} AS nid FROM card_references
     WHERE ref_type = 'I' AND ${whereField} = ?`,
    [cardId],
  );
  return result.rows.map((r) => r.nid).filter((id): id is number => id !== null);
}

/** history_card_ids (history.rb:11-13): `nestee_ids << id` - all cards whose
 *  acts are considered part of this card's history. The `requiring_id` guard
 *  (history.rb:104-106) is the caller's job here: pass a real id. */
export async function historyCardIds(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number[]> {
  return [...(await nestingIds(driver, "referee_id", "referer_id", cardId)), cardId];
}

/** history_parent_ids (history.rb:16-18): `nester_ids` - all cards that are
 *  considered updated if this card is updated. */
export async function historyParentIds(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number[]> {
  return nestingIds(driver, "referer_id", "referee_id", cardId);
}

/** history_ancestor_ids (history.rb:20-27): the parent graph walked
 *  recursively, `return [] if recursion_level > 5`. The `id.card&.` hop
 *  (history.rb:23-24) fetches each parent card WITHOUT look_in_trash - a
 *  trashed or missing parent contributes nothing. Not deduplicated (Ruby's
 *  flatten.compact only). */
export async function historyAncestorIds(
  driver: SQLDatabaseDriver,
  cardId: number,
  recursionLevel = 0,
): Promise<number[]> {
  if (recursionLevel > 5) return [];
  const parentIds = await historyParentIds(driver, cardId);
  const out: number[] = [...parentIds];
  for (const parentId of parentIds) {
    const row = await driver.query<{ trash: number | null }>(
      "SELECT trash FROM cards WHERE id = ?",
      [parentId],
    );
    const card = row.rows[0];
    if (card === undefined || card.trash === 1) continue; // Card.fetch misses
    out.push(...(await historyAncestorIds(driver, parentId, recursionLevel + 1)));
  }
  return out;
}

/** action_count (history.rb:42-44): `Card::Action.where(card_id: ...).count`
 *  - INCLUDING drafts (no draft filter). */
export async function actionCount(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number> {
  const result = await driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?",
    [cardId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** has_edits? (history.rb:47-49): the card has an account responsible for
 *  prior acts - `Card::Act.where(actor_id: id).where("card_id IS NOT
 *  NULL").present?`. */
export async function hasEdits(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<boolean> {
  const result = await driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_acts WHERE actor_id = ? AND card_id IS NOT NULL",
    [cardId],
  );
  return Number(result.rows[0]?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Card#actions - the association all the readers below walk
// (card-1.110.0/lib/card.rb:172: `has_many :actions, -> { where(draft:
// [nil, false]).order :id }` - non-draft, id order; :all_action_ids and
// history_actions use the unfiltered Card::Action.where instead)
// ---------------------------------------------------------------------------

/** The WHERE clause Ruby's `draft: [nil, false]` scope and the
 *  `draft is not true` string conditions both compile to on the SQLite
 *  storage (draft 0/1/NULL; NULL passes IS NOT TRUE, matching the MySQL
 *  tinyint semantics the Ruby SQL was written against). */
const NOT_DRAFT = "(draft IS NOT TRUE)";

/** action_ids (actions.rb:4-6): the card's non-draft action ids in id
 *  order (Card#actions). */
export async function actionIds(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number[]> {
  const result = await driver.query<{ id: number }>(
    `SELECT id FROM card_actions WHERE card_id = ? AND ${NOT_DRAFT} ORDER BY id`,
    [cardId],
  );
  return result.rows.map((r) => Number(r.id));
}

/** all_action_ids (actions.rb:8-10): `Card::Action.where(card_id: id)` -
 *  drafts INCLUDED. */
export async function allActionIds(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number[]> {
  const result = await driver.query<{ id: number }>(
    "SELECT id FROM card_actions WHERE card_id = ? ORDER BY id",
    [cardId],
  );
  return result.rows.map((r) => Number(r.id));
}

/** history_actions (actions.rb:13-15): `Action.where card_id:
 *  history_card_ids` - drafts INCLUDED (no draft filter), id order. */
export async function historyActions(
  driver: SQLDatabaseDriver,
  cardIds: number[],
): Promise<HistoryActionRow[]> {
  if (cardIds.length === 0) return [];
  const placeholders = cardIds.map(() => "?").join(", ");
  const result = await driver.query<CardActionsRow>(
    `SELECT * FROM card_actions WHERE card_id IN (${placeholders}) ORDER BY id`,
    cardIds,
  );
  return result.rows;
}

/** One card_actions row by id (Card::Action.fetch, action.rb:50-55, minus
 *  the cache layer - the port re-queries). */
export async function fetchAction(
  driver: SQLDatabaseDriver,
  actionId: number,
): Promise<HistoryActionRow | undefined> {
  const result = await driver.query<CardActionsRow>(
    "SELECT * FROM card_actions WHERE id = ?",
    [actionId],
  );
  return result.rows[0];
}

/** create_action (actions.rb:21-23): `actions.first` - the first non-draft
 *  action. */
export async function createAction(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<HistoryActionRow | undefined> {
  const result = await driver.query<CardActionsRow>(
    `SELECT * FROM card_actions WHERE card_id = ? AND ${NOT_DRAFT} ORDER BY id LIMIT 1`,
    [cardId],
  );
  return result.rows[0];
}

/** nth_action (actions.rb:25-31): the index-th (1-based) non-draft action;
 *  `return unless id && index.positive?`. */
export async function nthAction(
  driver: SQLDatabaseDriver,
  cardId: number,
  index: number,
): Promise<HistoryActionRow | undefined> {
  const i = Math.trunc(index);
  if (!Number.isFinite(i) || i <= 0) return undefined;
  const result = await driver.query<CardActionsRow>(
    `SELECT * FROM card_actions WHERE ${NOT_DRAFT} AND card_id = ?
     ORDER BY id LIMIT 1 OFFSET ?`,
    [cardId, i - 1],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// set/all/history/last.rb - the last-action / last-change readers
// ---------------------------------------------------------------------------

/** last_action (last.rb:53-55): `actions.where("id IS NOT NULL").last` - the
 *  newest non-draft action. */
export async function lastAction(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<HistoryActionRow | undefined> {
  const result = await driver.query<CardActionsRow>(
    `SELECT * FROM card_actions WHERE card_id = ? AND ${NOT_DRAFT}
     ORDER BY id DESC LIMIT 1`,
    [cardId],
  );
  return result.rows[0];
}

/** last_action_id (last.rb:49-51): `last_action&.id`. */
export async function lastActionId(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number | undefined> {
  const action = await lastAction(driver, cardId);
  return action?.id;
}

/** previous_action (last.rb:87-95): the action preceding action_id - the
 *  index comes from the NON-draft list while the predecessor is read from
 *  ALL actions (drafts included; Ruby's `all_actions[action_index - 1]`).
 *  Not found or first position -> undefined (`action_index.to_i.nonzero?`). */
export async function previousAction(
  driver: SQLDatabaseDriver,
  cardId: number,
  actionId: number,
): Promise<HistoryActionRow | undefined> {
  const result = await driver.query<CardActionsRow>(
    `SELECT * FROM card_actions WHERE card_id = ? AND ${NOT_DRAFT} ORDER BY id`,
    [cardId],
  );
  const actionIndex = result.rows.findIndex((a) => Number(a.id) === actionId);
  if (actionIndex <= 0) return undefined; // includes findIndex miss (-1 -> to_i 0)
  const all = await driver.query<CardActionsRow>(
    "SELECT * FROM card_actions WHERE card_id = ? ORDER BY id",
    [cardId],
  );
  return all.rows[actionIndex - 1];
}

/** extract_action_id (last.rb:96-98): an action ARGUMENT that is a record
 *  contributes its id. */
function extractActionId(actionArg: number | HistoryActionRow): number {
  return typeof actionArg === "number" ? actionArg : actionArg.id;
}

/** last_change_on options (last.rb:9): before / not_after take an action id
 *  or action record; including_drafts relaxes the draft filter. */
export interface LastChangeOptions {
  before?: number | HistoryActionRow;
  notAfter?: number | HistoryActionRow;
  includingDrafts?: boolean;
}

/** all_changes (changes.rb:46-53) as named rows: the action's change rows
 *  with the field decoded to its name (change.rb:67-69). */
export async function allActionChanges(
  driver: SQLDatabaseDriver,
  actionId: number,
): Promise<HistoryChangeRow[]> {
  const result = await driver.query<CardChangesRow>(
    "SELECT * FROM card_changes WHERE card_action_id = ? ORDER BY id",
    [actionId],
  );
  const mapped: (HistoryChangeRow | undefined)[] = result.rows.map((row) => {
    const field = trackedFieldByIndex(Number(row.field));
    if (field === undefined) return undefined;
    const change: HistoryChangeRow = {
      cardActionId: Number(row.card_action_id),
      field,
      value: row.value,
    };
    return change;
  });
  return mapped.filter((r): r is HistoryChangeRow => r !== undefined);
}

/** sole? (action.rb:106-108): `all_changes.empty? && (action_type == :create
 *  || Card::Action.where(card_id: card_id).count == 1)` - the count includes
 *  drafts (plain where). */
export async function actionIsSole(
  driver: SQLDatabaseDriver,
  action: HistoryActionRow,
): Promise<boolean> {
  const changes = await allActionChanges(driver, action.id);
  if (changes.length > 0) return false;
  if (action.action_type === ACTION_TYPE_CODES.create) return true;
  return action.card_id === null
    ? false
    : (await actionCount(driver, action.card_id)) === 1;
}

/** change (changes.rb:27-29): the action's Change for the field. With no
 *  stored rows the sole-action case synthesizes the CURRENT card attribute
 *  as the value (changes.rb:55-64 current_changes: `Change.new field: field,
 *  value: card.send(field)`; the synthesized trash value is the ActiveRecord
 *  boolean cast of the tinyint, mirroring change.ts:98-105 on the write
 *  side); a non-sole action without rows has no change. */
export async function actionChange(
  driver: SQLDatabaseDriver,
  action: HistoryActionRow,
  field: TrackedField,
): Promise<HistoryChangeRow | undefined> {
  const all = await allActionChanges(driver, action.id);
  if (all.length > 0) return all.find((c) => c.field === field);
  if (!(await actionIsSole(driver, action))) return undefined;
  if (action.card_id === null) return undefined; // current_changes "return {} unless card"
  const card = await fetchCardsRow(driver, action.card_id);
  if (card === undefined) return undefined;
  return {
    cardActionId: action.id,
    field,
    value: field === "trash" ? card.trash !== 0 : card[field],
  };
}

/** value (changes.rb:8-12): the change's value run through interpret_value
 *  (changes.rb:103-110): type_id -> integer; everything else raw. The
 *  :cardtype branch (to_i.cardname) is NOT ported - it needs the codename
 *  resolution and serves only ActionRenderer#type_diff (not ported). */
export async function actionValue(
  driver: SQLDatabaseDriver,
  action: HistoryActionRow,
  field: "name" | "type_id" | "db_content" | "content" | "trash",
): Promise<string | number | boolean | null | undefined> {
  // interpret_field (changes.rb:90-96): :content reads :db_content.
  const interpreted: TrackedField = field === "content" ? "db_content" : field;
  const change = await actionChange(driver, action, interpreted);
  if (change === undefined) return undefined;
  if (interpreted === "type_id") {
    return change.value === null ? null : Number(change.value);
  }
  return change.value;
}

/** previous_change (changes.rb:34-44): the most recent change to the field
 *  BEFORE this action - `card.last_change_on field, before: self`. */
export async function actionPreviousChange(
  driver: SQLDatabaseDriver,
  action: HistoryActionRow,
  field: TrackedField,
): Promise<HistoryChangeRow | undefined> {
  if (action.action_type === ACTION_TYPE_CODES.create) return undefined;
  return lastChangeOn(driver, Number(action.card_id), field, { before: action.id });
}

/** previous_value (changes.rb:17-22): nil for a create; otherwise the
 *  previous change's interpreted value. */
export async function actionPreviousValue(
  driver: SQLDatabaseDriver,
  action: HistoryActionRow,
  field: "name" | "type_id" | "db_content" | "content" | "trash",
): Promise<string | number | boolean | null | undefined> {
  if (action.action_type === ACTION_TYPE_CODES.create) return undefined;
  const interpreted: TrackedField = field === "content" ? "db_content" : field;
  const previous = await actionPreviousChange(driver, action, interpreted);
  if (previous === undefined) return undefined;
  if (interpreted === "type_id") {
    return previous.value === null ? null : Number(previous.value);
  }
  return previous.value;
}

/** last_change_on (last.rb:9-21). Branch order (last.rb:23-29):
 *  - no_last_change? (before given AND it names the create action) -> nil
 *    (last.rb:23-25); Ruby would raise on create_action.id for a card with
 *    no actions at that point - the port throws the equivalent
 *  - create_action_last_change? (last.rb:27-29) -> create_action&.change
 *    (the synthesized-current-value path for a sole create)
 *  - else the SQL walk (last.rb:31-47): card_changes JOIN card_actions,
 *    card_id + field-index conditions, `(draft is not true)` unless
 *    including_drafts, `card_action_id < id` for before / `<= id` for
 *    not_after, ORDER BY id, LAST row. */
export async function lastChangeOn(
  driver: SQLDatabaseDriver,
  cardId: number,
  field: TrackedField,
  opts: LastChangeOptions = {},
): Promise<HistoryChangeRow | undefined> {
  const actionId =
    opts.before !== undefined
      ? extractActionId(opts.before)
      : opts.notAfter !== undefined
        ? extractActionId(opts.notAfter)
        : undefined;

  const create = await createAction(driver, cardId);
  if (opts.before !== undefined) {
    if (create === undefined) {
      // Ruby: nil.id -> NoMethodError inside no_last_change?
      throw new Error(`last_change_on: card ${cardId} has no create action`);
    }
    if (actionId === create.id) return undefined; // no_last_change?
  }

  const viaCreateAction =
    (create !== undefined && actionId === create.id) ||
    (actionId === undefined && create !== undefined && (await actionIsSole(driver, create)));
  if (viaCreateAction) {
    return create === undefined ? undefined : actionChange(driver, create, field);
  }

  const conditions: string[] = ["card_actions.card_id = ?", "card_changes.field = ?"];
  const params: unknown[] = [cardId, trackedFieldIndex(field)];
  if (opts.includingDrafts !== true) {
    conditions.push("(draft IS NOT TRUE)");
  }
  const operator = opts.before !== undefined ? "<" : opts.notAfter !== undefined ? "<=" : undefined;
  if (operator !== undefined && actionId !== undefined) {
    conditions.push(`card_changes.card_action_id ${operator} ?`);
    params.push(actionId);
  }
  const result = await driver.query<CardChangesRow>(
    `SELECT card_changes.* FROM card_changes
     JOIN card_actions ON card_actions.id = card_changes.card_action_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY card_changes.id DESC LIMIT 1`,
    params,
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const fieldName = trackedFieldByIndex(Number(row.field));
  return fieldName === undefined
    ? undefined
    : { cardActionId: Number(row.card_action_id), field: fieldName, value: row.value };
}

/** One cards row (the reader-side fetch ladder is the engine's; the history
 *  readers need only the tracked attributes). */
async function fetchCardsRow(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<CardsRow | undefined> {
  const result = await driver.query<CardsRow>("SELECT * FROM cards WHERE id = ?", [
    cardId,
  ]);
  return result.rows[0];
}

/** last_act (last.rb:69-91): between the last act whose PRIMARY card is this
 *  card (Card#acts, card-1.110.0/lib/card.rb:171, `has_many :acts, -> {
 *  order :id }`) and the act of the card's last action, the LATER acted_at
 *  wins; missing sides fall to the other; identical acts collapse to the
 *  act-on-self. Ruby's `>` on two TimeWithZones compiles to the stored
 *  timestamp order - lexicographic == chronological on the canonical
 *  TEXT form (act.ts:47-52); a NULL acted_at would raise in Ruby and throws
 *  here. */
export async function lastAct(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<HistoryActRow | undefined> {
  const action = await lastAction(driver, cardId);
  if (action === undefined) return undefined; // Ruby: the if returns nil
  const lastActOnSelf = (
    await driver.query<CardActsRow>(
      "SELECT * FROM card_acts WHERE card_id = ? ORDER BY id DESC LIMIT 1",
      [cardId],
    )
  ).rows[0];
  const actOfLastAction = action.card_act_id
    ? (
        await driver.query<CardActsRow>("SELECT * FROM card_acts WHERE id = ?", [
          action.card_act_id,
        ])
      ).rows[0]
    : undefined;
  if (lastActOnSelf === undefined) return actOfLastAction;
  if (actOfLastAction === undefined) return lastActOnSelf;
  if (lastActOnSelf.id === actOfLastAction.id) return lastActOnSelf;
  if (lastActOnSelf.acted_at === null || actOfLastAction.acted_at === null) {
    throw new Error("last_act: NULL acted_at (Ruby would raise comparing nil)");
  }
  return lastActOnSelf.acted_at > actOfLastAction.acted_at
    ? lastActOnSelf
    : actOfLastAction;
}

/** acted_at (last.rb:1-3): `last_act.acted_at`. */
export async function actedAt(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<string | null | undefined> {
  const act = await lastAct(driver, cardId);
  return act?.acted_at;
}

/** revised_at (last.rb:5-7): the last action's act timestamp, or NOW when
 *  there is no last action / its act row is gone (`|| Time.zone.now`). */
export async function revisedAt(
  driver: SQLDatabaseDriver,
  cardId: number,
  now: () => Date = () => new Date(),
): Promise<string> {
  const action = await lastAction(driver, cardId);
  const actedAtTs =
    action?.card_act_id !== undefined && action.card_act_id !== null
      ? (
          await driver.query<CardActsRow>("SELECT * FROM card_acts WHERE id = ?", [
            action.card_act_id,
          ])
        ).rows[0]?.acted_at
      : undefined;
  return actedAtTs ?? sqlDateTime(now());
}

// ---------------------------------------------------------------------------
// set/all/history/acts.rb + lib/card/act.rb:46-52 - the act listings
// ---------------------------------------------------------------------------

/** Options for historyActs. Ruby binds Card::Auth.current_id and the
 *  viewable SQL (Query::CardQuery.viewable_sql) at SQL level; the port's
 *  permission verdicts are precomputed engine state, not SQL, so the
 *  viewable check is an in-memory callback over each action's card id
 *  (documented simplification - see the header note). */
export interface HistoryActsOptions {
  currentUserId: number;
  /** with_drafts (act.rb:46): true adds the actor's own drafts back in. */
  withDrafts: boolean;
  /** viewable_sql stand-in: keep the act when at least one of its actions
   *  passes. Absent = every action viewable (an open deck). */
  isActionViewable?: (actionCardId: number) => boolean;
}

/** history_acts (acts.rb:2-4): `Act.all_with_actions_on(history_card_ids,
 *  true).order id: :desc`. all_with_actions_on (act.rb:46-52):
 *  `card_actions.card_id IN (:card_ids) AND (draft is not true[ OR actor_id
 *  = :user_id])`, then all_viewable (act.rb:54-59): JOIN the actions' card,
 *  the viewable WHERE, `card_id IS NOT NULL` on the ACT's own primary card,
 *  DISTINCT. The port keeps the row shape and order (acts id DESC, first
 *  occurrence wins the DISTINCT). */
export async function historyActs(
  driver: SQLDatabaseDriver,
  cardIds: number[],
  opts: HistoryActsOptions,
): Promise<HistoryActRow[]> {
  if (cardIds.length === 0) return [];
  const placeholders = cardIds.map(() => "?").join(", ");
  const draftClause = opts.withDrafts
    ? "(draft IS NOT TRUE OR card_acts.actor_id = ?)"
    : "(draft IS NOT TRUE)";
  const params: unknown[] = [...cardIds];
  if (opts.withDrafts) params.push(opts.currentUserId);
  const result = await driver.query<CardActsRow & { action_card_id: number }>(
    `SELECT card_acts.*, card_actions.card_id AS action_card_id
     FROM card_acts
     JOIN card_actions ON card_actions.card_act_id = card_acts.id
     JOIN cards ON cards.id = card_actions.card_id
     WHERE card_actions.card_id IN (${placeholders}) AND ${draftClause}
       AND card_acts.card_id IS NOT NULL
     ORDER BY card_acts.id DESC`,
    params,
  );
  const seen = new Set<number>();
  const out: HistoryActRow[] = [];
  for (const row of result.rows) {
    if (seen.has(row.id)) continue;
    if (opts.isActionViewable !== undefined && !opts.isActionViewable(Number(row.action_card_id))) {
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/** draft_acts (acts.rb:6-8): the current user's draft actions on the card,
 *  mapped to their acts (drafts.created_by joins card_acts on actor_id,
 *  action.rb:44-46; Card#drafts is draft-true actions in id order,
 *  card-1.110.0/lib/card.rb:173). Ruby's map keeps duplicate acts and action
 *  order - so does the port. */
export async function draftActs(
  driver: SQLDatabaseDriver,
  cardId: number,
  currentUserId: number,
): Promise<HistoryActRow[]> {
  const result = await driver.query<CardActsRow>(
    `SELECT card_acts.* FROM card_acts
     JOIN card_actions ON card_actions.card_act_id = card_acts.id
     WHERE card_actions.card_id = ? AND card_actions.draft = 1
       AND card_acts.actor_id = ?
     ORDER BY card_actions.id`,
    [cardId, currentUserId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// set/all/history/revision.rb - revision reconstruction
// ---------------------------------------------------------------------------

/** revision (revision.rb:1-12): a "revision" is the state of all tracked
 *  fields at the time of the given action; before_action=true walks to the
 *  PREVIOUS action instead (revision_before_action: `{ trash: true }` when
 *  there is none). Accepts an id or an action record (revision.rb:4). */
export async function revision(
  driver: SQLDatabaseDriver,
  cardId: number,
  action: number | HistoryActionRow,
  beforeAction = false,
): Promise<RevisionState | undefined> {
  const row = typeof action === "number" ? await fetchAction(driver, action) : action;
  if (row === undefined) return undefined;
  return beforeAction
    ? revisionBeforeAction(driver, cardId, row)
    : revisionAttributes(driver, cardId, row);
}

/** revision_attributes (revision.rb:14-19): for each TRACKED_FIELD, the
 *  action's own change, else the last change NOT AFTER the action, else the
 *  card's CURRENT attribute (`self[field]`). */
export async function revisionAttributes(
  driver: SQLDatabaseDriver,
  cardId: number,
  action: HistoryActionRow,
): Promise<RevisionState> {
  const card = await fetchCardsRow(driver, cardId);
  const out: RevisionState = {};
  for (const field of TRACKED_FIELDS) {
    const lastChange =
      (await actionChange(driver, action, field)) ??
      (await lastChangeOn(driver, cardId, field, { notAfter: action.id }));
    out[field] =
      lastChange !== undefined
        ? lastChange.value
        : card === undefined
          ? null
          : field === "trash"
            ? card.trash !== 0
            : card[field];
  }
  return out;
}

/** revision_before_action (revision.rb:21-26): the previous action's
 *  revision, or the trash marker when the action is the first. The
 *  previous-action lookup follows Action#previous_action
 *  (action.rb:102-104 - the ACTION's card_id); the attribute read-back runs
 *  on the card itself (Ruby's `revision prev_action` is a self call). */
export async function revisionBeforeAction(
  driver: SQLDatabaseDriver,
  cardId: number,
  action: HistoryActionRow,
): Promise<RevisionState> {
  const previous =
    action.card_id === null
      ? undefined
      : await previousAction(driver, action.card_id, action.id);
  if (previous === undefined) return { trash: true };
  return revisionAttributes(driver, cardId, previous);
}

// ---------------------------------------------------------------------------
// set/all/history/selected.rb - the selected-action content readers
// ---------------------------------------------------------------------------

/** content_at_time_of_selected_action (selected.rb:41-43): the last db_content
 *  change not after the selected action, drafts INCLUDED. */
export async function contentAtTimeOfSelectedAction(
  driver: SQLDatabaseDriver,
  cardId: number,
  selectedActionId: number,
): Promise<string | number | boolean | null | undefined> {
  const change = await lastChangeOn(driver, cardId, "db_content", {
    notAfter: selectedActionId,
    includingDrafts: true,
  });
  return change?.value;
}

/** selected_content (selected.rb:37-39): the content at the selected
 *  action's time, falling back to the current db_content
 *  (`@selected_content ||= content_at_time... || db_content`). */
export async function selectedContent(
  driver: SQLDatabaseDriver,
  cardId: number,
  selectedActionId: number,
  dbContent: string | null,
): Promise<string | number | boolean | null> {
  const atTime = await contentAtTimeOfSelectedAction(driver, cardId, selectedActionId);
  return atTime ?? dbContent;
}

/** action_from_id (selected.rb:76-84): integer-ish ids only ("if not an
 *  integer, action_id is probably a mod"), then the action must be ON this
 *  card (action_if_on_self, selected.rb:85-89). */
export async function actionFromId(
  driver: SQLDatabaseDriver,
  cardId: number,
  actionId: number | string,
): Promise<HistoryActionRow | undefined> {
  if (typeof actionId !== "number" && !/^\d+$/.test(actionId)) return undefined;
  const action = await fetchAction(driver, Number(actionId));
  return action !== undefined && action.card_id === cardId ? action : undefined;
}

// ---------------------------------------------------------------------------
// set/all/history/events.rb - the edit_conflict? guard
// ---------------------------------------------------------------------------

/** edit_conflict? (events.rb:65-72): the edit began from an older revision
 *  AND someone else made the last action - `last_action_id_before_edit &&
 *  last_action_id_before_edit.to_i != last_action_id && (la = last_action)
 *  && la.act.actor_id != Auth.current_id`. The :detect_conflict event body
 *  (events.rb:19-22, errors.add :conflict with locale key
 *  history_error_not_latest_revision) is not ported - the error pipeline is
 *  a later wave. */
export async function isEditConflict(
  driver: SQLDatabaseDriver,
  cardId: number,
  lastActionIdBeforeEdit: number | string | null | undefined,
  currentUserId: number,
): Promise<boolean> {
  if (lastActionIdBeforeEdit === null || lastActionIdBeforeEdit === undefined) {
    return false;
  }
  const currentId = await lastActionId(driver, cardId);
  if (Number(lastActionIdBeforeEdit) === currentId) return false;
  const la = await lastAction(driver, cardId);
  if (la === undefined || la.card_act_id === null) return false;
  const act = (
    await driver.query<CardActsRow>("SELECT * FROM card_acts WHERE id = ?", [
      la.card_act_id,
    ])
  ).rows[0];
  return act !== undefined && act.actor_id !== currentUserId;
}

// ---------------------------------------------------------------------------
// set/all/history/act_listing.rb - ACTION_ICONS + the legend bytes
// ---------------------------------------------------------------------------

/** ACTION_ICONS (act_listing.rb:1-6): the icon-basket KEY each action type
 *  renders ("draft" for drafts). */
export const HISTORY_ACTION_ICONS: Record<ActionType | "draft", string> = {
  create: "create_action",
  update: "update_action",
  delete: "delete_action",
  draft: "draft",
};

/** action_icon (act_listing.rb:81-85) -> icon_tag: the material-library
 *  icon tag bytes. Resolution chain: icon_lookup finds the key in
 *  basket[:icons][:material] (card-mod-bootstrap-0.20.0
 *  set/all/bootstrap/icon.rb:5, 20-24 - create_action: add_circle,
 *  update_action: edit, delete_action: remove_circle, draft: build;
 *  icon_libraries defaults to [:material],
 *  lib/card/mod/bootstrap.rb:2); universal_icon_tag adds "notranslate"
 *  (icon.rb:126-129) and material_icon_tag adds "material-icons" around the
 *  mapped name (icon.rb:120-123): `wrap_with :i, icon, opts`. */
export function actionIconHtml(actionType: ActionType | "draft"): string {
  const key = HISTORY_ACTION_ICONS[actionType];
  const material: Record<string, string> = {
    create_action: "add_circle",
    update_action: "edit",
    delete_action: "remove_circle",
    draft: "build",
  };
  return `<i class="notranslate material-icons">${material[key]}</i>`;
}

/** action_legend (actions.rb:91-98): "created"/"updated"/"deleted" per type
 *  plus the draft legend when the voo shows it
 *  (`legend << _render_draft_legend if voo.show?(:draft_legend)`). */
export function actionLegendHtml(showDraftLegend: boolean): string {
  const types: (ActionType | "draft")[] = ["create", "update", "delete"];
  const legend = types.map((t) => `${actionIconHtml(t)} ${t}d`);
  if (showDraftLegend) {
    legend.push(draftLegendBytes());
  }
  return `<small>Actions: ${legend.join(" | ")}</small>`;
}

/** content_legend (actions.rb:100-103): the diff chunk markers -
 *  Card::Content::Diff.render_added_chunk("Additions") /
 *  render_deleted_chunk("Subtractions") (card-1.110.0
 *  lib/card/content/diff.rb:16-21). */
export function contentLegendHtml(): string {
  const legend = [
    "<ins class='diffins diff-added'>Additions</ins>",
    "<del class='diffdel diff-deleted'>Subtractions</del>",
  ];
  return `<small>Content changes: ${legend.join(" | ")}</small>`;
}

// ---------------------------------------------------------------------------
// set/all/history/views.rb:24-26 - view :draft_legend
// ---------------------------------------------------------------------------

/** `"#{action_icon(:draft)} unsaved draft"` - the view body's bytes via the
 *  action_icon chain documented at actionIconHtml. */
function draftLegendBytes(): string {
  return `${actionIconHtml("draft")} unsaved draft`;
}

/** view :draft_legend (views.rb:24-26) - no view settings (no unknown,
 *  no cache config in the Ruby declaration). */
const draftLegendView: ViewFn = () => draftLegendBytes();

// ---------------------------------------------------------------------------
// set/all/history/export.rb - the json payload hashes
// ---------------------------------------------------------------------------

/** The action_type reader (action.rb:96-100): :draft wins when the draft
 *  flag is set, else the TYPE_OPTIONS code decoded. */
export function actionTypeSymbol(action: HistoryActionRow): string {
  if (action.draft === 1) return "draft";
  return actionTypeFromCode(Number(action.action_type)) ?? "draft";
}

/** act_hash (export.rb:24-31). */
export function actHash(act: HistoryActRow): Record<string, unknown> {
  return {
    act_id: act.id,
    actor_id: act.actor_id,
    acted_at: act.acted_at,
    act_card_id: act.card_id,
  };
}

/** changes_hash (export.rb:43-47): `{ change.field => change.value }` -
 *  field NAMES (change.rb:67-69); a later change to the same field
 *  overwrites the earlier (hash assignment order). */
export function changesHash(changes: HistoryChangeRow[]): Record<string, string | number | boolean | null> {
  const hash: Record<string, string | number | boolean | null> = {};
  for (const change of changes) {
    hash[change.field] = change.value;
  }
  return hash;
}

/** action_hash (export.rb:33-41). */
export function actionHash(
  action: HistoryActionRow,
  changes: HistoryChangeRow[],
): Record<string, unknown> {
  return {
    action_id: action.id,
    card_id: action.card_id,
    action_type: actionTypeSymbol(action),
    comment: action.comment,
    changes: changesHash(changes),
  };
}

/** action_hash_list (export.rb:18-22): each action merges its act's hash
 *  under the action's own. */
export async function actionHashList(
  driver: SQLDatabaseDriver,
  actions: HistoryActionRow[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const action of actions) {
    const act =
      action.card_act_id === null
        ? undefined
        : (
            await driver.query<CardActsRow>("SELECT * FROM card_acts WHERE id = ?", [
              action.card_act_id,
            ])
          ).rows[0];
    const changes = await allActionChanges(driver, action.id);
    out.push({ ...(act !== undefined ? actHash(act) : {}), ...actionHash(action, changes) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// set/all/history/events.rb - the event declarations (pinned to the manifest
// events[] surface; bodies are stubs because the write path / DB seam
// stays out of scope for this lane, mirroring the list mod's pattern for
// its three event pins)
// ---------------------------------------------------------------------------
//
// Of the six events in events.rb (1-7, 15-17, 19-22, 25-38, 40-46, 48-50),
// ALL SIX now pin into the manifest events[] (the union at
// mod-manifest.ts:151-163 covers every Ruby stage the gem declares and the
// `after:` relative-ordering field - mod-manifest.ts:209-212 - carries the
// :finalize_act -> :finalize_action chain):
//   :update_ancestor_timestamps at :integrate
//   :assign_action             at :initialize,    when: :actionable?
//   :detect_conflict           at :validate,      on: [:update], when: :edit_conflict?
//   :finalize_action           at :finalize,      when: :finalize_action?
//   :rollback_actions          at :prepare_to_validate, on: [:update], when: :rollback_request?
//   :finalize_act              via `after: :finalize_action`, when: :act_card?
// All six pinned bodies need DB write access; the fns are no-op stubs that
// document the seam each body would call into (the host argument is reserved
// for a future write-path composition surface).

/** events.rb:1-7 update_ancestor_timestamps (integrate) - `ids =
 *  history_ancestor_ids; return unless ids.present?; Card.where(id: ids)
 *  .update_all(...); ids.map { |anc_id| Card.expire anc_id.cardname }`.
 *  The DB UPDATE + cache.expire are the write-path acts/CQL seam that
 *  stays out of scope here (see header). */
const updateAncestorTimestampsEvent: ModEventFn = (_card, _host) => {
  // see header: history_ancestor_ids (ported above) -> DB update_all ->
  // Card.expire (cache.invalidate + prepareEngine fetch surface).
};

/** events.rb:15-17 assign_action (initialize, when: :actionable?) -
 *  Ruby body: `@current_action = new_action` where `new_action`
 *  (events.rb:74-82) builds `Card::Action.new(act: director.need_act,
 *  action_type: action, draft: draft_action?, super_action: super_action)`.
 *  The :initialize stage runs BEFORE any other history event; the action
 *  row does not yet exist and the engine's ModEventCard surface
 *  (name/id/dbContent) cannot carry the act + super-action + draft flag.
 *  The write path lives in src/card/history/write-path.ts (ActWriter); the
 *  event fn records the declaration without reaching into write-path
 *  seams the surface cannot supply. */
const assignActionEvent: ModEventFn = (_card, _host) => {
  // see header: write-path (ActWriter.assignAction) is not exposed to the
  // event fn signature; @current_action requires the act row + action_type
  // + draft + super_action, none of which the (card, host) surface carries.
};

/** events.rb:19-22 detect_conflict (validate, on: :update, when:
 *  :edit_conflict?) - Ruby body: `errors.add :conflict, ::I18n.t
 *  (:history_error_not_latest_revision)`. The error pipeline
 *  (`Card::Error::Abort` + the `abort` callable) is a later-wave seam;
 *  the guard `edit_conflict?` IS ported above (events.rb:65-72, see
 *  isEditConflict at card-mod-history.ts:851-870). */
const detectConflictEvent: ModEventFn = (_card, _host) => {
  // see header: errors.add :conflict + I18n.t(:history_error_not_latest_revision)
  // need the errors-object + I18n-in-flight seams; the edit_conflict?
  // guard it depends on is ported (isEditConflict above).
};

/** events.rb:25-38 finalize_action (finalize, when: :finalize_action?) -
 *  Ruby body: `if changed_fields.present?` then `@current_action.update!
 *  card_id: id; store_card_changes_for_create_action if first_change?;
 *  store_card_changes unless first_create?`; else drop the empty action.
 *  The write path lives in src/card/history/write-path.ts (ActWriter);
 *  the fn records the body without attempting to call write-path seams
 *  the ModEventCard surface (name/id/dbContent, no action row) cannot
 *  supply. */
const finalizeActionEvent: ModEventFn = (_card, _host) => {
  // see header: write-path (ActWriter.finalizeAction) is not exposed to
  // the event fn signature; the seam belongs to a later wave.
};

/** events.rb:40-46 rollback_actions (prepare_to_validate, on: :update,
 *  when: :rollback_request?) - the body reads `revert_actions` from
 *  Env.params, calls `process_revert_actions`, runs `update!` on the
 *  result, clears drafts, then `abort :success`. Both Env.params + the
 *  abort pipeline + the revert write path are out of scope here. */
const rollbackActionsEvent: ModEventFn = (_card, _host) => {
  // see header: Env.params["revert_actions"] -> process_revert_actions
  // (set/all/history/actions.rb) -> update! -> abort :success; all three
  // are later-wave seams.
};

/** events.rb:48-50 finalize_act (after: :finalize_action, when:
 *  :act_card?) - Ruby body: `Card::Director.act.update! card_id: id`
 *  (the act's primary-card UPDATE - the row was inserted with card_id
 *  NULL). The ActWriter already owns this UPDATE
 *  (write-path.ts:605-621 finalizeActCard); the event fn records the
 *  declaration without reaching back into the writer's private seam. */
const finalizeActEvent: ModEventFn = (_card, _host) => {
  // see header: write-path (ActWriter.finalizeActCard) is not exposed to
  // the event fn signature; the seam belongs to a later wave.
};

// ---------------------------------------------------------------------------
// the manifest (one entry per gem set file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModHistory: DeckoModManifest = {
  name: "history",
  gemName: "card-mod-history",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-history-0.20.0/set/all/history.rb - card methods only
      // (the read-side port is this module's exported functions; the write
      // helpers live in src/card/history/write-path.ts)
      setPath: "all/history",
    },
    {
      // card-mod-history-0.20.0/set/all/history/actions.rb - card methods +
      // a format :html block of helper METHODS (action_from_context,
      // action_content, the legends, revert_actions_link) - no views; the
      // legend bytes are ported above
      setPath: "all/history/actions",
    },
    {
      // card-mod-history-0.20.0/set/all/history/acts.rb - card methods
      setPath: "all/history/acts",
    },
    {
      // card-mod-history-0.20.0/set/all/history/act_listing.rb - the
      // ACTION_ICONS constant + format :html listing helpers (bootstrap
      // accordion/paging) - no views
      setPath: "all/history/act_listing",
    },
    {
      // card-mod-history-0.20.0/set/all/history/events.rb - all SIX events
      // (events.rb:1-50) pin into the manifest events[]: the union at
      // mod-manifest.ts:151-163 now covers :initialize + :validate, and
      // the `after:` relative-ordering field (mod-manifest.ts:209-212)
      // carries the :finalize_act -> :finalize_action chain. Bodies are
      // stubs - the write path + DB seam are out of scope for this lane.
      setPath: "all/history/events",
      events: [
        {
          event: "update_ancestor_timestamps",
          at: "integrate",
          fn: updateAncestorTimestampsEvent,
        },
        {
          event: "assign_action",
          at: "initialize",
          when: "actionable?",
          fn: assignActionEvent,
        },
        {
          event: "detect_conflict",
          at: "validate",
          on: ["update"],
          when: "edit_conflict?",
          fn: detectConflictEvent,
        },
        {
          event: "finalize_action",
          at: "finalize",
          when: "finalize_action?",
          fn: finalizeActionEvent,
        },
        {
          event: "rollback_actions",
          at: "prepare_to_validate",
          on: ["update"],
          when: "rollback_request?",
          fn: rollbackActionsEvent,
        },
        {
          event: "finalize_act",
          after: "finalize_action",
          when: "act_card?",
          fn: finalizeActEvent,
        },
      ],
    },
    {
      // card-mod-history-0.20.0/set/all/history/export.rb - json
      // :history/:actions views (not ported; the hash shapes are above)
      setPath: "all/history/export",
    },
    {
      // card-mod-history-0.20.0/set/all/history/last.rb - card methods
      setPath: "all/history/last",
    },
    {
      // card-mod-history-0.20.0/set/all/history/revision.rb - card methods
      setPath: "all/history/revision",
    },
    {
      // card-mod-history-0.20.0/set/all/history/selected.rb - card methods
      setPath: "all/history/selected",
    },
    {
      // card-mod-history-0.20.0/set/all/history/views.rb - the history
      // views; :draft_legend is the one headlessly-portable view (the
      // other eight need render-time act/action/diff data the engine's
      // sync ViewFn surface does not expose - see the header note)
      setPath: "all/history/views",
      formats: {
        html: {
          views: [{ view: "draft_legend", viewFn: draftLegendView }],
        },
      },
    },
    {
      // card-mod-history-0.20.0/set/all/history_board.rb - the board
      // views (creator_credit / updated_by / board_act - not ported) +
      // the board listing helpers
      setPath: "all/history_board",
    },
  ],
};

export default cardModHistory;
