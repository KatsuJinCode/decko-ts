// tools/d1-trickle/executors.mjs — where the importer's statements go.
//
//   D1HttpExecutor       Cloudflare's D1 REST API (POST .../d1/database/{id}/query)
//                        with an API token and account id passed EXPLICITLY.
//                        It never reads wrangler's login, so it cannot reach an
//                        account nobody named.
//   MiniflareD1Executor  local D1 inside Miniflare (workerd's own D1), for tests
//                        and for the local end-to-end run.
//
// Both answer run(sql, params) with { results, meta } in D1's shape, where
// meta carries rows_read and rows_written as D1 counts them.

import { readFileSync } from "node:fs";

const API = "https://api.cloudflare.com/client/v4";

/** KEY=VALUE (or KEY: VALUE) lines; only the named keys are returned. */
export function readCredsFile(path, keys) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (m && keys.includes(m[1])) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Replace any secret that appears in a message before it is printed. */
export function maskSecrets(text, secrets) {
  let s = String(text);
  for (const v of secrets) if (v && v.length >= 6) s = s.split(v).join(`${v.slice(0, 2)}…(masked)`);
  return s;
}

export class D1HttpExecutor {
  constructor({ accountId, apiToken, databaseId, fetchImpl = globalThis.fetch, maxAttempts = 4 }) {
    if (!accountId || !apiToken) throw new Error("D1HttpExecutor needs an explicit account id and API token");
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.databaseId = databaseId;
    this.fetch = fetchImpl;
    this.maxAttempts = maxAttempts;
    this.requests = 0;
  }

  mask(text) {
    return maskSecrets(text, [this.apiToken]);
  }

  async api(method, path, body) {
    let lastErr;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      this.requests += 1;
      const res = await this.fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      if (res.ok && json?.success !== false) return json;
      const detail = this.mask(json?.errors ? JSON.stringify(json.errors) : text.slice(0, 500));
      lastErr = new Error(`Cloudflare API ${method} ${path} -> ${res.status}: ${detail}`);
      lastErr.status = res.status;
      // Retry only what can succeed later: rate limits and server errors.
      if (res.status !== 429 && res.status < 500) throw lastErr;
      const wait = Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 20_000)));
    }
    throw lastErr;
  }

  async listDatabases(name) {
    const q = name ? `?name=${encodeURIComponent(name)}` : "";
    return (await this.api("GET", `/accounts/${this.accountId}/d1/database${q}`)).result ?? [];
  }

  async createDatabase(name) {
    return (await this.api("POST", `/accounts/${this.accountId}/d1/database`, { name })).result;
  }

  async run(sql, params = []) {
    if (!this.databaseId) throw new Error("no database id");
    const json = await this.api("POST", `/accounts/${this.accountId}/d1/database/${this.databaseId}/query`, { sql, params });
    const r = Array.isArray(json.result) ? json.result[json.result.length - 1] : json.result;
    // A multi-statement sql answers one result per statement; sum the meta.
    const meta = { rows_read: 0, rows_written: 0 };
    for (const x of Array.isArray(json.result) ? json.result : [json.result]) {
      meta.rows_read += Number(x?.meta?.rows_read ?? 0);
      meta.rows_written += Number(x?.meta?.rows_written ?? 0);
      if (x?.meta?.size_after !== undefined) meta.size_after = x.meta.size_after;
    }
    return { results: r?.results ?? [], meta };
  }

  /** Account-wide D1 rows read and written today (UTC), from the GraphQL
   *  analytics API. Needs the token's Account Analytics read permission;
   *  returns undefined when the token cannot read it. */
  async accountUsageToday(day) {
    const query = `query($a: string!, $d: Date!) { viewer { accounts(filter: {accountTag: $a}) { d1AnalyticsAdaptiveGroups(limit: 10000, filter: {date_geq: $d, date_leq: $d}) { sum { rowsRead rowsWritten } } } } }`;
    try {
      const json = await this.api("POST", "/graphql", { query, variables: { a: this.accountId, d: day } });
      const groups = json?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
      if (!Array.isArray(groups)) return undefined;
      return groups.reduce(
        (s, g) => ({ rowsRead: s.rowsRead + Number(g.sum.rowsRead ?? 0), rowsWritten: s.rowsWritten + Number(g.sum.rowsWritten ?? 0) }),
        { rowsRead: 0, rowsWritten: 0 },
      );
    } catch {
      return undefined;
    }
  }

  async close() {}
}

export class MiniflareD1Executor {
  /** persistDir: where Miniflare keeps the local D1 (reused by the local
   *  Worker run). dbName: the D1 database id inside it. */
  static async open({ persistDir, dbName = "decko-trial-deployment" }) {
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
    return new MiniflareD1Executor(mf, db);
  }

  constructor(mf, db) {
    this.mf = mf;
    this.db = db;
    this.requests = 0;
  }

  async run(sql, params = []) {
    this.requests += 1;
    const r = await this.db.prepare(sql).bind(...params).all();
    return { results: r.results ?? [], meta: { rows_read: Number(r.meta?.rows_read ?? 0), rows_written: Number(r.meta?.rows_written ?? 0), size_after: r.meta?.size_after } };
  }

  async accountUsageToday() {
    return undefined;
  }

  async close() {
    await this.mf.dispose();
  }
}
