// A D1DatabaseLike over Cloudflare's D1 HTTP API, so CloudflareD1Adapter
// can run outside a Worker against a hosted D1 database (used by the hosted
// conformance runner, tools/hosted-conformance/).
//
// Endpoint: POST <queryUrl>, where queryUrl is
//   https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query
// with body { sql, params } for one statement or { batch: [{ sql, params }] }
// for several. Cloudflare documents the batch form as one SQL transaction:
// the statements run in order and a failure rolls the whole batch back,
// which is the atomicity CloudflareD1Adapter requires of batch(). The
// response is { success, errors, result: [ { results, success, meta } ] },
// one result per statement.

import type { D1BindValue, D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../../src/server/drivers/d1.js";

export interface D1RestOptions {
  queryUrl: string;
  apiToken: string;
  fetch?: typeof fetch;
}

interface RestStatement {
  sql: string;
  params: unknown[];
}

interface RestEnvelope {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: D1ResultLike[];
}

function jsonParam(value: D1BindValue): unknown {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    throw new Error("D1 HTTP API: BLOB parameters cannot be sent as JSON");
  }
  return value;
}

export class D1RestDatabase implements D1DatabaseLike {
  private readonly queryUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: D1RestOptions) {
    this.queryUrl = options.queryUrl;
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetch ?? fetch;
  }

  prepare(sql: string): D1PreparedStatementLike {
    return this.statement({ sql, params: [] });
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    const body = statements.map((s) => (s as RestPrepared).rest);
    return this.post({ batch: body }, body.length);
  }

  private statement(rest: RestStatement): RestPrepared {
    const run = async () => (await this.post(rest, 1))[0];
    const prepared: RestPrepared = {
      rest,
      bind: (...values: D1BindValue[]) => this.statement({ sql: rest.sql, params: values.map(jsonParam) }),
      run,
      all: run,
    };
    return prepared;
  }

  private async post(body: unknown, expected: number): Promise<D1ResultLike[]> {
    const response = await this.fetchImpl(this.queryUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let envelope: RestEnvelope;
    try {
      envelope = JSON.parse(text) as RestEnvelope;
    } catch {
      throw new Error(`D1 HTTP API: HTTP ${response.status}, not JSON: ${text.slice(0, 200)}`);
    }
    if (!response.ok || envelope.success === false) {
      const messages = (envelope.errors ?? []).map((e) => e.message ?? String(e.code)).join("; ");
      throw new Error(`D1 HTTP API: HTTP ${response.status}: ${messages || text.slice(0, 200)}`);
    }
    const results = envelope.result ?? [];
    if (results.length !== expected) {
      throw new Error(`D1 HTTP API: expected ${expected} results, got ${results.length}`);
    }
    return results;
  }
}

interface RestPrepared extends D1PreparedStatementLike {
  readonly rest: RestStatement;
}
