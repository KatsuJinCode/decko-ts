// Shared types and errors for the card ACTION layer (Set / Save / Update /
// Delete) — the write-side API that sits on top of the ActWriter history
// machinery (src/card/history/write-path.ts).
//
// Ruby analogues:
// - Card.create! / Card#create        (card-1.110.0 lib/card/director/card_class.rb:5-13)
// - Card#update! / Card#save!         (lib/card/director/all.rb:46-61)
// - Card#delete!                      (mod/core/set/all/trash.rb:11-21)
// - Card::Auth.current_id / Anonymous (lib/card/auth/current.rb:7-9, :43-47)

import type { DeckoName, Nameish } from "../name.js";
import type { CardRecord } from "../fetch/card-record.js";

/** The account performing an action. `null` means "no signed-in account" —
 *  Ruby's Card::Auth.current_id falling back to Card::AnonymousID
 *  (auth/current.rb:7-9); anonymous actors are read-only here. */
export interface Actor {
  id: number;
  name: string;
}

/** The name of the anonymous account card (codename `anonymous`; the ID
 *  constants are generated per codename, codename.rb:108 —
 *  `Card.const_get_or_set("#{codename.camelize}ID")`). */
export const ANONYMOUS_ACTOR_NAME = "*anonymous";

/** Machine-readable failure kinds thrown by the action layer. */
export type CardActionErrorCode =
  | "anonymous-actor" // no signed-in account (write attempted anonymously)
  | "permission-denied" // the canWrite hook rejected the actor
  | "name-conflict" // validate_uniqueness_of_name (mod/core/set/all/name_events.rb:19-26)
  | "name-illegal" // validate_legality_of_name (name_events.rb:35-47)
  | "rename-conflict" // validate_renaming (name_events.rb:55-61)
  | "cycle" // the save would make a card its own descendant
  | "not-found" // no such (non-trashed) card
  | "type-unknown" // validate_type (mod/core/set/all/type.rb:24-30)
  | "protected-card"; // validate_delete (mod/core/set/all/trash.rb:31-49)

/** Error class for every action-layer rejection. `code` carries the Ruby
 *  event the rejection ports (see CardActionErrorCode). */
export class CardActionError extends Error {
  readonly code: CardActionErrorCode;

  constructor(code: CardActionErrorCode, message: string) {
    super(message);
    this.name = "CardActionError";
    this.code = code;
  }
}

/** Type specification accepted by create/update — the `:type_id` /
 *  `:type_code` / `:type` args of Card.new (mod/core/set/all/type.rb:81-92
 *  extract_type_id!). Precedence: typeId > typeCode > typeName > default. */
export interface TypeSpec {
  typeId?: number;
  typeCode?: string;
  typeName?: Nameish;
}

/** Card.create! arguments (Card.create! opts — director/card_class.rb:5-9:
 *  `card = new opts; card.save!`). Name is the mark; everything else is
 *  optional and resolved by the engine. */
export interface CreateCardInput extends TypeSpec {
  name: Nameish;
  content?: string | null;
  /** cards.codename passthrough (ActWriter column). Codename writes carry
   *  their own events in Ruby (mod/core/set/all/codename.rb) — the caller
   *  is responsible for legitimacy; the cache reset runs here. */
  codename?: string | null;
  /** card_actions.super_action_id passthrough when this create is itself a
   *  subcard operation (history events.rb:88-92). */
  superActionId?: number | null;
}

/** Card#update! arguments. All fields optional; a save that changes nothing
 *  persists nothing (no-op save — history events.rb:34-37). */
export interface UpdateCardInput extends TypeSpec {
  cardId: number;
  /** A new name — the Save/Update rename path (name_events.rb events on
   *  `changed: :name`). Compound names rewire left_id/right_id; simple
   *  names rewrite the cards.name/key columns. */
  name?: Nameish;
  content?: string;
  superActionId?: number | null;
}

/** Card#delete! arguments (trash.rb:11-21 — an update save with trash:
 *  true). Children are deleted recursively in the same act
 *  (trash.rb:52-59 delete_children). */
export interface DeleteCardInput {
  cardId: number;
  superActionId?: number | null;
}

/** The shared entry's request union (applyAction — one dispatch for the
 *  Set/Save/Update/Delete verbs). */
export type ActionRequest =
  | ({ verb: "create" } & CreateCardInput)
  | ({ verb: "update" } & UpdateCardInput)
  | ({ verb: "delete" } & DeleteCardInput);

/** One card's action within the act. */
export interface CardActionSummary {
  cardId: number;
  actionId: number;
  verb: "create" | "update" | "delete";
  /** The card's composed name after the action (best effort; undefined when
   *  the lexicon cannot resolve it, e.g. a side card was deleted). */
  name?: DeckoName;
}

/** The result of one action request: one act, the primary card's action,
 *  and the subcard actions recorded in the same act (auto-created side
 *  cards on junction creates, trashed trash-name obstacles on renames,
 *  cascaded children on deletes). */
export interface ActionResult extends CardActionSummary {
  actId: number;
  subactions: CardActionSummary[];
}

/** The permission seam. The BASIC gate (anonymous rejection) always runs;
 *  `canWrite` is the hook the future full permission-resolution stream
 *  replaces — Ruby's ok? machinery
 *  (card-mod-permissions set/all/permissions.rb:37-51, event
 *  :check_permissions at :22-25) is deliberately NOT built here. */
export type CanWriteHook = (
  card: CardRecord,
  actor: Actor,
) => boolean | Promise<boolean>;
