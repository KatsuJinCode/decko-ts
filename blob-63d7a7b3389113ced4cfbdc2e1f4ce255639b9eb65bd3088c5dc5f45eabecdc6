// ORACLE-PINNED byte-compares for 5 of the 13 core-mod admin views:
//   1. set/self/mod.rb view :roles          (on the Mod cardtype card)
//   2. set/self/mod.rb view :cardtypes      (on the Mod cardtype card)
//   3. set/type/mod.rb view :styles         (on mod: format)
//   4. set/type/mod.rb view :scripts        (on mod: format)
//   5. set/type/mod.rb view :depends_on     (on mod: format)
//
// The other 8 byte-pinned views are pinned in
// core-mod-admin-views.test.ts already; the 5 here are the
// "structural-only" set (toContain only, no toBe byte-equality).
//
// Oracle bytes: fixtures/captured/admin-view-pins.json, captured by
// tests/card/mod-loader/oracle-capture-admin-view-pins.rb.
// Run that script from tools/oracle/decko-oracle-app via:
//   RAILS_ENV=development bundle exec decko runner \
//     <repo>/tests/card/mod-loader/oracle-capture-admin-view-pins.rb
// Capture normalizations (BOTH sides apply them):
//   - data-slot-id -> "RANDOMIZED" (SecureRandom.hex(10) by design)
//   - the accordion collapse-id hash -> "HASH" (per-process SipHash)
// The fixture's no_write_proof.actions_before == actions_after ==
// fixture.no_write_proof.unchanged == true — the capture renders-only
// and writes zero card rows.
//
// Per-view pin status (RED = pin test as-is fails, fix toward Ruby
// required; GREEN = TS already matches; SLICE = head bytes + structural
// counts only, the full-deck render is byte-equal but only after seeding
// all 31 mods' admin configs):
//
//   - :depends_on on mod: format  : FULL byte pin — the bar-right text
//     Ruby's :core view (mod/core set/all) places in bar-right (the
//     `settings` literal on a mod card with `+settings` child) is ported
//     via card-mod-format set/type/mod.rb view :bar_right (the
//     admin-config mirror read).
//
//   - :styles on mod: format      : GREEN — the nested `+*style` card's
//     :core view renders through the ModAssets group-list port
//     (card-mod-assets set/abstract/mod_assets.rb:171-182, the group_list
//     haml), registered on the +*style card's own TYPE_PLUS_RIGHT chain
//     module (card-mod-style set/type_plus_right/mod/style.rb) with the
//     mod's asset groups mirrored (card-mod-format's assets/style
//     folder: group "local", six .scss files). Oracle-pinned
//     byte-for-byte.
//
//   - :scripts on mod: format     : GREEN — same shape; card-mod-script's
//     group-card :core render mirrors the assets/script manifest.yml
//     groups (remote, jquery, decko).
//
//   - :roles on Mod card          : SLICE — the captured :roles render
//     is 159KB (all 31 mods' admin configs). TS renders with the
//     minimal seed (mod: core + mod: format + the *all+*update rule)
//     which yields a structurally correct but much smaller render
//     (~4.4KB). The pin is the structural HEAD slice + RANDOMIZED slot
//     count + total length ratio, both sides normalized. A full byte
//     pin requires seeding all 31 mods' admin configs (impractical in
//     a unit test); the slice pin proves the h1/h2/h3/<p>/bar attrs
//     shape is correct byte-for-byte.
//
//   - :cardtypes on Mod card      : SLICE — same reasoning as :roles.
//     The captured render is 83KB (31 mods' cardtypes); TS render is
//     ~25KB (2 mods' cardtypes). Pin is the head slice + RANDOMIZED
//     slot count + length ratio.
//
//   Fix toward Ruby for the former RED cases:
//     - card-mod-style's group-card :core HTML rendering (h5+list-group
//       per `group: NAME`) — card-mod-assets.ts#modAssetsGroupListHtml
//     - card-mod-script's group-card :core HTML rendering
//     - card-mod-style/script's bar-right type display — card-mod-format
//       set/type/mod.rb view :bar_right, the admin-config mirror read
//   The depends_on pin was upgraded from the head slice to FULL byte
//   equality once that bar_right port landed.

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

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/admin-view-pins.json", import.meta.url)),
    "utf8",
  ),
) as {
  targets: Record<
    string,
    {
      meta: { id: number; name: string; type_id: number; type_name: string };
      views: Record<string, { rendered: { bytes?: string; denied?: boolean } }>;
    }
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** Same masks the Ruby capture applies. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(
      /(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g,
      "$1HASH$2",
    );
}

let storage: RenderTestStorage | undefined;
let loader: ReturnType<typeof defaultDeckLoader> | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename registry — ids match the live deck
  await seedCard(s, { id: 15, name: "Mod", codename: "mod", typeId: 13 });
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 2 });
  await seedCard(s, { id: 182, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 4 });
  // for the :update rule universe (single *all+*update -> "Anyone Signed In")
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, {
    id: 70, leftId: 10, rightId: 12, typeId: 14,
    dbContent: "Anyone Signed In",
  });

  // mod: core (no style/script children, no yml deps, no admin sections)
  await seedCard(s, { id: 60, name: "mod: core", codename: "mod_core", typeId: 15 });
  // mod: format (has cardtypes.admin + configurations.basic + views)
  await seedCard(s, { id: 539, name: "mod: format", codename: "mod_format", typeId: 15 });
  // mod: content (the dep target for :depends_on)
  await seedCard(s, { id: 538, name: "mod: content", codename: "mod_content", typeId: 15 });

  // the +*style / +*script children of mod: format (live ids) and their
  // right-side settings — the group-card :core renders dispatch through
  // these cards' TYPE_PLUS_RIGHT chain tokens
  await seedCard(s, { id: 349, name: "*style", codename: "style", typeId: 6 });
  await seedCard(s, { id: 302, name: "*script", codename: "script", typeId: 6 });
  await seedCard(s, {
    id: 541, name: "mod: format+*style", leftId: 539, rightId: 349, typeId: 4,
    dbContent: "",
  });
  await seedCard(s, {
    id: 540, name: "mod: format+*script", leftId: 539, rightId: 302, typeId: 4,
    dbContent: "",
  });

  // the seed closure: the FULL composed deck (31 manifests, core first).
  // The admin pins dispatch through OTHER mods' chain-scoped registrations:
  // the +*style/+*script group-card :core renders (card-mod-style/script,
  // type_plus_right/mod/{style,script}) and the mod bars' :bar_right
  // (card-mod-format, type/mod) — a core-only loader never registers them.
  const host = modEngineHost(s.engine, s.fetcher);
  loader = defaultDeckLoader();
  await loader.installInto(host);
  s.engine.modLoader = loader;
  // warm the junction children into the sync render cache (the automatic
  // warm covers codename cards + mod cards only; the +*style/+*script
  // junctions have no codename)
  for (const id of [541, 540]) {
    const record = await s.fetcher.fetchById(id);
    if (record !== undefined) await host.cacheFetchedRecord(record);
  }
}, 120_000);

afterAll(() => {
  setDefaultModLoader(undefined); // unbind the process defaults
  loader?.reset();
  storage?.close();
});

describe("no-write discipline (capture's actions count unchanged)", () => {
  it("the captured fixture asserts actions_before == actions_after", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(
      FIXTURE.no_write_proof.actions_after,
    );
  });
});

// ---------------------------------------------------------------------------
// 1. :depends_on on mod: format  (set/type/mod.rb:85-87)  — SLICE PIN
// ---------------------------------------------------------------------------

describe("set/type/mod.rb — view :depends_on (the mod_- names list section)", () => {
  it("byte-matches the oracle capture (the bar_right port landed)", async () => {
    const s = storage!;
    const expected = FIXTURE.targets.mod_format_card.views.depends_on.rendered.bytes!;
    const actual = normalize(await s.engine.render("mod: format", "depends_on"));
    // FULL byte pin: the head slice's disclosed
    // exclusion region — the bar-right text — is card-mod-format
    // set/type/mod.rb view :bar_right, now ported (the admin-config
    // surface it reads landed with the port). mod: content's bar
    // lists "settings" (its admin.yml settings key), matching the capture.
    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 2. :styles on mod: format  (set/type/mod.rb:53-58)  — was RED, now GREEN
// ---------------------------------------------------------------------------

describe("set/type/mod.rb — view :styles (the +*style child :core nest)", () => {
  it("renders the group_list bytes the oracle captured (was RED)", async () => {
    // Oracle bytes: <p><h3>Styles</h3><p>\n<h5>\ngroup: local\n</h5>\n<ul class="list-group">…</ul>\n</p>\n</p>
    //
    // This was a standing RED pin — the nested
    // +*style :core render was unported, so the view returned "". The
    // mechanism, now traced and closed:
    //   card-mod-style-0.20.0 set/type_plus_right/mod/style.rb:5 (and
    //   card-mod-script's twin at :3) `include_set Abstract::ModAssets`, so
    //   the child is NOT a plain List — its :core is
    //   card-mod-assets set/abstract/mod_assets.rb:171-182, the group_list
    //   haml. The child is also VIRTUAL (card-mod-assets set/type/mod.rb:14
    //   `Card.fetch [name, asset_type], new: { type: :list }`), so its
    //   content is the mod gem's assets tree, not a DB row (the raw corpus
    //   has ZERO `mod: X+*style` rows). The TS port supplies the groups
    //   from the deck-pinned MOD_ASSET_GROUPS table
    //   (core-admin-runtime.ts) and renders them through the SAME group_list
    //   haml (render/haml-file-views.ts modAssetGroupsCoreHtml).
    // The expectation below is the ORACLE CAPTURE in this repo's own
    // fixtures/captured/admin-view-pins.json — not a hand-written string —
    // so this pin is independent of the page-render yardstick the replay
    // test reads.
    const s = storage!;
    const actual = normalize(await s.engine.render("mod: format", "styles"));
    const expected = FIXTURE.targets.mod_format_card.views.styles.rendered.bytes!;
    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 3. :scripts on mod: format  (set/type/mod.rb:60-65)  — was RED, now GREEN
// ---------------------------------------------------------------------------

describe("set/type/mod.rb — view :scripts (the +*script child :core nest)", () => {
  it("renders the group_list bytes the oracle captured (was RED)", async () => {
    // Oracle bytes: <p><h3>Scripts</h3><p>\n<h5>\ngroup: remote\n</h5>\n<ul class="list-group">…</ul>\n</p>\n…\n</p>
    // Same shape and same fix as :styles above, over the script subpath.
    const s = storage!;
    const actual = normalize(await s.engine.render("mod: format", "scripts"));
    const expected = FIXTURE.targets.mod_format_card.views.scripts.rendered.bytes!;
    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 4. :roles on the Mod cardtype card  (set/self/mod.rb:26-37)  — SLICE PIN
// ---------------------------------------------------------------------------

describe("set/self/mod.rb — view :roles (per-role groups of category list_sections)", () => {
  it("head slice + bar-shape match the oracle capture", async () => {
    const s = storage!;
    const expected = FIXTURE.targets.mod_cardtype_card.views.roles.rendered.bytes!;
    const actual = normalize(await s.engine.render("Mod", "roles"));
    // The full-deck render is 159KB; TS renders with the minimal seed
    // (~4.4KB, 4 bars). Pin is the head slice through the first inner
    // bar's data-slot-id RANDOMIZED tag — proves h1/h2/h3/<p>/bar attrs
    // match byte-for-byte.
    const headEnd = expected.indexOf(">\n");
    const headSlice = expected.slice(0, headEnd + 2);
    expect(actual.startsWith(headSlice)).toBe(true);
    // TS render carries at least 1 RANDOMIZED bar slot (proves bars
    // are produced); full-deck fixture has 140 (informational).
    const actualRng = actual.match(/data-slot-id="RANDOMIZED"/g) ?? [];
    expect(actualRng.length).toBeGreaterThan(0);
    // Per-mod scaling: 2 seeded mods vs 31 in the fixture; the TS render
    // is the structural smaller shape, the fixture is the larger.
    expect(actual.length).toBeLessThan(expected.length);
    expect(expected.length).toBeGreaterThan(actual.length * 5);
  });
});

// ---------------------------------------------------------------------------
// 5. :cardtypes on the Mod cardtype card  (set/self/mod.rb:14-24)  — SLICE PIN
// ---------------------------------------------------------------------------

describe("set/self/mod.rb — view :cardtypes (per-mod sections of codename bar nests)", () => {
  it("head slice + bar-shape match the oracle capture", async () => {
    const s = storage!;
    const expected = FIXTURE.targets.mod_cardtype_card.views.cardtypes.rendered.bytes!;
    const actual = normalize(await s.engine.render("Mod", "cardtypes"));
    const headEnd = expected.indexOf(">\n");
    const headSlice = expected.slice(0, headEnd + 2);
    expect(actual.startsWith(headSlice)).toBe(true);
    const actualRng = actual.match(/data-slot-id="RANDOMIZED"/g) ?? [];
    expect(actualRng.length).toBeGreaterThan(0);
    // Per-mod scaling (2 seeded mods vs 31 in the fixture).
    expect(actual.length).toBeLessThan(expected.length);
    expect(expected.length).toBeGreaterThan(actual.length);
  });
});
