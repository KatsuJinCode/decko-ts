// THE HEADLESS DISPATCH CONTRACT for :help_text (same class as the
// board/edit defect in headless-board-edit-flat-dispatch.test.ts).
//
// The defect: :help_text lives in set/all/help.rb — the SAME base file as
// :help/:lead (card-mod-help-0.20.0/set/all/help.rb:14-16, one view fn, the
// :help_text declaration) — but the existing flat HTML_VIEWS
// registration (views.ts "help"/"guide" rows) covered only :help and
// :guide. :help_text therefore stayed mod-only: the production worker
// boots NO mod deck (defaultDeckLoader has no production caller;
// RenderEngine captures getDefaultModLoader() at src/card/render.ts:784),
// so computeResolvedView's flat fallback found no name and
// format.ts:1333 raised the UnsupportedViewError the worker maps to 422
// (src/server/worker-shared-surface.ts:57).
//
// Ruby's shape (and this file's contract): set/all/* format modules are
// mixed into the BASE format class every card's format inherits from
// (set/format.rb:133-144 all_set? branch + registrar.rb:79-84
// process_base_format_modules), so their views are visible to every card
// with or without a loaded deck. :help_text's declaration is all-set with
// `unknown: true, cache: :never` and NO wrap config (help.rb:14-16) — so
// the compiled-in flat record must carry the same fn the manifest
// registers (single source: one function, two tables), plus the
// compiled `setting :unknown` row the manifest's config gives the chain
// walk (format.ts UNKNOWN_VIEW_DECLS).
//
// The set-scoped sibling is outside this file's contract: card-mod-rules
// set/rule/board_rules_editor.rb:17-19 overrides :help_text for Rule-set
// cards and is registered NONBASE (card-mod-rules.ts ruleHelpTextView), so
// it is reachable only through a bound deck's chain walk — exactly as
// Ruby reaches it. The flat all-set row must not mask it, and must not
// answer for a Rule card on the loader-less arm either (the loader-less
// arm has no chain at all; Ruby's base class row would answer there, which
// is what the flat record reproduces).
//
// The assertion: ONE seeded world, TWO engines — the HEADLESS engine
// (modLoader field pinned undefined: exactly the production worker's
// shape) and the CHAIN engine (a loaded deck bound to the field) — must
// render :help_text
// BYTE-IDENTICALLY. At the base revision the headless arm throws
// UnsupportedViewError (the 422) while the chain arm renders the pinned
// bytes; after the flat registration both arms agree.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
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

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let headless: RenderEngine | undefined;
let chain: RenderEngine | undefined;
/** The PRISTINE compiled row, read before any loader in this file loads:
 *  ModLoader's flat last-wins registration writes all-set mod views into
 *  the same HTML_VIEWS object (mod-loader.ts:334-379), so a read taken
 *  after loader.load() would compare the loader against itself and pass
 *  tautologically. This is what the production worker boots with. */
let pristineHelpText: unknown;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename cards (the codename registry reads cards.codename; their
  // type ids matter to the rule-cache join: set-typed vs setting-typed).
  // Same ids as the card-mod-help suite (not in the public package)'s probe deck so
  // the rule-card composition matches the one that file seeds.
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*help", codename: "help", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // The set card "Oracle Help Probe+*self" (junction: probe + *self) and
  // the rule card "Oracle Help Probe+*self+*help" (junction: set card +
  // *help), seeded at the PROBE's own anchor exactly as
  // the card-mod-help suite (not in the public package) seeds them: help.rb:1-4
  // help_rule_card walks the card's set names joined to "*help"
  // (lib/card/rule/all.rb:9-15), so a probe-anchored rule card resolves
  // for the ruled probe ONLY - which is what keeps "Oracle Bare Probe"
  // rule-less for the empty-string arm. The rule card's dbContent is the
  // raw help text the help.rb:32-48 chain processes (process_content,
  // chunk_list: :references - no [[...]] chunks here).
  await seedCard(s, { id: 20, leftId: 1169, rightId: 11, typeId: 13 });
  await seedCard(s, {
    id: 21,
    leftId: 20,
    rightId: 12,
    typeId: 14,
    dbContent: "Moderator-approved help text for the probe card.",
  });

  // the probe cards: ruled (walks the *help rule) and bare (no rule card,
  // so help_text is "" per help.rb:41 `return "" unless raw_help_text`).
  await seedCard(s, { id: 1169, name: "Oracle Help Probe", typeId: 2, dbContent: "probe card body" });
  await seedCard(s, { id: 1170, name: "Oracle Bare Probe", typeId: 2, dbContent: "bare probe body" });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  // the HEADLESS engine: the production worker's shape — no mod deck is
  // ever bound. TWO isolations, both required (the board/edit file
  // records why):
  //  - the modLoader field is pinned (not inherited) so worker file order
  //    cannot leak a loader in;
  //  - the views record is a SNAPSHOT of the pristine compiled table,
  //    taken BEFORE the chain loader loads — ModLoader's flat last-wins
  //    registration writes all-set mod views into the SAME HTML_VIEWS
  //    object this engine captured (mod-loader.ts:334-379), so without
  //    the snapshot the "headless" arm would see the loaded deck's
  //    registrations. The snapshot IS the production table: the worker
  //    never loads a deck, so its record stays at the compiled state.
  headless = new RenderEngine(new FetchEngine(s.counting));
  headless.viewer = { signedIn: true, actorId: 1 };
  headless.modLoader = undefined;
  (headless as unknown as { views: Record<string, unknown> }).views = {
    ...HTML_VIEWS,
  };
  pristineHelpText = (headless as unknown as { views: Record<string, unknown> }).views[
    "help_text"
  ];

  // the CHAIN engine: the loader-bound path. Same subset shape as the
  // board/edit file (edit carries
  // the board/edit closure, help the :help_text/:help/:lead family,
  // markdown the guide :core) — NOT the full composed deck, because
  // card-mod-permissions' set-scoped :input raises for non-rule cards
  // when every mod is bound (a separate, pre-existing chain-dispatch
  // defect; the production path never binds a deck, so it does not
  // affect production).
  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
  ]);
  loader.load();
  chain = new RenderEngine(new FetchEngine(s.counting));
  chain.viewer = { signedIn: true, actorId: 1 };
  chain.modLoader = loader;
  // superView (mod-view-helpers) reads the process-wide default; bind and
  // unbind around the file like view-set-scope-fallback.test.ts does.
  setDefaultModLoader(loader);

  // the *help rule card must be in the render-card map before the render:
  // helpRuleCard's fetchRenderCard is CACHE-ONLY (render.ts:1180). On the
  // chain arm card-mod-help's prepareEngine warms it at load; the headless
  // arm boots no deck, so it needs the same explicit warm — one per engine
  // (separate fetch engines, separate caches).
  const warm = (e: RenderEngine): Promise<unknown> =>
    (
      e as unknown as {
        prepareItemForRender: (n: string) => Promise<unknown>;
      }
    ).prepareItemForRender("Oracle Help Probe+*self+*help");
  await warm(headless);
  await warm(chain);
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  loader?.reset();
  storage?.close();
});

describe("headless (no-mod-deck) dispatch serves :help_text like the loaded deck", () => {
  it("help_text renders byte-identically on both engines (RED at base: the headless arm raised the 422)", async () => {
    const chainHtml = await chain!.render("Oracle Help Probe", "help_text");
    const headlessHtml = await headless!.render("Oracle Help Probe", "help_text");
    expect(headlessHtml).toBe(chainHtml);
    // the shape that makes the equality meaningful: help.rb:18-25's
    // wrap_help_text d-none edit-link prefix (the readable *help rule
    // card resolved) plus the processed rule text.
    expect(headlessHtml).toContain("class='d-none'");
    expect(headlessHtml).toContain("rule_edit");
    expect(headlessHtml).toContain("Moderator-approved help text for the probe card.");
  });

  it("help_text on a rule-less card is the empty string on both engines (help.rb:41, no raw_help_text)", async () => {
    const chainText = await chain!.render("Oracle Bare Probe", "help_text");
    const headlessText = await headless!.render("Oracle Bare Probe", "help_text");
    expect(headlessText).toBe("");
    expect(headlessText).toBe(chainText);
  });

  it("the headless help_text render is byte-stable across repeated renders", async () => {
    const first = await headless!.render("Oracle Help Probe", "help_text");
    const second = await headless!.render("Oracle Help Probe", "help_text");
    const third = await headless!.render("Oracle Help Probe", "help_text");
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("the PRISTINE compiled flat record carries :help_text from the SAME fn the manifest registers", async () => {
    // single-source: the flat row is the mod's view fn, imported not
    // copied (the template_nest/leadView/board/edit precedent). Read
    // BEFORE the loader mutated HTML_VIEWS, so this compares the
    // production table against the manifest rather than the loader
    // against itself. At base the pristine row is undefined (RED).
    const manifestFn = loader!.viewChainTable().viewFor("All::Help", "help_text");
    expect(manifestFn).toBeDefined();
    expect(pristineHelpText).toBeDefined();
    expect(pristineHelpText).toBe(manifestFn);
  });

  it("the defect's raise site stays exact for genuinely unregistered views", async () => {
    // the flat seam closes :help_text; a view NO module registers must
    // still raise UnsupportedViewError — the error the worker maps to 422.
    await expect(
      headless!.render("Oracle Help Probe", "no_such_view_anywhere"),
    ).rejects.toThrowError(UnsupportedViewError);
  });
});