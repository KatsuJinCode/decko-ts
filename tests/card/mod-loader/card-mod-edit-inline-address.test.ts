// The :edit_inline view at the ADDRESSES the enumeration audit's gap names
// (docs/runs/enumeration-audit-2026-10-25.gaps.json, the capture-view gap
// "the :edit_inline view"; the audit's part A1 table).
//
// The audit's evidence is two ADDRESSES:
//   fixtures/captured/edit-views.json, targets.basic_note.views.bot.edit_row,
//   carries the anchor
//     <a rel="nofollow" class="ms-2 edit-link slotter" data-cy="edit-link" href="/Oracle_Basics/edit_inline" data-remote="true">
//   and targets.deck_level.views.bot.edit_row carries the same anchor for the
//   deck-level card:
//     href="/Home/edit_inline"
//   The audit's own words: "the capture records / Home/edit_inline and
//   /Oracle_Basics/edit_inline".
//
// The capture also carries the BODY the original rendered at those
// addresses: targets.basic_note.views.<actor>.edit_inline and
// targets.deck_level.views.<actor>.edit_inline, for the three fixture
// actors (bot = the signed-in administrator, tova = the signed-in member,
// anonymous). This file renders those two addresses through the port's own
// render path and holds the responses against the captured bytes, with the
// capture's normalizations applied to BOTH sides (the seed state the
// capture masks: data-slot-id, data-card-id, the conflict tracker's value).
//
// What this closes: the card-mod-edit-views suite already pins the
// edit_inline BODY for both targets and all three actors, but it renders
// them by view name. The ADDRESS is a separate question - the port's read
// grammar answers GET /<name>/<view> by handing the view segment to the
// engine - and nothing proved the port answers at the two captured
// addresses. This file is the answer, and it holds the whole response
// byte for byte against the capture.
//
// The deck is this suite's own (in-process SQLite, no network): the two
// captured cards (Oracle Basics id 605, Home id 521), the cardtypes they are
// typed by, the nested card Home's content points at, and the actors.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

const CAPTURED_DIR = new URL("../../../fixtures/captured/", import.meta.url);
const EDIT_CAPTURE = fileURLToPath(new URL("edit-views.json", CAPTURED_DIR));
const CAPTURES_PRESENT = existsSync(EDIT_CAPTURE);

const EDIT_CAPTURED = CAPTURES_PRESENT
  ? JSON.parse(readFileSync(EDIT_CAPTURE, "utf8"))
  : undefined;

/** The capture's normalizations, applied to BOTH sides (the same masks the
 *  card-mod-edit-views suite applies: seed state, not product behaviour). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"')
    .replace(
      /(<input class="current_revision_id form-control" autocomplete="off" type="hidden" value=")[^"]*(")/,
      "$1ACTION_ID$2",
    );
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;
let memberEngine: RenderEngine | undefined;
let anonymousEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the cardtypes the captured cards are typed by (the capture's own type
  // ids: RichText is cardtype 2, HTML is cardtype 39)
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 39, name: "HTML", codename: "html", typeId: 9 });

  // the actors the capture's three actor keys name
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 25, name: "Anonymous", codename: "anonymous" });

  // the deck's update rule: the capture's member (tova) answers the
  // inline-edit surface with the FORM, so the captured deck lets a signed-in
  // member update the card. The rule is the deck's own: *all+*update grants
  // "Anyone Signed In". The anonymous visitor is not signed in, so the
  // denial arm still holds.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, {
    id: 17,
    name: "*anyone signed in",
    codename: "anyone_signed_in",
    typeId: 14,
  });
  await seedCard(s, {
    id: 30,
    leftId: 10,
    rightId: 12,
    dbContent: "[[Anyone Signed In]]",
  });
  await seedReference(s, 30, 17, "anyone_signed_in");

  // the two captured cards
  await seedCard(s, {
    id: 605,
    name: "Oracle Basics",
    typeId: 2,
    typeName: "RichText",
    dbContent: "A plain basic card for oracle capture.",
    currentRevisionId: 693,
  });
  // the nested card Home's content points at ({{:getting_started|core}})
  await seedCard(s, {
    id: 40,
    name: "*getting started",
    codename: "getting_started",
    typeId: 39,
    typeName: "HTML",
    currentRevisionId: 41,
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

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModFormat },
    { manifest: cardModPermissions },
  ]);
  loader.load();
  bindModLoaderToEngine(storage, loader);

  botEngine = await engineFor({ signedIn: true, actorId: 1 });
  memberEngine = await engineFor({ signedIn: true, actorId: 583 });
  anonymousEngine = await engineFor(undefined);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** One engine bound to the loader, with the viewer's session set. */
async function engineFor(
  viewer: { signedIn: boolean; actorId: number } | undefined,
): Promise<RenderEngine> {
  const engine = new RenderEngine(new FetchEngine(storage!.counting));
  if (viewer !== undefined) {
    engine.viewer = viewer;
    engine.pageSession = viewer;
  }
  engine.modLoader = loader!;
  await loader!.installInto(modEngineHost(engine, storage!.fetcher));
  return engine;
}

describe("the :edit_inline view at the captured addresses", () => {
  it("the capture's anchors name the addresses this suite renders", () => {
    if (!CAPTURES_PRESENT) return;
    expect(EDIT_CAPTURED.targets.basic_note.views.bot.edit_row).toContain(
      `href="/Oracle_Basics/edit_inline"`,
    );
    expect(EDIT_CAPTURED.targets.deck_level.views.bot.edit_row).toContain(
      `href="/Home/edit_inline"`,
    );
  });

  it("/Oracle_Basics/edit_inline answers the captured administrator bytes", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = normalize(await botEngine!.render("Oracle Basics", "edit_inline"));
    expect(html).toBe(EDIT_CAPTURED.targets.basic_note.views.bot.edit_inline);
  });

  it("/Home/edit_inline answers the captured administrator bytes", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = normalize(await botEngine!.render("Home", "edit_inline"));
    expect(html).toBe(EDIT_CAPTURED.targets.deck_level.views.bot.edit_inline);
  });

  it("the member's answer at the same address is the captured member bytes", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = normalize(await memberEngine!.render("Oracle Basics", "edit_inline"));
    expect(html).toBe(EDIT_CAPTURED.targets.basic_note.views.tova.edit_inline);
  });

  it("the anonymous answer at the same address is the captured denial", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = normalize(await anonymousEngine!.render("Oracle Basics", "edit_inline"));
    expect(html).toBe(EDIT_CAPTURED.targets.basic_note.views.anonymous.edit_inline);
  });
});
