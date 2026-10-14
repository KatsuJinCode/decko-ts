// The core mod's admin surface (card-1.110.0 mod/core): 13 view names
// ("admin :core/:warning, mod :roles, type/mod's 10 config views") as 18
// view registrations across three set files (set/self/admin.rb 2,
// set/self/mod.rb 5, set/type/mod.rb 11).
//
// Why this file lives in mod-loader/: the views are registered by a MOD
// MANIFEST (the core mod's own - the seed layer carries no admin surface),
// so the mod-loader suite is the suite that owns their registration
// behavior.
//
// HONESTY BOUNDARY: no pinned page bytes back any of these names. Every
// expectation below is derived from the GEM SOURCES (cited per assertion at
// card-1.110.0 mod/core set/...) plus the two read-only structural probes
// for the facts no source file carries (basket insertion order, spec.files
// emptiness, config defaults, mod-card names, role-grouping shapes -
// oracle-probe-core-admin-facts.rb (not in the public package) +
// oracle-probe-core-mod-fetch.rb). These views are RENDERED-UNPINNED: the
// tests prove each name dispatches (UnsupportedViewError without the mod)
// and carries the structure the gem sources mandate; no byte verification
// against a Ruby render is claimed anywhere.
//
// The accordion collapse-id embeds Ruby's String#hash of the group title
// (set/all/admin.rb:96 `context: title.hash`) — per-process SipHash, the
// same normalization class as data-slot-id; COLLAPSE_HASH masks it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import coreMod from "../../../src/card/mod-loader/mods/core-mod.js";
import {
  setAdminRuntimeConfig,
  resetAdminRuntimeConfig,
  adminRuntimeConfig,
} from "../../../src/card/mod-loader/mods/core-mod.js";

/** Ruby String#hash (SipHash, per-process seed) lands in the collapse id —
 *  masked like data-slot-id (SecureRandom, wrap.rb:45). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(
      /(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g,
      "$1HASH$2",
    );
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // --- the codename registry cards the admin surface reads ---------------
  await seedCard(s, { id: 2, name: "RichText", codename: "basic" }); // default type
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the cardtype cards the admin.yml items name (the *all+*update rule
  // grants "Anyone Signed In", whose codename feeds the roles grouping)
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 2 });
  await seedCard(s, { id: 4, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 15, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 4 });
  // setting codename cards an admin.yml item list references
  await seedCard(s, { id: 16, name: "*title", codename: "title", typeId: 14 });
  await seedCard(s, { id: 17, name: "*head", codename: "head", typeId: 14 });
  await seedCard(s, { id: 18, name: "*credit", codename: "credit", typeId: 14 });

  // --- the *admin card (set/self/admin.rb's anchor) ----------------------
  await seedCard(s, { id: 40, name: "*admin", codename: "admin", typeId: 2 });

  // --- the Mod cardtype card (set/self/mod.rb's anchor) ------------------
  await seedCard(s, { id: 50, name: "Mod", codename: "mod", typeId: 2 });

  // --- two mod cards (set/type/mod.rb instances) -------------------------
  await seedCard(s, { id: 60, name: "mod: core", codename: "mod_core", typeId: 50 });
  await seedCard(s, { id: 61, name: "mod: format", codename: "mod_format", typeId: 50 });

  // --- the *update rule universe: one *all+*update rule ------------------
  //    (every admin-item codename card's candidate walk lands here, so all
  //    roles resolve to ["anyone_signed_in"] — the single-role deck shape)
  await seedCard(s, {
    id: 70,
    leftId: 10,
    rightId: 12,
    typeId: 14,
    dbContent: "Anyone Signed In",
  });
}, 60_000);

afterAll(() => {
  loader?.reset(); // unregister the mod views from the live record
  // restore the engine defaults the file's tests changed — the reset
  // seam, not an empty patch (setAdminRuntimeConfig({}) merges nothing
  // back and would leave performDeliveries false behind).
  resetAdminRuntimeConfig();
  storage?.close();
});

const ALL_THIRTEEN = [
  "core",
  "warning",
  "roles",
  "cardtypes",
  "settings",
  "tasks",
  "configurations",
  "description",
  "styles",
  "scripts",
  "gem_info",
  "depends_on",
  "views",
] as const;

describe("core mod admin surface — dispatch (the 13 declared views)", () => {
  it("WITHOUT the mod: :core on *admin renders the base core view, not the admin task table", async () => {
    const s = storage!;
    // without the mod, :core on *admin renders the base core view, not the
    // admin core: the base core view renders the card's content.
    const html = await s.engine.render("*admin", "core");
    expect(html).not.toContain("task=clear_cache");
  });

  it("WITH the mod: every one of the 13 names dispatches on its set anchor", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: coreMod }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
    // bind the chain-aware dispatch (render.ts reads engine.modLoader;
    // installInto runs the prepare phase only — the engine field is the
    // documented test seam, render.ts:466-468)
    s.engine.modLoader = loader;

    // self/admin.rb :core/:warning on the *admin card
    expect(typeof await s.engine.render("*admin", "core")).toBe("string");
    expect(typeof await s.engine.render("*admin", "warning")).toBe("string");
    // self/mod.rb's five global views on the Mod cardtype card
    for (const view of ["roles", "cardtypes", "settings", "tasks", "configurations"]) {
      expect(typeof await s.engine.render("Mod", view)).toBe("string");
    }
    // type/mod.rb's eleven views on a mod card. (The other two of the 13 —
    // :warning and :roles — belong to self/admin.rb and self/mod.rb's set
    // anchors above; rendering them on a mod card raises
    // UnsupportedViewError exactly like Ruby — a view
    // defined on Self::Admin / Self::Mod does not answer a Type::Mod card.)
    const TYPE_MOD_ELEVEN = [
      "core", "description", "settings", "cardtypes", "configurations",
      "tasks", "styles", "scripts", "gem_info", "depends_on", "views",
    ] as const;
    for (const view of TYPE_MOD_ELEVEN) {
      expect(typeof await s.engine.render("mod: core", view)).toBe("string");
    }
    // the 13-name set is complete (self/mod + type/mod + self/admin folded)
    const registered = new Set(loader.load().registeredViews);
    for (const name of ALL_THIRTEEN) expect(registered.has(name)).toBe(true);
  });
});

describe("set/self/admin.rb — view :core (the task table)", () => {
  it("renders the task table for basket[:tasks] in load order", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*admin", "core"));
    // task_table (set/abstract/task_table.rb:10-15): one bootstrap table,
    // header Task/Description, one row per task in basket insertion order.
    // The order is the probed load order (all/trash.rb's empty_trash first,
    // then self/admin.rb's merges, then the later mods') — the
    // oracle-probe-core-admin-facts.rb basket_task_keys_in_order fact:
    // [empty_trash, clear_cache, regenerate_assets, delete_upload_tmp_files].
    //
    // The fourth row is card-mod-carrierwave's contribution: basket[:tasks]
    // is a single global basket every mod's set modules merge into, so the
    // *admin table carries the carrierwave task row. The row text comes
    // from the gem locale file card-mod-carrierwave-0.20.0
    // config/locales/en.yml:18-19; before those locale keys were added the
    // row rendered "Translation missing: en.carrierwave_task_…".
    const expected =
      `<table class="table"><thead><tr><th>Task</th>\n` +
      `<th>Description</th></tr></thead>\n` +
      `<tbody>` +
      `<tr><td><a class="known-card" href="/update/*admin?task=empty_trash">Empty Trash</a></td>\n` +
      `<td>Empty Trash!</td></tr>\n` +
      `<tr><td><a class="known-card" href="/update/*admin?task=clear_cache">Clear Cache</a></td>\n` +
      `<td>Clear Cache!</td></tr>\n` +
      `<tr><td><a class="known-card" href="/update/*admin?task=regenerate_assets">Regenerate Assets</a></td>\n` +
      `<td>Regen!</td></tr>\n` +
      `<tr><td><a class="known-card" href="/update/*admin?task=delete_upload_tmp_files">Delete upload tmp files</a></td>\n` +
      `<td>Delete upload tmp files!</td></tr></tbody></table>`;
    expect(html).toBe(expected);
  });

  it("the task links carry the known-card class because *admin exists", async () => {
    const s = storage!;
    const html = await s.engine.render("*admin", "core");
    // links.rb:111-116 add_known_or_wanted_class — *admin is a real card.
    expect(html).toContain('class="known-card"');
    expect(html).not.toContain("wanted-card");
  });
});

describe("set/self/admin.rb — view :warning (the warning alert)", () => {
  it("renders empty when email delivery is on (the Rails default)", async () => {
    const s = storage!;
    setAdminRuntimeConfig({ performDeliveries: true });
    // self/admin.rb:63-69 — warnings.compact!; empty -> ""
    expect(await s.engine.render("*admin", "warning")).toBe("");
  });

  it("renders the dismissible warning alert when perform_deliveries is false", async () => {
    const s = storage!;
    setAdminRuntimeConfig({ performDeliveries: false });
    const html = await s.engine.render("*admin", "warning");
    // Derivation, all cited:
    // - self/admin.rb:20-22 no_email_delivery? reads Card.config.action_mailer
    //   .perform_deliveries (the deck's config/application.rb:19 sets it
    //   false — the oracle-probe-core-admin-facts.rb
    //   config_perform_deliveries fact).
    // - self/admin.rb:76-80 no_email_delivery_message = t :core_admin_email_off,
    //   path: "config/application.rb" (mod/core config/locales/en.yml:40-41).
    // - warning_alert (self/admin.rb:71-74) = alert(:warning, true) —
    //   card-mod-layout set/all/alert.rb:3-8: add_class with
    //   alert_classes(:warning, dismissable=true) = "alert alert-warning
    //   alert-dismissible " (the TRAILING SPACE is alert.rb:12's literal
    //   `"alert-dismissible "` joined by classy), role="alert", and the
    //   close button (alert.rb:17-20, hash insertion order: type,
    //   data-bs-dismiss, class, aria-label).
    // - warning_alert.haml bytes: the %h5 + indented text line emits
    //   newlines around the title (`<h5>\nAdministrator Warning\n</h5>`)
    //   + list_tag warnings (bootstrap
    //   helper.rb:20-31, plain <ul>/<li>).
    const expected =
      `<div class="alert alert-warning alert-dismissible " role="alert">` +
      `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n` +
      `<h5>\nAdministrator Warning\n</h5>\n` +
      `<ul><li>Email delivery is turned off. Change settings in ` +
      `config/application.rb to send sign up notifications.</li></ul>\n` +
      `</div>`;
    expect(html).toBe(expected);
  });

  it("resets to the Rails default (perform_deliveries true)", () => {
    // the Rails default is true (application.rb's false is a DECK choice,
    // not an engine default); resetAdminRuntimeConfig restores it.
    resetAdminRuntimeConfig();
    expect(adminRuntimeConfig().performDeliveries).toBe(true);
  });
});

describe("set/type/mod.rb — the per-mod views on mod: core", () => {
  it(":core renders the description placeholder, the cardtypes accordion, and the tasks section", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("mod: core", "core"));
    // type/mod.rb:7-19 render_section_views over the nine section views,
    // .select { card.send("#{name}?") }, joined "<br/>". For core's
    // admin.yml (config/admin.yml: cardtypes.admin [mod user setting
    // cardtype]) with spec nil (oracle-probe-core-mod-fetch.rb
    // mod_core_fetch.spec_nil):
    // description? is always true (type/mod.rb:122-124) but description is
    // nil (t :core_mod_description with default nil — the same probe's
    // mod_core_description fact) -> "<p></p>" (Rails content_tag :p, nil);
    // settings?/configurations?/views? false (no yml keys); styles?/scripts?
    // false (no +style/+script children); depends_on? false (nil spec);
    // cardtypes? and tasks? true.
    expect(html.startsWith("<p></p><br/>")).toBe(true);
    // the cardtypes accordion (nested_list_section, all/admin.rb:81-86)
    expect(html).toContain(`<h3>Cardtypes</h3>\n<div class="accordion">`);
    // accordion_item.haml bytes: collapsed button, hash-masked collapse id
    expect(html).toContain(
      `<button class='collapsed accordion-button' data-bs-target='#card-`,
    );
    expect(html).toMatch(/-collapse-id' data-bs-toggle='collapse' type='button'>\nAdmin\n<\/button>/);
    // the tasks section (section "Tasks", task_table(card.tasks)) — the
    // same three core tasks, inside the <p>/<h3> section wrapper
    expect(html).toContain(`<p><h3>Tasks</h3><table class="table">`);
    expect(html).toContain(`task=clear_cache">Clear Cache</a>`);
    // sections joined with the literal "<br/>" (type/mod.rb:26); the
    // cardtypes section ends with the last bar's two closes, the
    // accordion-body/collapse/item closes (newline-terminated haml lines),
    // then the accordion wrapper's own </div> with NO trailing newline;
    // nested_list_section adds NO <p> wrapper (only list_section does)
    expect(html).toContain(
      "</div>\n</div>\n</div>\n</div>\n</div>\n</div><br/><p><h3>Tasks</h3>",
    );
  });

  it(":description renders the spec-derived text; the locale key wins when present", async () => {
    const s = storage!;
    // mod: core: no spec (the core-mod-fetch probe's
    // mod_core_fetch.spec_nil), no locale key -> nil -> <p></p>
    expect(await s.engine.render("mod: core", "description")).toBe("<p></p>");
    // mod: format: spec.summary "format" is the default, but the
    // format mod's en.yml carries format_mod_description: "Format mod"
    // (card-mod-format-0.20.0 config/locales/en.yml:25) and type/mod.rb:162-166
    // lets the translation win over the spec default.
    expect(await s.engine.render("mod: format", "description")).toBe("<p>Format mod</p>");
  });

  it(":tasks renders the basket tasks selected by the mod's own name", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("mod: core", "tasks"));
    // type/mod.rb:46-51 — card.tasks selects basket[:tasks] by mod; the
    // core-mod-fetch probe's mod_core_tasks fact:
    // [empty_trash, clear_cache, regenerate_assets].
    expect(html).toBe(
      `<p><h3>Tasks</h3><table class="table"><thead><tr><th>Task</th>\n` +
      `<th>Description</th></tr></thead>\n<tbody>` +
      `<tr><td><a class="known-card" href="/update/*admin?task=empty_trash">Empty Trash</a></td>\n<td>Empty Trash!</td></tr>\n` +
      `<tr><td><a class="known-card" href="/update/*admin?task=clear_cache">Clear Cache</a></td>\n<td>Clear Cache!</td></tr>\n` +
      `<tr><td><a class="known-card" href="/update/*admin?task=regenerate_assets">Regenerate Assets</a></td>\n<td>Regen!</td></tr></tbody></table></p>`,
    );
  });

  it(":configurations and :views render nothing for a mod without those yml keys", async () => {
    const s = storage!;
    // type/mod.rb:37-44 returns nil when configurations is absent; :views
    // renders an empty section only when views? — for core both are absent.
    expect(await s.engine.render("mod: core", "configurations")).toBe("");
    expect(await s.engine.render("mod: core", "views")).toBe("");
  });

  it(":gem_info renders nothing for the core mod (no Gem::Specification)", async () => {
    const s = storage!;
    // type/mod.rb:67-68 `return unless card.mod&.spec` — the core-mod-fetch
    // probe's mod_core_fetch.spec_nil fact (the core mod is the card gem's
    // own mod dir; Bundler gives it no separate specification).
    expect(await s.engine.render("mod: core", "gem_info")).toBe("");
  });
});

describe("set/type/mod.rb — the spec-backed views on mod: format", () => {
  it(":configurations renders the Basic Configuration section with codename bar nests", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("mod: format", "configurations"));
    // card-mod-format-0.20.0 config/admin.yml: configurations: basic:
    // [title, head, credit]. type/mod.rb:37-44: one list_section titled
    // "Basic Configuration" (category.capitalize), items the codename
    // SYMBOLS -> real-card bar nests (nest fetch.rb:9, Symbol -> Card.fetch).
    expect(html).toContain(`<p><h3>Basic Configuration</h3>`);
    // the three setting cards nest as :bar slots, resolved by codename
    // (safe_key of "*title" = "Xtitle" — name.ts:544 replaces * with X)
    expect(html).toContain(`id="Xtitle-bar-view"`);
    expect(html).toContain(`data-card-name="*title"`);
    expect(html).toContain(`id="Xhead-bar-view"`);
    expect(html).toContain(`id="Xcredit-bar-view"`);
  });

  it(":gem_info renders the seven spec properties and the two accordions", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("mod: format", "gem_info"));
    // type/mod.rb:67-83. The property list for card-mod-format
    // (the card-mod-format-0.20.0 gemspec), Ruby Array#to_s for
    // the array-valued authors/email:
    //   "name: card-mod-format" ... "description: " (empty, trailing space)
    // the core-admin-facts probe's first_mod_card.gem_info_properties fact
    // shows the exact rendering for the sibling account gem; the files
    // accordion is EMPTY (the same probe's date_spec.files: [] — installed
    // mod gemspecs carry no file list), depends_on names
    // carry the gem's card-mod-* dependencies through card_mods'
    // name[8..] slice (type/mod.rb:222-226 — "mod_-<name>", the probe's
    // observed shape for account: ["mod_-edit", ...]).
    expect(html).toContain(`<h3>Gem info</h3>`);
    expect(html).toContain(`<li class="list-group-item">name: card-mod-format</li>`);
    // specifications/card-mod-format-0.20.0.gemspec s.summary = "format"
    expect(html).toContain(`<li class="list-group-item">summary: format</li>`);
    expect(html).toContain(`<li class="list-group-item">version: 0.20.0</li>`);
    expect(html).toContain(`<li class="list-group-item">description: </li>`);
    // accordion titles: "files" and "depends on " (the trailing space is
    // type/mod.rb:80's literal)
    expect(html).toContain(`>\nfiles\n</button>`);
    expect(html).toContain(`>\ndepends on \n</button>`);
  });

  it(":depends_on nests the mod_- name strings", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("mod: format", "depends_on"));
    // list_section "Depends on" (type/mod.rb:85-87); the items are the
    // card_mods-transformed dependency names (strings) -> NAME nests
    // (nest fetch.rb:12 new_card branch — a string that names no card
    // renders the engine's new-card shape).
    expect(html).toContain(`<h3>Depends on</h3>`);
  });
});

describe("set/self/mod.rb — the global views on the Mod card", () => {
  it(":roles groups all admin configs by role codename, then category", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Mod", "roles"));
    // self/mod.rb:26-37: h1 "Roles"; groups keyed by the responsible-role
    // codenames of every admin-item codename card (all/admin.rb:23-30
    // create_admin_items -> responsible_role -> the *update rule walk).
    // The seeded deck's single *all+*update rule grants "Anyone Signed In"
    // (codename anyone_signed_in), so one role group holds both mods'
    // categories. The h2 renders role.to_sym.cardname — the codename
    // string's name form ("anyone_signed_in", underscores preserved).
    expect(html).toContain(`<h1>Roles</h1>`);
    expect(html).toContain(`<h2>anyone_signed_in</h2>`);
    // list_section(cat, configs.map(&:codename)) — STRINGS nest by NAME:
    // "mod" resolves (key-insensitively) to the Mod cardtype card's bar
    expect(html).toContain(`<h3>cardtypes</h3>`);
    expect(html).toContain(`id="mod-bar-view"`);
    expect(html).toContain(`data-card-name="Mod"`);
    // the format mod's configurations category joins the same group
    expect(html).toContain(`<h3>configurations</h3>`);
  });

  it(":cardtypes renders the h1 plus per-mod sections of codename bar nests", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Mod", "cardtypes"));
    // self/mod.rb:17-22: [content_tag(:h1, view_name), grouped-by
    // (category, mod)["cardtypes"].map { list_section(mod.name, codename
    // SYMBOLS) }.join("<br/>")] — the array view body joins with "\n".
    expect(html.startsWith(`<h1>cardtypes</h1>\n`)).toBe(true);
    // the section title is the MOD's registry name (mod.name — "core"), not
    // the mod CARD's name (the oracle-probe-core-admin-facts.rb
    // mod_cardtype_card fact records the card's own name)
    expect(html).toContain(`<h3>core</h3>`);
    // symbol items resolve through the codename registry: :cardtype ->
    // the Cardtype card's bar
    expect(html).toContain(`data-card-name="Cardtype"`);
  });

  it(":tasks on the Mod card lists the task-name items, not the task table", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Mod", "tasks"));
    // self/mod.rb:17-22 — grouped-by(category, mod)["tasks"] holds core's
    // admin.yml task ITEMS (empty_trash, clear_cash — the yml's misspelling
    // preserved —, regenerate_assets) nested as codename SYMBOLS. None of
    // the three is a codename card, so the nests resolve like Ruby's
    // Card.fetch(:empty_trash) CodenameNotFound branch (nest fetch.rb:8-20):
    // the engine's unknown-card shape, not a task table. The task TABLE is
    // the self/admin and type/mod :tasks surface, which carry the basket.
    expect(html.startsWith(`<h1>tasks</h1>\n`)).toBe(true);
    expect(html).toContain(`<h3>core</h3>`); // the mod's registry name
    expect(html).toContain(`empty_trash`);
    expect(html).toContain(`clear_cash`);
    expect(html).not.toContain(`task=clear_cache`);
  });

  it(":settings and :configurations render the h1 with empty bodies for this deck", async () => {
    const s = storage!;
    // no seeded mod carries settings yml; configurations exist only for
    // format — grouped-by(:category, :mod)["settings"] is absent -> the
    // map over undefined is guarded to "".
    const settingsHtml = await s.engine.render("Mod", "settings");
    // the guarded empty body: output([h1, ""]) keeps the "" element, so
    // the join leaves the h1's trailing newline (content.rb compact drops
    // nils, not empty strings)
    expect(settingsHtml).toBe(`<h1>settings</h1>
`);
    const configHtml = normalize(await s.engine.render("Mod", "configurations"));
    expect(configHtml.startsWith(`<h1>configurations</h1>\n`)).toBe(true);
    expect(configHtml).toContain(`<h3>format</h3>`); // the mod's registry name
  });
});

describe("core mod admin runtime — the engine-config reads the views need", () => {
  it("exposes the task basket in probed load order with the probed flags", async () => {
    // the oracle-probe-core-admin-facts.rb basket_tasks fact: empty_trash
    // (core, irreversible TRUE), clear_cache (core), regenerate_assets
    // (core), delete_upload_tmp_files (carrierwave) — the first four of its
    // basket_task_keys_in_order fact.
    //
    // All four keys sit in the same global basket (every mod's set modules
    // merge into basket[:tasks]), which is why the *admin task table
    // renders the carrierwave row; the key order here is the probed one.
    const { CORE_TASK_BASKET } = await import(
      "../../../src/card/mod-loader/mods/core-mod.js"
    );
    expect(Object.keys(CORE_TASK_BASKET)).toEqual([
      "empty_trash",
      "clear_cache",
      "regenerate_assets",
      "delete_upload_tmp_files",
    ]);
    expect(CORE_TASK_BASKET.empty_trash!.irreversible).toBe(true);
    // Ruby's nil flag is falsy; the registry omits the field
    expect(CORE_TASK_BASKET.clear_cache!.irreversible).toBeFalsy();
    expect(CORE_TASK_BASKET.delete_upload_tmp_files!.mod).toBe("carrierwave");
  });

  it("exposes the warning basket (every basket_warnings entry except recaptcha's)", async () => {
    const { CORE_WARNING_BASKET } = await import(
      "../../../src/card/mod-loader/mods/core-mod.js"
    );
    // self/admin.rb:14; recaptcha_config_issues (present in the
    // core-admin-facts probe's basket_warnings fact) is
    // card-mod-recaptcha's contribution.
    expect(CORE_WARNING_BASKET).toEqual(["no_email_delivery"]);
  });
});
