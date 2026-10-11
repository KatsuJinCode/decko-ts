// parityfix-row6-bootswatch-skin-parent-pointer-corpus-replay.test.ts
// -- 2026-10-05 lane-parityfixes-2026-10-05, BUG 1
// (adjudicate-10-rows-lane.md row 6, `journal skin customized`).
//
// THE BUG. A bootswatch skin page's :core branches on `card.parent?`
// (bootswatch_skin.rb:57-59's `parent_skin_card&.real?`): a customized skin
// renders `Inherit from:` + a link to its parent theme; an un-customized one
// renders the Customize anchor. The capture puts `journal skin customized`
// on the INHERIT branch:
//
//   oracle: ...Use as current</a>\nInherit from:\n
//           <a class="known-card" href="/journal_skin">journal skin</a>\n
//   engine: ...Use as current</a>\n<a class="btn ... wanted-card"
//           href="/card/create?...">Customize</a>\n<div class='mt-4'>...
//
// (+232 B on the page - the adjudicate lane's span net, to the byte).
//
// MECHANISM 1 - the pointer IS in the deck; the name-keyed lookup cannot see
// it. The parent pointer is a real Pointer junction: corpus card 45365 is
// left_id 34179 (`journal skin customized`) + right_id 45364, and 45364 is
// the card NAMED `parent 1` whose CODENAME is `parent`, with content
// "journal skin" (corpus card_references: referer 45365 -> referee_key
// journal_skin). So the junction's composed NAME is
// `journal skin customized+parent 1`, while every view builds the string
// `<skin>+parent` -- which resolves to the junction (34179, 38357), a
// DIFFERENT card (`parent`, corpus 38357), or to nothing. `parent` is a
// card_accessor TRAIT (bootswatch_skin.rb:37), so Ruby's `card.parent` is a
// CODENAME-keyed subcard lookup, never a name lookup.
//
// MEASURED on the 47,235-card raw corpus
// (tmp/parityfixes-work/probe-skin-parent-pointer.mjs):
//   fetchByName("journal skin customized+parent")    -> undefined
//   fetchByName("journal skin customized+parent 1")  -> id 45365, type
//                                                      Pointer, content
//                                                      "journal skin"
//
// MECHANISM 2 - the branch's own anchor form. skinCoreView's hasParent arm
// pushes `Inherit from:\n${renderView("customize_button")}` - the Customize
// anchor - which contradicts its own doc comment (card-mod-bootstrap.ts
// :796-798, "Inherit from:" + the parent link) and the newer comment at
// :1174-1176, and is the wrong form against the correct sibling
// bootswatchCoreView:1214 (`Inherit from:\n${linkToCardName(ctx, firstItem)}`)
// - the exact shape the capture shows. Had the arm been taken, it would
// still have been wrong.
//
// Two blocks:
//   1. THE SEAM (fast, always runs): a loader-bound render of a deck holding
//      the corpus's exact parent-pointer shape must render the CAPTURED
//      Inherit-from line.
//   2. THE CORPUS REPLAY (gated on PARITYFIX_REPLAY=1 + the raw deck): the
//      real page carries that line verbatim and the pointer is seated under
//      the name the view builds.
//
// RUN: npx vitest run <this file> --no-file-parallelism

import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

/** The capture's line, byte-for-byte. The OLD yardstick vintage and the
 *  2026-10-05 recapture agree here (adjudicate evidence chain point 2). */
const CAPTURED_INHERIT =
  'Inherit from:\n<a class="known-card" href="/journal_skin">journal skin</a>\n';

const BOOTSWATCH_SKIN_TYPE_ID = 500;
const POINTER_TYPE_ID = 501;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  const s = await createRenderTestStorage();
  storage = s;
  const l = new ModLoader([{ manifest: cardModBootstrap }]);
  loader = l;
  l.load();
  bindModLoaderToEngine(s, l);
  await seedCard(s, {
    id: BOOTSWATCH_SKIN_TYPE_ID,
    name: "*bootswatch_skin",
    codename: "bootswatch_skin",
    typeId: 13,
    dbContent: "",
  });
  await seedCard(s, {
    id: POINTER_TYPE_ID,
    name: "*pointer",
    codename: "pointer",
    typeId: 13,
    dbContent: "",
  });
  // The parent theme, corpus 22794.
  await seedCard(s, {
    id: 22794,
    name: "journal skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "journal scss",
  });
  // The customized skin, corpus 34179.
  await seedCard(s, {
    id: 34179,
    name: "journal skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "journal scss v2",
  });
  // The TRAIT's type card, corpus 45364: codename `parent`, NAME `parent 1`.
  // The name/codename split is the whole mechanism - a name-keyed lookup for
  // `<skin>+parent` cannot reach the junction whose right side is this card.
  await seedCard(s, {
    id: 45364,
    name: "parent 1",
    codename: "parent",
    typeId: 13,
    dbContent: "",
  });
  // THE PARENT POINTER, corpus 45365: left 34179 + right 45364, Pointer-typed,
  // content "journal skin". Named NULL, side-backed - the corpus's own shape.
  await seedCard(s, {
    id: 45365,
    leftId: 34179,
    rightId: 45364,
    typeId: POINTER_TYPE_ID,
    dbContent: "journal skin",
  });
  // The bare control: a skin with NO pointer keeps the Customize branch.
  await seedCard(s, {
    id: 22774,
    name: "cerulean skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "cerulean scss",
  });
});

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("bootswatch skin core, parent branch (adjudicate row 6)", () => {
  // THE BUG, red-first: pre-fix this rendered the Customize anchor and the
  // `<div class='mt-4'>` image nest, byte-identical to the adjudicate lane's
  // engine output.
  it("a customized skin renders the capture's Inherit-from line, not the Customize anchor", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    const html = await s.engine.render("journal skin customized", "core");
    expect(html).toContain(CAPTURED_INHERIT);
    expect(html).not.toContain(">Customize</a>");
  });

  // THE CONTROL: an un-customized skin keeps the Customize anchor. Must stay
  // green - it is the guard that the pointer resolution did not start
  // inventing parents.
  it("a skin with no +parent pointer still renders the Customize anchor", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    const html = await s.engine.render("cerulean skin", "core");
    expect(html).toContain(">Customize</a>");
    expect(html).not.toContain("Inherit from:");
  });
});

const REPLAY = process.env.PARITYFIX_REPLAY === "1";
const CORPUS_PRESENT = existsSync(
  new URL("../../../tmp/raw-ground-truth/bench-corpus-raw.sqlite3", import.meta.url)
    .pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

describeOrSkipLoud(!REPLAY || !CORPUS_PRESENT, "tests/card/render/parityfix-row6-bootswatch-skin-parent-pointer-corpus-replay.test.ts", "not (!REPLAY || !CORPUS_PRESENT)")(
  "journal skin customized page bytes (corpus replay)",
  () => {
    it("renders the capture's Inherit-from line and seats the pointer under the name the view builds", async () => {
      const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
        "./raw-corpus-seeding.js"
      );
      const views = await import("../../../src/card/render/views.js");
      views.setDeploymentCloudAssetHost(
        "https://source-deck-production-storage.r1.cdn.objectstore.example",
      );
      const Database = (await import("better-sqlite3")).default;
      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const ids = idLister
        .prepare("SELECT id FROM cards WHERE trash = 0")
        .all()
        .map((r: unknown) => (r as { id: number }).id);
      idLister.close();
      const corpusStorage = await createRawStructureSeededStorage(new Set(ids));
      corpusStorage.fetcher.installNameEnvironment();
      await corpusStorage.fetcher.warmLexicon(ids);
      try {
        const html = await corpusStorage.engine.renderPage("journal skin customized");
        expect(html).toContain(CAPTURED_INHERIT);
        // The parent-less arm's Customize anchor must be gone (its href
        // proposes "journal skin customized customized", the parent-less
        // newCustomizedName walk).
        expect(html).not.toContain("customized+customized");
        // MECHANISM 1 at the byte level: the pointer is reachable under
        // `<skin>+parent`, the name every view builds.
        expect(
          corpusStorage.engine.fetchRenderCard("journal skin customized+parent"),
        ).toBeDefined();
      } finally {
        corpusStorage.close();
      }
    }, 900_000);
  },
);