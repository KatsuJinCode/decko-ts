// The session card's delete, in Ruby and in the port (register row 29,
// card-mod-session).
//
// RUBY (card-mod-session-0.20.0 set/type/session.rb:42-45):
//
//   event :delete_in_session, :prepare_to_store, on: :delete do
//     self.session_content = nil
//     abort :success
//   end
//
// The body clears the visitor's session content for that card (the
// visitor's session entry "_card_<key>", session.rb:15-19), and the abort
// unwinds the delete, so no card row is written.
//
// THE PORT, AS MEASURED AT THIS TREE.
//
// The port's Session cards live in the VISITOR SESSION
// (src/card/session/visitor-session.ts: sessionCardContent /
// storeSessionCardContent), not in a cards row: the create arm stores it
// there and the engine's session-type create writes no row. The
// delete_in_session event is therefore a declared STUB
// (src/card/mod-loader/mods/card-mod-session.ts), and the write path has
// no session-card delete arm.
//
// THE ORACLE SAYS THAT IS RIGHT FOR THE CARD THAT EXISTS ONLY IN THE
// VISITOR SESSION. The recorded Ruby trace
// (reference-harness/fixtures/write-battery-v1/expected/
// side-effects-ruby.json, the steps anon-session-card-create,
// anon-session-card-update, anon-session-card-read,
// anon-session-card-delete and anon-session-card-read-after-delete)
// answers the anonymous session-card delete with 422 and KEEPS the
// visitor's session content: the card has no row, so the delete never
// reaches the event. The port answers the same 422 and keeps the content.
//
// A delete arm that cleared the content BEFORE the write-authority check
// would answer 303 and clear the content where the oracle answers 422 and
// keeps it. The side-effects battery catches that difference, so this row
// stays open until the delete's body can run inside the engine's delete
// path, after the authority check, with the visitor session in scope.
//
// This file pins the port's measured answer, so the row's gap cannot
// change silently.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import cardModSession from "../../src/card/mod-loader/mods/card-mod-session.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRITE_ROUTES = join(REPO, "src", "server", "write-routes.ts");
const ORACLE = join(
  REPO,
  "reference-harness",
  "fixtures",
  "write-battery-v1",
  "expected",
  "side-effects-ruby.json",
);

const SESSION_CARD = "Pudding+*enabled roles";

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
  return handleWriteRequest({ driver: storage.driver, fetcher: storage.engine }, req);
};

describe("the session card's delete, as the oracle records it", () => {
  it("the recorded Ruby oracle answers the anonymous session-card delete with 422 and keeps the content", () => {
    const trace = JSON.parse(readFileSync(ORACLE, "utf8")) as {
      steps: { step: string; status: number; session_cards: Record<string, string> }[];
    };
    const step = trace.steps.find((entry) => entry.step === "anon-session-card-delete");
    expect(step).toBeDefined();
    expect(step?.status).toBe(422);
    expect(step?.session_cards).toEqual({ parity_session_probe: "x" });
  });

  it("the port answers the same 422 and keeps the visitor's session content", async () => {
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
    expect(deleted?.status).toBe(422);
    // The refused delete changes nothing, so the response carries no new
    // visitor cookie and the content the visitor still holds survives.
    expect(deleted?.visitorCookie).toBeUndefined();
    expect(sessionCardContent(readVisitorSession(visitor), SESSION_CARD)).toBe("Anyone Signed In");
  });

  it("the delete_in_session event is registered with no port body", () => {
    const module = (cardModSession.setModules ?? []).find(
      (entry) => entry.setPath === "type/session",
    );
    const event = (module?.events ?? []).find(
      (entry) => entry.event === "delete_in_session",
    );
    expect(event).toBeDefined();
    expect(event?.at).toBe("prepare_to_store");
    expect(event?.on).toEqual(["delete"]);
  });

  it("the write path carries no session-card delete arm", () => {
    const source = readFileSync(WRITE_ROUTES, "utf8");
    expect(source).not.toContain("delete_in_session");
  });
});
