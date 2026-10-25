// The :edit_inline view at the addresses the enumeration audit's gap 9
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:edit_inline`,
// gaps.json "the :edit_inline view"):
//
//   /Home/edit_inline
//   /Oracle_Basics/edit_inline
//
// The capture bytes are the spec:
//   - fixtures/captured/edit-views.json records the view at BOTH addresses
//     under three actor keys. card-mod-edit-views.test.ts byte-pins the
//     signed-in legs (bot and tova) at both targets and the anonymous leg
//     at "Oracle Basics". What no suite holds is the captured leg at the
//     SECOND address for the signed-out visitor: deck_level x anonymous,
//     the 78-byte update-denial span. This file pins it byte-for-byte and
//     records the capture's own equality between the two addresses'
//     anonymous stubs, so the pinned basic leg and this leg together
//     complete the captured 2-target x 3-actor matrix.
//   - The denial is produced through the engine's real verdict algebra the
//     edit-views suite documents: *all+*update grants the Editor role and
//     the Anyone Signed In party (the reference rows), so a signed-out
//     visitor's update verdict denies and the view emits the denial span
//     instead of the editor form.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDIT_VIEWS_FIXTURE = path.join(HERE, "..", "..", "..", "fixtures", "captured", "edit-views.json");

const FIXTURE_PRESENT = existsSync(EDIT_VIEWS_FIXTURE);

const editViews = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(EDIT_VIEWS_FIXTURE, "utf8")) as {
      targets: Record<string, { views: Record<string, Record<string, string>> }>;
    })
  : undefined;

/** The capture's normalizations (the edit-views suite's, trimmed to the
 *  masks the edit_inline bytes carry). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"');
}

/** The captured anonymous denial stub - identical at both addresses (the
 *  capture's own equality is asserted so this file cannot silently narrow
 *  to one of them). */
function capturedAnonymousDenial(target: string): string {
  const bytes = editViews!.targets[target].views.anonymous.edit_inline;
  if (bytes === undefined || bytes === "") throw new Error(`capture has no ${target} anonymous edit_inline`);
  return bytes;
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let anonymousEngine: RenderEngine | undefined;
let memberEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // ---- the shared edit-surface world (the edit-views suite's seed,
  //      trimmed to the address this file pins) ----
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 16, name: "*anyone", codename: "anyone", typeId: 14 });
  await seedCard(s, { id: 17, name: "*anyone signed in", codename: "anyone_signed_in", typeId: 14 });
  // the update rule: *all+*update -> [[Editor]] (the Editor role), with the
  // reference row onto the Anyone Signed In party that splits the viewer
  // verdicts the way the capture records them
  await seedCard(s, { id: 30, leftId: 10, rightId: 12, dbContent: "[[Editor]]" });
  await seedReference(s, 30, 7, "editor");
  await seedReference(s, 30, 17, "anyone_signed_in");
  // the two targets the audit's addresses name
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
    dbContent:
      '<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n',
    currentRevisionId: 604,
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([{ manifest: cardModEdit }]);
  loader.load();

  anonymousEngine = new RenderEngine(new FetchEngine(s.counting));
  anonymousEngine.modLoader = loader!;
  await loader!.installInto(modEngineHost(anonymousEngine, s.fetcher));

  memberEngine = new RenderEngine(new FetchEngine(s.counting));
  memberEngine.viewer = { signedIn: true, actorId: 583 };
  memberEngine.modLoader = loader!;
  await loader!.installInto(modEngineHost(memberEngine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describeOrSkipLoud(
  !FIXTURE_PRESENT,
  "tests/card/mod-loader/card-mod-edit-edit-inline-addresses.test.ts",
  "fixtures/captured/edit-views.json — captured-oracle fixture, absent on a clean clone",
)("the :edit_inline view at the audit's addresses (enumeration gap 9)", () => {
  it("the capture records the same denial stub at both addresses (the matrix's own guard)", () => {
    expect(capturedAnonymousDenial("basic_note")).toBe(capturedAnonymousDenial("deck_level"));
    expect(capturedAnonymousDenial("deck_level")).toBe(
      '<span class="denied"><!-- Sorry, you don\'t have permission (update) --></span>',
    );
  });

  it("the audit's second address answers its captured leg: Home x anonymous stays the byte spec", async () => {
    const html = normalize(await anonymousEngine!.render("Home", "edit_inline"));
    expect(html).toBe(normalize(capturedAnonymousDenial("deck_level")));
  });

  it("the verdict algebra splits as the capture records: a signed-in member still renders the editor form at Home", async () => {
    const html = normalize(await memberEngine!.render("Home", "edit_inline"));
    // the signed-in form's slot identity (the full byte pin lives in
    // card-mod-edit-views.test.ts's member arm)
    expect(html.startsWith('<div id="home-edit_inline-view"')).toBe(true);
    expect(html).toContain('<form class="card-form slotter autosave"');
    expect(html).toContain('action="/update/Home"');
    expect(html).not.toContain('class="denied"');
  });
});
