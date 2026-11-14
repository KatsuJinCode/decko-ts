// The history pane's revert requests: which actions a request names, and the
// revision each of those actions points at.
//
// Ruby (card-mod-history-0.20.0):
//   set/all/history/revision.rb   revision, revision_attributes,
//                                 revision_before_action, actions_to_revert,
//                                 process_revert_actions, merge_revert_action!
//   set/all/history/last.rb       last_change_on, last_change_from_action_id
//   lib/card/action/changes.rb    Action#change, #changes, #current_changes
//   lib/card/action.rb            Action#previous_action, #sole?
//
// A revision is the value of every tracked field as of one action: the
// action's own change for the field, else the field's last change at or
// before the action, else the card's current value. Reverting "to previous"
// takes the revision of the action BEFORE the named one, or `trash: true`
// when the named action was the card's first.
//
// Values come back as Ruby assigns them from change rows: strings, with
// type_id/left_id/right_id cast to integers and trash to a boolean (the
// ActiveRecord casts `update!` applies to "2" / "f").

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { TRACKED_FIELDS, type TrackedField } from "../history/change.js";

/** One card_actions row, as the revert path reads it. */
export interface RevertActionRow {
  id: number;
  card_id: number;
  card_act_id: number | null;
  action_type: number | null;
  draft: number | boolean | null;
}

/** The attributes `update!` receives for one card (revision_attributes or
 *  revision_before_action, after `rev.delete :name unless rev[:name]`). */
export interface Revision {
  name?: string;
  type_id?: number | null;
  db_content?: string | null;
  trash?: boolean;
  left_id?: number | null;
  right_id?: number | null;
}

interface ChangeRow {
  id: number;
  card_action_id: number;
  field: number;
  value: string | null;
}


/** actions_to_revert (revision.rb): every action of `revert_act` when given
 *  (Act#actions, ordered by id, drafts included), else each id in
 *  `revert_actions` that names an action (`Action.fetch(id) || nil`, compact). */
export async function actionsToRevert(
  driver: SQLDatabaseDriver,
  opts: { actId?: number | string; actionIds?: (number | string)[] },
): Promise<RevertActionRow[]> {
  const columns = "id, card_id, card_act_id, action_type, draft";
  if (opts.actId !== undefined && opts.actId !== null && String(opts.actId) !== "") {
    const { rows } = await driver.query<RevertActionRow>(
      `SELECT ${columns} FROM card_actions WHERE card_act_id = ? ORDER BY id`,
      [Number(opts.actId)],
    );
    return rows.map(normaliseAction);
  }
  const out: RevertActionRow[] = [];
  for (const raw of opts.actionIds ?? []) {
    if (!/^\d+$/.test(String(raw))) continue;
    const { rows } = await driver.query<RevertActionRow>(
      `SELECT ${columns} FROM card_actions WHERE id = ?`,
      [Number(raw)],
    );
    if (rows[0] !== undefined) out.push(normaliseAction(rows[0]));
  }
  return out;
}

function normaliseAction(row: RevertActionRow): RevertActionRow {
  return {
    id: Number(row.id),
    card_id: Number(row.card_id),
    card_act_id: row.card_act_id === null ? null : Number(row.card_act_id),
    action_type: row.action_type === null ? null : Number(row.action_type),
    draft: row.draft,
  };
}

/** Card#revision(action, before_action) for the action's own card. */
export async function revisionOf(
  driver: SQLDatabaseDriver,
  card: CardsRow,
  action: RevertActionRow,
  beforeAction: boolean,
): Promise<Revision> {
  if (beforeAction) {
    // revision_before_action: Action#previous_action is
    // `Card::Action.where("id < ? AND card_id = ?", id, card_id).last` —
    // drafts included; no previous action means the card did not exist.
    const { rows } = await driver.query<RevertActionRow>(
      `SELECT id, card_id, card_act_id, action_type, draft FROM card_actions
       WHERE id < ? AND card_id = ? ORDER BY id DESC LIMIT 1`,
      [action.id, action.card_id],
    );
    if (rows[0] === undefined) return { trash: true };
    return revisionOf(driver, card, normaliseAction(rows[0]), false);
  }
  const attrs: Record<string, unknown> = {};
  for (const field of TRACKED_FIELDS) {
    const change =
      (await actionChange(driver, card, action, field)) ??
      (await lastChangeOn(driver, card, field, action));
    attrs[field] = change !== undefined ? castChangeValue(field, change.value) : currentValue(card, field);
  }
  const rev = attrs as Revision;
  // merge_revert_action!: `rev.delete :name unless rev[:name]` (compound
  // cards store a NULL name).
  if (rev.name === null || rev.name === undefined || rev.name === "") delete rev.name;
  return rev;
}

/** Action#change(field): the action's change for the field. A "sole" action
 *  (no stored changes, and a create or the card's only action) answers with
 *  the card's CURRENT values (Action#current_changes). */
async function actionChange(
  driver: SQLDatabaseDriver,
  card: CardsRow,
  action: RevertActionRow,
  field: TrackedField,
): Promise<{ value: string | null } | undefined> {
  const changes = await changesOf(driver, action.id);
  if (changes.length === 0 && (await isSole(driver, action))) {
    return { value: serialiseCurrent(card, field) };
  }
  const idx = TRACKED_FIELDS.indexOf(field);
  // Action#changes keys all_changes by field; a later row for the same
  // field overwrites an earlier one in that hash.
  let found: ChangeRow | undefined;
  for (const c of changes) if (Number(c.field) === idx) found = c;
  return found === undefined ? undefined : { value: found.value };
}

/** Action#sole?: no changes, and either a create or the card's only action. */
async function isSole(driver: SQLDatabaseDriver, action: RevertActionRow): Promise<boolean> {
  if (action.action_type === 0) return true;
  const { rows } = await driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?",
    [action.card_id],
  );
  return Number(rows[0]?.n ?? 0) === 1;
}

async function changesOf(driver: SQLDatabaseDriver, actionId: number): Promise<ChangeRow[]> {
  const { rows } = await driver.query<ChangeRow>(
    "SELECT id, card_action_id, field, value FROM card_changes WHERE card_action_id = ? ORDER BY id",
    [actionId],
  );
  return rows;
}

/** last_change_on(field, not_after: action) (last.rb:9-21). */
async function lastChangeOn(
  driver: SQLDatabaseDriver,
  card: CardsRow,
  field: TrackedField,
  notAfter: RevertActionRow,
): Promise<{ value: string | null } | undefined> {
  // create_action is the card's first NON-draft action (Card#actions
  // filters drafts, card.rb:172).
  const { rows: firstRows } = await driver.query<RevertActionRow>(
    `SELECT id, card_id, card_act_id, action_type, draft FROM card_actions
     WHERE card_id = ? AND (draft IS NULL OR draft = 0) ORDER BY id LIMIT 1`,
    [card.id],
  );
  const createAction = firstRows[0] !== undefined ? normaliseAction(firstRows[0]) : undefined;
  if (createAction !== undefined && createAction.id === notAfter.id) {
    // create_action_last_change? -> create_action.change(field)
    return actionChange(driver, card, createAction, field);
  }
  // last_change_from_action_id: the field's last non-draft change at or
  // before the action, ordered by change id.
  const { rows } = await driver.query<ChangeRow>(
    `SELECT card_changes.id, card_changes.card_action_id, card_changes.field, card_changes.value
     FROM card_changes JOIN card_actions ON card_actions.id = card_changes.card_action_id
     WHERE card_actions.card_id = ? AND card_changes.field = ?
       AND (card_actions.draft IS NULL OR card_actions.draft = 0)
       AND card_changes.card_action_id <= ?
     ORDER BY card_changes.id DESC LIMIT 1`,
    [card.id, TRACKED_FIELDS.indexOf(field), notAfter.id],
  );
  return rows[0] === undefined ? undefined : { value: rows[0].value };
}

/** The value a change row carries, as `update!` assigns it. */
function castChangeValue(field: TrackedField, value: string | null): unknown {
  if (value === null) return null;
  switch (field) {
    case "type_id":
    case "left_id":
    case "right_id":
      return /^-?\d+$/.test(value) ? Number(value) : null;
    case "trash":
      // ActiveModel::Type::Boolean: "f", "0", "false" are false.
      return !["f", "0", "false", "F", "FALSE", "off", ""].includes(value);
    default:
      return value;
  }
}

/** `self[field]` — the card's current attribute value. */
function currentValue(card: CardsRow, field: TrackedField): unknown {
  switch (field) {
    case "trash":
      return card.trash === 1;
    default:
      return (card as unknown as Record<string, unknown>)[field] ?? null;
  }
}

/** A current value in change-row form (current_changes builds Change
 *  objects from `card.send(field)`; castChangeValue reads them back). */
function serialiseCurrent(card: CardsRow, field: TrackedField): string | null {
  const v = (card as unknown as Record<string, unknown>)[field];
  if (v === null || v === undefined) return null;
  if (field === "trash") return Number(v) === 1 ? "t" : "f";
  return String(v);
}

