// The MARKLESS write routes (register-routes A12 + C7): engine_routes.rb
// :29-31 —
//     put|patch "/" => "card#update"
//     delete "/" => "card#delete"
// - take the mark from the request BODY only (card_class.rb:104-133's
// uri_fetch_opts: `mark = params[:mark] || card_opts[:name]`), and a
// body-less markless write fetches the EMPTY name, finds no card and
// answers the pinned 404 (load_card raises Card::Error::NotFound,
// rest.rb:49-54; error.rb:88-90). A WRITE never reaches implicit_mark
// (mark.rb:28-40): the pinned route table gives load_mark to the READ
// action only (card_controller.rb:22), so the *home rule's card is never
// the mark of a write.
//
// The port previously answered markless PUT / with 404 "no card name in
// request" (the register's two divergences) and then, when a lane landed
// the implicit-mark resolution, aimed a body-less write at the card the
// *home rule names - which on a deck whose *home rule names a LIVE card
// MUTATED that card. The operator's ruling of 2026-10-24 closed that:
// the markless write arms take the mark from the BODY only.
//
// Driven through the REAL HTTP write surface (the shared bridge) with the
// update/delete rules granted to [[Anyone]] so the anonymous test session
// reaches the engine and the MARK RESOLUTION is observable in which card's
// content changed / which row was trashed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../card/render/render-test-storage.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";

const SET_TYPE_ID = 2;
const RICH_TEXT_TYPE_ID = 30;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The row's own capture, executed against the pinned gemset by
 *  tests/server/oracle-capture-markless-update-verbs-ruby.rb: the pinned
 *  update dispatch end to end - the route table, the uri_fetch mark rule
 *  and the update's create branch. */
const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/markless-update-verbs-ruby-oracle.json"), "utf8"),
) as {
  uriFetch: Array<{
    label: string;
    fetchAsks: Array<{ mark: string; new: Record<string, string> }>;
    error: string | null;
  }>;
  updateAction: Array<{
    label: string;
    newCard: boolean;
    cardCalls: string[];
    redirected: { url: string; status: number } | null;
    error: string | null;
  }>;
};

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

describe("markless PUT / takes the mark from the body only (C7 with A12)", () => {
  it("no mark, no card[name]: the pinned write fetches the EMPTY name and answers the 404", async () => {
    // The pinned write, measured by the row's own capture
    // (fixtures/captured/markless-update-verbs-ruby-oracle.json): with
    // NEITHER a URL mark nor a body card[name] the mark is the EMPTY name
    // (card_class.rb:104-133's uri_fetch_opts), the fetch finds no card
    // and the controller raises Card::Error::NotFound (rest.rb:49-54) -
    // the 404 (error.rb:88-90). The port answers the same, and NO card's
    // content changes.
    const res = await call(ruleDeck, "PUT", "/", {
      "card[content]": "updated through the rule",
    });
    expect(res.status).toBe(404);
    expect(await contentOf(ruleDeck, 101)).toBe("Target body original");
    expect(await contentOf(ruleDeck, 100)).toBe("Home body original");
  });

  it("card[name] in the body wins the mark (mark_from_card_hash first)", async () => {
    const res = await call(ruleDeck, "PUT", "/", {
      "card[name]": "Home",
      "card[content]": "updated through the hash",
    });
    expect(res.status).toBe(303);
    expect(await contentOf(ruleDeck, 100)).toBe("updated through the hash");
    // the rule-named Target keeps its own content
    expect(await contentOf(ruleDeck, 101)).toBe("Target body original");
  });

  it("a body name for a MISSING card CREATES it (rest.rb:14-16's new-card branch)", async () => {
    // card[type_id] rides Ruby's assign precedence (the create hash); the
    // leg's oracle point is the body name naming the created card.
    const res = await call(freshDeck, "PUT", "/", {
      "card[name]": "Fresh",
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

  it("the port answers the pinned 404 where the pinned write raises NotFound", async () => {
    // THE PINNED SIDE, from the row's own capture
    // (fixtures/captured/markless-update-verbs-ruby-oracle.json, executed
    // against the pinned gemset): Card.uri_fetch asks the fetch with the
    // URL mark or the body's card[name]; with NEITHER, the mark is the
    // EMPTY name (card_class.rb:104-133's uri_fetch_opts), and the
    // controller's load_card raises Card::Error::NotFound for it - a WRITE
    // never reaches implicit_mark, because the pinned route table gives
    // load_mark to the READ action only (engine_routes.rb:29-31).
    const pinned = ORACLE.uriFetch.find((row) => row.label.includes("body-less"));
    expect(pinned).toBeDefined();
    expect(pinned!.fetchAsks[0]!.mark).toBe("");

    // THE PORT'S SIDE, measured above in this same file: the 404 and no
    // card changed. The port used to aim at the implicit mark (the *home
    // rule) and update THAT card; the markless write arms now take the
    // mark from the BODY only, which is the pinned answer.
    const res = await call(ruleDeck, "PUT", "/", {
      "card[content]": "the divergence cell",
    });
    expect(res.status).toBe(404);
    expect(await contentOf(ruleDeck, 101)).toBe("Target body original");
  });

});

describe("markless DELETE / takes the mark from the body only (A12)", () => {
  it("card[name] in the body names the delete target; Home survives", async () => {
    const res = await call(ruleDeck, "DELETE", "/", {
      "card[name]": "Target",
    });
    expect(res.status).toBe(303);
    expect(await trashedOf(ruleDeck, 101)).toBe(true);
    expect(await trashedOf(ruleDeck, 100)).toBe(false);
  });

  it("no body: there is no mark, so the pinned 404 and nothing is trashed", async () => {
    // The pinned write fetches the EMPTY name, the fetch finds no card and
    // load_card raises Card::Error::NotFound - the 404 (error.rb:88-90).
    // The port answers the same, and the card the *home rule names (Target,
    // already trashed by the previous leg) is not what it aimed at: there
    // was no mark at all.
    const res = await call(ruleDeck, "DELETE", "/");
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("USERERROR");
    expect(await trashedOf(ruleDeck, 100)).toBe(false);
  });

  it("a blank *home rule: the bodyless DELETE still trashes nothing", async () => {
    // The rule names no card at all, so the rule's content cannot be the
    // mark either: the port answers the pinned 404 and Home survives.
    const res = await call(defaultDeck, "DELETE", "/");
    expect(res.status).toBe(404);
    expect(await trashedOf(defaultDeck, 100)).toBe(false);
  });
});
