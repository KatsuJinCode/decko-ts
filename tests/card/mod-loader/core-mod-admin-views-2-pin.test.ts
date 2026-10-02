// ORACLE-PINNED byte-compares for the core-mod admin views the
// admin-view-pins fixture (fixtures/captured/admin-view-pins.json, the
// lane-admin-pins capture) carries bytes for but had no pin tests for, plus
// the two set/self/admin.rb views captured fresh this lane
// (fixtures/captured/admin-views-2-oracle.json,
// tests/card/mod-loader/oracle-capture-admin-card-views.rb, no-write proof
// card_actions 5018 -> 5018). The suite loads the FULL composed deck
// (defaultDeckLoader) — the *admin :core task table reads the deck task
// basket (card-mod-carrierwave's delete_upload_tmp_files contribution) and
// the :warning alert walks the deck warning list (card-mod-recaptcha's
// recaptcha_config_issues push).
//
// The seeds carry the LIVE DECK's ids (the capture's data-card-id bytes are
// pinned verbatim): the codename cards the bars nest, the eight cardtype
// cards mod: format's admin.yml lists, *title/*head/*credit (its
// configurations), *structure (mod: content's first settings item), the
// *style/*script settings + the two mod: format children (the group-card
// :core renders), and the *update-rule universe the roles walk reads.
//
// Views pinned here (oracle source per test):
//   *admin      :core, :warning            (admin-views-2-oracle.json)
//   Mod         :tasks                     (admin-view-pins.json — FULL byte)
//   Mod         :settings, :configurations (slice — the full-deck renders are
//                                           31-mod renders; the TS seed's
//                                           mod-card iteration is name-sorted,
//                                           the deck's Card.search order is
//                                           not — the head slice pins the
//                                           h1 + first section's bar shape)
//   mod: format :core, :cardtypes, :configurations, :description, :gem_info,
//               :views                     (FULL byte)
//   mod: format :settings, :tasks           ("" empty arms)
//   mod: core   :styles, :scripts, :depends_on ("" empty arms — no children)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { modEngineHost } from "../../../src/card/mod-loader/mod-engine-host.js";
import {
  defaultDeckLoader,
} from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import {
  adminRuntimeConfig,
  resetAdminRuntimeConfig,
  setAdminRuntimeConfig,
} from "../../../src/card/mod-loader/mods/core-mod.js";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

const PINS_FIXTURE = JSON.parse(
  readFileSync(`${REPO}/fixtures/captured/admin-view-pins.json`, "utf8"),
) as AdminViewPinsFixture;

const ADMIN_FIXTURE = JSON.parse(
  readFileSync(`${REPO}/fixtures/captured/admin-views-2-oracle.json`, "utf8"),
) as AdminViewPinsFixture;

interface AdminViewPinsFixture {
  targets: Record<
    string,
    {
      meta: { id: number; name: string; type_id: number; type_name: string };
      views: Record<string, { rendered: { bytes?: string; denied?: boolean } }>;
    }
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
}

/** The same masks both captures apply (wrap.rb:45 SecureRandom slot ids;
 *  the accordion collapse-id's per-process SipHash). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(
      /(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g,
      "$1HASH$2",
    );
}

function firstDiff(actual: string, expected: string): string {
  const n = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < n && actual[i] === expected[i]) i++;
  const win = (s: string) =>
    JSON.stringify(s.slice(Math.max(0, i - 80), i + 120));
  return (
    `first diff at char ${i} (actual ${actual.length}B vs expected ${expected.length}B):\n` +
    `  actual:   ${win(actual)}\n  expected: ${win(expected)}`
  );
}

let storage: RenderTestStorage | undefined;
let loader: ReturnType<typeof defaultDeckLoader> | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // --- the codename registry cards, at the live deck's ids ----------------
  await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3 });
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 2 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 3 });
  // the Setting cardtype card (id 6) — the typeCode source for every
  // Setting-typed card's TYPE-setting slot token (the bar nests)
  await seedCard(s, { id: 6, name: "Setting", codename: "setting", typeId: 3 });
  // the sign-in/sign-up link targets the not_found frames render
  // (known-card classes; the live deck's ids)
  await seedCard(s, { id: 269, name: "*signin", codename: "signin", typeId: 6 });
  await seedCard(s, { id: 232, name: "Sign up", codename: "signup", typeId: 3 });
  // the Mod cardtype card (id 15) — the TYPE-mod set-key token's codename
  // source: without it the mod cards' setKeys never carry TYPE-mod and the
  // whole Type::Mod view module is unreachable.
  await seedCard(s, { id: 15, name: "Mod", codename: "mod", typeId: 3 });
  await seedCard(s, { id: 13, name: "*admin", codename: "admin", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, {
    id: 70, leftId: 10, rightId: 12, typeId: 14,
    dbContent: "Anyone Signed In",
  });
  await seedCard(s, { id: 182, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 4 });
  // the settings the bars nest (configurations + settings sections)
  await seedCard(s, { id: 50, name: "*title", codename: "title", typeId: 43 });
  await seedCard(s, { id: 46, name: "*head", codename: "head", typeId: 6 });
  await seedCard(s, { id: 51, name: "*credit", codename: "credit", typeId: 39 });
  await seedCard(s, { id: 28, name: "*structure", codename: "structure", typeId: 6 });
  // the recaptcha warning's two link targets
  await seedCard(s, { id: 514, name: "*captcha", codename: "captcha", typeId: 6 });
  await seedCard(s, { id: 517, name: "*recaptcha settings", codename: "recaptcha_settings", typeId: 6 });
  // the *style / *script settings (the mod children's right sides)
  await seedCard(s, { id: 349, name: "*style", codename: "style", typeId: 6 });
  await seedCard(s, { id: 302, name: "*script", codename: "script", typeId: 6 });
  // the eight cardtype cards mod: format's admin.yml cardtypes list nests
  // (names as the live deck spells them — card 37 is "PlainText")
  await seedCard(s, { id: 37, name: "PlainText", codename: "plain_text", typeId: 3 });
  await seedCard(s, { id: 39, name: "HTML", codename: "html", typeId: 3 });
  await seedCard(s, { id: 43, name: "Phrase", codename: "phrase", typeId: 3 });
  await seedCard(s, { id: 33, name: "JSON", codename: "json", typeId: 3 });
  await seedCard(s, { id: 35, name: "Number", codename: "number", typeId: 3 });
  await seedCard(s, { id: 41, name: "Toggle", codename: "toggle", typeId: 3 });
  await seedCard(s, { id: 45, name: "URI", codename: "uri", typeId: 3 });

  // --- the mod cards (live ids) -------------------------------------------
  await seedCard(s, { id: 536, name: "mod: core", codename: "mod_core", typeId: 15 });
  await seedCard(s, { id: 539, name: "mod: format", codename: "mod_format", typeId: 15 });
  await seedCard(s, { id: 538, name: "mod: content", codename: "mod_content", typeId: 15 });

  // --- mod: format's style/script children (the group-card :core renders) -
  await seedCard(s, {
    id: 541, name: "mod: format+*style", leftId: 539, rightId: 349, typeId: 4,
    dbContent: "",
  });
  await seedCard(s, {
    id: 540, name: "mod: format+*script", leftId: 539, rightId: 302, typeId: 4,
    dbContent: "",
  });

  // --- the composed deck (31 manifests, core first) ------------------------
  const host = modEngineHost(s.engine, s.fetcher);
  loader = defaultDeckLoader();
  await loader.installInto(host);
  s.engine.modLoader = loader;

  // warm the junction children into the sync render cache — the automatic
  // warm covers codename cards + mod cards only; the +*style/+*script
  // junctions have no codename and the sync render (the +*style nest in
  // :styles/:scripts) answers only from that cache.
  for (const id of [541, 540]) {
    const record = await s.fetcher.fetchById(id);
    if (record !== undefined) await host.cacheFetchedRecord(record);
  }

  // the oracle deck runs with action_mailer.perform_deliveries = false
  // (config/application.rb:19; the capture's deck_config records it) — the
  // *admin :warning alert's no_email_delivery <li> fires on this.
  setAdminRuntimeConfig({ performDeliveries: false });
}, 120_000);

afterAll(() => {
  setAdminRuntimeConfig({}); // restore the Rails defaults
  resetAdminRuntimeConfig();
  setDefaultModLoader(undefined); // unbind the process defaults
  loader?.reset();
  storage?.close();
});

// ---------------------------------------------------------------------------
// the fresh capture's no-write proof (admin-views-2-oracle.json)
// ---------------------------------------------------------------------------

describe("no-write discipline (the capture's actions count unchanged)", () => {
  it("the *admin capture asserts actions_before == actions_after", () => {
    expect(ADMIN_FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(ADMIN_FIXTURE.no_write_proof.actions_before).toBe(
      ADMIN_FIXTURE.no_write_proof.actions_after,
    );
  });
});

// ---------------------------------------------------------------------------
// set/self/admin.rb — the *admin card views (fresh capture)
// ---------------------------------------------------------------------------

describe("set/self/admin.rb — view :core on *admin (the deck task table)", () => {
  it("byte-matches the oracle capture (4 tasks: core's 3 + carrierwave's)", async () => {
    const s = storage!;
    const expected = ADMIN_FIXTURE.targets.admin_card.views.core.rendered.bytes!;
    const actual = normalize(await s.engine.render("*admin", "core"));
    expect(actual).toBe(expected);
  });
});

describe("set/self/admin.rb — view :warning on *admin (the deck warning alert)", () => {
  it("byte-matches the oracle capture (2 warnings: email-off + recaptcha keys)", async () => {
    const s = storage!;
    const expected = ADMIN_FIXTURE.targets.admin_card.views.warning.rendered.bytes!;
    const actual = normalize(await s.engine.render("*admin", "warning"));
    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// set/self/mod.rb — the Mod cardtype card's global views
// ---------------------------------------------------------------------------

describe("set/self/mod.rb — view :tasks on Mod (the codename-item sections)", () => {
  it("byte-matches the oracle capture (one section, 3 not_found nests)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_cardtype_card.views.tasks.rendered.bytes!;
    const actual = normalize(await s.engine.render("Mod", "tasks"));
    expect(actual).toBe(expected);
  });
});

describe("set/self/mod.rb — view :settings on Mod (SLICE: head through the first bar slot)", () => {
  it("head slice + scaling match the oracle capture", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_cardtype_card.views.settings.rendered.bytes!;
    const actual = normalize(await s.engine.render("Mod", "settings"));
    // the first section is mod: content's settings (alphabetically first
    // among the settings-carrying mods on BOTH sides — the deck's
    // Card.search section order beyond the first section is not
    // name-sorted, a modCards-iteration divergence the slice discloses).
    const anchor = expected.indexOf('data-card-name="*structure"');
    expect(anchor).toBeGreaterThan(0);
    const headEnd = expected.indexOf("data-slot-id", anchor);
    const headSlice = expected.slice(0, headEnd);
    expect(actual.startsWith(headSlice)).toBe(true);
    // TS renders the seeded subset (fewer mods with settings yml) — the
    // structural smaller shape against the 31-mod capture.
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.length).toBeLessThan(expected.length);
  });
});

describe("set/self/mod.rb — view :configurations on Mod (SLICE: head through the first bar slot)", () => {
  it("head slice + scaling match the oracle capture", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_cardtype_card.views.configurations.rendered.bytes!;
    const actual = normalize(await s.engine.render("Mod", "configurations"));
    // first section: mod: format's "Basic Configuration" (the alphabetically
    // first configurations-carrying mod)
    const anchor = expected.indexOf('data-card-name="*title"');
    expect(anchor).toBeGreaterThan(0);
    const headEnd = expected.indexOf("data-slot-id", anchor);
    const headSlice = expected.slice(0, headEnd);
    expect(actual.startsWith(headSlice)).toBe(true);
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.length).toBeLessThan(expected.length);
  });
});

// ---------------------------------------------------------------------------
// set/type/mod.rb — the per-mod views on mod: format
// ---------------------------------------------------------------------------

describe("set/type/mod.rb — view :core on mod: format (the section composition)", () => {
  it("byte-matches the oracle capture", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.core.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "core"));
    expect(actual).toBe(expected);
  });
});

describe("set/type/mod.rb — view :cardtypes on mod: format (the admin.yml accordion)", () => {
  it("byte-matches the oracle capture (3 groups, 8 codename bars)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.cardtypes.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "cardtypes"));
    expect(actual).toBe(expected);
  });
});

describe("set/type/mod.rb — view :configurations on mod: format", () => {
  it("byte-matches the oracle capture (Basic Configuration, 3 setting bars)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.configurations.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "configurations"));
    expect(actual).toBe(expected);
  });
});

describe("set/type/mod.rb — view :description on mod: format", () => {
  it("byte-matches the oracle capture (<p>Format mod</p>)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.description.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "description"));
    expect(actual).toBe(expected);
  });
});

describe("set/type/mod.rb — view :gem_info on mod: format (the spec properties + 2 accordions)", () => {
  it("byte-matches the oracle capture", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.gem_info.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "gem_info"));
    expect(actual).toBe(expected);
  });
});

describe("set/type/mod.rb — view :views on mod: format (the 12 admin.yml view names)", () => {
  it("byte-matches the oracle capture", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.views.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "views"));
    expect(actual).toBe(expected);
  });
});

describe("set/type/mod.rb — the empty arms on mod: format", () => {
  it(":settings renders \"\" (the format admin.yml carries no settings key)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.settings.rendered.bytes;
    expect(expected).toBe("");
    expect(await s.engine.render("mod: format", "settings")).toBe("");
  });

  it(":tasks renders \"\" (no basket task is mod: format's)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_format_card.views.tasks.rendered.bytes;
    expect(expected).toBe("");
    expect(await s.engine.render("mod: format", "tasks")).toBe("");
  });
});

describe("set/type/mod.rb — the empty arms on mod: core (no style/script children, no spec deps)", () => {
  it(":styles renders \"\" (no +*style child card exists for mod: core)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_core_card.views.styles.rendered.bytes;
    expect(expected).toBe("");
    expect(await s.engine.render("mod: core", "styles")).toBe("");
  });

  it(":scripts renders \"\" (no +*script child card exists for mod: core)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_core_card.views.scripts.rendered.bytes;
    expect(expected).toBe("");
    expect(await s.engine.render("mod: core", "scripts")).toBe("");
  });

  it(":depends_on renders \"\" (the core mod's spec is nil — probe-2)", async () => {
    const s = storage!;
    const expected = PINS_FIXTURE.targets.mod_core_card.views.depends_on.rendered.bytes;
    expect(expected).toBe("");
    expect(await s.engine.render("mod: core", "depends_on")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// the bar_right port (card-mod-format set/type/mod.rb) — the seeded-mod
// bar-right list the :depends_on/:gem_info bars embed
// ---------------------------------------------------------------------------

describe("set/type/mod.rb — view :bar_right (chain-scoped to Mod-typed cards)", () => {
  it("mod: content's bar lists 'settings' (its admin.yml settings key)", async () => {
    const s = storage!;
    // rendered through the bar view's bar-right slot
    const html = normalize(await s.engine.render("mod: content", "bar"));
    expect(html).toContain("<div class='bar-right col-3'>\nsettings\n</div>");
  });

  it("non-Mod cards keep the engine's bar_right (the *all rule bar stays empty)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "bar"));
    // views.ts barRightView: the *all bar_right stays empty for everything
    // else — the chain-scoped registration must not leak onto it
    expect(html).toContain("<div class='bar-right col-3'>\n\n</div>");
  });
});

// ---------------------------------------------------------------------------
// diagnostics helper (kept from the prior pin suite's convention)
// ---------------------------------------------------------------------------

describe("informational — the *admin capture's deck_config", () => {
  it("recorded perform_deliveries: false (the deck's application.rb choice)", () => {
    expect(adminRuntimeConfig().performDeliveries).toBe(false);
  });
});
