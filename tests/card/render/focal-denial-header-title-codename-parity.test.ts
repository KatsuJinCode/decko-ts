// focal-denial-header-title-codename-parity.test.ts — the FOCAL (loud)
// denial frame's header title renders through the card's TITLE VIEW, so the
// self-set codename overrides apply under denial exactly as Ruby's frame
// chain applies them.
//
// MECHANISM (gem source, C:/localProjects/archive/decko-fork-study/decko/):
//
//   mod/format/set/all/html/error.rb:191-197
//       def loud_denial
//         voo.hide :menu
//         frame do
//           [wrap_with(:h1, t(:format_sorry)),
//            wrap_with(:div, loud_denial_message)]
//         end
//       end
//   frame (html/frame.rb:15-17) -> standard_frame (:19-23) -> with_frame
//   slot=true, header=frame_header (frame.rb:19-29) and
//
//       def frame_header          # frame.rb:31-33
//         _render_header
//       end
//
//   — the HEADER is the card's :header view, whose title is the card's
//   :title view (the readable header build, engine views.ts:4289, renders
//   `fmt.renderView("title")`). The SELF-set title override fires INSIDE
//   that view: mod/search/set/self/recent.rb:4-7
//       view :title do
//         voo.title ||= "Recent Changes"
//         super()
//       end
//   (the same shape at set/self/search.rb:39-42 and
//   card-mod-account set/self/signin.rb). The :title views are perms:none
//   (card-mod-format set/all/title.rb:22-24; engine view-perms.ts:101-102),
//   so the title renders DESPITE the read denial.
//
// THE DEFECT. RenderFormat#mainLoudDenialHtml (src/card/render/format.ts)
// hand-constructed the denial header's title span from `card.name` —
// `h(name)` twice — so the override table (views.ts:242-245
// SELF_SET_TITLE_OVERRIDES, keyed on fmt.card.record.codename) could never
// apply under denial. The engine rendered `*recent` where Ruby rendered
// "Recent Changes": the *recent:page solo probe at this lane's base
// measured delta -14 (2 x ("Recent Changes" 14B) - 2 x ("*recent" 7B),
// attribute + content), one region, the h1 title span.
//
// THE FIX. The denial header's title span is produced by
// `fmt.renderView("title")` — the same one line the readable header uses.
// For every card WITHOUT a codename override this is byte-identical to the
// old hand build: titleNoLinkView emits
// `<span class="card-title" title="${h(name)}">${wrappedTitleInner(h(name))}</span>`
// and wrappedTitleInner's `/\s*\+\s*/` join equals the old `.split("+")`
// join wherever no oracle title puts whitespace next to a joint (the census
// at format.ts:3670-3676: 145,258 of 145,260 captured card-title spans
// byte-equal; the 2 exceptions are the html_safe explicit-title arm, not
// joint-related). The second page below is the no-override control: a
// read-denied card WITHOUT a codename must keep its own name — it is one of
// p22-perm-overdeny-page-parity's byte-pinned pages, so a full-byte pin here
// also holds this fix's no-movement direction on a second denial frame.
//
// INSTRUMENT NOTE. This pin is CORPUS-based (the p22 pattern) because the
// loud-denial main render cannot be driven from a minimal seeded fixture:
// the read verdict state it renders under is page-lane-prepared
// (page.ts:259 ensurePermissionVerdicts + the prepare cascade), and six
// unit-fixture attempts (the-69-wave1-refill2 lane, 2026-10-03) could not
// reproduce the denial-frame surface without the full corpus deck. The
// RED/GREEN instrument recorded alongside it is the solo byte probe of
// *recent:page: FAIL -14 with the pre-fix header build (file-overwrite
// revert, no git), PASS byte-identical with the fix.
//
// RUN (machine-local raw corpus; one 47k-card seed + two page renders):
//   set DENIAL_HEADER_TITLE_PARITY=1&& npx vitest run
//     tests/card/render/focal-denial-header-title-codename-parity.test.ts
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env
// gate unset, the block skips so ordinary suite runs are unaffected.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB } from "./raw-corpus-seeding.js";
import {
  CORPUS_PRESENT,
  PAGE_LANE_DIR,
  REPO_ROOT,
  SHARDS_PRESENT,
  loadYardstick,
  seedRawCorpusStorage,
} from "./perm-overdeny-page-fixtures.js";

const OUT_DIR = path.join(REPO_ROOT, "tmp", "denial-header-title-parity");

/** *recent: the codename-override denial entry (this pin's fix surface).
 *  Anonymous+*account: the read-denied NO-codename control (a p22
 *  byte-pinned page, so full byte parity also pins no-movement). */
const PAGES = ["*recent", "Anonymous+*account"];

const PIN_REQUESTED = process.env.DENIAL_HEADER_TITLE_PARITY === "1";

describe("the loud denial frame's header title renders through the title view (frame.rb:31-33)", () => {
  it(
    "renders *recent and Anonymous+*account byte-identical to the yardstick",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!PIN_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      const yardstick = await loadYardstick(new Set(PAGES));
      const storage = await seedRawCorpusStorage();
      const failures: string[] = [];
      try {
        for (const name of PAGES) {
          const oracle = yardstick.get(name);
          expect(oracle, `no page-lane yardstick entry for ${name}`).toBeDefined();
          const expected = oracle?.page_html ?? "";
          const actual = await storage.engine.renderPage(name);
          const safe = name.replace(/[^A-Za-z0-9]+/g, "_");
          writeFileSync(path.join(OUT_DIR, `${safe}.exp.html`), expected);
          writeFileSync(path.join(OUT_DIR, `${safe}.act.html`), actual);
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          if (!diff.equal) {
            failures.push(
              `${name}: engine page must equal the yardstick page ` +
                `(exp ${diff.expectedCodeUnits} / act ${diff.actualCodeUnits} code units` +
                `${diff.firstDifference ? `, first diff at ${diff.firstDifference.codeUnitOffset}` : ""}: ` +
                `${diff.firstDifference?.expectedExcerpt ?? ""} VS ${diff.firstDifference?.actualExcerpt ?? ""})`,
            );
          }
        }
      } finally {
        storage.close();
      }
      expect(failures, failures.join("\n")).toEqual([]);
    },
  );
});
