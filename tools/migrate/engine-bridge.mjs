// engine-bridge.mjs — the decko-ts engine side of migration verification.
//
// The migration tools are plain .mjs (they must run under bare `node`);
// the decko-ts engine is TypeScript. This bridge is the ONLY place the two
// meet: it imports the real FetchEngine / RenderEngine / DeckoName from
// src/ and exposes them to the tool pipeline as injectable hooks.
//
// RUNTIME MATRIX (the reason for the explicit ".ts" specifiers below):
//   - under vitest (tests, and the CLI's spawned verification): vite's
//     resolver handles ".ts" specifiers and the .js→.ts rewrites inside
//     src/ — everything loads.
//   - under bare node (the CLI's inline try): loading src/card/render.ts
//     succeeds (Node 24 type stripping) but render.ts's own "./format.js"
//     specifier cannot resolve (node does not rewrite) — the dynamic
//     import REJECTS, migrate.mjs catches it, and engine checks fall back
//     to the vitest-runner spawn. By design
//
// Exports:
//   - engineChecks({...})   — the verify.mjs `engineChecks` hook:
//       1. JUNCTION RESOLUTION through the real Lexicon: sample compound
//          cards and fetch them; a composed name proves the
//          left_id/right_id graph survived the import.
//       2. SPOT-RENDER through the real RenderEngine: render N random
//          cards (content + title views); record sha256 + byte length of
//          the HTML. Structural check: the `content` view's HTML must
//          contain the card's db_content (holds for text-bearing cards;
//          recorded as a boolean, not asserted, since non-text cardtypes
//          legitimately render transformed content).
//       3. FIXTURE COMPARISON: when the migrated deck contains the cards
//          named in fixtures/captured/smoke.json (the Ruby oracle's
//          captured deck), byte-compare content and rendered views against
//          the Ruby capture. For an arbitrary migrated deck the fixture
//          cards are absent and this reports cardsPresent: 0, honestly.
//
//   - deriveKeyWithEngine(name) — DeckoName.parse(name).key, the real
//     name algebra from src/card/name.ts under the deployed deck's
//     inflection table, for the importer's simple-card missing-key repair.
//     The tools never reimplement this algorithm.
//
// CONTENT RULE: everything returned here is ids, counts, hashes, and the
// repo's own synthetic fixture names ("Oracle ..." — already committed in
// fixtures/captured). No migrated card names or content leave this module.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { FetchEngine } from "../../src/card/fetch.ts";
import { RenderEngine } from "../../src/card/render.ts";
import { DeckoName } from "../../src/card/name.ts";
import { applyDeckInflections, singularize } from "../../src/card/name/inflect.ts";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** True when the process-global inflection tables are the deck's: under the
 *  deck table "anonymous" is uncountable, under the gem defaults it
 *  singularizes to "anonymou". */
function deckInflectionsActive() {
  return singularize("anonymous") === "anonymous";
}

/** The real decko-ts name algebra (src/card/name.ts), for import.mjs's
 *  key-repair hook, under the deployed deck's inflection table
 *  (src/card/name/oracle-deck-inflections.ts) exactly as a serving boot
 *  applies it. Without the table, names containing "Anonymous", "this" or a
 *  lone "s" ("Participant(s)", "Casey's") get keys no serving engine or
 *  Ruby deck looks up, and those cards become unreachable by name. */
export function deriveKeyWithEngine(name) {
  if (!deckInflectionsActive()) applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  return DeckoName.parse(name).key;
}

/**
 * The verify.mjs engineChecks hook. Deterministic given (spotCount, seed).
 */
export async function engineChecks({ driver, spotCount, seed }) {
  const fetcher = new FetchEngine(driver);
  const renderer = new RenderEngine(fetcher);
  const rand = mulberry32(seed);

  // --- 1. junction resolution through the real Lexicon -------------------
  const junctionEngine = { sampled: 0, resolved: 0 };
  {
    const range = await driver.query(
      "SELECT COUNT(*) AS n FROM cards WHERE left_id IS NOT NULL AND trash = 0",
      [],
    );
    const total = Number(range.rows[0]?.n ?? 0);
    const wanted = Math.min(spotCount, total);
    if (wanted > 0) {
      const stride = Math.max(1, Math.floor(total / wanted));
      const rows = await driver.query(
        `SELECT id FROM cards WHERE left_id IS NOT NULL AND trash = 0
         ORDER BY id LIMIT ${wanted * stride}`,
        [],
      );
      for (let i = Math.floor(rand() * stride); i < rows.rows.length; i += stride) {
        const id = rows.rows[i]?.id;
        if (id === undefined) continue;
        const record = await fetcher.fetchById(Number(id));
        junctionEngine.sampled += 1;
        if (record !== undefined && record.name !== undefined && record.name.s !== "") {
          junctionEngine.resolved += 1;
        }
      }
    }
  }

  // --- 2. spot-render through the real RenderEngine ----------------------
  const spotRender = {
    sampled: 0,
    rendered: 0,
    renderErrors: 0,
    contentContainedHits: 0,
    results: [],
  };
  {
    // Prefer text-bearing simple cards (renderability). Deterministic
    // stride sampling over id order.
    const rows = await driver.query(
      `SELECT id FROM cards
       WHERE trash = 0 AND db_content IS NOT NULL AND db_content != ''
         AND left_id IS NULL
       ORDER BY id LIMIT ${spotCount * 50}`,
      [],
    );
    const pool = rows.rows;
    const wanted = Math.min(spotCount, pool.length);
    const stride = Math.max(1, Math.floor(pool.length / Math.max(1, wanted)));
    for (
      let i = Math.floor(rand() * stride);
      i < pool.length && spotRender.sampled < wanted;
      i += stride
    ) {
      const row = pool[i];
      if (row === undefined) continue;
      const id = Number(row.id);
      const record = await fetcher.fetchById(id);
      if (record === undefined || record.name === undefined) continue;
      spotRender.sampled += 1;
      const content = record.dbContent ?? "";
      for (const view of ["content", "title"]) {
        try {
          const html = await renderer.render(record.name.s, view);
          spotRender.rendered += 1;
          const spot = {
            id,
            view,
            sha256: createHash("sha256").update(html, "utf8").digest("hex"),
            bytes: Buffer.byteLength(html, "utf8"),
          };
          if (view === "content") {
            spot.contentContained = html.includes(content);
            if (spot.contentContained) spotRender.contentContainedHits += 1;
          }
          spotRender.results.push(spot);
        } catch {
          spotRender.renderErrors += 1;
        }
      }
    }
  }

  // --- 3. Ruby-captured fixture comparison (when the deck has them) ------
  const fixtures = {
    source: "fixtures/captured/smoke.json",
    cardsPresent: 0,
    contentParityHits: 0,
    contentParityChecked: 0,
    renderedCompared: 0,
    renderedMismatched: 0,
    matchedFixtureNames: [],
  };
  {
    let captured = {};
    try {
      captured = JSON.parse(
        readFileSync(`${REPO_ROOT}fixtures/captured/smoke.json`, "utf8"),
      );
    } catch {
      fixtures.source = "fixtures/captured/smoke.json (absent)";
    }
    for (const [name, expected] of Object.entries(captured.cards ?? {})) {
      const record = await fetcher.fetchByName(name);
      if (record === undefined) continue;
      fixtures.cardsPresent += 1;
      if (!fixtures.matchedFixtureNames.includes(name)) {
        fixtures.matchedFixtureNames.push(name);
      }
      if (expected.content !== undefined) {
        fixtures.contentParityChecked += 1;
        if ((record.dbContent ?? "") === (expected.content ?? "")) {
          fixtures.contentParityHits += 1;
        }
      }
    }
    for (const [key, expectedHtml] of Object.entries(captured.rendered ?? {})) {
      const hash = key.indexOf("#");
      if (hash === -1) continue;
      const name = key.slice(0, hash);
      const view = key.slice(hash + 1);
      const record = await fetcher.fetchByName(name);
      if (record === undefined || record.name === undefined) continue;
      try {
        const html = await renderer.render(record.name.s, view);
        fixtures.renderedCompared += 1;
        if (html === expectedHtml) continue;
        fixtures.renderedMismatched += 1;
      } catch {
        fixtures.renderedCompared += 1;
        fixtures.renderedMismatched += 1;
      }
    }
  }

  renderer.resetCaches();
  fetcher.resetCaches();
  return { junctionEngine, spotRender, fixtures };
}

/** Deterministic sampling RNG (same construction as verify.mjs). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
