// benchmarks/cold-render/instrument-fetch-entry-attribution.ts
// WHAT THIS IS: the consumer census the point-query caller instrument could
// not deliver. That census captures its stack at the DRIVER call, but the
// render's fetch ladder crosses an `await` between the consumer and the
// driver, so every hop attributed to the nearest plumbing name
// ("retrieveFromDb") and the real consumer was invisible. This instrument
// captures the stack at the FETCH-ENGINE ENTRY methods instead — the
// synchronous boundary the consumer itself calls — and holds it for the
// span of the fetch, so every driver hop carries the chain
// "fetchByName('bio') <- viewCode <- ..." with the esbuild-preserved
// function names of the actual render-path consumers.
//
// Run (local mirror first — it reproduces the wire's RT counts and bytes
// exactly, see caller-census-local-probe5.json vs caller-census-probe5.json):
//   node tools/bundle-cold-render-fetch-entry-attribution.mjs
//   node benchmarks/cold-render/measure-fetch-entry-attribution.mjs \
//     --names Home --driver local --db benchmarks/cold-render/trial-deck-mirror-full.sqlite3 \
//     --out benchmarks/cold-render/entry-attribution-local.json

import { readFileSync } from "node:fs";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";

/** Phase labels: the render engine's own methods (view dispatch, verdict
 *  seating, searches, enrichment) push their names so hops from anonymous
 *  view closures still attribute to the engine phase that issued them.
 *  Wrapping every function-valued prototype member is safe for a census:
 *  it preserves `this` and the argument list verbatim. */
function installPhaseInstrument(): void {
  const proto = RenderEngine.prototype as unknown as Record<string, unknown>;
  // Class methods are non-enumerable: getOwnPropertyNames, not Object.keys.
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === "constructor") continue;
    const value = proto[key];
    if (typeof value !== "function") continue;
    proto[key] = function phasePatched(this: unknown, ...args: unknown[]) {
      const frame: Frame = { label: `phase:${key}`, frames: [] };
      spanStack.push(frame);
      const popped = () => {
        const i = spanStack.lastIndexOf(frame);
        if (i !== -1) spanStack.splice(i, 1);
      };
      let result: unknown;
      try {
        result = (value as (...a: unknown[]) => unknown).apply(this, args);
      } catch (err) {
        popped();
        throw err;
      }
      if (result instanceof Promise) return result.finally(popped);
      popped();
      return result;
    };
  }
}

/** Fetch-engine entry methods the consumers call (fetch.ts public
 *  surface; all funnel into fetchWithOptions synchronously). */
const ENTRY_METHODS = [
  "fetch",
  "fetchById",
  "fetchByKey",
  "fetchByName",
  "bracket",
  "quickFetch",
  "cardId",
  "fetchTypeId",
] as const;

type Frame = { label: string; frames: string[] };

/** Module-global span stack: push at entry-method entry (synchronous —
 *  the consumer's frames are on the stack right here), pop in finally.
 *  The driver proxy records the OUTERMOST label still on the stack so a
 *  fetch nested inside another fetch (enrichment ladders) attributes to
 *  the top-level consumer. */
const spanStack: Frame[] = [];

function framesOf(stack: string | undefined, limit: number): string[] {
  if (!stack) return [];
  const out: string[] = [];
  for (const line of stack.split("\n").slice(1)) {
    const l = line.trim();
    if (!l.startsWith("at ")) continue;
    const m = l.match(/^at (?:new )?(?:async )?([A-Za-z_$][\w$]*)?\s*(?:\[as \w+\]\s*)?\(/);
    const name = m?.[1];
    if (!name) continue;
    if (ENTRY_METHODS.includes(name as (typeof ENTRY_METHODS)[number])) continue;
    if (["fetchWithOptions", "retrieveExisting", "updateCache", "results", "retrieveFromCache", "retrieveFromDb"].includes(name)) continue;
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

function installFetchEntryInstrument(): void {
  for (const method of ENTRY_METHODS) {
    const proto = FetchEngine.prototype as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    const original = proto[method];
    if (original === undefined) continue;
    proto[method] = function patched(this: FetchEngine, ...args: unknown[]) {
      const markSummary = args
        .slice(0, 2)
        .map((a) => {
          if (a === null || a === undefined) return String(a);
          if (typeof a === "object" && "s" in (a as Record<string, unknown>)) {
            return String((a as { s: unknown }).s);
          }
          if (typeof a === "object") return "record";
          return String(a);
        })
        .join(",");
      const frames = framesOf(new Error("entry").stack, 8);
      const frame: Frame = { label: `${method}(${markSummary})`, frames };
      spanStack.push(frame);
      const popped = () => {
        const i = spanStack.lastIndexOf(frame);
        if (i !== -1) spanStack.splice(i, 1);
      };
      let result: Promise<unknown>;
      try {
        result = original.apply(this, args);
      } catch (err) {
        popped();
        throw err;
      }
      return result.finally(popped);
    };
  }
}

function currentConsumer(): Frame {
  // The OUTERMOST span is the top-level consumer; within it, prefer the
  // innermost fetch-entry label, then the innermost phase label.
  for (let i = spanStack.length - 1; i >= 0; i--) {
    const f = spanStack[i]!;
    if (!f.label.startsWith("phase:")) return f;
  }
  return spanStack[0] ?? { label: "(no entry span)", frames: [] };
}

/** The INNERMOST phase span — the engine method that directly surrounds the
 *  fetch (enrichAndStore, seatUnknownRefReadVerdicts, prepareSearches, ...).
 *  The outermost phase is always `render`, which carries no information. */
function outermostPhase(): string {
  for (let i = spanStack.length - 1; i >= 0; i--) {
    const f = spanStack[i]!;
    if (f.label.startsWith("phase:")) return f.label;
  }
  return "(no phase)";
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

const useLocal = arg("driver", "local") === "local";
const creds = readCreds(arg("creds", "C:/localProjects/brandonDojoTech/library/data/creds"));
const raw = creds.BUNNY_TRIAL_DB_URL;
const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
if (!useLocal && (!raw || !tok)) {
  console.error("FATAL: trial DB url / read-only token missing from creds file");
  process.exit(2);
}
const url = (raw ?? "").replace(/^libsql:\/\//, "https://");

interface Row {
  shape: string;
  consumer: string;
  consumerFrames: string[];
  calls: number;
  marks: string[];
}

const names = arg("names", "Home").split(",").map((s) => s.trim()).filter(Boolean);
const reports: unknown[] = [];

installFetchEntryInstrument();
installPhaseInstrument();

for (const name of names) {
  const byConsumer = new Map<string, Row>();
  let statements = 0;
  let roundTrips = 0;
  const record = (sql: string, params: unknown[]): void => {
    statements += 1;
    const who = currentConsumer();
    const phase = outermostPhase();
    const shape = sql.replace(/\s+/g, " ").trim().slice(0, 110);
    // Aggregate by consumer CODE PATH (method + phase), not by mark, so the
    // per-name scatter collapses into the seam counts that decide the fix.
    const method = who.label.replace(/\(.*$/, "(");
    const key = `${shape} :: ${method} :: ${phase}`;
    const row = byConsumer.get(key) ?? {
      shape,
      consumer: `${method} :: ${phase}`,
      consumerFrames: who.frames,
      calls: 0,
      marks: [],
    };
    row.calls += 1;
    if (row.marks.length < 5) row.marks.push(`${who.label.slice(0, 80)} ${JSON.stringify(params).slice(0, 80)}`);
    byConsumer.set(key, row);
  };

  const proxy: SQLDatabaseDriver = {
    async query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
      roundTrips += 1;
      record(sql, params);
      return base.query<T>(sql, params);
    },
    async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
      roundTrips += 1;
      for (const s of stmts) {
        record(s.sql, (s as { params?: unknown[] }).params ?? []);
      }
      return base.batch(stmts);
    },
  };

  const base: SQLDatabaseDriver = useLocal
    ? new LocalSqliteDriver({
        path: arg("db", "benchmarks/cold-render/trial-deck-mirror-full.sqlite3"),
        readonly: true,
      })
    : new BunnyDbDriver({ url, authToken: tok as string });

  const fetcher = new FetchEngine(proxy);
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

  const rows = [...byConsumer.values()].sort((a, b) => b.calls - a.calls);
  reports.push({
    driver: useLocal ? "local-sqlite-mirror" : "bunny-wire",
    name,
    outcome,
    html_bytes: htmlBytes,
    wall_ms: Math.round(wallMs * 10) / 10,
    round_trips: roundTrips,
    statements_total: statements,
    consumers: rows,
  });
}

const out = arg("out", "");
if (out) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, JSON.stringify({ reports }, null, 2));
  console.error(`wrote ${out}`);
}
console.log(JSON.stringify({ reports }, null, 2));
