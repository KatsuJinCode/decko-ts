// card-mod-date: registration-mechanics tests for the mod port.
//
// The gem has one declared HTML view (:core) which is already implemented
// in the engine (mod-compat-report.json verdict for this gem:
// "1/1 html views in HTML_VIEWS (0/0 mod-specific)" and
// "htmlViewsMissing": []). The engine's coreView has a `typeName ===
// "Date"` branch (views.ts:186-214) that implements
// `::Date.parse(card.content).strftime "%B %-d, %Y"` via formatDateCore
// (views.ts:235-248) - byte-for-byte the same body as set/type/date.rb:6-8.
//
// What the mod's manifest contributes on top of the engine impl is the
// SET-MODULE BASKET: every .rb file from the gem tree registers as a
// set module even when the file defines no ported view. There are 5 set
// files (all/calendar, right/when_created, right/when_last_edited,
// self/now, type/date) and all 5 enter the basket. No html views are
// declared by the mod's manifest - a mod-side :core registration would
// shadow the engine's correct impl via the mod-registrar's last-wins
// rule (loader.ts:199 `views[view] = viewFn`).
//
// Probe cards:
//   - Oracle Date Probe (a Date-typed card whose :core view runs through
//     the engine's existing formatDateCore; the mod does NOT register
//     its own :core for type/date to avoid shadowing the engine impl)
//   - Oracle When Created Probe+when_created (junction; the engine's
//     :core for this virtual right card returns "" - no dbContent - and
//     the mod's set-module content override (when_created.rb:7-11) is
//     not ported because the engine has no per-card content override
//     surface today)
//   - now (the *now virtual card; the engine's :core returns "" for the
//     same reason; the mod's set-module content override (now.rb:1-3) is
//     not ported)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModDate from "../../../src/card/mod-loader/mods/card-mod-date.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename registry seed cards (the registry's peekId reads
  // cards.codename; the type cards are referenced as the set/setting
  // join's typeId side)
  await seedCard(s, { id: 2, name: "RichText" }); // the cardtypes' type card
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // the right-anchor phrase setting cards (the *when created /
  // *when last edited / now phrase settings; their ids are the right_id
  // side of every <X>+when_created / <X>+when_last_edited / now
  // junction row). real.yml:7-12 declares these with codenames but no
  // explicit type - phrase is the implicit default for settings.
  await seedCard(s, {
    id: 200,
    name: "when_created",
    codename: "when_created",
    typeId: 14, // phrase (setting type)
  });
  await seedCard(s, {
    id: 201,
    name: "when_last_edited",
    codename: "when_last_edited",
    typeId: 14,
  });
  await seedCard(s, {
    id: 202,
    name: "now",
    codename: "now",
    typeId: 14,
  });

  // the Date cardtype (real.yml:2-6 declares Date as a cardtype with
  // codename 'date'). The Date cardtype's row IS the codename anchor
  // for `date` (no separate *date setting card exists - the right/when_*
  // set modules' right side is a *setting card; the type/date set
  // module's anchor is the Date cardtype itself).
  await seedCard(s, {
    id: 220,
    name: "Date",
    codename: "date",
    typeId: 13, // Cardtype's own type
  });

  // Oracle When Created Probe+when_created (junction: real left).
  // The engine's :core for this virtual right card returns "" (no
  // dbContent); the mod's set-module content override is not ported
  // (engine surface gap).
  await seedCard(s, {
    id: 300,
    name: "Oracle When Created Probe",
    dbContent: "created probe body",
  });
  await seedCard(s, {
    id: 301,
    leftId: 300,
    rightId: 200, // +when_created
    typeId: 14, // setting type (junctions are setting-typed)
  });

  // Oracle When Last Edited Probe+when_last_edited (junction: real left)
  await seedCard(s, {
    id: 310,
    name: "Oracle When Last Edited Probe",
    dbContent: "edited probe body",
  });
  await seedCard(s, {
    id: 311,
    leftId: 310,
    rightId: 201, // +when last edited
    typeId: 14,
  });

  // Oracle Date Probe (a Date-typed card with valid date content; the
  // mod does NOT register its own :core for type/date - the engine's
  // coreView branch (views.ts:186) renders formatDateCore). The Date
  // typeId points to the Date cardtype card (id 220) so the engine's
  // typeName lookup yields "Date" and the typeName === "Date" branch
  // fires.
  await seedCard(s, {
    id: 330,
    name: "Oracle Date Probe",
    dbContent: "2026-03-15",
    typeId: 220,
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

// ---------------------------------------------------------------------------
// the formatDayofwkMinTz helper (exported from the mod) - byte-for-byte
// shape of card-1.110.0 config/locales/en.yml:29's '%A, %B %d, %Y %I:%M %p'
// applied to a UTC stored timestamp
// ---------------------------------------------------------------------------

describe("card-mod-date formatDayofwkMinTz (en.yml:29 '%A, %B %d, %Y %I:%M %p %Z')", () => {
  it("formats the seed test timestamp '2026-09-19 00:00:00.000' as 'Saturday, September 19, 2026 12:00 AM UTC'", async () => {
    const { formatDayofwkMinTz } = await import(
      "../../../src/card/mod-loader/mods/card-mod-date.js"
    );
    // 2026-09-19 is a Saturday; midnight UTC -> hour 0 in 12-hour = 12,
    // so %I='12', %p='AM'.
    const expected = "Saturday, September 19, 2026 12:00 AM UTC";
    expect(formatDayofwkMinTz(new Date("2026-09-19T00:00:00.000Z"))).toBe(expected);
  });

  it("zero-pads the day-of-month and hour (en.yml %d, %I are zero-padded)", async () => {
    const { formatDayofwkMinTz } = await import(
      "../../../src/card/mod-loader/mods/card-mod-date.js"
    );
    // 2026-01-05 is a Monday at 09:05 UTC -> '%d' = '05', '%I' = '09'
    const result = formatDayofwkMinTz(new Date("2026-01-05T09:05:00.000Z"));
    expect(result).toBe("Monday, January 05, 2026 09:05 AM UTC");
  });

  it("uses PM for hours >= 12 (en.yml %p 'PM')", async () => {
    const { formatDayofwkMinTz } = await import(
      "../../../src/card/mod-loader/mods/card-mod-date.js"
    );
    // 2026-01-05 14:30 UTC -> 2:30 PM
    const result = formatDayofwkMinTz(new Date("2026-01-05T14:30:00.000Z"));
    expect(result).toBe("Monday, January 05, 2026 02:30 PM UTC");
  });

  it("handles midnight correctly (00:00 UTC -> 12:00 AM, hour 12 not 0)", async () => {
    const { formatDayofwkMinTz } = await import(
      "../../../src/card/mod-loader/mods/card-mod-date.js"
    );
    // Ruby's %I on hour 0 returns '12' (12 AM). The helper's
    // `hour24 % 12 === 0 ? 12 : hour24 % 12` branch handles it.
    const result = formatDayofwkMinTz(new Date("2026-06-15T00:00:00.000Z"));
    expect(result).toBe("Monday, June 15, 2026 12:00 AM UTC");
  });

  it("handles noon correctly (12:00 UTC -> 12:00 PM, not 00:00 PM)", async () => {
    const { formatDayofwkMinTz } = await import(
      "../../../src/card/mod-loader/mods/card-mod-date.js"
    );
    // Ruby's %I on hour 12 returns '12' (12 PM). The helper's branch
    // `hour24 % 12 === 0 ? 12 : hour24 % 12` catches this (12 % 12 = 0
    // -> 12).
    const result = formatDayofwkMinTz(new Date("2026-06-15T12:00:00.000Z"));
    expect(result).toBe("Monday, June 15, 2026 12:00 PM UTC");
  });
});

// ---------------------------------------------------------------------------
// A/B tests for the mod's set-module basket (no view registration - the
// mod defers to the engine's :core for everything)
// ---------------------------------------------------------------------------

describe("card-mod-date through the mod loader (A/B)", () => {
  it("WITHOUT the mod: a fresh ModLoader's basket is empty before load() is called", () => {
    // The ModLoader constructor (mod-loader.ts:101-104) seeds
    // `this.views = new ViewRegistrationTable(views)` and `this.basket
    // = new SetModuleBasket()`; the basket is empty until load()
    // walks the manifest's setModules. The SetModuleBasket starts
    // empty (mod-registrar.ts:77-104) and is process-wide per loader
    // instance, NOT shared across instances.
    const blankLoader = new ModLoader([{ manifest: cardModDate }]);
    const blankShortnames = [
      ...blankLoader.setModules().base.map((m) => m.shortname),
      ...blankLoader.setModules().abstract.map((m) => m.shortname),
      ...[...blankLoader.setModules().nonbase.values()].flat().map((m) => m.shortname),
    ];
    blankLoader.load();
    expect(blankShortnames).not.toContain("All::Calendar");
    expect(blankShortnames).not.toContain("Right::WhenCreated");
    expect(blankShortnames).not.toContain("Right::WhenLastEdited");
    expect(blankShortnames).not.toContain("Self::Now");
    expect(blankShortnames).not.toContain("Type::Date");
    blankLoader.reset();
  });

  it("WITH the mod: every set module from the gem tree is in the basket", () => {
    const l = new ModLoader([{ manifest: cardModDate }]);
    loader = l;
    l.load();

    const basket = l.setModules();
    expect(basket.base.map((m) => m.shortname)).toContain("All::Calendar");
    const nonbase = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(nonbase).toContain("Right::WhenCreated");
    expect(nonbase).toContain("Right::WhenLastEdited");
    expect(nonbase).toContain("Self::Now");
    expect(nonbase).toContain("Type::Date");
  });

  it("WITH the mod: every set module carries the modName 'date'", () => {
    const l = new ModLoader([{ manifest: cardModDate }]);
    loader = l;
    l.load();

    const basket = l.setModules();
    const all = [
      ...basket.base,
      ...basket.abstract,
      ...[...basket.nonbase.values()].flat(),
    ];
    for (const mod of all) expect(mod.modName).toBe("date");
  });

  it("WITH the mod: load()'s registeredSetModules count is exactly 5 (every Ruby file)", () => {
    // The gem's tree has five .rb set files: all/calendar, right/when_created,
    // right/when_last_edited, self/now, type/date.
    const l = new ModLoader([{ manifest: cardModDate }]);
    loader = l;
    const report = l.load();
    expect(report.registeredSetModules).toHaveLength(5);
    expect(report.registeredSetModules).toEqual(
      expect.arrayContaining([
        "All::Calendar",
        "Right::WhenCreated",
        "Right::WhenLastEdited",
        "Self::Now",
        "Type::Date",
      ]),
    );
  });

  it("WITH the mod: the mod registers NO views (mod-compat-report verdict 1/1 in HTML_VIEWS, 0 mod-specific)", () => {
    // The compat report's verdict for this gem is "1/1 html views in
    // HTML_VIEWS (0/0 mod-specific)" and "htmlViewsMissing": []. The
    // engine's coreView already implements every byte the gem's :core
    // view produces; the faithful move is to NOT register :core here
    // (a mod-side registration would shadow the engine's correct impl
    // via the mod-registrar's last-wins rule).
    const l = new ModLoader([{ manifest: cardModDate }]);
    loader = l;
    const report = l.load();
    expect(report.registeredViews).toEqual([]);
  });

  it("WITH the mod: the mod's manifest name + gem name match the gem tree", () => {
    const l = new ModLoader([{ manifest: cardModDate }]);
    loader = l;
    const report = l.load();
    expect(report.modNames).toContain("date");
  });
});

// ---------------------------------------------------------------------------
// the engine's :core for the Date cardtype - the engine-side impl the
// mod defers to
// ---------------------------------------------------------------------------

describe("WITH the mod: the engine's :core for the Date cardtype (views.ts:186-214 + formatDateCore)", () => {
  it("Oracle Date Probe's :core renders the strftime '%B %-d, %Y' format", async () => {
    // The engine's formatDateCore parses card.dbContent ('2026-03-15')
    // and emits 'March 15, 2026' (views.ts:235-248: month=long 'March',
    // day=15, year=2026). The mod's set/type/date.rb:6-8 view is the
    // exact same byte shape; the engine impl is what the test exercises.
    const s = storage!;
    const html = await s.engine.render("Oracle Date Probe", "core");
    expect(html).toBe("March 15, 2026");
  });

  it("the mod does NOT shadow the engine's :core (loader.reset() leaves it intact)", async () => {
    // If the mod registered its own :core for type/date, the
    // mod-registrar's last-wins rule (loader.ts:199) would shadow the
    // engine's correct implementation. The mod's manifest leaves the
    // :core view registration empty (mod-manifest.ts#setModules:
    // formats.html.views: []); the engine impl is the canonical view.
    // We assert that rendering 'Oracle Date Probe' :core produces the
    // strftime format (the engine impl's signature).
    const l = new ModLoader([{ manifest: cardModDate }]);
    loader = l;
    l.load();
    const s = storage!;
    const html = await s.engine.render("Oracle Date Probe", "core");
    expect(html).toBe("March 15, 2026");
  });
});

// ---------------------------------------------------------------------------
// the engine's :core for the right/when_created / self/now virtual cards
// - the engine surface gap the mod documents but cannot fill
// ---------------------------------------------------------------------------

describe("WITH the mod: engine-surface-gap (set-module content overrides not ported)", () => {
  it("Oracle When Created Probe+when_created :core returns '' (virtual card, no dbContent; mod's def content is unported)", async () => {
    // Ruby's standard :core view (the commented-out `view :core, :raw`
    // at when_created.rb:13) renders `card.content`, which dispatches
    // through `def content` (when_created.rb:7-11) and returns the
    // formatted timestamp. The TS engine has no per-card content
    // override machinery (format.ts#renderRaw:600 reads
    // `this.card.dbContent` unconditionally, no per-set hook), so the
    // engine's :core for a virtual right card returns "". The mod's
    // manifest explicitly leaves the :core registration empty - the
    // engine impl is what runs.
    const s = storage!;
    const html = await s.engine.render(
      "Oracle When Created Probe+when_created",
      "core",
    );
    expect(html).toBe("");
  });

  it("Oracle When Last Edited Probe+when last edited :core returns '' (same engine surface gap)", async () => {
    const s = storage!;
    const html = await s.engine.render(
      "Oracle When Last Edited Probe+when last edited",
      "core",
    );
    expect(html).toBe("");
  });

  it("the 'now' card :core returns '' (virtual card, no dbContent; mod's def content is unported)", async () => {
    // Ruby's now.rb:1-3 `def content; I18n.localize(Time.now, ...); end`
    // is the source. The engine's :core for the *now card returns ""
    // (virtual, no dbContent). The formatDayofwkMinTz helper above is
    // the TS-port-friendly shape callers can use when they have a
    // timestamp in hand; the engine's render path does not call it for
    // this card today.
    const s = storage!;
    const html = await s.engine.render("now", "core");
    expect(html).toBe("");
  });
});

// ---------------------------------------------------------------------------
// loader reset semantics
// ---------------------------------------------------------------------------

describe("card-mod-date loader reset", () => {
  it("loader.reset() empties the set-module basket", () => {
    const l = new ModLoader([{ manifest: cardModDate }]);
    l.load();
    expect(l.setModules().base.length).toBeGreaterThan(0);
    expect(l.setModules().nonbase.size).toBeGreaterThan(0);

    l.reset();
    expect(l.setModules().base).toEqual([]);
    expect(l.setModules().nonbase.size).toBe(0);
    loader = l;
  });

  it("loader.reset() leaves the engine's :core untouched (the mod did not register one)", async () => {
    // The mod registers no views; reset() removes the basket
    // registrations but the engine's :core view stays the same.
    // Oracle Date Probe :core renders 'March 15, 2026' both before
    // and after the mod's load+reset cycle.
    const l = new ModLoader([{ manifest: cardModDate }]);
    l.load();
    const s = storage!;
    const beforeReset = await s.engine.render("Oracle Date Probe", "core");
    expect(beforeReset).toBe("March 15, 2026");

    l.reset();
    const afterReset = await s.engine.render("Oracle Date Probe", "core");
    expect(afterReset).toBe("March 15, 2026");
    loader = l;
  });
});