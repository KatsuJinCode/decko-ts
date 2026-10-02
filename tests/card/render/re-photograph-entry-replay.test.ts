// tests/card/render/re-photograph-entry-replay.test.ts — the RENDER ARM of the
// re-photography instrument (lane-rephoto). The driver is
// tools/oracle/re-photograph-entries.mjs; this file is the only part that
// boots the engine, because the engine's seeding lives in TypeScript.
//
// WHAT THIS DOES, precisely: reads the entries artifact the driver's identity
// stage wrote (tmp/re-photograph/rephoto-entries.json — entry table, oracle
// shard pointers, restore-identity verdict), seeds the engine deck from the
// worktree's OWN copy of the raw corpus (tmp/raw-ground-truth/
// bench-corpus-raw.sqlite3 — per the identity stage's proof, the dump rows are
// the only real-name/real-content witness of capture-time state, cross-
// witnessed on structure+graph by the manifest-bound scrubbed capture deck),
// re-renders each entry through the same engine at this commit, compares the
// bytes three ways (oracle bytes vs re-rendered bytes; identity verdict; and
// per-finding signature needles), and writes the evidence rows to
// tmp/re-photograph/re-rendered.jsonl for the driver's verdict stage.
//
// REPORT-ONLY BY DESIGN: byte equality is recorded, never asserted — the
// verdict (oracle capture-stale / engine wrong / engine right already /
// capture-runtime-bound) is the DRIVER's decision rule, so this test stays a
// measuring instrument and never becomes a failing pin on capture-state bytes
// (yardstick-fitting is forbidden per the lane constraints and
// p22-tpr-enumeration-lane.md §(d)).
//
// GATE: REPHOTO_ENTRIES_RENDER=1, and it runs ONLY on this worktree's staged
// COPIES (a clone without tmp/raw-ground-truth skips for the data reason, the
// same shape as the other env-opt-in replay suites). The oracle side and the
// corpus are entry-scoped reads over the copied shards; the bulk (all 18
// entries) is operator-gated at the DRIVER level (--limit 0), not here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "re-photograph");
const ENTRIES_JSON = path.join(OUT_DIR, "rephoto-entries.json");
const VIEW_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const RENDER_REQUESTED = process.env.REPHOTO_ENTRIES_RENDER === "1";

interface RephotoEntry {
  key: string;
  finding: string;
  name: string;
  id: number;
  lane: "view" | "page";
  view: string;
  oracleShard: string | null;
  oraclePresent?: boolean;
  oracleByteLength?: number;
  signatureNeedles?: string[];
}

interface EvidenceRow {
  key: string;
  finding: string;
  name: string;
  id: number;
  lane: string;
  view: string;
  equal: boolean | null;
  firstDiffOffset: number | null;
  expExcerpt: string | null;
  actExcerpt: string | null;
  renderedByteLength: number;
  oracleByteLength: number | null;
  renderError: string | null;
  census: { li: number; denied: number; contentOptions: number };
  signatures: Record<string, { oracle: boolean; actual: boolean }>;
}

function countNeedle(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

async function readShardEntry(
  shardPath: string,
  id: number,
  lane: string,
): Promise<Record<string, unknown> | undefined> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: createReadStream(shardPath) });
  try {
    for await (const line of rl) {
      if (line.trim() === "") continue;
      if (!line.includes(`"id":${id},`)) continue;
      const obj = JSON.parse(line) as Record<string, unknown> & { id: number; lane: string };
      if (obj.id === id && obj.lane === lane) return obj;
    }
  } finally {
    rl.close();
  }
  return undefined;
}

async function seedRawCorpusStorage(): Promise<
  ReturnType<typeof createRawStructureSeededStorage>
> {
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
  return storage;
}

describe("re-photography instrument render arm (lane-rephoto)", () => {
  it(
    "re-renders the disputed entries on the restored capture-row state and records three-way evidence",
    { timeout: 170_000 },
    async (ctx) => {
      if (!RENDER_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(
        existsSync(ENTRIES_JSON),
        `entries artifact missing: ${ENTRIES_JSON} — run the driver's identity stage first ` +
          "(node tools/oracle/re-photograph-entries.mjs identity --limit 3)",
      ).toBe(true);
      expect(existsSync(RAW_CORPUS_DB), `raw corpus copy missing: ${RAW_CORPUS_DB}`).toBe(true);

      const artifact = JSON.parse(readFileSync(ENTRIES_JSON, "utf8")) as {
        limit: number;
        identityVerdict: string;
        entries: RephotoEntry[];
      };
      const storage = await seedRawCorpusStorage();
      const rows: EvidenceRow[] = [];

      for (const entry of artifact.entries) {
        const laneDir = entry.lane === "page" ? PAGE_LANE_DIR : VIEW_LANE_DIR;
        let actual = "";
        let renderError: string | null = null;
        try {
          actual =
            entry.lane === "page"
              ? await storage.engine.renderPage(entry.name)
              : await storage.engine.render(entry.name, entry.view);
        } catch (error) {
          const err = error as Error;
          renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 300)}`;
        }

        let equal: boolean | null = null;
        let firstDiffOffset: number | null = null;
        let expExcerpt: string | null = null;
        let actExcerpt: string | null = null;
        let oracleByteLength: number | null = null;
        const signatures: EvidenceRow["signatures"] = {};

        if (entry.oracleShard !== null) {
          const shardPath = path.join(laneDir, entry.oracleShard);
          expect(existsSync(shardPath), `oracle shard copy missing: ${shardPath}`).toBe(true);
          const oracle = await readShardEntry(shardPath, entry.id, entry.lane);
          expect(oracle, `no ${entry.lane}-lane yardstick entry for id ${entry.id}`).toBeDefined();
          const expected =
            entry.view === "page_html"
              ? ((oracle?.page_html as string | undefined) ?? "")
              : (((oracle?.views as Record<string, string> | undefined)?.[entry.view]) ?? "");
          oracleByteLength = expected.length;
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          equal = diff.equal;
          firstDiffOffset = diff.firstDifference?.codeUnitOffset ?? null;
          expExcerpt = diff.firstDifference?.expectedExcerpt ?? null;
          actExcerpt = diff.firstDifference?.actualExcerpt ?? null;
          for (const needle of entry.signatureNeedles ?? []) {
            signatures[needle] = { oracle: expected.includes(needle), actual: actual.includes(needle) };
          }
        } else {
          for (const needle of entry.signatureNeedles ?? []) {
            signatures[needle] = { oracle: false, actual: actual.includes(needle) };
          }
        }

        rows.push({
          key: entry.key,
          finding: entry.finding,
          name: entry.name,
          id: entry.id,
          lane: entry.lane,
          view: entry.view,
          equal,
          firstDiffOffset,
          expExcerpt,
          actExcerpt,
          renderedByteLength: actual.length,
          oracleByteLength,
          renderError,
          census: {
            li: countNeedle(actual, "<li"),
            denied: countNeedle(actual, 'class="denied"'),
            contentOptions: countNeedle(actual, "content_options"),
          },
          signatures,
        });
      }

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        path.join(OUT_DIR, "re-rendered.jsonl"),
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );

      // Test-level asserts stay structural (an instrument, not a pin):
      expect(rows.length).toBe(artifact.entries.length);
      for (const r of rows) {
        if (r.oracleByteLength !== null) {
          expect(r.equal, `entry ${r.key}: oracle yardstick found but no comparison recorded`).not.toBeNull();
        }
      }
      console.log(`[re-photograph] ${rows.length} entries rendered -> ${path.join(OUT_DIR, "re-rendered.jsonl")}`);
    },
  );
});
