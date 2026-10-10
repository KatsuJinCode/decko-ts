// Pin for the bunny edge engine request core's /api/card/<name> read gate
// (deploy/bunny-worker-src/bunny-edge-engine-request.ts, the api-leak-fix
// lane, 2026-10-02).
//
// THE HOLE: the route answered fetchByName directly and returned
// db_content_preview — 200 JSON carrying the card's stored content — for
// cards the HTML render path DENIES (the quiet denial span replaces the
// whole view). Verified live on the deployed edge: GET /api/card/Taking%20Stock
// answered 200 with 200 chars of the denied card's content while
// GET /Taking%20Stock rendered "Sorry, you don't have permission (read)".
//
// THE CONTRACT (the CF worker's record-JSON route, the same hole closed
// there first): deploy/worker.ts cardRecordJson:469-492 — a missing card is
// 404 {"error":"card not found"}; a card the viewer cannot read is
// 403 {"error":"permission denied"} with no protected fields; the verdict
// comes from RenderEngine#canReadCard, the same engine state the HTML path
// judges with (the non-HTML-entry permission seam, src/card/render.ts).
//
// Driven through the REAL handler + REAL RenderEngine/FetchEngine over an
// in-memory sqlite deck, with the read-rule deck shape the anonymous-viewer
// permission suite (tests/card/permissions/read-permission.test.ts)
// establishes: a stored-rule denial (*all+*read -> Anyone readable;
// Basic+*type+*read -> Role A denied for Anonymous), a stored-rule
// allowance, a missing card, and the live-walk denial (no stored
// read_rule_id; the rule walk finds the *type rule first -> denied).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const SET_TYPE_ID = 2;
const BASIC_TYPE_ID = 4;

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

/** The entry's deck shape, real engines over the in-memory sqlite deck. */
function realDeck(storage: RenderTestStorage) {
  return { fetcher: storage.fetcher, render: storage.engine };
}

async function seedPermissionDeck(s: RenderTestStorage): Promise<void> {
  // The same minimal deck read-permission.test.ts seeds: the codename rows
  // the party math reads, the set-pattern cards the rule walk composes, one
  // catch-all read rule (Anyone) and one *type read rule (Role A only).
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*read", codename: "read" });
  await seedCard(s, { id: 4, name: "Basic" });
  await seedCard(s, { id: 5, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 6, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 7, name: "Role A" });
  await seedCard(s, { id: 15, name: "*type", codename: "type" });
  await seedCard(s, { id: 16, name: "*self", codename: "self" });
  // *all+*read -> [[Anyone]]: everyone may read through this rule.
  await seedCard(s, { id: 8, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 8, 5, "anyone");
  // Basic+*type+*read -> [[Role A]]: members only (Anonymous denied).
  await seedCard(s, { id: 9, leftId: 4, rightId: 15, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, leftId: 9, rightId: 3, dbContent: "[[Role A]]" });
  await seedReference(s, 10, 7, "role_a");
  // The governed cards (read_rule_id = the DATA side, set on Ruby's save).
  await seedCard(s, {
    id: 11, name: "Readable Thing", typeId: BASIC_TYPE_ID,
    dbContent: "readable body", readRuleId: 8, readRuleClass: "*all",
  });
  await seedCard(s, {
    id: 12, name: "Secret Thing", typeId: BASIC_TYPE_ID,
    dbContent: "secret body", readRuleId: 10, readRuleClass: "*type",
  });
  // No stored read_rule_id: the live rule walk finds Basic+*type+*read
  // first -> denied (the canReadByRuleLookup fallback the HTML path uses).
  await seedCard(s, {
    id: 14, name: "Mystery Thing", typeId: BASIC_TYPE_ID,
    dbContent: "mystery body",
  });
}

describe("bunny edge /api/card read gate (api-leak-fix lane)", () => {
  it("a denied card answers the CF worker's 403 shape with NO db_content_preview and no content", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedPermissionDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/Secret%20Thing"),
        realDeck(storage),
      );
      expect(res.status).toBe(403);
      const body = await res.text();
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed).toEqual({ error: "permission denied", name: "Secret Thing" });
      // The pin's headline: the protected field is absent and the content
      // bytes never leave the engine.
      expect(body).not.toContain("db_content_preview");
      expect(body).not.toContain("secret body");
    } finally {
      storage.close();
    }
  });

  it("a denied card WITHOUT a stored read_rule_id is denied through the live rule walk too", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedPermissionDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/Mystery%20Thing"),
        realDeck(storage),
      );
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).not.toContain("db_content_preview");
      expect(body).not.toContain("mystery body");
    } finally {
      storage.close();
    }
  });

  it("a readable card still answers 200 with its db_content_preview (non-regression)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedPermissionDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/Readable%20Thing"),
        realDeck(storage),
      );
      expect(res.status).toBe(200);
      const parsed = (await res.json()) as Record<string, unknown>;
      expect(parsed["name"]).toBe("Readable Thing");
      expect(parsed["db_content_preview"]).toBe("readable body");
    } finally {
      storage.close();
    }
  });

  it("a missing card still answers 404 card-not-found", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedPermissionDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/api/card/NoSuchCard"),
        realDeck(storage),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "card not found", name: "NoSuchCard" });
    } finally {
      storage.close();
    }
  });
});
