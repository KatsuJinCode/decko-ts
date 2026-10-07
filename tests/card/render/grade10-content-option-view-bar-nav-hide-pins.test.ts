// grade10-content-option-view-bar-nav-hide-pins.test.ts — the seatfix lane's
// hide-family pins (grade-10 regression family 2 of 3: 12 entries).
//
// THE REGRESSION. prepareBar's rule-bar hide branch (bar_view.rb:11 `voo.hide
// :bar_nav unless existing_rule_card`, views.ts) fires on every virtual rule
// bar whose rule row the restored bench deck lacks — and the deck lacks ALL
// the live capture's rule rows for these sets (zero rows for every family
// set, bench DB queried). The graded corpus (pre-era1658 vintage) pins the
// *content option view rule bar with NO hide key at all in every one of its
// 66 appearances across all 48 view shards (own census
// tmp/seatfix-instruments/, tally `*content option view | hide=[NONE] 66x`),
// while its sibling *content options stays state-dependent (40x bar_nav,
// 20x one_line_content, 6x none). The 12 grade-10 regression entries fail
// with `,"hide":["bar_nav"]` inserted on exactly that *content option view
// bar (Collection+*right:content first difference offset 45993, -11 bytes).
//
// THE SEAT. `*content option view` (codename content_option_view) is the one
// setting whose bars the corpus pins hide-less universally, so the correction
// is setting-scoped and corpus-universal — the same class as the
// SETTING_RESTRICTED_TO_TYPE map — not an entry-name fit. The sibling
// *content options keeps the existing-rule verdict shape (its corpus hide
// distribution is mixed, i.e. state-dependent, and Task+*right's corpus pins
// hide:["bar_nav"] ON it).
//
// Full-parity pins (equal = the grade's own judgment) on four of the twelve
// entries spanning the three host shapes, plus the carrier control: the
// Democracy+*referred_to_by one-line hide (["one_line_content","bar_middle"])
// rides a different seat and must not move.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

const CORPUS =
  process.env.ORACLE_RAW_DECK ??
  path.join(REPO_ROOT, "tmp", "raw-ground-truth", "bench-corpus-raw.sqlite3");
const VIEW_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");

import { compareNormalized } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

/** The hide-family entries pinned full-parity (4 of the 12; the probe
 *  measures all 12). Each was graded failing with the bar_nav insertion on
 *  the *content option view bar as the FIRST difference. */
const HIDE_PINS: Array<[string, string]> = [
  ["Collection+*right", "content"],
  ["Collection+*right", "open"],
  ["*script+*right", "content"],
  ["Exhibit+Item+*type plus right", "content"],
];

let storage: Awaited<ReturnType<typeof createRawStructureSeededStorage>> | undefined;
afterAll(() => {
  storage?.close();
});

describeOrSkipLoud(!(process.env.SEATFIX_GRADE10_PINS === "1" && existsSync(CORPUS) && existsSync(VIEW_DIR)), "tests/card/render/grade10-content-option-view-bar-nav-hide-pins.test.ts", "process.env.SEATFIX_GRADE10_PINS === \"1\" && existsSync(CORPUS) && existsSync(VIEW_DIR)")(
  "grade-10 hide family: the *content option view rule bar carries no bar_nav hide",
  () => {
    const expected = new Map<string, string>();
    beforeAll(async () => {
      for (const f of readdirSync(VIEW_DIR).sort()) {
        if (!f.endsWith(".jsonl")) continue;
        for (const l of readFileSync(path.join(VIEW_DIR, f), "utf8").split("\n")) {
          if (!l) continue;
          let e;
          try { e = JSON.parse(l); } catch { continue; }
          for (const [v, html] of Object.entries(e.views)) {
            if (typeof html === "string") expected.set(e.name + "|" + v, html);
          }
        }
      }
      const everyLiveId = (new Database(RAW_CORPUS_DB, { readonly: true })
        .prepare("SELECT id FROM cards WHERE trash = 0")
        .all() as Array<{ id: number }>).map((r) => r.id);
      // The graded environment's cloud asset host — the SAME seam the grade's runner
      // sets before any storage boot (dual-lane-direct-runner-core.ts:555-560);
      // the corpus expectations carry the DO-host attachment prefix. Dynamic
      // import (not static): the static form OOMs the vitest fork at boot
      // (the full engine graph lands in the test module before the seeder).
      const { setDeploymentCloudAssetHost } = await import(
        "../../../src/card/render/views.js"
      );
      setDeploymentCloudAssetHost(
        "https://example.com-production-storage.fra1.cdn.digitaloceanspaces.com",
      );

      storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
    }, 240_000);

    for (const [name, view] of HIDE_PINS) {
      it(`${name}:${view} full parity (no bar_nav hide on *content option view)`, async () => {
        const exp = expected.get(name + "|" + view);
        expect(exp, `corpus expected bytes for ${name}:${view}`).toBeDefined();
        const actual = await storage!.engine.render(name, view);
        const d = compareNormalized(exp!, actual);
        expect(
          d.firstDifference === null
            ? "equal"
            : `first diff at ${d.firstDifference.byteOffset}: expected ${d.firstDifference.expectedChar} got ${d.firstDifference.actualChar}\n  exp: ${d.firstDifference.expectedExcerpt}\n  act: ${d.firstDifference.actualExcerpt}`,
        ).toBe("equal");
      }, 180_000);
    }
  },
);
