// List content standardization: what Ruby Decko stores when content is
// assigned to a card in a list set.
//
// Ruby trail:
// - prepare_assignment_params (card-1.110.0 mod/core/set/all/
//   assign_attributes.rb:35-39) runs `standardize_content` on assigned
//   db_content.
// - Abstract::List#standardize_content (card-mod-list-0.20.0 set/abstract/
//   01_list.rb:19-22): `item_strings(content: value)`, then the base
//   standardize_content (lib/card/content/all.rb:22-24), which turns the
//   array into `items_content(array)`.
// - item_strings -> raw_item_strings (card-mod-collection-0.20.0 set/all/
//   item.rb:201-203): split on /\n+/, each item stripped of every "[[" and
//   "]]" and of surrounding whitespace (strip_item, :270-272).
// - items_content -> standardized_items (set/all/item_assignment.rb:69-77):
//   each item through standardize_item (`Card::Name[item]`, which resolves
//   "~<id>" and ":<codename>" marks to names and leaves an unresolvable
//   mark as it was), blanks dropped, then Array#to_pointer_content
//   (config/initializers/01_core_extensions/array.rb:4-12): items joined
//   with "\n".
//
// The list sets (sets that include Abstract::List): type Pointer, type
// List, type Mod; right *status and *followers; type-plus-right User+*follow;
// the self sets of *recent settings and the Mod card (references only:
// assigned content of those two cards is not standardized).

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { DeckoName } from "../name.js";
import {
  CARD_CODENAME_TRIPLE_BY_ID_SQL,
  CARD_TYPE_CODENAME_BY_ID_SQL,
} from "../fetch/card-read-shapes.js";

/** Type codenames whose cards include Abstract::List. Skin is one:
 *  card-mod-style set/type/skin.rb includes Abstract::List, so a skin's
 *  references come from its content lines as items (the side-effects
 *  parity receipt: admin-create-old-skin, Ruby card_references+2). */
export const LIST_TYPE_CODENAMES: ReadonlySet<string> = new Set(["pointer", "list", "mod", "skin"]);
/** Codenamed cards whose own (self) sets include Abstract::List:
 *  *recent settings (card-mod-rules set/self/recent_settings.rb) and the
 *  Mod card (card-1.110.0 mod/core set/self/mod.rb). */
export const LIST_SELF_CODENAMES: ReadonlySet<string> = new Set(["recent_settings", "mod"]);
/** Right codenames whose cards include Abstract::List. */
export const LIST_RIGHT_CODENAMES: ReadonlySet<string> = new Set(["status", "followers"]);

const ID_MARK = /^~(\d+)$/;
const CODENAME_MARK = /^:(\w+)$/;

/** How an item's "~<id>" / ":<codename>" mark resolves to a name. */
export interface ListItemResolver {
  nameForId(id: number): Promise<string | undefined>;
  nameForCodename(codename: string): Promise<string | undefined>;
}

/** Card::Name[item] for one item part: marks resolve, anything else stays. */
async function standardizePart(part: string, resolve: ListItemResolver): Promise<string> {
  const id = ID_MARK.exec(part);
  if (id !== null) return (await resolve.nameForId(Number(id[1]))) ?? part;
  const code = CODENAME_MARK.exec(part);
  if (code !== null) return (await resolve.nameForCodename(code[1])) ?? part;
  return part;
}

/** standardize_item (item_assignment.rb:79-83): Card::Name[item]. A
 *  compound item resolves each part (Card::Name.new_from_compound_string);
 *  a part that cannot resolve leaves the whole item as it was (the
 *  NotFound rescue). */
async function standardizeItem(item: string, resolve: ListItemResolver): Promise<string> {
  if (!item.includes("+")) return standardizePart(item, resolve);
  const parts = item.split("+").map((p) => p.trim());
  const out: string[] = [];
  for (const part of parts) {
    const std = await standardizePart(part, resolve);
    if ((ID_MARK.test(part) || CODENAME_MARK.test(part)) && std === part) return item;
    out.push(std);
  }
  return out.join("+");
}

/** Whether a stored card is in a list set, read from its row: its type's
 *  codename, its right part's codename, and for +*follow and +*members its
 *  left part's type (the set rules above). Role+*members is an id list
 *  (Abstract::IdList, card-mod-account set/type_plus_right/role/members.rb)
 *  by its set, whatever its own type: a deck with no *type plus right rule
 *  types it Basic, and its references must still come from its items. */
export async function isListCard(driver: SQLDatabaseDriver, cardId: number): Promise<boolean> {
  const row = (
    await driver.query<{
      own_code: string | null;
      type_code: string | null;
      right_code: string | null;
      left_type_code: string | null;
    }>(CARD_CODENAME_TRIPLE_BY_ID_SQL, [cardId])
  ).rows[0];
  if (row === undefined) return false;
  if (row.own_code !== null && LIST_SELF_CODENAMES.has(row.own_code)) return true;
  if (row.type_code !== null && LIST_TYPE_CODENAMES.has(row.type_code)) return true;
  if (row.right_code !== null && LIST_RIGHT_CODENAMES.has(row.right_code)) return true;
  if (row.right_code === "members" && row.left_type_code === "role") return true;
  return row.right_code === "follow" && row.left_type_code === "user";
}

/**
 * THE LIST CARD'S TWO SHAPES, DECLARED: the card's own codename triple and
 * its type's codename, read TOGETHER.
 *
 * WHY. The reference walk reads both, back to back, for every card it
 * visits: it asks whether the card is a list card (the codename triple) and
 * then asks whether its type is the cardtype or the search type (the type's
 * codename). Each read is its own pipeline POST, because the engine awaits
 * every answer before it issues the next statement, so the pair cost two
 * round trips for one card.
 *
 * THE DECLARATION IS A SPECULATION, and it is the house's: one batch carries
 * both statements, and the driver's read memo hands the answers to the
 * readers that ask for them afterwards (the memo's invalidation rules still
 * apply, so a write that lands in between drops the answer and the reader
 * goes to the wire, exactly as it would have without the declaration). So
 * the declaration changes the NUMBER of round trips, never the ANSWERS.
 *
 * WHY THE SEAM IS HERE. The walked card's id is known here and nowhere
 * earlier: the walk learns the card from the card it is walking out of, so
 * this is the first point at which the two shapes' arguments are known.
 */
export async function declareListCardShapes(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<void> {
  await driver.batch([
    { sql: CARD_CODENAME_TRIPLE_BY_ID_SQL, params: [cardId] },
    { sql: CARD_TYPE_CODENAME_BY_ID_SQL, params: [cardId] },
  ]);
}

/** raw_item_strings (item.rb:201-203): the stored items of list content. */
export function listItemStrings(content: string | null | undefined): string[] {
  if (content === null || content === undefined || content === "") return [];
  return content
    .split(/\n+/)
    .map((i) => i.replace(/\[\[|\]\]/g, "").trim())
    .filter((i) => i !== "");
}

/** Abstract::List#swap_names (01_list.rb:28-36): each item swapped by name
 *  (marks "~id"/":code" left alone), then stored through standardize_content
 *  (an Array: items joined with "\n"). */
export function swapListItems(
  content: string | null | undefined,
  oldName: DeckoName,
  newName: DeckoName,
): string {
  const raw = (content ?? "").split(/\n+/).map((i) => i.replace(/\[\[|\]\]/g, "").trim());
  return raw
    .map((item) => (/^[:~]/.test(item) || item === "" ? item : DeckoName.parse(item).swap(oldName, newName).s))
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .join("\n");
}

/** Abstract::IdList (card-mod-list-0.20.0 set/abstract/id_list.rb:3-10):
 *  each item is stored as "~<id>" of the card it names; an item naming no
 *  card is dropped. Used by Role+*members (card-mod-account
 *  set/type_plus_right/role/members.rb). */
export async function standardizeIdListContent(
  content: string,
  idFor: (item: string) => Promise<number | undefined>,
): Promise<string> {
  const out: string[] = [];
  for (const item of listItemStrings(content)) {
    const mark = ID_MARK.exec(item);
    const id = mark !== null ? Number(mark[1]) : await idFor(item);
    if (id !== undefined) out.push(`~${id}`);
  }
  return out.join("\n");
}

/** The id an "~<id>" item names, else undefined. */
export function idMarkOf(item: string): number | undefined {
  const mark = ID_MARK.exec(item);
  return mark === null ? undefined : Number(mark[1]);
}

/** Abstract::List#standardize_content for a string value. */
export async function standardizeListContent(
  content: string,
  resolve: ListItemResolver,
): Promise<string> {
  const items = content.split(/\n+/).map((i) => i.replace(/\[\[|\]\]/g, "").trim());
  const out: string[] = [];
  for (const item of items) {
    const std = (await standardizeItem(item, resolve)).trim();
    if (std !== "") out.push(std);
  }
  return out.join("\n");
}
