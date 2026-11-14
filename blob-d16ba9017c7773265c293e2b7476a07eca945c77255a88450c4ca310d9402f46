// The `who_can` walk behind the self-set `_left` marker
// (card-mod-permissions-0.20.0, permission.rb:113-122):
//
//   set/all/permissions.rb:47-49   `who_can action` is
//       `permission_rule_card(action).item_cards.map(&:id)`
//   set/all/permissions.rb:55-61   `permission_rule_id action`: a COMPOUND
//       card whose winning rule for the action says "_left" resolves through
//       `left_permission_rule_id` (permissions.rb:67-71) - the left card's
//       own permission rule, recursively
//   set/all/permissions.rb:73-75   `permission_rule_card action` is
//       `Card.fetch permission_rule_id(action)`; `Card.fetch(nil)` is nil
//   card-mod-collection set/all/item.rb:26-28, 232-234  `item_cards` is
//       `known_item_cards`: `item_names(args).map { Card.fetch name }.compact`
//
// permission.rb:113-122 then does one thing with that list:
//
//   links = ancestor.who_can(task).map do |card_id|
//     link_to_card card_id, nil, target: args[:target]
//   end * ", "
//   "Inherit ( #{links} )"
//   rescue StandardError -> "Inherit"
//
// A non-empty list raises on the first element (`args` is not defined in
// this scope, so NoMethodError, rescued) and the method answers the bare
// "Inherit". An EMPTY list never runs the block and answers "Inherit (  )".
// This module therefore returns only the item COUNT; the marker bytes are
// decided by selfSetInheritText below and nowhere else.

import { DeckoName } from "../name.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import { rawItemStrings } from "../render/pointer-list.js";
import type { RenderEngineLike } from "../render/format.js";

/** What the walk found.
 *  - `absent`: Ruby's `ancestor.who_can(task)` raises before it builds a
 *    list - no ancestor card (`Card[...]` nil -> `nil.who_can`), no
 *    permission rule for the task (`Card.fetch nil` -> `nil.item_cards`),
 *    a `_left` delegation with no left card, or an engine without a fetch
 *    surface. Every one is rescued by permission.rb:120-121 to "Inherit".
 *  - `items`: the rule card resolved; `count` is its item_cards length. */
export type WhoCanOutcome = { kind: "absent" } | { kind: "items"; count: number };

/** Recursion cap for the `_left` delegation. Each hop drops one name part, so
 *  the chain strictly shrinks; the cap is paranoia, not the termination
 *  argument (read-rules.ts LEFT_DELEGATION_MAX_DEPTH records the same). */
const LEFT_DELEGATION_MAX_DEPTH = 16;

/** permissions.rb:56 `rule(action).match?(/^\[?\[?_left\]?\]?$/)` - the bare
 *  reference and its single/double-bracket forms, Ruby line anchors. */
const LEFT_DELEGATION_CONTENT = /^\[?\[?_left\]?\]?$/m;

/** item.rb:232-234 `known_item_cards`: the stored item strings, blanks
 *  removed by `.compact` (an empty line names no card). */
function itemCount(dbContent: string): number {
  return rawItemStrings(dbContent).filter((item) => item.length > 0).length;
}

/** One permission rule lookup for `task` on a card (permissions.rb:55-61
 *  `rule_card_id` via the candidate walk, `ruleNamesForCard` in pattern
 *  precedence). The first candidate the engine can fetch wins. */
function ruleCardFor(
  engine: RenderEngineLike,
  input: PatternCardInput,
  task: string,
): { content: string } | undefined {
  for (const candidate of ruleNamesForCard(input, `*${task}`)) {
    const rule = engine.fetchRenderCard(candidate);
    if (rule !== undefined) return { content: rule.dbContent };
  }
  return undefined;
}

/** `who_can task` for the ancestor named `ancestorName` (permission.rb:
 *  115-116, `Card[@set_context.trunk_name.trunk_name]`). */
export function whoCanItemCount(
  engine: RenderEngineLike | undefined,
  ancestorName: DeckoName,
  task: string,
): WhoCanOutcome {
  if (engine === undefined) return { kind: "absent" };
  const ancestor = engine.fetchRenderCard(ancestorName.s);
  if (ancestor === undefined) return { kind: "absent" };
  const input: PatternCardInput = {
    name: ancestor.name.s,
    id: ancestor.id,
    typeId: ancestor.typeId,
    typeName: ancestor.typeName,
  };
  return walk(engine, input, ancestor.name, task, 0);
}

function walk(
  engine: RenderEngineLike,
  input: PatternCardInput,
  name: DeckoName,
  task: string,
  depth: number,
): WhoCanOutcome {
  const rule = ruleCardFor(engine, input, task);
  if (rule === undefined) return { kind: "absent" };
  // permissions.rb:56-58: a compound card whose winning rule delegates reads
  // through its left card (left_permission_rule_id, :67-71). The :create ->
  // :update adjustment there does not change which rule card the walk ends
  // on, so the hop keeps the task. A `_left` rule on a simple card is not a
  // delegation (Ruby only takes the branch for `compound?`).
  if (depth < LEFT_DELEGATION_MAX_DEPTH && name.isCompound && LEFT_DELEGATION_CONTENT.test(rule.content)) {
    const leftName = name.leftName;
    if (leftName === undefined) return { kind: "absent" };
    // permissions.rb:68 `left_or_new(skip_virtual: true, skip_modules: true)`:
    // the stored left, or a new card carrying only its name (no type, so the
    // *type candidates are absent from its walk).
    const left = engine.fetchRenderCard(leftName.s);
    const leftInput: PatternCardInput =
      left === undefined
        ? { name: leftName.s, id: undefined, isNew: true }
        : { name: left.name.s, id: left.id, typeId: left.typeId, typeName: left.typeName };
    return walk(engine, leftInput, leftName, task, depth + 1);
  }
  return { kind: "items", count: itemCount(rule.content) };
}

/** The bytes of the self-set branch's inner text (permission.rb:113-122).
 *  Only an EMPTY item list reaches the paren form; every other outcome is
 *  the rescued "Inherit". The span wrapper is the caller's. */
export function selfSetInheritText(outcome: WhoCanOutcome): string {
  if (outcome.kind === "items" && outcome.count === 0) return "Inherit (  )";
  return "Inherit";
}
