// The :edit_inline view at the two addresses the enumeration audit's gap
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:edit_inline`;
// docs/runs/enumeration-audit-2026-10-25.gaps.json, the element "the
// :edit_inline view"):
//
//   /Home/edit_inline            (fixtures/captured/edit-views.json)
//   /Oracle_Basics/edit_inline   (fixtures/captured/edit-views.json)
//
// The capture bytes are the spec, and this file pins them at the ADDRESS:
// the capture records the two addresses, the port's read grammar maps
// each address to the (mark, view) pair the engine renders, and the
// engine's answer at that pair equals the capture's recorded bytes.
//
// The port already carried the view
// (src/card/mod-loader/mods/card-mod-edit.ts, all/edit_inline.rb:2-14,
// perms: :update, unknown: true) and its bytes at the two captured marks
// were pinned by tests/card/mod-loader/card-mod-edit-views.test.ts. What
// no proof covered was the ADDRESS: that proof renders ("Home",
// "edit_inline") and ("Oracle Basics", "edit_inline") - the pair - and
// nothing tied the paths the capture records to that pair. This file
// closes that half with the port's own URL grammar (worker.ts's parsePath,
// the function the deployed Worker runs, exported for the tests) and with
// the capture's bytes compared at the pair the ADDRESS names.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import cardModMarkdown from "../../../src/card/mod-loader/mods/card-mod-markdown.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import { parsePath } from "../../../worker.js";

/** The capture the audit cites. */
const EDIT_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/edit-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  targets: Record<
    string,
    { id: number; name: string; type: string; views: Record<string, Record<string, string>> }
  >;
  normalizations: Record<string, string>;
};

/** The capture's own normalizations (edit-views.json normalizations):
 *  data-card-id -> RANDOMIZED, data-slot-id -> RANDOMIZED, and the
 *  conflict tracker's hidden value -> ACTION_ID (the seed's state). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"')
    .replace(/data-select2-id=(["'])([^"']*)-\d+\1/g, 'data-select2-id="SELECT2"')
    .replace(
      /(<input class="current_revision_id form-control" autocomplete="off" type="hidden" value=")[^"]*(")/,
      "$1ACTION_ID$2",
    )
    .replace(/id="tab-\d+-/g, 'id="tab-UNIQUE-');
}

/** The audit's two addresses and the capture's target each one names. */
const ADDRESSES: ReadonlyArray<{
  address: string;
  target: string;
  id: number;
  name: string;
}> = [
  { address: "/Home/edit_inline", target: "deck_level", id: 521, name: "Home" },
  {
    address: "/Oracle_Basics/edit_inline",
    target: "basic_note",
    id: 605,
    name: "Oracle Basics",
  },
];

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;
let anonymousEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the actor stand-in. The bot codename is the STORED spelling the
  // permission machinery matches (read-rules.ts DECKOBOT_CODENAME
  // "decko_bot"): without it the always_ok short-circuit is lost and the
  // edit form renders the denial instead.
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  // the two captured targets, with the ids and the contents the capture
  // records (edit-views.json: Oracle Basics id 605, Home id 521)
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
      "<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n",
    currentRevisionId: 604,
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
    { manifest: cardModHistory },
    { manifest: cardModComment },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);

  const build = (actorId: number): RenderEngine => {
    const engine = new RenderEngine(new FetchEngine(s.counting));
    engine.viewer = { signedIn: true, actorId };
    engine.pageSession = { signedIn: true, actorId };
    engine.modLoader = loader!;
    return engine;
  };
  botEngine = build(1);
  anonymousEngine = build(0);
  await loader.installInto(modEngineHost(botEngine, s.fetcher));
  await loader.installInto(modEngineHost(anonymousEngine, s.fetcher));
  // The task-view render (edit_inline is a viewRequiresTask view) runs the
  // task-verdict prepare (render.ts ensureTaskVerdicts) over the mapped
  // cards; the guide render fetches the guide rule card into the map
  // first, so the verdicts are established before the pinned renders.
  await botEngine.render("Oracle Basics", "guide_tab");
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("the :edit_inline view at the two captured addresses", () => {
  it("the capture records the audit's two addresses", () => {
    for (const { address, target, id, name } of ADDRESSES) {
      const captured = EDIT_CAPTURE.targets[target]!;
      expect(captured.name).toBe(name);
      expect(captured.id).toBe(id);
      // the view the address names is recorded for every actor the
      // capture walked
      for (const actor of ["bot", "tova", "anonymous"]) {
        expect(captured.views[actor]!.edit_inline).toBeTypeOf("string");
        expect(captured.views[actor]!.edit_inline.length).toBeGreaterThan(0);
      }
      // the address's own mark is the capture's card name
      expect(address.startsWith(`/${name.replace(/ /g, "_")}/`)).toBe(true);
    }
  });

  it("the port's read grammar maps each address to the capture's mark and the edit_inline view", () => {
    for (const { address, name } of ADDRESSES) {
      const parsed = parsePath(address);
      expect(parsed).toEqual({ name, view: "edit_inline" });
    }
  });

  it("the port renders the capture's bytes at each address", async () => {
    for (const { address, target } of ADDRESSES) {
      const parsed = parsePath(address);
      if (!("name" in parsed) || parsed.view === undefined) {
        throw new Error(`the port's grammar does not answer ${address}`);
      }
      const html = normalize(await botEngine!.render(parsed.name, parsed.view));
      expect(html).toBe(normalize(EDIT_CAPTURE.targets[target]!.views.bot.edit_inline));
    }
  });

  it("the anonymous arm is the captured denial at each address", async () => {
    for (const { address, target } of ADDRESSES) {
      const parsed = parsePath(address);
      if (!("name" in parsed) || parsed.view === undefined) {
        throw new Error(`the port's grammar does not answer ${address}`);
      }
      const html = normalize(await anonymousEngine!.render(parsed.name, parsed.view));
      expect(html).toBe(normalize(EDIT_CAPTURE.targets[target]!.views.anonymous.edit_inline));
      expect(html).toContain("Sorry, you don't have permission (update)");
    }
  });
});
