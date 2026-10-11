// The card-mod-history gem (card-mod-history-0.20.0), ported through the
// mod loader - the history-tracking mod (acts, actions, changes).
//
// The gem's tree (the installed
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
// The render-time blocker is GONE: the render-time query seam
// (src/card/history/render-seam.ts + RenderEngine#prepareHistoryRender)
// loads the act/action/changes rows a history-view render reads, and the
// sync ViewFns read the bundle. Ported byte-first against the live oracle
// fixtures/captured/history-views.json: :history, :act, :action_summary
// (see the views section below).
//
// NOT yet ported (honest remainder, updated surfaces-batch2 2026-09-30:
// :action_expanded, :last_action_verb and :board_act ARE ported now - see
// the views section; board_act landed with the mod-porting the first porting wave
// (2026-10-03):
// - three html views - act_legend (bs_layout), change, last_action - plus
//   the two json views (export.rb :history/:actions; the hash shapes are
//   ported). :last_action nests
//   card.last_actor by id (no id-nest surface) and reads the :acted_at view
//   (card-mod-format base.rb:63); :change composes _render_title +
//   _render_menu + _render_last_action - it unblocks when :last_action
//   lands. :board_act IS ported (the board act renderer + overlay chain,
//   all/history_board.rb:18-26; the renderer-string pieces are
//   harness-oracle-pinned, the overlay frame chrome is gem-source-derived
//   rendered-unpinned - the view comment carries the split).
//   Specific external deps per view: act_legend's bs_layout (defined in a
//   gem not installed here - grep for "def bs_layout" across the
//   installed gems matches only the history mod's
//   own four usages); content_legend's Card::Content::Diff chunk renderer
//   NAMED REMAINDERS (mod-porting the first porting wave, 2026-10-03, harness
//   scorecard rows):
//   - view :actions (export.rb:14-16, json format) - the HASH SHAPES are
//     ported + suite-pinned (actionHashList/actHash/actionHash/changesHash,
//     export.rb:18-47) but the engine has NO non-html render route for
//     manifest-registered json views (the same class card-mod-list's
//     csv/js/data/json surfaces are named remainders for); the view
//     registration unblocks with that route, never fake-registered.
//   - seed:First x3 (data/test.yml) - the gem's OWN test-suite fixture
//     cards (data/test.yml is `decko seed` TEST data consumed by the gem's
//     specs), not deck data; no TS seed consumer exists or is needed for
//     a running deck.
//   IS byte-pinned here (card-1.110.0 lib/card/content/diff.rb:16-21) but
//   the layout around it is not; last_action renders the :acted_at view
//   (card-mod-format-0.20.0 set/all/base.rb:63 - a different mod's view,
//   absent from the TS HTML_VIEWS registry) and nests card.last_actor by
//   id (no id-nest surface).
//   BOTH box_bottom credit halves are ported (flat registry,
//   src/card/render/views.ts): creator_credit (history_board.rb:2-8 -
//   record columns + the sync lexicon peek) and updated_by
//   (history_board.rb:10-16, :76-99 - the act search). The act search's
//   substrate is the render-time ACT-SEARCH seam
//   (src/card/history/updater-seam.ts + RenderEngine#prepareUpdaterRender
//   + updaterOf below), oracle-pinned on the box/box_bottom bytes
//   (fixtures/captured/bar-box-format-views.json, both targets, all three
//   actor arms). It is a SECOND, narrower seam, not a general CQL surface:
//   one named query, one card, no query string.
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
import { serializerFollowsLive } from "../../render/deployment-follow-live-config.js";
import { timeAgoInWords as sharedTimeAgoInWords } from "../../render/text-helpers.js";
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
// set/all/history_board.rb:10-16 - the updated_by ACT SEARCH
// (`Card.search(updater_of: { id: card.id })`)
// ---------------------------------------------------------------------------

/** updater_of (relational_attributes.rb:32-34) resolved all the way down,
 *  as the SQL the gem itself runs. Printed live from the capture deck
 *  (read-only decko runner probe, the sqlite rung, card_actions 4928 ->
 *  4928):
 *
 *    SELECT DISTINCT c0.* FROM cards c0
 *    JOIN card_acts cx1 ON c0.id = cx1.actor_id
 *    JOIN card_actions cn2 ON cx1.id = cn2.card_act_id
 *    JOIN cards c3 ON cn2.card_id = c3.id AND c3.trash is false
 *    WHERE (cn2.action_type = 1 AND c3.id = '605') AND c0.trash is false
 *
 *  The chain: CardQuery#updater_of -> tie_act :update_action_on
 *  (relational_attributes.rb:82-84, tying the ACT's actor_id to cards.id)
 *  -> ActQuery#update_action_on (act_query.rb:17-19) -> ActionQuery#
 *  update_action_on (action_query.rb:26-29) = `action_type = 1`
 *  (action_query.rb:31-33; TYPE_OPTIONS = %i[create update delete]
 *  (action.rb:42) and `action_type=` writes its index (action.rb:89-91), so
 *  update IS the stored 1) + `action_on card` = a tie to the acted-on card
 *  (action_query.rb:22-24).
 *
 *  Three facts the port has to keep:
 *  - DISTINCT: one row per ACTOR card, not per act. The capture deck's
 *    "Oracle Basics" carries TWO update actions by the same actor (actions
 *    4973 and 4974) and the live search returned exactly one updater.
 *  - trash on BOTH sides: c0 (the actor) and c3 (the acted-on card).
 *  - NO permission clause: the printed SQL carries no viewable_sql and no
 *    ok?(:read) - Card.search here is the gem's own call, unfiltered. The
 *    read gate for this data is the view gate in front of it.
 *
 *  ORDER: Ruby's SQL has no ORDER BY (CardQuery#sort returns nil for an
 *  unsorted statement), so the row order is the engine's join order -
 *  SQLite's DISTINCT-over-join emits first occurrence in the c0 scan, i.e.
 *  cards rowid order. The live probe confirms that reading: the deck's only
 *  multi-updater card (1222, "Sara Test Card", updated by Decko Bot id 1
 *  and John id 1231) returned [Decko Bot, John] - ascending id. The port
 *  pins that order explicitly so the result is deterministic rather than
 *  plan-dependent. */
export async function updaterOf(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<{ id: number }[]> {
  const result = await driver.query<{ id: number }>(
    `SELECT DISTINCT c0.id FROM cards c0
     JOIN card_acts cx1 ON c0.id = cx1.actor_id
     JOIN card_actions cn2 ON cx1.id = cn2.card_act_id
     JOIN cards c3 ON cn2.card_id = c3.id AND c3.trash IS FALSE
     WHERE cn2.action_type = 1 AND c3.id = ?
       AND c0.trash IS FALSE
     ORDER BY c0.id ASC`,
    [cardId],
  );
  return result.rows;
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
// set/all/history/views.rb + act_listing.rb + the lib/card/act/act_renderer
// tree - the render-time history views (the seam)
// ---------------------------------------------------------------------------
//
// Three of the eleven data-bound views port byte-first against the live
// oracle fixtures/captured/history-views.json (tools/oracle/history_capture.rb;
// rendered by the vendored 0.20.0 gems as Anonymous):
//   view :history        - the revisions list (acts_layout history_acts)
//   view :act            - the single-revision view (act_listing act_from_context)
//   view :action_summary - the diff view (action_content action, :summary)
// surfaces-batch2 (2026-09-30) adds:
//   view :action_expanded  - action_content action, :expanded (the SAME
//                            capture pins it: probe#action_expanded(update_action))
//   view :last_action_verb - the create/delete/edit verb over card.last_act
//                            (gem-source-derived bytes, rendered-unpinned)
// The remaining four (act_legend, change, last_action, board_act) stay the
// named remainder - see the header
// note. The rows these views read arrive through the render-time history
// seam (src/card/history/render-seam.ts): loaded by
// RenderEngine#prepareHistoryRender in the async prepare half of a render
// whose view is one of the seam views, read synchronously here. The two
// box_bottom credit halves (creator_credit, updated_by) are ported in the
// FLAT registry (src/card/render/views.ts) and their act rows come from the
// narrower act-search seam (src/card/history/updater-seam.ts).

import { DeckoName } from "../../name.js";
import { h, emitAttrs, newSlotId, slotOptionsJson } from "../../render/slot-html.js";
import { RenderFormat, type ViewContext, type ViewFn } from "../../render/format.js";
import { ContentDiff } from "../../history/content-diff.js";
import type { HistoryRenderParams, HistoryRenderReader } from "../../history/render-seam.js";

/** The seam bundle for this render; a history view without one is an
 *  engine-wiring bug (RenderEngine always provides it for the seam views). */
function historyReader(ctx: ViewContext): HistoryRenderReader {
  const reader = ctx.fmt.engine.historyRenderReader?.();
  if (reader === undefined) {
    throw new Error(
      "history view rendered without the render-time history seam (RenderEngine#prepareHistoryRender)",
    );
  }
  return reader;
}

/** wrap.rb #slot_wrap (the views.ts slotWrap shape): id/class/data attrs +
 *  slot options + the format's initial name context. extraAttrs are the
 *  top-level html attributes slot_attributes' deep_merge! folds in AFTER
 *  the id/class/data build (wrap.rb:31-35 hash.deep_merge! slot_attr -
 *  board_act's breadcrumb_data attrs ride this). */
function historySlotWrap(
  ctx: ViewContext,
  view: string,
  inner: string,
  extraAttrs: Record<string, string> = {},
): string {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = voo.classy(["card-slot", `${view}-view`, card.setKeys]);
  const slotOptions = voo.slotOptions();
  if (card.unknown !== true) {
    const initial = fmt.initialContextNames;
    if (initial.length > 0) slotOptions["name_context"] = initial.join(",");
  }
  const attrs = emitAttrs({
    id: `${card.name.safeKey}-${view}-view`,
    class: classes,
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name":
      card.record.isNew === true && card.name.isCompound ? card.name.urlKey : card.name.s,
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson(slotOptions),
    ...extraAttrs,
  });
  return `<div${attrs}>${inner}</div>`;
}

/** Builder-style div: non-empty content is preceded by a literal newline
 *  (the Card::Bootstrap Builder add_content shape the capture pins:
 *  `<div class="float-end">\n{diff}</div>`, `<div>\n{name}</div>`, and the
 *  empty `<div class="float-end"></div>`). */
function builderDiv(content: string, klass?: string): string {
  const attr = klass === undefined ? "" : ` class="${klass}"`;
  return `<div${attr}>${content === "" ? "" : `\n${content}`}</div>`;
}

/** The material icon tag (icon.rb:120-129, via actionIconHtml's chain). */
function historyIcon(name: string): string {
  return `<i class="notranslate material-icons">${name}</i>`;
}

/** Rails DateHelper#time_ago_in_words (distance_of_time_in_words from now,
 *  include_seconds: false): the buckets the history bytes carry. The
 *  capture NORMALIZES this phrase (wall-clock dependent -> TIME_AGO), so
 *  the bucket word list is shape-faithful, not byte-pinned. */
export function timeAgoInWords(from: Date, to: Date = new Date()): string {
  // DELEGATED to the byte-exact Rails port (render/text-helpers.ts - the
  // full date_helper.rb:95-165 bucket table, locale pluralization). This
  // helper was a shape-faithful copy whose capture normalized the phrase;
  // the creator_credit pins the REAL bytes ("about 1 year",
  // fixtures/captured/board-views.json), so the shared port wins.
  return sharedTimeAgoInWords(from, to);
}

/** acted_at TEXT ("YYYY-MM-DD HH:MM:SS") -> Date (UTC; the canonical form
 *  act.ts pins). */
function parseActedAt(text: string | null): Date | undefined {
  if (text === null || text === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (m === null) return undefined;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
}

/** act_renderer.rb:50-52 actor_and_ago. */
function actorAndAgo(ctx: ViewContext, reader: HistoryRenderReader, act: HistoryActRow): string {
  const actor = reader.cardInfo(Number(act.actor_id));
  const link =
    actor === undefined
      ? h(String(act.actor_id))
      : `<a class="known-card" href="/${h(DeckoName.parse(actor.name).urlKey)}">${h(actor.name)}</a>`;
  const ago = parseActedAt(act.acted_at);
  const editedAgo = ago === undefined ? "" : `${timeAgoInWords(ago)} ago`;
  return `<small>${link}\n${editedAgo}</small>`;
}

/** act_renderer.rb:60-64 summary - the per-type count badge. */
function actSummaryBadge(reader: HistoryRenderReader, actions: HistoryActionRow[]): string {
  const counts = new Map<string, number>();
  for (const action of reader.approvedActions(actions)) {
    const type = actionTypeSymbol(action);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const type of ["create", "update", "delete", "draft"] as const) {
    const count = counts.get(type) ?? 0;
    if (count <= 0) continue;
    const countHtml = count > 1 ? String(count) : "";
    parts.push(`${actionIconHtml(type)}<small> ${countHtml}</small>`);
  }
  return parts.join("<small class='text-muted'> | </small>");
}

/** actions.rb:81-89 revert_actions_link - the "revert to this" bytes. The
 *  query params render in the alphabetical order Rails url_for emits
 *  (the capture pins the exact order and %5B%5D encodings). */
function revertActionsLink(ctx: ViewContext, actionIds: number[]): string {
  const url = ctx.fmt.urlKey();
  const revertParams = actionIds.map((id) => `revert_actions%5B%5D=${id}`).join("&amp;");
  const href =
    `/update/${h(url)}?assign=true&amp;card%5Bskip%5D=validate_renaming&amp;look_in_trash=true` +
    (revertParams === "" ? "" : `&amp;${revertParams}`);
  return (
    `<a rel="nofollow" class="_close-modal slotter" data-slotter-mode="update-modal-origin"` +
    ` href="${href}" data-remote="true" data-method="post">revert to this</a>`
  );
}

/** act_renderer.rb:84-89 link_to_history + :80-83 link_to_act_card - the
 *  ABSOLUTE renderer's act_links (view :act's subheader), joined " ". */
function absoluteActLinks(actCardName: string): string {
  const url = DeckoName.parse(actCardName).urlKey;
  const linkToHistory =
    `<a class="_stop_propagation known-card" rel="nofollow" href="/${h(url)}/history?look_in_trash=true">` +
    `${historyIcon("history")}</a>`;
  const linkToActCard =
    `<a class="_stop_propagation known-card" href="/${h(url)}">${historyIcon("open_in_full")}</a>`;
  return `${linkToHistory} ${linkToActCard}`;
}

/** title_in_context (context_names.rb:49-55) for a raw NAME string:
 *  absolute against the format's card, then relativized through the
 *  working context names. */
function titleInContext(fmt: RenderFormat, name: string): string {
  const absolute = DeckoName.parse(name).absoluteName(fmt.card.name).s;
  const from = fmt.contextNames;
  return from.length > 0 ? DeckoName.parse(absolute).from(...from) : absolute;
}

/** relative_act_renderer.rb:12-14 relative_title - the act card's name
 *  relativized against the act_renderer's @card (the render root). */
function relativeTitle(ctx: ViewContext, actCardName: string): string {
  return DeckoName.parse(actCardName).from(ctx.fmt.card.name);
}

/** differ.rb:60-66 raw_view - the content rendered through the action
 *  card's raw view (dbContent passthrough; the structure-rule override
 *  surface rides RenderFormat.renderRaw on a shadow card). */
function rawViewBytes(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
  content: string,
): string {
  const info = reader.actionCard(action);
  if (info?.renderCard === undefined) return content;
  const shadow = { ...info.renderCard, dbContent: content };
  const sub = new RenderFormat(shadow, ctx.fmt.engine, { parent: ctx.fmt });
  return sub.renderRaw();
}

/** differ.rb:78-86 content_diff_object - previous + current raw-viewed,
 *  diffed with HISTORY_DIFF_ARGS (diff_format :text). */
function contentDiffObject(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
): ContentDiff {
  const previous = reader.previousValue(action, "content");
  const current = reader.value(action, "content");
  const previousRaw =
    previous === undefined || previous === null ? "" : rawViewBytes(ctx, reader, action, String(previous));
  const currentRaw = rawViewBytes(
    ctx,
    reader,
    action,
    current === undefined || current === null ? "" : String(current),
  );
  const dobj = new ContentDiff(previousRaw, currentRaw, HISTORY_DIFF_ARGS);
  // differ.rb:79 @content_diff_object ||= - the memo lives on the ACTION
  // (the Differ module is included in Card::Action), so it survives the
  // render; the engine's map is the Action-record stand-in.
  ctx.fmt.engine.historyDiffMemo?.set(action.id, dobj);
  return dobj;
}

/** The memoized diff object for one action (differ.rb:78-86) - a second
 *  view render of the same action returns the FIRST diff object, whose
 *  summary state (rendered or not) drives the toggle flag. */
function memoizedContentDiff(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
): ContentDiff {
  const hit = ctx.fmt.engine.historyDiffMemo?.get(action.id);
  if (hit !== undefined) return hit;
  return contentDiffObject(ctx, reader, action);
}

/** actions.rb:58-79 - the summary<->expanded toggle link bytes. Shown for
 *  :expanded always; for :summary when the diff summary omitted content
 *  (the caller resolves the flag on the SHARED ContentDiff instance). */
function actionContentToggleBytes(
  ctx: ViewContext,
  action: HistoryActionRow,
  viewKind: "summary" | "expanded",
): string {
  const other = viewKind === "expanded" ? "summary" : "expanded";
  const url = ctx.fmt.urlKey();
  const icon = viewKind === "expanded" ? "expand_less" : "expand_more";
  return (
    `<a rel="nofollow" class="revision-${action.card_act_id} float-end slotter"` +
    ` href="/${h(url)}/action_${other}?action_id=${action.id}&amp;look_in_trash=true"` +
    ` data-remote="true">${historyIcon(icon)}</a>`
  );
}

/** actions.rb:42-49 action_content - toggle + diff, newline-joined (the
 *  wrap body's two-element array). ONE ContentDiff instance serves the
 *  summary, the omits-content flag and the complete diff - Ruby's
 *  @content_diff_object memoization (differ.rb:79-86); the flag is only
 *  meaningful AFTER the summary rendered (summary.rb:31-33 reads the
 *  render-time @content_omitted). */
function actionContentBytes(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow | undefined,
  viewKind: "summary" | "expanded",
): string {
  if (action === undefined) return ""; // actions.rb:43 return "" unless action.present?
  const value = reader.value(action, "db_content");
  const hasContent = value !== undefined && value !== null; // differ.rb:44-46 new_content?
  const dobj = hasContent ? memoizedContentDiff(ctx, reader, action) : undefined;
  // actions.rb:46-48 wrap do [action_content_toggle(...), content_diff(...)]
  // - the ARRAY evaluates the toggle FIRST: on a cold memo the flag reads
  // the un-rendered state (Ruby nil -> no toggle); the summary below then
  // renders and memoizes it.
  const toggleShown = viewKind === "expanded" || (dobj !== undefined && dobj.summaryOmitsContent);
  const toggle = toggleShown ? actionContentToggleBytes(ctx, action, viewKind) : null;
  const summary = dobj === undefined ? null : dobj.summary;
  const diff =
    dobj === undefined
      ? "<i>empty</i>" // actions.rb:51-56: "<i>empty</i>" unless diff.present?
      : viewKind === "summary"
        ? summary
        : dobj.complete;
  return toggle === null ? diff! : `${toggle}\n${diff!}`;
}

/** differ.rb:74-76 diff_object(field) - the previous-vs-value Diff for the
 *  name/cardtype diffs (NO diff_format -> the :raw escape branch). The
 *  :cardtype values resolve through the type-name registry (the unported
 *  to_i.cardname branch of changes.rb interpret_field). */
function fieldNameDiffObject(
  reader: HistoryRenderReader,
  action: HistoryActionRow,
  field: "name" | "cardtype",
): ContentDiff {
  const toText = (raw: string | number | boolean | null | undefined): string | null => {
    if (raw === undefined || raw === null) return null;
    if (field === "cardtype") {
      return reader.typeNameForId(Number(raw)) ?? String(raw);
    }
    return String(raw);
  };
  const previous = toText(reader.previousValue(action, field === "name" ? "name" : "type_id"));
  const value = toText(reader.value(action, field === "name" ? "name" : "type_id"));
  return new ContentDiff(previous, value);
}

/** action_renderer.rb:96-108 name_changes: the action carries a name change
 *  -> Diff.complete(old_name, new_name); otherwise old_name - the last name
 *  value BEFORE this action, title-in-context - stands alone (the capture
 *  pins the content-update act showing the pre-action name verbatim). */
function nameChangesBytes(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
): string {
  const value = reader.value(action, "name");
  const previous = reader.previousValue(action, "name");
  const oldName = previous === undefined || previous === null ? null : titleInContext(ctx.fmt, String(previous));
  if (value === undefined || value === null) {
    return oldName === null ? "" : h(oldName);
  }
  const newName = titleInContext(ctx.fmt, String(value));
  // the Diff output is html-safe (the capture pins the raw <ins>/<del>
  // bytes); its :raw branch escapes the words themselves
  return ContentDiff.complete(oldName, newName);
}

/** action_renderer.rb:84-88 content_diff - the DELETE raw branch stays the
 *  named remainder; every other action renders the nested :action_summary
 *  slot on the action's card (a subformat render - no nest_name in the
 *  slot JSON, the capture pins). */
function nestedActionSummary(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
): string {
  const info = reader.actionCard(action);
  if (info?.renderCard === undefined) return "";
  const sub = new RenderFormat(info.renderCard, ctx.fmt.engine, { parent: ctx.fmt });
  return sub.renderView("action_summary", { action_id: action.id });
}

/** action_renderer.rb:29-56 ActionRenderer#render - the container/row/ul/li
 *  bytes with the bs_panel heading/body. The leading "\n" is the Builder
 *  add_content separator the capture pins. actionListClass is the
 *  classy("action-list") value - board_act's class_up "action-list",
 *  "my-3" (history_board.rb:22) makes it "action-list my-3"; the default
 *  is the plain class every other caller renders. */
function actionRendererBytes(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
  actionListClass = "action-list",
): string {
  const cardInfo = reader.actionCard(action);
  // name_diff (action_renderer.rb:62-82)
  let nameDiff: string;
  if (cardInfo !== undefined && DeckoName.parse(cardInfo.name).isCompound) {
    nameDiff = h(DeckoName.parse(cardInfo.name).from(ctx.fmt.card.name));
  } else {
    nameDiff = nameChangesBytes(ctx, reader, action);
  }
  // type_diff (action_renderer.rb:90-94) - "" unless new_type?
  let typeDiff = "";
  const typeValue = reader.value(action, "type_id");
  if (typeValue !== undefined && typeValue !== null) {
    typeDiff = fieldNameDiffObject(reader, action, "cardtype").complete;
  }
  const contentDiff = nestedActionSummary(ctx, reader, action);
  const panel =
    `\n<div class="card-header">\n${builderDiv(typeDiff, "float-end")}\n${builderDiv(nameDiff)}</div>` +
    `\n${builderDiv(contentDiff, "card-body")}`;
  return (
    `\n<div class="container-fluid">\n\n<div class="row">\n` +
    `              <ul class="${actionListClass} w-100">\n` +
    `                <li class="${actionTypeSymbol(action)}">\n` +
    `                  ${panel}\n` +
    `                </li>\n` +
    `              </ul>\n</div></div>`
  );
}

/** ActRenderer#details - approved_actions[0..20], each an ActionRenderer. */
function actDetailsBytes(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  actions: HistoryActionRow[],
  actionListClass = "action-list",
): string {
  const approved = reader.approvedActions(actions).slice(0, 21);
  return approved
    .map((action) => actionRendererBytes(ctx, reader, action, actionListClass))
    .join("");
}

/** actions.rb:34-40 action_from_context - voo action_id, then the render
 *  param, then the card's last action. A non-integer or off-card id
 *  resolves to no action (the loaded seam set covers the render root's
 *  history family; Ruby's Action.fetch would raise NotFound for an
 *  unknown id - the divergence is a documented remainder). */
function actionFromContext(
  ctx: ViewContext,
  reader: HistoryRenderReader,
): HistoryActionRow | undefined {
  const vooActionId = ctx.voo.opts["action_id"];
  const param =
    vooActionId !== undefined && vooActionId !== null ? String(vooActionId) : reader.params.actionId;
  if (param !== undefined && param !== "") {
    // Action.fetch (actions.rb:36): any loaded action resolves - the
    // nested action_summary renders ids on OTHER cards of the act (the
    // capture pins child/tag action ids under the probe's format). The
    // on-self restriction (selected.rb action_if_on_self) is a different
    // method this view does not call.
    return /^\d+$/.test(param) ? reader.actionById(Number(param)) : undefined;
  }
  return reader.cardLastAction;
}

/** act_listing.rb:9-13 act_from_context - params act_id, else the last
 *  action's act. A given act_id that resolves to nothing raises
 *  Card::NotFound ("act not found"). */
function actFromContext(ctx: ViewContext, reader: HistoryRenderReader): HistoryActRow {
  const actId = reader.params.actId;
  if (actId === undefined || actId === "") {
    const last = reader.cardLastAction;
    if (last === undefined || last.card_act_id === null) {
      throw new Error("act_from_context: card has no last action (Ruby nil.act NoMethodError)");
    }
    const act = reader.actById(Number(last.card_act_id));
    if (act === undefined) {
      throw new Error("act_from_context: last action's act not loaded");
    }
    return act;
  }
  const act = reader.actById(Number(actId));
  if (act === undefined) throw new Error("act not found"); // Card::NotFound
  return act;
}

/** accordion_item.haml (card-mod-bootstrap set/all/bootstrap) - the item
 *  bytes with the collapse id and the optional subheader. */
function accordionItemBytes(args: {
  headerInner: string;
  subheader: string | null;
  body: string;
  collapseId: string;
}): string {
  const { headerInner, subheader, body, collapseId } = args;
  let out = `<div class='accordion-item'>\n`;
  out += `<h2 class='accordion-header nodblclick w-100'>\n`;
  const accordionButtonClass = serializerFollowsLive()
    ? "accordion-button collapsed"
    : "collapsed accordion-button";
  out += `<button class='${accordionButtonClass}' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n`;
  out += `${headerInner}\n`;
  out += `</button>\n`;
  out += `</h2>\n`;
  out += `<div class='accordion-collapse collapse' id='${collapseId}'>\n`;
  if (subheader !== null) {
    out += `<div class='accordion-subheader bg-light p-2 text-end'>\n${subheader}\n</div>\n`;
  }
  out += `<div class='${serializerFollowsLive() ? "d0-card-body accordion-body" : "accordion-body d0-card-body"}'>\n${body}
</div>\n`;
  out += `</div>\n`;
  out += `</div>\n`;
  return out;
}

/** ActRenderer#header - the bs_layout row xs [8,4] (title+badge col, then
 *  the subtitle col). The leading "\n" is the Builder add_content
 *  separator the capture pins. */
function actHeaderInner(args: { title: string; badge: string; subtitle: string }): string {
  const col1 =
    `<div class="col-8">\n${args.title}` +
    (args.badge === "" ? "" : `\n<span class="text-muted ps-1 badge">\n${args.badge}</span>`) +
    `</div>`;
  const col2 = builderDiv(args.subtitle, "col-4 text-end");
  return `\n<div class="row w-100">\n${col1}\n${col2}</div>`;
}

/** relative_act_renderer.rb:22-34 act_links -> rollback_or_edit_link: the
 *  autosaved-draft edit link for draft acts (byte-shape per the gem, no
 *  capture pin), else the revert link when the act is NOT the card's
 *  current act and the update gate passes. */
function relativeActSubheader(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  act: HistoryActRow,
  actions: HistoryActionRow[],
): string | null {
  const isCurrentAct = reader.cardLastAct !== undefined && reader.cardLastAct.id === act.id;
  if (isCurrentAct) return null; // show_rollback_link? -> !current_act?
  if (reader.rootUpdateAllowed === false) return null; // rollback_link's ok?(:update)
  const revertIds = actions.filter((a) => a.draft !== 1).map((a) => a.id);
  return `<small><div class="act-link float-end"><small>${revertActionsLink(ctx, revertIds)}</small></div></small>`;
}

/** RelativeActRenderer - one accordion item in the :history list. */
function relativeActItemBytes(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  act: HistoryActRow,
  actCardName: string,
  seq: number,
): string {
  const actions = reader.actionsAffecting(act.id, reader.rootCardId!);
  const title = `<span class="nr">#${seq}</span> ${actorAndAgo(ctx, reader, act)}`;
  const subtitle =
    Number(act.card_id) === reader.rootCardId
      ? ""
      : `<small>act on ${h(relativeTitle(ctx, actCardName))}</small>`;
  const headerInner = actHeaderInner({
    title,
    badge: actSummaryBadge(reader, actions),
    subtitle,
  });
  return accordionItemBytes({
    headerInner,
    subheader: relativeActSubheader(ctx, reader, act, actions),
    body: actDetailsBytes(ctx, reader, actions),
    collapseId: `act-id-${act.id}`,
  });
}

/** view :history (views.rb:4-9) - the revisions list. */
const historyView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const reader = historyReader(ctx);
  voo.hide("help"); // frame.rb:18 with_frame
  fmt.addNameContext(); // frame.rb:19 with_frame
  if (reader.rootCardId === undefined) return "";
  // act_listing.rb:69-79 pagination + the relative act_seq countdown
  const page = Math.max(1, Number.parseInt(reader.params.page ?? "1", 10) || 1);
  const start = (page - 1) * HISTORY_ACTS_PER_PAGE;
  const pageActs = reader.acts.slice(start, start + HISTORY_ACTS_PER_PAGE);
  let seq = reader.actsTotal - start; // act_list_starting_seq
  const items: string[] = [];
  for (const act of pageActs) {
    const actCard = reader.cardInfo(Number(act.card_id));
    if (actCard === undefined) {
      seq -= 1; // clean_acts drops the act; the seq counter still steps
      continue;
    }
    items.push(relativeActItemBytes(ctx, reader, act, actCard.name, seq));
    seq -= 1;
  }
  // acts_layout (act_listing.rb:20-26): the legend row (draft_legend shown
  // - relative_history passes :show), then row(12) wrapping the act
  // accordion (a BLOCK row - no column wrap; the capture pins it).
  // surfaces-batch3: the row composition moved to actLegendRowBytes() —
  // the :act_legend view renders the SAME bytes (one composition, two
  // surfaces; byte-identical to this view's previous inline shape).
  const legendRow = actLegendRowBytes();
  const actRow = `<div class="row">\n<div class="accordion">${items.join("")}</div></div>`;
  const headerHtml = `<${fmt.isMain ? "h1" : "h2"} class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</${fmt.isMain ? "h1" : "h2"}>\n${fmt.renderView("menu")}`;
  const frame =
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">${headerHtml}</div>` +
    `\n\n` +
    `<div class="d0-card-body card-body card-text">\n\n${legendRow}\n${actRow}</div>` +
    `</div>`;
  return historySlotWrap(ctx, "history", frame);
};

/** view :act (views.rb:11-13) - the single-revision view; act_listing with
 *  the ABSOLUTE renderer (params[:act_context] || :absolute). NO slot wrap
 *  (the view body is the accordion item alone - the capture pins it). */
const actView: ViewFn = (ctx) => {
  const reader = historyReader(ctx);
  const act = actFromContext(ctx, reader);
  const actCard = reader.cardInfo(Number(act.card_id));
  if (actCard === undefined) return ""; // ActRenderer#render: @act_card or ""
  const actions = reader.actionsOfAct(act.id);
  const headerInner = actHeaderInner({
    title: h(actCard.name),
    badge: actSummaryBadge(reader, actions),
    subtitle: actorAndAgo(ctx, reader, act),
  });
  return accordionItemBytes({
    headerInner,
    subheader: absoluteActLinks(actCard.name),
    body: actDetailsBytes(ctx, reader, actions),
    collapseId: `act-id-${act.id}`,
  });
};

// --- view :board_act (all/history_board.rb:18-26) ---------------------------
// --- + the BoardActRenderer chain (lib/card/act/act_renderer/ ---------------
// --- board_act_renderer.rb over the relative/base renderers) ----------------
//
// Oracle: fixtures/oracle-surfaces/card-mod-history.harness.jsonl (the
// static-ruby capture tools/mod-porting-harness/ruby-oracles/
// card-mod-history/board-act-view.rb - 8 scenarios; the title bytes are
// CROSS-CHECKED in that script against the live capture
// fixtures/captured/board-views.json's history-tab pill anchor). The
// renderer-string bytes (title / overlay_title / details cap / opts /
// breadcrumb / action-list class up) are oracle-pinned; the overlay FRAME
// chrome (the d0-card-frame div + the overlay header/menu links) is
// gem-source-derived rendered-unpinned - the same disclosed basis as
// last_action_verb's allowed arm (no live capture renders ?view=board_act;
// the harness's named live-deck limit). The frame machinery follows
// card-mod-edit.ts's framedView composition minus the bootstrap
// standard_frame class_ups (the overlay path calls with_frame directly, so
// "card"/"card-header"/"card-body card-text" NEVER fire on it).

/** act_listing.rb:29-32 act_listing_opts_from_params - the render params
 *  (string values stay strings; action_view defaults to :summary;
 *  hide_diff is the strip=="true" boolean). */
function actListingOptsFromParams(
  params: HistoryRenderParams,
  seq: string | null | undefined,
): { actSeq: string | undefined; actionView: string; hideDiff: boolean } {
  return {
    actSeq: (seq ?? params.actSeq) || undefined,
    actionView: params.actionView || "summary",
    hideDiff: (params.hideDiff ?? "").trim() === "true",
  };
}

/** board_act_renderer.rb:11-13 left_title - the seq number, the actor NAME
 *  (plain, unlinked - unlike actor_and_ago's link), and the edited-ago
 *  phrase. Ruby's String#join does NOT escape; the oracle + the captured
 *  pill pin "Decko Bot" unescaped. */
function boardLeftTitle(
  reader: HistoryRenderReader,
  act: HistoryActRow,
  actSeq: string | undefined,
): string {
  const actor = reader.cardInfo(Number(act.actor_id));
  const actorName = actor === undefined ? String(act.actor_id) : actor.name;
  const ago = parseActedAt(act.acted_at);
  const editedAgo = ago === undefined ? "" : `${timeAgoInWords(ago)} ago`;
  return boardLeftTitleFrom(actorName, editedAgo, actSeq);
}

/** board_act_renderer.rb:11-13's composition core - the oracle's
 *  time_ago_in_words stub makes the phrase an INPUT (frozen delta ->
 *  "1 day"); the live view computes it through the shared
 *  timeAgoInWords table above this call. */
function boardLeftTitleFrom(actorName: string, editedAgo: string, actSeq: string | undefined): string {
  return `#${actSeq} ${actorName} <small>${editedAgo}</small>`;
}

/** act.rb:108-110 draft? - main_action&.draft (action_on(card_id) ||
 *  actions.first, act.rb:102-106). */
function actIsDraft(reader: HistoryRenderReader, act: HistoryActRow): boolean {
  const main =
    reader.actionOn(act.id, Number(act.card_id)) ?? reader.actionsOfAct(act.id)[0];
  return main?.draft === 1;
}

/** act_renderer.rb:134-139 autosaved_draft_link - the rollback_or_edit_link
 *  draft arm's "continue editing" anchor. GEM-SOURCE-DERIVED RENDERED-
 *  UNPINNED (the path is {edit_draft: true}, add_class "navbar-link", the
 *  link_to_view :edit slotterification lands only when a real edit link
  * renders - the oracle's double and this body carry the same disclosed
  * shape). */
function boardAutosavedDraftLink(ctx: ViewContext): string {
  return `<a class="navbar-link" href="/${h(ctx.fmt.urlKey())}?edit_draft=true">continue editing</a>`;
}

/** board_act_renderer.rb:43-49 rollback_or_edit_link (the BOARD override:
 *  revert_link, not the relative rollback_link) over the relative
 *  show_rollback_link?/current_act? chain (relative_act_renderer.rb:36-44)
 *  and revert_link (:50-55, actions.rb:81-90's ok?(:update) gate lives in
 *  revertActionsLink's callers' contract - the relativeActSubheader arm
 *  already established rootUpdateAllowed). */
function boardRollbackOrEditLink(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  act: HistoryActRow,
  actions: HistoryActionRow[],
): string | null {
  if (actIsDraft(reader, act)) return boardAutosavedDraftLink(ctx);
  const isCurrentAct = reader.cardLastAct !== undefined && reader.cardLastAct.id === act.id;
  if (!isCurrentAct && reader.rootUpdateAllowed !== false) {
    return revertActionsLink(ctx, actions.filter((a) => a.draft !== 1).map((a) => a.id));
  }
  return null;
}

/** board_act_renderer.rb:35-41 overlay_title - [left_title, summary,
 *  subtitle?, rollback_or_edit_link?].compact.join " | " in a plain div
 *  (wrap_with :div block form, no class). The subtitle is the relative
 *  renderer's (:16-20) - "" unless the act is on another card, then
 *  `<small>act on #{relative_title}</small>` (unescaped, as Ruby renders
 *  it; the oracle pins "act on child"). */
function boardOverlayTitle(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  act: HistoryActRow,
  actCardName: string,
  actSeq: string | undefined,
  actions: HistoryActionRow[],
): string {
  const left = boardLeftTitle(reader, act, actSeq);
  const summary = actSummaryBadge(reader, actions);
  const onOtherCard = Number(act.card_id) !== reader.rootCardId;
  const subtitle = onOtherCard
    ? boardSubtitleFrom(actCardName, ctx.fmt.card.name.s)
    : "";
  const rollback = boardRollbackOrEditLink(ctx, reader, act, actions);
  return boardOverlayTitleFrom(left, summary, subtitle, rollback);
}

/** relative_act_renderer.rb:12-14 relative_title + :16-20 subtitle's
 *  composition core (the oracle replays it with the same two names). */
function boardSubtitleFrom(actCardName: string, rootCardName: string): string {
  return `<small>act on ${DeckoName.parse(actCardName).from(rootCardName)}</small>`;
}

/** board_act_renderer.rb:35-41's composition core - the compact + join.
 *  The oracle replays the four pieces with its documented row doubles. */
function boardOverlayTitleFrom(
  left: string,
  summary: string,
  subtitle: string,
  rollback: string | null,
): string {
  const parts = [left, summary, subtitle === "" ? null : subtitle, rollback].filter(
    (part): part is string => part !== null,
  );
  return `<div>${parts.join(" | ")}</div>`;
}

/** overlay.rb:89-92 overlay_menu_link - every menu anchor gains the
 *  "text-muted p-1 ms-1" class (add_class appends). */
const OVERLAY_MENU_LINK_CLASS = "text-muted p-1 ms-1";

/** overlay.rb:24-27 view :overlay_menu + :30-34 + :41-43 + :87-89 - the
 *  three icon anchors: the help popover (help_popover_opts, menu.rb:103-107
 *  - the established menuHelpAnchor shape minus menu.rb's _card-menu-popover
 *  class; add_class order: the popover class list, then the menu-link
 *  class), the new-window card link (icon basket material: new_window ->
 *  close_fullscreen; link_to_card's known-card append lands after the
 *  menu-link class), and the close anchor (path "#", data-bs-dismiss
 *  overlay). GEM-SOURCE-DERIVED RENDERED-UNPINNED (the help text is the
 *  card's help rule - card-dependent, no live capture renders this menu). */
function boardOverlayMenu(ctx: ViewContext): string {
  const { fmt } = ctx;
  const rawHelp = fmt.menuHelpContentBytes();
  const helpContent = /^\s*$/.test(rawHelp) ? "&nbsp;" : rawHelp;
  const helpLink =
    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus" data-bs-content="${h(helpContent)}"` +
    ` data-bs-placement="left" class="help-link ps-1 _popover_link ${OVERLAY_MENU_LINK_CLASS}"` +
    ` data-bs-title="${h(fmt.card.name.s)}" href="#">${historyIcon("help")}</a>`;
  const newWindowLink =
    `<a class="${OVERLAY_MENU_LINK_CLASS} known-card" href="/${h(fmt.urlKey())}">` +
    `${historyIcon("close_fullscreen")}</a>`;
  const closeLink =
    `<a class="${OVERLAY_MENU_LINK_CLASS}" href="#" data-bs-dismiss="overlay">${historyIcon("close")}</a>`;
  return `<div class="overlay-menu">${helpLink}\n${newWindowLink}\n${closeLink}</div>`;
}

/** history_board.rb:18-26 view :board_act, cache: :never - the board's
 *  single-revision overlay: opts from params, the act from context, the
 *  BOARD renderer's overlay title, the action-list class up, and the act's
 *  details wrapped in the overlay frame (overlay.rb wrapper :overlay :4-10
 *  + overlay_framer :94-98 + with_frame frame.rb:13-19 + wrap_body
 *  wrap.rb:101-107). Registered on the all/history_board set. */
const boardActView: ViewFn = (ctx) => {
  const reader = historyReader(ctx);
  const { fmt, voo } = ctx;
  const opts = actListingOptsFromParams(reader.params, null); // history_board.rb:19
  const act = actFromContext(ctx, reader); // :20
  const actCard = reader.cardInfo(Number(act.card_id));
  if (actCard === undefined) return ""; // BoardActRenderer#render: "" unless @act_card
  const actions = reader.actionsAffecting(act.id, reader.rootCardId!);
  // history_board.rb:22 class_up "action-list", "my-3" (single_use: the
  // details' <ul classy> consumes it once - the oracle pins
  // "action-list my-3" as the consumed value)
  const actionListClass = "action-list my-3";
  // :23 wrap_with_overlay title: ar.overlay_title, slot: breadcrumb_data("History")
  voo.hide("menu"); // wrapper :6 voo.hide! :menu
  voo.hide("help"); // with_frame's voo.hide :help
  voo.classUp("card-slot", "_overlay d0-card-overlay bg-body"); // wrapper :4, single_use
  voo.classUp("card-slot", "_overlay"); // overlay_framer's second class_up
  voo.classUp("d0-card-header", "bg-body"); // overlay_header :57
  voo.classUp("d0-card-header-title", "d-flex"); // :58 (no consumer on this path - kept for voo state parity)
  const overlayTitle = boardOverlayTitle(ctx, reader, act, actCard.name, opts.actSeq, actions);
  const menu = boardOverlayMenu(ctx);
  // header_wrap (format header.rb:9-11): ONE div, parts joined by
  // output()'s "\n"; NO bootstrap card-header class on this path
  const header = `<div class="${voo.classy("d0-card-header")}">${overlayTitle}\n${menu}</div>`;
  // :24-25 act_listing(act, opts[:act_seq], :board) - the BOARD renderer's
  // render is the details list alone
  const details = boardActDetails(ctx, reader, actions, actionListClass);
  // wrap_body (wrap.rb:101-107): body_css_classes = d0-card-body +
  // safe_set_keys (the wrapper's @set_keys = true; NO d0-card-content,
  // NO bootstrap card-body class on this path)
  const body = `<div class="${voo.classy(["d0-card-body", fmt.card.setKeys])}">${details}</div>`;
  // with_frame: wrap { panel { [header, frame_help(nil - hidden), flash(""),
  // body] } } - panel's d0-card-frame carries NO "card" class (bootstrap's
  // standard_frame override does not fire on the overlay path); output()'s
  // flash "" stays as the empty line - the same "\n\n" seam the established
  // framedView composes.
  const panel = `<div class="${voo.classy("d0-card-frame")}">${header}\n\n${body}</div>`;
  // :23's slot: breadcrumb_data("History") (edit mod board.rb:73-77) -
  // slot_attributes' deep_merge! folds the two data attrs at the top level
  return historySlotWrap(ctx, "board_act", panel, {
    "data-breadcrumb": "History",
    "data-breadcrumb-class": "history",
  });
};

/** ActRenderer#details for the board: approved_actions[0..20] with the
 *  view's class-upped action-list class. */
function boardActDetails(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  actions: HistoryActionRow[],
  actionListClass: string,
): string {
  return actDetailsBytes(ctx, reader, actions, actionListClass);
}

/** The board_act pieces' PROBE SURFACE - the composition cores the harness
 *  probe (tests/card/mod-loader/card-mod-history-harness-probe.test.ts)
 *  replays the static-ruby oracle against. The cores are the SAME functions
 *  the view body calls (boardLeftTitleFrom / boardOverlayTitleFrom /
 *  boardSubtitleFrom / actListingOptsFromParams / actDetailsBytes'
 *  approved+slice selection) - the oracle's documented clock stub makes the
 *  edited-ago phrase an input, so the probe hands the oracle's frozen "1
 *  day" where the live view computes the shared timeAgoInWords table. */
export const boardProbeSurface = {
  /** act_listing.rb:29-32 with a params bag. */
  actListingOptsFromParams(
    params: { actSeq?: string; actionView?: string; hideDiff?: string },
    seq: string | null | undefined,
  ) {
    return actListingOptsFromParams(params, seq);
  },
  /** board_act_renderer.rb:6-17 title = left_title + right_title divs. */
  boardTitleForProbe(inputs: { actSeq?: string; actorName: string; editedAgo: string; summary: string }): string {
    const left = boardLeftTitleFrom(inputs.actorName, inputs.editedAgo, inputs.actSeq);
    return boardTitleFrom(left, inputs.summary);
  },
  /** board_act_renderer.rb:35-41 with the pieces the oracle documents. */
  boardOverlayTitleForProbe(inputs: {
    actSeq?: string;
    actorName: string;
    editedAgo: string;
    summary: string;
    subtitle: string;
    rollback: string | null;
  }): string {
    const left = boardLeftTitleFrom(inputs.actorName, inputs.editedAgo, inputs.actSeq);
    return boardOverlayTitleFrom(left, inputs.summary, inputs.subtitle, inputs.rollback);
  },
  /** relative_act_renderer.rb:12-20 subtitle from the two names. */
  boardSubtitleForProbe(actCardName: string, rootCardName: string): string {
    return boardSubtitleFrom(actCardName, rootCardName);
  },
  /** relative_act_renderer.rb:12-14 relative_title. */
  boardRelativeTitleForProbe(actCardName: string, rootCardName: string): string {
    return DeckoName.parse(actCardName).from(rootCardName);
  },
  /** act_renderer.rb:54-58,91-94's SELECTION - the approved actions the
   *  details render, capped at 21 (the oracle's AR(id) markers encode
   *  exactly this id sequence). */
  boardDetailSelectionForProbe(
    approvedActions: { id: number }[],
  ): number[] {
    return approvedActions.slice(0, 21).map((a) => a.id);
  },
  /** card-mod-edit board.rb:73-77 breadcrumb_data. */
  breadcrumbData(title: string, htmlClass?: string): Record<string, string> {
    return {
      "data-breadcrumb": title,
      "data-breadcrumb-class": htmlClass ?? title.toLowerCase(),
    };
  },
  /** history_board.rb:22's class up - the classy("action-list") value the
   *  details' <ul> consumes (the oracle pins the consumed string). */
  actionListClass(): string {
    return "action-list my-3";
  },
};

/** board_act_renderer.rb:6-9 title - the two divs (left class "me-2",
 *  right class "ms-auto act-summary"). */
function boardTitleFrom(left: string, right: string): string {
  return `<div class="me-2">${left}</div><div class="ms-auto act-summary">${right}</div>`;
}

/** view :action_summary (views.rb:28-30) - the diff view. */
const actionSummaryView: ViewFn = (ctx) => {
  const reader = historyReader(ctx);
  const action = actionFromContext(ctx, reader);
  if (action === undefined) return ""; // actions.rb:43 (no wrap for a missing action)
  return historySlotWrap(ctx, "action_summary", actionContentBytes(ctx, reader, action, "summary"));
};

/** views.rb:36-38 view :action_expanded - `action_content
 *  action_from_context, :expanded`. The same action_content body as
 *  :action_summary with the EXPANDED viewKind: the toggle is unconditional
 *  (actions.rb:46-48 read through actionContentBytes' toggleShown - expanded
 *  always shows the collapse anchor, pointing back at :action_summary) and
 *  the diff arm is the ContentDiff's COMPLETE form (the <del>/<ins> full
 *  diff, "<i>empty</i>" when no diff object). Oracle-pinned:
 *  fixtures/captured/history-views.json probe#action_expanded(update_action)
 *  (the expand_less toggle + the complete diff inside the standard history
 *  slot wrap). Ported by surfaces-batch2, 2026-09-30 - the header's "one
 *  viewKind argument away" note. */
const actionExpandedView: ViewFn = (ctx) => {
  const reader = historyReader(ctx);
  const action = actionFromContext(ctx, reader);
  if (action === undefined) return ""; // actions.rb:43 (no wrap for a missing action)
  return historySlotWrap(ctx, "action_expanded", actionContentBytes(ctx, reader, action, "expanded"));
};

/** views.rb:54-67 view :last_action_verb, cache: :never:
 *    return unless (act = card.last_act)
 *    return unless (action = act.action_on card.id)
 *    case action.action_type
 *    when :create then "added"
 *    when :delete then "deleted"
 *    else link_to_view :history, "edited", class: "last-edited", rel: "nofollow"
 *    end
 *  act.action_on(card.id) = the act's action whose card_id is this card
 *  (card/act.rb). The :edited anchor derives from the helper chain - the
 *  HTML link_to_view override (card-mod-format set/all/links.rb:119-122)
 *  slotterify's (remote: true + rel: "nofollow" reverse_merge, add_class
 *  "slotter" -> "last-edited slotter"), then base link_to_view (:23-26)
 *  add_to_path(view: :history), then the HTML link_to (:101-107):
 *  opts[:href] ||= path(view: :history), interpret_data_opts folds
 *  remote: into data-remote (delete+re-insert = last position), and
 *  content_tag emits attributes in Rails 7.2 hash-insertion order
 *  (actionview-7.2.3.2 tag_helper.rb:261-265 each_pair, NO sort): the
 *  caller's class first, rel, href, data-remote last.
 *  RENDERED-UNPINNED for this arm: no oracle capture renders the ALLOWED
 *  body (the capture shards carry no render of the name) - the byte shape
 *  is gem-source-derived, the same disclosed basis as the account-form
 *  pins. Ported by surfaces-batch2, 2026-09-30.
 *
 *  the role views port (2026-09-30) — TWO notes this body earned:
 *  1. The DENIED arm IS captured. The four notification templates'
 *  `{{_|last_action_verb}}` marks render on the notification's CONTEXT
 *  card, which the anonymous capture cannot read, so perms.rb:46-48 +
 *  error.rb:27-31 substitute the denial view BEFORE this body runs
 *  (`follower notification email+*html message` pins
 *  `<span class="denied"><!-- Sorry, you don't have permission (read)
 *  --></span>` inside the template's own anchor). This body therefore
 *  serves the captured bytes only through the gate, never directly.
 *  2. The FLAT HTML_VIEWS entry for this name points at card-mod-follow's
 *  notify variant instead (render/views.ts#lastActionVerbNotifyView): the
 *  loader-less graded surface installs no history seam, so the flat entry
 *  cannot carry THIS body (it would hit historyReader's engine-wiring
 *  assertion, whose error the nest rescue would print into the page).
 *  This registration stays the set-scoped one for the history surface,
 *  where RenderEngine#prepareHistoryRender always provides the reader. */
const lastActionVerbView: ViewFn = (ctx) => {
  const reader = historyReader(ctx);
  const act = reader.cardLastAct;
  if (act === undefined) return ""; // views.rb:55 return unless (act = card.last_act)
  const action = reader
    .actionsOfAct(act.id)
    .find((a) => a.card_id === reader.rootCardId);
  if (action === undefined) return ""; // views.rb:56 return unless (action = act.action_on card.id)
  const type = actionTypeFromCode(Number(action.action_type));
  if (type === "create") return "added";
  if (type === "delete") return "deleted";
  const url = ctx.fmt.urlKey();
  return (
    `<a class="last-edited slotter" rel="nofollow" href="/${h(url)}?view=history"` +
    ` data-remote="true">edited</a>`
  );
};

// ---------------------------------------------------------------------------
// surfaces-batch3 (2026-09-30): the act_legend / last_action / change ladder
// (views.rb:15-23 / :46-53 / :36-43). board_act stays the named remainder
// (the board act renderer + overlay chain).
// ---------------------------------------------------------------------------

/** views.rb:15-23 view :act_legend — the bs_layout row:
 *  `bs_layout do row md: [12, 12], lg: [7, 5], class: "pb-3" do
 *  col action_legend; col content_legend, class: "text-end" end end`.
 *  The bs_layout DSL (card-mod-bootstrap set/all/bootstrap/wrapper.rb)
 *  expands to the exact bytes the LIVE ORACLE CAPTURE pins — the legend row
 *  inside probe#history (fixtures/captured/history-views.json): the row div
 *  carries the row class, col 1 "col-md-12 col-lg-7", col 2
 *  "col-md-12 col-lg-5 text-end", one newline between the containers. The
 *  legend halves are the ported helpers actionLegendHtml(true) +
 *  contentLegendHtml() (actions.rb:91-104; relative_history passes :show,
 *  so the draft legend arm is ON). The :history view composes the SAME
 *  bytes through this helper — one composition, two surfaces. */
function actLegendRowBytes(): string {
  return (
    `<div class="row pb-3">\n<div class="col-md-12 col-lg-7">\n${actionLegendHtml(true)}</div>` +
    `\n<div class="col-md-12 col-lg-5 text-end">\n${contentLegendHtml()}</div></div>`
  );
}

/** views.rb:15-23 view :act_legend — the legend row alone (see
 *  actLegendRowBytes for the composition + capture cite). */
const actLegendView: ViewFn = () => actLegendRowBytes();

/** views.rb:46-53 view :last_action:
 *  `%(\n      <span class="last-update">\n        #{render_last_action_verb}
 *  #{render_acted_at} ago by\n        #{nest card.last_actor, view: :link}\n
 *  </span>\n    )` — the %() literal keeps the template's newlines and
 *  indentation. render_acted_at is the :acted_at view (format base.rb:63,
 *  date_view = time_ago_in_words — no variant); card.acted_at is
 *  last.rb:1-2 `last_act.acted_at`. The actor nest renders :link — for a
 *  known actor the link view's bytes are the known-card anchor (the same
 *  anchor actorAndAgo emits for the act listing; the nil-card arm renders
 *  the bare id, last.rb:65-67 last_actor = last_act.actor). Byte basis:
 *  GEM-SOURCE-DERIVED (RENDERED-UNPINNED — no capture shard renders the
 *  name), the same disclosed basis as :last_action_verb. */
const lastActionView: ViewFn = (ctx) => {
  const reader = historyReader(ctx);
  const act = reader.cardLastAct;
  const verb = ctx.fmt.renderView("last_action_verb");
  const ago0 = act === undefined ? undefined : parseActedAt(act.acted_at);
  const actedAt = ago0 === undefined ? "" : timeAgoInWords(ago0);
  const actor =
    act === undefined
      ? undefined
      : reader.cardInfo(Number(act.actor_id));
  const actorLink =
    actor === undefined
      ? act === undefined
        ? ""
        : h(String(act.actor_id))
      : `<a class="known-card" href="/${h(DeckoName.parse(actor.name).urlKey)}">${h(actor.name)}</a>`;
  return (
    `\n      <span class="last-update">\n        ${verb} ${actedAt} ago by\n        ${actorLink}\n      </span>\n    `
  );
};

/** views.rb:36-43 view :change:
 *  `voo.show :title_link; voo.hide :menu; wrap do [_render_title,
 *  _render_menu, _render_last_action] end` — the default slot wrap (wrap.rb
 *  :6-9, slot=true) around the array joined by output()'s newline; the
 *  hidden menu renders empty. Composes :last_action — unblocks when it
 *  lands (it lands in this commit). */
const changeView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  voo.show("title_link");
  voo.hide("menu");
  // title.rb:14-16 show_view?(:title_link, :hide) ? render_title_link :
  // render_title_no_link — the voo the :change body just viz'd decides the
  // title arm. (The flat :title registers the no-link arm unconditionally;
  // the toggle lives here, the one view whose Ruby body viz's it.)
  const title = fmt.renderView("title_link");
  const menu = voo.show("menu") ? fmt.renderView("menu") : "";
  const lastAction = fmt.renderView("last_action");
  return historySlotWrap(ctx, "change", [title, menu, lastAction].join("\n"));
};

// ---------------------------------------------------------------------------
// set/all/history/events.rb - the event declarations (pinned to the manifest
// events[] surface; bodies are stubs because the write path / DB seam
// stays out of scope here, mirroring the list mod's pattern for
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
// All six pinned bodies need DB write access; every registration below
// shares one not-implemented fn, and each entry's comment transcribes the
// Ruby body plus the seam it would call into (the host argument is
// reserved for a future write-path composition surface).

/** The shared body for all six declarations - none is implemented (see
 *  the section header). */
const historyEventNotImplemented: ModEventFn = () => {};

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
      // stubs - the write path + DB seam are out of scope here.
      setPath: "all/history/events",
      events: [
        // events.rb:1-7 update_ancestor_timestamps (integrate) - `ids =
        // history_ancestor_ids; return unless ids.present?;
        // Card.where(id: ids).update_all(...); ids.map { |anc_id|
        // Card.expire anc_id.cardname }`. Needs the DB UPDATE +
        // cache.expire (write-path acts/CQL seam).
        {
          event: "update_ancestor_timestamps",
          at: "integrate",
          fn: historyEventNotImplemented,
        },
        // events.rb:15-17 assign_action (initialize, when: :actionable?) -
        // Ruby body: `@current_action = new_action` where `new_action`
        // (events.rb:74-82) builds `Card::Action.new(act:
        // director.need_act, action_type: action, draft: draft_action?,
        // super_action: super_action)`. :initialize runs before every
        // other history event; the (card, host) surface carries neither
        // the act row nor the draft/super-action flags. Write path:
        // src/card/history/write-path.ts (ActWriter.assignAction).
        {
          event: "assign_action",
          at: "initialize",
          when: "actionable?",
          fn: historyEventNotImplemented,
        },
        // events.rb:19-22 detect_conflict (validate, on: :update, when:
        // :edit_conflict?) - Ruby body: `errors.add :conflict, ::I18n.t
        // (:history_error_not_latest_revision)`. Needs the errors-object +
        // I18n-in-flight seams; the edit_conflict? guard IS ported above
        // (events.rb:65-72, isEditConflict).
        {
          event: "detect_conflict",
          at: "validate",
          on: ["update"],
          when: "edit_conflict?",
          fn: historyEventNotImplemented,
        },
        // events.rb:25-38 finalize_action (finalize, when:
        // :finalize_action?) - Ruby body: `if changed_fields.present?`
        // then `@current_action.update! card_id: id;
        // store_card_changes_for_create_action if first_change?;
        // store_card_changes unless first_create?`; else drop the empty
        // action. Write path: ActWriter.finalizeAction.
        {
          event: "finalize_action",
          at: "finalize",
          when: "finalize_action?",
          fn: historyEventNotImplemented,
        },
        // events.rb:40-46 rollback_actions (prepare_to_validate, on:
        // :update, when: :rollback_request?) - the body reads
        // `revert_actions` from Env.params, calls
        // `process_revert_actions` (set/all/history/actions.rb), runs
        // `update!` on the result, clears drafts, then `abort :success`.
        // Needs Env.params + the abort pipeline + the revert write path.
        {
          event: "rollback_actions",
          at: "prepare_to_validate",
          on: ["update"],
          when: "rollback_request?",
          fn: historyEventNotImplemented,
        },
        // events.rb:48-50 finalize_act (after: :finalize_action, when:
        // :act_card?) - Ruby body: `Card::Director.act.update! card_id:
        // id` (the act's primary-card UPDATE - the row was inserted with
        // card_id NULL). ActWriter.finalizeActCard
        // (write-path.ts:605-621) already owns this UPDATE.
        {
          event: "finalize_act",
          after: "finalize_action",
          when: "act_card?",
          fn: historyEventNotImplemented,
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
      // views: :draft_legend (headless) plus the seam-backed views
      // (:history / :act / :action_summary / :action_expanded /
      // :last_action_verb / :act_legend / :last_action / :change — the
      // render-time query seam, src/card/history/render-seam.ts;
      // surfaces-batch3 added the ladder trio). board_act is ported on the
      // all/history_board set below (the mod-porting the first porting wave).
      setPath: "all/history/views",
      formats: {
        html: {
          views: [
            { view: "draft_legend", viewFn: draftLegendView },
            { view: "history", viewFn: historyView },
            { view: "act", viewFn: actView },
            { view: "action_summary", viewFn: actionSummaryView },
            { view: "action_expanded", viewFn: actionExpandedView },
            { view: "last_action_verb", viewFn: lastActionVerbView },
            { view: "act_legend", viewFn: actLegendView },
            { view: "last_action", viewFn: lastActionView },
            { view: "change", viewFn: changeView },
          ],
        },
      },
    },
    {
      // card-mod-history-0.20.0/set/all/history_board.rb - the board
      // views. :board_act IS ported (the mod-porting the first porting wave
      // 2026-10-03; the BoardActRenderer chain + the overlay frame, with
      // the oracle pieces pinned by the harness capture and the frame
      // chrome gem-source-derived rendered-unpinned - see the view's
      // comment). :creator_credit and :updated_by are ported in the FLAT
      // registry (src/card/render/views.ts, the same level the first mod batch
      // used for creator_credit).
      setPath: "all/history_board",
      formats: {
        html: {
          views: [{ view: "board_act", viewFn: boardActView, config: { cache: "never" } }],
        },
      },
    },
  ],
};

export default cardModHistory;
