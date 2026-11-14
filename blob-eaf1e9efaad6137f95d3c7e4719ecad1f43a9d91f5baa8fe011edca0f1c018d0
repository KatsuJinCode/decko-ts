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

/** The abstract set path "abstract/01_list/events": the card-mod-list
 *  events whose set module is Abstract::List's events submodule.
 *
 *  RUBY. set/abstract/01_list.rb is Abstract::List
 *  (include_set Abstract::Paging + Abstract::Items), and the events live
 *  one file deeper, set/abstract/01_list/events.rb - the submodule
 *  Abstract::List::Events. Ruby's shortname spans pattern + ONE anchor
 *  segment (Card::Set::Helpers#shortname, set/helpers.rb:11-15), so every
 *  abstract/01_list/* file shares the "List" registration bucket, and
 *  `include_set Abstract::List` adds the WHOLE bucket to the host's set
 *  modules (inheritance.rb:39, `add_set_modules
 *  Card::Set.modules[:abstract][set.shortname]`). A card therefore carries
 *  the events submodule exactly when its chain carries Abstract::List -
 *  which, per the GENERATED include graph (set-include-graph.ts, from
 *  tools/oracle/set-include-graph.rb over the loaded Ruby deck), is
 *  thirteen concrete set modules:
 *
 *    Type::List, Type::Pointer, Type::Mod, Type::Session, Type::Skin,
 *    Right::Followers, Right::Status, Self::Mod, Self::RecentSettings,
 *    Self::InputType::Right::ContentOptions,
 *    TypePlusRight::Mod::Script, TypePlusRight::Mod::Style,
 *    TypePlusRight::User::Follow
 *
 *  The port resolves those thirteen memberships by pattern shape, the way
 *  the serving runtime resolves the patterns it already carries (write-routes.ts
 *  setMember): the type sets through the card's type codename, the right
 *  sets through the tag codename, the self sets through the card's own
 *  key, and the three type_plus_right sets through the same left-type +
 *  starred-tag shape typePlusRightSetMember resolves.
 *
 *  NOT WIRED INTO THE SERVING WALK YET (register row 22, 2026-10-25):
 *  the port's boot does not create the mod script input cards Ruby's own
 *  boot creates, so wiring the arm today would refuse site-script edits
 *  on the port's state where the recorded Ruby run answered 303 (the
 *  boot-refresh divergence, measured in the row's receipt
 *  docs/runs/register-rows-roster-batch-2026-10-25/reg-mods-22). Wire
 *  `abstractListEventsSetMember(ctx.driver)` into the serving setMember
 *  when the boot cascade lands. */
const ABSTRACT_LIST_TYPE_CODENAMES: ReadonlySet<string> = new Set([
  "list",
  "pointer",
  "mod",
  "session",
  "skin",
]);
const ABSTRACT_LIST_RIGHT_CODENAMES: ReadonlySet<string> = new Set([
  "followers",
  "status",
]);
const ABSTRACT_LIST_SELF_KEYS: ReadonlySet<string> = new Set([
  DeckoName.parse("*mod").key,
  DeckoName.parse("*recent settings").key,
  // the compound self anchor: set/self/input_type/right/content_options.rb
  DeckoName.parse("input type+*content options").key,
]);
const ABSTRACT_LIST_TYPE_PLUS_RIGHT: ReadonlyArray<readonly [string, string]> = [
  ["mod", "script"],
  ["mod", "style"],
  ["user", "follow"],
];

export function abstractListEventsSetMember(
  driver: SQLDatabaseDriver,
): (
  setPath: string,
  card: { name?: string; id?: number; key?: string; typeId?: number | null },
  event?: string,
) => boolean | Promise<boolean> {
  const typePlusRight = typePlusRightSetMember(driver);
  return (setPath, card, event) => {
    if (setPath !== "abstract/01_list/events") return false;
    // ONLY the validate pair rides the dispatch: add_and_drop_items and
    // insert_item_event are PORTED-BY-WRITE-PATH (card-mod-list.ts's
    // section header) - the route's listItemContent applies their bodies
    // at Ruby's stage position, and the recorded oracle order proves it
    // (Ruby's own trace: check_permissions > add_and_drop_items). Firing
    // the dispatcher's no-op stubs for them would record them at the walk's
    // position, a stage earlier than Ruby's. Their registrations stay (the
    // roster pins them); their membership is the route's.
    if (event !== undefined && event !== "validate_item_type" && event !== "validate_item_uniqueness") {
      return false;
    }
    const name = card.name;
    if (name === undefined || name === "") return false;
    const parsed = DeckoName.parse(name);
    // the self sets: the card IS the anchor card
    if (card.key !== undefined && ABSTRACT_LIST_SELF_KEYS.has(card.key)) return true;
    if (ABSTRACT_LIST_SELF_KEYS.has(parsed.key)) return true;
    // the right sets, the type sets and the type_plus_right sets read rows
    const tagKey = parsed.tagKey;
    return (async () => {
      if (tagKey !== undefined) {
        const tagRow = await driver
          .query<{ codename: string | null }>(
            "SELECT codename FROM cards WHERE key = ? AND trash = 0 LIMIT 1",
            [tagKey],
          )
          .catch(() => undefined);
        const tagCodename = tagRow?.rows[0]?.codename;
        if (tagCodename !== null && tagCodename !== undefined && ABSTRACT_LIST_RIGHT_CODENAMES.has(tagCodename)) {
          return true;
        }
      }
      // the type sets: the save snapshot's type id first (a create carries
      // the assigned type before its row exists - the same priority the
      // serving typeSetMember gives patternTypeId/typeId), the stored row
      // as the fallback
      let typeCodename: string | null | undefined;
      if (card.typeId !== undefined && card.typeId !== null) {
        const row = await driver
          .query<{ codename: string | null }>(
            "SELECT codename FROM cards WHERE id = ? LIMIT 1",
            [card.typeId],
          )
          .catch(() => undefined);
        typeCodename = row?.rows[0]?.codename;
      } else if (card.id !== undefined) {
        const row = await driver
          .query<{ codename: string | null }>(
            "SELECT t.codename AS codename FROM cards c LEFT JOIN cards t ON t.id = c.type_id " +
              "WHERE c.id = ? LIMIT 1",
            [card.id],
          )
          .catch(() => undefined);
        typeCodename = row?.rows[0]?.codename;
      }
      if (typeCodename !== null && typeCodename !== undefined && ABSTRACT_LIST_TYPE_CODENAMES.has(typeCodename)) {
        return true;
      }
      // the three type_plus_right sets
      for (const [typeCodename, rightCodename] of ABSTRACT_LIST_TYPE_PLUS_RIGHT) {
        if (await typePlusRight(`type_plus_right/${typeCodename}/${rightCodename}`, card)) {
          return true;
        }
      }
      return false;
    })();
  };
}
