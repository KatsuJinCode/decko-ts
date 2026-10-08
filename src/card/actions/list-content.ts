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

/** Type codenames whose cards include Abstract::List. */
export const LIST_TYPE_CODENAMES: ReadonlySet<string> = new Set(["pointer", "list", "mod"]);
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
    }>(
      `SELECT c.codename AS own_code, t.codename AS type_code, r.codename AS right_code, lt.codename AS left_type_code
       FROM cards c
       LEFT JOIN cards t ON t.id = c.type_id
       LEFT JOIN cards r ON r.id = c.right_id
       LEFT JOIN cards l ON l.id = c.left_id
       LEFT JOIN cards lt ON lt.id = l.type_id
       WHERE c.id = ?`,
      [cardId],
    )
  ).rows[0];
  if (row === undefined) return false;
  if (row.own_code !== null && LIST_SELF_CODENAMES.has(row.own_code)) return true;
  if (row.type_code !== null && LIST_TYPE_CODENAMES.has(row.type_code)) return true;
  if (row.right_code !== null && LIST_RIGHT_CODENAMES.has(row.right_code)) return true;
  if (row.right_code === "members" && row.left_type_code === "role") return true;
  return row.right_code === "follow" && row.left_type_code === "user";
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
