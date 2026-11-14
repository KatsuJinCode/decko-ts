// tests/card/render/card-470-as-in-layout-main-nest-nil-parity-pin.test.ts
// Card 470 "AsIn Layout" raises `NoMethodError: undefined method 'rendered' for
// nil` on the engine's main-nest path — and that raise is the ORACLE'S, not an
// engine defect. This is the pin that says so against the real deck copy.
//
// THE SHAPE. Card 470 is the only captured card that is BOTH Html-typed
// (type_id 50) AND has `{{_main}}` in its own 469-byte dbContent — its body is
// a whole layout template:
//
//     <!DOCTYPE HTML> ... <div id="primary">{{_main}}</div> ...
//
// RUBY RAISES, WITH NO GUARD. prototype/lib/card/format/nesting/main.rb:12
//
//     def main_nest opts
//       wrap_main do
//         main.rendered || main_nest_render(opts)   # <- no nil check
//       end
//     end
//
// `main` is nil whenever it falls off the end of
// prototype/lib/card/format/nesting/subformat.rb:18-24
//
//     def main
//       if main? then self
//       elsif !root? then parent.main
//       end                       # <- implicit nil
//     end
//
// i.e. a format that is NOT flagged main AND is the root — the html format
// OVERRIDES `main?` as `!@main.nil?` (card-mod-format html_format.rb:11-13),
// NOT the base `depth.zero?` (subformat.rb:35-37). A bare
// `card.format.render(:content)` never calls `main!`, so `main` is nil and
// main.rb:12 evaluates `.rendered` on nil. `||` cannot save it: the nil is on
// the RECEIVER, not the right operand.
//
// THE ORACLE AGREES, ON BOTH VIEWS OF BOTH LANES.
//   tmp/raw-ground-truth/expected-v2/view-lane/recapture-raw-shard-000000.jsonl
//     entry 470  views.content -> CAPTURE_ERROR: NoMethodError: undefined method `rendered' for nil
//     entry 470  views.open    -> CAPTURE_ERROR: NoMethodError: undefined method `rendered' for nil
//   tmp/raw-ground-truth/expected-v2/page-lane/recapture-raw-shard-000000.jsonl
//     entry 470  page_html     -> 29,032 bytes, no CAPTURE_ERROR
//
// So the SAME card raises in the view lane and renders in the page lane, and
// that is not a contradiction: the page lane seats the root format's `main!`
// (process_layout.rb:19) so `main` is non-nil there, and the card's `{{_main}}`
// splices the main view's bytes. This pin asserts the DISCRIMINATION — raise on
// the view lane, bytes on the page lane — which is the property a "fix the
// nil crash" change would have destroyed.
//
// WHY THIS TEST AND NOT layout-template-nest-mode.test.ts:289-329. That test
// pins the same raise on a SYNTHETIC body (CARD_22747_BODY, a different card)
// against a seeded fixture. This one runs the actual card 470 as it exists in
// the deck mirror copy, so a regression in the corpus-shaped path (type_id,
// name inflection `a_in_layout`, the real template body) is caught here and
// not only in the synthetic control.
//
// The engine side of the raise, which this pins end to end:
//   src/card/render/format.ts:2985-2989  `get main()` returns undefined
//   src/card/render/format.ts:3013-3024  `mainNest()` checks it and throws
//   src/card/render/errors.ts:136-140     the message, byte for byte
//
// GATE: CARD_470_ASIN_LAYOUT_PROBE=1 — env-opt-in replay. A clone without
// tmp/raw-ground-truth/ skips on the data reason (same shape as the fix-d6 arm).
// The slice is seeded small (card 470 + its codename targets + the 25
// capture-restored override ids the seeder requires) rather than with all
// a production-size deck: 37 s instead of the full-corpus arm's quoted 170 s.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const VIEW_ORACLE = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane", "recapture-raw-shard-000000.jsonl",
);
const OVERRIDE_TABLE = path.join(REPO_ROOT, "tests", "card", "render", "raw-corpus-override-capture-restored-rows.json");

const REQUESTED = process.env.CARD_470_ASIN_LAYOUT_PROBE === "1";

/** The two view-lane oracle sentinels for card 470, read from the frozen shard. */
function oracleViewLane(): { content: string; open: string } {
  const line = readFileSync(VIEW_ORACLE, "utf8").split("\n").filter(Boolean).find((l) => l.includes('"id":470,'));
  expect(line, "no view-lane oracle row for id 470").toBeDefined();
  return (JSON.parse(line as string) as { views: { content: string; open: string } }).views;
}

describe("card 470 AsIn Layout: the main-nest nil raise IS the oracle", () => {
  it(
    "raises the captured NoMethodError on both view-lane views and renders bytes on the page lane",
    { timeout: 170_000 },
    async (ctx) => {
      if (!REQUESTED) {
        skipLoud(ctx, "tests/card/render/card-470-as-in-layout-main-nest-nil-parity-pin.test.ts", "REQUESTED");
        return;
      }
      expect(existsSync(RAW_CORPUS_DB), `raw corpus copy missing: ${RAW_CORPUS_DB}`).toBe(true);

      const oracle = oracleViewLane();
      const SENTINEL = "CAPTURE_ERROR: NoMethodError: undefined method `rendered' for nil";
      // The oracle must still say what this pin asserts, or the pin is stale.
      expect(oracle.content).toBe(SENTINEL);
      expect(oracle.open).toBe(SENTINEL);

      const live = new Database(RAW_CORPUS_DB, { readonly: true });
      const row = live.prepare("SELECT id, name, type_id, length(content) AS len FROM cards WHERE id = 470").get() as
        | { id: number; name: string; type_id: number; len: number }
        | undefined;
      expect(row, "card 470 absent from the deck mirror copy").toBeDefined();
      expect(row?.name).toBe("AsIn Layout");

      // Card 470 is only interesting because it is Html-typed AND nests {{_main}}.
      const nestsMain = /\{\{_main/.test(
        (live.prepare("SELECT content FROM cards WHERE id = 470").get() as { content: string }).content,
      );
      expect(nestsMain, "card 470 no longer nests {{_main}} — the subject of this pin changed").toBe(true);

      const seedIds = new Set<number>([470]);
      for (const codename of ["*head", "*navbox", "*sidebar", "*version", "*alerts", "*foot", "*logo", "*read", "*all"]) {
        const hit = live.prepare("SELECT id FROM cards WHERE codename = ? AND trash = 0 LIMIT 1").get(codename) as
          | { id: number }
          | undefined;
        if (hit !== undefined) seedIds.add(hit.id);
      }
      live.close();
      // The seeder refuses to run when the capture-restored override table names
      // a card the closure skipped (raw-corpus-seeding.ts:506-510).
      for (const oc of (JSON.parse(readFileSync(OVERRIDE_TABLE, "utf8")) as { cards: Array<{ id: number }> }).cards) {
        seedIds.add(oc.id);
      }

      const storage = await createRawStructureSeededStorage(seedIds);
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon([...seedIds]);

      try {
        // VIEW LANE — both views, both raise, both byte-identical to the oracle.
        for (const view of ["content", "open"] as const) {
          let caught: unknown;
          try {
            await storage.engine.render("AsIn Layout", view);
          } catch (err) {
            caught = err;
          }
          expect(caught, `view :${view} did not raise — the nil main format is no longer raising`).toBeInstanceOf(Error);
          const err = caught as Error;
          expect(err.name, `view :${view} raised the wrong error class`).toBe("NoMethodError");
          // Ruby's own backtick-apostrophe spelling; compared against the oracle
          // sentinel with its "CAPTURE_ERROR: " prefix stripped, not hand-typed.
          expect(err.message, `view :${view} message drifted from the oracle`).toBe(
            oracle[view].replace("CAPTURE_ERROR: NoMethodError: ", ""),
          );
        }

        // PAGE LANE — same card, and it must NOT raise. This is the half that
        // says the raise above is scoped, not the card being unrenderable.
        const pageHtml = await storage.engine.renderPage("AsIn Layout");
        expect(pageHtml.length).toBeGreaterThan(0);
        expect(pageHtml).not.toContain("CAPTURE_ERROR");
      } finally {
        storage.close();
      }
    },
  );
});
