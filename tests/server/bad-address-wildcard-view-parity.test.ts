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