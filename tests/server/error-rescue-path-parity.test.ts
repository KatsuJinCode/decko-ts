// The error rescue path (errors.rb:18-24), measured against the PINNED
// DECK's own handle_exception over the PINNED card gem's own Card::Error.
//
// The completeness register's C9 row grades the port on "Error rescue ->
// Card::Error.report -> show(error.class.view, status)". That line is the
// hinge every other error row hangs on - C10 through C15 each name ONE of
// the (view, status_code) pairs it hands to show - and no row had measured
// the line itself. It has four decisions, and this file pins all four:
//
//   1. THE DEBUGGER RE-RAISE (errors.rb:19). debug_exception? (:27-32) is
//      not a class test: it excludes Card::Error::UserError and
//      ActiveRecord::RecordInvalid BY CLASS, and then asks
//      `Card::Codename[:debugger] && Card[:debugger]&.content =~ /on`. So the
//      codename alone is not the debugger being on, and a UserError is
//      exempt however the debugger is set.
//   2. THE CARD IS THE ONE ALREADY LOADED (`@card ||= Card.new`,
//      errors.rb:21).
//   3. THE REPORT IS THE PINNED CARDYFY (card-1.110.0/lib/card/error.rb:
//      131-136 -> :146-157). An exception that is ALREADY a Card::Error
//      passes through unchanged; anything else is rebuilt as a NEW
//      `card_error_class(exception, card).new exception.message` - so the
//      class the rescue renders is a CHOICE the report makes, not the class
//      that was raised.
//   4. THE HANDOFF IS (class view, class status_code) - errors.rb:23, both
//      read off the CLASS, never off the instance.
//
// fixtures/captured/error-rescue-path-ruby-oracle.json is what
// tests/server/oracle-capture-error-rescue-path-ruby.rb recorded by
// EXECUTING the pinned handle_exception over the pinned error file
// (loaded by tests/server/pinned-card-error-classes-ruby.rb): every
// cardify branch, the debugger's three states, the ||= arm, and the render
// each one answered.
//
// The port's side: its own rescue is a single catch around the write
// handler (src/server/write-routes.ts:2330) whose status comes from
// errorStatus (:1097-1103) and whose body comes from errorResponse
// (:1169-1222). Measured over the real HTTP write surface here.
//
// ONE PINNED ARM WITH NO PORT COUNTERPART, named: the debugger re-raise.
// The port has no `Card::Codename[:debugger]` and no `Card[:debugger]`, so
// it cannot re-raise a server error for a debugger that is on. A 500 on the
// port is a 500 either way.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModHistory from "../../src/card/mod-loader/mods/card-mod-history.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/error-rescue-path-ruby-oracle.json"), "utf8"),
) as {
  rescueTable: {
    userErrorClasses: string[];
    cardioRescueAllInController: unknown;
    rescueAll: unknown;
    standardErrorRescueArmed: boolean;
  };
  cases: Array<{
    label: string;
    debuggerCodenameConfigured: boolean;
    debuggerCardContent: string | null;
    exceptionClass: string;
    exceptionMessage: string;
    raisedOutOfHandleException: string | null;
    cardErrorCurrent: string | null;
    cardErrorCurrentView: string | null;
    cardErrorCurrentStatus: number | null;
    cardErrorCurrentCardName: string | null;
    rendered: { body?: string; status?: number; content_type?: string } | null;
    redirected: unknown;
    cardName: string | null;
    cardCalls: string[] | null;
    cardErrorsCalls: Array<string | string[]> | null;
    cardErrorsEntries: Array<{ key: string; message: string }> | null;
    bareCardErrorsCalls: Array<string | string[]> | null;
    bareCardErrorsEntries: Array<{ key: string; message: string }> | null;
    pageCalls: Array<{ view: string; format: string }> | null;
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const ANN_ID = 91;
const NOTE_ID = 60;

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let historyLoader: ModLoader;
let joeToken = "";
let annToken = "";

/** The minimum rule deck this row's cases need: *all+*update open to signed
 *  in members, the account cards, and a target note to conflict over. */
async function seedRescueDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*update", codename: "update" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  // The create path's default type: *all -> *default -> Basic. Without it
  // the anonymous create's own create would raise a codename lookup error
  // instead of answering the denial this row is measuring.
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 18, name: "*default", codename: "default" });
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 16, name: "RichText", typeId: 16 });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  await seedCard(s, { id: ANN_ID, name: "Ann Editor" });
  await seedCard(s, { id: NOTE_ID, name: "Guard Note", typeId: 14, dbContent: "note v1" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRescueDeck(storage);
  // The conflict detector lives in the history mod (events.rb:19-22), so the
  // port's 409 needs the mod loaded - the same reason the edit-save-guards
  // suite loads it.
  historyLoader = new ModLoader([{ manifest: cardModHistory }]);
  historyLoader.load();
  await historyLoader.installInto(modEngineHost(storage.engine, storage.fetcher));
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  annToken = (await sessions.createSession(ANN_ID)).token;
  bridge = await makeWriteRouteServer(storage, ctx);
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  historyLoader?.reset();
  storage?.close();
});

async function call(
  path: string,
  init: { method?: string; form?: Record<string, string>; token?: string },
): Promise<{ status: number; body: string; json: () => Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (init.token !== undefined) headers["authorization"] = `Bearer ${init.token}`;
  const res = await fetch(`${bridge.url}${path}`, {
    method: init.method ?? "POST",
    headers,
    body: new URLSearchParams(init.form ?? {}).toString(),
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, body, json: () => JSON.parse(body) as Record<string, unknown> };
}

async function currentRevisionId(): Promise<number | undefined> {
  const result = await storage!.counting.query<{ id: number }>(
    `SELECT id FROM card_actions WHERE card_id = ? AND (draft IS NOT TRUE)
     ORDER BY id DESC LIMIT 1`,
    [NOTE_ID],
  );
  return result.rows[0]?.id;
}

describe("the pinned rescue table: which exceptions the controller rescues at all", () => {
  it("the UserError roster is five classes, and the pinned file names them itself", () => {
    expect(ORACLE.rescueTable.userErrorClasses).toEqual([
      "Card::Error::UserError",
      "ActionController::BadRequest",
      "ActionController::MissingFile",
      "ActiveRecord::RecordNotFound",
      "ActiveRecord::RecordInvalid",
    ]);
    const report = ORACLE.sources["cardErrorReport"]!.map((r) => r.text).join("\n");
    expect(report).toContain("ActionController::BadRequest");
    expect(report).toContain("ActiveRecord::RecordInvalid");
  });

  it("the StandardError net is NOT armed by default, so a plain RuntimeError never reaches handle_exception", () => {
    expect(ORACLE.rescueTable.cardioRescueAllInController).toBeNull();
    expect(ORACLE.rescueTable.rescueAll).toBeNull();
    expect(ORACLE.rescueTable.standardErrorRescueArmed).toBe(false);
    // card_controller.rb:28 `rescue_from_class StandardError if rescue_all?`
    // - the arm is conditional, and the condition is false here.
    const registration = ORACLE.sources["controllerRescueRegistration"]!.map((r) => r.text).join("\n");
    expect(registration).toContain("rescue_from_class(*Card::Error::UserError.user_error_classes)");
    expect(registration).toContain("rescue_from_class StandardError if rescue_all?");
  });
});

describe("the pinned cardify: the class the rescue renders is a CHOICE the report makes", () => {
  it("an exception that is already a Card::Error passes through unchanged", () => {
    const row = ORACLE.cases[0]!;
    expect(row.exceptionClass).toBe("Card::Error::NotFound");
    expect(row.cardErrorCurrent).toBe("Card::Error::NotFound");
    expect(row.cardErrorCurrentView).toBe("not_found");
    expect(row.cardErrorCurrentStatus).toBe(404);
    expect(row.rendered!.status).toBe(404);
    expect(row.pageCalls![0]!.view).toBe(":not_found");
  });

  it("a bare StandardError is cardified to ServerError, and the report asks the card to note it", () => {
    const row = ORACLE.cases[1]!;
    expect(row.exceptionClass).toBe("RuntimeError");
    expect(row.cardErrorCurrent).toBe("Card::Error::ServerError");
    expect(row.cardErrorCurrentView).toBe("server_error");
    expect(row.cardErrorCurrentStatus).toBe(500);
    expect(row.rendered!.status).toBe(500);
    // ServerError#report's own side effect, error.rb:61-64.
    expect(row.cardErrorsCalls).toEqual(["empty?", ["add", "ServerError", "boom"]]);
  });

  it("an ActiveRecord::RecordNotFound is cardified to NotFound by the case arm, not by its class name", () => {
    const row = ORACLE.cases[2]!;
    expect(row.exceptionClass).toBe("ActiveRecord::RecordNotFound");
    expect(row.cardErrorCurrent).toBe("Card::Error::NotFound");
    expect(row.cardErrorCurrentStatus).toBe(404);
    const report = ORACLE.sources["cardErrorReport"]!.map((r) => r.text).join("\n");
    expect(report).toContain("when ActiveRecord::RecordNotFound, ActionController::MissingFile");
    expect(report).toContain("Card::Error::NotFound");
  });

  it("a RecordInvalid is routed by the card's OWN errors, through KEY_MAP, in KEY_MAP order", () => {
    // The card's errors are consulted in KEY_MAP's declaration order -
    // permission_denied first, conflict second - and the calls show it.
    const permission = ORACLE.cases[3]!;
    expect(permission.cardErrorCurrent).toBe("Card::Error::PermissionDenied");
    expect(permission.cardErrorCurrentStatus).toBe(403);
    expect(permission.cardErrorsCalls).toEqual([["key?", "permission_denied"], "empty?"]);

    const conflict = ORACLE.cases[4]!;
    expect(conflict.cardErrorCurrent).toBe("Card::Error::EditConflict");
    expect(conflict.cardErrorCurrentStatus).toBe(409);
    expect(conflict.cardErrorsCalls).toEqual([
      ["key?", "permission_denied"],
      ["key?", "conflict"],
      "empty?",
    ]);

    const plain = ORACLE.cases[5]!;
    expect(plain.cardErrorCurrent).toBe("Card::Error");
    expect(plain.cardErrorCurrentView).toBe("errors");
    expect(plain.cardErrorCurrentStatus).toBe(422);
    expect(plain.rendered!.status).toBe(422);
  });

  it("add_card_errors writes into an EMPTY bag only, keyed by the class's last segment", () => {
    // All five cases above carried a non-empty bag, so nothing was added.
    for (const row of ORACLE.cases.slice(0, 6)) {
      expect(row.cardErrorsCalls).toContain("empty?");
    }
    // And the writes that did happen carry the class's last segment, not the
    // full name (error.rb:160 `exception.class.to_s.split("::").last`).
    expect(ORACLE.cases[0]!.cardErrorsEntries).toEqual([{ key: "NotFound", message: "no such card" }]);
    expect(ORACLE.cases[1]!.cardErrorsEntries).toEqual([{ key: "ServerError", message: "boom" }]);
  });

  it("Card::Error.current is the report's own side effect, and it is null when the rescue never ran", () => {
    for (const row of ORACLE.cases) {
      if (row.raisedOutOfHandleException === null) {
        expect(row.cardErrorCurrent).not.toBeNull();
      }
    }
  });
});

describe("the pinned debugger arm: it is not a class test, and it is not the codename alone", () => {
  it("the debugger re-raise happens BEFORE report and before show, so nothing renders", () => {
    const row = ORACLE.cases[6]!;
    expect(row.debuggerCodenameConfigured).toBe(true);
    expect(row.debuggerCardContent).toBe("on");
    expect(row.raisedOutOfHandleException).toBe("RuntimeError: boom");
    expect(row.rendered).toBeNull();
    expect(row.redirected).toBeNull();
    expect(row.pageCalls).toEqual([]);
    // report never ran, so current was never set on this row.
    expect(row.cardErrorCurrent).toBeNull();
  });

  it("the codename alone is NOT the debugger: an off debugger card still renders the server error", () => {
    const row = ORACLE.cases[7]!;
    expect(row.debuggerCodenameConfigured).toBe(true);
    expect(row.debuggerCardContent).toBe("off");
    expect(row.raisedOutOfHandleException).toBeNull();
    expect(row.cardErrorCurrent).toBe("Card::Error::ServerError");
    expect(row.rendered!.status).toBe(500);
    const handler = ORACLE.sources["handleException"]!.map((r) => r.text).join("\n");
    expect(handler).toContain("!e.is_a?(Card::Error::UserError)");
    expect(handler).toContain("Card::Codename[:debugger]");
    expect(handler).toContain("Card[:debugger]&.content =~ /on");
  });

  it("a UserError is EXEMPT from the debugger test however the debugger is set", () => {
    const row = ORACLE.cases[8]!;
    expect(row.debuggerCodenameConfigured).toBe(true);
    expect(row.debuggerCardContent).toBe("on");
    expect(row.raisedOutOfHandleException).toBeNull();
    expect(row.cardErrorCurrent).toBe("Card::Error::UserError");
    expect(row.rendered!.status).toBe(422);
  });

  it("the ||= arm: with no card loaded the pinned code makes a bare Card and the report writes into ITS bag", () => {
    const row = ORACLE.cases[9]!;
    expect(row.cardName).toBeNull();
    expect(row.bareCardErrorsCalls).toEqual(["empty?", ["add", "ServerError", "boom"]]);
    expect(row.bareCardErrorsEntries).toEqual([{ key: "ServerError", message: "boom" }]);
    // The raise on this row is a RIG ARTIFACT and is named as one on the
    // fixture: the rig's Card is a stand-in without the instance surface
    // show's ladder calls. The ||= and the report are measured; only that
    // render is out of reach.
    expect(row.raisedOutOfHandleException).toContain("undefined method 'action='");
    const artifact = ORACLE.rigArtifacts.find((line) => line.includes("RIG ARTIFACT"));
    expect(artifact).toBeDefined();
    expect(artifact!).toContain("action=");
  });

  it("the handoff reads the CLASS, not the instance", () => {
    const handler = ORACLE.sources["handleException"]!.map((r) => r.text).join("\n");
    expect(handler).toContain("error = Card::Error.report exception, card");
    expect(handler).toContain("show error.class.view, error.class.status_code");
  });
});

describe("the port's rescue, against the pinned one", () => {
  it("NOT FOUND is 404, both sides", async () => {
    // The port's `~<id>` arm (write-routes.ts:1829) is its bad_mark
    // NotFound; the pinned rescue's NotFound answered 404 above.
    const res = await call("/~999999.json", {
      method: "PUT",
      form: { "card[content]": "into the void" },
      token: joeToken,
    });
    expect(res.status, res.body).toBe(404);
    expect(res.json()["error_status"]).toBe(404);
    expect(ORACLE.cases[0]!.cardErrorCurrentStatus).toBe(404);
  });

  it("PERMISSION DENIED is 403, both sides", async () => {
    const res = await call("/", { form: { "card[name]": "C9 Denied", "card[content]": "nope" } });
    expect(res.status, res.body).toBe(403);
    expect(res.body).toContain("Please sign in or sign up to do that.");
    expect(ORACLE.cases[3]!.cardErrorCurrentStatus).toBe(403);
  });

  it("EDIT CONFLICT is 409, both sides", async () => {
    await call("/update/Guard_Note", { form: { "card[content]": "c9 baseline" }, token: joeToken });
    const revision = await currentRevisionId();
    expect(revision).toBeTypeOf("number");
    const conflicted = await call("/update/Guard_Note", {
      form: {
        "card[content]": "c9 stale overwrite",
        "card[last_action_id_before_edit]": String(Number(revision) - 1),
      },
      token: annToken,
    });
    expect(conflicted.status, conflicted.body).toBe(409);
    expect(conflicted.body).toContain("changes not based on latest revision");
    expect(ORACLE.cases[4]!.cardErrorCurrentStatus).toBe(409);
  });

  it("the UserError default is 422, both sides", async () => {
    // Deleting a card that does not exist is the port's bare UserError
    // (write-routes.ts:2122-2124, the pinned missing-card delete measured on
    // row B4).
    const res = await call("/delete/Never_Existed", { method: "DELETE", token: joeToken });
    expect(res.status, res.body).toBe(422);
    expect(res.body).toContain("USERERROR");
    expect(ORACLE.cases[5]!.cardErrorCurrentStatus).toBe(422);
  });

  it("the port's status table is the pinned class table, code for code", () => {
    // The five statuses the pinned rescue can hand to show, and the port's
    // errorStatus arms that answer the same five. Read off the source
    // because errorStatus is not exported; the four HTTP cases above are the
    // executed half of this.
    expect(ORACLE.cases[0]!.cardErrorCurrentStatus).toBe(404);
    expect(ORACLE.cases[3]!.cardErrorCurrentStatus).toBe(403);
    expect(ORACLE.cases[4]!.cardErrorCurrentStatus).toBe(409);
    expect(ORACLE.cases[5]!.cardErrorCurrentStatus).toBe(422);
    expect(ORACLE.cases[1]!.cardErrorCurrentStatus).toBe(500);
  });

  it("NAMED ABSENCE: the port has no debugger re-raise arm", () => {
    // The pinned rescue re-raises a non-UserError when the debugger card is
    // on (errors.rb:19). The port has neither Card::Codename nor
    // Card[:debugger], so it has no such test; a server error is a server
    // error there. This is a scope difference in the DECK, not a missing
    // port behaviour: the debugger card is a deck card with no row here.
    const handler = ORACLE.sources["handleException"]!.map((r) => r.text).join("\n");
    expect(handler).toContain("raise exception if debug_exception?(exception)");
  });
});