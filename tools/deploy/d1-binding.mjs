// d1-binding.mjs — a D1DatabaseLike binding for the build step, over either
// the Cloudflare D1 REST API or a local Miniflare D1.
//
// The engine's D1 adapter (src/server/drivers/d1.ts CloudflareD1Adapter) takes
// anything with the D1 binding's shape: prepare(sql).bind(...).all()/run(), and
// batch(statements). The build step needs the same engine code path that a
// Worker runs, so the build reaches the database through that adapter, and
// this file is only the transport underneath it:
//
//   - d1HttpBinding: the D1 REST API (POST /accounts/{id}/d1/database/{db}/query),
//     through the executor tools/d1-trickle/executors.mjs already ships and
//     tests. Needs a token with D1 edit rights in CLOUDFLARE_API_TOKEN.
//   - miniflareBinding: a local D1 in Miniflare's workerd, persisted under a
//     directory. Used by the local tests; never touches the remote account.
//
// A batch over the REST API runs its statements one request each, in order:
// the REST query endpoint does not take a transaction. The build's statements
// are per-card and re-runnable (the index is derived data and a rerun rebuilds
// it), so a failure part-way leaves a partial index and an unwritten marker,
// which the next run replaces. The marker is written last, so a deck whose
// marker says current has a complete index.

import { D1HttpExecutor } from "../d1-trickle/executors.mjs";

/** One prepared statement: the SQL and the values bound so far. */
class Statement {
  constructor(transport, sql, params = []) {
    this.transport = transport;
    this.sql = sql;
    this.params = params;
  }

  bind(...values) {
    return new Statement(this.transport, this.sql, values);
  }

  async all() {
    return this.transport.exec(this.sql, this.params);
  }

  async run() {
    return this.transport.exec(this.sql, this.params);
  }
}

/** The binding the engine's adapter reads, over any transport with exec(sql, params). */
class Binding {
  constructor(transport) {
    this.transport = transport;
  }

  prepare(sql) {
    return new Statement(this.transport, sql, []);
  }

  async batch(statements) {
    const out = [];
    for (const s of statements) out.push(await s.run());
    return out;
  }
}

/** A binding over the Cloudflare D1 REST API. The token is read from the
 *  argument or CLOUDFLARE_API_TOKEN; nothing is printed. */
export function d1HttpBinding({ accountId, databaseId, apiToken = process.env.CLOUDFLARE_API_TOKEN, fetchImpl } = {}) {
  if (!accountId) throw new Error("d1HttpBinding needs an account id (--d1-account)");
  if (!databaseId) throw new Error("d1HttpBinding needs a database id (--d1-database)");
  if (!apiToken) throw new Error("d1HttpBinding needs CLOUDFLARE_API_TOKEN in the environment");
  const executor = new D1HttpExecutor({ accountId, apiToken, databaseId, fetchImpl });
  const transport = {
    async exec(sql, params) {
      const { results, meta } = await executor.run(sql, params);
      return { success: true, results: results ?? [], meta };
    },
  };
  return new Binding(transport);
}

/** A binding over a local Miniflare D1 database. Returns { binding, dispose }.
 *  persistDir keeps the database between runs; dbName names it. */
export async function miniflareBinding({ persistDir, dbName = "decko-nest-index" }) {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('') } }",
      d1Databases: { DB: dbName },
      resourcePersistencePath: persistDir,
      compatibilityDate: "2026-09-01",
    }),
  );
  const db = await mf.getD1Database("DB");
  return { binding: db, dispose: () => mf.dispose() };
}

/**
 * Builds (or confirms) the stored nest index on a D1 binding, through the
 * engine's own D1 adapter and the same ensureNestIndex the Node host runs, and
 * returns the marker read afterwards. `dist` is the compiled engine's root.
 */
export async function buildNestIndexOnBinding(binding, dist) {
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const at = (rel) => pathToFileURL(path.join(dist, rel)).href;
  const { CloudflareD1Adapter } = await import(at("src/server/drivers/d1.js"));
  const { FetchEngine } = await import(at("src/card/fetch.js"));
  const { applyDeckInflections } = await import(at("src/card/name/inflect.js"));
  const { CARD_GEM_INITIALIZER_INFLECTIONS } = await import(at("src/card/name/oracle-deck-inflections.js"));
  const { ensureNestIndex, readNestIndexMarker } = await import(at("src/card/nest-index.js"));
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  const driver = new CloudflareD1Adapter(binding);
  const fetcher = new FetchEngine(driver);
  const install = await ensureNestIndex(driver, fetcher.lexicon);
  return { install, marker: await readNestIndexMarker(driver) };
}
