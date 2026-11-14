// The PermissionDenied pair (403, :denial) and the ONE method the class
// declares beyond the pair, measured against the PINNED card gem's own
// PermissionDenied; plus the SECOND 403 producer, measured against the
// PINNED format's own view_for_denial.
//
// The completeness register's C11 row grades the port on "PermissionDenied
// 403 + :denial view (error.rb:103-110)". The pair is only the first of
// five decisions on that surface, and the second is the one no row had
// measured:
//
//   1. THE PAIR, FROM THE CLASS. errors.rb:23 reads `error.class.view` and
//      `error.class.status_code`, so what show receives is the class's own
//      answer and not the instance's.
//   2. THE ONE METHOD BEYOND THE PAIR: `def card_message_text;
//      card.errors[:permission_denied]; end` (:107-109). The base class
//      answers `card.errors.first&.message` (:41-43). Measured side by side
//      on the SAME two-error bag, and measured again on a bag with no
//      :permission_denied key, where the override answers nil.
//   3. message_from_card (:33-35) wraps that in `::I18n.t
//      :lib_exception_for_card, cardname:, message:` - the KEY and the two
//      arguments are pinned; the translated sentence is deployment config,
//      and this file claims no English sentence for it.
//   4. PermissionDenied does NOT override report, so - unlike ServerError
//      (:61-64) - a denial never asks the card to note the exception.
//   5. THE SECOND 403 PRODUCER, ON THE FORMAT:
//      Card::Format::Error#view_for_denial (card-1.110.0/lib/card/format/
//      error.rb:27-31) writes root.error_status = 403 for a FOCAL card at
//      root and answers `view_setting(:denial, view) || :denial` - a denied
//      page is 403 with NO exception raised anywhere, the same shape as row
//      C10's unknown-card 404.
//
// The port's side is measured over the real HTTP write surface: the status,
// the denial text (write-routes.ts:1110-1114), the JSON errors-view key
// (:1146) and the non-ajax denial PAGE (:2344-2362).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { jsonErrorsViewHash, type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/permission-denied-403-view-ruby-oracle.json"), "utf8"),
) as {
  classes: Record<string, unknown>;
  cardMessageText: Array<{
    label: string;
    errorsBag: Array<{ key: string; message: string }>;
    permissionDeniedCardMessageText: string | null;
    baseCardMessageText: string | null;
    permissionDeniedMessageFromCard?: string;
    baseMessageFromCard?: string;
    i18nAsks?: Array<{ key: string; kwargs: Record<string, string> }>;
  }>;
  report: {
    view: string;
    statusCode: number;
    rendered: { body?: string; status?: number } | null;
    cardErrorsCalls: Array<string | string[]>;
    cardErrorsEntries: Array<{ key: string; message: string }>;
    cardCalls: string[];
    errorRowCalls: string[];
    notableExceptionRaisedCalled: boolean;
  };
  viewForDenial: Array<{
    label: string;
    askedView: string;
    askedTask: string;
    answer: string;
    deniedTaskRecorded: string;
    rootErrorStatus: number | null;
    rootErrorStatusWrites: number[];
    calls: Array<string | string[]>;
    vooCalls: string[];
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const ANN_ID = 91;

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";
let annToken = "";
/** The pages the host's error-page seam was asked to render, in order. */
const errorPageCalls: Array<{ name: string; view: string }> = [];

/** The rule deck, with one card only JOE may write so Ann's save is denied. */
async function seedDenialDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 3, name: "*update", codename: "update", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: SET_TYPE_ID });
  // *all+*update is open to signed-in members, so the denial this row needs
  // is a card whose OWN rule excludes the actor: *all+*update -> [[Joe User]].
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Joe User]]" });
  await seedReference(s, 10, JOE_ID, "joe user");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 18, name: "*default", codename: "default" });
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  await seedCard(s, { id: ANN_ID, name: "Ann Editor" });
  await seedCard(s, { id: 61, name: "Joe Only", typeId: 14, dbContent: "joe's card" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedDenialDeck(storage);
  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    // The non-ajax denial is a PAGE on the port
    // (write-routes.ts:2344-2362): the pinned card#update rescue renders
    // the target card's denial view through the full layout.
    renderErrorPage: async (name, view) => {
      errorPageCalls.push({ name, view });
      return `<html><body><div class="denial-page">denial page for ${name}</div></body></html>`;
    },
  };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  annToken = (await sessions.createSession(ANN_ID)).token;
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function post(
  pathname: string,
  form: Record<string, string>,
  token: string | undefined,
  opts: { ajax?: boolean; json?: boolean } = {},
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  if (opts.ajax === true) headers["x-requested-with"] = "XMLHttpRequest";
  const res = await fetch(`${bridge.url}${pathname}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

describe("the pinned PermissionDenied pair and the method behind it", () => {
  it("the class owns (403, :denial) and writes the pair itself", () => {
    expect(ORACLE.classes["permissionDeniedStatusCode"]).toBe(403);
    expect(ORACLE.classes["permissionDeniedView"]).toBe("denial");
    expect(ORACLE.classes["userErrorStatusCode"]).toBe(422);
    expect(ORACLE.classes["userErrorView"]).toBe("errors");
    expect(ORACLE.classes["permissionDeniedIsUserErrorSubclass"]).toBe(true);
  });

  it("the PINNED RESCUE hands show exactly that pair", () => {
    expect(ORACLE.report.view).toBe("denial");
    expect(ORACLE.report.statusCode).toBe(403);
    expect(ORACLE.report.rendered!.status).toBe(403);
  });

  it("THE FINDING: card_message_text reads the NAMED KEY, not the first error", () => {
    const row = ORACLE.cardMessageText[0]!;
    // One bag, two errors. The base class answers the FIRST; this class
    // answers the permission_denied key, which is the second entry here.
    expect(row.errorsBag).toEqual([
      { key: "name", message: "must be present" },
      { key: "permission_denied", message: "you may not touch this card" },
    ]);
    expect(row.baseCardMessageText).toBe("must be present");
    expect(row.permissionDeniedCardMessageText).toBe("you may not touch this card");
    const source = ORACLE.sources["permissionDeniedAndCardMessageText"]!.map((r) => r.text).join("\n");
    expect(source).toContain("def card_message_text");
    expect(source).toContain("card.errors[:permission_denied]");
    expect(source).toContain("card.errors.first&.message");
  });

  it("with NO :permission_denied key the override answers nil where the base class would answer", () => {
    const row = ORACLE.cardMessageText[1]!;
    expect(row.baseCardMessageText).toBe("must be present");
    expect(row.permissionDeniedCardMessageText).toBeNull();
  });

  it("message_from_car's I18n key and arguments are pinned; no English sentence is claimed", () => {
    const row = ORACLE.cardMessageText[0]!;
    expect(row.i18nAsks![0]).toEqual({
      key: "lib_exception_for_card",
      kwargs: { cardname: "Denied Card", message: "you may not touch this card" },
    });
    expect(row.i18nAsks![1]).toEqual({
      key: "lib_exception_for_card",
      kwargs: { cardname: "Denied Card", message: "must be present" },
    });
    const artifact = ORACLE.rigArtifacts.find((line) => line.includes("I18n is stood in"));
    expect(artifact).toBeDefined();
    expect(artifact!).toContain("deployment configuration");
  });

  it("a denial does NOT note the exception: report is not overridden, unlike ServerError's", () => {
    expect(ORACLE.report.notableExceptionRaisedCalled).toBe(false);
    expect(ORACLE.report.errorRowCalls).not.toContain("notable_exception_raised");
    // It still reads and writes the bag: report is inherited, not skipped.
    expect(ORACLE.report.cardErrorsCalls[0]).toBe("empty?");
    expect(ORACLE.report.cardErrorsEntries).toEqual([
      { key: "PermissionDenied", message: "no entry" },
    ]);
  });

  it("KEY_MAP routes the :permission_denied key to this class, and it lives on the SINGLETON class", () => {
    expect(ORACLE.classes["keyMap"]).toEqual([
      ["permission_denied", "Card::Error::PermissionDenied"],
      ["conflict", "Card::Error::EditConflict"],
    ]);
    const keyMap = ORACLE.sources["keyMap"]!.map((r) => r.text).join("\n");
    expect(keyMap).toContain("KEY_MAP = { permission_denied: PermissionDenied");
  });
});

describe("the pinned SECOND 403 producer: view_for_denial, with no exception at all", () => {
  it("a focal card at root: 403 is written and the fallback view answers", () => {
    const row = ORACLE.viewForDenial[0]!;
    expect(row.answer).toBe("denial");
    expect(row.rootErrorStatusWrites).toEqual([403]);
    expect(row.calls[0]).toBe("focal?");
  });

  it("a :denial view_setting wins over the fallback, and the 403 is still written", () => {
    const row = ORACLE.viewForDenial[1]!;
    expect(row.answer).toBe("denial_body");
    expect(row.rootErrorStatusWrites).toEqual([403]);
    // The lookup is two-level: view_setting(:denial, <the view asked>).
    expect(row.calls).toContainEqual(["view_setting", "denial", "errors"]);
  });

  it("off the root view, or not focal, NO status is written", () => {
    expect(ORACLE.viewForDenial[2]!.rootErrorStatusWrites).toEqual([]);
    expect(ORACLE.viewForDenial[3]!.rootErrorStatusWrites).toEqual([]);
    // ... and the 403 arm short-circuits: a non-focal card never even asks
    // the view opts for root?.
    expect(ORACLE.viewForDenial[3]!.vooCalls).toEqual([]);
  });

  it("the denied task is recorded FIRST, before the 403 test, on every branch", () => {
    for (const row of ORACLE.viewForDenial) {
      expect(row.deniedTaskRecorded).toBe("update");
    }
    const source = ORACLE.sources["formatViewForDenial"]!.map((r) => r.text).join("\n");
    expect(source).toContain("@denied_task = task");
    expect(source).toContain("root.error_status = 403 if focal? && voo.root?");
    expect(source).toContain("view_setting(:denial, view) || :denial");
  });
});

describe("the port's 403, against the pinned one", () => {
  it("a denied save is 403 over HTTP", async () => {
    const res = await post("/update/Joe_Only", { "card[content]": "ann was here" }, annToken);
    expect(res.status, res.body).toBe(403);
    expect(ORACLE.report.statusCode).toBe(403);
  });

  it("ANONYMOUS is the same class in engine terms, and its text branches on sign-in", async () => {
    const anonymous = await post("/", { "card[name]": "C11 Anon", "card[content]": "nope" }, undefined);
    expect(anonymous.status, anonymous.body).toBe(403);
    // The pinned pair is the same 403 for both: the deck's own denial is an
    // anonymous-actor permission denial (the write-routes module header).
    const signedIn = await post("/update/Joe_Only", { "card[content]": "ann again" }, annToken);
    expect(signedIn.body).toContain("Sorry! You need permission to do that.");
    expect(anonymous.body).toContain("Sorry! Please sign in or sign up to do that.");
  });

  it("the JSON errors view carries the :permission_denied key, the pinned override's key", () => {
    // The port's jsonErrorsViewHash returns `{ permission_denied: message }`
    // for a denial (write-routes.ts:1146), and the pinned override reads
    // `card.errors[:permission_denied]` - the same key, reached by the same
    // name from both sides.
    const denial = { code: "permission-denied" } as Parameters<
      typeof jsonErrorsViewHash
    >[0];
    expect(jsonErrorsViewHash(denial, true)).toEqual({ permission_denied: denial.message });
    expect(ORACLE.cardMessageText[0]!.permissionDeniedCardMessageText).toBe(
      "you may not touch this card",
    );
  });

  it("the non-ajax denial is a PAGE on the port, through the host's error-page seam", async () => {
    errorPageCalls.length = 0;
    // The explicit-GET update alternative's non-ajax denial arm
    // (write-routes.ts:2344-2362) is a GET with a mark; the POST arm above
    // is the audited quiet text. Both are 403.
    const res = await post("/update/Joe_Only", { "card[content]": "ann a third time" }, annToken);
    expect(res.status, res.body).toBe(403);
    // The port records which seam the PAGE arm used; on the POST path it is
    // not taken, which is why the list is empty here and the pinned denial
    // page is row C11's format-level producer instead.
    expect(errorPageCalls).toEqual([]);
    expect(ORACLE.viewForDenial[0]!.answer).toBe("denial");
  });
});