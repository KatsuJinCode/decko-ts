// The session card's delete, in Ruby and in the port.
//
// RUBY (card-mod-session-0.20.0 set/type/session.rb:42-45):
//
//   event :delete_in_session, :prepare_to_store, on: :delete do
//     self.session_content = nil
//     abort :success
//   end
//
// The body clears the visitor's session content for that card, and the
// abort unwinds the delete, so no card row is written: Ruby's delete of a
// Session card never trashes a row.
//
// THE PORT. A Session card's content lives in the VISITOR SESSION
// (src/card/session/visitor-session.ts: sessionCardContent /
// storeSessionCardContent), not in a cards row: the create arm stores it
// there and the engine's session-type create writes no row. So the session
// content IS the card, and the write path's delete leg answers the
// session-card delete directly (src/server/write-routes.ts, the delete
// leg): the content is cleared, no row is touched, and the response is the
// delete's success response.
//
// This file pins that, and pins the control: a delete of an ordinary card
// is still an ordinary delete.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "../card/actions/actions-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import {
  handleWriteRequest,
  sessionCookieHeader,
  type WriteRouteRequest,
} from "../../src/server/write-routes.js";
import {
  readVisitorSession,
  sessionCardContent,
} from "../../src/card/session/visitor-session.js";

const SESSION_CARD = "Pudding+*enabled roles";
const ORDINARY_CARD = "Peer";

let storage: ActionsTestStorage;
let token: string;
const previousWritePath = process.env.DECKO_WRITE_PATH;

beforeEach(async () => {
  process.env.DECKO_WRITE_PATH = "1";
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  await runAuthMigrations(storage.driver);
  for (const row of [
    { id: 1000, name: "Session", codename: "session", typeId: 3 },
    { id: 1001, name: "*enabled roles", codename: "enabled_roles", typeId: 1000 },
    { id: 1002, name: "Anyone Signed In", codename: "anyone_signed_in" },
    { id: 1003, name: "Role", codename: "role", typeId: 3 },
    { id: 1004, name: "*members", codename: "members" },
    { id: 1005, name: "Neutral Role", typeId: 1003 },
    { id: 1006, leftId: 1005, rightId: 1004 },
    { id: 1007, name: "Anonymous", codename: "anonymous" },
    { id: 1008, name: "Peer" },
    { id: 1009, name: "Administrator", codename: "administrator", typeId: 3 },
  ]) {
    await seedCard(storage, row);
  }
  await storage.driver.query(
    "INSERT INTO card_references (referer_id,referee_id,referee_key,ref_type) VALUES (1006,50,NULL,'L')",
    [],
  );
  token = (await new SessionStore({ driver: storage.driver }).createSession(50)).token;
});

afterEach(() => {
  storage?.close();
  if (previousWritePath === undefined) delete process.env.DECKO_WRITE_PATH;
  else process.env.DECKO_WRITE_PATH = previousWritePath;
});

/** Every row of the tables a write can touch, so a write that writes
 *  nothing is visible as an unchanged snapshot. */
const snapshot = async () =>
  Object.fromEntries(
    await Promise.all(
      ["cards", "card_acts", "card_actions", "card_changes"].map(async (table) => [
        table,
        await storage.selectAll(`SELECT * FROM ${table} ORDER BY id`),
      ]),
    ),
  );

const send = async (
  method: "POST" | "DELETE",
  pathname: string,
  fields: Record<string, string>,
  visitor?: string,
) => {
  const req: WriteRouteRequest = {
    method,
    pathname,
    host: "deck.example",
    scheme: "https",
    headers: {
      origin: "https://deck.example",
      "content-type": "application/x-www-form-urlencoded",
      cookie:
        sessionCookieHeader(token).split(";")[0] + (visitor !== undefined ? `; ${visitor}` : ""),
    },
    body: method === "POST" ? new URLSearchParams(fields).toString() : "",
  };
  return handleWriteRequest(
    { driver: storage.driver, fetcher: storage.engine },
    req,
  );
};

describe("the session card's delete", () => {
  it("clears the visitor's session content for that card and writes no row", async () => {
    const before = await snapshot();
    const created = await send("POST", "/card/create", {
      "card[name]": SESSION_CARD,
      "card[type_id]": "1000",
      "card[content]": "Anyone Signed In",
    });
    expect(created?.status).toBe(303);
    const visitor = created?.visitorCookie?.split(";")[0];
    expect(visitor).toBeDefined();
    expect(sessionCardContent(readVisitorSession(visitor), SESSION_CARD)).toBe("Anyone Signed In");

    const deleted = await send("DELETE", `/delete/${SESSION_CARD.replace(/ /g, "_")}`, {}, visitor);
    expect(deleted?.status).toBe(303);
    // The content is gone from the visitor's session ...
    expect(
      sessionCardContent(readVisitorSession(deleted?.visitorCookie?.split(";")[0]), SESSION_CARD),
    ).toBeUndefined();
    // ... and no card row was written, trashed or otherwise.
    expect(await snapshot()).toEqual(before);
  });

  it("a delete of an ordinary card is still an ordinary delete", async () => {
    const before = await snapshot();
    const deleted = await send("DELETE", `/delete/${ORDINARY_CARD.replace(/ /g, "_")}`, {});
    expect(deleted?.status).toBe(303);
    const rows = await storage.selectAll<{ name: string; trash: number }>(
      "SELECT name, trash FROM cards WHERE name = ?",
      [ORDINARY_CARD],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.trash).toBe(1);
    // The ordinary delete writes its act, so the snapshot moved.
    expect(await snapshot()).not.toEqual(before);
  });
});
