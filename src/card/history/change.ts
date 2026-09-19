// Card::Change write-side semantics, ported from the Ruby truth:
// card-mod-history-0.20.0/lib/card/change.rb.
//
// A change row records the after-value of ONE tracked field for ONE action
// (card_changes: card_action_id, field, value). The `field` column holds the
// 0-based index into TRACKED_FIELDS (change.rb#field= / #field_index), and
// the `value` column holds the value serialized the way ActiveRecord
// serializes into a mediumtext column (see serializeChangeValue below).
//
// FIELD CODE CORRECTION vs the decko-ts schema comments: db/schema.sqlite.sql
// and src/server/schema.ts say "field holds a FieldID code (name=1,
// content=2, type_id=3)". That is wrong for the card-1.110.0 era. The truth
// source uses the 0-based TRACKED_FIELDS index: name=0, type_id=1,
// db_content=2, trash=3, left_id=4, right_id=5. The 0-based mapping is
// pinned three ways in the Ruby source:
//   * change.rb:25  TRACKED_FIELDS = %w[name type_id db_content trash left_id
//                                     right_id] (+ #field= / #field index)
//   * migration 20141001105348_move_revisions_to_actions.rb:61-65 inserts
//     field values 0..3 for name/type_id/content/trash
//   * card-mod-history set/all/history/events.rb:108-114 stores changes via
//     Card::Change.create field: <name> (index lookup)
// See docs/history-port-notes.md; the schema comments are owned by the
// schema stream and left untouched here.

import type { SQLBoolean } from "../../server/schema.js";

/** The database fields for which changes are recorded.
 *  card-mod-history-0.20.0/lib/card/change.rb:25 (TRACKED_FIELDS). */
export const TRACKED_FIELDS = [
  "name",
  "type_id",
  "db_content",
  "trash",
  "left_id",
  "right_id",
] as const;

export type TrackedField = (typeof TRACKED_FIELDS)[number];

/**
 * The raw, DB-shaped values a change row can carry for a tracked field:
 * strings as-is, integers (type_id, left_id, right_id), booleans (trash —
 * ActiveRecord hands the engine `true`/`false` after casting tinyint(1)),
 * or NULL (unset compound-card halves, empty db_content, ...).
 */
export type ChangeValue = string | number | boolean | null;

/** The tracked-field slice of a cards row, in raw attribute form — the shape
 *  Ruby reads with `self[field]` when storing change values
 *  (card-mod-history set/all/history/events.rb:102-106). `name` is the raw
 *  cards.name attribute: the simple name string for simple cards and NULL
 *  for compound cards (card-1.110.0/lib/card/name/all.rb:20-21,
 *  `write_attribute :name, (@name.simple? ? @name.s : nil)`); compound cards
 *  carry left_id/right_id instead. */
export interface CardFieldState {
  name: string | null;
  type_id: number;
  db_content: string | null;
  trash: SQLBoolean;
  left_id: number | null;
  right_id: number | null;
}

/** Index of a tracked field, as stored in card_changes.field.
 *  change.rb:47-49 (#field_index — "value.is_a?(Integer) ? value :
 *  TRACKED_FIELDS.index(value.to_s)"). */
export function trackedFieldIndex(field: TrackedField): number {
  return TRACKED_FIELDS.indexOf(field);
}

/** Inverse of trackedFieldIndex — change.rb:67-69 (#field reads the name
 *  back with TRACKED_FIELDS[read_attribute(:field)]). */
export function trackedFieldByIndex(index: number): TrackedField | undefined {
  return TRACKED_FIELDS[index];
}

/**
 * Serialize a change value the way ActiveRecord writes it into the
 * card_changes.value column. The column is mediumtext, which the MySQL
 * adapter maps to ActiveRecord::Type::Text
 * (activerecord-7.2.3.2/lib/active_record/connection_adapters/
 * abstract_mysql_adapter.rb:729, `register_type %r(mediumtext)i,
 * Type::Text.new(limit: 2**24 - 1)`). Type::Text is ActiveModel::Type::String
 * (activerecord-7.2.3.2/lib/active_record/type/text.rb:6), whose #serialize
 * (activemodel-7.2.3.2/lib/active_model/type/immutable_string.rb:48-56) does:
 *   Numeric  -> to_s            (type_id 123 -> "123")
 *   true     -> "t", false -> "f"  (the @true/@false defaults)
 *   String   -> as-is; nil      -> NULL
 */
export function serializeChangeValue(value: ChangeValue): string | null {
  if (value === null) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "t" : "f";
  return value;
}

/**
 * Field-aware value preparation: the raw cards.trash column is tinyint(1),
 * which ActiveRecord casts to true/false BEFORE the change value is
 * serialized (ActiveModel::Type::Boolean#cast_value — 0 is in FALSE_VALUES,
 * activemodel-7.2.3.2/lib/active_model/type/boolean.rb:15-45 — then
 * Type::Text#serialize renders "t"/"f"). The port's CardFieldState carries
 * the raw storage shape (0 | 1), so the trash cast happens here; every other
 * tracked attribute needs no cast (type_id / left_id / right_id are integers,
 * name / db_content are strings).
 */
export function changeValueForField(
  field: TrackedField,
  value: ChangeValue,
): string | null {
  if (field === "trash" && typeof value === "number") {
    return serializeChangeValue(value !== 0);
  }
  return serializeChangeValue(value);
}

/**
 * Which tracked fields changed between the pre-act DB state and the
 * post-act state, in TRACKED_FIELDS order.
 *
 * Ruby: set/all/history.rb:51-53 — `Card::Change::TRACKED_FIELDS &
 * (changed_attribute_names_to_save | saved_changes.keys)`; the `&` keeps
 * TRACKED_FIELDS order, and the union covers both unsaved and already-saved
 * changes so the finalize-stage computation sees the whole act. With explicit
 * before/after snapshots the union collapses to "differs from the pre-act
 * row" — the snapshot model cannot see an intermediate within-act value
 * (documented simplification, docs/history-port-notes.md).
 */
export function diffTrackedFields(
  before: CardFieldState,
  after: CardFieldState,
): TrackedField[] {
  return TRACKED_FIELDS.filter((field) => before[field] !== after[field]);
}
