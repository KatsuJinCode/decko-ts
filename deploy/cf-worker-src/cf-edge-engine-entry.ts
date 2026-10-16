// deploy/cf-worker-src/cf-edge-engine-entry.ts — the Bunny edge engine's
// request handler, served as a Cloudflare Worker over a D1 binding.
//
// Same handler, same routes, same live render path, same Server-Timing
// header as the Bunny edge script (bunny-edge-engine-handler.ts); only the
// database seam differs. Bunny reads through BunnyDbDriver (Hrana v2 over
// fetch); here every read goes through the D1 binding `env.DB` via
// CloudflareD1Adapter, timed into the same per-isolate ledger so
// Server-Timing's db/stmt mean the same thing on both hosts.
//
// Read-only and uncached by configuration (the D1 deploy's wrangler config:
// DECKO_WRITE_PATH=0, DECKO_EDGE_CACHE=0, DECKO_EDGE_GLOBAL_CACHE=0).
//
// Build: node tools/bundle-cf-edge-engine.mjs  ->  deploy/dist/cf-edge-engine.bundle.js
// The deploy uploads that file unchanged (no_bundle), so the code measured
// locally in workerd is byte for byte the code Cloudflare runs.

import { handleBunnyEngineRequest, setEdgeDbDriverFactory, type EdgeEnv } from "../bunny-worker-src/bunny-edge-engine-handler.js";
import {
  edgeDbLedgerSnapshot,
  edgeDriverQueryCounter,
  recordEdgeDbBindingCall,
  recordEdgeDbDriverOp,
} from "../bunny-worker-src/bunny-edge-server-timing.js";
import { setEdgeHostLabels } from "../bunny-worker-src/edge-host-labels.js";
import {
  CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS,
  setPbkdf2IterationLimit,
} from "../../src/card/auth/password-hash.js";
import { CloudflareD1Adapter, type D1DatabaseLike, type D1PreparedStatementLike } from "../../src/server/drivers/d1.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../src/server/driver.js";

/** THE BINDING BOUNDARY: every D1 round trip is
 *  timed and counted where it physically happens — the binding call — not
 *  at the driver interface. One logical driver operation can issue several
 *  binding batches: a serving read before the transaction-state table is
 *  installed sends a lock-state probe batch that FAILS ("no such table")
 *  and then a fallback batch; a serving read that finds an expired lease
 *  runs the repair batches and re-reads; inside a transaction the journal's
 *  begin, commit and rollback are binding batches of their own. None of
 *  these pass through a driver query()/batch() call, so counting there
 *  undercounted (the reproduction: one driver query over a fresh
 *  database, two binding batches on the wire — and the old wrapper also
 *  missed the journal's begin/commit entirely). The adapter can only reach
 *  D1 through prepare()/batch() on its binding and run()/all() on a
 *  prepared statement, so wrapping those three catches every call, failed
 *  ones included (recorded in `finally`, before the rejection propagates).
 *  Each statement's count is what the call physically carried: a batch's
 *  full prepared list — the adapter's appended `SELECT changes()` rows, the
 *  lock-state probe, lease fences and ownership asserts included. */
export function ledgeredBinding(db: D1DatabaseLike): D1DatabaseLike {
  // A prepared statement the adapter receives from THIS binding is the
  // wrapper; the batch() call must hand the real binding its own prepared
  // statements back, so the wrapper keeps the mapping.
  const innerOf = new WeakMap<D1PreparedStatementLike, D1PreparedStatementLike>();
  const wrap = (inner: D1PreparedStatementLike): D1PreparedStatementLike => {
    const invoke = async <T>(call: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      try {
        return await call();
      } finally {
        recordEdgeDbBindingCall(Date.now() - t0, 1);
      }
    };
    const prepared: D1PreparedStatementLike = {
      // D1 bind() returns a NEW prepared statement. Keep that returned
      // handle and its independent bindings, including for later batch().
      bind: (...values) => wrap(inner.bind(...values)),
      run: () => invoke(() => inner.run()),
      all: () => invoke(() => inner.all()),
    };
    innerOf.set(prepared, inner);
    return prepared;
  };
  return {
    prepare: (sql: string) => wrap(db.prepare(sql)),
    async batch(statements) {
      const t0 = Date.now();
      try {
        return await db.batch(statements.map((s) => innerOf.get(s) ?? s));
      } finally {
        recordEdgeDbBindingCall(Date.now() - t0, statements.length);
      }
    },
  };
}

/** CloudflareD1Adapter over the ledgered binding. The wrapper's own methods
 *  are the LOGICAL view, kept under separate labels so the two counts stay
 *  distinguishable: `stmt` on Server-Timing stays the deck
 *  driver's statement counter exactly as dashboards know it, and each
 *  query()/batch()/transaction() invocation is one driver operation.
 *  Round-trip wall time is recorded at the binding (ledgeredBinding), not
 *  here — so `db;dur` covers the journal's and serving path's own batches
 *  too, which the previous per-call timing never saw. */
export class LedgerD1Driver implements SQLDatabaseDriver {
  constructor(private readonly inner: SQLDatabaseDriver) {}

  get transactionGuarantee(): SQLTransactionGuarantee | undefined {
    return this.inner.transactionGuarantee;
  }

  async transaction<R>(work: () => Promise<R>): Promise<R> {
    if (this.inner.transaction === undefined) throw new Error("the wrapped D1 driver has no transaction()");
    recordEdgeDbDriverOp();
    return this.inner.transaction(work);
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    edgeDriverQueryCounter().recordQuery(sql);
    recordEdgeDbDriverOp();
    return await this.inner.query<T>(sql, params);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (const s of statements) edgeDriverQueryCounter().recordQuery(s.sql);
    recordEdgeDbDriverOp();
    return await this.inner.batch(statements);
  }
}

interface CfEnv {
  DB: D1DatabaseLike;
  [name: string]: unknown;
}

// The binding object is the same for every request an isolate serves; it is
// captured on the first request because Workers hands bindings to fetch(),
// not to module scope. It is a handle, not data: nothing read is kept.
let binding: D1DatabaseLike | undefined;
// Cloudflare's production runtime refuses PBKDF2 above 100,000 iterations
// (cloudflare/workerd issue 1346), so new password hashes use that count here
// (docs/SECURITY.md, "Passwords").
setPbkdf2IterationLimit({ iterations: CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS, runtime: "Cloudflare Workers" });

setEdgeHostLabels({
  runtime: "cloudflare-workers",
  driver: "CloudflareD1Adapter (D1 binding, one batch() per round trip)",
  binding: "DB",
});
setEdgeDbDriverFactory(() => {
  if (binding === undefined) throw new Error("D1 binding DB is not configured");
  return new LedgerD1Driver(new CloudflareD1Adapter(ledgeredBinding(binding)));
});

/** How D1 counts its per-invocation query limit (50 on the free plan) is not
 *  documented: per binding call, or per statement inside a batch(). This
 *  probe answers it on the real platform. Off unless DECKO_CF_PROBE=1.
 *  Read-only: it runs `SELECT ?` and touches no table.
 *    /_d1probe?mode=batch&n=60   one batch() of n statements
 *    /_d1probe?mode=calls&n=60   n separate calls of one statement each */
async function d1LimitProbe(request: Request, db: D1DatabaseLike): Promise<Response> {
  const url = new URL(request.url);
  const n = Math.min(500, Math.max(1, Number(url.searchParams.get("n") ?? "60")));
  const mode = url.searchParams.get("mode") === "calls" ? "calls" : "batch";
  let done = 0;
  try {
    if (mode === "batch") {
      const rs = await db.batch(Array.from({ length: n }, (_, i) => db.prepare("SELECT ? AS v").bind(i)));
      done = rs.length;
    } else {
      for (let i = 0; i < n; i++) {
        await db.prepare("SELECT ? AS v").bind(i).all();
        done += 1;
      }
    }
    return Response.json({ mode, n, ok: true, done });
  } catch (e) {
    return Response.json({ mode, n, ok: false, done, error: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}

/** Placeholder credentials: the shared handler requires a database URL and
 *  token before it boots, but with the factory installed neither is used
 *  for any connection (the page cache tiers that would use them are off). */
const D1_PLACEHOLDER_URL = "https://d1-binding.invalid/DB";
const D1_PLACEHOLDER_TOKEN = "d1-binding";

export default {
  async fetch(request: Request, env: CfEnv): Promise<Response> {
    binding ??= env.DB;
    if (env.DECKO_CF_PROBE === "1" && new URL(request.url).pathname === "/_d1probe") {
      return await d1LimitProbe(request, env.DB);
    }
    const vars: EdgeEnv = {};
    for (const [k, v] of Object.entries(env)) if (typeof v === "string") vars[k] = v;
    vars.DECKO_DB_URL = D1_PLACEHOLDER_URL;
    vars.DECKO_DB_TOKEN = D1_PLACEHOLDER_TOKEN;
    const before = edgeDbLedgerSnapshot();
    const response = await handleBunnyEngineRequest(request, vars);
    const marked = new Response(response.body, response);
    // Database round trips for this request: D1 binding calls, counted at
    // the binding — the serving path's probe-then-fallback
    // pair before the transaction-state table exists counts as the two
    // round trips it is, and so do lease repairs and the transaction
    // journal's own begin/commit batches. Server-Timing's stmt counts the
    // logical statements the driver was asked to run and wire= counts what
    // the binding physically received, so per-trip cost is db.dur / trips
    // and per-trip width is wire / trips. (Exact when requests do not
    // overlap in the isolate, as the ledger's own contract says.)
    marked.headers.set("X-Decko-Db-Trips", String(Math.max(0, edgeDbLedgerSnapshot().posts - before.posts)));
    if (vars.DECKO_PARTIAL_DECK === "1") {
      // While the trickle import is still running, pages outside the
      // import's manifest can render with cards missing. Mark every answer
      // so nothing indexes or trusts it; the switch to the full deck sets
      // this to "0".
      marked.headers.set("X-Decko-Deck", "partial");
      marked.headers.set("X-Robots-Tag", "noindex");
    }
    return marked;
  },
};
