// The history pane's revert requests over the HTTP write path.
//
// Ruby truth under test
// ---------------------
// card-mod-history-0.20.0 set/all/history/actions.rb:81-89
//   revert_actions_link: POST /update/<mark> with the query
//   assign=true&card[skip]=validate_renaming&look_in_trash=true plus
//   revert_actions[]=<ids> ("revert to this") or revert_to=previous&
//   revert_act=<id> ("revert to previous").
// set/all/history/events.rb:40-46 :rollback_actions — update! with the
//   revisions (revision.rb), clear_drafts, abort :success: the stored result
//   is ONE ordinary :update save of the reverted attributes.
// The row-level equality with the Ruby oracle is measured by the persistence
// probe (tests/tools/persist-write-probe.test.ts steps 23-31); this file pins
// that the server reads the link's query parameters, reaches a trashed card
// through look_in_trash, and lands on that same save.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { makeWriteRouteServer as makeServer } from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;

let storage: RenderTestStorage | undefined;
let joeToken = "";
let server: http.Server;
let baseUrl = "";

async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*update", codename: "update" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 9, name: "*default", codename: "default" });
  for (const [id, right] of [
    [10, 3],
    [11, 4],
    [12, 5],
  ]) {
    await seedCard(s, { id, leftId: 1, rightId: right, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, id, 7, "anyone signed in");
  }
  await seedCard(s, { id: 14, name: "Basic" });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  // *all+*default: new cards take type Basic.
  await seedCard(s, { id: 17, leftId: 1, rightId: 9, typeId: 14 });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
}

/** The note is created through the write path, so its history starts with
 *  a create action as every real card's does. */
let NOTE_ID = 0;

async function post(path: string, form: Record<string, string>): Promise<number> {
  const params = new URLSearchParams(form);
  params.set("token", joeToken);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "manual",
  });
  await res.text();
  return res.status;
}

async function row(): Promise<{ name: string | null; db_content: string; trash: number }> {
  const r = await storage!.counting.query<{ name: string | null; db_content: string; trash: number }>(
    "SELECT name, db_content, trash FROM cards WHERE id = ?",
    [NOTE_ID],
  );
  return r.rows[0];
}

async function actions(): Promise<{ id: number; card_act_id: number; action_type: number }[]> {
  const r = await storage!.counting.query<{ id: number; card_act_id: number; action_type: number }>(
    "SELECT id, card_act_id, action_type FROM card_actions WHERE card_id = ? ORDER BY id",
    [NOTE_ID],
  );
  return r.rows.map((a) => ({ id: Number(a.id), card_act_id: Number(a.card_act_id), action_type: Number(a.action_type) }));
}

async function changesOf(actionId: number): Promise<[number, string | null][]> {
  const r = await storage!.counting.query<{ field: number; value: string | null }>(
    "SELECT field, value FROM card_changes WHERE card_action_id = ? ORDER BY id",
    [actionId],
  );
  return r.rows.map((c) => [Number(c.field), c.value]);
}

/** The link's own query (actions.rb:81-89, the bytes the history renderer
 *  emits, with the &amp; entities decoded as the browser does). */
const LINK_QUERY = "assign=true&card%5Bskip%5D=validate_renaming&look_in_trash=true";

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedDeck(storage);
  const ctx: WriteRouteContext = { driver: storage.counting, fetcher: storage.fetcher };
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
  const bridge = await makeServer(storage, ctx);
  server = bridge.server;
  baseUrl = bridge.url;
}, 60_000);

afterAll(() => {
  server?.close();
  storage?.close();
});

describe("history revert requests over HTTP (:rollback_actions)", () => {
  it("'revert to this' restores an earlier revision as one :update save", async () => {
    expect(await post("/card/create", { "card[name]": "Revert Note", "card[content]": "v1" })).toBe(303);
    const created = await storage!.counting.query<{ id: number }>(
      "SELECT id FROM cards WHERE key = ?",
      ["revert_note"],
    );
    NOTE_ID = Number(created.rows[0].id);
    expect(await post("/update/Revert_Note", { "card[content]": "v2" })).toBe(303);
    expect(await post("/update/Revert_Note", { "card[content]": "v3" })).toBe(303);
    const [, v2Action] = await actions(); // create, v2, v3
    const status = await post(
      `/update/Revert_Note?${LINK_QUERY}&revert_actions%5B%5D=${v2Action.id}`,
      {},
    );
    expect(status).toBe(303);
    expect((await row()).db_content).toBe("v2");
    const last = (await actions()).at(-1)!;
    expect(last.action_type).toBe(1); // :update
    expect(await changesOf(last.id)).toEqual([[2, "v2"]]);
  });

  it("'revert to previous' of the latest act undoes it", async () => {
    const latestAct = (await actions()).at(-1)!.card_act_id;
    const status = await post(
      `/update/Revert_Note?${LINK_QUERY}&revert_to=previous&revert_act=${latestAct}`,
      {},
    );
    expect(status).toBe(303);
    expect((await row()).db_content).toBe("v3");
  });

  it("a trashed card is reached through look_in_trash and restored by reverting to a live revision", async () => {
    const res = await fetch(`${baseUrl}/delete/Revert_Note?token=${joeToken}`, { method: "DELETE", redirect: "manual" });
    await res.text();
    expect((await row()).trash).toBe(1);
    const beforeDelete = (await actions()).at(-2)!;
    const status = await post(
      `/update/Revert_Note?${LINK_QUERY}&revert_actions%5B%5D=${beforeDelete.id}`,
      {},
    );
    expect(status).toBe(303);
    const restored = await row();
    expect(restored.trash).toBe(0);
    expect(restored.db_content).toBe("v3");
    const last = (await actions()).at(-1)!;
    expect(last.action_type).toBe(1); // Card#update!(trash: false) is an :update
    expect(await changesOf(last.id)).toEqual([[3, "f"]]);
  });

  it("without look_in_trash a trashed card is not reached by an update", async () => {
    const res = await fetch(`${baseUrl}/delete/Revert_Note?token=${joeToken}`, { method: "DELETE", redirect: "manual" });
    await res.text();
    const countBefore = (await actions()).length;
    // No look_in_trash: Ruby's uri_fetch builds a NEW card from the mark and
    // the update routes to create, which revives the trashed row by name.
    const status = await post("/update/Revert_Note", { "card[content]": "fresh" });
    expect(status).toBe(303);
    expect((await row()).db_content).toBe("fresh");
    expect((await actions()).length).toBe(countBefore + 1);
    expect((await actions()).at(-1)!.action_type).toBe(0); // the revival is a :create
  });
});
