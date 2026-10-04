// LANE PROBE (relnames, 2026-10-04) — dumps the ENGINE's own bytes for the
// set-card-views parity targets so the slot-level name_context / card-title
// census can be compared slot-by-slot against BOTH oracles (the committed
// fixture and the graded expected-v2 view lane).
//
// Env-gated (RELNAMES_DUMP=1) so it never runs inside the standing net.
// Writes to tmp/wrong-goal-hunt/relnames-09-engine-<id>-<view>.html.
import { describe, it, afterAll, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  CORPUS_DB,
  createCorpusSeededStorage,
  readShardLines,
  type ShardLine,
} from "./permission-corpus-seeding.js";
import { installHelpRules } from "../../../src/card/render/help-popover.js";
import { normalizeSlotIds } from "../../../src/testing/diff.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const TARGET_IDS = [217, 268, 273, 294, 300, 302, 315] as const;
const OUT_DIR = path.join(process.cwd(), "tmp", "wrong-goal-hunt");

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

function proofEntries(): Array<{ id: number; name: string }> {
  const lines: ShardLine[] = readShardLines();
  const byId = new Map<number, ShardLine>();
  for (const line of lines) byId.set(line.id, line);
  return TARGET_IDS.map((id) => {
    const line = byId.get(id);
    if (line === undefined) throw new Error(`shard-000000.jsonl missing id ${id}`);
    return { id, name: line.name };
  });
}

async function createSetCardSeededStorage(): Promise<RenderTestStorage> {
  const ids = new Set<number>(TARGET_IDS);
  const corpus = new Database(CORPUS_DB, { readonly: true });
  try {
    const setTypeId = (corpus
      .prepare(`SELECT id FROM cards WHERE codename='set' AND trash=0`)
      .get() as { id: number } | undefined)?.id;
    const settingTypeId = (corpus
      .prepare(`SELECT id FROM cards WHERE codename='setting' AND trash=0`)
      .get() as { id: number } | undefined)?.id;
    if (setTypeId === undefined || settingTypeId === undefined) {
      throw new Error("corpus deck missing set/setting codename cards");
    }
    const queue: number[] = [...TARGET_IDS];
    const visited = new Set<number>(TARGET_IDS);
    while (queue.length > 0) {
      const id = queue.shift() as number;
      const rows = corpus
        .prepare(
          `SELECT id, left_id, right_id, type_id FROM cards WHERE (id=? OR left_id=?) AND trash=0`,
        )
        .all(id, id) as Array<{ id: number; left_id: number | null; right_id: number | null; type_id: number }>;
      for (const r of rows) {
        for (const side of [r.id, r.left_id, r.right_id, r.type_id]) {
          if (side !== null && !visited.has(side)) {
            visited.add(side);
            ids.add(side);
            queue.push(side);
          }
        }
      }
    }
    const helpRules = corpus
      .prepare(
        `SELECT r.id, r.left_id, r.right_id, r.type_id FROM cards r
         JOIN cards sets ON r.left_id = sets.id
         JOIN cards settings ON r.right_id = settings.id
         WHERE sets.type_id = ? AND settings.type_id = ?
           AND settings.codename = 'help' AND r.trash = 0
           AND sets.trash = 0 AND settings.trash = 0`,
      )
      .all(setTypeId, settingTypeId) as Array<{ id: number; left_id: number | null; right_id: number | null; type_id: number }>;
    for (const r of helpRules) {
      ids.add(r.id);
      const queue2: number[] = [r.left_id, r.right_id, r.type_id].filter((x): x is number => x !== null);
      const visited2 = new Set<number>(queue2);
      while (queue2.length > 0) {
        const id = queue2.shift() as number;
        const rows = corpus
          .prepare(
            `SELECT id, left_id, right_id, type_id FROM cards WHERE (id=? OR left_id=?) AND trash=0`,
          )
          .all(id, id) as Array<{ id: number; left_id: number | null; right_id: number | null; type_id: number }>;
        for (const row of rows) {
          for (const side of [row.id, row.left_id, row.right_id, row.type_id]) {
            if (side !== null && !visited2.has(side)) {
              visited2.add(side);
              ids.add(side);
              queue2.push(side);
            }
          }
        }
      }
    }
    for (const cn of ["anyone", "anyone_signed_in", "anonymous", "read", "set", "setting", "help", "input_type"]) {
      const row = corpus.prepare(`SELECT id FROM cards WHERE codename=? AND trash=0`).get(cn) as
        | { id: number }
        | undefined;
      if (row !== undefined) ids.add(row.id);
    }
  } finally {
    corpus.close();
  }
  return createCorpusSeededStorage(ids);
}

/** The slot-level census: for every card-slot div, the name_context IT
 *  carries and the card-title spans lexically inside it. Same shape as the
 *  offline analyzer (relnames-07-slot-level.cjs) so the three sources are
 *  directly comparable. */
function slotCensus(html: string): string[] {
  const opens: Array<{ at: number; end: number; tag: string }> = [];
  const re = /<div\b[^>]*class="([^"]*\bcard-slot\b[^"]*)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) opens.push({ at: m.index, end: re.lastIndex, tag: m[0] });
  const out: string[] = [`card-slot opens: ${opens.length}  html=${html.length}`];
  for (let i = 0; i < opens.length; i += 1) {
    const start = opens[i].end;
    const bound = i + 1 < opens.length ? opens[i + 1].at : html.length;
    const inner = html.slice(start, bound);
    const ctx = /name_context&quot;:&quot;([^&]*)&quot;/.exec(opens[i].tag);
    const titles = [...inner.matchAll(/<span class="card-title" title="([^"]*)"/g)].map((x) => x[1] ?? "");
    if (titles.length === 0 && ctx === null) continue;
    const idm = /id="([^"]*)"/.exec(opens[i].tag);
    const cn = /data-card-name="([^"]*)"/.exec(opens[i].tag);
    const rel = titles.filter((t) => t.startsWith("+")).length;
    out.push(
      `slot#${i} id=${idm?.[1] ?? "?"} card=${JSON.stringify(cn?.[1] ?? "?")} ` +
        `ctx=${ctx ? JSON.stringify(ctx[1]) : "NONE"} titles=${titles.length} rel=${rel} :: ` +
        [...new Set(titles)].join(" | "),
    );
  }
  return out;
}

describe("relnames lane probe: engine bar-title slot census", () => {
  it("dumps the engine's own bytes per target surface", { timeout: 600_000 }, async () => {
    if (process.env.RELNAMES_DUMP !== "1") {
      expect(process.env.RELNAMES_DUMP).toBe("1");
      return;
    }
    const entries = proofEntries();
    const fixtures = new Map<number, Record<string, string>>();
    for (const line of readShardLines()) {
      if (!fixtures.has(line.id)) fixtures.set(line.id, line.views ?? {});
    }
    storage = await createSetCardSeededStorage();
    const helpResolver = installHelpRules(storage.engine, storage.fetcher);
    await helpResolver.prepare();
    const report: string[] = [];
    for (const entry of entries) {
      for (const view of ["closed", "content", "open", "title"]) {
        let actual: string;
        try {
          actual = await storage.engine.render(entry.name, view);
        } catch (error) {
          report.push(`### id=${entry.id} name=${JSON.stringify(entry.name)} view=${view} RAISED ${String(error)}`);
          continue;
        }
        const file = path.join(OUT_DIR, `relnames-09-engine-${entry.id}-${view}.html`);
        fs.writeFileSync(file, actual);
        report.push(
          `### id=${entry.id} name=${JSON.stringify(entry.name)} view=${view} len=${actual.length} ` +
            `ctxSurface=${actual.includes("&quot;name_context&quot;")}`,
        );
        report.push(...slotCensus(actual).map((line) => `  ${line}`));

        // FIRST-DIFF vs the committed fixture, with the parity suite's own
        // normalizer. This is the number the lane is graded on: where the
        // engine's bytes first leave the fixture's, and whether any
        // relativized card-title survives in the actual.
        const expected = fixtures.get(entry.id)?.[view];
        if (expected === undefined) continue;
        if (expected.startsWith('<span class="denied"') || expected.startsWith("CAPTURE_ERROR")) continue;
        const e = normalizeSlotIds(expected);
        const a = normalizeSlotIds(actual);
        const relActual = [...a.matchAll(/<span class="card-title" title="(\+[^"]*)"/g)].map((x) => x[1] ?? "");
        const relExpected = [...e.matchAll(/<span class="card-title" title="(\+[^"]*)"/g)].map((x) => x[1] ?? "");
        if (e === a) {
          report.push(`  DIFF id=${entry.id}:${view} BYTE-IDENTICAL (len ${a.length})`);
          continue;
        }
        let at = 0;
        while (at < e.length && at < a.length && e[at] === a[at]) at += 1;
        report.push(
          `  DIFF id=${entry.id}:${view} firstAt=${at} lenExp=${e.length} lenAct=${a.length} ` +
            `relTitlesExp=${relExpected.length} relTitlesAct=${relActual.length} ` +
            `ctxExp=${e.includes("&quot;name_context&quot;")} ctxAct=${a.includes("&quot;name_context&quot;")} ` +
            `exp=${JSON.stringify(e.slice(Math.max(0, at - 30), at + 60))} ` +
            `act=${JSON.stringify(a.slice(Math.max(0, at - 30), at + 60))}`,
        );
      }
    }
    const reportFile = path.join(OUT_DIR, "relnames-09-engine-slot-census.log");
    fs.writeFileSync(reportFile, report.join("\n"), "utf8");
    console.log(`relnames probe: wrote ${report.length} census lines to ${reportFile}`);
    expect(fs.existsSync(reportFile)).toBe(true);
  });
});
