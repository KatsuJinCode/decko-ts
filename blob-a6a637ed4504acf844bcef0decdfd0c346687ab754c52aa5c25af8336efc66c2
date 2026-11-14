// Card::Action type semantics, ported from the Ruby truth:
// card-mod-history-0.20.0/lib/card/action.rb and the save machinery that
// decides which action type a save produces.

import type { SQLBoolean } from "../../server/schema.js";

/** "these are the three possible values for action_type"
 *  action.rb:42 (TYPE_OPTIONS = %i[create update delete]). The INTEGER
 *  stored in card_actions.action_type is the index in this order
 *  (action.rb:90-92, `write_attribute :action_type, TYPE_OPTIONS.index(value)`). */
export const ACTION_TYPE_CODES = {
  create: 0,
  update: 1,
  delete: 2,
} as const;

export type ActionType = keyof typeof ACTION_TYPE_CODES;

/** action_type= (action.rb:90-92). */
export function actionTypeCode(type: ActionType): number {
  return ACTION_TYPE_CODES[type];
}

/** action_type reader (action.rb:95-100): `TYPE_OPTIONS[read_attribute]`.
 *  Note the reader returns :draft when the draft flag is set; that flag is a
 *  separate column, so the write path only ever stores the three codes. */
export function actionTypeFromCode(code: number): ActionType | undefined {
  const entry = Object.entries(ACTION_TYPE_CODES).find(([, v]) => v === code);
  return entry?.[0] as ActionType | undefined;
}

/**
 * Decide the action type for a save — Card::Director::All#identify_action
 * (card-1.110.0/lib/card/director/all.rb:19-28):
 *
 *   def identify_action
 *     @action =
 *       if trash && trash_changed?
 *         :delete
 *       elsif new_card?
 *         :create
 *       else
 *         :update
 *       end
 *   end
 *
 * The delete check comes FIRST, so it outranks the create check even for a
 * brand-new record. A "delete" is an update save whose args carry
 * trash: true (card-1.110.0/mod/core/set/all/trash.rb:11-21 and :70-72,
 * add_to_trash), so trash flipping 0 -> 1 is what makes it a delete; trash
 * flipping 1 -> 0 (revival from trash) is an :update, as is trash staying
 * the same.
 */
export function identifyAction(input: {
  trashBefore: SQLBoolean;
  trashAfter: SQLBoolean;
  isNewCard: boolean;
}): ActionType {
  if (input.trashAfter === 1 && input.trashBefore !== input.trashAfter) {
    return "delete";
  }
  if (input.isNewCard) return "create";
  return "update";
}
