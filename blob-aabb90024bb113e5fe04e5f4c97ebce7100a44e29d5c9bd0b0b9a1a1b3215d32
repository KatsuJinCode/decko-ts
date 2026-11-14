// The ServerError pair (500, :server_error), its 900 debugger arm, and the
// finding that the 900 arm cannot be reached from the pinned controller -
// measured against the PINNED card gem's own class.
//
// The completeness register's C14 row grades the port on "ServerError 500
// (+900 debugger arm) (error.rb:46-59; errors.rb:27-32)". Reading those two
// ranges shows a pair that flips on a predicate and a rescue that re-raises
// behind it. Executing them shows three things reading cannot:
//
//   1. THE PAIR FLIPS TOGETHER on one predicate, and the predicate RETURNS
//      AN INDEX. `debugger_on?` (:57-59) is `Card::Codename[:debugger] &&
//      Card[:debugger]&.content =~ /on` - a `=~`, which answers an Integer
//      index (0 when the match is at the start) or nil. The capture records
//      the returned object, and runs the predicate over five states so the
//      two halves (codename configured, card content) can be told apart.
//   2. THE 900 ARM IS UNREACHABLE FROM THE PINNED CONTROLLER. The deck and
//      the card gem read status_code in exactly two places - the
//      class_attribute declaration (card/error.rb:17) and the show handoff
//      (decko card_controller/errors.rb:23) - and the handoff sits BEHIND
//      `raise exception if debug_exception?(exception)` (:19), which asks the
//      SAME debugger test. So the debugger on means re-raise and no status
//      read at all; the debugger off means 500. Both halves were executed;
//      the 900 never reached a render. The :debug_server_error VIEW does
//      exist (card-mod-format set/all/html/error.rb:4) - it is the STATUS
//      that has no reachable reader.
//   3. ServerError IS THE CARDIFY ELSE, AND IT IS OUTSIDE THE 422 LADDER.
//      Its superclass is Card::Error, not Card::Error::UserError, so it is
//      neither in the rescue roster nor in the UserError ladder - which is
//      why a server error needs the StandardError net that is not armed by
//      default (row C9). It is also the ONLY class in the file whose report
//      asks the card anything: `card&.notable_exception_raised`.
//
// The port's side: its own 500 arm, its own debugger re-raise, and the fact
// that it has no 900 arm at all.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { SERVER_ERROR_HTML } from "../../src/card/render/debug-server-error.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/server-error-500-debugger-arm-ruby-oracle.json"), "utf8"),
) as {
  classPair: Record<string, unknown>;
  debuggerPredicate: Record<
    string,
    {
      codenameConfigured: boolean;
      debuggerCardContent: string | null;
      debuggerOnRaw: number | null;
      debuggerOnTruthy: boolean;
      statusCode: number;
      view: string;
    }
  >;
  report: {
    cardifiedClass: string;
    view: string;
    statusCode: number;
    rendered: { status?: number } | null;
    cardErrorsEntries: Array<{ key: string; message: string }>;
    errorRowCalls: string[];
    notableExceptionRaisedCalled: boolean;
  };
  cardifyElse: Record<
    string,
    { raised: string; cardifiedClass: string; view: string; statusCode: number; renderedStatus: number }
  >;
  rescuePath: Record<
    string,
    {
      debuggerOn: boolean;
      statusCodeTheClassWouldAnswer: number;
      viewTheClassWouldAnswer: string;
      raisedOutOfHandleException: string | null;
      cardErrorCurrent: string | null;
      rendered: { status?: number } | null;
      renderedStatus: number | null;
    }
  >;
  statusCodeConsumers: Array<{ gem: string; belongsToDeckOrCard: boolean; file: string; line: number }>;
  deckOrCardStatusCodeReaders: Array<{
    gem: string;
    belongsToDeckOrCard: boolean;
    file: string;
    line: number;
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

const SET_TYPE_ID = 2;
const JOE_ID = 90;

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";

async function seedServerErrorDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 3, name: "*update", codename: "update", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 18, name: "*default", codename: "default" });
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  // The *password codename card, for the row's own write-surface probe:
  // a +*password whose left card does not exist is the port's own
  // server-error arm (card-action-engine.ts's assertAccountFieldLeftExists,
  // the port of the pinned save that raises before the permission verdict).
  await seedCard(s, { id: 19, name: "*password", codename: "password" });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedServerErrorDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

/** POST a form to the bridge's write surface. */
async function save(
  form: Record<string, string>,
  opts: { ajax?: boolean } = {},
): Promise<{ status: number; body: string; contentType: string | null }> {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Bearer ${joeToken}`,
  };
  if (opts.ajax === true) headers["x-requested-with"] = "XMLHttpRequest";
  const res = await fetch(bridge.url, {
    method: "POST",
    headers,
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get("content-type"),
  };
}

describe("the pinned ServerError pair, and what the debugger flips", () => {
  it("ServerError sits on Card::Error, NOT on UserError, so it is outside the 422 ladder and the roster", () => {
    expect(ORACLE.classPair["serverErrorSuperclass"]).toBe("Card::Error");
    expect(ORACLE.classPair["serverErrorIsUserError"]).toBe(false);
    expect(ORACLE.classPair["serverErrorInRoster"]).toBe(false);
    // The defaults it did NOT inherit.
    expect(ORACLE.classPair["cardErrorDefaultsStatus"]).toBe(422);
    expect(ORACLE.classPair["cardErrorDefaultsView"]).toBe("errors");
  });

  it("THE PREDICATE RETURNS AN INDEX, NOT A BOOLEAN: 0 when the match is at the start", () => {
    const row = ORACLE.debuggerPredicate["contentOnAtIndexZero"]!;
    expect(row.debuggerOnRaw).toBe(0);
    expect(row.debuggerOnTruthy).toBe(true);
    expect(row.statusCode).toBe(900);
    expect(row.view).toBe("debug_server_error");
    // The same word later in the body matches at a different index and
    // answers the same pair - the predicate never inspects the index.
    const later = ORACLE.debuggerPredicate["contentOnLaterInTheBody"]!;
    expect(later.debuggerOnRaw).toBe(25);
    expect(later.statusCode).toBe(900);
  });

  it("BOTH HALVES OF THE PREDICATE MATTER: no codename, or no card, or content off - all 500", () => {
    for (const name of ["noCodename", "codenameWithNoCard", "contentOff"]) {
      const row = ORACLE.debuggerPredicate[name]!;
      expect(row.debuggerOnRaw, name).toBeNull();
      expect(row.statusCode, name).toBe(500);
      expect(row.view, name).toBe("server_error");
    }
    const source = ORACLE.sources["serverErrorClass"]!.map((r) => r.text).join("\n");
    expect(source).toContain("def self.debugger_on?");
    expect(source).toContain("Card::Codename[:debugger] && Card[:debugger]&.content =~ /on");
    expect(source).toContain("debugger_on? ? 900 : 500");
    expect(source).toContain("debugger_on? ? :debug_server_error : :server_error");
  });

  it("ServerError is the CARDIFY ELSE, executed over four exception shapes", () => {
    for (const [name, row] of Object.entries(ORACLE.cardifyElse)) {
      expect(row.cardifiedClass, name).toBe("Card::Error::ServerError");
      expect(row.statusCode, name).toBe(500);
      expect(row.renderedStatus, name).toBe(500);
    }
    expect(Object.keys(ORACLE.cardifyElse)).toEqual([
      "plainStandardError",
      "argumentError",
      "nameError",
      "zeroDivisionError",
    ]);
    const cardify = ORACLE.sources["cardErrorClassCase"]!.map((r) => r.text).join("\n");
    expect(cardify).toContain("else");
    expect(cardify).toContain("Card::Error::ServerError");
  });

  it("IT IS THE ONLY CLASS WHOSE REPORT ASKS THE CARD ANYTHING", () => {
    expect(ORACLE.report.notableExceptionRaisedCalled).toBe(true);
    expect(ORACLE.report.errorRowCalls).toContain("notable_exception_raised");
    expect(ORACLE.report.cardErrorsEntries).toEqual([{ key: "ServerError", message: "boom" }]);
    const source = ORACLE.sources["serverErrorClass"]!.map((r) => r.text).join("\n");
    expect(source).toContain("card&.notable_exception_raised");
  });
});

describe("THE FINDING: the 900 arm cannot be reached from the pinned controller", () => {
  it("the deck and the card gem read status_code in exactly two places", () => {
    expect(ORACLE.deckOrCardStatusCodeReaders).toEqual([
      {
        gem: "card",
        belongsToDeckOrCard: true,
        file: "card-1.110.0/lib/card/error.rb",
        line: 17,
      },
      {
        gem: "decko",
        belongsToDeckOrCard: true,
        file: "decko-0.20.0/lib/card_controller/errors.rb",
        line: 23,
      },
    ]);
    // The first is the class_attribute declaration; the second is the show
    // handoff. Framework reads (Rails, Rack) are in the sweep and are
    // classified separately - this row's claim is about the deck's and the
    // card gem's reads.
    expect(ORACLE.statusCodeConsumers.some((entry) => entry.belongsToDeckOrCard)).toBe(true);
    expect(ORACLE.statusCodeConsumers.some((entry) => !entry.belongsToDeckOrCard)).toBe(true);
  });

  it("the handoff sits BEHIND the re-raise, and the re-raise asks the SAME debugger test", () => {
    const handler = ORACLE.sources["handleException"]!.map((r) => r.text).join("\n");
    expect(handler).toContain("raise exception if debug_exception?(exception)");
    expect(handler).toContain("show error.class.view, error.class.status_code");
    expect(handler).toContain("!e.is_a?(Card::Error::UserError)");
    expect(handler).toContain("Card::Codename[:debugger]");
    expect(handler).toContain("Card[:debugger]&.content =~ /on");
  });

  it("DEBUGGER OFF: the class would answer 500, and the render carries 500", () => {
    const row = ORACLE.rescuePath["debuggerOff"]!;
    expect(row.statusCodeTheClassWouldAnswer).toBe(500);
    expect(row.viewTheClassWouldAnswer).toBe("server_error");
    expect(row.raisedOutOfHandleException).toBeNull();
    expect(row.cardErrorCurrent).toBe("Card::Error::ServerError");
    expect(row.renderedStatus).toBe(500);
  });

  it("DEBUGGER ON: the class would answer 900, and NOTHING rendered", () => {
    const row = ORACLE.rescuePath["debuggerOn"]!;
    // The class methods answer 900 and :debug_server_error...
    expect(row.statusCodeTheClassWouldAnswer).toBe(900);
    expect(row.viewTheClassWouldAnswer).toBe("debug_server_error");
    // ... and the rescue re-raised before reading either, so no render, no
    // redirect, and report never ran (Card::Error.current is null).
    expect(row.raisedOutOfHandleException).toBe("RuntimeError: boom");
    expect(row.rendered).toBeNull();
    expect(row.renderedStatus).toBeNull();
    expect(row.cardErrorCurrent).toBeNull();
  });

  it("the :debug_server_error VIEW does exist, so it is the STATUS that has no reachable reader", () => {
    const view = ORACLE.sources["debugServerErrorView"]!.map((r) => r.text).join("\n");
    expect(view).toContain("view :debug_server_error");
    const artifact = ORACLE.rigArtifacts.find((line) => line.includes("debug_server_error VIEW is quoted"));
    expect(artifact).toBeDefined();
  });
});

describe("the port's 500, against the pinned one", () => {
  it("the port's status table answers 500 for its server-error code", () => {
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    expect(source).toContain('if (code === "server-error") return 500;');
    expect(ORACLE.report.statusCode).toBe(500);
    expect(ORACLE.report.view).toBe("server_error");
  });

  it("NAMED ABSENCE, and it is NOT a gap: the port has no 900 arm to miss", () => {
    // The pinned 900 is unreachable from the pinned controller, so a port
    // without it is not behind: there is no request shape on either side
    // that the 900 answers. The port has neither a debugger card nor a
    // Codename registry, so it has no predicate to read.
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    expect(source).not.toContain("900");
    expect(ORACLE.rescuePath["debuggerOn"]!.renderedStatus).toBeNull();
  });

  it("the port's re-raise does not exist either, and that is the port's one real difference", () => {
    // Where the pinned deck re-raises a server error for a debugger that is
    // on, the port cannot: it has no debugger test. So on a deck whose
    // debugger is on the two would differ - the pinned one re-raises into
    // Rails' own debugger page and the port answers its own 500. Named as a
    // scope difference in the DECK, not a defect to fix here.
    expect(ORACLE.rescuePath["debuggerOn"]!.raisedOutOfHandleException).not.toBeNull();
    expect(ORACLE.rescuePath["debuggerOff"]!.raisedOutOfHandleException).toBeNull();
    expect(ORACLE.rigArtifacts.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ROUND SEVEN: the row's remaining cells, measured on the port's OWN
// surfaces. The row's earlier pins read the port's STATUS TABLE and its
// ABSENCES out of the source; the two cells below are the ones that can
// only be answered by RUNNING the port.
// ---------------------------------------------------------------------------

describe("the port's 500 on the REAL write surface (C14)", () => {
  it("a server error answers 500, the pinned class's own status, over HTTP", async () => {
    // The port's own server-error arm: a +*password whose LEFT card does
    // not exist is the shape whose save raises before the permission
    // verdict (card-action-engine.ts's assertAccountFieldLeftExists, the
    // port of the pinned save whose account salt read raises). Ruby
    // cardifies that raise as Card::Error::ServerError (card/error.rb:46-65
    // is the cardify ELSE, card/error.rb:167-177) and the controller shows
    // that class's view at that class's status (decko
    // lib/card_controller/errors.rb:22-23): 500.
    const res = await save({ "card[name]": "NoSuchLeft+*password" });
    expect(res.status).toBe(500);
    // The pinned class's view, at the pinned status.
    expect(ORACLE.rescuePath["debuggerOff"]!.statusCodeTheClassWouldAnswer).toBe(500);
    expect(ORACLE.rescuePath["debuggerOff"]!.viewTheClassWouldAnswer).toBe("server_error");
  });

  it("the same request in the JSON format answers the same 500 in the JSON shape", async () => {
    const res = await fetch(`${bridge.url}/C14_Server_Error.json`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
      },
      body: new URLSearchParams({ "card[name]": "NoSuchLeft+*password" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(500);
    const payload = JSON.parse(await res.text()) as { error_status: number };
    expect(payload.error_status).toBe(500);
  });

  it("the port's :server_error VIEW is the pinned view's bytes (the deck's Wild Card block)", () => {
    // card-mod-format set/all/html/server_error.haml as the live site
    // serves it; the port's own view module holds those bytes.
    expect(SERVER_ERROR_HTML).toContain("Wild Card!");
    expect(SERVER_ERROR_HTML).toContain("500 Server Error");
    // The pinned class's view answer, with the debugger off.
    expect(ORACLE.rescuePath["debuggerOff"]!.viewTheClassWouldAnswer).toBe("server_error");
  });
});

describe("C14's remaining cells, named with their exact dependency", () => {
  it("the port has no debugger card, so it cannot reproduce the pinned re-raise", () => {
    // The pinned predicate is `Card::Codename[:debugger] &&
    // Card[:debugger]&.content =~ /on` (card/error.rb:57-59): it needs a
    // card whose codename is "debugger" and that card's content. The port
    // has no such card concept at all: the codename registry it does have
    // is never asked for "debugger", so the predicate has no input.
    const predicate = ORACLE.sources["serverErrorClass"]!.map((r) => r.text).join("\n");
    expect(predicate).toContain("Card::Codename[:debugger]");
    expect(predicate).toContain("Card[:debugger]&.content =~ /on");
    // The port's own answer for that shape is the 500 it always answers,
    // and the pinned deck's answer for the same shape is the re-raise.
    expect(ORACLE.rescuePath["debuggerOn"]!.raisedOutOfHandleException).not.toBeNull();
    expect(ORACLE.rescuePath["debuggerOn"]!.renderedStatus).toBeNull();
  });

  it("the port's 900 arm stays absent, and the pinned 900 stays unreachable", () => {
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    expect(source).not.toContain("900");
    // The pinned deck reads the status in exactly two places, and the one
    // that would answer 900 sits behind the re-raise.
    expect(ORACLE.deckOrCardStatusCodeReaders.map((entry) => entry.line)).toEqual([17, 23]);
  });
});
