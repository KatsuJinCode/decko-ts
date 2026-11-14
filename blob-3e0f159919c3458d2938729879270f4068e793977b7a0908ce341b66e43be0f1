// The :new_in_modal create form at the addresses the enumeration audit's
// gap names (docs/runs/enumeration-audit-2026-10-25.md, A1 row
// `:new_in_modal`):
//
//   /Oracle_Probe_Wanted/new_in_modal        (list-mod-loader.json, the List
//                                             probe's box view anchor)
//   /Second_Item/new_in_modal                (list-mod-loader.json, the
//                                             Pointer probe's box view)
//   /radio/new_in_modal                      (search-list-views.json, the
//                                             input-type rule pointer's box)
//   /image01/new_in_modal?card[type]=image   (tinymce-editor-views.json, the
//                                             nest-image unknown-link)
//
// The capture bytes are the spec, in two layers:
//   - The ANCHORS: each capture records the unknown-link anchor line whose
//     href IS the audit's address. Those lines are pinned byte-for-byte
//     below, read from the captures (the audit's evidence, seated).
//   - The RESPONSE composition: edit-views.json records the full
//     :new_in_modal response for the unsaved new-card surface
//     (new_card/views/bot/new_in_modal: the modal shell, the modal menu's
//     close anchor, and the /card/create form shell), and
//     tinymce-editor-views.json records the :new_image create form for the
//     named new card image01, whose hidden card[name] input
//     (`value="image01"`) is the byte shape a NAMED new card's form
//     carries. No capture records the :new_in_modal response at an
//     unknown-named mark, so those renders are pinned as COMPOSITION: the
//     captured modal shell lines, the captured form shell, the captured
//     hidden-name shape with each address's mark seated, and (for the
//     typed address) the preset-type arm the E13 leg of the edit-views
//     suite pins (card-mod-edit-type-for-new-card.test.ts: a requested
//     type stays preset - the hidden card[type_id], no visible type
//     select). This is the same honest split the rules lane recorded
//     (composition where the capture did not render, bytes where it did).
//
// The port already carried the :new_in_modal viewFn (card-mod-edit.ts,
// new.rb:8-17, unknown: true) and the byte-exact pins at the existing
// targets (card-mod-edit-views.test.ts); what this file adds is the proof
// that the view answers AT the captured unknown-named addresses - the
// surface following the recorded anchors actually opens.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import cardModMarkdown from "../../../src/card/mod-loader/mods/card-mod-markdown.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const LIST_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/list-mod-loader.json", import.meta.url)),
    "utf8",
  ),
) as { rendered: Record<string, string> };

const SEARCH_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/search-list-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  targets: Record<string, { views: Record<string, Record<string, { bytes?: string } | string>> }>;
};

const TINYMCE_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/tinymce-editor-views.json", import.meta.url)),
    "utf8",
  ),
) as { rendered: Record<string, string> };

const EDIT_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/edit-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  new_card: { views: Record<string, Record<string, string>> };
};

/** The captured unknown-link anchor inside one recorded render: the
 *  `<a href='...'>` line whose href is one of the audit's addresses. */
function capturedAnchor(html: string): string {
  const start = html.indexOf('<a rel="nofollow" class="unknown-link slotter"');
  const end = html.indexOf(">", start);
  if (start === -1 || end === -1) throw new Error("capture carries no unknown-link anchor");
  return html.slice(start, end + 1);
}

/** The recorded render string of one search-list view entry: this capture
 *  wraps its render strings in a bytes field. */
function searchRenderString(entry: { bytes?: string } | string): string {
  return typeof entry === "string" ? entry : (entry.bytes ?? "");
}

/** The modal shell lines the edit-views capture records on EVERY
 *  :new_in_modal response (new_card/views/bot/new_in_modal), byte-for-byte.
 *  The modal-dialog line is modal-lg: new.rb:8-17's wrap size arrow
 *  (-> :large). */
function capturedModalShellLines(): string[] {
  const modal = EDIT_CAPTURE.new_card.views.bot.new_in_modal;
  const lines = [
    "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>",
    "<div class='modal-dialog modal-dialog-centered modal-lg'>",
    "<div class='modal-content'>",
    "<div class='modal-header'>",
    '<div class="modal-menu _modal-menu ms-auto"><a class="_close-modal btn-close" data-bs-dismiss="modal" href=""><i class="notranslate material-icons">close</i></a>',
    "<div class='modal-body'>",
  ];
  for (const line of lines) {
    if (!modal.includes(line)) throw new Error(`the capture's modal shell lacks: ${line}`);
  }
  return lines;
}

/** The captured /card/create form shell (the new-card form, no patch
 *  spoof: the create surface never carries _method). */
function capturedFormShell(): string {
  const modal = EDIT_CAPTURE.new_card.views.bot.new_in_modal;
  const marker = '<form class="card-form slotter" id="new_card"';
  const start = modal.indexOf(marker);
  const end = modal.indexOf(">", start);
  if (start === -1 || end === -1) throw new Error("the capture's new-card form shell is missing");
  return modal.slice(start, end + 1);
}

/** The hidden card[name] input shape a NAMED new card's form carries,
 *  byte-for-byte from the tinymce capture's :new_image render for the
 *  named new card image01. */
function capturedNamedHiddenName(name: string): string {
  return `<input type="hidden" name="card[name]" id="card_name" value="${name}" autocomplete="off" />`;
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;

/** The Image cardtype's row id in this deck (the create form's preset
 *  arm carries the TYPE ID: card-mod-edit-type-for-new-card's E13
 *  semantics - a requested type stays preset as the hidden card[type_id]). */
const IMAGE_TYPE_ID = 20;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // the actor stand-in and the cardtypes the four addresses' forms name
  // (RichText is the derived default, Image is the ?card[type]=image
  // override's type). The bot codename is the STORED spelling the
  // permission machinery matches (read-rules.ts DECKOBOT_CODENAME
  // "decko_bot", the edit-views suite's note verbatim): without it the
  // create-permission gate denies and the view renders the denial, not
  // the modal.
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: IMAGE_TYPE_ID, name: "Image", codename: "image" });

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
    { manifest: cardModHistory },
    { manifest: cardModComment },
  ]);
  loader.load();
  botEngine = new RenderEngine(new FetchEngine(s.counting));
  botEngine.viewer = { signedIn: true, actorId: 1 };
  botEngine.pageSession = { signedIn: true, actorId: 1 };
  botEngine.modLoader = loader;
  // the unknown-named marks are the surface: the absent-card create arm
  botEngine.renderAbsentCards = true;
  await loader.installInto(modEngineHost(botEngine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The three untyped addresses, as the anchors record them. */
const UNTYPED_ADDRESSES = ["Oracle Probe Wanted", "Second Item", "radio"] as const;

describe("the :new_in_modal create form at the captured addresses", () => {
  it("the captures carry the audit's four anchors, byte-for-byte as recorded", () => {
    // list-mod-loader: the List probe's box view carries the
    // Oracle_Probe_Wanted anchor, the Pointer probe's the Second_Item one
    expect(capturedAnchor(LIST_CAPTURE.rendered["Oracle List Probe#view_list"]!)).toBe(
      '<a rel="nofollow" class="unknown-link slotter" href="/Oracle_Probe_Wanted/new_in_modal" data-remote="true">',
    );
    expect(capturedAnchor(LIST_CAPTURE.rendered["Oracle Pointer Probe#view_list"]!)).toBe(
      '<a rel="nofollow" class="unknown-link slotter" href="/Second_Item/new_in_modal" data-remote="true">',
    );
    // search-list-views: the input-type rule pointer's box carries the
    // radio anchor (this capture wraps its render strings in a bytes
    // field)
    expect(
      capturedAnchor(
        searchRenderString(SEARCH_CAPTURE.targets.input_type_rule_pointer.views.bot.view_list!),
      ),
    ).toBe(
      '<a rel="nofollow" class="unknown-link slotter" href="/radio/new_in_modal" data-remote="true">',
    );
    // tinymce-editor-views: the nest-image unknown-link carries the typed
    // address (card[type]=image, the wire-encoded bracket form)
    expect(capturedAnchor(TINYMCE_CAPTURE.rendered["Oracle TinyMCE Editor Probe#nest_image"]!)).toBe(
      '<a rel="nofollow" class="unknown-link slotter" href="/image01/new_in_modal?card%5Btype%5D=image" data-remote="true">',
    );
  });

  for (const mark of UNTYPED_ADDRESSES) {
    it(`/${mark.replace(/ /g, "_")}/new_in_modal answers the captured modal shell around the captured form shell, with the mark seated as the new card's name`, async () => {
      const html = await botEngine!.render(mark, "new_in_modal", {
        focalRoot: true,
        newCard: { typeId: 2, typePreset: false },
      });
      for (const line of capturedModalShellLines()) {
        expect(html).toContain(line);
      }
      expect(html).toContain(capturedFormShell());
      // the named-new-card hidden name input, the tinymce capture's byte
      // shape, with this address's mark as the value
      expect(html).toContain(capturedNamedHiddenName(mark));
      // the derived default type stays selectable (the untyped address's
      // arm: no card[type] request override)
      expect(html).toMatch(/<select\b[^>]*name=["']card\[type\]["']/);
    });
  }

  it("/image01/new_in_modal?card[type]=image answers the modal shell with the mark seated and the requested type preset", async () => {
    const html = await botEngine!.render("image01", "new_in_modal", {
      focalRoot: true,
      newCard: { typeId: IMAGE_TYPE_ID, typePreset: true },
    });
    for (const line of capturedModalShellLines()) {
      expect(html).toContain(line);
    }
    expect(html).toContain(capturedFormShell());
    expect(html).toContain(capturedNamedHiddenName("image01"));
    // the requested type stays preset (E13's typed arm): the hidden
    // card[type_id] carries the Image type's id and no type select renders
    expect(html).toMatch(new RegExp(`name=["']card\\[type_id\\]["'][^>]*value=["']${IMAGE_TYPE_ID}["']`));
    expect(html).not.toMatch(/<select\b[^>]*name=["']card\[type\]["']/);
  });
});
