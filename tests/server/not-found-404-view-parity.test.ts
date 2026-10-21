// The NotFound pair (404, :not_found), measured against the PINNED card
// gem's own class, and the SECOND 404 producer measured against the PINNED
// format's own view_for_unknown.
//
// The completeness register's C10 row grades the port on "NotFound 404 +
// :not_found view (error.rb:88-91)". The row names a class whose answer is
// two class_attributes, so this file measures four things rather than the
// two lines:
//
//   1. THE PAIR, FROM THE CLASS, THROUGH THE PINNED RESCUE. errors.rb:23
//      reads `error.class.view` and `error.class.status_code`, so what show
//      receives is the class's own answer and not the instance's.
//   2. THE INHERITANCE IS LOAD-BEARING. NotFound is NOT in
//      UserError.user_error_classes (error.rb:70-74) - the roster names
//      UserError itself - so NotFound is caught only because it is a
//      UserError SUBCLASS, and CodenameNotFound (:93-94) declares no pair of
//      its own and inherits both.
//   3. THE RAISE SITE. `raise Card::Error::NotFound unless card`
//      (decko-0.20.0/lib/card_controller/rest.rb:51) is the deck's own 404
//      producer, and it runs BEFORE record_as_main.
//   4. THE SECOND 404 PRODUCER, ON THE FORMAT.
//      Card::Format::Error#view_for_unknown (card-1.110.0/lib/card/
//      format/error.rb:18-25) answers :not_found and writes
//      root.error_status = 404 for a main page at root - with no exception
//      anywhere, and without reading the card at all. The port's
//      counterpart is src/card/render/format.ts:1673-1690 and its
//      pageErrorStatus is the port's root.error_status.
//
// The port's two 404s are both executed here: the write surface's own 404
// (the bad_mark NotFound at write-routes.ts:1829) over HTTP, and the
// render engine's unknown-card 404 through renderPageWithStatus.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { renderPageWithStatus } from "../../src/card/render/page.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/not-found-404-view-ruby-oracle.json"), "utf8"),
) as {
  classes: Record<string, unknown>;
  rescueRow: {
    view: string;
    statusCode: number;
    rendered: { body?: string; status?: number; content_type?: string } | null;
    pageCalls: Array<{ view: string; format: string }>;
  };
  loadCardRaiseSite: {
    uriFetchAsks: Array<Record<string, string>>;
    raised: string | null;
    raisedClassStatusCode: number | null;
    raisedClassView: string | null;
    mainNameWrites: unknown[];
  };
  viewForUnknown: Array<{
    label: string;
    settingView: string | null;
    view: string;
    rootErrorStatus: number | null;
    rootErrorStatusWrites: number[];
    calls: string[];
    vooCalls: string[];
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

/** The rule deck the write surface needs for a signed-in create path. */
async function seedNotFoundDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  // The built-in code layout nests :header, :footer and the sidebar as
  // codename nests (src/card/render/page.ts:1044-1060), so a page render -
  // even of a known card - needs those codenames to exist.
  await seedCard(s, { id: 200, name: "header", codename: "header" });
  await seedCard(s, { id: 201, name: "footer", codename: "footer" });
  await seedCard(s, { id: 202, name: "sidebar", codename: "sidebar" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedNotFoundDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
  bridge = await makeWriteRouteServer(storage, ctx);
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

describe("the pinned NotFound pair, read off the class and through the rescue", () => {
  it("the class owns (404, :not_found), and its parent owns (422, :errors)", () => {
    expect(ORACLE.classes["notFoundStatusCode"]).toBe(404);
    expect(ORACLE.classes["notFoundView"]).toBe("not_found");
    // The default the subclasses override.
    expect(ORACLE.classes["userErrorStatusCode"]).toBe(422);
    expect(ORACLE.classes["userErrorView"]).toBe("errors");
  });

  it("the PINNED RESCUE hands show exactly that pair, and the render carries both", () => {
    expect(ORACLE.rescueRow.view).toBe("not_found");
    expect(ORACLE.rescueRow.statusCode).toBe(404);
    expect(ORACLE.rescueRow.rendered!.status).toBe(404);
    expect(ORACLE.rescueRow.pageCalls[0]!.view).toBe(":not_found");
  });

  it("THE INHERITANCE IS LOAD-BEARING: NotFound is not in the roster, only its parent is", () => {
    expect(ORACLE.classes["notFoundIsUserErrorSubclass"]).toBe(true);
    expect(ORACLE.classes["notFoundInUserErrorRoster"]).toBe(false);
    expect(ORACLE.classes["userErrorRoster"]).toContain("Card::Error::UserError");
    // CodenameNotFound declares NEITHER value and inherits both.
    expect(ORACLE.classes["codenameNotFoundDeclaresOwnStatus"]).toBe(false);
    expect(ORACLE.classes["codenameNotFoundDeclaresOwnView"]).toBe(false);
    expect(ORACLE.classes["codenameNotFoundIsNotFoundSubclass"]).toBe(true);
    expect(ORACLE.classes["codenameNotFoundStatusCode"]).toBe(404);
    expect(ORACLE.classes["codenameNotFoundView"]).toBe("not_found");
  });

  it("404 is not this row's alone: BadAddress is 404 with a DIFFERENT view", () => {
    expect(ORACLE.classes["badAddressStatusCode"]).toBe(404);
    expect(ORACLE.classes["badAddressView"]).toBe("bad_address");
  });

  it("the pinned raise site asks the fetch first, then raises, and never records a main name", () => {
    const row = ORACLE.loadCardRaiseSite;
    expect(row.uriFetchAsks).toEqual([{ mark: "Ghost" }]);
    expect(row.raised).toBe("Card::Error::NotFound: Card::Error::NotFound");
    expect(row.raisedClassStatusCode).toBe(404);
    expect(row.raisedClassView).toBe("not_found");
    // record_as_main (rest.rb:53) is on the far side of the raise.
    expect(row.mainNameWrites).toEqual([]);
    const source = ORACLE.sources["loadCard"]!.map((r) => r.text).join("\n");
    expect(source).toContain("raise Card::Error::NotFound unless card");
  });

  it("the pinned class source declares the pair, quoted", () => {
    const source = ORACLE.sources["notFoundAndBadAddressClasses"]!.map((r) => r.text).join("\n");
    expect(source).toContain("class NotFound < UserError");
    expect(source).toContain("self.status_code = 404");
    expect(source).toContain("self.view = :not_found");
    expect(source).toContain("class CodenameNotFound < NotFound");
    expect(source).toContain("class BadAddress < UserError");
    expect(source).toContain("self.view = :bad_address");
  });
});

describe("the pinned SECOND 404 producer: view_for_unknown, with no exception at all", () => {
  it("main page at root: :not_found and root.error_status 404", () => {
    const row = ORACLE.viewForUnknown[0]!;
    expect(row.view).toBe("not_found");
    expect(row.rootErrorStatusWrites).toEqual([404]);
    expect(row.calls).toEqual(["main?", "voo", "root", ":rootErrorStatusRead"]);
  });

  it("the 404 arm does not read the setting view at all", () => {
    const row = ORACLE.viewForUnknown[1]!;
    expect(row.settingView).toBeNull();
    expect(row.view).toBe("not_found");
    expect(row.rootErrorStatusWrites).toEqual([404]);
  });

  it("off the root view, or off the main page, the setting view answers and NO status is written", () => {
    const offRoot = ORACLE.viewForUnknown[2]!;
    expect(offRoot.view).toBe("errors");
    expect(offRoot.rootErrorStatusWrites).toEqual([]);
    const offMain = ORACLE.viewForUnknown[3]!;
    expect(offMain.view).toBe("errors");
    expect(offMain.rootErrorStatusWrites).toEqual([]);
    // And with no setting view on either arm, the else arm's own :unknown.
    expect(ORACLE.viewForUnknown[4]!.view).toBe("unknown");
  });

  it("DEPTH IS NOT PART OF THIS TEST, and the card is never read", () => {
    // The depth-3 row still took the 404 arm, and the recorded view-opts
    // calls show `depth` was never even asked for.
    expect(ORACLE.viewForUnknown[2]!.vooCalls).toEqual(["root?"]);
    expect(ORACLE.viewForUnknown[0]!.vooCalls).toEqual(["root?"]);
    // A KNOWN card gives the same answer, because `card` is never asked.
    expect(ORACLE.viewForUnknown[5]!.view).toBe("not_found");
    expect(ORACLE.viewForUnknown[5]!.calls).not.toContain("card");
    const source = ORACLE.sources["formatViewForUnknown"]!.map((r) => r.text).join("\n");
    expect(source).toContain("if main? && voo.root?");
    expect(source).toContain("root.error_status = page_status_for_unknown");
    expect(source).toContain("page_view_for_unknown");
    expect(source).toContain("setting_view || :unknown");
  });
});

describe("the port's two 404s, against the pinned two", () => {
  it("the write surface's 404: a mark that resolves to no id", async () => {
    const res = await fetch(`${bridge.url}/~999999.json`, {
      method: "PUT",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
      },
      body: new URLSearchParams({ "card[content]": "into the void" }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(404);
    expect((JSON.parse(body) as { error_status: number }).error_status).toBe(404);
    expect(ORACLE.loadCardRaiseSite.raisedClassStatusCode).toBe(404);
  });

  it("NAMED DIVERGENCE: the port REFUSES an unknown card before the 404 arm can run", async () => {
    // The pinned format's view_for_unknown answers :not_found at 404 for an
    // unknown main card (measured above). On the port both render entry
    // points refuse the card FIRST - the fetch raises `card not found:
    // <name>` at src/card/render/page.ts:396 before a RenderFormat is built -
    // so the port's own main+root 404 arm (src/card/render/format.ts
    // viewForUnknown, the block that writes pageErrorStatus) never runs on
    // this path.
    let pageError: string | null = null;
    try {
      await renderPageWithStatus(storage!.engine, "C10 No Such Card");
      pageError = null;
    } catch (error) {
      pageError = String(error);
    }
    expect(pageError).toContain("card not found: C10 No Such Card");

    // The slot render refuses the same way, so this is the render surface's
    // single refusal and not the page entry's quirk.
    let slotError: string | null = null;
    try {
      await storage!.engine.render("C10 No Such Card", "open");
      slotError = null;
    } catch (error) {
      slotError = String(error);
    }
    expect(slotError).toContain("card not found: C10 No Such Card");

    // The pinned side of the same shape, for the record.
    expect(ORACLE.viewForUnknown[0]!.rootErrorStatus).toBe(404);
  });

  it("the port's main+root 404 arm EXISTS and writes pageErrorStatus; its header comment said otherwise", async () => {
    // A KNOWN card renders at 200 on the same engine and through the same
    // page entry point, so the 404 the pinned arm would write is the only
    // difference between the two - and it is the unknown-card refusal that
    // keeps the port's arm from ever being reached.
    const known = await renderPageWithStatus(storage!.engine, "Basic");
    expect(known.status).toBe(200);

    // The port's own arm, read off its source: the pair and the status write
    // are both there, which is what the corrected comment now says.
    const source = readFileSync(path.join(REPO, "src/card/render/format.ts"), "utf8");
    expect(source).toContain("this.engine.pageErrorStatus = canCreate ? 200 : 404;");
    expect(source).toContain('return canCreate ? "new" : "not_found";');
    // And the comment above it no longer claims the arm is absent.
    expect(source).not.toContain("is not ported: the capture never renders an unknown MAIN card");
  });

  it("the port's status table answers 404 for its not-found code, and the write surface uses it", () => {
    // errorStatus (write-routes.ts:1097-1103) is the port's own class
    // table: not-found 404, server-error 500, conflict 409,
    // anonymous-actor/permission-denied 403, everything else 422. The four
    // executed HTTP answers above are the running half of this; this is the
    // mapping the pinned class table is read against.
    expect(ORACLE.classes["notFoundStatusCode"]).toBe(404);
    expect(ORACLE.classes["codenameNotFoundStatusCode"]).toBe(404);
    expect(ORACLE.classes["userErrorStatusCode"]).toBe(422);
  });
});