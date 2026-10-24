// The bad_address wildcard view, measured by EXECUTING the PINNED MOD's own
// view body, and measured on the port by rendering the port's own view.
//
// The completeness register's C15 row grades the port on the `BadAddress`
// wildcard view. Three mechanisms in the pinned deck answer 404, and this
// row's view is the THIRD and the only one that writes its status from
// INSIDE the render:
//
//   1. THE RESCUE CLASS. Card::Error::BadAddress (card-1.110.0/lib/card/
//      error.rb:82-85) is a UserError subclass with (404, :bad_address).
//   2. THE FORMAT'S UNKNOWN-CARD ARM. view_for_unknown (card-1.110.0/lib/
//      card/format/error.rb:18-25) writes root.error_status = 404 for an
//      unknown card - row C10.
//   3. THE VIEW'S OWN BODY, and this row's subject:
//
//        view :bad_address, perms: :none do
//          root.error_status = 404
//          t(:format_bad_address)
//        end
//
//      (card-mod-format-0.20.0/set/all/error.rb:23-26)
//
// Row A22's capture QUOTED that body, because the set DSL that registers it
// needs the whole card gem. This row EXECUTES it: the file is evaluated with
// a recording `view` method that keeps each declaration's block, and the
// block is then run on a probe carrying `root` and `t`. The locale text is
// PINNED, not a stand-in - card-mod-format-0.20.0/config/locales/en.yml:3
// carries `format_bad_address: "404: Bad Address"`.
//
// THE FINDING: THE STATUS IS WRITTEN FROM TWO PLACES. The wildcard route's
// `view: "bad_address"` default reaches the render as params[:view];
// `show` is called with NO status argument and renders at its OWN DEFAULT OF
// 200; and the view body then writes 404. So the status argument to show is
// 200 and the response is 404, written by different code in a different
// place. Executed here in that order.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderPageWithStatus } from "../../src/card/render/page.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";
import { createRenderTestStorage, seedCard } from "../card/render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModFormat from "../../src/card/mod-loader/mods/card-mod-format.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/bad-address-wildcard-view-ruby-oracle.json"), "utf8"),
) as {
  wildcardRoute: {
    order: number;
    verb: string;
    patterns: string[];
    action: string;
    requirements: Record<string, string>;
    rawRequirements: Record<string, string>;
    totalRoutes: number;
  };
  showLadder: Array<{
    label: string;
    params: Record<string, string>;
    viewFromParams: string | null;
    rendered: { body?: string; status?: number } | null;
    pageCalls: Array<{ view: string; format: string }>;
  }>;
  viewBody: {
    declaredName: string;
    declaredFormat: string;
    declaredOpts: Record<string, string>;
    returned: string;
    rootErrorStatusWrites: number[];
    rootErrorStatus: number;
    localeCalls: Array<{ key: string; kwargs: Record<string, string> }>;
    localeTokenPresent: boolean;
  };
  viewDeclarations: Array<{
    format: string;
    name: string;
    aliases: string[];
    opts: Record<string, string>;
    hasBlock: boolean;
  }>;
  exceptionClass: {
    badAddressStatusCode: number;
    badAddressView: string;
    badAddressSuperclass: string;
    notFoundStatusCode: number;
    notFoundView: string;
    rescue: {
      view: string;
      statusCode: number;
      rendered: { status?: number } | null;
      pageCalls: Array<{ view: string; format: string }>;
    };
  };
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let formatLoader: ModLoader;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 1, name: "*all", codename: "all" });
  await seedCard(storage, { id: 14, name: "Basic", typeId: 14 });
  // The junction a wildcard address names: "deep" + "such" -> "deep+such",
  // then "deep+such" + "card" -> "deep+such+card".
  await seedCard(storage, { id: 800, name: "deep", typeId: 14 });
  await seedCard(storage, { id: 801, name: "such", typeId: 14 });
  await seedCard(storage, { id: 802, name: "card", typeId: 14 });
  await seedCard(storage, { id: 803, leftId: 800, rightId: 801, typeId: 14 });
  await seedCard(storage, { id: 804, leftId: 803, rightId: 802, typeId: 14 });
  // The deck's BOOT step, the one both entries run: the name environment,
  // with the junction names composed from their sides.
  await installDeckNameEnvironment(storage.counting, storage.fetcher);
  await storage.fetcher.codenames.ensureLoaded();
  formatLoader = new ModLoader([{ manifest: cardModFormat }]);
  formatLoader.load();
  await formatLoader.installInto(modEngineHost(storage.engine, storage.fetcher));
}, 60_000);

afterAll(() => {
  formatLoader?.reset();
  storage?.close();
});

describe("the wildcard route and the view it defaults to", () => {
  it("the pinned table registers the wildcard LAST, with the view as a REQUIREMENT", () => {
    expect(ORACLE.wildcardRoute.order).toBe(ORACLE.wildcardRoute.totalRoutes - 1);
    expect(ORACLE.wildcardRoute.totalRoutes).toBe(29);
    expect(ORACLE.wildcardRoute.verb).toBe("get");
    expect(ORACLE.wildcardRoute.patterns).toEqual(["*mark"]);
    expect(ORACLE.wildcardRoute.action).toBe("card#read");
    // This is the route option that becomes the render's default view.
    expect(ORACLE.wildcardRoute.requirements).toEqual({ view: "bad_address" });
    const line = ORACLE.sources["wildcardRouteLine"]!.map((r) => r.text).join("\n");
    expect(line).toContain('get "*mark" => "card#read", view: "bad_address"');
  });

  it("THE LADDER READS params[:view] AND params[:v], and a BLANK value is not a view", () => {
    const byView = ORACLE.sources["showAndViewFromParams"]!.map((r) => r.text).join("\n");
    expect(byView).toContain("%i[view v].each { |k| return params[k] if params[k].present? }");
    // The default arrives and is read.
    expect(ORACLE.showLadder[0]!.viewFromParams).toBe("bad_address");
    expect(ORACLE.showLadder[1]!.viewFromParams).toBe("bad_address");
    // The control and the blank.
    expect(ORACLE.showLadder[2]!.viewFromParams).toBeNull();
    expect(ORACLE.showLadder[3]!.viewFromParams).toBeNull();
  });

  it("show is called with NO status argument, so the render answers 200", () => {
    for (const row of ORACLE.showLadder) {
      expect(row.rendered!.status, row.label).toBe(200);
    }
    expect(ORACLE.showLadder[0]!.pageCalls[0]!.view).toBe('"bad_address"');
  });
});

describe("THE VIEW BODY, executed as the pinned block", () => {
  it("it writes root.error_status = 404 and returns the PINNED locale text", () => {
    const row = ORACLE.viewBody;
    expect(row.declaredName).toBe("bad_address");
    expect(row.declaredFormat).toBe("base");
    expect(row.declaredOpts).toEqual({ perms: "none" });
    expect(row.rootErrorStatusWrites).toEqual([404]);
    expect(row.returned).toBe("404: Bad Address");
    // The token it asked for, and that the token EXISTS in the pinned file.
    expect(row.localeCalls).toEqual([{ key: "format_bad_address", kwargs: {} }]);
    expect(row.localeTokenPresent).toBe(true);
    const locale = ORACLE.sources["localeToken"]!.map((r) => r.text).join("\n");
    expect(locale).toContain('format_bad_address: "404: Bad Address"');
  });

  it("THE FINDING: the 200 AND the 404 come from different places", () => {
    // show's own default put 200 on the render...
    expect(ORACLE.showLadder[0]!.rendered!.status).toBe(200);
    // ... and the view's own body wrote 404 afterwards.
    expect(ORACLE.viewBody.rootErrorStatusWrites).toEqual([404]);
    const view = ORACLE.sources["badAddressView"]!.map((r) => r.text).join("\n");
    expect(view).toContain("root.error_status = 404");
    expect(view).toContain("t(:format_bad_address)");
  });

  it("THERE ARE TWO :bad_address VIEWS AND ONLY THE BASE ONE WRITES THE STATUS", () => {
    const declarations = ORACLE.viewDeclarations.filter((row) => row.name === "bad_address");
    expect(declarations.map((row) => row.format)).toEqual(["base", "json"]);
    // The json body is a DIFFERENT method: it adds an :address error and
    // renders the errors view, and writes no status at all.
    const view = ORACLE.sources["badAddressView"]!.map((r) => r.text).join("\n");
    expect(view).toContain("card.errors.add :address, super()");
    expect(view).toContain("render_errors");
    // So "the bad_address view writes 404" is true of the base view and not
    // of the json one; the capture executes the base one because that is the
    // one the wildcard route's html page reaches.
    const jsonDeclaration = declarations.find((row) => row.format === "json")!;
    expect(jsonDeclaration.opts).toEqual({ perms: "none" });
    expect(jsonDeclaration.hasBlock).toBe(true);
  });

  it("the view DSL is a stand-in and the body is not", () => {
    const artifact = ORACLE.rigArtifacts.find((line) => line.includes("view DSL is stood in"));
    expect(artifact).toBeDefined();
    const localeArtifact = ORACLE.rigArtifacts.find((line) => line.includes("locale text is PINNED"));
    expect(localeArtifact).toBeDefined();
  });
});

describe("the other bad_address producer, and the port's own view", () => {
  it("the exception class is (404, :bad_address) and renders that view at 404", () => {
    expect(ORACLE.exceptionClass.badAddressStatusCode).toBe(404);
    expect(ORACLE.exceptionClass.badAddressView).toBe("bad_address");
    expect(ORACLE.exceptionClass.badAddressSuperclass).toBe("Card::Error::UserError");
    expect(ORACLE.exceptionClass.rescue.rendered!.status).toBe(404);
    expect(ORACLE.exceptionClass.rescue.pageCalls[0]!.view).toBe(":bad_address");
    // 404 never identifies the view: NotFound is also 404 and answers a
    // different one.
    expect(ORACLE.exceptionClass.notFoundStatusCode).toBe(404);
    expect(ORACLE.exceptionClass.notFoundView).toBe("not_found");
  });

  it("the port's view writes the same status and returns the same text", async () => {
    // The port's badAddressView (src/card/mod-loader/mods/card-mod-format.ts)
    // is EXECUTED here through the format mod's own registration.
    const before = storage!.engine.pageErrorStatus;
    storage!.engine.pageErrorStatus = undefined;
    const html = await storage!.engine.render("Basic", "bad_address");
    expect(html).toBe("404: Bad Address");
    expect(storage!.engine.pageErrorStatus).toBe(404);
    expect(before === undefined || before === null).toBe(true);
    expect(ORACLE.viewBody.returned).toBe(html);
  });

  it("the port's page error status IS its root.error_status, and the comment above it now says so", () => {
    const source = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-format.ts"),
      "utf8",
    );
    expect(source).toContain("fmt.engine.pageErrorStatus = 404; // root.error_status = 404");
    expect(source).toContain('return "404: Bad Address"; // en.yml:3 format_bad_address');
    // The header comment no longer claims the status surface is absent or
    // that the token renders as a bare key; both were wrong and the body
    // never changed.
    expect(source).not.toContain("The headless engine has no root.error_status surface");
    expect(source).toContain("The 404 IS WRITTEN FROM INSIDE THE RENDER");
  });
});

// ---------------------------------------------------------------------------
// ROUND SEVEN: the row's remaining cells, measured on the port's OWN
// surfaces. The row's earlier pins read the port's view out of the source
// and executed it; the cells below are the ones that need the port RUNNING,
// and the two that stay open are named with their exact dependency.
// ---------------------------------------------------------------------------

describe("the port's WILDCARD address, measured (C15)", () => {
  it("a WILDCARD address that resolves to nothing is REFUSED at the page entry point", async () => {
    // A wildcard address is a compound name (the pinned route's glob mark
    // carries the whole path, and the slashes become the junction "+").
    // The port's page entry point refuses it, and the HOST answers its own
    // not_found chrome page at 404 (the C10 surface), because the pinned
    // route's view is a REQUIREMENT on the view, not on the card: an
    // UNKNOWN card never reaches the bad_address view.
    let refusal: string | null = null;
    try {
      await renderPageWithStatus(storage!.engine, "deep such card");
      refusal = null;
    } catch (error) {
      refusal = String(error);
    }
    expect(refusal).toContain("card not found: deep such card");
  });

  it("the port's fetch layer resolves a COMPOUND name once the deck's boot composes it", async () => {
    // CORRECTION (round eight): this pin used to say the port's fetch
    // layer CANNOT resolve a compound name in this harness, and that the
    // known-junction leg was therefore unpinnable here. That was wrong.
    // The port composes junction names at BOOT
    // (src/server/worker-shared-surface.ts, installDeckNameEnvironment,
    // which both entries run), and the harness can run that same boot
    // step; with it, the compound name resolves.
    //
    // The pinned deck's answer for a KNOWN card at a wildcard address is
    // the bad_address view at 404 ("404: Bad Address" inside the page
    // chrome): the route's view requirement applies to a card that
    // RESOLVES. The leg is pinned now, in this row's own file and in the
    // deploy wildcard suite.
    expect(await storage!.fetcher.fetchByName("deep+such+card")).toBeDefined();
    // The spaced spelling is not a name at all.
    expect(await storage!.fetcher.fetchByName("deep such card")).toBeUndefined();
  });

  it("the PINNED side of the same cell: the route's view requirement IS bad_address, and the view writes the 404", () => {
    // The pinned capture's own rows: the wildcard route carries the view as
    // a requirement, show is called with no status argument (so the render
    // answers 200), and the view's own body writes 404 afterwards.
    expect(ORACLE.wildcardRoute.requirements).toEqual({ view: "bad_address" });
    expect(ORACLE.showLadder[0]!.rendered!.status).toBe(200);
    expect(ORACLE.viewBody.rootErrorStatusWrites).toEqual([404]);
    expect(ORACLE.viewBody.returned).toBe("404: Bad Address");
  });
});

describe("C15's remaining cells, named with their exact dependency", () => {
  it("the known-junction leg is PINNED now, with the deck's boot step", () => {
    // CORRECTION (round eight): this pin used to say the known-junction
    // leg needs a compound name the harness cannot register, and that the
    // deploy wildcard suite recorded the same limit. That was wrong: the
    // harness can run the port's own boot step
    // (installDeckNameEnvironment, which composes the junction names from
    // their sides), and with it the leg is pinned - on the edge, in the
    // deploy wildcard suite, and in this row's own file.
    const deploySuite = readFileSync(
      path.join(REPO, "tests/deploy/bunny-edge-bad-address-wildcard.test.ts"),
      "utf8",
    );
    expect(deploySuite).toContain(
      "a KNOWN junction card at a wildcard address renders the bad_address view at 404",
    );
    expect(deploySuite).toContain("installDeckNameEnvironment");
    // The may-create half of the same cell, named the same way.
    expect(deploySuite).toContain("may-create :new-form arm");
  });

  it("the port's own bad_address view is the pinned view, so the row's own subject is closed", async () => {
    // The row's subject is the bad_address VIEW: the body that writes
    // root.error_status = 404 and returns the pinned locale text. The
    // port's view does exactly that, measured by executing it.
    storage!.engine.pageErrorStatus = undefined;
    const html = await storage!.engine.render("Basic", "bad_address");
    expect(html).toBe("404: Bad Address");
    expect(storage!.engine.pageErrorStatus).toBe(404);
  });
});