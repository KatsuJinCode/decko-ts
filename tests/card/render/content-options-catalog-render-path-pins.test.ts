// content-options-catalog-render-path-pins.test.ts -- pin for the two render
// view entries of `*input type+*right+*content options:render:content` /
// `:render:open`.
//
// MECHANISM (verified against the installed gems): the Ruby card
// `*input type+*right+*content options` carries the set-module
// content override card-mod-list-0.20.0
// set/self/input_type/right/content_options.rb:3-5
//   `def content; basket[:list_input_options].to_pointer_content; end`
// and the basket assembles to ELEVEN items at mod load time:
//   card-mod-list-0.20.0 set/all/supports_content_options.rb:1   (seed, 6)
//   card-mod-edit-0.20.0 set/all/editor.rb:1-2                   (+2 -> 8)
//   card-mod-ace_editor-0.20.0 set/all/ace_editor.rb:1           (+1 -> 9)
//   card-mod-date-0.20.0 set/all/calendar.rb:1                   (+1 -> 10)
//   card-mod-tinymce_editor-0.20.0 set/all/tinymce_editor.rb:2   (+1 -> 11)
// Ruby's set-module `def content` shadows db_content for EVERY caller
// (the singleton-class include chain), so the pointer-list item walk
// (standard_pointer_core -> listing_list) renders the catalog, not the
// stored row: the deck's stored row is the placeholder "overridden" while
// the rendered card carries the 11-item catalog.
//
// THE GAP THIS PIN CLOSED: the TS render path's pointer-list arm reads
// `fmt.card.dbContent` directly (views.ts coreViewBase), and the
// render-path ContentOverrideRegistry had no registration for this card --
// so the engine rendered ONE item ("overridden") where the catalog holds
// eleven. The record path already resolves the catalog through
// resolveSetModuleContent (SELF_MODULE_CHAINS "input_type+right+content_options"),
// which is why the record entry passed while the render entries failed.
//
// The render-path registry answers undefined for the card unless
// registered; the port registers listInputOptionsContent() under the card's
// key-form self setPath and the pointer-list arm consults the registry
// before dbContent.
//
// BOUNDARY (do not widen): the bar-right one-line count for this card
// ("overridden" vs "11 items") is pinned by its own suite
// (content-options-one-line-count-capture-state-pins.test.ts). This file's
// engine change is scoped to the pointer-list ITEM SOURCE only;
// rule-bar-right's one-line walk stays on dbContent.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listInputOptionsContent } from "../../../src/card/set-module-content-overrides.js";
import {
  resolveContentOverride,
  type ContentFn,
} from "../../../src/card/render/content-overrides.js";
import type { RenderFormat } from "../../../src/card/render/format.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const GEMS = "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems";

/** The gem trees carry CRLF on some files; the shape assertions below are
 *  written against LF. */
function readGem(relPath: string): string {
  return readFileSync(`${GEMS}/${relPath}`, "utf8").replace(/\r\n/g, "\n");
}

/** The basket assembly, file by file. Each entry: the gem-relative set file
 *  and the exact basket line the file carries. */
const BASKET_SOURCES: Array<{ file: string; line: string }> = [
  {
    file: "card-mod-list-0.20.0/set/all/supports_content_options.rb",
    line: `basket[:list_input_options] = %w[radio checkbox select multiselect list autocomplete]`,
  },
  {
    file: "card-mod-edit-0.20.0/set/all/editor.rb",
    line: `basket[:list_input_options] << "text area"`,
  },
  {
    file: "card-mod-edit-0.20.0/set/all/editor.rb",
    line: `basket[:list_input_options] << "text field"`,
  },
  {
    file: "card-mod-ace_editor-0.20.0/set/all/ace_editor.rb",
    line: `basket[:list_input_options] << "ace editor"`,
  },
  {
    file: "card-mod-date-0.20.0/set/all/calendar.rb",
    line: `basket[:list_input_options] << "calendar"`,
  },
  {
    file: "card-mod-tinymce_editor-0.20.0/set/all/tinymce_editor.rb",
    line: `basket[:list_input_options] << "tinymce editor"`,
  },
];

const CATALOG_OVERRIDE_FILE =
  "card-mod-list-0.20.0/set/self/input_type/right/content_options.rb";

describeOrSkipLoud(!(existsSync(`${GEMS}/card-mod-list-0.20.0`)), "tests/card/render/content-options-catalog-render-path-pins.test.ts", "existsSync(`${GEMS}/card-mod-list-0.20.0`)")(
  "the gem-side 11-item catalog (basket assembly)",
  () => {
    it("every basket op the mods declare is present, and they assemble to 11", () => {
      const items: string[] = [];
      for (const { file, line } of BASKET_SOURCES) {
        const text = readGem(file);
        expect(
          text.split("\n").map((l) => l.trim()).includes(line),
          `${file} no longer carries: ${line}`,
        ).toBe(true);
        if (line.includes("= %w[")) {
          const w = /%w\[([^\]]*)\]/.exec(line);
          expect(w, `no %w[] literal on: ${line}`).not.toBeNull();
          items.push(...(w as RegExpExecArray)[1].split(" ").filter((s) => s !== ""));
        } else {
          items.push(line.slice(line.indexOf(`"`) + 1, line.lastIndexOf(`"`)));
        }
      }
      expect(items).toHaveLength(11);
    });

    it("the consuming set module overrides content with the basket pointer content", () => {
      const text = readGem(CATALOG_OVERRIDE_FILE);
      expect(text).toContain("include_set Abstract::List");
      expect(text).toMatch(/def content\s*\n\s*basket\[:list_input_options\]\.to_pointer_content\s*\n\s*end/);
    });

    it("the TS catalog function emits the same 11 items in the captured order", () => {
      expect(listInputOptionsContent()).toBe(
        "radio\ncheckbox\nselect\nmultiselect\nlist\nautocomplete\ntext area\ntext field\nace editor\ncalendar\ntinymce editor",
      );
    });
  },
);

/** A minimal render-format stub for the registry walk: cardBelongsToSet's
 *  self arm reads card.name.key; the right/type arms read isCompound /
 *  rightName.key / typeName. The catalog card is Pointer-typed, compound,
 *  right *content options. The KEY is the decko singularized form
 *  ("content options" -> "content_option" -- the same inflection the
 *  bootstrap_self keys document). */
function catalogCardFormat(): RenderFormat {
  return {
    card: {
      key: "*input_type+*right+*content_option",
      name: {
        key: "*input_type+*right+*content_option",
        isCompound: true,
        isStar: false,
        isRStar: false,
        rightName: { key: "*content_option" },
      },
      typeName: "Pointer",
      typeCode: "pointer",
    },
  } as unknown as RenderFormat;
}

describe("the render-path content override registry", () => {
  it("answers the catalog for the catalog card's self setPath", () => {
    // RED (pre-port): no registration -> undefined -> the pointer-list arm
    // falls through to dbContent ("overridden", one item). GREEN (post-port):
    // the built-in registration under the key-form setPath answers the
    // catalog bytes (the same answer resolveSetModuleContent gives the
    // record path).
    const override = resolveContentOverride(catalogCardFormat());
    expect(override).toBe(listInputOptionsContent());
  });

  it("still answers undefined for pointer cards without any matching set", () => {
    const plain: RenderFormat = {
      card: {
        key: "some_home_page",
        name: {
          key: "some_home_page",
          isCompound: false,
          isStar: false,
          isRStar: false,
        },
        typeName: "Pointer",
        typeCode: "pointer",
      },
    } as unknown as RenderFormat;
    expect(resolveContentOverride(plain)).toBeUndefined();
  });
});

/** ContentFn contract shape check for the registration: the
 *  fn receives the format and returns final bytes (ignoring it is fine --
 *  the catalog is card-independent, exactly like the Ruby body which reads
 *  only the basket). */
describe("the catalog ContentFn", () => {
  it("is card-independent final bytes", () => {
    const fn: ContentFn = () => listInputOptionsContent();
    expect(fn(catalogCardFormat())).toBe(listInputOptionsContent());
    expect(fn(plainPointerFormat())).toBe(listInputOptionsContent());
  });

  function plainPointerFormat(): RenderFormat {
    return {
      card: {
        key: "whatever",
        name: { key: "whatever", isCompound: false, isStar: false, isRStar: false },
        typeName: "Pointer",
        typeCode: "pointer",
      },
    } as unknown as RenderFormat;
  }
});
