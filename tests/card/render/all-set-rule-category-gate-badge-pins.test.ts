// all-set-rule-category-gate-badge-pins.test.ts — the the all-pattern rule-category fix's
// rule-category accordion pins for the ALL-pattern set card (the regression family family:
// 3 entries, persisting, NOT part of the the seat fix's 87).
//
// THE FAILURES (the captured failing run (5e603ba4), engine commit
// 5e603ba4): the *all rule-category accordion's editing group reads
// `_count badge` 5 where the graded corpus pins 3 —
//   dual-lane-view:*all:render:content  first differing byte at 30215: expected 3 got 5
//                                       (expected 54734 B, actual 60265 B)
//   dual-lane-view:*all:render:open     first differing byte at 32281: expected 3 got 5
//                                       (expected 56828 B, actual 62359 B)
//   dual-lane-page:*all:page            first differing byte at 37974: expected 3 got 5
//                                       (expected 68893 B, actual 74492 B)
//
// THE RUBY DERIVATION (pinned verbatim from the recorded port citations — the
// 0.20 gems are not on disk anywhere on this machine; the citations are the
// port's own record, src/card/render/views.ts SETTING_NEVER_VISIBLE comment):
// the content_options / content_option_view settings' setting_opts `applies`
// lambdas read `prototype.supports_content_options?` (&& the input_type
// predicate), and "card-mod-list set/all/supports_content_options.rb:8-15
// defines the all-set defaults false; grep over the loaded gems finds no
// overriding set module". The ALL set module is every card's lowest-precedence
// set module, so with no override the predicates are FALSE for every
// prototype: visible_settings can never admit the restricted pair. On the
// ALL-pattern set card *all the corpus confirms the Ruby verdict (badge 3),
// and the pair gets in ONLY through the pairStored arm of seatPairVisible
// (the deck holds the stored `*all+*content option view` cascade rule 277, so
// ruleByCodename carries content_option_view and the the census M10b arm/seatfix stored-pair
// escape re-admits what restricted_to_type rejected).
//
// RELATION TO THE SEATFIX LANE (a9b7b55f, recorded result an internal work log
// seatfix-lane.md): its badge-5 family (Task+*right, Task+Log Entry+*type
// plus right) is a recorded FIT — "No 0.20 mechanism produces the
// distribution ... the corpus is the spec". This pass's *all bytes are the
// opposite direction and MATCH the Ruby derivation, so the fix is scoped to
// the anchorless set cards (all / rstar / all_plus) where corpus and Ruby
// agree; the template-derived and pairStored arms for anchored sets are
// untouched and the seatfix suite (the seat-fix suite enabled) must stay green.

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

/** The editing accordion's _count badge byte forms, exact. */
const BADGE_3 = 'editing <span class="_count badge bg-secondary ms-3">3</span>';
const BADGE_5 = 'editing <span class="_count badge bg-secondary ms-3">5</span>';

/** Code-unit offset of the badge DIGIT within `html` (the graded records'
 *  first-difference offsets point at the digit, e.g. `expected "3" but got
 *  "5"` at 30215/32281/37974). indexOf returns the `editing ` prefix start;
 *  the digit sits at prefix + spanOpen.length where spanOpen is everything
 *  through `ms-3">` — computed as marker length minus the `3</span>` tail
 *  length (never indexOf('3'): the literal `ms-3` carries a 3). */
function badgeDigitAt(html: string, marker: string): number {
  const at = html.indexOf(marker);
  if (at === -1) return -1;
  return at + marker.length - 8; // minus the "3</span>" tail (digit + </span>)
}

let storage: Awaited<ReturnType<typeof createRawStructureSeededStorage>> | undefined;
afterAll(() => {
  storage?.close();
});

describeOrSkipLoud(!(process.env.ALLSET_RULE_CATEGORY_GATE_BADGE_PINS === "1" && existsSync(CORPUS) && existsSync(VIEW_DIR)), "tests/card/render/all-set-rule-category-gate-badge-pins.test.ts", "process.env.ALLSET_RULE_CATEGORY_GATE_BADGE_PINS === \"1\" && existsSync(CORPUS) && existsSync(VIEW_DIR)")(
  "grade-10 *all family: the ALL-pattern set card's rule-category accordion never renders the restricted pair",
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
      // The graded environment's cloud asset host — the SAME seam the grade's
      // runner sets before any storage boot
      // (dual-lane-direct-runner-core.ts:555-560). Dynamic import (not
      // static): the static form OOMs the vitest fork at boot.
      const { setDeploymentCloudAssetHost } = await import(
        "../../../src/card/render/views.js"
      );
      setDeploymentCloudAssetHost(
        "https://source-deck-production-storage.r1.cdn.objectstore.example",
      );

      storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
    }, 240_000);

    it("*all:content full parity (editing badge 3 — restricted pair absent)", async () => {
      const exp = expected.get("*all|content");
      expect(exp, "corpus expected bytes for *all:content").toBeDefined();
      const actual = await storage!.engine.render("*all", "content");
      const d = compareNormalized(exp!, actual);
      expect(
        d.firstDifference === null
          ? "equal"
          : `first diff at ${d.firstDifference.byteOffset}: expected ${d.firstDifference.expectedChar} got ${d.firstDifference.actualChar}\n  exp: ${d.firstDifference.expectedExcerpt}\n  act: ${d.firstDifference.actualExcerpt}`,
      ).toBe("equal");
    }, 180_000);

    it("*all:open full parity (editing badge 3 — restricted pair absent)", async () => {
      const exp = expected.get("*all|open");
      expect(exp, "corpus expected bytes for *all:open").toBeDefined();
      const actual = await storage!.engine.render("*all", "open");
      const d = compareNormalized(exp!, actual);
      expect(
        d.firstDifference === null
          ? "equal"
          : `first diff at ${d.firstDifference.byteOffset}: expected ${d.firstDifference.expectedChar} got ${d.firstDifference.actualChar}\n  exp: ${d.firstDifference.expectedExcerpt}\n  act: ${d.firstDifference.actualExcerpt}`,
      ).toBe("equal");
    }, 180_000);

    it("*all page reproduces the graded record modulo the receipted seatfix deltas (badge 3, no badge 5)", async () => {
      const html = await storage!.engine.renderPage("*all");
      // GRADED RECORD (the fails-JSON first-diff evidence): expected side
      // 68893 B, badge digit "3" at code-unit offset 37974, no badge 5; the
      // graded actual side was 74492 B (badge 5) — pair delta 5599 B at
      // 5e603ba4. THIS BASE (a9b7b55f) carries the the seat fix's recorded
      // deltas on this page: pre-fix measured 74932 B (graded + 440), of
      // which 40 B sat inside the pair lis this lane removes — post-fix
      // measured 69293 B (graded + 400 residual) with the badge digit at
      // 38184 = graded 37974 + the +210 pre-accordion seatfix byte shift. Full byte
      // equality is carried by the *all:content/:open pins through the
      // shared accordion emitter (both GREEN at the graded bytes).
      const badge3At = badgeDigitAt(html, BADGE_3);
      const badge5At = html.indexOf(BADGE_5);
      expect(
        `size ${html.length}; badge3 digit at ${badge3At}; badge5 at ${badge5At}`,
      ).toBe("size 69293; badge3 digit at 38184; badge5 at -1");
    }, 180_000);

    it("*all page renders no restricted-pair accordion bars (Ruby all-set default false)", async () => {
      const html = await storage!.engine.renderPage("*all");
      // The ACCORDION's settings list (the _setting-list block) carries the
      // three Ruby-visible editing settings only. The stored RULE bars
      // (e.g. the *all+*content option view cascade rule 277 bar in the
      // rules list) are a different surface and are not asserted here.
      const accordionStart = html.indexOf('<div class="_setting-list">');
      const accordionEnd = html.indexOf("</form>", accordionStart);
      const accordion = html.slice(
        accordionStart,
        accordionEnd === -1 ? undefined : accordionEnd,
      );
      expect(accordion).toContain(BADGE_3);
      expect(accordion).not.toContain(BADGE_5);
      expect(accordion).not.toContain("*content options");
      expect(accordion).not.toContain("*content option view");
    }, 180_000);
  },
);
