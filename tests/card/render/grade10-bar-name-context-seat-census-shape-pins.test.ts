// grade10-bar-name-context-seat-census-shape-pins.test.ts — the seatfix lane's
// name_context-family pins (grade-10 regression family 1 of 3: 71 entries).
//
// THE REGRESSION. The census-M1 bar-slot root-context seat (3afa8750, gated to
// pointer/list item bars by the relnames lane 89faf7b3) seats the root card's
// part-filtered context on EVERY pointer-item bar whose name shares ANY part
// with the view-lane root. The graded view-lane capture (pre-era1658 vintage,
// view digest 08c5a287…) pins name_context on only 5 entries' item bars in the
// whole corpus (12 slots: Guns:open, Morgan+Vacations+Pages:open,
// democracy+tags:open, Wikirate:open, Work Week:open) and pins ctx-LESS on
// every other pointer-item bar — 2,535 of them (own census,
// tmp/seatfix-instruments/). The share-any-part gate over-fires: 71 grade-10
// regression entries fail with `,"name_context":"<ctx>"` inserted exactly
// where the corpus has `}` (e.g. Casey Morgan+Pages:open offset
// 18417).
//
// THE CORPUS'S OWN DISTRIBUTION IS NOT DERIVABLE FROM KEY GEOMETRY ALONE — it
// is warm-cache request history (the relnames lane receipted the same class).
// The corpus distribution that IS derivable, measured over every bar-view
// pointer-item slot in all 48 view shards (2,547 rows,
// tmp/seatfix-instruments/seatfix-extends-or-rstar-predicate-test.mjs):
//   ctx present  ⟺ the item EXTENDS a single-part root (gun ⊂ gun-rifle,
//                  wikirate ⊂ wikirate-intro_to_the_project,
//                  work_week ⊂ work_week-anon_exchange_01)
//                OR the item's shared prefix with the root diverges into a
//                  rule part (democracy+*referred_to_by under democracy+tag)
//   ctx absent   ⟺ otherwise (Casey Morgan+video under
//                  Casey Morgan+Pages: shares part 1 only, divergent
//                  part is not a rule name; Rights under Rights+copyleft+tags:
//                  item is a prefix of the root; mod: format+*script under
//                  *all+*script: no shared prefix)
//   FP on passing entries 0; FP on the 71 regression entries 0; the only
//   corpus disagreements are 3 already-failing Vacations bars and 2
//   already-failing bootstrap-skin bars (named in the seatfix receipt).
//
// These pins hold BOTH directions on the graded corpus bytes: the 71-class
// entries render ctx-less EQUAL (RED pre-fix: the ctx insertion is the first
// difference), and the three PASSING carriers stay byte-EQUAL (RED pre-fix:
// already green — they pin the fix's blast radius, not the regression).
// democracy+tags:open / Wikirate:open / Work Week:open were that capture's
// firing carriers.
//
// 2026-10-06: the corpus of record (the recapture on the graded deck)
// carries name_context on none of these item bars, nor on any other
// view-lane pointer-item bar, and the seat had no Ruby grounding (the 0.20
// accordion :open chain adds no name context). The seat is removed; every
// pin below is now a full-parity ctx-less pin against the staged corpus.

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

/** The 71-class pins: each was graded failing at this tip with the ctx
 *  insertion as the FIRST difference (grade10 5e603ba4-full-fails.json).
 *  Full-parity, not window pins: equal is the grade's own judgment. */
const CTX_LESS_PINS: Array<[string, string]> = [
  ["Casey Morgan+Pages", "open"],
  ["Martial Nonviolence+Pages", "open"],
  ["Artificial Intelligence+Replacement+Documents", "open"],
  ["*all+*script", "open"],
];

/** The older capture's firing carriers. The corpus of record (2026-10-06
 *  recapture on the graded deck) renders their item bars ctx-less too, and
 *  the fitted seat that served them is removed; they stay as full-parity
 *  pins. Wikirate:open is dropped: its corpus-of-record row is a capture
 *  error (the oracle app's unconfigured file bucket). */
const CARRIER_PINS: Array<[string, string]> = [
  ["democracy+tags", "open"],
  ["Work Week", "open"],
  ["Guns", "open"],
];

let storage: Awaited<ReturnType<typeof createRawStructureSeededStorage>> | undefined;
afterAll(() => {
  storage?.close();
});

describeOrSkipLoud(!(process.env.SEATFIX_GRADE10_PINS === "1" && existsSync(CORPUS) && existsSync(VIEW_DIR)), "tests/card/render/grade10-bar-name-context-seat-census-shape-pins.test.ts", "process.env.SEATFIX_GRADE10_PINS === \"1\" && existsSync(CORPUS) && existsSync(VIEW_DIR)")(
  "grade-10 name_context family: the bar-seat seats only the corpus's extending/rule-divergent item bars",
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

    for (const [name, view] of CTX_LESS_PINS) {
      it(`ctx-less on ${name}:${view} (full parity with the graded bytes)`, async () => {
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

    for (const [name, view] of CARRIER_PINS) {
      it(`former carrier, now ctx-less: ${name}:${view} (full parity)`, async () => {
        const exp = expected.get(name + "|" + view);
        expect(exp, `corpus expected bytes for ${name}:${view}`).toBeDefined();
        const actual = await storage!.engine.render(name, view);
        const d = compareNormalized(exp!, actual);
        expect(
          d.firstDifference === null
            ? "equal"
            : `first diff at ${d.firstDifference.byteOffset}: ${d.firstDifference.expectedExcerpt}`,
        ).toBe("equal");
      }, 180_000);
    }
  },
);
