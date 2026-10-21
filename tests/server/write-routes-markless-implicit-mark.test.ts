// The MARKLESS write routes (register-routes A12 + C7): engine_routes.rb
// :29-31 —
//     put|patch "/" => "card#update"
//     delete "/" => "card#delete"
// — resolve the IMPLICIT mark before their action runs (mark.rb:28-40
// implicit_mark): mark_from_card_hash (params.dig(:card, :name)) when the
// body carries one, else home_mark (mark.rb:42-44 — the *home rule ||
// "Home"; resolver: src/card/render/page.ts homeMarkContent). Ruby then
// updates or deletes THAT card — card#update's new-card branch
// (rest.rb:14-16) makes an update of a MISSING home a create.
//
// The port previously unrouted DELETE / entirely (matchRoute answered null
// -> the host 405/403) and answered markless PUT / with 404 "no card name
// in request" — the register's two divergences.
//
// Driven through the REAL HTTP write surface (the shared bridge) with the
// update/delete rules granted to [[Anyone]] so the anonymous test session
// reaches the engine and the MARK RESOLUTION is observable in which card's
// content changed / which row was trashed.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../card/render/render-test-storage.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";

const SET_TYPE_ID = 2;
const RICH_TEXT_TYPE_ID = 30;

interface Deck {
  storage: RenderTestStorage;
  ctx: WriteRouteContext;
  bridge: BridgeServer;
}

async function contentOf(deck: Deck, id: number): Promise<string | null> {
  const r = await deck.storage.counting.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [id],
  );
  return r.rows[0]?.db_content ?? null;
}

async function trashedOf(deck: Deck, id: number): Promise<boolean | null> {
  const r = await deck.storage.counting.query<{ trash: number }>(
    "SELECT trash FROM cards WHERE id = ?",
    [id],
  );
  return r.rows[0] === undefined ? null : r.rows[0].trash === 1;
}

/** The granted-rule shell (update/delete -> [[Anyone]]) plus the home
 *  scenario cards. homeContent: the *home rule's content — "Home" (the
 *  default), a card name, or "" (blank rule -> the "Home" fallback). */
async function makeDeck(
  label: string,
  homeContent: string,
  seedHome: boolean,
  seedTarget: boolean,
): Promise<Deck> {
  const storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedCard(storage, { id: 30, name: "RichText", codename: "basic", typeId: RICH_TEXT_TYPE_ID });
  await seedCard(storage, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: 2, name: "Set", codename: "set" });
  await seedCard(storage, { id: 3, name: "*update", codename: "update" });
  await seedCard(storage, { id: 4, name: "*create", codename: "create" });
  await seedCard(storage, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(storage, { id: 7, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(storage, { id: 8, name: "*type", codename: "type", typeId: 7 });
  // *default itself must be SETTING-typed for the default-type walk's gate
  // (type-resolution.ts:238-242); untyped, the leg blinds and the save
  // rides the built-in default type
  await seedCard(storage, { id: 9, name: "*default", codename: "default", typeId: 7 });
  // the *all+*default anchor — the default TYPE rule; its content names
  // RichText so plain-text saves pass the content validation
  await seedCard(storage, { id: 13, leftId: 1, rightId: 9, typeId: SET_TYPE_ID, dbContent: "RichText" });
  await seedCard(storage, { id: 6, name: "Anyone", codename: "anyone" });
  // the anonymous session's ACTOR card — a deck that cannot form it keeps
  // the legacy anonymous-actor refusal (the fragment-seed 403)
  await seedCard(storage, { id: 14, name: "Anonymous User", codename: "anonymous" });
  await seedCard(storage, { id: 11, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedCard(storage, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone]]" });
  await seedCard(storage, { id: 16, leftId: 1, rightId: 4, dbContent: "[[Anyone]]" });
  // the party reference rows the who_can verdict batch reads (the
  // actions-test-storage seedReference shape) — a rule card without its
  // reference row has no parties and denies (fail-closed)
  for (const ruleId of [11, 12, 16]) {
    await storage.counting.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
       VALUES (?, 'anyone', 6, 'L', NULL)`,
      [ruleId],
    );
  }
  if (seedHome) {
    await seedCard(storage, { id: 100, name: "Home", typeId: 30, dbContent: "Home body original" });
  }
  if (seedTarget) {
    await seedCard(storage, { id: 101, name: "Target", typeId: 30, dbContent: "Target body original" });
  }
  await seedCard(storage, { id: 102, name: "*home", codename: "home", dbContent: homeContent });
  const ctx: WriteRouteContext = { driver: storage.counting, fetcher: storage.fetcher };
  const bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  void label;
  return { storage, ctx, bridge };
}

let ruleDeck: Deck;      // *home -> "Target": the rule names a real card
let defaultDeck: Deck;   // *home -> "" : blank rule, the "Home" fallback
let freshDeck: Deck;     // *home -> "Fresh", no Home/Fresh cards: create fallback

beforeAll(async () => {
  ruleDeck = await makeDeck("rule", "Target", true, true);
  defaultDeck = await makeDeck("default", "", true, false);
  freshDeck = await makeDeck("fresh", "Fresh", false, false);
}, 90_000);

afterAll(() => {
  for (const deck of [ruleDeck, defaultDeck, freshDeck]) {
    deck?.bridge.server.close();
    deck?.storage.close();
  }
});

async function call(
  deck: Deck,
  method: string,
  pathname: string,
  form?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (form !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  const res = await fetch(`${deck.bridge.url}${pathname}`, { method, headers, body, redirect: "manual" });
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return { status: res.status, headers: responseHeaders, body: await res.text() };
}

describe("markless PUT / resolves the implicit mark (C7)", () => {
  it("no mark, no card[name]: the body updates the card the *home RULE names", async () => {
    const res = await call(ruleDeck, "PUT", "/", {
      "card[content]": "updated through the rule",
    });
    expect(res.status).toBe(303);
    // the hard redirect answers the SAVE's own card (success target)
    expect(res.headers["location"]).toContain("/Target");
    expect(await contentOf(ruleDeck, 101)).toBe("updated through the rule");
    expect(await contentOf(ruleDeck, 100)).toBe("Home body original");
  });

  it("card[name] in the body wins the mark (mark_from_card_hash first)", async () => {
    const res = await call(ruleDeck, "PUT", "/", {
      "card[name]": "Home",
      "card[content]": "updated through the hash",
    });
    expect(res.status).toBe(303);
    expect(await contentOf(ruleDeck, 100)).toBe("updated through the hash");
    // the rule-named Target keeps the earlier leg's content
    expect(await contentOf(ruleDeck, 101)).toBe("updated through the rule");
  });

  it("a blank *home rule falls back to Home; updating a MISSING home CREATES it (rest.rb:14-16)", async () => {
    // card[type_id] rides Ruby's assign precedence (the create hash); the
    // leg's oracle point is the IMPLICIT MARK naming the created card.
    const res = await call(freshDeck, "PUT", "/", {
      "card[content]": "minted by the markless put",
      "card[type_id]": "30",
    });
    expect(res.status).toBe(303);
    const fresh = await freshDeck.storage.counting.query<{ id: number; db_content: string }>(
      "SELECT id, db_content FROM cards WHERE name = ? AND trash = 0",
      ["Fresh"],
    );
    expect(fresh.rows.length).toBeGreaterThanOrEqual(1);
    expect(fresh.rows[0]!.db_content).toBe("minted by the markless put");
  });
});

describe("markless DELETE / routes to card#delete with the implicit mark (A12)", () => {
  it("card[name] in the body names the delete target; Home survives", async () => {
    const res = await call(ruleDeck, "DELETE", "/", {
      "card[name]": "Target",
    });
    expect(res.status).toBe(303);
    expect(await trashedOf(ruleDeck, 101)).toBe(true);
    expect(await trashedOf(ruleDeck, 100)).toBe(false);
  });

  it("no body: the rule-named mark is resolved (its card is already trashed -> the Ruby 422 UserError)", async () => {
    // *home content "Target" — Target was trashed by the previous leg, so
    // the delete's live lookup misses: handle { card.delete! } raises the
    // UserError the port answers as 422 in the recorded Ruby shape (the
    // A16 pin: USERERROR / Card::Error::UserError — error.rb:20-21's view).
    // The MARK RESOLUTION is the thing under test: the 422 proves the
    // markless delete aimed at the RULE-NAMED card (a markless delete that
    // resolved "Home" instead would trash Home and 303).
    const res = await call(ruleDeck, "DELETE", "/");
    expect(res.status).toBe(422);
    expect(res.body).toContain("USERERROR");
    expect(await trashedOf(ruleDeck, 100)).toBe(false);
  });

  it("a blank *home rule: the markless DELETE deletes the HOME card", async () => {
    const res = await call(defaultDeck, "DELETE", "/");
    expect(res.status).toBe(303);
    expect(await trashedOf(defaultDeck, 100)).toBe(true);
  });
});
