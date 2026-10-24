// The WILDCARD route, measured against the PINNED DECK's own route table
// and its own view machinery.
//
// The completeness register's A22 row grades the port on
// `get *mark => "card#read", view: "bad_address"`, the deck's LAST route
// and the class that answers every address the table's earlier arms did
// not. The row's note named the route but never asked the pinned deck what
// the wildcard's view does, and the answer is three different things
// depending on the card.
//
// fixtures/captured/wildcard-bad-address-ruby-oracle.json is what
// oracle-capture-wildcard-bad-address-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table and the PINNED card gem's own
// unknown-card view replacement, and by READING the PINNED MOD's own
// bad_address view body (the set DSL that registers it needs the whole card
// gem, so the capture quotes the view's own lines and says so):
//
//   the route  decko-0.20.0/config/engine_routes.rb:53-54
//                get "*mark" => "card#read", view: "bad_address"
//   the view   card-mod-format-0.20.0/set/all/error.rb:23-26
//                root.error_status = 404
//                t(:format_bad_address)
//   the unknown card's replacement
//              card-1.110.0/lib/card/format/error.rb:18-25
//                view_for_unknown -> root.error_status = 404 and
//                page_view_for_unknown (:not_found)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModFormat from "../../src/card/mod-loader/mods/card-mod-format.js";
import {
  createRenderTestStorage,
  seedCard,
} from "../card/render/render-test-storage.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/wildcard-bad-address-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  wildcardRoute: {
    verb: string;
    patterns: string[];
    requirements: Record<string, string>;
    action: string;
    order: number;
  };
  routesBeforeWildcard: Array<{ patterns: string[]; order: number }>;
  badAddressViewSource: Array<{ line: number; text: string }>;
  badAddressErrorSource: Array<{ line: number; text: string }>;
  unknownCardViews: Array<{ label: string; error: string | null; view: string | null; rootErrorStatus: number | null }>;
};

const byViewLabel = new Map(ORACLE.unknownCardViews.map((row) => [row.label, row]));

// The PINNED deck's route table, RECOGNIZED by the PINNED actionpack's own
// matcher (fixtures/captured/rails-route-recognition-ruby-oracle.json).
const ROUTE_RECOGNITION = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/rails-route-recognition-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  recognitions: Array<{
    verb: string;
    path: string;
    matched: boolean;
    routeOrder: number | null;
    routeSpec: string | null;
    params: Record<string, string> | null;
  }>;
};

function RECOGNITION(pathname: string, verb = "GET") {
  const row = ROUTE_RECOGNITION.recognitions.find(
    (entry) => entry.path === pathname && entry.verb === verb,
  );
  if (row === undefined) throw new Error(`no recognition recorded for ${verb} ${pathname}`);
  return row;
}

describe("the wildcard route, against the pinned deck gem", () => {
  it("the pinned deck registers the wildcard as its LAST route", () => {
    expect(ORACLE.wildcardRoute.verb).toBe("get");
    expect(ORACLE.wildcardRoute.patterns).toEqual(["*mark"]);
    expect(ORACLE.wildcardRoute.action).toBe("card#read");
    expect(ORACLE.wildcardRoute.requirements.view).toBe("bad_address");
    // The deck's twenty-ninth route, right after the generic two-segment
    // arm: it answers every address the earlier arms did not.
    expect(ORACLE.wildcardRoute.order).toBe(28);
    expect(ORACLE.routeTableSize).toBe(29);
    const before = new Map(ORACLE.routesBeforeWildcard.map((route) => [route.patterns[0]!, route.order]));
    expect(before.get(":mark/:view(.:format)")).toBe(27);
  });

  it("the pinned bad_address view sets the 404 on the page root", () => {
    const statusLine = ORACLE.badAddressViewSource.find((row) => row.text.includes("error_status"));
    expect(statusLine).toBeDefined();
    expect(statusLine!.text).toContain("root.error_status = 404");
    // The deck's own BadAddress error class carries the same status and view.
    const errorView = ORACLE.badAddressErrorSource.find((row) => row.text.includes("self.view"));
    expect(errorView).toBeDefined();
    expect(errorView!.text).toContain("self.view = :bad_address");
  });

  it("a KNOWN card keeps the bad_address view; an UNKNOWN card's view is replaced", () => {
    const known = byViewLabel.get("a KNOWN card keeps the bad_address view")!;
    expect(known.error).toBeNull();
    expect(known.view).toBe("bad_address");

    const unknown = byViewLabel.get("an UNKNOWN card's view is replaced")!;
    expect(unknown.error).toBeNull();
    expect(unknown.view).toBe("not_found");
    expect(unknown.rootErrorStatus).toBe(404);
  });

  it("the port's grammar answers the unmatched addresses with the wildcard", () => {
    expect(parsePath("/no/such/path")).toEqual({ kind: "wildcard" });
    expect(parsePath("/a/b/c/d")).toEqual({ kind: "wildcard" });
    expect(parsePath("/card/delete/Front")).toEqual({ kind: "wildcard" });
  });

  it("and a malformed % stays the router's no-route class", () => {
    // A bad request is not a bad address: the hardened decode keeps the
    // malformed path out of the wildcard class.
    const parsed = parsePath("/bad%zz");
    expect("kind" in parsed ? parsed.kind : "card-arm").toBe("notFound");
  });

  it("the EXECUTED PINNED matcher routes the deep paths to the wildcard, with the bad_address view", () => {
    // The capture above reduces the table statically; the executed PINNED
    // matcher routes the request itself
    // (fixtures/captured/rails-route-recognition-ruby-oracle.json).
    const row = RECOGNITION("/a/b/c/d");
    expect(row.matched).toBe(true);
    expect(row.routeOrder).toBe(28);
    expect(row.params).toMatchObject({ action: "read", view: "bad_address", mark: "a/b/c/d" });
    // The port's side, the same class:
    expect(parsePath("/a/b/c/d")).toEqual({ kind: "wildcard" });
  });
});

// ---------------------------------------------------------------------------
// the port's own answer for a KNOWN card at a wildcard address
// ---------------------------------------------------------------------------
//
// A wildcard address is a COMPOUND name: the pinned route's glob mark
// carries the whole path and the slashes become the junction "+", so
// /deep/such/card is the card "deep+such+card".
//
// The pin this file used to carry said the compound name could not be
// registered in the test harness, so the known-junction leg was
// unpinnable here. That was wrong: the port composes junction names at
// BOOT (src/server/worker-shared-surface.ts, installDeckNameEnvironment,
// which both entries run), and the harness can run that same boot step.
// With it, the compound name resolves and the leg is pinned below.
//
// The pinned side is the capture's own row: a KNOWN card KEEPS the
// bad_address view, and the view writes root.error_status = 404.
let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let formatLoader: ModLoader;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 1, name: "*all", codename: "all" });
  await seedCard(storage, { id: 14, name: "Basic", typeId: 14 });
  // The junction: "deep" + "such" -> "deep+such", then "deep+such" +
  // "card" -> "deep+such+card", the card a wildcard address names.
  await seedCard(storage, { id: 800, name: "deep", typeId: 14 });
  await seedCard(storage, { id: 801, name: "such", typeId: 14 });
  await seedCard(storage, { id: 802, name: "card", typeId: 14 });
  await seedCard(storage, { id: 803, leftId: 800, rightId: 801, typeId: 14 });
  await seedCard(storage, { id: 804, leftId: 803, rightId: 802, typeId: 14 });
  // The boot step the port's own entries run: the deck's name environment,
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

describe("a KNOWN card at a wildcard address (A22)", () => {
  it("the compound name resolves once the boot composes it", async () => {
    const found = await storage!.fetcher.fetchByName("deep+such+card");
    expect(found).toBeDefined();
    expect(found!.id).toBe(804);
    // The name the wildcard address carries is the junction's own name,
    // and the spaced spelling is not a name at all.
    expect(await storage!.fetcher.fetchByName("deep such card")).toBeUndefined();
  });

  it("and the port renders the PINNED bad_address view for it, at 404", async () => {
    // The pinned capture's own row: a KNOWN card KEEPS the bad_address
    // view, whose body writes root.error_status = 404 and returns the
    // pinned locale text ("404: Bad Address",
    // card-mod-format-0.20.0/config/locales/en.yml:3).
    const known = byViewLabel.get("a KNOWN card keeps the bad_address view")!;
    expect(known.view).toBe("bad_address");

    storage!.engine.pageErrorStatus = undefined;
    const html = await storage!.engine.render("deep+such+card", "bad_address");
    expect(html).toBe("404: Bad Address");
    expect(storage!.engine.pageErrorStatus).toBe(404);
  });

  it("the port's own grammar puts the deep address in the wildcard class", () => {
    // The route's own class: the address is the wildcard's, and the
    // wildcard's mark is the compound name the port passes to the render.
    expect(parsePath("/deep/such/card")).toEqual({ kind: "wildcard" });
    expect(["deep", "such", "card"].join("+")).toBe("deep+such+card");
  });
});

describe("the named remainder (A22)", () => {
  it("the signed-in may-create :new-form arm at wildcard addresses, named with its dependency", () => {
    // Ruby's view gate (card-1.110.0 lib/card/view/permission.rb:33-44
    // alter_unknown -> lib/card/format/error.rb:17-22 view_for_unknown)
    // REPLACES the view for an unknown main card: :new for a viewer who
    // may create, :not_found otherwise. The port's own counterpart carries
    // the same branch (src/card/render/format.ts, viewForUnknown: "canCreate
    // ? 200 : 404"), but it is UNREACHABLE from the render entry points,
    // which refuse the card first ("card not found: <name>"). That is row
    // C10's own named remainder, and it is the dependency this cell has.
    //
    // So the wildcard address answers the not_found arm for every viewer,
    // and the may-create arm rides the single-segment new-card machinery
    // only. Named here, measured on the port's own side below.
    const source = readFileSync(path.join(REPO, "src/card/render/format.ts"), "utf8");
    expect(source).toContain("canCreate ? 200 : 404");
    const page = readFileSync(path.join(REPO, "src/card/render/page.ts"), "utf8");
    expect(page).toContain("card not found:");
  });
});
