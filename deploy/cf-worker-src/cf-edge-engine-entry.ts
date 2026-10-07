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
// Read-only and uncached by configuration (deploy/cf-brandon/wrangler.toml):
// DECKO_WRITE_PATH=0, DECKO_EDGE_CACHE=0, DECKO_EDGE_GLOBAL_CACHE=0.
//
// Build: node tools/bundle-cf-edge-engine.mjs  ->  deploy/dist/cf-edge-engine.bundle.js
// The deploy uploads that file unchanged (no_bundle), so the code measured
// locally in workerd is byte for byte the code Cloudflare runs.

import { handleBunnyEngineRequest, setEdgeDbDriverFactory, type EdgeEnv } from "../bunny-worker-src/bunny-edge-engine-handler.js";
import { recordEdgeDbRoundTrip, edgeDriverQueryCounter } from "../bunny-worker-src/bunny-edge-server-timing.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../src/server/drivers/d1.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";

/** CloudflareD1Adapter with each binding call timed into the edge ledger
 *  (one call = one round trip) and each statement counted. */
class LedgerD1Driver implements SQLDatabaseDriver {
  constructor(private readonly inner: SQLDatabaseDriver) {}

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const t0 = Date.now();
    edgeDriverQueryCounter().recordQuery(sql);
    try {
      return await this.inner.query<T>(sql, params);
    } finally {
      recordEdgeDbRoundTrip(Date.now() - t0);
    }
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const t0 = Date.now();
    for (const s of statements) edgeDriverQueryCounter().recordQuery(s.sql);
    try {
      return await this.inner.batch(statements);
    } finally {
      recordEdgeDbRoundTrip(Date.now() - t0);
    }
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
setEdgeDbDriverFactory(() => {
  if (binding === undefined) throw new Error("D1 binding DB is not configured");
  return new LedgerD1Driver(new CloudflareD1Adapter(binding));
});

/** Placeholder credentials: the shared handler requires a database URL and
 *  token before it boots, but with the factory installed neither is used
 *  for any connection (the page cache tiers that would use them are off). */
const D1_PLACEHOLDER_URL = "https://d1-binding.invalid/DB";
const D1_PLACEHOLDER_TOKEN = "d1-binding";

export default {
  async fetch(request: Request, env: CfEnv): Promise<Response> {
    binding ??= env.DB;
    const vars: EdgeEnv = {};
    for (const [k, v] of Object.entries(env)) if (typeof v === "string") vars[k] = v;
    vars.DECKO_DB_URL = D1_PLACEHOLDER_URL;
    vars.DECKO_DB_TOKEN = D1_PLACEHOLDER_TOKEN;
    const response = await handleBunnyEngineRequest(request, vars);
    if (vars.DECKO_PARTIAL_DECK !== "1") return response;
    // While the trickle import is still running, pages outside the import's
    // manifest can render with cards missing. Mark every answer so nothing
    // indexes or trusts it; the switch to the full deck sets this to "0".
    const marked = new Response(response.body, response);
    marked.headers.set("X-Decko-Deck", "partial");
    marked.headers.set("X-Robots-Tag", "noindex");
    return marked;
  },
};
