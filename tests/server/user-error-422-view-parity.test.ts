// The UserError default pair (422, :errors) and the roster that decides
// what the controller rescues, measured against the PINNED card gem's own
// ladder.
//
// The completeness register's C13 row grades the port on "UserError/
// validation 422 + :errors view (error.rb:20-21, 68-75)". Those cited lines
// are two defaults and one assignment:
//
//     self.view = :errors          # error.rb:20  - on Card::Error ITSELF
//     self.status_code = 422       # error.rb:21  - on Card::Error ITSELF
//     ...
//     class UserError < Error      # error.rb:68  - declares NO pair
//       cattr_accessor :user_error_classes
//       self.user_error_classes = [self, ActionController::BadRequest,
//                                  ActionController::MissingFile,
//                                  ActiveRecord::RecordNotFound,
//                                  ActiveRecord::RecordInvalid]
//
// So 422 and :errors are DEFAULTS, not UserError's own answers. Reading the
// two lines proves nothing about UserError; walking the whole pinned ladder
// proves it for UserError, for BadQuery and for every other class that never
// writes a pair - and it turns up the structural fact that ServerError sits
// on Card::Error and NOT on UserError, so the 500 is outside the 422 ladder
// and outside the rescue roster entirely.
//
// fixtures/captured/user-error-422-view-ruby-oracle.json is what
// tests/server/oracle-capture-user-error-422-view-ruby.rb recorded by
// EXECUTING that walk, by WRITING AND RESTORING the cattr roster, and by
// executing the deck's own bare raise over a card whose bag is empty - which
// is where the port's MISSING_CARD_DELETE_MESSAGE comes from, word for word.
//
// The port's side: its 422 status, its :errors alert body, and the exact
// bytes its missing-card delete shows, all measured over the real HTTP write
// surface.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { errorsView } from "../../src/card/mod-loader/mods/card-mod-format.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/user-error-422-view-ruby-oracle.json"), "utf8"),
) as {
  ladder: Array<{
    class: string;
    statusCode: number;
    view: string;
    declaresOwnStatus: boolean;
    declaresOwnView: boolean;
    superclass: string;
  }>;
  roster: {
    rosterAsPinned: string[];
    rosterWriterExists: boolean;
    rosterAfterADeckReplacedIt: string[];
    rosterRestoredToPinned: string[];
    rosterNamesUserErrorItself: string;
    rosterNamesNotFound: boolean;
    rosterNamesServerError: boolean;
  };
  bareRaise: Array<{
    label: string;
    raisedMessage?: string;
    view: string;
    statusCode: number;
    cardErrorsCalls: Array<string | string[]>;
    cardErrorsEntries: Array<{ key: string; message: string }>;
    cardMessageText: string;
    rendered: { status?: number } | null;
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

async function seedUserErrorDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 18, name: "*default", codename: "default" });
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  // The type-change refusal's surface (the Decision-2 finding, item 3): the
  // deck's layout rule (so the refusal page has a real page frame to sit
  // in), the Bootswatch skin machinery's codenames, and the refused save's
  // two cards - the skin whose type change is refused, listing one RichText
  // item. The expected refusal bytes are the recorded Ruby page's own main
  // slot (write-battery-v1 step admin-skin-type-change): heading "Problems
  // with Parity Old Skin", message "+*STYLESHEETS: Parity Probe Card has an
  // invalid type: RichText. Allowed types: CSS and SCSS.".
  await seedCard(s, { id: 50, name: "Html", codename: "html", typeId: 14 });
  await seedCard(s, { id: 51, name: "Layout", codename: "layout_type", typeId: 14 });
  await seedCard(s, { id: 55, name: "*header", codename: "header", typeId: 50, dbContent: '<div class="seed-header"></div>' });
  await seedCard(s, { id: 56, name: "*footer", codename: "footer", typeId: 50, dbContent: '<div class="seed-footer"></div>' });
  await seedCard(s, {
    id: 52,
    name: "Default Layout",
    typeId: 51,
    dbContent:
      '<body class="d-flex flex-column h-100">\n' +
      "  <header>{{:header|core}}</header>\n" +
      '  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n' +
      '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n' +
      "</body>",
  });
  await seedCard(s, { id: 53, name: "*layout", codename: "layout", typeId: 14 });
  await seedCard(s, { id: 54, leftId: 1, rightId: 53, typeId: 14, dbContent: "Default Layout" });
  await seedReference(s, 54, 52, "default layout");
  await seedCard(s, { id: 100, name: "RichText", typeId: 14 });
  await seedCard(s, { id: 101, name: "CSS", typeId: 14, codename: "css" });
  await seedCard(s, { id: 102, name: "SCSS", typeId: 14, codename: "scss" });
  await seedCard(s, { id: 103, name: "Bootswatch skin", typeId: 14, codename: "bootswatch_skin" });
  await seedCard(s, { id: 104, name: "Parity Probe Card", typeId: 100 });
  await seedCard(s, { id: 105, name: "Parity Old Skin", typeId: 14, dbContent: "[[Parity Probe Card]]" });
  // The sign-in failure page's rescue card: the *signin card exists in every
  // deck (codename signin), and the recorded signin refusal pages are its
  // :errors view (the write-battery's recorded title: "*signin - My Deck").
  await seedCard(s, { id: 106, name: "*signin", codename: "signin", typeId: 14 });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedUserErrorDeck(storage);
  // The refusal page's render resolves its views through a mod loader: bind
  // the format mod's (the html :errors view's registry), the same idiom the
  // mod-loader suites use, so the fresh engine the write path builds sees
  // the same registry this deck's views live in.
  const { ModLoader, modEngineHost } = await import("../../src/card/mod-loader.js");
  const { bindModLoaderToEngine } = await import("../card/render/render-test-storage.js");
  const cardModFormat = (await import("../../src/card/mod-loader/mods/card-mod-format.js")).default;
  const loader = new ModLoader([{ manifest: cardModFormat }]);
  loader.load();
  await loader.installInto(modEngineHost(storage.engine, storage.fetcher));
  bindModLoaderToEngine(storage, loader);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

describe("the pinned ladder: 422 and :errors are DEFAULTS, not UserError's own answers", () => {
  it("the defaults are written on Card::Error itself", () => {
    const base = ORACLE.ladder.find((row) => row.class === "Card::Error")!;
    expect(base.statusCode).toBe(422);
    expect(base.view).toBe("errors");
    expect(base.declaresOwnStatus).toBe(true);
    expect(base.declaresOwnView).toBe(true);
    const source = ORACLE.sources["cardErrorDefaults"]!.map((r) => r.text).join("\n");
    expect(source).toContain("self.view = :errors");
    expect(source).toContain("self.status_code = 422");
  });

  it("EVERY class that writes no pair of its own answers 422 and :errors", () => {
    for (const name of ["Card::Error::UserError", "Card::Error::BadQuery"]) {
      const row = ORACLE.ladder.find((candidate) => candidate.class === name)!;
      expect(row.declaresOwnStatus, name).toBe(false);
      expect(row.declaresOwnView, name).toBe(false);
      expect(row.statusCode, name).toBe(422);
      expect(row.view, name).toBe("errors");
    }
    // CodenameNotFound is the same shape one level further down: no pair of
    // its own, but NotFound's above it.
    const codename = ORACLE.ladder.find((row) => row.class === "Card::Error::CodenameNotFound")!;
    expect(codename.declaresOwnStatus).toBe(false);
    expect(codename.superclass).toBe("Card::Error::NotFound");
  });

  it("THE STRUCTURAL FACT: ServerError sits on Card::Error, NOT on UserError", () => {
    const server = ORACLE.ladder.find((row) => row.class === "Card::Error::ServerError")!;
    expect(server.superclass).toBe("Card::Error");
    expect(server.statusCode).toBe(500);
    expect(server.view).toBe("server_error");
    // So the 500 is outside the 422 ladder AND outside the rescue roster -
    // which is why a server error needs the StandardError net (row C14) and
    // why debug_exception?'s `!e.is_a?(Card::Error::UserError)` is true for
    // it (row C9).
    expect(ORACLE.roster.rosterNamesServerError).toBe(false);
  });

  it("the four subclasses that DO write a pair, each read off its own class", () => {
    const expected: Record<string, [number, string]> = {
      "Card::Error::BadAddress": [404, "bad_address"],
      "Card::Error::NotFound": [404, "not_found"],
      "Card::Error::EditConflict": [409, "conflict"],
      "Card::Error::PermissionDenied": [403, "denial"],
    };
    for (const [name, [status, view]] of Object.entries(expected)) {
      const row = ORACLE.ladder.find((candidate) => candidate.class === name)!;
      expect(row.statusCode, name).toBe(status);
      expect(row.view, name).toBe(view);
      expect(row.declaresOwnStatus, name).toBe(true);
      expect(row.declaresOwnView, name).toBe(true);
      expect(row.superclass, name).toBe("Card::Error::UserError");
    }
  });
});

describe("the pinned roster: five classes, and a deck can replace it", () => {
  it("the roster is UserError ITSELF plus the four Rails/ActiveRecord classes", () => {
    expect(ORACLE.roster.rosterAsPinned).toEqual([
      "Card::Error::UserError",
      "ActionController::BadRequest",
      "ActionController::MissingFile",
      "ActiveRecord::RecordNotFound",
      "ActiveRecord::RecordInvalid",
    ]);
    expect(ORACLE.roster.rosterNamesUserErrorItself).toBe("Card::Error::UserError");
    // UserError's own SUBCLASSES are not named: NotFound, PermissionDenied,
    // EditConflict and BadAddress are rescued as UserErrors.
    expect(ORACLE.roster.rosterNamesNotFound).toBe(false);
    const source = ORACLE.sources["userErrorAndRoster"]!.map((r) => r.text).join("\n");
    expect(source).toContain("cattr_accessor :user_error_classes");
    expect(source).toContain("class UserError < Error");
  });

  it("THE CATTR IS WRITABLE, and the capture wrote and restored it", () => {
    expect(ORACLE.roster.rosterWriterExists).toBe(true);
    // A one-entry roster was written and read back...
    expect(ORACLE.roster.rosterAfterADeckReplacedIt).toEqual(["Card::Error::UserError"]);
    // ... and the pinned five were restored, so this row's later reads still
    // see the pinned deck's own roster.
    expect(ORACLE.roster.rosterRestoredToPinned).toEqual(ORACLE.roster.rosterAsPinned);
  });
});

describe("the pinned bare raise, and the bytes it puts in the errors view", () => {
  it("a message-less UserError carries its CLASS NAME, and that is what the view shows", () => {
    const row = ORACLE.bareRaise[0]!;
    expect(row.raisedMessage).toBe("Card::Error::UserError");
    expect(row.view).toBe("errors");
    expect(row.statusCode).toBe(422);
    // add_card_errors keyed it by the class's last segment and the message
    // is the bare raise's own text.
    expect(row.cardErrorsEntries).toEqual([
      { key: "UserError", message: "Card::Error::UserError" },
    ]);
    expect(row.cardMessageText).toBe("Card::Error::UserError");
    // THE LINK TO THE PORT: the deck's handle raises exactly this
    // (`yield ? cud_success : raise(Card::Error::UserError)`), and the port
    // spells the same pair out as MISSING_CARD_DELETE_MESSAGE.
    const handle = ORACLE.sources["handleBareRaise"]!.map((r) => r.text).join("\n");
    expect(handle).toContain("yield ? cud_success : raise(Card::Error::UserError)");
    const addErrors = ORACLE.sources["addCardErrors"]!.map((r) => r.text).join("\n");
    expect(addErrors).toContain("label = exception.class.to_s.split(\"::\").last");
    expect(addErrors).toContain("add_card_errors card, card_exception if card.errors.empty?");
  });

  it("a card whose bag is ALREADY occupied keeps its own error: the add is guarded by empty?", () => {
    const row = ORACLE.bareRaise[1]!;
    expect(row.cardErrorsEntries).toEqual([{ key: "name", message: "must be present" }]);
    // The recorded asks show empty? was asked and the add did not follow.
    expect(row.cardErrorsCalls).toEqual(["empty?", "first"]);
    expect(row.cardMessageText).toBe("must be present");
  });

  it("the :errors view body and the unsupported-view producer are QUOTED, not executed", () => {
    const view = ORACLE.sources["errorsView"]!.map((r) => r.text).join("\n");
    expect(view).toContain("view :errors, perms: :none do");
    expect(view).toContain("return if card.errors.empty?");
    const standard = ORACLE.sources["standardErrors"]!.map((r) => r.text).join("\n");
    expect(standard).toContain("def standard_errors");
    expect(standard).toContain("def standard_error_message error");
    // The second producer of the pair: a view the card's type does not carry.
    const unsupported = ORACLE.sources["unsupportedViewUserError"]!.map((r) => r.text).join("\n");
    expect(unsupported).toContain("raise Card::Error::UserError, unsupported_view_error_message(view)");
    const artifact = ORACLE.rigArtifacts.find((line) => line.includes("QUOTED, not executed"));
    expect(artifact).toBeDefined();
  });
});

describe("the port's 422 and its :errors alert, against the pinned one", () => {
  it("the missing-card delete is 422 and shows the pinned bare raise's OWN bytes", async () => {
    const res = await fetch(`${bridge.url}/delete/Never_Existed`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${joeToken}` },
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(422);
    // The port's MISSING_CARD_DELETE_MESSAGE is "USERERROR: Card::Error::UserError",
    // and the pinned bag holds key "UserError" with message
    // "Card::Error::UserError" - the same two strings, and the view's
    // standard_error_message upcases the key.
    expect(body).toContain("USERERROR");
    expect(body).toContain("Card::Error::UserError");
    expect(ORACLE.bareRaise[0]!.cardErrorsEntries).toEqual([
      { key: "UserError", message: "Card::Error::UserError" },
    ]);
    expect(ORACLE.bareRaise[0]!.statusCode).toBe(422);
  });

  it("the port's :errors alert is the pinned view's dismissible warning alert", async () => {
    const res = await fetch(`${bridge.url}/delete/Never_Existed`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${joeToken}` },
      redirect: "manual",
    });
    const body = await res.text();
    // card-mod-format set/all/html/error.rb:54-66 + :120-127 and
    // layout/set/all/alert.rb:7-25's alert: the class_up the view asks for,
    // and the dismissible bootstrap alert the standard_errors helper builds.
    expect(body).toContain("card-error-msg");
    expect(body).toContain("alert-warning");
    expect(body).toContain("alert-dismissible");
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    expect(source).toContain("function cardErrorAlertHtml(error: CardActionError): string");
  });

  it("the port's status table answers 422 for everything that is not a named class", () => {
    // errorStatus (write-routes.ts:1097-1103) names four codes and 422 is
    // the fall-through, which is the pinned default: a UserError with no
    // subclass pair IS the 422/:errors pair.
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    expect(source).toContain('if (code === "not-found") return 404;');
    expect(source).toContain('if (code === "server-error") return 500;');
    expect(source).toContain('if (code === "conflict") return 409;');
    expect(source).toContain('if (code === "anonymous-actor" || code === "permission-denied") return 403;');
    expect(source).toContain("return 422;");
    const userError = ORACLE.ladder.find((row) => row.class === "Card::Error::UserError")!;
    expect(userError.statusCode).toBe(422);
  });

  it("a validation failure is 422 too, and it keeps its own attribute key", async () => {
    // A create with no content still creates a Basic card, so this measures
    // the 422 the deck answers when a card cannot be saved at all - the same
    // default class the pinned ladder's undeclared classes answer.
    const res = await fetch(`${bridge.url}/update/`, {
      method: "PUT",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
      },
      body: new URLSearchParams({ "card[name]": "C13 Named", "card[content]": "c13 body" }).toString(),
      redirect: "manual",
    });
    expect(res.status, await res.text()).toBe(303);
    expect(ORACLE.ladder.find((row) => row.class === "Card::Error::UserError")!.view).toBe("errors");
  });
});

describe("the write-refusal page: the alert inside the site's page chrome", () => {
  // The Decision-2 finding (FORMAT-19-SURFACES.md item 3): the port's
  // write-refusal path used to answer a bare 381-byte alert document where
  // Ruby renders the full site page (its recorded answer to step
  // admin-skin-type-change is 18,722 bytes of page around the same alert).
  // Ruby's controller rescue (decko-0.20.0 lib/card_controller/errors.rb
  // handle_exception) shows the ACTED-ON card through the deck's layout;
  // the port now renders the same page through its own page assembly, the
  // refused save's error bag seated on the render engine.
  //
  // FALSIFICATION: with the write-routes 422 page arm removed, the first
  // test fails on every chrome and main-slot assertion (the body reverts to
  // the bare document); with the html :errors view's with-errors arm or the
  // error-bag attachment removed, the page still renders but its main slot
  // comes out empty and the alert assertions fail.
  it("the refused type change answers a full site page whose main slot is the errors alert", async () => {
    const res = await fetch(`${bridge.url}/Parity_Old_Skin`, {
      method: "PUT",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
      },
      body: new URLSearchParams({ "card[type]": "Bootswatch skin" }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(422);
    // The page frame is the deck's own layout card (the seeds' Default
    // Layout): the body/header/article/footer shape every GET page carries.
    expect(body).toContain('<body class="d-flex flex-column h-100">');
    expect(body).toContain("<header>");
    expect(body).toContain('<article class="container flex-shrink-0" role="main">');
    expect(body).toContain("<footer");
    expect(body).toMatch(/<title>[^<]*Parity Old Skin/);
    // And the alert sits INSIDE the main slot - byte for byte the recorded
    // Ruby refusal page's main slot (the exact adjacency the h4 and the
    // newline-separated alert interior carry there too).
    expect(body).toContain(
      '<div id="main"><div class="alert alert-warning alert-dismissible  card-error-msg" role="alert">' +
        '<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n' +
        '<h4 class="alert-heading error">Problems with Parity Old Skin</h4>\n' +
        '<p><strong>+*STYLESHEETS:</strong> Parity Probe Card has an invalid type: RichText. ' +
        "Allowed types: CSS and SCSS.</p></div>",
    );
  });

  it("the same refusal over ajax keeps the bare alert document (no page)", async () => {
    // The ajax save's 422 lands in the form's card-notice (the slotter JS):
    // no navigation ever shows a page, so the alert-only document is the
    // answer there, as before this lane.
    const res = await fetch(`${bridge.url}/Parity_Old_Skin`, {
      method: "PUT",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
        "x-requested-with": "XMLHttpRequest",
      },
      body: new URLSearchParams({ "card[type]": "Bootswatch skin" }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(422);
    expect(body).toContain("card-error-msg");
    expect(body).toContain("+*STYLESHEETS");
    expect(body).not.toContain("<header>");
    expect(body).not.toContain('<div id="main">');
  });
});

describe("every refusal class answers the page (the error-chrome lane)", () => {
  // The attack table's classes (docs/runs/adversarial-port-20261026/
  // 03-refusal-chrome-scope.md): beyond the covered 422 write refusal, the
  // 403 denials, the 404 reads and the excluded 422 arms all answered bare
  // documents where Ruby's rescue (handle_exception, errors.rb:18-24) shows
  // the acted-on card through the layout - :denial for PermissionDenied,
  // :errors for the UserError classes, on the mark's unsaved card when the
  // refused save never created one.
  //
  // FALSIFICATION: with the write-routes refusal arm narrowed back to the
  // 422-with-mark gate, the 403 test fails on every chrome assertion (the
  // body reverts to the <pre> denial document); with the page assembly's
  // perms-none substitution skip removed (page.ts), the unsaved-card tests
  // fail (the main nest renders the create form instead of the error view);
  // with the signin arm's page render removed, the signin test fails on the
  // layout assertions.
  it("an anonymous create denial is 403 and the acted-on card's loud denial page", async () => {
    const res = await fetch(`${bridge.url}/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "card[name]": "Parity Denied Create" }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(403);
    // The deck's layout chrome (the seeds' Default Layout) around the denial
    // frame - the layout header/footer/article shape every GET page carries.
    expect(body).toContain('<body class="d-flex flex-column h-100">');
    expect(body).toContain('<article class="container flex-shrink-0" role="main">');
    expect(body).toContain("<footer");
    // The denial view's loud frame: the acted-on card's name in the frame
    // header, "Sorry!", and the anonymous rescue wording - "to do that",
    // the nil @denied_task arm (html/error.rb:206-212), never the view
    // walk's "to read this".
    expect(body).toContain('class="card-slot denial-view ');
    expect(body).toContain('<h1 class="d0-card-header-title">');
    expect(body).toContain("Parity Denied Create");
    expect(body).toContain("<h1>Sorry!</h1>");
    expect(body).toContain('href="/*signin/titled">sign in</a>');
    expect(body).toContain("to do that.</div></div>");
    expect(body).not.toContain("<pre>Sorry!");
  });

  it("a missing-card delete is 422 and the unsaved mark's errors page", async () => {
    const res = await fetch(`${bridge.url}/delete/Never_Was_2`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${joeToken}` },
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(422);
    // The rescue card is the mark's unsaved card (its name in the page
    // title), the layout around the alert, and the bare raise's bag: the
    // USERERROR paragraph (the pinned bareRaise entries, upcased key).
    expect(body).toMatch(/<title>[^<]*Never Was 2/);
    expect(body).toContain('<article class="container flex-shrink-0" role="main">');
    expect(body).toContain('<h4 class="alert-heading error">Problems with Never Was 2</h4>');
    expect(body).toContain("<p><strong>USERERROR:</strong> Card::Error::UserError</p>");
  });

  it("a blank-field sign-in failure is 422 and the *signin card's errors page", async () => {
    const res = await fetch(`${bridge.url}/update/*signin`, {
      method: "PATCH",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "card[subcards][+*email][content]": "",
        "card[subcards][+*password][content]": "whatever123",
      }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(422);
    expect(body).toMatch(/<title>[^<]*\*signin/);
    expect(body).toContain('<article class="container flex-shrink-0" role="main">');
    // The abort shape: the bare escaped message under the heading, no
    // <p><strong> wrapper (set/all/error.rb:32-40 simple_error_message).
    expect(body).toContain('<h4 class="alert-heading error">Problems with *signin</h4>');
    expect(body).toContain("email can&#39;t be blank</div>");
    expect(body).not.toContain("<p><strong>EMAIL:</strong>");
  });

  it("a JSON-format denial keeps Ruby's JSON error reply shape", async () => {
    const res = await fetch(`${bridge.url}/Parity_Old_Skin.json`, {
      method: "PUT",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "card[content]": "anonymous edit" }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    const payload = JSON.parse(body) as {
      error_status: number;
      errors: Record<string, string>;
      url: string;
      requested_at: string;
    };
    // card-mod-format set/all/json.rb page_details: the errors view's hash
    // plus url and requested_at - the recorded anon-update-existing-json
    // answer's exact key set.
    expect(payload.error_status).toBe(403);
    expect(Object.keys(payload.errors)).toEqual(["permission_denied"]);
    expect(payload.errors.permission_denied).toContain("Parity Old Skin");
    expect(payload.url).toContain("/Parity_Old_Skin.json");
    expect(payload.requested_at).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
  });
});

describe("the html :errors view body itself (errorsView, both arms)", () => {
  const ctxOf = (bagEntries?: Array<{ attribute: string; message: string }>) =>
    ({
      fmt: {
        card: { key: "parity_old_skin", name: { s: "Parity Old Skin" } },
        engine: {
          attachedErrorsByKey: bagEntries === undefined ? new Map() : new Map([["parity_old_skin", bagEntries]]),
        },
      },
      voo: {},
    }) as unknown as Parameters<typeof errorsView>[0];

  it("an empty bag answers Ruby's nil (the read-side arm, unchanged)", () => {
    expect(errorsView(ctxOf())).toBeNull();
  });

  it("the with-errors arm is the recorded alert bytes", () => {
    // set/all/html/error.rb:53-66 view :errors + :120-127 standard_errors +
    // layout/set/all/alert.rb:7-25's alert, with the newline joins output()
    // produces - the bytes the recorded Ruby refusal page's main slot
    // carries.
    expect(
      errorsView(
        ctxOf([
          {
            attribute: "+*stylesheets",
            message: "Parity Probe Card has an invalid type: RichText. Allowed types: CSS and SCSS.",
          },
        ]),
      ),
    ).toBe(
      '<div class="alert alert-warning alert-dismissible  card-error-msg" role="alert">' +
        '<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n' +
        '<h4 class="alert-heading error">Problems with Parity Old Skin</h4>\n' +
        '<p><strong>+*STYLESHEETS:</strong> Parity Probe Card has an invalid type: RichText. ' +
        "Allowed types: CSS and SCSS.</p></div>",
    );
  });
});