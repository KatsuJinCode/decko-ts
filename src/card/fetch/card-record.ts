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
import type { SQLDateTime } from "../../server/schema.js";

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
