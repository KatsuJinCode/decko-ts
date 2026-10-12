// THE HEADLESS DISPATCH CONTRACT for the board/edit surfaces.
//
// The defect: signed-in GET /Latest_News/board and /Aiki/edit answer 422
// "Unsupported view". Both views ARE ported and pinned — board
// (card-mod-edit.ts boardView, set/all/board manifest registration) and
// edit (editView, set/all/edit_content) — but ONLY in the mod-loader
// manifest. The production worker boots NO mod deck (defaultDeckLoader,
// src/card/mod-loader/default-mod-deck.ts:183, has no production caller;
// RenderEngine's constructor captures getDefaultModLoader() at
// src/card/render.ts:784), so dispatch falls through computeResolvedView
// (src/card/render.ts:1974-1989) to the flat HTML_VIEWS record, which
// carries neither name — and format.ts:1333 raises the UnsupportedViewError
// the worker maps to 422 (src/server/worker-shared-surface.ts:57).
//
// Ruby's shape (and this file's contract): set/all/* format modules are
// mixed into the BASE format class every card's format inherits from
// (set/format.rb:133-144 all_set? branch + registrar.rb:79-84
// process_base_format_modules) — their views are visible to every card
// with or without a loaded deck. board, cardboard, edit and the edit-form
// dependency closure are ALL set/all/* views, so the compiled-in flat
// record must carry them. This is the same seam the leadView and
// templateNestView flat registrations closed for their surfaces
// (single source: the mod manifest and the flat record share one fn).
//
// The assertion: ONE seeded world, TWO engines — the HEADLESS engine
// (modLoader field pinned undefined: exactly the production worker's
// shape) and the CHAIN engine (a fully loaded composed deck bound to the
// field) — must render board and edit BYTE-IDENTICALLY modulo the
// randomized attributes. At the base revision the headless arm throws
// UnsupportedViewError (the 422) while the chain arm renders; after the
// flat registration both arms agree.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { ModLoader, setDefaultModLoader } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import cardModMarkdown from "../../../src/card/mod-loader/mods/card-mod-markdown.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";

/** The normalizations card-mod-edit-views.test.ts applies to board HTML:
 *  the randomized attributes (slot id, select2 id, tab id counter) plus
 *  nothing else — card ids are seeded constants here. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"')
    .replace(/data-select2-id=(["'])([^"']*)-\d+\1/g, 'data-select2-id="SELECT2"')
    .replace(/id="tab-\d+-/g, 'id="tab-UNIQUE-');
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let headless: RenderEngine | undefined;
let chain: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the rule/permission world (the shape card-mod-edit-views.test.ts seeds):
  // the setting anchors, the *all+*update rule granting "Anyone Signed In",
  // the decko_bot codename (the signed-in stand-in's always_ok short
  // circuit), and the RichText type card the probe rides.
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*create", codename: "create", typeId: 14 });
  await seedCard(s, { id: 16, name: "*anyone", codename: "anyone", typeId: 14 });
  await seedCard(s, {
    id: 17,
    name: "*anyone signed in",
    codename: "anyone_signed_in",
    typeId: 14,
  });
  await seedCard(s, { id: 25, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 30, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 30, 17, "anyone_signed_in");
  // the *all+*guide rule: puts the board sidebar's guide tab in front
  // (visible_board_tabs -> show_guide_tab? -> the guide rule's non-empty
  // bytes) so the active-tab dispatch exercises guide_tab -> :guide.
  await seedCard(s, { id: 40, name: "*guide", codename: "guide", typeId: 14 });
  await seedCard(s, { id: 31, leftId: 10, rightId: 40, typeId: 2, dbContent: "Guide body for the probe deck." });
  // the probe card (the board-bearing surface — every card carries the
  // all-set board view; this one is readable and update-allowed signed-in).
  await seedCard(s, {
    id: 605,
    name: "Oracle Basics",
    typeId: 2,
    typeName: "RichText",
    dbContent: "A plain basic card for oracle capture.",
    currentRevisionId: 693,
  });
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  // the HEADLESS engine: the production worker's shape — no mod deck is
  // ever bound. TWO isolations, both required:
  //  - the modLoader field is pinned (not inherited) so worker file order
  //    cannot leak a loader in;
  //  - the views record is a SNAPSHOT of the pristine compiled table,
  //    taken BEFORE the chain loader below loads — ModLoader's flat
  //    last-wins registration writes all-set mod views into the SAME
  //    HTML_VIEWS object this engine captured (mod-loader.ts:334-379), so
  //    without the snapshot the "headless" arm would see the loaded deck's
  //    registrations. The snapshot IS the production table: the worker
  //    never loads a deck, so its record stays at the compiled state.
  headless = new RenderEngine(new FetchEngine(s.counting));
  headless.viewer = { signedIn: true, actorId: 1 };
  headless.modLoader = undefined;
  (headless as unknown as { views: Record<string, unknown> }).views = {
    ...HTML_VIEWS,
  };

  // the CHAIN engine: the loader-bound path — the same mod subset
  // card-mod-edit-views.test.ts binds (edit carries
  // the board/edit closures, help the guide, markdown the guide :core,
  // history+comment the engage surface). NOT the full composed deck: with
  // every mod bound, card-mod-permissions' set-scoped view :input
  // (abstract/permission + the right/self task sets) enters the chain
  // ahead of all/editor's and raises for non-rule cards — a SEPARATE,
  // pre-existing chain-dispatch defect; the production path never binds a
  // deck, so it does not affect production.
  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
    { manifest: cardModHistory },
    { manifest: cardModComment },
  ]);
  loader.load();
  chain = new RenderEngine(new FetchEngine(s.counting));
  chain.viewer = { signedIn: true, actorId: 1 };
  chain.modLoader = loader;
  // superView (mod-view-helpers) reads the process-wide default; bind and
  // unbind around the file like view-set-scope-fallback.test.ts does.
  setDefaultModLoader(loader);
  // the guide rule card must be in the render-card map before the board
  // render: the board sidebar's visibleBoardTabs -> guideHelper resolves
  // through fetchRenderCard, which is CACHE-ONLY (render.ts:1180) — the
  // standing edit-views suite warms the same way (its warmEngine's
  // guide_tab render). One explicit warm per engine (separate fetch
  // engines, separate caches) puts the guide tab in front so the ACTIVE
  // tab dispatch is guide_tab -> :guide (chain-independent bytes; the
  // engage tab's +discussion nest resolves `titled` only through the
  // set-scoped RIGHT-discussion unknown decls a bound deck provides, and
  // must not globalize to the flat record).
  const warm = (e: RenderEngine): Promise<unknown> =>
    (
      e as unknown as {
        prepareItemForRender: (n: string) => Promise<unknown>;
      }
    ).prepareItemForRender("*all+*guide");
  await warm(headless);
  await warm(chain);
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  loader?.reset();
  storage?.close();
});

describe("headless (no-mod-deck) dispatch serves the board/edit surfaces like the loaded deck", () => {
  it("board renders byte-identically on both engines (RED at base: the headless arm raised the 422)", async () => {
    const s = storage!;
    const chainHtml = normalize(await chain!.render("Oracle Basics", "board"));
    const headlessHtml = normalize(await headless!.render("Oracle Basics", "board"));
    expect(headlessHtml).toBe(chainHtml);
    // the shape that makes the equality meaningful: the board modal wrapper
    // (board.haml grid + breadcrumb) and the edit form the board body nests.
    expect(headlessHtml).toContain("modal-full");
    expect(headlessHtml).toContain("board container-fluid");
    expect(headlessHtml).toContain("data-breadcrumb=\"Editing\"");
    expect(headlessHtml).toContain("card-form slotter autosave");
    void s;
  });

  it("edit renders byte-identically on both engines (RED at base: the headless arm raised the 422)", async () => {
    const chainHtml = normalize(await chain!.render("Oracle Basics", "edit"));
    const headlessHtml = normalize(await headless!.render("Oracle Basics", "edit"));
    expect(headlessHtml).toBe(chainHtml);
    // the :edit modal wrapper shape (edit_content.rb's wrap modal config,
    // emitted in the view fn): modal-lg + the modal menu's board link.
    expect(headlessHtml).toContain("modal-lg");
    expect(headlessHtml).toContain("board-link");
    expect(headlessHtml).toContain("card-form slotter autosave");
  });

  it("the headless board render is byte-stable across repeated renders", async () => {
    const first = normalize(await headless!.render("Oracle Basics", "board"));
    const second = normalize(await headless!.render("Oracle Basics", "board"));
    const third = normalize(await headless!.render("Oracle Basics", "board"));
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("anonymous still answers the board page with the update denial (the by-design shell, unchanged)", async () => {
    // board is perms :update (view-perms.ts name-keyed registry); the
    // anonymous render is the QUIET denial span — the same shape
    // card-mod-edit-views pins ("board is perms :update - the quiet
    // denial"). The flat registration must not move the gate.
    const anon = new RenderEngine(new FetchEngine(storage!.counting));
    anon.modLoader = undefined;
    (anon as unknown as { views: Record<string, unknown> }).views = {
      ...HTML_VIEWS,
    };
    const denial = await anon.render("Oracle Basics", "board");
    expect(denial).toContain(`class="denied"`);
    expect(denial).toContain("permission (update)");
  });

  it("the defect's raise site stays exact for genuinely unregistered views", async () => {
    // the flat seam closes board/edit; a view NO module registers must
    // still raise UnsupportedViewError — the error the worker maps to 422.
    await expect(
      headless!.render("Oracle Basics", "no_such_view_anywhere"),
    ).rejects.toThrowError(UnsupportedViewError);
  });
});
