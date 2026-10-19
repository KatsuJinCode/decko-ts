// Set membership for the mod-event execution seam's scoped events
// (mod-event-dispatch.ts setConditionApplies): the patterns the default
// composition cannot answer from a card's own type id alone.
//
// type_plus_right (mod/core/set_pattern/08_type_plus_right.rb): the set
// cards "Left Type Name+*right_tag" — "All +<tag> cards on <type> cards"
// (the pattern's label). compound_only: true, anchor_parts_count: 2. A card
// matches set path "type_plus_right/<type-codename>/<right-codename>" when
// its name is a junction whose LAST part's key is the starred right anchor
// ("<right-codename>" is the codename of the starred setting card) and
// whose name-minus-last-part row carries the <type-codename> type.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { DeckoName } from "../name.js";

export type ModEventSetMember = (
  setPath: string,
  card: { name?: string; id?: number },
) => boolean | Promise<boolean>;

/** The right pattern (mod/core/set_pattern/07_right.rb): the set cards
 *  "*<right-name" — all "+<right-name>" cards. A card matches set path
 *  "right/<right-codename>" when its name is a junction whose LAST part's
 *  key names the card whose codename is <right-codename> (the anchor is
 *  resolved through the codename table — the same resolution the serving
 *  runtime's enabled_roles case performs, generalized; card names' keys are
 *  normalized through the port's key function, so the anchor rides the
 *  codename, not a raw key comparison). */
export function rightSetMember(driver: SQLDatabaseDriver): ModEventSetMember {
  return (setPath, card) => {
    const match = /^right\/([^/]+)$/.exec(setPath);
    if (match === null) return false;
    const name = card.name;
    if (name === undefined || !name.includes("+")) return false;
    const tagKey = DeckoName.parse(name).tagKey;
    return (async () => {
      const tagRow = await driver
        .query<{ codename: string | null }>(
          "SELECT codename FROM cards WHERE key = ? AND trash = 0 LIMIT 1",
          [tagKey],
        )
        .catch(() => undefined);
      return tagRow?.rows[0]?.codename === match[1];
    })();
  };
}

export function typePlusRightSetMember(driver: SQLDatabaseDriver): ModEventSetMember {
  return (setPath, card) => {
    const match = /^type_plus_right\/([^/]+)\/([^/]+)$/.exec(setPath);
    if (match === null) return false;
    const name = card.name;
    if (name === undefined || !name.includes("+")) return false; // compound_only
    const parsed = DeckoName.parse(name);
    const left = parsed.leftName;
    if (left === undefined) return false;
    // the set card's tag is the STARRED setting name ("Bootswatch Skin+*colors"),
    // matched by KEY equality (Ruby Pattern#match) — both sides through the
    // port's key function (name.ts), the same relation Ruby compares in its
    // own key space.
    const expectedTagKey = DeckoName.parse(`*${match[2]}`).key;
    if (parsed.tagKey !== expectedTagKey) return false;
    const leftKey = left.key;
    return (async () => {
      const leftRow = await driver
        .query<{ type_id: number | null }>(
          "SELECT type_id FROM cards WHERE key = ? AND trash = 0 LIMIT 1",
          [leftKey],
        )
        .catch(() => undefined);
      const typeId = leftRow?.rows[0]?.type_id;
      if (typeId === undefined || typeId === null) return false;
      const typeCodename = await driver
        .query<{ codename: string | null }>(
          "SELECT codename FROM cards WHERE id = ? LIMIT 1",
          [typeId],
        )
        .catch(() => undefined);
      return typeCodename?.rows[0]?.codename === match[1];
    })();
  };
}
