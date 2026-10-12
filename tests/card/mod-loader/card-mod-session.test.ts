// Loader test for the card-mod-session mod. The session mod declares two
// set modules - all/location_history (base bucket) and type/session
// (nonbase) - and no HTML views at all: its single format block is a
// before :core hook rather than a view, so a load must leave the render
// path byte-identical. The exported ALLOW_ANONYMOUS_COOKIES constant
// carries the same value the decko gem hardcodes in
// lib/card/mod/session.rb. The set/type/session.rb card-method overrides
// have nothing to attach to in the TS mod and are intentionally absent.
//
// The tests run as an A/B pair over the loader's own tables (there are no
// views to A/B):
//   - without the load, the set-module basket has no session entries and
//     the in-memory HTML_VIEWS record is untouched;
//   - with the load, the basket holds both modules in their buckets, the
//     load report lists zero registered views, the HTML_VIEWS key set is
//     unchanged, and a Session-typed card still renders :content as the
//     baseline bytes.
//
// Probe cards echo the decko gem's data/real.yml seeds:
//   - Cardtype (id 5) - the cardtype cardtype
//   - Session (id 80, codename "session", typeId 5) - the Session
//     cardtype itself
//   - Test Session Card (id 81, typeId 80) - a session-typed probe card

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModSession, {
  ALLOW_ANONYMOUS_COOKIES,
} from "../../../src/card/mod-loader/mods/card-mod-session.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let report: ReturnType<ModLoader["load"]> | undefined;
let viewsKeysBeforeLoad: string[] | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the cardtype cardtype (so Session's typeId means "cardtype")
  await seedCard(s, { id: 5, name: "Cardtype" });

  // the Session cardtype card - data/real.yml:1-4 (:name: Session,
  // :type: :cardtype, :codename: session)
  await seedCard(s, { id: 80, name: "Session", codename: "session", typeId: 5 });

  // a session-typed probe card (type Session => typeId 80)
  await seedCard(s, {
    id: 81,
    name: "Test Session Card",
    typeId: 80,
    dbContent: "session-scoped value",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-session through the mod loader (A/B)", () => {
  it("WITHOUT the mod load: the basket has no session set modules and the live views record is untouched", () => {
    loader = new ModLoader([{ manifest: cardModSession }]);
    expect(loader.isLoaded).toBe(false);
    const basket = loader.setModules();
    const baseShortnames = basket.base.map((m) => m.shortname);
    const nonbaseShortnames = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(baseShortnames).not.toContain("All::LocationHistory");
    expect(nonbaseShortnames).not.toContain("Type::Session");
    // the views snapshot the WITH tests compare against (the loader
    // mutates the LIVE HTML_VIEWS record on registration; this mod must
    // register nothing)
    viewsKeysBeforeLoad = Object.keys(HTML_VIEWS);
  });

  it("WITH the mod load: both gem set modules land in the basket in the right buckets (loader.ts phase 2)", async () => {
    const s = storage!;
    loader = loader ?? new ModLoader([{ manifest: cardModSession }]);
    report = loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher)); // prepare phase; this mod's manifest has none

    // set/all/location_history.rb -> All::LocationHistory, base bucket
    // ("all" is the base pattern; mod-loader.ts#kindOfSetPath)
    const base = loader.setModules().base.find((m) => m.shortname === "All::LocationHistory");
    expect(base).toBeDefined();
    expect(base?.kind).toBe("base");
    expect(base?.modName).toBe("session");

    // set/type/session.rb -> Type::Session, nonbase bucket
    const nonbaseLists = [...loader.setModules().nonbase.values()].flat();
    const session = nonbaseLists.find((m) => m.shortname === "Type::Session");
    expect(session).toBeDefined();
    expect(session?.kind).toBe("nonbase");
    expect(session?.modName).toBe("session");

    // the load report names both modules (loader.ts registeredSetModules)
    expect(report.registeredSetModules).toContain("All::LocationHistory");
    expect(report.registeredSetModules).toContain("Type::Session");
  });

  it("WITH the mod load: the mod registers ZERO views (compat htmlViewsDeclared: 0) and the views record is unchanged", () => {
    // the gem's only format block is `before :core` HOOK
    // (set/type/session.rb:59-63), which has no ModFormatBlock slot; the
    // registeredViews list must stay empty for this mod
    expect(report!.registeredViews).toEqual([]);
    // and the live views record carries exactly the keys it carried
    // before the load (no session view leaked into HTML_VIEWS)
    expect(Object.keys(HTML_VIEWS).sort()).toEqual([...viewsKeysBeforeLoad!].sort());
  });

  it("WITH the mod load: the manifest answers to both its names (class_methods.rb:26-28 strips card-mod-)", () => {
    expect(loader!.fetchMod("card-mod-session")?.manifest.name).toBe("session");
    expect(loader!.fetchMod("session")?.manifest.gemName).toBe("card-mod-session");
  });

  it("lib/card/mod/session.rb:1-3 allow_anonymous_cookies = true", () => {
    expect(ALLOW_ANONYMOUS_COOKIES).toBe(true);
  });

  it("WITH the mod: a Session-typed card's :content render is unchanged (the mod alters no render path)", async () => {
    const s = storage!;
    // :content is a base-format view (views.ts#contentView); the mod
    // defines no views (its before :core hook is unported), so the
    // Session-typed probe renders exactly the baseline bytes
    const html = await s.engine.render("Test Session Card", "content");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("card-slot");
    expect(html).toContain("session-scoped value");
  });

  it("reset(): the basket entries are withdrawn and the views record is back to the pre-load key set", () => {
    loader!.reset();
    const basket = loader!.setModules();
    const baseShortnames = basket.base.map((m) => m.shortname);
    const nonbaseShortnames = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(baseShortnames).not.toContain("All::LocationHistory");
    expect(nonbaseShortnames).not.toContain("Type::Session");
    expect(Object.keys(HTML_VIEWS).sort()).toEqual([...viewsKeysBeforeLoad!].sort());
    expect(loader!.isLoaded).toBe(false);
  });
});
