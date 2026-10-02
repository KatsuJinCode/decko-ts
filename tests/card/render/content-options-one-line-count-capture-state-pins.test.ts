// content-options-one-line-count-capture-state-pins.test.ts -- the
// fama-remainder lane's MEMBER 2 pin: the `11 items` one-line count on
// `*input type+*right+*content options`.
//
// THE ASK was: "the oracle renders '11 items' -- the size of the Pointer
// input-type catalog; port input_type_content_options and derive the count
// (never hard-code 11)".  MEASURED: 11 is not the size of anything in the
// sources, and the number cannot be derived from this deck.  These pins
// record the measurement so the question is not re-derived from scratch.
//
// 1. THE ONLY INPUT-TYPE CATALOGS IN THE SOURCES (read from the archive;
//    the test reads them, it does not restate them):
//      mod/edit/set/type/pointer.rb:9-11
//        def input_type_content_options; %w[select radio autocomplete]; end
//      mod/edit/set/type/list.rb:1-3
//        def input_type_content_options; %w[multiselect checkbox list]; end
//      mod/edit/set/type/plain_text.rb:1-5 (inside `format :html`)
//        def input_type_content_options; ["text area", "text field", "ace editor"]; end
//      mod/list/set/all/supports_content_options.rb:1
//        basket[:list_input_options] = %w[radio checkbox select multiselect list autocomplete]
//    sizes 3, 3, 3 and 6.  None is 11; nothing else in the tree declares an
//    input-type catalog (grep for `input_type` across mod/list and mod/edit
//    returns only these plus the per-view `default_input_type` methods).
//
// 2. THE DISPATCH IS count-based, and count == 1 renders the ITEM NAME.
//      mod/list/set/abstract/01_list.rb:15-17   def count; item_strings.size; end
//      mod/list/set/abstract/01_list/html_views.rb:99-105
//        def one_line_content
//          if count == 1 then card.first_name else short_content end
//        end
//      mod/format/set/all/html/views.rb:92-100  short_content_items ->
//        "#{count} #{'item'.pluralize count}"
//    Corpus row 11745 (`*input type+*right+*content options`, type Pointer
//    34843) carries db_content "overridden" -- ONE item -- and is the only
//    row in the whole corpus with that content.  So the Ruby dispatch on
//    this deck renders `overridden`, which is what the engine renders.  The
//    oracle's `11 items` embeds capture-time content the corpus no longer
//    carries: the r22 receipt reached the same verdict independently
//    (tmp/wrong-goal-hunt/p22-rulebar-content-lane.md:137-158).
//
// 3. THE ARM IS CORPUS-PINNED 667 TIMES OVER.  Census this lane over every
//    stored List/Pointer bar in all 48 page-lane shards whose bar-right
//    carries a rendered one-line (719 rows):
//        count == 1  -> the item name (first_name)      667
//        count != 1  -> "N items"                           4
//        count == 1  -> "N items"  (the drift)             2   <- both rows are
//                                                                 card 11745
//    The 2 are this lane's two named entries: `*input type+*right`
//    (page-lane shard-000000, offset 52061) and `Pointer`
//    (page-lane shard-000029, offset 13724) -- the SAME card 11745, whose
//    bar the Pointer cardtype page also renders.  Every other stored
//    List/Pointer one-line obeys the count-based dispatch.
//
// CONCLUSION: a corpus/re-photography decision, not an engine seat.  No
// dispatch change closes it, and hand-pinning 11 would break the 667-row arm.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

const ARCHIVE = "C:/localProjects/archive/decko-fork-study/decko";

/** The archive trees carry CRLF on some files; the shape assertions below
 *  are written against LF. */
function readRuby(relPath: string): string {
  return readFileSync(`${ARCHIVE}/${relPath}`, "utf8").replace(/\r\n/g, "\n");
}
const CORPUS = "C:/localProjects/decko-ts-lane-fama-remainder/tmp/raw-ground-truth/bench-corpus-raw.sqlite3";

/** `%w[...]` / `["a", "b"]` catalog sizes straight out of the Ruby line. */
function catalogSize(rubyLine: string): number {
  const w = /%w\[([^\]]*)\]/.exec(rubyLine);
  if (w !== null) return w[1].split(/\s+/).filter((s) => s !== "").length;
  const arr = /\[([^\]]*)\]/.exec(rubyLine);
  if (arr !== null) return arr[1].split(",").map((s) => s.trim()).filter((s) => s !== "").length;
  throw new Error(`no catalog literal on this line: ${rubyLine}`);
}

const SOURCES: Array<{ file: string; match: RegExp }> = [
  { file: "mod/edit/set/type/pointer.rb", match: /%w\[select radio autocomplete\]/ },
  { file: "mod/edit/set/type/list.rb", match: /%w\[multiselect checkbox list\]/ },
  { file: "mod/edit/set/type/plain_text.rb", match: /\["text area", "text field", "ace editor"\]/ },
  { file: "mod/list/set/all/supports_content_options.rb", match: /%w\[radio checkbox select multiselect list autocomplete\]/ },
];

describe.runIf(existsSync(ARCHIVE))("MEMBER 2: the input-type catalogs in the Ruby sources", () => {
  it("none of them is 11, so '11 items' is not derivable from them", () => {
    const sizes: Record<string, number> = {};
    for (const { file, match } of SOURCES) {
      const text = readRuby(file);
      const line = text.split("\n").find((l) => match.test(l));
      expect(line, `${file} no longer carries its catalog literal`).toBeDefined();
      sizes[file] = catalogSize(line as string);
    }
    expect(sizes).toEqual({
      "mod/edit/set/type/pointer.rb": 3,
      "mod/edit/set/type/list.rb": 3,
      "mod/edit/set/type/plain_text.rb": 3,
      "mod/list/set/all/supports_content_options.rb": 6,
    });
    expect(Object.values(sizes)).not.toContain(11);
  });

  it("pointer's input_type_content_options is the three-item catalog", () => {
    const text = readRuby("mod/edit/set/type/pointer.rb");
    expect(text).toContain("def show_content_options?");
    expect(text).toContain("def show_input_type?");
    expect(text).toContain("def input_type_content_options");
    expect(text).toContain("%w[select radio autocomplete]");
  });

  it("the List/Pointer one-line dispatch is count-based with first_name at count==1", () => {
    const listMod = readRuby("mod/list/set/abstract/01_list.rb");
    expect(listMod).toMatch(/def count\s*\n\s*item_strings\.size\s*\nend/);
    const views = readRuby("mod/list/set/abstract/01_list/html_views.rb");
    expect(views).toMatch(/def one_line_content\s*\n\s*if count == 1\s*\n\s*card\.first_name\s*\n\s*else\s*\n\s*short_content\s*\n\s*end\s*\n\s*end/);
    const formatViews = readRuby("mod/format/set/all/html/views.rb");
    expect(formatViews).toContain("def short_content_items");
    expect(formatViews).toContain("\"#{count} #{'item'.pluralize count}\"");
  });
});

describe.runIf(existsSync(CORPUS))("MEMBER 2: corpus row 11745 carries ONE item", () => {
  const db = new Database(CORPUS, { readonly: true });
  const row = db.prepare("SELECT * FROM cards WHERE id = 11745").get() as {
    name: string | null;
    left_id: number;
    right_id: number;
    type_id: number;
    content: string;
  };
  const sameContent = db
    .prepare("SELECT COUNT(*) AS n FROM cards WHERE content = ?")
    .get("overridden") as { n: number };

  it("is the Pointer-typed `*input type+*right+*content options` rule", () => {
    expect(row).toBeDefined();
    expect(row.type_id).toBe(34843); // Pointer
    expect(row.content).toBe("overridden");
  });

  it("'overridden' is ONE item, so Ruby's count == 1 arm renders it, not '11 items'", () => {
    const items = row.content
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    expect(items).toEqual(["overridden"]);
    expect(items.length).toBe(1);
  });

  it("is the ONLY row in the corpus with that content (a one-off, not a list)", () => {
    expect(sameContent.n).toBe(1);
  });
});
