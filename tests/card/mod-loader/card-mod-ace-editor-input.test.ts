// The Ace editor input arm (card-mod-ace_editor-0.20.0 set/all/ace_editor.rb
// + card-mod-edit-0.20.0 set/all/editor.rb's view :input dispatch) — the E10
// surface, pinned at the integrated tip.
//
// E10's scoreboard claim ("not started — the input-type renderer the ace
// arm needs does not exist") is STALE at this tip: card-mod-edit.ts's
// inputView (set/all/editor.rb:32-38 view :input, registered on all/editor)
// implements the try-chain's input_method arms — ace_editor_input
// (card-mod-ace_editor set/all/ace_editor.rb:9-13: `text_area :content,
// rows: 5, class: "d0-card-content ace-editor-textarea", "data-ace-mode" =>
// ace_mode`, the bootstrap form-control append and the Rails generated
// name/id), text_field_input (editor.rb:51-53), text_area_input
// (editor.rb:46-49) and the rich_text default (editor.rb:38-44 -> the
// tinymce arm, pinned by the edit-forms suites). The type -> input_type
// overrides ride the MRO table (card-mod-format set/type/{html,markdown,
// json,number,phrase,uri,plain_text}.rb; card-mod-edit.ts
// TYPE_FORMAT_INPUT_TYPE).
//
// The HTML arm's bytes are pinned against the CAPTURED oracle
// (fixtures/captured/edit-views.json, the live decko-0.20.0 app's edit_nests
// chain: the nested HTML card's editor textarea) — byte-exact, including
// the h-escaped body and the leading "\n" (Rails TagHelper
// PRE_CONTENT_STRINGS[:textarea], tag_helper.rb:44). The other arms'
// bytes are gem-source-derived (rendered-unpinned: the corpus captures
// carry no markdown/json/number/phrase/uri/plain_text editor chain) — each
// cited to its Ruby lines.
//
// NAMED REMAINDER (E10 stays partial): the *input-RULE arm
// (editor.rb:9-11 input_type_from_rule — the *input type rule read), the
// hidden_input arm (:55-57), the input_defined_by_card branch (:18-22), the
// admin input-type menu basket (ace_editor.rb:1 — no TS consumer) and the
// JS asset pipeline (ace_editor.rb:2 + assets/script + public/ace — the P6
// surface) are not ported here.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";

/** The captured oracle textarea: the ace editor's bytes for an HTML-typed
 *  card inside the edit_nests chain (the live app rendered THIS card's
 *  editor through the same view :input dispatch). */
const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/edit-views.json", import.meta.url)),
    "utf8",
  ),
) as { targets: Record<string, { views: Record<string, Record<string, string>> }> };

const EDIT_NESTS = FIXTURE.targets["deck_level"].views.bot.edit_nests;
const ACE_OPEN_TAG = '<textarea rows="5" class="d0-card-content ace-editor-textarea';
const oracleStart = EDIT_NESTS.indexOf(ACE_OPEN_TAG);
const oracleEnd = EDIT_NESTS.indexOf("</textarea>", oracleStart) + "</textarea>".length;
const ORACLE_TEXTAREA = EDIT_NESTS.slice(oracleStart, oracleEnd);

/** The oracle's escaped body between the open tag and </textarea> —
 *  a leading "\n" (PRE_CONTENT_STRINGS) then the h-escaped source. */
const ORACLE_BODY = ORACLE_TEXTAREA.slice(
  ORACLE_TEXTAREA.indexOf(">\n") + 1,
  ORACLE_TEXTAREA.length - "</textarea>".length,
);

/** The card SOURCE the oracle card carried: the un-escape of the body
 *  (html_escape's inverse; the guard below pins that no raw & rode in the
 *  capture, so the four entity replacements are the exact inverse). */
const ORACLE_SOURCE = ORACLE_BODY.slice(1)
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&apos;/g, "'");

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

const TYPE_IDS: Record<string, number> = {
  html: 51,
  markdown: 52,
  json: 53,
  number: 54,
  phrase: 55,
  uri: 56,
  plain_text: 57,
};

beforeAll(async () => {
  const s = await createRenderTestStorage();
  storage = s;
  // the cardtype card the type rows hang off
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  // the 7 input-relevant type cards; the codename IS the typeCode
  // (render.ts:1038 typeCode = codename-registry lookup of typeId)
  const TYPE_NAMES: Record<string, string> = {
    html: "HTML",
    markdown: "Markdown",
    json: "JSON",
    number: "Number",
    phrase: "Phrase",
    uri: "URI",
    plain_text: "Plain Text",
  };
  for (const [code, id] of Object.entries(TYPE_IDS)) {
    await seedCard(s, { id, name: TYPE_NAMES[code] ?? code, codename: code, typeId: 9 });
  }
  // the oracle card: an HTML-typed card whose source is the capture's body
  await seedCard(s, {
    id: 101,
    name: "Ace Oracle Card",
    typeId: TYPE_IDS["html"],
    dbContent: ORACLE_SOURCE,
  });
  // the gem-derived arms' cards
  await seedCard(s, { id: 102, name: "Ace Markdown Card", typeId: TYPE_IDS["markdown"], dbContent: "# heading" });
  await seedCard(s, { id: 103, name: "Ace Json Card", typeId: TYPE_IDS["json"], dbContent: '{"a":1}' });
  await seedCard(s, { id: 104, name: "Number Card", typeId: TYPE_IDS["number"], dbContent: "42" });
  await seedCard(s, { id: 105, name: "Phrase Card", typeId: TYPE_IDS["phrase"], dbContent: "a phrase" });
  await seedCard(s, { id: 106, name: "Uri Card", typeId: TYPE_IDS["uri"], dbContent: "https://example.com" });
  await seedCard(s, { id: 107, name: "Plain Text Card", typeId: TYPE_IDS["plain_text"], dbContent: "plain body" });
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
  // NOTE: the loader is NOT installed here — the WITHOUT-mod A/B below must
  // run before any install (the registration replaces the process-global
  // flat HTML_VIEWS entry, card-mod-comment.ts:68-80's captured-base
  // pattern). The WITH describe's own beforeAll installs it.
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("E10 view :input — the ace arm at the tip", () => {
  it("the oracle body carries no raw ampersand (the un-escape inverse is exact)", () => {
    expect(ORACLE_BODY).not.toContain("&amp;");
  });

  it("WITHOUT the card-mod-edit mod, :input is an unsupported view (the gem owns view :input, all/editor.rb:32)", async () => {
    // runs FIRST — before any installInto leaks the registration into the
    // process-global flat table
    const fresh = await createRenderTestStorage();
    try {
      await seedCard(fresh, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
      await seedCard(fresh, { id: 51, name: "HTML", codename: "html", typeId: 9 });
      await seedCard(fresh, { id: 101, name: "Solo Html", typeId: 51, dbContent: "<p>x</p>" });
      fresh.fetcher.installNameEnvironment();
      await fresh.fetcher.codenames.ensureLoaded();
      await expect(fresh.engine.render("Solo Html", "input")).rejects.toThrow(
        UnsupportedViewError,
      );
    } finally {
      fresh.close();
    }
  });
});

describe("E10 view :input — WITH the mod (the loader installs here, after the WITHOUT arm)", () => {
  beforeAll(async () => {
    loader = new ModLoader([{ manifest: cardModEdit }]);
    loader.load();
    await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
  });

  it("an HTML-typed card's :input byte-matches the captured oracle textarea", async () => {
    const html = await storage!.engine.render("Ace Oracle Card", "input");
    expect(html).toBe(ORACLE_TEXTAREA);
  });

  it("the markdown arm rides data-ace-mode markdown (card-mod-markdown set/type/markdown.rb:20-24)", async () => {
    const html = await storage!.engine.render("Ace Markdown Card", "input");
    expect(html).toBe(
      '<textarea rows="5" class="d0-card-content ace-editor-textarea form-control"' +
        ' data-ace-mode="markdown" name="card[content]" id="card_content">\n# heading</textarea>',
    );
  });

  it("the json arm rides data-ace-mode json (card-mod-format set/type/json.rb:34-40; the body h-escapes)", async () => {
    const html = await storage!.engine.render("Ace Json Card", "input");
    expect(html).toBe(
      '<textarea rows="5" class="d0-card-content ace-editor-textarea form-control"' +
        ' data-ace-mode="json" name="card[content]" id="card_content">\n{&quot;a&quot;:1}</textarea>',
    );
  });

  it("number/phrase/uri take the text_field arm (editor.rb:51-53)", async () => {
    for (const [name, content] of [
      ["Number Card", "42"],
      ["Phrase Card", "a phrase"],
      ["Uri Card", "https://example.com"],
    ] as const) {
      const html = await storage!.engine.render(name, "input");
      expect(html).toBe(
        '<input class="d0-card-content form-control" placeholder="" type="text"' +
          ` value="${content}" name="card[content]" id="card_content" />`,
      );
    }
  });

  it("plain_text takes the text_area arm with the type code (editor.rb:46-49)", async () => {
    const html = await storage!.engine.render("Plain Text Card", "input");
    expect(html).toBe(
      '<textarea rows="5" class="d0-card-content form-control" data-card-type-code="plain_text"' +
        ' name="card[content]" id="card_content">\nplain body</textarea>',
    );
  });
});
