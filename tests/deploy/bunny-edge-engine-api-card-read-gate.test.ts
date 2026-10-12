// The Bunny edge engine request core's /api/card/<name> READ GATE
// (deploy/bunny-worker-src/bunny-edge-engine-request.ts). The JSON branch
// previously served db_content_preview for ANY existing card, bypassing the
// read rule the render path enforces: a *self-read-restricted card rendered
// its denial span while /api/card/<name> returned its restricted body to an
// anonymous request. The gate runs the SAME anonymous verdict the render
// path enforces (RenderEngine's default viewer, src/card/render.ts:419-421)
// BEFORE the response body is built: canReadByStoredRule on the stored
// cards.read_rule_id, canReadByRuleLookup (the runtime walk) for rows
// without one. A denial answers 403 with no content fields.
//
// Driven through the REAL handler over the in-memory sqlite deck
// (tests/card/render/render-test-storage.js), so the pin covers the full
// production chain: resolveAnonymousReadPermission's statements, the stored
// read_rule_id lookup, the walk (including its *type candidate, which needs
// the type NAME the gate fetches by typeId), and the response shapes.
//
// Deck shape mirrors the seeding idiom of
// tests/card/permissions/decko-bot-codename-always-ok-regression.test.ts
// (set junction → rule junction → seedReference to the granted party →
// private card carrying the rule id).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const ALL_READ_RULE_ID = 100;
const SECRET_READ_RULE_ID = 101;
const JOURNAL_TYPE_READ_RULE_ID = 105;

async function seedRuleUniverse(storage: RenderTestStorage): Promise<void> {
  // Parties the anonymous resolution reads by codename (AnyoneID /
  // AnonymousID derive from the stored codenames).
  await seedCard(storage, { id: 2, name: "Set", codename: "set" });
  await seedCard(storage, { id: 8, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "Anonymous", codename: "anonymous", typeId: 2 });
  // Setting + set-pattern cards the rule junctions hang off.
  await seedCard(storage, { id: 3, name: "*read", codename: "read", typeId: 2 });
  await seedCard(storage, { id: 16, name: "*self", codename: "self", typeId: 2 });
  await seedCard(storage, { id: 17, name: "*type", codename: "type", typeId: 2 });
  await seedCard(storage, { id: 20, name: "*all", codename: "all", typeId: 2 });
  // The catch-all read rule grants Anyone (the real deck's bootstrap shape):
  // anonymous reads through it, and it makes the deck COMPLETE for the walk.
  await seedCard(storage, {
    id: ALL_READ_RULE_ID,
    name: "*all+*read",
    leftId: 20,
    rightId: 3,
    dbContent: "[[Anyone]]",
  });
  await seedReference(storage, ALL_READ_RULE_ID, 8, "anyone");
  // An owner-only *self read rule (the decko-bot test's Red Book shape):
  // stored rule id on the private card, denies anonymous via the readable
  // set (the rule grants only "the owner").
  await seedCard(storage, {
    id: 102,
    name: "Secret Journal+*self",
    leftId: 103,
    rightId: 16,
    typeId: 2,
  });
  await seedCard(storage, {
    id: SECRET_READ_RULE_ID,
    name: "Secret Journal+*self+*read",
    leftId: 102,
    rightId: 3,
    dbContent: "[[the owner]]",
  });
  await seedReference(storage, SECRET_READ_RULE_ID, 583, "the_owner");
  await seedCard(storage, { id: 583, name: "the owner", typeId: 2 });
  await seedCard(storage, {
    id: 103,
    name: "Secret Journal",
    readRuleId: SECRET_READ_RULE_ID,
    readRuleClass: "*self",
    dbContent: "TOPSECRET-CONTENT",
    typeId: 2,
  });
  // A *type-scoped owner-only read rule for the WALK case: the type-junction
  // rule EXISTS, so the walk resolves it ahead of the catch-all, and it does
  // not grant anonymous — the fail-closed direction.
  await seedCard(storage, { id: 104, name: "Journal", typeId: 2 });
  await seedCard(storage, {
    id: 106,
    name: "Journal+*type",
    leftId: 107,
    rightId: 17,
    typeId: 2,
  });
  await seedCard(storage, {
    id: JOURNAL_TYPE_READ_RULE_ID,
    name: "Journal+*type+*read",
    leftId: 106,
    rightId: 3,
    dbContent: "[[the owner]]",
  });
  await seedReference(storage, JOURNAL_TYPE_READ_RULE_ID, 583, "the_owner");
  await seedCard(storage, {
    id: 107,
    name: "Walk Deny Journal",
    typeId: 104,
    readRuleId: null,
    dbContent: "WALKDENY-CONTENT",
  });
  // A NULL-rule card the WALK allows (falls through to the catch-all): the
  // no-over-deny direction.
  await seedCard(storage, {
    id: 108,
    name: "Public Walk Note",
    typeId: 2,
    readRuleId: null,
    dbContent: "PUBLICWALK-CONTENT",
  });
  // The stored-rule ALLOW case: readable through the catch-all id.
  await seedCard(storage, {
    id: 109,
    name: "Home",
    readRuleId: ALL_READ_RULE_ID,
    readRuleClass: "*all",
    dbContent: "hello world",
    typeId: 2,
  });
}

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

function realDeck(storage: RenderTestStorage) {
  return { fetcher: storage.fetcher, render: storage.engine };
}

describe("bunny edge engine /api/card read gate (the api-leak fix)", () => {
  it("a read-denied card answers 403 with NO preview and NO content text", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedRuleUniverse(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/Secret%20Journal"),
        realDeck(storage),
      );
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain("permission denied"); // unified contract: the CF worker's cardRecordJson shape (deploy/worker.ts:469-492)
      expect(body).not.toContain("db_content_preview");
      expect(body).not.toContain("TOPSECRET-CONTENT");
    } finally {
      storage.close();
    }
  });

  it("a readable stored-rule card still answers 200 WITH its preview", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedRuleUniverse(storage);
      const res = await handleEngineRequest(edgeGet("/api/card/Home"), realDeck(storage));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("db_content_preview");
      expect(body).toContain("hello world");
    } finally {
      storage.close();
    }
  });

  it("a stored-rule-less card whose live walk resolves a denying rule fails closed (403, no content)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedRuleUniverse(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/Walk%20Deny%20Journal"),
        realDeck(storage),
      );
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).not.toContain("db_content_preview");
      expect(body).not.toContain("WALKDENY-CONTENT");
    } finally {
      storage.close();
    }
  });

  it("a stored-rule-less card the walk resolves through the catch-all still reads (200, no over-deny)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedRuleUniverse(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/Public%20Walk%20Note"),
        realDeck(storage),
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("db_content_preview");
      expect(body).toContain("PUBLICWALK-CONTENT");
    } finally {
      storage.close();
    }
  });

  it("a missing card stays a 404 through the same branch", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedRuleUniverse(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/NoSuchCard"),
        realDeck(storage),
      );
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("card not found");
    } finally {
      storage.close();
    }
  });
});
