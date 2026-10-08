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
//    (an internal work log).
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
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

// A checkout of the upstream Ruby Decko source, supplied locally.
const ARCHIVE = process.env.DECKO_RUBY_SOURCE ?? "C:/localProjects/archive/decko-fork-study/decko";

/** The archive trees carry CRLF on some files; the shape assertions below
 *  are written against LF. */
function readRuby(relPath: string): string {
  return readFileSync(`${ARCHIVE}/${relPath}`, "utf8").replace(/\r\n/g, "\n");
}
/** The machine's standard raw capture: the ORACLE_RAW_DECK env channel wins
 *  (the same channel oracle-deck-inflection-census reads; submit-test-job
 *  --env), falling back to the RUNNING worktree's own tmp. The original
 *  constant pointed into the fama-remainder lane worktree; that worktree's
 *  corpus is gone (2026-10-03 standing net: existsSync true in one process,
 *  `unable to open database file` in the next — the tree was being removed
 *  under the run), so the corpus arm died with another lane's checkout.
 *  Every live worktree's tmp/raw-ground-truth carries the same capture
 *  (row 11745 verified identical); without one, the runIf below skips
 *  loudly by design. Union resolution (fold-11): close-71's env channel
 *  + fold-10's running-worktree default + the lazy open both carried. */
const CORPUS =
  process.env.ORACLE_RAW_DECK ??
  fileURLToPath(
    new URL("../../../tmp/raw-ground-truth/bench-corpus-raw.sqlite3", import.meta.url),
  );

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

describeOrSkipLoud(!(existsSync(ARCHIVE)), "tests/card/render/content-options-one-line-count-capture-state-pins.test.ts", "existsSync(ARCHIVE)")("MEMBER 2: the input-type catalogs in the Ruby sources", () => {
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

describeOrSkipLoud(!(existsSync(CORPUS)), "tests/card/render/content-options-one-line-count-capture-state-pins.test.ts", "existsSync(CORPUS)")("MEMBER 2: corpus row 11745 carries ONE item", () => {
  // vitest executes a describe body even when runIf is false (probe-proven
  // 2026-10-03: the body runs to collect names for the skip report), so the
  // corpus open MUST be lazy. It was collection-time (`const db = new
  // Database(...)` directly in this body), which failed the whole file
  // deterministically on every machine lineage once the corpus home worktree
  // () was deleted by the 2026-10-03 worktree
  // cleanup — the runIf guard could not protect a collection-time open.
  // Lazy open restores the guard's own intent: corpus absent -> suite skips.
  let db: InstanceType<typeof Database> | undefined;
  let row: {
    name: string | null;
    left_id: number;
    right_id: number;
    type_id: number;
    content: string;
  };
  let sameContent: { n: number };
  const loadCorpusRow = (): { row: typeof row; sameContent: typeof sameContent } => {
    if (db === undefined) {
      db = new Database(CORPUS, { readonly: true });
      row = db.prepare("SELECT * FROM cards WHERE id = 11745").get() as typeof row;
      sameContent = db
        .prepare("SELECT COUNT(*) AS n FROM cards WHERE content = ?")
        .get("overridden") as typeof sameContent;
    }
    return { row: row!, sameContent: sameContent! };
  };

  it("is the Pointer-typed `*input type+*right+*content options` rule", () => {
    const { row } = loadCorpusRow();
    expect(row).toBeDefined();
    expect(row.type_id).toBe(34843); // Pointer
    expect(row.content).toBe("overridden");
  });

  it("'overridden' is ONE item, so Ruby's count == 1 arm renders it, not '11 items'", () => {
    const { row } = loadCorpusRow();
    const items = row.content
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    expect(items).toEqual(["overridden"]);
    expect(items.length).toBe(1);
  });

  it("is the ONLY row in the corpus with that content (a one-off, not a list)", () => {
    const { sameContent } = loadCorpusRow();
    expect(sameContent.n).toBe(1);
  });
});
