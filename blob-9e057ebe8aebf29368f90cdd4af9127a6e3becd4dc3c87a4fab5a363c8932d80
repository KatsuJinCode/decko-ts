// Page-parity pins for the two named perm residuals:
//
//   1. "Anonymous+*account" — the standing over-deny the perm-allow replay
//      hard-assert block fails on alone since an earlier pass (recorded signature
//      exp 17603 / act 14299, first differing byte at 8200 = the nested
//      Anonymous+*account+*email labeled slot the oracle renders allowed
//      with its mailto content).
//   2. "signup alert email+*from" — the perm-allow-2 triage residual
//      (denied spans 1 act vs 2 exp): the engine renders a quiet denial for
//      the *from rule's FIRST POINTER ITEM (the Anonymous card, corpus id
//      15, stored read_rule_id 6568 = *all+*read "Anyone") where the oracle
//      renders the full item bar.
//
// RED at base bf2ac46 (both pages byte-differ), GREEN only when both pages
// render byte-identical to the frozen yardstick (expected-v2 page lane,
// normalizeSlotIds-normalized — the same shape as
// perm-allow-overdeny-corpus-replay.test.ts's hard-assert block, narrowed
// to these two pages so the gate stays a targeted few-page render rather
// than the 17-page sweep).
//
// Evidence pairs (exp/act html) are written to tmp/p22-perm-overdeny/ every
// run so a RED run carries its own attribution bytes.
//
// RUN (machine-local raw corpus):
//   set PERM_OVERDENY_PAGE_PARITY=1&& npx vitest run
//     tests/card/render/perm-overdeny-page-parity.test.ts
//     --no-file-parallelism
//
// The verdict-state attribution probe (report-only, no asserts) lives in
// tools/probes/perm-overdeny-attribution-probe.test.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";
import {
  CORPUS_PRESENT,
  OUT_DIR,
  PAGE_LANE_DIR,
  PAGES,
  SHARDS_PRESENT,
  loadYardstick,
  seedRawCorpusStorage,
} from "./perm-overdeny-page-fixtures.js";

const PIN_REQUESTED = process.env.PERM_OVERDENY_PAGE_PARITY === "1";

describe("p22 perm-overdeny page parity (the lane's two named residual pages)", () => {
  it(
    "renders Anonymous+*account and signup alert email+*from byte-identical to the yardstick",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!PIN_REQUESTED) {
        skipLoud(ctx, "tests/card/render/perm-overdeny-page-parity.test.ts", "PIN_REQUESTED");
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
          console.error(
            `P22-PERMOVER ${name}: exp ${diff.expectedCodeUnits} / act ${diff.actualCodeUnits} ` +
              `firstDiff ${diff.firstDifference?.codeUnitOffset ?? "none"} ` +
              `expDenied ${(normalizeSlotIds(expected).match(/class="denied"/g) ?? []).length} / ` +
              `actDenied ${(normalizeSlotIds(actual).match(/class="denied"/g) ?? []).length}`,
          );
        }
      } finally {
        storage.close();
      }
      expect(failures, failures.join("\n")).toEqual([]);
    },
  );
});
