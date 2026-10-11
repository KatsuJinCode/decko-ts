// raw-corpus-aiki-unknown-card-name-mark-case-casing.test.ts
//
// THE MARK NAMES THE CARD A FETCH RETURNS, EVEN WHEN THE CACHE ALREADY
// HOLDS IT BY KEY. Corpus-boot pin for the Aiki page's unknown-card
// `data-card-name` casing (parity-restore-runbook.md:184 mechanism #4,
// "unknown-card name casing", Aiki:page -3342).
//
// WHY A CORPUS BOOT AND NOT A SYNTHETIC DECK. The defect is a RACE between
// two consumers of the same render-card map, and a synthetic deck never
// starts the race:
//
//   1. render.ts#applyStructureContent walks the *structure universe and
//      warm-fetches every reference it finds. The corpus row `Aiki+references`
//      (27199) stores its reference in KEY case, so the warm fetch is
//      `aiki+*referred_to_by`. That junction row is ABSENT from the corpus
//      (`left_id 2705 AND right_id 3945` -> []), so the miss fabricates a
//      placeholder named FROM THE MARK (the key form) and seats it in the
//      render-card map under the key.
//   2. The page's own `{{_self+*referred_to_by}}` then resolves the RIGHT
//      name - `Aiki+*referred_to_by`, via the card's own nest context - and
//      reads the card back through the cache-only lookup, hitting the
//      key-named placeholder.
//
// A synthetic deck has no *structure universe, so applyStructureContent
// early-returns (render.ts:2340) and step 1 never fires. The prior lane
// built exactly that synthetic pin and measured it 2/2 GREEN at the unfixed
// base - a guard that cannot go red. This file boots the graded corpus
// instead, which is the only boot where the race runs.
//
// WHY RUBY DOES NOT HAVE IT (prototype/lib/card/fetch/):
//   results.rb:8   `card.new_card? ? new_result_card : finalize_result_card`
//   results.rb:30-32  `assign_name mark` - the mark names the RETURNED card
//   store.rb:21-28  `new_for_cache` instantiates `Card.new name: mark` -
//                    the shared cache holds the placeholder BY KEY
//                  (store.rb:9 `Card.write_to_cache card` keys on card.key),
//                  but the object the caller receives is the one built from
//                  THIS mark, so its @name carries THIS mark's case.
// store.rb:27 + results.rb:31 together: the cached placeholder is keyed, the
// returned card is marked. A stored card is never re-marked (results.rb:8
// sends a known card straight to finalize_result_card), which is what the
// stored-card guard below pins.
//
// THE PIN, IN THREE PARTS.
//   1. The mandate's byte: the Aiki page's `*referred_to_by` slot reads
//      `data-card-name="Aiki+*referred_to_by"` and never the key form.
//   2. The CLASS, computed at run time from the capture rather than
//      transcribed: no `data-card-name` attribute on the page may be a
//      key-form fabrication where the captured page spells the same name
//      with case. A fix hardcoded to the one string passes (1) and fails
//      (2) on the next unknown card.
//   3. The stored-card guard: names the deck DOES store keep their stored
//      case. A re-bind that leaked onto stored cards - letting an authored
//      `{{aiki}}` rename the "Aiki" card's slots - fails here.
//
// RUN: npx vitest run tests/card/render/raw-corpus-aiki-unknown-card-name-mark-case-casing.test.ts --no-file-parallelism
// SKIPS when the machine-local raw corpus is absent (tmp/ is not checked in),
// the same gate the other corpus-replay pins use.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setDeploymentCloudAssetHost } from "../../../src/card/render/views.js";
import { DeckoName } from "../../../src/card/name.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
/** The capture the assertion is measured against - the same shard the
 *  defaulttype lane's Aiki probe read. */
const AIKI_SHARD = path.join(
  REPO_ROOT,
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "page-lane",
  "recapture-raw-shard-000002.jsonl",
);

const CORPUS_PRESENT =
  existsSync(RAW_CORPUS_DB) && existsSync(AIKI_SHARD) && RAW_CORPUS_DB.length > 0;

/** Every `data-card-name` value on the page, in document order. */
function cardNames(html: string): string[] {
  return [...html.matchAll(/data-card-name="([^"]*)"/g)].map((m) => m[1]);
}

function fieldOracleHtml(): string {
  for (const line of readFileSync(AIKI_SHARD, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line) as { name: string; page_html: string };
    if (o.name === "Aiki") return o.page_html;
  }
  throw new Error(`Aiki page not found in ${AIKI_SHARD}`);
}

describeOrSkipLoud(!CORPUS_PRESENT, "tests/card/render/raw-corpus-aiki-unknown-card-name-mark-case-casing.test.ts", "CORPUS_PRESENT")("unknown-card data-card-name carries the MARK's case (Aiki page, graded corpus boot)", () => {
  let storage: RenderTestStorage | undefined;
  let page: string;
  let oracle: string;

  beforeAll(async () => {
    // The graded runner's config: the asset host only
    // (tools/oracle/dual-lane-direct-runner-core.ts:539-544).
    setDeploymentCloudAssetHost(
      "https://source-deck-production-storage.r1.cdn.objectstore.example",
    );
    // The boot the grade did: every non-trashed live id seeded, the name
    // environment installed, the lexicon warmed over the whole deck
    // (tools/oracle/dual-lane-direct-runner-core.ts:695-700).
    const ids = new Set(
      (() => {
        const db = new Database(RAW_CORPUS_DB, { readonly: true });
        const out = db.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => (r as { id: number }).id);
        db.close();
        return out;
      })(),
    );
    storage = await createRawStructureSeededStorage(ids);
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon([...ids]);
    page = await storage.engine.renderPage("Aiki");
    oracle = fieldOracleHtml();
  }, 600_000);

  afterAll(() => {
    storage?.close();
  });

  it("1. the *referred_to_by slot reads the MARK's case, never the key form", () => {
    // Compact messages on purpose: expect(page).toContain would dump all
    // 73 KB of the page into the log, which buries the other two failures.
    const names = cardNames(page);
    expect(
      names.includes("Aiki+*referred_to_by"),
      `*referred_to_by slot missing the mark case; the page's referred_to_by names are ${JSON.stringify(names.filter((n) => n.includes("referred_to_by")))}`,
    ).toBe(true);
    expect(
      names.includes("aiki+*referred_to_by"),
      "the key-form fabrication is still on the page",
    ).toBe(false);
    // The same slot's sibling attribute rides the same name; a fix that
    // re-binds only one of the two would leave the pair inconsistent.
    expect(page.includes('data-card-link-name="Aiki+*referred_to_by"')).toBe(true);
    expect(page.includes('data-card-link-name="aiki+*referred_to_by"')).toBe(false);
  });

  it("2. the CLASS: no data-card-name on the page is a key-form fabrication the capture spells with case", () => {
    // The capture's own spelling for each folded name. A value is a casing
    // defect ONLY when the capture spells it differently - an identical
    // value (e.g. "*footer", already key case) is not a defect, and neither
    // is a name the capture does not carry at all.
    const oracleByFold = new Map<string, string>();
    for (const v of cardNames(oracle)) {
      const folded = v.toLowerCase();
      if (!oracleByFold.has(folded)) oracleByFold.set(folded, v);
    }
    const defects: string[] = [];
    for (const v of cardNames(page)) {
      const key = DeckoName.parse(v).key;
      if (v !== key) continue; // carries case: not a key-form fabrication
      const captured = oracleByFold.get(v.toLowerCase());
      if (captured !== undefined && captured !== v) defects.push(`ours="${v}" capture="${captured}"`);
    }
    expect(
      defects,
      `key-form data-card-name fabrications the capture spells with case:\n${defects.join("\n")}`,
    ).toEqual([]);
  });

  it("3. the stored-card guard: a card the deck STORES is never re-marked", () => {
    // Ruby never re-marks a stored card: results.rb:8 sends a known card
    // straight to `finalize_result_card`, and only `new_result_card` reaches
    // `assign_name` (results.rb:31). A re-bind that reached stored rows
    // would let an authored `{{aiki}}` rename the "Aiki" card's own slots.
    //
    // Checked against the corpus, not against the capture: a stored simple
    // row's `name` column IS its identity, so ours must equal it exactly.
    // Junctions store `name IS NULL` (their identity is left_id/right_id,
    // the defaulttype receipt's premise-falsification finding), so they are
    // OUT of scope here and named as the limit rather than approximated.
    const SLOT = /data-card-id="(\d+)" data-card-name="([^"]*)"/g;
    const checked: string[] = [];
    const wrong: string[] = [];
    const db = new Database(RAW_CORPUS_DB, { readonly: true });
    try {
      for (const m of page.matchAll(SLOT)) {
        const id = Number(m[1]);
        const ours = m[2];
        const row = db
          .prepare("SELECT name FROM cards WHERE id = ? AND trash = 0")
          .get(id) as { name: string | null } | undefined;
        if (row?.name == null) continue; // junction or absent row: out of scope
        checked.push(`${id}:${ours}`);
        if (row.name !== ours) wrong.push(`id ${id}: ours="${ours}" stored="${row.name}"`);
      }
    } finally {
      db.close();
    }
    expect(checked.length, "no stored simple slots found - the guard proved nothing").toBeGreaterThan(0);
    expect(wrong, `stored cards re-marked:\n${wrong.join("\n")}`).toEqual([]);
  });
});
