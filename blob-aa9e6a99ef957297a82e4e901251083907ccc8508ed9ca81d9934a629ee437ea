// Register entry 32 (card-mod-tinymce_editor): the gem's declared view
// surface, measured, and the set-path fold shown to lose nothing.
//
// card-mod-tinymce_editor-0.20.0 is nine set files plus one lib file
// (lib/card/reference/nest_parser.rb). It declares ELEVEN views across six
// format blocks, in five of the nine set files; the other four
// (link_editor/link_parser.rb, nest_editor/nest_editor_options.rb,
// nest_editor/nest_editor_tabs.rb, self/tiny_mce.rb) declare none, and two
// more (all/reference_editor.rb, all/tinymce_editor.rb) declare none either
// - they carry helper methods and basket pushes.
//
// That is the whole of the register's remaining hold on this entry ("the
// set-path fold (4 of 9)"): the port registers four set PATHS because five
// of the gem's nine files fold into them. This suite measures why the fold
// is lossless rather than taking the count on faith - every view Ruby
// declares is registered, under the same format key, with the same option
// words, and every set file the port does NOT register declares zero views.
//
// Ground truth: the committed script
// tests/card/mod-loader/oracle-capture-tinymce-declarations.rb reads the
// `format :x do` and `view :name, <options>` lines out of all nine gem set
// files; the measured result is committed as
// tests/card/mod-loader/fixtures/tinymce-declarations.json.
//
// Per-view BODY parity is NOT claimed here: it rests on the mod file's own
// oracle pins (card-mod-tinymce_editor.test.ts), as the register says.
// What is pinned here is that the set of registrations matches the gem.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModTinymceEditor from "../../../src/card/mod-loader/mods/card-mod-tinymce_editor.js";

interface DeclarationFile {
  file: string;
  formats: { line: number; name: string }[];
  views: { line: number; name: string; format: string | null; options: string }[];
}

const DECLARED: DeclarationFile[] = JSON.parse(
  readFileSync(new URL("fixtures/tinymce-declarations.json", import.meta.url), "utf8"),
);

/** The port's registrations as "<formatKey> <name> <option words>", sorted. */
const portViews = (): string[] => {
  const out: string[] = [];
  for (const m of cardModTinymceEditor.setModules!) {
    for (const [formatKey, block] of Object.entries(m.formats ?? {})) {
      for (const v of block?.views ?? []) {
        const config = (v.config ?? {}) as Record<string, unknown>;
        const words = Object.keys(config).sort().join(",");
        out.push(`${formatKey} ${v.view}${words === "" ? "" : ` ${words}`}`);
      }
    }
  }
  return out.sort();
};

describe("tinymce register entry 32: the registered views match the gem's declarations", () => {
  it("the gem declares eleven views in five of its nine set files - measured", () => {
    expect(DECLARED).toHaveLength(9);
    expect(DECLARED.flatMap((f) => f.views)).toHaveLength(11);
    expect(DECLARED.filter((f) => f.views.length > 0).map((f) => f.file)).toEqual([
      "all/reference_editor/link_editor.rb",
      "all/reference_editor/nest_editor.rb",
      "all/reference_editor/nest_image.rb",
    ]);
  });

  it("the four files the port does not register as patterns declare zero views", () => {
    // This is the fold's whole justification: reference_editor.rb and
    // all/tinymce_editor.rb carry helper methods and basket pushes only;
    // link_parser.rb, nest_editor_options.rb and nest_editor_tabs.rb are
    // classes/option tables. self/tiny_mce.rb is a raw_help_text only.
    const noViews = DECLARED.filter((f) => f.views.length === 0).map((f) => f.file).sort();
    expect(noViews).toEqual([
      "all/reference_editor.rb",
      "all/reference_editor/link_editor/link_parser.rb",
      "all/reference_editor/nest_editor/nest_editor_options.rb",
      "all/reference_editor/nest_editor/nest_editor_tabs.rb",
      "all/tinymce_editor.rb",
      "self/tiny_mce.rb",
    ]);
  });

  it("the eleven view registrations match the gem's declarations name, format key and option words", () => {
    // The census reports each declaration's option WORDS (the top-level
    // `word:` tokens of the argument list, with `wrap:` dropped - the port's
    // config schema carries only the three scalar knobs and the wrap HASH
    // rides the viewFn, the mod file's own note).
    const gemRows = DECLARED.flatMap((f) =>
      f.views.map((v) => `${v.format} ${v.name}${v.options === "" ? "" : ` ${v.options}`}`),
    ).sort();
    expect(portViews()).toEqual(gemRows);
  });

  it("the two js-format views sit on nest_image, the only file with a `format :js` block", () => {
    const jsGem = DECLARED.flatMap((f) => f.views.filter((v) => v.format === "js").map((v) => v.name)).sort();
    expect(jsGem).toEqual(["change_create_to_update", "open_nest_editor"]);
    const nestImage = cardModTinymceEditor.setModules!.find(
      (m) => m.setPath === "all/reference_editor/nest_image",
    )!;
    expect(nestImage.formats?.js?.views!.map((v) => v.view).sort()).toEqual(jsGem);
    for (const m of cardModTinymceEditor.setModules!) {
      if (m.setPath === "all/reference_editor/nest_image") continue;
      expect(m.formats?.js).toBeUndefined();
    }
  });

  it("the gem's option words are exactly cache/unknown/perms - no fourth knob", () => {
    const knobs = new Set(
      DECLARED.flatMap((f) => f.views.flatMap((v) => (v.options === "" ? [] : v.options.split(",")))),
    );
    expect([...knobs].sort()).toEqual(["cache", "perms", "unknown"]);
  });
});