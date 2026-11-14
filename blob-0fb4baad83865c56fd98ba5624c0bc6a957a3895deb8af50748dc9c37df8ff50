// benchmarks/cold-render/dump-trial-deck-full-to-local-sqlite.ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

// src/card/drivers/bunny-db.ts
var BunnyDbError = class extends Error {
  /** HTTP status when the failure was transport-level; undefined for
   *  in-band server-reported errors that came back with 200 OK. */
  status;
  /** Server-reported code (Hrana error code string) when available. */
  code;
  /** Zero-based pipeline index of the failing statement when known. */
  statementIndex;
  constructor(message, opts = {}) {
    super(message);
    this.name = "BunnyDbError";
    this.status = opts.status;
    this.code = opts.code;
    this.statementIndex = opts.statementIndex;
  }
};
var NoopBunnyDbQueryCounter = class {
  recordQuery(_sql) {
  }
  count() {
    return 0;
  }
  reset() {
  }
};
var DEFAULT_NOOP_COUNTER = new NoopBunnyDbQueryCounter();
var BunnyDbDriver = class {
  pipelineUrl;
  authToken;
  timeoutMs;
  fetchImpl;
  counter;
  constructor(options = {}) {
    const { url: url2, authToken, timeoutMs, fetchImpl, queryCounter } = options;
    const resolvedUrl = url2 ?? readEnv("BUNNY_DB_URL");
    if (resolvedUrl === void 0 || resolvedUrl.trim() === "") {
      throw new BunnyDbError(
        "BunnyDbDriver: no URL configured (set BUNNY_DB_URL or pass options.url)"
      );
    }
    const base = resolvedUrl.trim().replace(/\/+$/, "");
    this.pipelineUrl = base.endsWith("/v2/pipeline") ? base : `${base}/v2/pipeline`;
    const resolvedToken = authToken ?? readEnv("BUNNY_DB_TOKEN");
    if (resolvedToken !== void 0 && resolvedToken !== "") {
      this.authToken = resolvedToken;
    }
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl ?? fetch.bind(globalThis);
    this.counter = queryCounter ?? DEFAULT_NOOP_COUNTER;
  }
  async query(sql, params) {
    this.counter.recordQuery(sql);
    const results = await this.pipeline([
      { type: "execute", stmt: toHranaStmt(sql, params) },
      { type: "close" }
    ]);
    const first = results[0];
    return execResultToQueryResult(first);
  }
  async batch(statements) {
    if (statements.length === 0) return [];
    for (const s of statements) this.counter.recordQuery(s.sql);
    const requests = statements.map((s) => ({
      type: "execute",
      stmt: toHranaStmt(s.sql, s.params)
    }));
    requests.push({ type: "close" });
    const results = await this.pipeline(requests);
    return results.slice(0, statements.length).map((r) => execResultToQueryResult(r));
  }
  /** Read the current accumulated query count from the instrumentation
   *  hook. Returns 0 when no counter was injected and the no-op default
   *  is in use. */
  queryCount() {
    return this.counter.count();
  }
  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------
  /** Send one pipeline POST and decode every response entry. */
  async pipeline(requests) {
    const headers = { "content-type": "application/json" };
    if (this.authToken !== void 0) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    let response;
    try {
      response = await this.fetchImpl(this.pipelineUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ requests }),
        signal: this.timeoutMs !== void 0 ? AbortSignal.timeout(this.timeoutMs) : void 0
      });
    } catch (cause) {
      throw new BunnyDbError(
        `BunnyDb pipeline transport failed: ${describeTransportError(cause)}`
      );
    }
    if (!response.ok) {
      const bodySnippet = (await response.text().catch(() => "")).slice(0, 500);
      throw new BunnyDbError(
        `BunnyDb pipeline request failed: HTTP ${response.status} ${response.statusText}${bodySnippet ? `: ${bodySnippet}` : ""}`,
        { status: response.status }
      );
    }
    const body = await response.json();
    if (body === null || typeof body !== "object" || !Array.isArray(body.results)) {
      throw new BunnyDbError(
        "BunnyDb pipeline response has no results array (protocol violation)"
      );
    }
    if (body.results.length !== requests.length) {
      throw new BunnyDbError(
        `BunnyDb pipeline response count mismatch: sent ${requests.length} requests, got ${body.results.length} results`
      );
    }
    return body.results.map((entry, i) => decodeStreamResult(entry, i, requests[i]));
  }
};
var MIN_I64 = -(2n ** 63n);
var MAX_I64 = 2n ** 63n - 1n;
function toHranaStmt(sql, params) {
  return { sql, args: params.map(toHranaWireValue), want_rows: true };
}
function toHranaWireValue(value) {
  if (value === null) return { type: "null" };
  if (typeof value === "bigint") {
    if (value < MIN_I64 || value > MAX_I64) {
      throw new RangeError(
        `bunny-db: bigint ${value} does not fit in a signed 64-bit integer`
      );
    }
    return { type: "integer", value: value.toString() };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`bunny-db: ${value} is not a finite number`);
    }
    if (Number.isSafeInteger(value)) {
      return { type: "integer", value: value.toString() };
    }
    return { type: "float", value };
  }
  if (typeof value === "string") return { type: "text", value };
  if (value instanceof Uint8Array) {
    return { type: "blob", base64: bytesToBase64(value) };
  }
  throw new TypeError(
    `bunny-db: unsupported parameter type ${describeType(value)}; supported: null, number, bigint, string, Uint8Array`
  );
}
function describeType(value) {
  if (value === void 0) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function bytesToBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64"
  );
}
function decodeStreamResult(entry, index, request) {
  if (entry === null || typeof entry !== "object") {
    throw new BunnyDbError(`BunnyDb pipeline result ${index} is not an object`, {
      statementIndex: index
    });
  }
  const result = entry;
  if (result.type === "ok" || result.type === "response") {
    return decodeStreamResponse(result.response, index, request);
  }
  if (result.type === "error") {
    const message = result.error?.message ?? "unknown server error";
    const code = result.error?.code;
    throw new BunnyDbError(
      `BunnyDb pipeline statement ${index} failed: ${message}${code ? ` (code ${code})` : ""}`,
      { code, statementIndex: index }
    );
  }
  throw new BunnyDbError(
    `BunnyDb pipeline result ${index} has unknown type ${String(result.type)}`,
    { statementIndex: index }
  );
}
function decodeStreamResponse(response, index, request) {
  if (request.type === "close") {
    return null;
  }
  if (response === null || typeof response !== "object") {
    throw new BunnyDbError(`BunnyDb pipeline response ${index} is not an object`, {
      statementIndex: index
    });
  }
  const resp = response;
  if (resp.type !== "execute" && resp.type !== void 0) {
    throw new BunnyDbError(
      `BunnyDb pipeline response ${index} has unexpected response type ${String(
        resp.type
      )}`,
      { statementIndex: index }
    );
  }
  const payload = resp.type === void 0 ? resp : resp.result;
  return decodeExecResult(payload, index);
}
function decodeExecResult(payload, index) {
  if (payload === null || typeof payload !== "object") {
    throw new BunnyDbError(
      `BunnyDb execute result ${index} is not an object`,
      { statementIndex: index }
    );
  }
  const p = payload;
  if (!Array.isArray(p.cols) || !Array.isArray(p.rows)) {
    throw new BunnyDbError(
      `BunnyDb execute result ${index} is missing cols/rows`,
      { statementIndex: index }
    );
  }
  const cols = p.cols.map((c, i) => {
    if (typeof c === "string") return { name: c };
    if (c !== null && typeof c === "object" && typeof c.name === "string") {
      const col = c;
      return {
        name: col.name,
        decltype: typeof col.decltype === "string" ? col.decltype : void 0
      };
    }
    throw new BunnyDbError(
      `BunnyDb execute result ${index} column ${i} is malformed`,
      { statementIndex: index }
    );
  });
  const rows = p.rows.map((row, r) => {
    if (!Array.isArray(row)) {
      throw new BunnyDbError(
        `BunnyDb execute result ${index} row ${r} is not an array`,
        { statementIndex: index }
      );
    }
    return row.map((cell, c) => decodeHranaCell(cell, index, r, c));
  });
  const affectedRowCount = typeof p.affected_row_count === "number" ? p.affected_row_count : 0;
  const lastInsertRowId = p.last_insert_rowid === void 0 || p.last_insert_rowid === null ? void 0 : decodeHranaInteger(p.last_insert_rowid, `result ${index} last_insert_rowid`);
  return { cols, rows, affectedRowCount, lastInsertRowId };
}
function decodeHranaCell(cell, index, row, col) {
  if (cell === null || typeof cell !== "object" || typeof cell.type !== "string") {
    throw new BunnyDbError(
      `BunnyDb execute result ${index} cell [${row}][${col}] is not a tagged Hrana value`,
      { statementIndex: index }
    );
  }
  const v = cell;
  switch (v.type) {
    case "null":
      return null;
    case "integer":
      return decodeHranaInteger(v.value, `cell [${row}][${col}]`);
    case "float":
      if (typeof v.value !== "number") {
        throw new BunnyDbError(
          `BunnyDb cell [${row}][${col}] float value is not a number`,
          { statementIndex: index }
        );
      }
      return v.value;
    case "text":
      if (typeof v.value !== "string") {
        throw new BunnyDbError(
          `BunnyDb cell [${row}][${col}] text value is not a string`,
          { statementIndex: index }
        );
      }
      return v.value;
    case "blob":
      if (typeof v.base64 !== "string") {
        throw new BunnyDbError(
          `BunnyDb cell [${row}][${col}] blob base64 is not a string`,
          { statementIndex: index }
        );
      }
      return base64ToBytes(v.base64);
    default:
      throw new BunnyDbError(
        `BunnyDb cell [${row}][${col}] has unknown value type ${v.type}`,
        { statementIndex: index }
      );
  }
}
function decodeHranaInteger(value, what) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") {
    throw new BunnyDbError(`BunnyDb ${what}: integer value is neither string nor number`);
  }
  const big = BigInt(value);
  return isSafeIntegerValue(big) ? Number(big) : big;
}
function isSafeIntegerValue(big) {
  return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER);
}
function base64ToBytes(base64) {
  const buf = Buffer.from(base64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
function execResultToQueryResult(result) {
  const names = result.cols.map((c) => c.name);
  const rows = result.rows.map((cells) => {
    const row = {};
    names.forEach((name, i) => {
      row[name] = cells[i];
    });
    return row;
  });
  return {
    rows,
    rowsAffected: result.affectedRowCount,
    lastInsertRowId: result.lastInsertRowId
  };
}
function readEnv(name) {
  if (typeof process === "undefined" || typeof process.env !== "object") return void 0;
  const v = process.env[name];
  return typeof v === "string" && v !== "" ? v : void 0;
}
function describeTransportError(cause) {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

// benchmarks/cold-render/dump-trial-deck-full-to-local-sqlite.ts
function readCreds(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
var creds = readCreds("C:/localProjects/brandonDojoTech/library/data/creds");
var url = creds.BUNNY_TRIAL_DB_URL.replace(/^libsql:\/\//, "https://");
var tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
var driver = new BunnyDbDriver({ url, authToken: tok });
var SKIP_TABLES = /* @__PURE__ */ new Set([
  "decko_edge_render_cache"
  // the global page-cache tier's store — not engine data
]);
var objects = await driver.query(
  "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
  []
);
var tables = objects.rows.filter(
  (o) => o.type === "table" && !o.name.startsWith("_") && !SKIP_TABLES.has(o.name)
);
console.error(`tables to mirror: ${tables.map((t) => t.name).join(", ")}`);
var OUT = "benchmarks/cold-render/trial-deck-mirror-full.sqlite3";
var db = new Database(OUT);
db.pragma("journal_mode = WAL");
var CHUNK = 2e3;
for (const table of tables) {
  const name = table.name;
  db.exec(`DROP TABLE IF EXISTS "${name}"`);
  if (table.sql) db.exec(table.sql);
  let total = 0;
  const bounds = await driver.query(
    `SELECT MIN(rowid) lo, MAX(rowid) hi FROM "${name}"`,
    []
  );
  const lo = bounds.rows[0]?.lo;
  const hi = bounds.rows[0]?.hi;
  if (lo === null || lo === void 0 || hi === null || hi === void 0) {
    console.error(`${name}: 0 rows`);
    continue;
  }
  for (let from = Math.floor(lo / CHUNK) * CHUNK; from <= hi; from += CHUNK) {
    const page = await driver.query(
      `SELECT * FROM "${name}" WHERE rowid >= ? AND rowid < ? ORDER BY rowid`,
      [from, from + CHUNK]
    );
    if (page.rows.length === 0) break;
    if (total === 0) {
      const first = page.rows[0];
      const cols = Object.keys(first);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const ph = cols.map(() => "?").join(", ");
      insert = db.prepare(`INSERT INTO "${name}" (${colList}) VALUES (${ph})`);
    }
    db.exec("BEGIN");
    for (const row of page.rows) {
      insert.run(...Object.values(row).map((v) => v ?? null));
    }
    db.exec("COMMIT");
    total += page.rows.length;
  }
  console.error(`${name}: ${total} rows`);
}
var insert;
for (const idx of objects.rows.filter((o) => o.type === "index" && o.sql)) {
  try {
    db.exec(idx.sql);
  } catch (e) {
    console.error(`index ${idx.name}: ${e.message.slice(0, 100)}`);
  }
}
db.close();
console.error(`wrote ${OUT}`);
