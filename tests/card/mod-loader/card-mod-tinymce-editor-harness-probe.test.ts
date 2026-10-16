// The mod-porting-harness probe for card-mod-tinymce_editor's CHROME views —
// the TRACKED standing net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-tinymce_editor.harness.jsonl, produced
// by `node tools/mod-porting-harness/mod-harness.mjs capture
// card-mod-tinymce_editor` from
// tools/mod-porting-harness/ruby-oracles/card-mod-tinymce_editor/
// reference-editor-chrome-views.rb).
//
// The oracle is byte-PRODUCING static-ruby (the gems' verbatim source under
// real Haml 5.2.2 + real ActionView 7.2.4 + real cardname + real Card::Tab),
// and its params-ABSENT arms are byte-exact substrings of the prior lane's
// LIVE deck capture — so this probe pins the TS chrome to bytes that are
// live-verified twice over.
//
// Section A replays the oracle bytes through tinymceProbeSurface (the SAME
// composition cores the registered views call); the NEST/WRAP seam markers
// ride the probe's seam stubs exactly as the oracle emitted them. Section B
// renders through the seeded runtime: the registered views' absent-params
// arms + the engine's REAL seam dispatches (fmt.nest -> the rules mod's
// nest_rules view, the image card's new_image/core views).
//
// RED discipline: while these views are unported, every scenario fails
// here — that failure IS the harness working.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyRenderParamsFromWire } from "../../../src/server/worker-shared-surface.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModTinymce, {
  tinymceProbeSurface,
  type ChromeContext,
} from "../../../src/card/mod-loader/mods/card-mod-tinymce_editor.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  paramsSeam?: string;
  bytes?: string;
  nestSeams?: string[];
  liveCrossCheck?: string;
  success?: Record<string, unknown>;
  vooHide?: string[];
  vooShow?: string[];
  buttonsView?: string;
  dispatch?: string;
  seamDeltas?: { lines: number[]; basis: string };
  autonameFact?: Record<string, string>;
}

function tinymceOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-tinymce_editor.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine);
}

// --- the oracle's own recorded card facts ------------------------------------

const CARD_NAME = "Oracle TinyMCE Editor Probe";
const CARD_KEY = "oracle_tiny_mce_editor_probe";
const CARD_TYPE = "RichText";
const SEEDED_SNIPPET = `{{+${CARD_NAME}|view: content; size: medium}}`;
const SEEDED_TINYMCE_ID = "tinymce-textarea-1";
const SEEDED_TM_SNIPPET_START = "12";
const SEEDED_INDEX = "2";

/** The probe's ChromeContext: the oracle's card facts + the ORACLE'S OWN
 *  seam markers (the byte-compare target emits the same markers). */
function oracleCtx(): ChromeContext {
  return {
    cardName: CARD_NAME,
    cardKey: CARD_KEY,
    leftType: CARD_TYPE,
    idCounter: { n: 0 },
    nest: (target, view) => `%%NEST_SEAM[${target}|view: ${view}]%%`,
    forceShowContentTab: () => {},
    wrap: () => `%%WRAP_SEAM[slot]%%`,
  };
}

function diffHint(expected: string, actual: string): string {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i += 1;
  return `first divergence at ${i} (oracle ${expected.length}b / ported ${actual.length}b):\n  oracle: ${JSON.stringify(expected.slice(Math.max(0, i - 70), i + 110))}\n  ported: ${JSON.stringify(actual.slice(Math.max(0, i - 70), i + 110))}`;
}

/** the byte-compare: the divergence hint IS the failure message. */
function expectBytes(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`byte mismatch\n${diffHint(expected, actual)}`);
  }
}

// --- the seeded runtime (the registered views through the engine) ------------

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // the probe card (type RichText = typeId 4, the standard rich-text type)
  await seedCard(s, { id: 4, name: "RichText", typeId: 2 });
  await seedCard(s, { id: 900, name: CARD_NAME, typeId: 4 });
  // the Image cardtype + the image01 card (the :new_image render target)
  await seedCard(s, { id: 5, name: "Image", typeId: 2 });
  await seedCard(s, { id: 901, name: "image01", typeId: 5 });
  // the type + codename vocabulary the permission walk reads (the account
  // probe's seed block)
  await seedCard(s, { id: 2, name: "Basic", typeId: 2 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the create-permission grant the perms:create views' gates read (the
  // account probe's *all+*create recipe, [[Anyone]] - the *all anchor FIRST,
  // then the rule card)
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 310, name: "*create", codename: "create", typeId: 14 });
  await seedCard(s, { id: 311, name: "Anyone", codename: "anyone" });
  await seedCard(s, {
    id: 312,
    name: "*all+*create",
    leftId: 10,
    rightId: 310,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 312, 311, "anyone");
  // the EDIT mod: the create_form dispatch's new-fields chain (new_fields,
  // content_formgroups, new_buttons) + the edit_inline dispatch + the framed
  // view machinery's help render
  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModTinymce },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  setDefaultModLoader(loader);
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  loader?.reset();
  storage?.close();
});

// --- section A: the oracle byte replay through the composition cores ---------

describe("card-mod-tinymce_editor harness probe: the chrome oracle replay", () => {
  const oracles = tinymceOracles();

  it("the harness captured the chrome oracle lines (live-verified)", () => {
    const bytesLines = oracles.filter((l) => l.kind === "view-bytes");
    expect(bytesLines.length).toBe(6);
    for (const l of bytesLines) {
      expect(
        l.liveCrossCheck ?? l.seamDeltas,
        `${l.scenario} carries its live cross-check or its seam-delta verification`,
      ).toBeDefined();
    }
  });

  it("replays nest_editor's absent-params arm byte-exact (the live capture's arm)", () => {
    const line = oracles.find((l) => l.scenario === "nest_editor_overlay_params_absent");
    expect(line).toBeDefined();
    const ported = tinymceProbeSurface.nestEditorChrome(oracleCtx(), "overlay");
    expectBytes(ported, line!.bytes!);
  });

  it("replays nest_editor's seeded-params arm byte-exact (the named params seam)", () => {
    const line = oracles.find((l) => l.scenario === "nest_editor_overlay_params_seeded");
    expect(line).toBeDefined();
    expect(line!.paramsSeam).toContain("tm_snippet_raw");
    const ported = tinymceProbeSurface.nestEditorChrome(oracleCtx(), "overlay", {
      tm_snippet_raw: SEEDED_SNIPPET,
      tinymce_id: SEEDED_TINYMCE_ID,
      tm_snippet_start: SEEDED_TM_SNIPPET_START,
      index: SEEDED_INDEX,
    });
    expectBytes(ported, line!.bytes!);
  });

  it("replays modal_nest_editor's both arms byte-exact", () => {
    const absent = oracles.find((l) => l.scenario === "modal_nest_editor_params_absent");
    const seeded = oracles.find((l) => l.scenario === "modal_nest_editor_params_seeded");
    expect(absent).toBeDefined();
    expect(seeded).toBeDefined();
    const portedAbsent = tinymceProbeSurface.nestEditorChrome(oracleCtx(), "modal");
    expectBytes(portedAbsent, absent!.bytes!);
    const portedSeeded = tinymceProbeSurface.nestEditorChrome(oracleCtx(), "modal", {
      tm_snippet_raw: SEEDED_SNIPPET,
      tinymce_id: SEEDED_TINYMCE_ID,
    });
    expectBytes(portedSeeded, seeded!.bytes!);
  });

  it("replays nest_image + modal_nest_image byte-exact around the engine seams", () => {
    const img = oracles.find((l) => l.scenario === "nest_image_overlay_params_absent");
    const modal = oracles.find((l) => l.scenario === "modal_nest_image_params_absent");
    expect(img).toBeDefined();
    expect(modal).toBeDefined();
    expect(img!.nestSeams).toEqual(["image01|view: new_image", "image01|view: core"]);
    const portedImg = tinymceProbeSurface.nestImageChrome(oracleCtx(), "overlay", "image01");
    expectBytes(portedImg, img!.bytes!);
    const portedModal = tinymceProbeSurface.nestImageChrome(oracleCtx(), "modal", "image01");
    expectBytes(portedModal, modal!.bytes!);
  });

  it("replays the nest_content contracts (both arms + the params seam)", () => {
    const known = oracles.find((l) => l.scenario === "nest_content_known_arm");
    expect(known).toBeDefined();
    expect(known!.vooHide).toEqual(["cancel_button"]);
    expect(known!.dispatch ?? "").toContain("edit_inline");
    const unknownAbsent = oracles.find(
      (l) => l.scenario === "nest_content_unknown_arm_params_absent",
    );
    expect(unknownAbsent).toBeDefined();
    expect(unknownAbsent!.vooHide).toEqual(["guide"]);
    expect(unknownAbsent!.vooShow).toEqual(["new_type_formgroup"]);
    expect(unknownAbsent!.buttonsView).toEqual("new_image_buttons");
    // the nil tinymce_id rides the hash; the tag renders VALUE-LESS
    expect(unknownAbsent!.success).toEqual({ tinymce_id: null });
    const unknownSeeded = oracles.find(
      (l) => l.scenario === "nest_content_unknown_arm_params_seeded",
    );
    expect(unknownSeeded!.success).toEqual({ tinymce_id: SEEDED_TINYMCE_ID });
  });

  it("replays the new_image success chain (the live-corrected nil-value contract)", () => {
    const absent = oracles.find((l) => l.scenario === "new_image_create_form");
    expect(absent).toBeDefined();
    expect(absent!.success).toEqual({
      tinymce_id: null,
      view: "new_image",
      type: "image",
      slot: { hide: "guide", type: "image", show: "preview_redirect" },
      id: "image02",
    });
    expect(absent!.autonameFact).toEqual({
      name: "image01",
      next: "image02",
      urlKey: "image02",
    });
    const seeded = oracles.find((l) => l.scenario === "new_image_create_form_params_seeded");
    expect(seeded!.success).toEqual({
      tinymce_id: SEEDED_TINYMCE_ID,
      view: "new_image",
      type: "image",
      slot: { hide: "guide", type: "image", show: "preview_redirect" },
      id: "image02",
    });
  });
});

// --- section B: the registered views through the seeded runtime --------------

describe("card-mod-tinymce_editor harness probe: the ported views through the engine", () => {
  it.each(["nest_editor", "modal_nest_editor"])("binds %s Apply to this request's editor and clears it on the next request", async (view) => {
    const params = historyRenderParamsFromWire({
      tinymce_id: 'editor-owned-"probe',
      tm_snippet_raw: "{{+Existing|view: name}}",
      tm_snippet_start: "17",
    });
    const html = await storage!.engine.render(CARD_NAME, view, params);
    expect(html).toContain('data-tinymce-id="editor-owned-&quot;probe"');
    expect(html).toContain('data-tm-snippet-start="17"');
    expect(html).toContain('data-tm-snippet-size="24"');
    const next = await storage!.engine.render(CARD_NAME, view);
    expect(next).not.toContain("data-tinymce-id");
    expect(next).not.toContain("data-tm-snippet-start");
  });

  it("renders :nest_editor through the engine - the chrome + a REAL rules-tab seam", async () => {
    const s = storage!;
    const html = await s.engine.render(CARD_NAME, "nest_editor");
    // the slot wrap config's class list + the chrome head
    expect(html).toContain("_overlay d0-card-overlay card nodblclick");
    expect(html).toContain(`<div class='_nest-editor'>`);
    expect(html).toContain("data-options-card=\"*all+by name\"");
    // the seam dispatched the ENGINE's real nest_rules render (the rules-tab
    // pane is not the placeholder: the snippet name is blank on this render,
    // so the PLACEHOLDER arm is the pinned one - the alert + the empty slot)
    expect(html).toContain("nest name required");
    expect(html).toContain(`<div class="card-slot"></div>`);
  });

  it("renders :modal_nest_editor through the engine - the literal <modal> element", async () => {
    const s = storage!;
    const html = await s.engine.render(CARD_NAME, "modal_nest_editor");
    expect(html).toContain(`class="card-slot modal_nest_editor-view`); // the slot wrap present
    expect(html).toContain("<modal><div class='_nest-editor'>");
    expect(html).toContain("Apply and Close");
    expect(html).toContain("\nCancel\n</a>");
  });

  it("renders :nest_image + :modal_nest_image through the engine - the tabs + real seams", async () => {
    const s = storage!;
    const html = await s.engine.render(CARD_NAME, "nest_image");
    expect(html).toContain(`class='nav nav-fill nav-tabs'`);
    expect(html).toContain(`Image`);
    expect(html).toContain(`{{image01|view: content; size: medium}}`);
    // the upload seam dispatched the engine's real new_image view
    expect(html).toContain(`name="success[view]"`);
    expect(html).toContain(`value="new_image"`);
    const modalHtml = await s.engine.render(CARD_NAME, "modal_nest_image");
    // view :modal_nest_image calls nest_image_editor :modal DIRECTLY - no
    // <modal> wrapper (the oracle bytes pin the bare chrome; the editor_mode
    // flips the footer copy + the dismiss target)
    expect(modalHtml).toContain(`<div class='_nest-editor'>`);
    expect(modalHtml).toContain("Apply and Close");
    expect(modalHtml).not.toContain("<modal>");
  });

  it("renders :new_image through the engine - the UPDATE-form shape for the stored probe card (Ruby create_form on a stored card: edit_card_<id> + _method=patch, action :create) + the live-pinned success tags", async () => {
    const s = storage!;
    const html = await s.engine.render("image01", "new_image");
    expect(html).toContain(`name="success[tinymce_id]"`);
    expect(html).toContain(`id="success_tinymce_id" autocomplete="off" />`);
    expect(html).toContain(`name="success[id]" id="success_id" value="image02"`);
    expect(html).toContain(`name="success[slot][show]" id="success_slot_show" value="preview_redirect"`);
    // the full create_form body rides the dispatch (new.rb:43-49): the form
    // tag (the STORED-card shape: edit_card_<id> + the _method patch spoof,
    // exactly the corpus favicon's new_image bytes at edit_card_294) + the
    // new-fields walk + the voo.buttons_view buttons
    expect(html).toContain(`<form class="card-form slotter" id="edit_card_901" action="/card/create"`);
    expect(html).toContain(`<input type="hidden" name="_method" value="patch" autocomplete="off" />`);
    expect(html).toContain("_update-history-pills"); // new_image_buttons
  });
});
