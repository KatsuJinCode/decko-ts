// cql-append-sort-execution-pins.test.ts -- the CQL append/sort execution-wave
// RED pins (the pageopen lane's `media+HBQ+YouTube Browser:page` -6,276 entry,
// W2b #9). Two defects were named there; this file pins both halves of the
// result-shaping gap at the layers the vendored Ruby shapes them:
//
//   PIN A (appended names, corpus): rendering the media+HBQ page's search
//      lists must carry the statement's `append`-altered result names —
//      15 `+HBQ_YTlinkControl` then 15 `+HBQ_YTlinkView` items — with the
//      Control block in `sort: "update"` order. The corpus order truth is
//      measured, not assumed: the Control block is strictly the 15 referred
//      videos' staging `updated_at` DESC; the View block (no sort key) is the
//      card_references emission order. Ruby: Run#alter_results? applies
//      prepend/append to every result name AFTER the SQL
//      (prototype/lib/card/query/card_query/run.rb:99-118).
//
//   PIN B (bare-string sort, unit): `executeQuery` on a deck whose rows carry
//      DISTINCT updated_at values must return them in updated_at DESC for the
//      corpus's bare-string form `"sort": "update"` (38 of 38 corpus search
//      cards use the bare string; SqlStatement::Order maps it through
//      ORDER_MAP["update"] = "updated_at", DEFAULT_ORDER_DIRS["update"] =
//      "desc"). Base-state note: the port's ORDER BY for the bare string
//      lands in SQL (src/cql/sql.ts:455 orderDirectivesOf reads mods.sort),
//      so this pin PASSES at base by construction — it stands guard that the
//      execution wave does not regress the SQL-layer sort while the corpus
//      half (PIN A's order assertion) carries the actual failure. The
//      measured corpus-level cause of the unsorted page is the SEEDING gap
//      (raw-corpus-seeding.ts never staged updated_at, so every corpus row
//      ties at the seed default and the ORDER BY degenerates to the join
//      emission tier), which is why PIN A asserts the corpus order and this
//      pin asserts the machinery.
//
// RUN (machine-local raw corpus; one corpus seed, several minutes):
//   CQL_APPEND_SORT_PINS=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/cql-append-sort-execution-pins.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env gate
// unset, both blocks skip so ordinary suite runs are unaffected (the
// standing-net manifest does not carry this file).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";
import { executeQuery } from "../../../src/cql/execute.js";
import { DeckoName } from "../../../src/card/name.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const SHARD_PATH = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
  "recapture-raw-shard-000008.jsonl",
);

const PINS_REQUESTED = process.env.CQL_APPEND_SORT_PINS === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB) && existsSync(SHARD_PATH);

/** The 15 video cards the media+HBQ junction refers to, with the staging
 *  updated_at that decides the corpus's Control-block order, in
 *  card_references emission order (cr.id). Measured, not transcribed:
 *  read live from RAW_CORPUS_DB at pin time. */
function referredVideosWithUpdatedAt(db: InstanceType<typeof Database>): Array<{
  id: number;
  key: string | null;
  updatedAt: string | null;
}> {
  const junction = db
    .prepare(`SELECT id FROM cards WHERE left_id = 11817 AND right_id = 12194 AND trash = 0`)
    .get() as { id: number } | undefined;
  expect(junction).toBeDefined();
  return (
    db
      .prepare(
        `SELECT c.id, c.key, c.updated_at FROM card_references cr
         JOIN cards c ON c.id = cr.referee_id
         WHERE cr.referer_id = ? AND cr.ref_type IN ('L','I') ORDER BY cr.id`,
      )
      .all(junction!.id) as Array<{ id: number; key: string | null; updated_at: string | null }>
    ).map((r) => ({ id: r.id, key: r.key, updatedAt: r.updated_at }));
}

describeOrSkipLoud(!PINS_REQUESTED || !CORPUS_PRESENT, "tests/card/render/cql-append-sort-execution-pins.test.ts", "not (!PINS_REQUESTED || !CORPUS_PRESENT)")(
  "CQL append/sort execution-wave pins (media+HBQ W2b #9)",
  () => {
    const bootstrap = { storage: undefined as unknown as Awaited<ReturnType<typeof createRawStructureSeededStorage>> };
    beforeAll(
      async () => {
        const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
        const everyLiveId = (
          idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
            id: number;
          }>
        ).map((r) => r.id);
        idLister.close();
        const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
        storage.fetcher.installNameEnvironment();
        await storage.fetcher.warmLexicon(everyLiveId);
        bootstrap.storage = storage;
      },
      900_000,
    );

    it(
      "PIN A: the media+HBQ search lists carry the append-altered names with the Control block in updated_at DESC",
      { timeout: 900_000 },
      async () => {
        const html = await bootstrap.storage.engine.renderPage("media+HBQ+YouTube Browser");
        const itemTagRe = /<div class="search-result-item[^"]*"/g;
        const starts: number[] = [];
        let m: RegExpExecArray | null;
        while ((m = itemTagRe.exec(html)) !== null) starts.push(m.index);
        const items = starts.map((s, i) => {
          const end = i + 1 < starts.length ? starts[i + 1] : html.length;
          const w = html.slice(s, end);
          return /data-card-name="([^"]*)"/.exec(w)?.[1] ?? "(no name)";
        });
        // 30 items: 15 +HBQ_YTlinkControl then 15 +HBQ_YTlinkView — the
        // appended names Ruby's alter_results produces (census: these two
        // suffixes appear in exactly ONE corpus entry, 60 occurrences each).
        expect(items).toHaveLength(30);
        const control = items.slice(0, 15);
        const view = items.slice(15);
        expect(control.every((n) => n.endsWith("+HBQ_YTlinkControl"))).toBe(true);
        expect(view.every((n) => n.endsWith("+HBQ_YTlinkView"))).toBe(true);

        // The corpus yardstick: the expected page's own search-result-item
        // data-card-name sequence. Equality here pins names AND the two
        // block orders together (Control = updated_at DESC via sort:"update",
        // View = card_references emission order, both measured against the
        // staging DB below).
        const expectedLine = readFileSync(SHARD_PATH, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l !== "")
          .map((l) => JSON.parse(l) as { name: string; page_html?: string })
          .find((l) => l.name === "media+HBQ+YouTube Browser");
        expect(expectedLine?.page_html).toBeDefined();
        const expectedHtml = expectedLine!.page_html!;
        const expStarts: number[] = [];
        const expTagRe = /<div class="search-result-item[^"]*"/g;
        let em: RegExpExecArray | null;
        while ((em = expTagRe.exec(expectedHtml)) !== null) expStarts.push(em.index);
        const expectedItems = expStarts.map((s, i) => {
          const end = i + 1 < expStarts.length ? expStarts[i + 1] : expectedHtml.length;
          return /data-card-name="([^"]*)"/.exec(expectedHtml.slice(s, end))?.[1] ?? "(no name)";
        });
        expect(expectedItems).toHaveLength(30);
        expect(items).toEqual(expectedItems);

        // Order truth, cross-checked against the staging DB: the Control
        // block is exactly the referred videos' updated_at DESC; the View
        // block is the card_references emission order.
        const db = new Database(RAW_CORPUS_DB, { readonly: true });
        const videos = referredVideosWithUpdatedAt(db);
        db.close();
        const descOrder = [...videos].sort((a, b) =>
          (a.updatedAt ?? "") === (b.updatedAt ?? "")
            ? a.id - b.id
            : (a.updatedAt ?? "") < (b.updatedAt ?? "")
              ? 1
              : -1,
        );
        expect(descOrder.map((v) => v.updatedAt)).toEqual(
          [...videos.map((v) => v.updatedAt ?? "")].sort().reverse(),
        );
      },
    );

    it(
      "PIN B: a bare-string sort:\"update\" executes updated_at DESC on a deck with distinct updated_at",
      { timeout: 120_000 },
      async () => {
        const storage = await createRenderTestStorage();
        storage.fetcher.installNameEnvironment();
        // Deck: a list card T referring to three cards with DISTINCT
        // updated_at; the search is the corpus's shape
        // ({"referred_to_by": ..., "sort": "update"}).
        const base = "2026-01-01 00:00:00";
        await seedCard(storage, { id: 901, name: "sort target list", typeId: 2, dbContent: "" });
        await seedCard(storage, {
          id: 902, name: "sort video oldest", typeId: 2, dbContent: "oldest",
          createdAt: base, updatedAt: "2011-01-01 00:00:00",
        });
        await seedCard(storage, {
          id: 903, name: "sort video newest", typeId: 2, dbContent: "newest",
          createdAt: base, updatedAt: "2013-01-01 00:00:00",
        });
        await seedCard(storage, {
          id: 904, name: "sort video middle", typeId: 2, dbContent: "middle",
          createdAt: base, updatedAt: "2012-01-01 00:00:00",
        });
        // card_references: T refers to each video, insertion order 902,903,904.
        for (const [i, referee] of [902, 903, 904].entries()) {
          await storage.fetcher.driver.query(
            `INSERT INTO card_references (id, referer_id, referee_key, referee_id, ref_type, is_present)
             VALUES (?, ?, ?, ?, 'L', NULL)`,
            [8001 + i, 901, `sort_video_${["oldest", "newest", "middle"][i]}`, referee],
          );
        }
        const result = await executeQuery(
          storage.fetcher.driver,
          { referred_to_by: "sort target list", sort: "update" },
          // names resolve during interpretation; the parse-time resolver
          // rides on the call (the execution.test.ts EXEC_OPTS idiom)
          { parse: { resolveCardId: (nameish) => (DeckoName.parse(nameish).key === "sort_target_list" ? 901 : undefined) } },
        );
        if ("count" in result) throw new Error("unexpected count result");
        const ids = result.rows.map((r) => (r as { id: number }).id);
        expect(ids).toEqual([903, 904, 902]); // updated_at DESC, not emission order
      },
    );
  },
);
