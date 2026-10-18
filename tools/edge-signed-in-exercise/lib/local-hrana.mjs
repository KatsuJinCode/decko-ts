// local-hrana.mjs — a Hrana v2 pipeline endpoint backed by a LOCAL SQLite
// file, for the Bunny edge bundle's BunnyDbDriver.
//
// The deployed edge talks to Bunny Database over POST /v2/pipeline with
// tagged Hrana wire values and baton-continued interactive transactions
// (src/card/drivers/bunny-db.ts documents the protocol). This server answers
// that protocol from one better-sqlite3 connection, so the bundle runs
// unmodified against a local copy of the deck instead of a billed database.
//
// Wire shape (the driver decodes exactly this):
//   request : {"baton"?: string, "requests": [{"type":"execute","stmt":{"sql","args","want_rows"}} | {"type":"close"}]}
//   response: {"results":[{"type":"ok","response":{"type":"execute","result":{cols,rows,affected_row_count,last_insert_rowid}}}
//                        | {"type":"ok","response":{"type":"close"}}
//                        | {"type":"error","error":{"message","code"}}],
//              "baton"?: string}
// A pipeline whose last request is not "close" keeps the stream open and
// returns a baton (the driver refuses an atomic save without one).
//
// Timing: every statement is timed. Statements at or over SLOW_MS are kept in
// the ledger with their SQL, so a stalled render says which SQL stalled.

import { createServer } from "node:http";
import Database from "better-sqlite3";
import { sqliteRegexpUdf } from "../../../src/cql/sqlite-regexp.ts";

const SLOW_MS = 250;

function decodeArg(a) {
  switch (a?.type) {
    case "null": return null;
    case "integer": return BigInt(String(a.value));
    case "float": return Number(a.value);
    case "text": return String(a.value);
    case "blob": return Buffer.from(String(a.base64 ?? ""), "base64");
    default: throw new Error(`local-hrana: unsupported arg type ${String(a?.type)}`);
  }
}

function encodeCell(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  if (typeof v === "string") return { type: "text", value: v };
  if (v instanceof Uint8Array) return { type: "blob", base64: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
}

/** Runs one execute request and returns its Hrana result entry (ok or error). */
function runExecute(db, sql, rawArgs, ledger) {
  const started = Date.now();
  // The args cap was 80 characters, which silently truncated the argument
  // list of every multi-argument write (a save's `UPDATE cards SET ... WHERE
  // id = ?` never survived it), so any consumer that needs to know WHICH rows
  // a write touched — the save-ladder probe's memo-policy replay, for one —
  // could not read them back. 600 covers the widest statement in the deck
  // (the owner-card save's 20-id `WHERE id IN (...)`). Only the HRANA_TRACE
  // line changes: no request, response, or count is touched, and the only
  // reader of this field (tools/diagnose-owner-save-statement-ladder.mjs)
  // captures `args=(.*)$` to end of line, so a longer line is strictly more
  // information for it.
  if (process.env.HRANA_TRACE === "1") process.stderr.write(`hrana ${sql.replace(/\s+/g, " ").slice(0, 120)} args=${JSON.stringify(rawArgs).slice(0, 600)}\n`);
  let entry;
  try {
    const args = rawArgs.map(decodeArg);
    const statement = db.prepare(sql);
    if (statement.reader) {
      const rows = statement.raw(true).all(...args);
      entry = {
        type: "ok",
        response: {
          type: "execute",
          result: {
            cols: statement.columns().map((c) => ({ name: c.name, decltype: c.type ?? null })),
            rows: rows.map((row) => row.map(encodeCell)),
            affected_row_count: 0,
            last_insert_rowid: null,
          },
        },
      };
    } else {
      const info = statement.run(...args);
      entry = {
        type: "ok",
        response: {
          type: "execute",
          result: {
            cols: [],
            rows: [],
            affected_row_count: info.changes,
            last_insert_rowid: info.lastInsertRowid ? String(info.lastInsertRowid) : null,
          },
        },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    entry = { type: "error", error: { message, code: /database is locked/i.test(message) ? "SQLITE_BUSY" : "SQLITE_ERROR" } };
  }
  const ms = Date.now() - started;
  if (process.env.HRANA_TRACE === "1") {
    const shape = entry.type === "error" ? `ERROR ${entry.error.message}` : `rows=${entry.response.result.rows.length}`;
    process.stderr.write(`hrana   -> ${shape} ${ms}ms\n`);
  }
  ledger.count += 1;
  ledger.totalMs += ms;
  if (ms >= SLOW_MS) {
    ledger.slow.push({
      ms,
      sql: sql.replace(/\s+/g, " "),
      args: rawArgs,
      error: entry.type === "error" ? entry.error.message : undefined,
    });
  }
  return entry;
}

/**
 * Starts the local pipeline endpoint.
 * @param {{ dbPath: string, host?: string, port?: number }} opts
 * @returns {Promise<{ url: string, ledger: { count: number, totalMs: number, slow: Array<{ ms: number, sql: string, error?: string }> }, close: () => Promise<void> }>}
 */
export async function startLocalHrana({ dbPath, host = "127.0.0.1", port = 0 }) {
  const db = new Database(dbPath);
  db.pragma("busy_timeout = 5000");
  // The REGEXP operator, the function libSQL provides natively and better-sqlite3
  // does not. CQL renders `match` as `field REGEXP ?` (src/cql/ast.ts:24), so
  // without this every keyword search died at prepare time with "no such
  // function: REGEXP" and the page answered 500 — an artifact of the local
  // SQLite connection, not of the query the edge runs. Register the PRODUCT'S
  // own UDF (the decided case-insensitive MySQL-flavored semantics,
  // docs/decisions/0005-cql-match-semantics.md) rather than a copy, so local
  // and libSQL answer `X REGEXP Y` the same way. The query itself is unchanged.
  db.function("regexp", { deterministic: true }, sqliteRegexpUdf);
  const ledger = { count: 0, totalMs: 0, slow: [] };
  let batonCounter = 0;

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const send = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (error) {
        send(400, { error: String(error) });
        return;
      }
      const requests = Array.isArray(body?.requests) ? body.requests : [];
      const results = requests.map((request) => {
        if (request?.type === "close") return { type: "ok", response: { type: "close" } };
        if (request?.type !== "execute" || typeof request.stmt?.sql !== "string") {
          return { type: "error", error: { message: "local-hrana: only execute and close are served", code: "UNSUPPORTED" } };
        }
        return runExecute(db, request.stmt.sql, request.stmt.args ?? [], ledger);
      });
      const endsStream = requests.length > 0 && requests[requests.length - 1]?.type === "close";
      const payload = { results };
      if (!endsStream) {
        batonCounter += 1;
        payload.baton = `local-baton-${batonCounter}`;
      }
      send(200, payload);
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    ledger,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}
