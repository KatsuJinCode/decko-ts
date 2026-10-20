// card-mod-bootstrap (register entry 6): the bootswatch_skin TYPE-VIEW
// CHAIN census.
//
// WHAT THIS CONVERTS
// The mod file carried five claims that the running tree contradicts.
// Four of them ("the render engine does not currently route type-specific
// view overrides"; ":icons omits the library-specific icon tags"; the
// colors views "stay passive"; `use_as_current_skin` is a "STUB") were
// comments asserting that a surface did not dispatch, plus a set-module
// census that under-counted the gem as 11 files when it ships 24. This
// file asserts the opposite, from inside the repo, so a regression turns
// the comment into a red test instead of a lie that survives until
// someone reads it.
//
// THE MECHANISM, MEASURED NOT ASSUMED
// `type/bootswatch_skin` and `type/bootswatch_skin/html_views` are
// CONCRETE type set modules. A concrete type module LEADS its card's
// format chain; only base-kind modules (set/all/*) reach the flat
// last-wins table (mod-loader.ts:377-393). So the type registrations
// dispatch for a bootswatch_skin-typed card and NOT for anyone else -
// and, as the counter-proof measured, they keep the lead even against a
// LATER-registered base-kind module. That asymmetry is the whole census:
// it is what makes the throw-without/bytes-with pairings a dispatch proof
// rather than a registry lookup.
//
// ONE EXCEPTION, AND IT IS NOT ONE: `:icons` (set/all/bootstrap/icon.rb)
// is base-kind, so it flat-registers and answers for every card. Ruby
// agrees. The first draft of this file assumed :icons was type-scoped
// because it sat in the same header paragraph; the run measured it
// answering for a plain RichText. It is graded as the deck-wide view it
// is.
//
// DECK SHAPE: the same one the sibling family test stages - a
// bootswatch_skin-typed card ("Media Probe Skin") with ONE +Image child
// row, no +parent, and therefore no +*colors/+*variables/+*stylesheets.
// `Anyone` (a plain RichText) is the non-skin control.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
const SKIN = "Media Probe Skin";
const PLAIN = "Anyone";

async function installLoader(mods: DeckoModManifest[]): Promise<void> {
  const s = storage!;
  loader = new ModLoader(mods.map((manifest) => ({ manifest })));
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

/** render, returning the throw text instead of throwing - the census
 *  grades the UnsupportedViewError shape too, because "not supported for
 *  <card>" is itself the measured fact (format.ts:1414). */
async function tryRender(name: string, view: string): Promise<string> {
  try {
    return await storage!.engine.render(name, view);
  } catch (e) {
    return `THROW ${(e as Error).message}`;
  }
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 19, name: "Image", codename: "image", typeId: 2 });
  await seedCard(s, { id: 21, name: "SCSS", codename: "scss", typeId: 2 });
  await seedCard(s, { id: 22, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*default", codename: "default", typeId: 14 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, {
    id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14,
    dbContent: "[[Anyone]]",
  });
  await seedCard(s, { id: 18, name: PLAIN, codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");
  await seedCard(s, { id: 30, name: SKIN, typeId: 22 });
  await seedCard(s, {
    id: 31, name: `${SKIN}+Image`, leftId: 30, rightId: 19, typeId: 19,
    dbContent: `:media_probe_skin+:image/bootstrap.png`,
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("bootswatch_skin type-view chain census", () => {
  it("WITHOUT the loader: every type-level view is unreachable, by measurement", async () => {
    // The control arm. Each of these four views is registered ONLY on a
    // type set module, so with no loader bound the flat table cannot
    // answer them and the engine says so. If any of these ever render
    // without the loader, a base-kind registration has leaked in and
    // the type-scoping claim is no longer the mechanism.
    for (const v of ["one_line_content", "customize_button", "icons"]) {
      expect(await tryRender(SKIN, v)).toBe(
        `THROW view (${v}) not supported for ${SKIN}`,
      );
    }
    // :icons is NOT in this list, and the reason is worth stating: it
    // lives on set/all/bootstrap/icon.rb, a BASE-kind module, so once
    // the loader is bound it flat-registers deck-wide (the next test
    // measures that). The first draft of this census assumed :icons was
    // type-scoped alongside the other three because it appeared in the
    // same header paragraph; the run measured it answering for a plain
    // RichText card, which is the base-kind behaviour, so it is graded
    // in its own right below rather than folded into the type census.
    const bareInput = await tryRender(SKIN, "input");
    expect(bareInput).toContain('class="tinymce-textarea d0-card-content form-control"');
  }, 120_000);

  it("WITH the loader: the type module LEADS - Ruby's four arms, byte for byte", async () => {
    await installLoader([cardModBootstrap]);
    const s = storage!;
    await s.engine.prepareItemForRender(`${SKIN}+Image`);

    // bootswatch_skin.rb:116-118 `view :one_line_content do "" end`
    expect(await tryRender(SKIN, "one_line_content")).toBe("");

    // bootswatch_skin.rb:102-108
    //   view :input do
    //     if card.parent? then super() else "Content is stored in file
    //     and can't be edited." end
    //   end
    // The probe skin has NO +parent row, so the else arm is the answer,
    // and the type registration has displaced the engine's textarea.
    expect(await tryRender(SKIN, "input")).toBe(
      "Content is stored in file and can't be edited.",
    );

    // html_views.rb:38-48 customize_button -> link_to_card with the
    // wanted-card class (set/all/links.rb:140-144 adds it, the new name
    // is not a stored card) and the Card::Path byte order.
    const customize = await tryRender(SKIN, "customize_button");
    expect(customize).toContain('<a class="btn btn-sm btn-outline-primary me-2 wanted-card"');
    expect(customize).toContain(
      "href=\"/card/create?card%5Bfields%5D%5Bparent%5D=Media+Probe+Skin&amp;card%5Bname%5D=Media+Probe+Skin+customized&amp;card%5Btype%5D=bootswatch_skin&amp;mark=Media",
    );

    // icon.rb:84 view :icons + icons.haml:1-18. The library-specific
    // <library>_icon_tag cells ARE rendered - the claim that they were a
    // follow-up was false.
    const icons = await tryRender(SKIN, "icons");
    expect(icons).toContain("<th>\nmaterial\n</th>");
    expect(icons).toContain("<th>\nfont_awesome\n</th>");
    expect(icons).toContain('<i class="material-icons">add</i>');
    expect(icons).toContain('<i class="fa fa-plus"></i>');
  }, 120_000);

  it("SCOPE: the plain RichText control gets NONE of the TYPE views", async () => {
    // Same loader, same engine, different card. If these rendered, the
    // registrations would be reaching the flat table and the whole
    // type-lead story would be wrong.
    expect(await tryRender(PLAIN, "one_line_content")).toBe(
      `THROW view (one_line_content) not supported for ${PLAIN}`,
    );
    expect(await tryRender(PLAIN, "customize_button")).toBe(
      `THROW view (customize_button) not supported for ${PLAIN}`,
    );
    // :icons is the deliberate EXCEPTION and the reason this test has a
    // shape worth reading: set/all/bootstrap/icon.rb is base-kind, so it
    // flat-registers and answers for every card. Ruby agrees -
    // All::Bootstrap::Icon is mixed into the base format class every card
    // inherits (mod-loader.ts:377-393), so `view :icons` is deck-wide in
    // both engines. A base-kind/deck-wide view and a concrete-type view
    // on the same mod, measured apart.
    const plainIcons = await tryRender(PLAIN, "icons");
    expect(plainIcons).toContain("<th>\nmaterial\n</th>");
    expect(plainIcons).toContain('<i class="material-icons">add</i>');
    expect(await tryRender(SKIN, "icons")).toBe(plainIcons);
  }, 120_000);

it("COUNTER-PROOF: an all/ base-kind registration reaches the PLAIN card, not the skin", async () => {
    // The same view name registered on all/bootstrap (base-kind) does
    // the OPPOSITE thing: it reaches the plain card, which the real
    // type-level registration never does.
    //
    // WHAT THE FIRST DRAFT PREDICTED, AND WHAT THE RUN MEASURED. The
    // draft expected the scratch registration - installed LAST, on the
    // flat last-wins table - to take the skin card too ("if flat
    // registration were reaching the skin card it would now answer").
    // The run measured "" for the skin: the CONCRETE TYPE module keeps
    // the lead even against a later-registered base-kind module. That is
    // a stronger result than the draft's guess, and it is the mechanism
    // that makes the type-scoped arms safe to land at all - the chain
    // walk (computeResolvedView) orders concrete-type ahead of base,
    // independent of registration order. The correction stays in the
    // test rather than being quietly edited away.
    const scratch: DeckoModManifest = {
      name: "census-scratch",
      gemName: "census-scratch",
      group: "census",
      setModules: [
        {
          setPath: "all/bootstrap",
          formats: {
            html: {
              views: [
                { view: "one_line_content", viewFn: (): string => "SCRATCH-FLAT" },
              ],
            },
          },
        },
      ],
    };
    await installLoader([cardModBootstrap, scratch]);
    await storage!.engine.prepareItemForRender(`${SKIN}+Image`);
    // The skin keeps Ruby's "" - the type module still leads.
    expect(await tryRender(SKIN, "one_line_content")).toBe("");
    // The plain card, which threw under the real manifest, now answers.
    expect(await tryRender(PLAIN, "one_line_content")).toBe("SCRATCH-FLAT");
  }, 180_000);

  it("the basket is COMPLETE: 24 setModules for the gem's 24 set files", () => {
    // The census the header used to under-count ("11 set files ...
    // 15 of 24"). Counted from the manifest, and checked against the
    // setPaths the gem's own tree declares - the six methods-only
    // all/bootstrap/* helpers are the rows an earlier count dropped.
    const setPaths = cardModBootstrap.setModules?.map((m) => m.setPath) ?? [];
    expect(new Set(setPaths).size).toBe(setPaths.length); // no duplicates
    expect(setPaths).toHaveLength(24);
    for (const p of [
      "all/bootstrap/accordion", "all/bootstrap/dropdown", "all/bootstrap/form",
      "all/bootstrap/navbar", "all/bootstrap/table", "all/bootstrap/wrapper",
      "type_plus_right/bootswatch_skin/image",
      "type_plus_right/bootswatch_skin/parent",
      "type_plus_right/bootswatch_skin/stylesheets",
      "type_plus_right/bootswatch_skin/variables",
    ]) {
      expect(setPaths).toContain(p);
    }
    // The colors views are REGISTERED, not passive (the withdrawn
    // "explicit BLOCKER" claim): bar_middle, input and core each carry
    // a viewFn on the colors setPath.
    const colors = cardModBootstrap.setModules?.find(
      (m) => m.setPath === "type_plus_right/bootswatch_skin/colors",
    );
    const colorsViews = (colors?.formats?.html?.views ?? []).map((v) => v.view);
    expect(colorsViews).toEqual(["bar_middle", "input", "core"]);
    for (const v of colors?.formats?.html?.views ?? []) {
      expect(typeof v.viewFn).toBe("function");
    }
  });

  it("use_as_current_skin: declared here, body owned by the write path", async () => {
    // The mod file used to call this a STUB with "the engine's write
    // path has no surface for" the rule save. The write path DOES:
    // CardActionEngine.useAsCurrentSkin (card-action-engine.ts:2655),
    // dispatched from the update route's trigger arm
    // (write-routes.ts:2060-2068). What is pinned here is the half that
    // lives in THIS manifest - the declaration - and the anchor that
    // reaches the trigger, so the two halves cannot drift apart.
    const typeMod = cardModBootstrap.setModules?.find(
      (m) => m.setPath === "type/bootswatch_skin",
    );
    const names = (typeMod?.events ?? []).map((e) => e.event);
    expect(names).toContain("use_as_current_skin");
    const decl = (typeMod?.events ?? []).find((e) => e.event === "use_as_current_skin");
    expect(decl?.at).toBe("finalize");
    expect(decl?.trigger).toBe("required");
    expect(decl?.on).toEqual(["save"]); // Ruby on: :save

    const src = await import("node:fs/promises");
    const engineSrc = await src.readFile("src/card/actions/card-action-engine.ts", "utf8");
    expect(engineSrc).toContain("async useAsCurrentSkin(cardId: number)");
    expect(engineSrc).toContain('await this.fetch.fetchByName("*all+*style")');
    const routesSrc = await src.readFile("src/server/write-routes.ts", "utf8");
    expect(routesSrc).toContain('trigger === "use_as_current_skin"');
  });
});