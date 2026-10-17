// The card-mod-edit CORE EDIT-FORM PATH (write-path slice 3): the ported
// :edit / :edit_form / :edit_type_row / :edit_buttons / :content_formgroups /
// :content_formgroup / :conflict_tracker / :input views, rendered through the
// real RenderEngine, byte-compared against the captured signed-in edit-form
// oracle (fixtures/captured/edit-forms.json).
//
// Oracle provenance: the capture ran INSIDE the live decko-0.20.0 demo app
// (tools/oracle/decko-oracle-app) via the decko runner script
// tests/card/mod-loader/oracle-capture-edit-forms.rb, for two existing
// RichText cards ("Oracle Basics" id 605, the deck-level "Home" id 521)
// and three actors (Decko Bot = signed-in admin, Tova = signed-in
// non-admin, Anonymous). Raw HTTP captures of the same surfaces sit in
// CAPTURE_DIR/
// (oracle-basics-edit-form.html / home-edit-form.html + the modal-wrapped
// :edit bytes). The JSON fixture is the pinned oracle: pretty-printed,
// deeply sorted keys, byte-identical re-runs.
//
// Capture normalizations (applied to BOTH sides - the fixture carries the
// placeholders, this test applies the same masks to its own renders):
// - data-slot-id -> RANDOMIZED (SecureRandom.hex(10) by design, wrap.rb:45);
// - data-card-id -> RANDOMIZED (seed state, not form semantics);
// - the conflict tracker hidden field's value -> ACTION_ID (the card's
//   last action id at capture time - seed state; the raw captures hold
//   693 / 604). data-select2-id (the fixture's third normalization) does
//   not occur on this surface: the captured views render the type ROW, not
//   the select-tag formgroup.
//
// Conflict view provenance: the conflict UI was captured at VALIDATION
// level, not as HTTP bytes - a stale last_action_id_before_edit + update!
// triggers detect_conflict (card-mod-history set/all/history/events.rb:19),
// adds the :conflict error ("changes not based on latest revision") and
// aborts before persistence; the capture asserts the card_actions count is
// unchanged (fixture conflict_probe.no_write_proof). Rendering the conflict
// VIEW over HTTP would require a real stale POST with changed content -
// a write risk the capture contract forbids (capture only, no DB writes);
// the edit-form surface the conflict re-render rides on is pinned here.
//
// Byte contracts proven here:
// - signed-in (viewer with the update task allowed - the admin stand-in):
//   :edit renders the full modal (title, edit modal menu, help slot, form);
//   :edit_form renders the bare form slot; both match the bot AND tova
//   oracle bytes (bot = tova modulo the dynamic masks).
// - anonymous: :edit renders the quiet denial span
//   `<span class="denied"><!-- Sorry, you don't have permission (update) --></span>`
//   byte-for-byte (perms :update; the verdict comes from the REAL task
//   algebra - the seeded *all+*update rule grants [[Editor]] only, and the
//   anonymous viewer's parties lack it); :edit_form renders the FULL FORM
//   (the view carries no perms directive - read passes - matching the
//   captured anonymous edit_form bytes).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectViewWithoutMod } from "../../support/native-views.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import { handleEngineRequest } from "../../../deploy/bunny-worker-src/bunny-edge-engine-request.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/edit-forms.json", import.meta.url)),
    "utf8",
  ),
) as {
  targets: Record<
    string,
    {
      id: number;
      name: string;
      type: string;
      views: Record<string, { edit: string; edit_form: string }>;
    }
  >;
};

/** The slice-4 fixture (fixtures/captured/edit-name-type.json): 8 views per
 *  actor per target - the name-editor family (edit_name, name_form,
 *  name_formgroup, edit_name_row) and the type-shift family (edit_type,
 *  edit_type_form, type_formgroup, board_type_formgroup). */
const NAME_TYPE_FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/edit-name-type.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  targets: Record<
    string,
    {
      id: number;
      name: string;
      type: string;
      views: Record<string, Record<string, string>>;
    }
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The capture's normalizations (see the module doc): slot ids and card ids
 *  are random/seed-state by design; the conflict tracker's value is the
 *  captured card's action id (693/604); data-select2-id (the type select's
 *  "<unique_id>-<epoch>" marker, slice 4) normalizes to SELECT2. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"')
    .replace(/data-select2-id=(["'])([^"']*)-\d+\1/g, 'data-select2-id="SELECT2"')
    .replace(
      /(<input class="current_revision_id form-control" autocomplete="off" type="hidden" value=")[^"]*(")/,
      "$1ACTION_ID$2",
    );
}

/** The captured Home content (the oracle textarea bytes, unescaped): two
 *  nest-bearing div lines, each newline-terminated. */
const HOME_CONTENT =
  '<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n';

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
/** The anonymous-side engine: a SECOND RenderEngine over the same storage,
 *  holding its default ANONYMOUS viewer (the storage's main engine is
 *  switched to the signed-in admin stand-in viewer). */
let anonymousEngine: RenderEngine | undefined;
/** The bot stand-in engine (write-path slice 4): viewer actorId 1 = the
 *  decko_bot codename card -> Auth.always_ok? (read-rules.ts alwaysOk) -
 *  every task verdict passes without a rule walk, matching the captured
 *  admin actor's createable list (all 28 cardtype cards). */
let botEngine: RenderEngine | undefined;
/** The tova stand-in engine: a plain signed-in member (actorId 583, no
 *  role membership) - passes *all+*create ("Anyone Signed In"), fails the
 *  eight type-scoped Shark rules - the captured member createable list
 *  (20 of 28). */
let saraEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/type cards (the codename registry + set keys read these)
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 }); // the cardtypes' type card (type Cardtype - in the createable search)
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the update rule the task verdicts read: *all+*update -> [[Editor]]
  // (anonymous lacks the party; the signed-in stand-in viewer IS the party)
  await seedCard(s, { id: 30, leftId: 10, rightId: 12, dbContent: "[[Editor]]" });
  await seedReference(s, 30, 7, "editor");
  // Home's content nests {{:getting_started|core}} - the codename card the
  // prefetch closure resolves (its rendered bytes never appear: the edit
  // form shows raw content, un-nested).
  await seedCard(s, { id: 40, name: "Getting started", codename: "getting_started" });

  // the capture's cards - ids EXACTLY as captured (the bytes carry
  // data-card-id); currentRevisionId = the action id the raw captures
  // show in the conflict tracker (693 / 604; normalized to ACTION_ID).
  await seedCard(s, {
    id: 605,
    name: "Oracle Basics",
    typeId: 2,
    typeName: "RichText",
    dbContent: "A plain basic card for oracle capture.",
    currentRevisionId: 693,
  });
  await seedCard(s, {
    id: 521,
    name: "Home",
    typeId: 2,
    typeName: "RichText",
    dbContent: HOME_CONTENT,
    currentRevisionId: 604,
  });

  // The name-environment bridge (DeckoName's sync ":codename" marks read the
  // global env's registry - Home's content nests {{:getting_started|core}},
  // which the prefetch closure parses). Install THIS storage's registry and
  // prime the codehash memo so the sync peeks resolve deterministically.
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  // ---- write-path slice 4 seeds: the create-rule surface the type select's
  // createable list reads. Captured from the oracle deck (probe recorded in
  // an internal work log): *all+*create => "Anyone Signed In";
  // eight type-scoped rules => "Shark"; 28 cardtype-typed cards survive the
  // non_createable_types basket filter.
  // codename "decko_bot" (underscore) — the STORED spelling the permission
  // machinery matches (actor.ts:47 DECKOBOT_CODENAME; codename.rb:107-110
  // derives DeckoBotID from the stored codename; recode.yml:8 records the
  // qagn_bot -> decko_bot rename — it was never "deckobot"). The seed
  // predates the read-rules.ts constant fix and the bot stand-in silently
  // lost always_ok, rendering 26 createable types against the captured 28.
  await seedCard(s, { id: 1, name: "Decko Bot 1", codename: "decko_bot" });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 15, name: "*create", codename: "create", typeId: 14 });
  await seedCard(s, { id: 16, name: "*anyone", codename: "anyone", typeId: 14 });
  await seedCard(s, {
    id: 17,
    name: "*anyone signed in",
    codename: "anyone_signed_in",
    typeId: 14,
  });
  await seedCard(s, { id: 25, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 50, name: "Shark" });
  // the 26 non-RichText/Cardtype bot-createable cardtype cards (ids 51..76)
  const TYPE_CARDS = [
    "PlainText", "Markdown", "Phrase", "HTML", "Number", "Toggle", "Date",
    "URI", "File", "Image", "List", "Pointer", "Search", "Link list",
    "Nest list", "Notification template", "Email template", "User", "Role",
    "Layout", "Skin", "CSS", "SCSS", "JSON", "JavaScript", "CoffeeScript",
  ] as const;
  const typeIdByName = new Map<string, number>(
    TYPE_CARDS.map((name, i) => [name, 51 + i]),
  );
  for (const name of TYPE_CARDS) {
    await seedCard(s, { id: typeIdByName.get(name)!, name, typeId: 9 });
  }
  // *all+*create -> "Anyone Signed In" (party reference to card 17) - the
  // deck-default create rule the member verdicts ride
  await seedCard(s, {
    id: 80,
    leftId: 10,
    rightId: 15,
    dbContent: "Anyone Signed In",
  });
  await seedReference(s, 80, 17, "anyone_signed_in");
  // the deck's *all+*update ALSO grants Anyone Signed In (the captured tova
  // renders the full name/type forms - the member passes update); the
  // existing reference row carries the Editor party, this one the
  // signed-in party (the anonymous denial still holds: its parties lack
  // Anyone Signed In)
  await seedReference(s, 30, 17, "anyone_signed_in");
  // the eight type-scoped Shark rules (HTML Cardtype JavaScript CoffeeScript
  // CSS SCSS Skin Layout): "<Type>+*type" set card (type Set, id 13) then
  // the rule row hanging off *create, each granting [[Shark]] (card 50)
  const SHARK_TYPES = [
    "HTML", "Cardtype", "JavaScript", "CoffeeScript", "CSS", "SCSS",
    "Skin", "Layout",
  ] as const;
  for (const [i, typeName] of SHARK_TYPES.entries()) {
    const typeCardId = typeName === "Cardtype" ? 9 : typeIdByName.get(typeName)!;
    const setCardId = 200 + i; // above every card id seeded above
    await seedCard(s, {
      id: setCardId,
      leftId: typeCardId,
      rightId: 8,
      typeId: 13, // Set-typed: the who_can join reads sets.type_id
    });
    await seedCard(s, {
      id: 210 + i,
      leftId: setCardId,
      rightId: 15,
      dbContent: "Shark",
    });
    await seedReference(s, 210 + i, 50, "shark");
  }
}, 60_000);

afterAll(() => {
  loader?.reset(); // unregister the mod views from the live record
  storage?.close();
});

describe("card-mod-edit CORE EDIT-FORM PATH (write-path slice 3)", () => {
  it("WITHOUT the mod: :edit / :edit_form are unsupported views", async () => {
    const s = storage!;
    s.engine.viewer = { signedIn: true, actorId: 7 }; // the Editor party
    await expectViewWithoutMod(s.engine.render("Oracle Basics", "edit"), "edit");
    await expectViewWithoutMod(s.engine.render("Oracle Basics", "edit_form"), "edit_form");
  });

  it("WITH the mod: signed-in :edit_form matches the oracle bytes (both cards)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModEdit }, { manifest: cardModHelp }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const basics = normalize(await s.engine.render("Oracle Basics", "edit_form"));
    expect(basics).toBe(FIXTURE.targets.basic_note.views.bot.edit_form);
    expect(basics).toBe(FIXTURE.targets.basic_note.views.tova.edit_form);
    const home = normalize(await s.engine.render("Home", "edit_form"));
    expect(home).toBe(FIXTURE.targets.deck_level.views.bot.edit_form);
    expect(home).toBe(FIXTURE.targets.deck_level.views.tova.edit_form);
  });

  it("WITH the mod: signed-in :edit matches the oracle modal bytes (both cards)", async () => {
    const s = storage!;
    const basics = normalize(await s.engine.render("Oracle Basics", "edit"));
    expect(basics).toBe(FIXTURE.targets.basic_note.views.bot.edit);
    expect(basics).toBe(FIXTURE.targets.basic_note.views.tova.edit);
    const home = normalize(await s.engine.render("Home", "edit"));
    expect(home).toBe(FIXTURE.targets.deck_level.views.bot.edit);
    expect(home).toBe(FIXTURE.targets.deck_level.views.tova.edit);
  });

  it("the board type row renders its live select only when type_form is explicitly shown", async () => {
    const engine = storage!.engine;
    const row = await engine.render("Oracle Basics", "edit_type_row");
    expect(row).not.toContain('<select');
    const opened = await engine.render("Oracle Basics", "edit_type_row", {viewOpts:{show:['type_form']}});
    expect(opened).toContain('name="card[type]"');
    expect(opened).toContain('_live-type-field');
    const next = await engine.render("Oracle Basics", "edit_type_row");
    expect(next).not.toContain('<select');
  });

  it("anonymous :edit is the quiet denial span, byte-for-byte (real task verdicts)", async () => {
    const s = storage!;
    anonymousEngine = new RenderEngine(new FetchEngine(s.counting));
    await loader!.installInto(modEngineHost(anonymousEngine, s.fetcher));
    // No normalization: the denial span carries no dynamic bytes.
    const html = await anonymousEngine.render("Oracle Basics", "edit");
    expect(html).toBe(FIXTURE.targets.basic_note.views.anonymous.edit);
    expect(html).toBe(FIXTURE.targets.deck_level.views.anonymous.edit);
  });

  it("an assigned type previews the editor without changing stored or subsequent render state", async () => {
    const s = storage!;
    const before = normalize(await s.engine.render("Oracle Basics", "edit_form"));
    const preview = await s.engine.render("Oracle Basics", "edit_form", {
      assignedType: "Phrase", viewOpts: { show: ["type_form"] },
    });
    expect(preview).toContain('data-card-type-id="53"');
    expect(preview).toMatch(/<option selected="selected" value="Phrase">/);
    expect(preview).toContain('value="PlainText"');
    expect(preview).toContain('value="RichText"');
    expect((await s.fetcher.fetchByName("Oracle Basics"))?.typeId).toBe(2);
    expect(normalize(await s.engine.render("Oracle Basics", "edit_form"))).toBe(before);
  });

  it("a missing assigned type fails without poisoning the next editor", async () => {
    const s = storage!;
    await expect(s.engine.render("Oracle Basics", "edit_form", { assignedType: "Absent type" })).rejects.toThrow("card type not found");
    expect(normalize(await s.engine.render("Oracle Basics", "edit_form"))).toBe(FIXTURE.targets.basic_note.views.bot.edit_form);
  });

  it("the board XHR carries assign and slot show into the replacement editor", async () => {
    const s = storage!;
    const request = new Request("https://example.test/Oracle_Basics/edit_form?assign=true&card%5Btype%5D=Phrase&slot%5Bshow%5D%5B%5D=type_form", {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const response = await handleEngineRequest(request, { fetcher: s.fetcher, render: s.engine });
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/<option selected="selected" value="Phrase">/);
    expect((await s.fetcher.fetchByName("Oracle Basics"))?.typeId).toBe(2);
  });

  it("anonymous :edit_form renders the full form (read passes; no update check)", async () => {
    const s = storage!;
    const basics = normalize(await anonymousEngine!.render("Oracle Basics", "edit_form"));
    expect(basics).toBe(FIXTURE.targets.basic_note.views.anonymous.edit_form);
    const home = normalize(await anonymousEngine!.render("Home", "edit_form"));
    expect(home).toBe(FIXTURE.targets.deck_level.views.anonymous.edit_form);
  });

  it("the pinned conflict probe: validation-level capture with no-write proof", () => {
    // The oracle's conflict state: a stale last_action_id_before_edit +
    // update! adds the :conflict error and aborts (no act persisted); the
    // capture asserted the card_actions count before == after. The TS-side
    // surface this pins is the conflict tracker hidden field (rendered in
    // every :edit_form above, value normalized to ACTION_ID); the HTTP
    // conflict re-render is the save path's surface (a stale POST with
    // changed content would write - outside this suite's capture contract).
    expect(FIXTURE.targets).toBeDefined();
    const fixture = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../fixtures/captured/edit-forms.json", import.meta.url)),
        "utf8",
      ),
    ) as { conflict_probe: { no_write_proof: boolean; errors_conflict: string[]; stale_action_id_known: boolean } };
    expect(fixture.conflict_probe.no_write_proof).toBe(true);
    expect(fixture.conflict_probe.stale_action_id_known).toBe(true);
    expect(fixture.conflict_probe.errors_conflict).toEqual([
      "changes not based on latest revision",
    ]);
  });
});

describe("card-mod-edit NAME + TYPE editors (write-path slice 4)", () => {
  // The captured view set per actor per target (the name-editor family and
  // the type-shift family; oracle: fixtures/captured/edit-name-type.json,
  // captured in-process by tests/card/mod-loader/oracle-capture-edit-
  // name-type.rb for the SAME two targets and three actors as slice 3).
  const NAME_TYPE_VIEWS = [
    "edit_name",
    "name_form",
    "name_formgroup",
    "edit_name_row",
    "edit_type",
    "edit_type_form",
    "type_formgroup",
    "board_type_formgroup",
  ] as const;

  it("the pinned capture is render-only: card_actions count unchanged (no-write proof)", () => {
    expect(NAME_TYPE_FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(NAME_TYPE_FIXTURE.no_write_proof.actions_before).toBe(
      NAME_TYPE_FIXTURE.no_write_proof.actions_after,
    );
  });

  it("bot stand-in (always_ok): all 8 views match the oracle bytes (both cards)", async () => {
    const s = storage!;
    botEngine = new RenderEngine(new FetchEngine(s.counting));
    botEngine.viewer = { signedIn: true, actorId: 1 }; // the decko_bot codename card
    await loader!.installInto(modEngineHost(botEngine, s.fetcher));
    for (const [targetKey, target] of Object.entries(NAME_TYPE_FIXTURE.targets)) {
      for (const view of NAME_TYPE_VIEWS) {
        const html = normalize(await botEngine.render(target.name, view));
        expect(html).toBe(NAME_TYPE_FIXTURE.targets[targetKey].views.bot[view]);
      }
    }
  });

  it("tova stand-in (plain member): the type views carry the member createable list", async () => {
    const s = storage!;
    saraEngine = new RenderEngine(new FetchEngine(s.counting));
    saraEngine.viewer = { signedIn: true, actorId: 583 }; // no role membership
    await loader!.installInto(modEngineHost(saraEngine, s.fetcher));
    for (const [targetKey, target] of Object.entries(NAME_TYPE_FIXTURE.targets)) {
      for (const view of NAME_TYPE_VIEWS) {
        const html = normalize(await saraEngine.render(target.name, view));
        expect(html).toBe(NAME_TYPE_FIXTURE.targets[targetKey].views.tova[view]);
      }
    }
  });

  it("anonymous: the perms views render the quiet denial span, the perms-free views the full bytes", async () => {
    const s = storage!;
    for (const [targetKey, target] of Object.entries(NAME_TYPE_FIXTURE.targets)) {
      for (const view of ["edit_name", "name_form", "edit_type", "edit_type_form"] as const) {
        // No normalization: the denial span carries no dynamic bytes.
        const html = await anonymousEngine!.render(target.name, view);
        expect(html).toBe(NAME_TYPE_FIXTURE.targets[targetKey].views.anonymous[view]);
      }
      for (const view of ["name_formgroup", "edit_name_row", "type_formgroup", "board_type_formgroup"] as const) {
        const html = normalize(await anonymousEngine!.render(target.name, view));
        expect(html).toBe(NAME_TYPE_FIXTURE.targets[targetKey].views.anonymous[view]);
      }
    }
  });
});
