// The card record a fetch returns, composed exactly as Ruby composes it.
//
// ROW COMPOSITION MAP (the critical knowledge; every attribute cites its
// Ruby source - see docs/fetch-port-notes.md for the full trail):
//
//   attribute            Ruby source                          tables touched
//   -------------------  -----------------------------------  ------------------
//   name                 lib/card/name/all.rb#name            cards.left_id/right_id
//                        (left_id ? Lexicon.lex_to_name(      + cards of the side
//                         [left_id, right_id]) : column)      cards (via lexicon)
//   key                  lib/card/name/all.rb#key             composed name, or
//                        (left_id ? name.key : column)        cards.key column
//   codename             lib/card/codename.rb#codename        cards.codename column
//                        (super&.to_sym - the AR column)
//   typeId               cards.type_id column                 cards
//   dbContent            cards.db_content column              cards
//   trash                cards.trash column (tinyint->bool)   cards
//   creatorId/updaterId/ cards columns                        cards
//   createdAt/updatedAt/
//   currentRevisionId/
//   readRuleClass/
//   readRuleId/
//   referencesExpired
//   leftId/rightId       cards.left_id / cards.right_id       cards
//   id                   cards.id                             cards
//
//   type name / type_code are NOT columns of the card's own row: they come
//   from the type CARD's row (mod/core/set/all/type.rb#type_name
//   `quick_fetch(type_id)&.name`, #type_code `Card::Codename[type_id]`).
//
//   card_actions / card_acts / card_changes do NOT compose any fetched
//   attribute. They are the history trail (card-mod-history-0.20.0
//   lib/card/action.rb, lib/card/change.rb - `Card::Change::TRACKED_FIELDS =
//   %w[name type_id db_content trash left_id right_id]` records per-action
//   after-values). `current_action` is a transient runtime attribute, not
//   storage (lib/card.rb:146, action_specific_attributes).

import type { DeckoName } from "../name.js";
import type { SQLDateTime, CardsRow } from "../../server/schema.js";
import type { DbLexicon } from "./lexicon.js";

/**
 * The composed card object Ruby's fetch returns. `id: undefined` +
 * `isNew: true` is the "cache placeholder" a fetch of an unknown name
 * produces (fetch/store.rb#new_for_cache). Field names mirror the Ruby
 * attribute names, snake_case -> camelCase per the port convention.
 */
export interface CardRecord {
  // ---- cards columns -------------------------------------------------------
  id: number | undefined;
  codename: string | undefined;
  leftId: number | undefined;
  rightId: number | undefined;
  typeId: number | undefined;
  dbContent: string | undefined;
  trash: boolean;
  creatorId: number | undefined;
  updaterId: number | undefined;
  createdAt: SQLDateTime | undefined;
  updatedAt: SQLDateTime | undefined;
  currentRevisionId: number | undefined;
  readRuleClass: string | undefined;
  readRuleId: number | undefined;
  referencesExpired: number | undefined;

  // ---- composed (see the map above) ----------------------------------------
  name: DeckoName | undefined;
  key: string | undefined;

  // ---- runtime state (ActiveRecord new_record? / @from_trash / @uncacheable)
  /** ActiveRecord new_record?: not yet in the database. */
  isNew: boolean;
  /** @from_trash: found in the trash during a (write-path) restore. */
  fromTrash: boolean;
  /** @uncacheable - set by the write path (mod/core/set/all/initialize.rb:80). */
  uncacheable: boolean;

  /** name_before_act (lib/card/dirty.rb DirtyNames) - only present during
   *  write-path renames; fetch-populated cards have none. Used by expire. */
  nameBeforeAct?: DeckoName;
}

/** mod/core/set/all/states.rb#new? : (new_record? || !@from_trash.nil?) && !trash? */
export function isNewCard(card: CardRecord): boolean {
  return (card.isNew || card.fromTrash) && !card.trash;
}

/** states.rb#real? : !unreal? (alias of new?) */
export function isRealCard(card: CardRecord): boolean {
  return !isNewCard(card);
}

/**
 * states.rb#known? : real? || virtual?. Virtual? requires structure rules
 * (mod/core/set/all/patterns + rule lookups), owned by the rules wave - the
 * fetch layer reports virtual? as false until that wave lands.
 */
export function isKnownCard(card: CardRecord): boolean {
  return isRealCard(card) || false /* virtual? - rules wave */;
}

/** lib/card/content/all.rb#content : db_content || (new_card? ? default_content : "").
 *  default_content comes from templates/rules (rules wave); until then both
 *  branches fall back to "". */
export function cardContent(card: CardRecord): string {
  return card.dbContent ?? "";
}

/** lib/card/name/all.rb#id_string (name/all.rb:60): "~#{id}" - also the
 *  (legacy) cache key deleted by expire_id. */
export function idString(card: CardRecord): string | undefined {
  return card.id === undefined ? undefined : `~${card.id}`;
}

/**
 * Compose a CardRecord from a cards row. Composition per attribute follows
 * the map at the top of this file; the two name-sensitive attributes port
 * lib/card/name/all.rb:
 * - #name (name/all.rb:12-14): `left_id ? Lexicon.lex_to_name([left_id,
 *   right_id]) : super.to_name` - compound cards compose through the
 *   lexicon; simple cards read the column.
 * - #key (name/all.rb:17-19): `left_id ? name.key : super` - same split.
 *
 * DELIBERATE DIVERGENCE (documented in docs/fetch-port-notes.md): when a
 * compound card's side cards are unresolvable the Ruby name is nil and
 * Ruby's `key` would raise composing name.key on nil; this port falls back
 * to the row's own name/key columns, which production rows (pre-2020
 * data, db/schema.sqlite.sql comments) still carry.
 */
export async function composeCardRecord(row: CardsRow, lexicon: DbLexicon): Promise<CardRecord> {
  const trash = row.trash === 1 || row.trash === true;
  let name: DeckoName | undefined;
  let key: string | undefined;
  if (row.left_id !== null && row.left_id !== undefined) {
    const composed = await lexicon.composeName(row.left_id, row.right_id);
    if (composed !== undefined) {
      name = composed;
      key = composed.key;
    } else {
      // broken-lexicon fallback: use the stored columns (see doc above)
      name = row.name !== null && row.name !== undefined ? DeckoName.parse(row.name) : undefined;
      key = row.key ?? undefined;
    }
  } else {
    name = row.name !== null && row.name !== undefined ? DeckoName.parse(row.name) : undefined;
    key = row.key ?? undefined;
  }
  return {
    id: row.id,
    codename: row.codename ?? undefined,
    leftId: row.left_id ?? undefined,
    rightId: row.right_id ?? undefined,
    typeId: row.type_id,
    dbContent: row.db_content ?? undefined,
    trash,
    creatorId: row.creator_id,
    updaterId: row.updater_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentRevisionId: row.current_revision_id ?? undefined,
    readRuleClass: row.read_rule_class ?? undefined,
    readRuleId: row.read_rule_id ?? undefined,
    referencesExpired: row.references_expired ?? undefined,
    name,
    key,
    isNew: false,
    fromTrash: false,
    uncacheable: false,
  };
}

/**
 * fetch/store.rb#new_for_cache (store.rb:26-28): `Card.new name: mark,
 * skip_modules: true` (+ type attrs when eager_caching?, store.rb:26) - a
 * cache placeholder for an unknown name mark. skip_modules is a no-op in
 * this port (set modules are a rules-wave concern).
 */
export function newCardRecord(
  mark: DeckoName,
  opts: { typeId?: number; typeCode?: string; content?: string } = {},
): CardRecord {
  return {
    id: undefined,
    codename: undefined,
    leftId: undefined,
    rightId: undefined,
    typeId: opts.typeId,
    dbContent: opts.content,
    trash: false,
    creatorId: undefined,
    updaterId: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    currentRevisionId: undefined,
    readRuleClass: undefined,
    readRuleId: undefined,
    referencesExpired: undefined,
    name: mark,
    key: mark.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false,
  };
}
