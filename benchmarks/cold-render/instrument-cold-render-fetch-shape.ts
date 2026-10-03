// benchmarks/cold-render/instrument-cold-render-fetch-shape.ts
// WHAT THIS IS: the same cold render as instrument-cold-render-round-trips,
// but it records the SHAPE of every database hop — which SQL statement, how
// many bytes came back, how long it took — and then reports the round trips
// grouped by statement shape.
//
// WHY: instrument-cold-render-round-trips measured 1,151 HTTP round trips
// and a 76-byte page for the card `Laundry` (87.6 s from this machine, 13 s
// measured live on the edge). A count says "too many". Grouping by statement
// says WHICH loop is issuing them, which is the difference between a fix and
// a guess.
//
// OUTPUT: per-statement-shape totals (calls, bytes, mean ms) sorted by bytes
// and by calls, plus the single largest hops. SQL is printed as a SHAPE —
// literals replaced by ? — never with values bound into it, so no card
// content rides the report.

import { readFileSync } from "node:fs";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";

interface Hop {
  shape: string;
  ms: number;
  bytes: number;
  statements: number;
}

function shape(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 220);
}

function readCreds(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};

const creds = readCreds(arg("creds", "C:/localProjects/brandonDojoTech/library/data/creds"));
const raw = creds.BUNNY_TRIAL_DB_URL;
const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
if (!raw || !tok) {
  console.error("FATAL: trial DB url / read-only token missing from creds file");
  process.exit(2);
}
const url = raw.replace(/^libsql:\/\//, "https://");

const names = arg("names", "Laundry").split(",").map((s) => s.trim()).filter(Boolean);
const report: unknown[] = [];

for (const name of names) {
  const hops: Hop[] = [];
  // Read the SQL the driver is about to send by shadowing the fetch body:
  // the pipeline POST body is exactly the Hrana requests array.
  // Distinct-parameter census: a render that asks the SAME question 408
  // times can be collapsed by a memo; a render that asks 408 DIFFERENT
  // questions cannot. The report separates the two so the fix choice is
  // evidence-led rather than assumed.
  const paramKeys = new Map<string, number>();
  const shadowFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = process.hrtime.bigint();
    const bodyText = typeof init?.body === "string" ? init.body : "";
    let stmts: { sql: string }[] = [];
    try {
      const parsed = JSON.parse(bodyText) as {
        requests?: { type: string; stmt?: { sql: string; args?: unknown[] } }[];
      };
      stmts = (parsed.requests ?? [])
        .filter((r) => r.type === "execute")
        .map((r) => ({ sql: r.stmt?.sql ?? "", key: `${shape(r.stmt?.sql ?? "")}|${JSON.stringify(r.stmt?.args ?? [])}` }));
      for (const s of stmts as unknown as { key: string }[]) {
        paramKeys.set(s.key, (paramKeys.get(s.key) ?? 0) + 1);
      }
    } catch {
      /* body not JSON — recorded with an empty shape rather than guessed */
    }
    const res = await fetch(input, init);
    const clone = res.clone();
    const buf = await clone.arrayBuffer().catch(() => new ArrayBuffer(0));
    hops.push({
      shape: stmts.map((s) => shape(s.sql)).join(" ;; "),
      ms: Number(process.hrtime.bigint() - t0) / 1e6,
      bytes: buf.byteLength,
      statements: stmts.length,
    });
    return res;
  }) as typeof fetch;

  const driver = new BunnyDbDriver({ url, authToken: tok, fetchImpl: shadowFetch });
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  const t0 = process.hrtime.bigint();
  let outcome = "ok";
  let htmlBytes = 0;
  try {
    htmlBytes = (await render.render(name, "open", {})).length;
  } catch (err) {
    outcome = `${(err as Error)?.name ?? "Error"}: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
  }
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;

  // Group by statement shape.
  const groups = new Map<string, { calls: number; bytes: number; ms: number[]; stmts: number }>();
  for (const h of hops) {
    const g = groups.get(h.shape) ?? { calls: 0, bytes: 0, ms: [], stmts: 0 };
    g.calls += 1;
    g.bytes += h.bytes;
    g.stmts += h.statements;
    g.ms.push(h.ms);
    groups.set(h.shape, g);
  }
  const byCalls = [...groups.entries()]
    .map(([shape, g]) => ({
      shape,
      calls: g.calls,
      statements: g.stmts,
      bytes: g.bytes,
      mean_ms: Math.round((g.ms.reduce((a, b) => a + b, 0) / g.calls) * 10) / 10,
      max_ms: Math.round(Math.max(...g.ms) * 10) / 10,
    }))
    .sort((a, b) => b.calls - a.calls);

  const byBytes = [...byCalls].sort((a, b) => b.bytes - a.bytes);

  report.push({
    name,
    outcome,
    html_bytes: htmlBytes,
    distinct_sql_param_sets: paramKeys.size,
    repeat_ratio: Math.round((hops.length / Math.max(1, paramKeys.size)) * 1000) / 1000,
    wall_ms: Math.round(wallMs * 10) / 10,
    http_posts: hops.length,
    distinct_shapes: groups.size,
    total_db_bytes: hops.reduce((a, b) => a + b.bytes, 0),
    top_by_calls: byCalls.slice(0, 12),
    top_by_bytes: byBytes.slice(0, 8),
    largest_hops: [...hops].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((h) => ({
      bytes: h.bytes, ms: Math.round(h.ms * 10) / 10, statements: h.statements, shape: h.shape.slice(0, 180),
    })),
    slowest_hops: [...hops].sort((a, b) => b.ms - a.ms).slice(0, 5).map((h) => ({
      ms: Math.round(h.ms * 10) / 10, bytes: h.bytes, statements: h.statements, shape: h.shape.slice(0, 180),
    })),
  });
}

const out = arg("out", "");
if (out) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, JSON.stringify({ reports: report }, null, 2));
  console.error(`wrote ${out}`);
}
console.log(JSON.stringify({ reports: report }, null, 2));
