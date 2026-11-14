// The follow-rule create's trunk-part permission fold, both modes
// (DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL, actions/card-action-engine.ts
// the verdict-true walk):
//
//   default (off)  the member's own follow-rule create LANDS even where a
//                  part it materializes would deny - the port's recorded
//                  divergence, and the behavior the whole-family exercise's
//                  follow family is graded on (its content-flows module read
//                  18/25 with the fold armed against the base tip's 25/25 on
//                  2026-10-27: the armed fold refused the member's own
//                  follow-section write with the part-named 422, the rule
//                  never landed, and no follower notice could send).
//   strict (on)    the reference's answer: the save walks the parts the
//                  create materializes and refuses with the part-named
//                  permission_denied under the errors-view class, applying
//                  nothing (subcards/all.rb:65-80 handle_subcard_errors; the
//                  2026-10-27 VM oracle probe: GET
//                  /update/Topic_009+*self+Mira_Member+*follow as the member
//                  answers 422 and applies nothing).
//
// The fixture pins the shape the exercise hit: the set part "Topic 009+*self"
// has no cards row (the family deck's *self set cards are not materialized),
// and the closest *create rule over the left part names a party that is not
// the actor, so the side's own create verdict denies while the act's own
// Right::Follow preference permit (the actor's own rule) passes.

import { describe, expect, it, afterEach } from "vitest";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { Actor, CardActionError } from "../../../src/card/actions/types.js";
import { configureStrictParity } from "../../../src/card/parity/strict-parity-flags.js";
import {
  actionEngine,
  createActionsTestStorage,
  CARDTYPE_ID,
  seedCard,
  seedReference,
  seedStandardDeck,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "./actions-test-storage.js";

// The acting member: its own card row carries the User type, so the follow
// preference arm's preferer (the rule's second-from-last part) is the signed
// in actor. The id sits above the standard fixture's auto-assigned rowids.
const MEMBER: Actor = { id: 60, name: "Follow Member" };

const ids = {
  setting: 1500,
  user: 1501,
  follow: 1502,
  self: 1503,
  topic: 1510,
  admin: 1511,
  topicUpdateRule: 1512,
  sideCreateRule: 1513,
} as const;

let storage: ActionsTestStorage;

async function boot(): Promise<void> {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const card = (o: Parameters<typeof seedCard>[1]) => seedCard(storage, o);
  // The codename cards the follow permit resolves: Setting (the *follow
  // card's type), User (the preferer's type), *follow itself, and the *self
  // pattern card the set part resolves through.
  await card({ id: ids.setting, name: "Setting", codename: "setting", typeId: CARDTYPE_ID });
  await card({ id: ids.user, name: "User", codename: "user", typeId: CARDTYPE_ID });
  await card({ id: ids.follow, name: "*follow", codename: "follow", typeId: ids.setting });
  await card({ id: ids.self, name: "*self", codename: "self", typeId: SET_TYPE_ID });
  // The acting member's own card, so the preference arm's preferer is the
  // signed-in actor.
  await card({ id: MEMBER.id, name: MEMBER.name, typeId: ids.user });
  // The watched card and the party that may touch it: the closest *update
  // rule over the card names Parity Admin alone, so a side walking the card
  // denies the member.
  await card({ id: ids.topic, name: "Topic 009", dbContent: "the watched card" });
  await card({ id: ids.admin, name: "Parity Admin", typeId: ids.user });
  await card({
    id: ids.topicUpdateRule,
    name: "Topic 009+*update",
    leftId: ids.topic,
    rightId: 302,
    typeId: SET_TYPE_ID,
    dbContent: "[[Parity Admin]]",
  });
  await seedReference(storage, ids.topicUpdateRule, ids.admin, "parity admin");
  // The deck's global create rule names a party that is not the member -
  // the family deck's own shape (its *all+*create is restricted), and the
  // reason the compound side's own create verdict denies the member while
  // the act's own preference permit (the member's own rule) passes. No
  // closer *create rule matches the compound side, so this is the
  // governing rule for it.
  await storage.driver.query("UPDATE cards SET db_content = '[[Parity Admin]]' WHERE id = 305", []);
  await storage.driver.query("DELETE FROM card_references WHERE referee_id = 304 AND referer_id = 305", []);
  await seedReference(storage, 305, ids.admin, "parity admin");
}

/** The follow rule's row, when it exists: the only card whose right part is
 *  *follow (the *follow codename card itself carries no right_id). */
async function ruleRow(): Promise<Record<string, unknown> | undefined> {
  return await storage.selectOne(
    "SELECT id, trash FROM cards WHERE right_id = ? AND id != ?",
    [ids.follow, ids.follow],
  );
}

afterEach(() => {
  configureStrictParity(undefined);
  storage?.close();
  storage = undefined as unknown as ActionsTestStorage;
});

describe("the follow-rule create's trunk-part permission fold", () => {
  it("default: the member's own follow-rule create lands where a materialized part would deny", async () => {
    await boot();
    configureStrictParity({
      signinDetailedErrors: false,
      revisionRestore500: false,
      skinCreate500: false,
      scriptBundleClockNames: false,
      mailUnfollowRefusal: false,
    });
    const result = await actionEngine(storage, MEMBER).createCard({
      name: "Topic 009+*self+Follow Member+*follow",
      content: "[[*always]]",
    });
    expect(result).toBeDefined();
    const row = await ruleRow();
    expect(row).toBeDefined();
    expect(row?.trash).toBe(0);
  });

  it("strict: the save folds the denied part into the part-named 422 and applies nothing", async () => {
    await boot();
    configureStrictParity({
      signinDetailedErrors: false,
      revisionRestore500: false,
      skinCreate500: false,
      scriptBundleClockNames: false,
      mailUnfollowRefusal: true,
    });
    let error: CardActionError | undefined;
    try {
      await actionEngine(storage, MEMBER).createCard({
        name: "Topic 009+*self+Follow Member+*follow",
        content: "[[*always]]",
      });
    } catch (e) {
      error = e as CardActionError;
    }
    expect(error).toBeDefined();
    const folded = error as unknown as { userMessage?: string; errorsByAttribute?: Record<string, string> };
    // The part-named alert bytes (the reference's handle_subcard_errors
    // shape): "<PART NAME UP>: permission_denied You don't have permission
    // to create <part name>".
    expect(folded.userMessage).toBe(
      "TOPIC 009+*SELF+FOLLOW MEMBER: permission_denied You don't have permission to create Topic 009+*self+Follow Member",
    );
    expect(folded.errorsByAttribute).toEqual({
      "topic 009+*self+follow member": "permission_denied You don't have permission to create Topic 009+*self+Follow Member",
    });
    // Nothing applied: no rule row, in any trash state.
    expect(await ruleRow()).toBeUndefined();
  });
});
