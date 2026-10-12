// REGRESSION TEST for the administrator always_ok? codename lookup.
//
// The bug this pins: read-rules.ts resolved the always_ok? bot by the
// codename "deckobot", but Ruby decks store the bot's codename as
// "decko_bot" (card-1.110.0 mod/core/data/real.yml:17-19 — name
// "Decko Bot", codename decko_bot; recode.yml:8 records the qagn_bot →
// decko_bot rename). Ruby never looks the codename up by an alternate
// spelling: codename.rb:107-110 derives the constant FROM the stored
// codename — `Card.const_get_or_set("#{codename.to_s.camelize}ID")` —
// and auth/permissions.rb:8-13 short-circuits on that constant
// (`when DeckoBotID then true`). With the wrong constant the engine's
// bot actor lost the short-circuit and was denied owner-only cards:
// an owner-only *self+*read rule granting one member must still let the
// admin read it via always_ok? — the fixed engine must.
//
// Owner-only deck shape: a *self+*read rule
// whose content references ONE member, plus the bot card under
// Ruby's stored codename.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  canReadByStoredRule,
  readPermissionStatements,
  readPermissionStateFromViewerResults,
  type ReadViewer,
} from "../../../src/card/permissions/index.js";

const BOT_ID = 1;
const OWNER_ID = 583;
const OWNER_ONLY_READ_RULE_ID = 41;

/** ActiveSupport String#camelize, the derivation step of codename.rb:107-110
 *  ("#{codename.to_s.camelize}ID"): underscored codenames camelize their
 *  segments, so the STORED codename alone decides the constant name. */
function camelize(term: string): string {
  return term
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

let storage: RenderTestStorage | undefined;

async function stateFor(viewer: ReadViewer) {
  const results = await storage!.counting.batch(readPermissionStatements(viewer));
  return readPermissionStateFromViewerResults(results, viewer);
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // The deck's system cards, including the bot under RUBY'S codename.
  await seedCard(s, { id: 5, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 6, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*read", codename: "read" });
  await seedCard(s, { id: 16, name: "*self", codename: "self" });
  // An owner-only read rule: "*self+*read" on one card granting the owner
  // alone. The
  // rule hangs off the *self SET card (left, Set-typed — the ReadRuleCache
  // join's sets.type_id filter), right_id the *read setting.
  await seedCard(s, {
    id: 16564,
    name: "The Red Book considered+*self",
    leftId: 16563,
    rightId: 16,
    typeId: 2,
  });
  await seedCard(s, {
    id: OWNER_ONLY_READ_RULE_ID,
    name: "The Red Book considered+*self+*read",
    leftId: 16564,
    rightId: 3,
    dbContent: `[[the owner]]`,
  });
  await seedReference(s, OWNER_ONLY_READ_RULE_ID, OWNER_ID, "the_owner");
  await seedCard(s, {
    id: 16563,
    name: "The Red Book considered",
    readRuleId: OWNER_ONLY_READ_RULE_ID,
  });
  await seedCard(s, { id: OWNER_ID, name: "the owner" });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("decko_bot codename: the admin always_ok? short-circuit (regression)", () => {
  it("camelize derives DeckoBotID's spelling from the STORED codename (codename.rb:107-110)", () => {
    expect(camelize("decko_bot")).toBe("DeckoBot");
    expect(camelize("anonymous")).toBe("Anonymous");
  });

  it("the statement batch matches decks on Ruby's stored codename decko_bot", () => {
    const sql = readPermissionStatements({ signedIn: true, actorId: BOT_ID })[0]!.sql;
    expect(sql).toContain("'decko_bot'");
  });

  it("the bot actor (codename decko_bot, id 1) gets always_ok? (permissions.rb:9)", async () => {
    const state = await stateFor({ signedIn: true, actorId: BOT_ID });
    expect(state.alwaysOk).toBe(true);
  });

  it("the admin verdict on an owner-only card is ALLOW (the Red Book admin miss)", async () => {
    const state = await stateFor({ signedIn: true, actorId: BOT_ID });
    // canReadByStoredRule short-circuits on alwaysOk before the readable-set
    // lookup (permissions.rb:140 -> read-rules.ts canReadByStoredRule) — the
    // owner-only rule grants the owner, never the bot, and the bot still
    // reads: the short-circuit must hold regardless of the rule's grants.
    expect(canReadByStoredRule(OWNER_ONLY_READ_RULE_ID, state)).toBe(true);
  });

  it("a non-bot actor on the same owner-only card is still judged by the rule", async () => {
    const owner = await stateFor({ signedIn: true, actorId: OWNER_ID });
    expect(owner.alwaysOk).toBe(false);
    expect(canReadByStoredRule(OWNER_ONLY_READ_RULE_ID, owner)).toBe(true);
    // A signed-in non-granted member, for contrast.
    const other = await stateFor({ signedIn: true, actorId: 665 });
    expect(other.alwaysOk).toBe(false);
    expect(canReadByStoredRule(OWNER_ONLY_READ_RULE_ID, other)).toBe(false);
  });

  it("a deck without the codename yields no always_ok (the silent pre-fix state, named)", async () => {
    // The bug's failure surface: a bot id the codename lookup misses gets
    // rule-based verdicts — allowed ONLY where its parties' grants reach.
    const results = await storage!.counting.batch(
      readPermissionStatements({ signedIn: true, actorId: 999 }),
    );
    const state = readPermissionStateFromViewerResults(results, {
      signedIn: true,
      actorId: 999,
    });
    expect(state.alwaysOk).toBe(false);
  });
});
