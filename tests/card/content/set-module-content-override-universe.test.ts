// The card-level set-module content-override universe: the `def content`
// hook each set module installs at the CARD-CONTENT level.
//
// WHY THESE ANSWERS EXIST: set modules are included into each card's SINGLETON
// class, so a `def content` in any applicable set module shadows the base
// Card::Content::All#content — the DB-row path — for EVERY card.content
// caller.
//
// TWO ANSWERS ARE PINNED AS SHAPE, NOT BYTE:
// - Self::Mod: the reference implementation interpolates a mod OBJECT into a
//   string, and that object's class defines no #to_s, so the line is
//   Object#to_s — "#<Cardio::Mod:0xADDR>_mod" — a process-bound heap address.
//   The renderer emits that exact SHAPE with its own genuine per-process
//   opaque id; only the VALUE is unmatched, and the comparator canonicalizes
//   it on both sides (src/testing/diff.ts normalizeModObjectAddresses). The
//   full pass-iff contract lives in
//   mod-object-address-shape-parity.test.ts.
// - Self::Now: the reference localizes Time.now in the deck's zone. The engine
//   takes the instant from an injectable wall clock, and the pin freezes it to
//   a fixed minute. %Z is the abbreviation computed from the deck's configured
//   zone, so a September instant reads "PDT" — the abbreviation, not whatever
//   long display name the host platform uses for it.
//
// Self::Version answers the card release, the same 0.20.0 the shipped mod
// tree declares.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RECORDED_HOST_TIME_ZONE,
  resetDeckTimeZone,
  setDeckTimeZone,
} from "../../../src/card/deck-time-zone.js";

import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";

import {
  RECORDED_NOW_INSTANT,
  formatCardDayofwkMinTz,
  listInputOptionsContent,
  deckModObjects,
  modItemCodesContent,
  ORACLE_CAPTURE_NOW_BYTES,
  resolveSetModuleContent,
  setCaptureWallClock,
  toPointerContent,
  type SetModuleContentCard,
} from "../../../src/card/set-module-content-overrides.js";

function card(overrides: Partial<SetModuleContentCard>): SetModuleContentCard {
  return {
    key: "*now",
    name: "*now",
    codename: "now",
    typeCode: "basic", // BasicCs type_code: "" — the *now row's type_code
    dbContent: "",
    partCodenames: ["now"],
    ...overrides,
  };
}

describe("set-module content override universe (card-level record path)", () => {
  // These pins are zone-sensitive: the engine's default is UTC — the deck's
  // own configured zone — and the expected bytes were rendered in a
  // different zone, so this file sets the zone explicitly.
  beforeEach(() => setDeckTimeZone(RECORDED_HOST_TIME_ZONE));
  afterEach(() => resetDeckTimeZone());

  it("Self::Now answers the recorded wall clock in the deck zone (set/self/now.rb:1-3)", () => {
    setCaptureWallClock(RECORDED_NOW_INSTANT);
    const answer = resolveSetModuleContent(card({}));
    // the pinned *now record content:
    expect(answer).toBe(ORACLE_CAPTURE_NOW_BYTES);
    expect(answer).toBe("Monday, September 28, 2026 03:12 PM PDT");
  });

  it("Self::Version answers the card gem release (mod/core/set/self/version.rb:7-9)", () => {
    const answer = resolveSetModuleContent(
      card({ key: "*version", name: "*version", codename: "version", partCodenames: ["version"] }),
    );
    expect(answer).toBe("0.20.0");
  });

  it("Self::Alerts answers the deprecation literal (card-mod-layout set/self/alerts.rb:1-3)", () => {
    const answer = resolveSetModuleContent(
      card({ key: "*alerts", name: "*alerts", codename: "alerts", partCodenames: ["alerts"] }),
    );
    expect(answer).toBe("<!-- *alerts is deprecated. please remove from layout -->");
  });

  it("Self::Foot answers the deprecation literal (card-mod-layout set/self/foot.rb:1-3)", () => {
    const answer = resolveSetModuleContent(
      card({ key: "*foot", name: "*foot", codename: "foot", partCodenames: ["foot"] }),
    );
    expect(answer).toBe("<!-- *foot is deprecated. please remove from layout -->");
  });

  it("Self::Mod answers one Object#to_s '_mod' line per loaded mod in bundle order (mod/core/set/self/mod.rb:4-6)", () => {
    // Cardio.mods is the running deck's mod list: bind the default deck and
    // expect one line per mod its loader resolved.
    const names = defaultDeckLoader().modNames();
    const answer = resolveSetModuleContent(
      card({ key: "mod", name: "mod", codename: "mod", partCodenames: ["mod"] }),
    );
    expect(answer).toBeDefined();
    const lines = (answer as string).split("\n");
    expect(lines.length).toBe(names.length);
    expect(lines[0]).toMatch(/_mod$/);
    expect(lines[names.length - 1]).toMatch(/_mod$/);
    // SHAPE FIDELITY: the reference line IS "#<Cardio::Mod:0xADDR>_mod" —
    // Object#to_s of a mod whose class defines no #to_s — and the renderer
    // emits the same template with a genuine per-process opaque id. The VALUE
    // stays unmatchable and is canonicalized at the compare seam
    // (normalizeModObjectAddresses); the pass-iff contract, including every
    // other byte, is pinned in mod-object-address-shape-parity.test.ts.
    expect(lines[0]).toMatch(/^#<Cardio::Mod:0x[0-9a-f]{16}>_mod$/);
  });

  it("Self::InputType::Right::ContentOptions answers the basket catalog (card-mod-list set/self/input_type/right/content_options.rb:3-5)", () => {
    const answer = resolveSetModuleContent(
      card({
        key: "input_type+right+content_option",
        name: "*input type+*right+*content options",
        partCodenames: ["input_type", "right", "content_options"],
      }),
    );
    // the pinned record content (107 bytes):
    expect(answer).toBe(
      "radio\ncheckbox\nselect\nmultiselect\nlist\nautocomplete\ntext area\ntext field\nace editor\ncalendar\ntinymce editor",
    );
  });

  it("Type::Session answers the row (db_content || session_content; session is empty in the engine) (card-mod-session set/type/session.rb:33-35)", () => {
    const answer = resolveSetModuleContent(
      card({
        key: "*toolbar_pinned",
        name: "*toolbar pinned",
        codename: "toolbar_pinned",
        typeCode: "session",
        dbContent: "",
        partCodenames: ["toolbar_pinned"],
      }),
    );
    expect(answer).toBe("");
    const nonEmpty = resolveSetModuleContent(
      card({
        key: "*toolbar_pinned",
        name: "*toolbar pinned",
        codename: "toolbar_pinned",
        typeCode: "session",
        dbContent: "stored bytes",
        partCodenames: ["toolbar_pinned"],
      }),
    );
    expect(nonEmpty).toBe("stored bytes");
  });

  it("Right::WhenCreated answers the left's created_at in the deck zone (card-mod-date set/right/when_created.rb:7-11)", () => {
    const answer = resolveSetModuleContent(
      card({
        key: "home+when_created",
        name: "Home+*when created",
        partCodenames: [null, "when_created"],
        leftIsReal: true,
        leftCreatedAt: "2026-09-28 22:12:00.000",
      }),
    );
    expect(answer).toBe("Monday, September 28, 2026 03:12 PM PDT");
    const unrealLeft = resolveSetModuleContent(
      card({
        key: "home+when_created",
        name: "Home+*when created",
        partCodenames: [null, "when_created"],
        leftIsReal: false,
      }),
    );
    expect(unrealLeft).toBe("");
  });

  it("a card whose anchor parts are not all codenamed gets NO override (pattern/base.rb:46-49 anchor_codenames break)", () => {
    // A compound card whose left part has no codename: the Self chain is
    // unbuildable and no Right/Type module matches.
    const answer = resolveSetModuleContent(
      card({
        key: "plainfield+now",
        name: "plainfield+*now",
        codename: null,
        partCodenames: [null, "now"],
      }),
    );
    expect(answer).toBeUndefined();
  });

  it("Self beats Type when both patterns match (set_modules include order, set/pattern/all.rb:44-46)", () => {
    // A card named "*now" typed session matches BOTH Self::Now and
    // Type::Session; the singleton include order ends with Self, so Self wins.
    setCaptureWallClock(RECORDED_NOW_INSTANT);
    const answer = resolveSetModuleContent(
      card({
        key: "*now",
        name: "*now",
        codename: "now",
        typeCode: "session",
        dbContent: "row bytes",
        partCodenames: ["now"],
      }),
    );
    expect(answer).toBe(ORACLE_CAPTURE_NOW_BYTES);
  });

  it("formatCardDayofwkMinTz applies en.yml:29's '%A, %B %d, %Y %I:%M %p %Z' in the deck zone", () => {
    setCaptureWallClock(RECORDED_NOW_INSTANT);
    expect(formatCardDayofwkMinTz(RECORDED_NOW_INSTANT)).toBe(
      "Monday, September 28, 2026 03:12 PM PDT",
    );
  });

  it("modItemCodesContent mirrors Cardio.mods: the deck's resolved mod order", () => {
    // Cardio.mods = Mod.dirs.mods (lib/cardio.rb:48-50): the running deck's
    // mods. Every line is Object#to_s of the mod at that position, so the
    // ORDER is carried by deckModObjects rather than by the bytes (Object#to_s
    // prints the address, not the name). The ordering is pinned in
    // mod-object-address-shape-parity.test.ts.
    const names = defaultDeckLoader().modNames();
    const lines = modItemCodesContent().split("\n");
    expect(lines.length).toBe(names.length);
    const mods = deckModObjects();
    expect(mods.map((m) => m.name)).toEqual(names);
    expect(mods[0].name).toBe("core");
  });

  it("listInputOptionsContent applies the captured basket order via to_pointer_content", () => {
    expect(listInputOptionsContent()).toBe(
      "radio\ncheckbox\nselect\nmultiselect\nlist\nautocomplete\ntext area\ntext field\nace editor\ncalendar\ntinymce editor",
    );
  });

  it("toPointerContent strips one [[ / ]] wrapper per item and joins newlines (array.rb:4-12)", () => {
    expect(toPointerContent(["[[a]]", " b ", "[[c]]"])).toBe("a\nb\nc");
  });
});
