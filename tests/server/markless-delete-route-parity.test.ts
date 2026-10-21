// The MARKLESS delete route, measured against the PINNED DECK's own route
// table, its own before_action table and its own fetch options.
//
// The completeness register's A12 row grades the port on
// `delete "/" => "card#delete"`. The row's note, and the port's own body
// for it, both say the markless write arms resolve the IMPLICIT mark
// (mark.rb's implicit_mark -> the *home rule). The PINNED controller's
// before_action table says otherwise: load_mark runs ONLY for the read
// action, so a write never reaches implicit_mark, and a write's mark is
// the URL mark or the body's card[name].
//
// fixtures/captured/markless-delete-route-ruby-oracle.json is what
// oracle-capture-markless-delete-route-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table, the PINNED DECK's own
// controller file (its before_action table), the PINNED DECK's own fetch
// options and the PINNED DECK's own delete action:
//
//   the route  decko-0.20.0/config/engine_routes.rb:27-31
//                post   "/" => "card#create"
//                put    "/" => "card#update"
//                patch  "/" => "card#update"
//                delete "/" => "card#delete"
//   the table  decko-0.20.0/lib/card_controller.rb:20-25
//                before_action :load_mark, only: [:read]
//                before_action :load_card, except: [:asset]
//   the mark   card-1.110.0/lib/card/fetch/card_class.rb:117-133
//                mark = params[:mark] || card_opts[:name]
//                opts[:name] ||= Name[params[:mark]]&.tr "_", " "
//   the action decko-0.20.0/lib/card_controller/rest.rb:18-20
//                def delete
//                  handle { card.delete! }
//                end

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../card/render/render-test-storage.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/markless-delete-route-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  rootWriteRoutes: Array<{ verb: string; patterns: string[]; action: string; order: number }>;
  beforeActions: Array<{ name: string; only: string[]; except: string[] }>;
  actionsByAction: Array<{ action: string; beforeActions: string[] }>;
  fetchOptions: Array<{ label: string; opts: Record<string, unknown> }>;
  fetchResults: Array<{ label: string; result: string }>;
  deleteAction: {
    error: string | null;
    cardCalls: string[];
    redirected: { url: string; status: number } | null;
  };
  loadCardSource: Array<{ line: number; text: string }>;
};

const byAction = new Map(ORACLE.actionsByAction.map((row) => [row.action, row.beforeActions]));
const byFetchLabel = new Map(ORACLE.fetchOptions.map((row) => [row.label, row]));

// ---------------------------------------------------------------------------
// The port's own deck: a *home rule naming a real card, a delete rule, and
// the two cards the legs watch.
// ---------------------------------------------------------------------------

const SET_TYPE_ID = 2;
const RICH_TEXT_TYPE_ID = 30;

interface Deck {
  storage: RenderTestStorage;
  bridge: BridgeServer;
}

async function makeDeck(): Promise<Deck> {
  const storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  // The *all set and its members: the *delete rule rides the set.
  await seedCard(storage, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: 2, name: "Set", codename: "set" });
  await seedCard(storage, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(storage, { id: 6, name: "Anyone", codename: "anyone" });
  // The delete rule row, with the party reference row the who_can verdict
  // batch reads (a rule card without its reference row denies).
  await seedCard(storage, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone]]" });
  await storage.counting.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, 'anyone', 6, 'L', NULL)`,
    [12],
  );
  // The anonymous session's ACTOR card.
  await seedCard(storage, { id: 14, name: "Anonymous User", codename: "anonymous" });
  // The two cards the legs watch, and the *home rule that names one.
  await seedCard(storage, { id: 100, name: "Home", typeId: RICH_TEXT_TYPE_ID, dbContent: "Home body" });
  await seedCard(storage, { id: 101, name: "Target", typeId: RICH_TEXT_TYPE_ID, dbContent: "Target body" });
  await seedCard(storage, { id: 102, name: "*home", codename: "home", dbContent: "Target" });
  const ctx: WriteRouteContext = { driver: storage.counting, fetcher: storage.fetcher };
  const bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  return { storage, bridge };
}

let deck: Deck;

beforeAll(async () => {
  deck = await makeDeck();
}, 90_000);

afterAll(() => {
  deck?.bridge.server.close();
  deck?.storage.close();
});

async function call(
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

async function trashedOf(id: number): Promise<boolean | null> {
  const r = await deck.storage.counting.query<{ trash: number }>(
    "SELECT trash FROM cards WHERE id = ?",
    [id],
  );
  return r.rows[0] === undefined ? null : r.rows[0].trash === 1;
}

describe("the markless delete route, against the pinned deck gem", () => {
  it("the pinned deck registers delete \"/\" as card#delete", () => {
    const del = ORACLE.rootWriteRoutes.find((route) => route.verb === "delete")!;
    expect(del.patterns).toEqual(["/"]);
    expect(del.action).toBe("card#delete");
    // The root write routes sit together: post, put, patch, delete.
    expect(ORACLE.rootWriteRoutes.map((route) => route.verb)).toEqual(["post", "put", "patch", "delete"]);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the pinned controller runs load_mark ONLY for the read action", () => {
    // This is the mechanism the row turns on: a write never reaches
    // implicit_mark, so a write's mark is the URL mark or the body's
    // card[name] - never the *home rule.
    expect(byAction.get("read")).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
    expect(byAction.get("delete")).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(byAction.get("update")).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(byAction.get("delete")).not.toContain("load_mark");
  });

  it("the pinned fetch takes the mark from the URL or the body's card name", () => {
    expect(byFetchLabel.get("the body's card name")!.opts.name).toBe("Target");
    expect(byFetchLabel.get("a URL mark")!.opts.name).toBe("My Card");
    // With neither, the pinned name is the EMPTY name (Name[nil], card-1.110.0
    // /lib/card/name.rb:79) - not the home card.
    expect(byFetchLabel.get("neither: no mark and no card name")!.opts.name).toBe("");
  });

  it("the pinned fetch finds no card for the empty name, and the controller raises the 404", () => {
    expect(ORACLE.fetchResults.find((row) => row.label === "no card found for the mark")!.result).toBe("nil");
    const raiseLine = ORACLE.loadCardSource.find((row) => row.text.includes("NotFound"));
    expect(raiseLine).toBeDefined();
    expect(raiseLine!.text).toContain("raise Card::Error::NotFound unless card");
  });

  it("the pinned delete action deletes the card it was given and redirects at 303", () => {
    expect(ORACLE.deleteAction.error).toBeNull();
    expect(ORACLE.deleteAction.cardCalls).toContain("delete!");
    expect(ORACLE.deleteAction.redirected).toEqual({ url: "/", status: 303 });
  });

  it("the port matches the pinned deck when the body carries the card name", async () => {
    // The pinned mark source for a write: the body's card[name]. The port
    // takes the same mark and trashes that card.
    const res = await call("DELETE", "/", { "card[name]": "Target" });
    expect(res.status).toBe(303);
    expect(await trashedOf(101)).toBe(true);
    expect(await trashedOf(100)).toBe(false);
  });

  it("NAMED DIVERGENCE: with no body name the port takes the *home rule, the pinned deck 404s", async () => {
    // The pinned deck: the mark is the empty name, the fetch finds no card,
    // and load_card raises Card::Error::NotFound -> 404.
    //
    // The port: the markless delete falls back to the *home rule's card
    // (mark.rb's implicit_mark, which the pinned controller never runs for
    // a write) and trashes THAT card.
    //
    // The fix that would close the row: the markless write arms take the
    // mark from the body only (card[name]) and answer the pinned 404 when
    // the body carries none - the same change the markless put|patch arms
    // need, which is row C7's arm and not this tranche's eight. It is
    // named, not taken, because it changes a row another lane landed and
    // it changes what a bodyless DELETE / does to a live deck.
    const res = await call("DELETE", "/");
    // The port's answer: the rule-named card (Target) was already trashed
    // by the previous leg, so the delete's lookup misses and the port
    // answers the user error - the mark resolution still aimed at the
    // rule-named card, NOT at Home.
    expect(res.status).toBe(422);
    expect(res.body).toContain("USERERROR");
    expect(await trashedOf(100)).toBe(false);
    // The pinned answer for the same request is the 404.
    expect(byFetchLabel.get("neither: no mark and no card name")!.opts.name).toBe("");
  });
});
