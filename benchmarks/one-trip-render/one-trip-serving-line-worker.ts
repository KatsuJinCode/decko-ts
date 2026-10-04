// one-trip-serving-line-worker.ts — the deploy-union serving-line worker
// (deploy/bunny-worker-src/bunny-edge-engine-handler.ts, the
// lane-deploy-union-final-2026-10-03 serving surface) booted LOCALLY for the
// one-trip ON/OFF posture proof (lane-one-trip-serve-2026-10-04).
//
// WHAT THIS IS: the real edge handler behind a real node:http listener, with
// the BunnyDbDriver Hrana-v2 seam stubbed over a LocalSqliteDriver opened on
// the trial-deck mirror copy — the same local seam shape
// tests/deploy/bunny-edge-engine-handler-parity.test.ts established, plus a
// wire-level hop counter (one stub POST = one BunnyDbDriver query/batch call
// = ONE round trip, the hops law's counting boundary) and a per-request
// statement classifier (attach / one-trip data fetch / other).
//
// ONE POSTURE PER PROCESS: --posture off deletes the one-trip gate env;
// --posture on sets DECKO_ONE_TRIP=1 and DECKO_ONE_TRIP_STORE. The handler
// memoizes its deck per module instance, so a fresh process is a fresh deck
// boot — posture isolation by process, no shared engine state.
//
// SELF-TERMINATING: serves exactly the planned GET sequence (plan JSON:
// {"paths":[...]}) then exits 0 — the harness spawns and reaps it without
// ever killing a process. A watchdog exit(3) bounds a hung serve.
//
// Bundle with esbuild (external: better-sqlite3) and run:
//   node one-trip-serving-line-worker.mjs --port 3181 --posture off \
//     --mirror <trial-deck-mirror-readonly-copy.sqlite3> \
//     --plan <plan.json> --out-dir <dir> [--store <one-trip-store.sqlite3>]

import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";

// --- argv ------------------------------------------------------------------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const port = Number(arg("port"));
const posture = arg("posture");
const mirrorPath = arg("mirror");
const planPath = arg("plan");
const outDir = arg("out-dir");
const storePath = arg("store");

if (!Number.isInteger(port) || port <= 0 || (posture !== "off" && posture !== "on") ||
    mirrorPath === undefined || planPath === undefined || outDir === undefined) {
  console.error(
    "usage: node one-trip-serving-line-worker.mjs --port <n> --posture off|on " +
    "--mirror <mirror.sqlite3> --plan <plan.json> --out-dir <dir> [--store <store.sqlite3>]",
  );
  process.exit(2);
}
if (posture === "on" && (storePath === undefined || storePath === "")) {
  console.error("--posture on requires --store <one-trip store path> (precompute, never built here)");
  process.exit(2);
}

// --- posture env (read by render-gate.ts at render time) --------------------
if (posture === "on") {
  process.env.DECKO_ONE_TRIP = "1";
  process.env.DECKO_ONE_TRIP_STORE = storePath as string;
} else {
  delete process.env.DECKO_ONE_TRIP;
  delete process.env.DECKO_ONE_TRIP_STORE;
}

// --- the Hrana seam stub over the mirror ------------------------------------
const driver = new LocalSqliteDriver({ path: mirrorPath, readonly: true });

interface WireExec {
  type: "execute";
  stmt: { sql: string; args: unknown[] };
}
interface WireRequest {
  requests: Array<WireExec | { type: "close" }>;
}

/** Request-scoped hop/class accounting, reset before each request. */
let tripsThisRequest = 0;
let attachThisRequest = 0;
let dataFetchThisRequest = 0;
let otherThisRequest = 0;

const decodeArg = (raw: unknown): unknown => {
  if (raw === null || typeof raw !== "object") return raw;
  const tag = raw as { type?: string; value?: unknown };
  if (tag.type === "null") return null;
  if (tag.type === "integer") return Number(tag.value);
  return tag.value;
};
const encodeCell = (value: unknown): Record<string, unknown> => {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value };
  }
  return { type: "text", value: String(value) };
};

/** The stub BunnyDbDriver fetch lands on: ONE call per pipeline POST, i.e.
 *  one call per driver.query / driver.batch round trip. Every pipeline
 *  request is answered IN ORDER — executes run on the shared mirror
 *  connection (Hrana pipelines are explicitly NOT transactional —
 *  bunny-db.ts), and the pipeline's `close` terminator gets its own ok
 *  result entry (the driver validates sent-requests vs got-results —
 *  measured: "sent 2 requests, got 1 results" 500s when the close entry is
 *  dropped). */
const stubFetch = (async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
  tripsThisRequest += 1;
  const body = JSON.parse(String(init?.body ?? "{}")) as WireRequest;
  const results: unknown[] = [];
  for (const request of body.requests ?? []) {
    if (request.type !== "execute") {
      results.push({ type: "ok", response: { type: "close" } });
      continue;
    }
    const sql = request.stmt.sql;
    if (/^ATTACH DATABASE/i.test(sql)) attachThisRequest += 1;
    else if (/WITH RECURSIVE walk\(id\)/i.test(sql)) dataFetchThisRequest += 1;
    else otherThisRequest += 1;
    const args = (request.stmt.args ?? []).map(decodeArg);
    const result = await driver.query<Record<string, unknown>>(sql, args);
    const cols: string[] = [];
    for (const row of result.rows) {
      for (const key of Object.keys(row)) {
        if (!cols.includes(key)) cols.push(key);
      }
    }
    results.push({
      type: "ok",
      response: {
        type: "execute",
        result: {
          cols: cols.map((name) => ({ name })),
          rows: result.rows.map((row) => cols.map((col) => encodeCell(row[col]))),
          affected_row_count: 0,
        },
      },
    });
  }
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;
// The driver binds globalThis.fetch at CONSTRUCTION (bunny-db.ts); the stub
// must be installed before the first request boots the deck.
globalThis.fetch = stubFetch;

// --- the local edge env bag (fake values; the stub never dials out) ---------
const envBag: Record<string, string> = {
  BUNNY_DATABASE_URL: "https://one-trip-serving-line.localharness/v2/pipeline",
  BUNNY_DATABASE_AUTH_TOKEN: "local-harness-only-not-a-credential",
};

// --- the planned GET sequence ------------------------------------------------
const plan = JSON.parse(readFileSync(planPath, "utf8")) as { paths: string[] };
const paths = plan.paths;
let served = 0;
let seq = 0;

/** Node's IncomingHttpHeaders -> undici HeadersInit (strict-safe). */
const toHeadersInit = (raw: IncomingHttpHeaders): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return out;
};

const server = createServer((req, res) => {
  const startedAt = Date.now();
  const url = `http://127.0.0.1:${port}${req.url ?? "/"}`;
  const request = new Request(url, { method: req.method, headers: toHeadersInit(req.headers) });
  tripsThisRequest = 0;
  attachThisRequest = 0;
  dataFetchThisRequest = 0;
  otherThisRequest = 0;
  void handleBunnyEngineRequest(request, envBag)
    .then(async (response) => {
      const body = Buffer.from(await response.arrayBuffer());
      const trips = tripsThisRequest;
      const attach = attachThisRequest;
      const dataFetch = dataFetchThisRequest;
      const other = otherThisRequest;
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      headers["x-decko-serve-trips"] = String(trips);
      headers["x-decko-serve-statements"] = String(attach + dataFetch + other);
      headers["content-length"] = String(body.byteLength);
      res.writeHead(response.status, headers);
      res.end(body);
      seq += 1;
      appendFileSync(
        `${outDir}/requests.jsonl`,
        JSON.stringify({
          seq,
          method: req.method,
          path: req.url,
          status: response.status,
          trips,
          attach,
          dataFetch,
          other,
          wallMs: Date.now() - startedAt,
          responseBytes: body.byteLength,
          posture,
        }) + "\n",
      );
      served += 1;
      if (served >= paths.length) {
        server.close(() => {
          driver.close();
          process.exit(0);
        });
        server.closeAllConnections();
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { "content-type": "text/plain", "content-length": String(message.length) });
      res.end(message);
      seq += 1;
      appendFileSync(
        `${outDir}/requests.jsonl`,
        JSON.stringify({ seq, method: req.method, path: req.url, status: 500, error: message, posture }) + "\n",
      );
      served += 1;
      if (served >= paths.length) {
        server.close(() => {
          driver.close();
          process.exit(0);
        });
        server.closeAllConnections();
      }
    });
});

// Watchdog: a hung serve exits 3; the parent reports it, never kills.
setTimeout(() => {
  console.error(`WORKER TIMEOUT posture=${posture} served=${served}/${paths.length}`);
  process.exit(3);
}, 15 * 60_000).unref();

server.listen(port, "127.0.0.1", () => {
  console.log(`SERVING posture=${posture} port=${port} planned=${paths.length} trips_boundary=stub_post`);
});
