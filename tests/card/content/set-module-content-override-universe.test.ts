// - Self::Mod: Ruby interpolates a Cardio::Mod OBJECT into a string;
//   Cardio::Mod has no #to_s (lib/cardio/mod.rb), so Ruby emits Object#to_s
//   → "#<Cardio::Mod:0xADDR>_mod" — a process-bound heap address. Since the
//   mod-address-normalization lane (2026-10-04) the port renders that exact
//   SHAPE with its own genuine per-process opaque id; only the VALUE is
//   unmatched, and the comparator canonicalizes it on both sides
//   (src/testing/diff.ts normalizeModObjectAddresses). The full pass-iff
//   contract lives in mod-object-address-shape-parity.test.ts.// The card-level set-module content-override universe pins: the port of Ruby's
// set-module `def content` hook at the CARD-CONTENT level (the seam the corpus
// record path grades). Lane: set-override-fidelity 2026-10-03 (relaunch);
// derivation = WORK_DIR/set-override-fidelity-lane.md
// "[relaunch t1] RUBY DERIVATION COMPLETE".
//
// Ruby mechanism (why these answers exist): set modules are included into each
// card's SINGLETON class (mod/core/set/all/initialize.rb:61-74), so a
// `def content` in any applicable set module shadows the base
// Card::Content::All#content (lib/card/content/all.rb:5-7) — the DB-row path —
// for EVERY card.content caller. The corpus record entries photograph
// card.content (capture-dual-lane-page-and-view.rb:254), so their expected
// `content` bytes carry the override answers, not the rows.
//
// Expectation-byte provenance: tmp/raw-ground-truth/expected-v2
// view-lane/recapture-raw-shard-000003.jsonl (*now / *version / *alerts
// records), view-lane/recapture-raw-shard-000007.jsonl (*input type+*right+*content
// options record) — the capture deck's own Ruby answers.
//
// Known, deliberately-loud divergences (documented in the lane receipt):
// - Self::Mod: Ruby's item_codes interpolate a Cardio::Mod OBJECT into a
//   string; Cardio::Mod has no #to_s (lib/cardio/mod.rb), so Ruby emits
//   Object#to_s → "#<Cardio::Mod:0xADDR>_mod" — process-bound heap addresses
//   that no mechanism can reproduce. The port emits "<mod name>_mod" per
//   loaded mod (ORACLE_BUNDLE_ORDER — the captured bundle order,
//   fixtures/captured/help-mod-loader.json). Line count (34) and the "_mod"
//   suffix are the Ruby-derivable part; the address bytes are not.
// - Self::Now: I18n.localize(Time.now) — the capture froze a live wall clock
//   in the graded deck's zone (America/Los_Angeles). The port takes the
//   instant from the injectable capture wall clock; the pin freezes it to the
//   captured minute. The zone is the DECK's configured one and %Z is the
//   abbreviation computed from it, so this September (PDT) instant reads
//   "PDT" where the corpus photographed the Windows display name "Pacific
//   Standard Time" — Ruby prints the abbreviation; that display name was the
//   capture host's operating system leaking into the port's output.
import { describe, expect, it } from "vitest";

import { ORACLE_BUNDLE_ORDER } from "../../../src/card/mod-loader/default-mod-deck.js";

import {
  CAPTURE_WALL_CLOCK_CAPTURE_INSTANT,
  formatCardDayofwkMinTz,
  listInputOptionsContent,
  capturedModObjects,
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
  it("Self::Now answers the capture wall clock in the deck zone (set/self/now.rb:1-3)", () => {
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    const answer = resolveSetModuleContent(card({}));
    // The captured record bytes (view-lane shard-000003, *now record.content):
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
    const answer = resolveSetModuleContent(
      card({ key: "mod", name: "mod", codename: "mod", partCodenames: ["mod"] }),
    );
    expect(answer).toBeDefined();
    const lines = (answer as string).split("\n");
    // The captured expectation carries 34 lines (the capture deck's loaded
    // mods) — the port's bundle order is the SAME captured order
    // (ORACLE_BUNDLE_ORDER, fixtures/captured/help-mod-loader.json).
    expect(lines.length).toBe(34);
    expect(lines[0]).toMatch(/_mod$/);
    expect(lines[33]).toMatch(/_mod$/);
    // SHAPE FIDELITY (mod-address-normalization lane, 2026-10-04): Ruby's line
    // IS "#<Cardio::Mod:0xADDR>_mod" — Object#to_s of a Cardio::Mod that
    // defines no #to_s (lib/cardio/mod.rb) — and the port now renders the same
    // template with a genuine per-process opaque id. The VALUE stays
    // unmatchable and is canonicalized at the compare seam
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
    // The captured record bytes (view-lane shard-000007, 107 bytes):
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
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
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
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    expect(formatCardDayofwkMinTz(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT)).toBe(
      "Monday, September 28, 2026 03:12 PM PDT",
    );
  });

  it("modItemCodesContent mirrors Cardio.mods bundle order", () => {
    const lines = modItemCodesContent().split("\n");
    expect(lines.length).toBe(34);
    // Every line is Object#to_s of the mod at that position, so the ORDER is
    // carried by capturedModObjects rather than by the bytes (Object#to_s
    // prints the address, not the name). See the mod-address-normalization
    // lane receipt for why the mod object carries its name alongside the
    // per-process identity, and how the ordering is pinned.
    const mods = capturedModObjects();
    expect(mods.map((m) => m.name)).toEqual([...ORACLE_BUNDLE_ORDER]);
    expect(mods[0].name).toBe("core");
    expect(mods[1].name).toBe("collection");
    expect(mods[33].name).toBe("defaults");
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
