// tools/d1-trickle/closure-render.ts — render ONE page in a fresh process
// through the edge handler's page path (anonymous GET, the path the Worker
// serves), against a local SQLite deck, recording every statement the deck
// boot and the render send together with the rows each returned.
//
// Built and spawned by closure.mjs; not meant to be run by hand:
//   node <built closure-render.mjs> --db <sqlite> --path /About --transcript <jsonl> --out <html>
//
// Prints one line: CLOSURE-RENDER {"status":200,"statements":N,...}

import { writeFileSync, appendFileSync } from "node:fs";
import { NodeSqliteDriver } from "../../benchmarks/speed-ship/node-sqlite-driver.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";

const argv = process.argv.slice(2);
const arg = (k: string, d = "") => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const dbPath = arg("db");
const path = arg("path", "/");
const transcript = arg("transcript");
const out = arg("out");

const base = new NodeSqliteDriver(dbPath, true);
let statements = 0;
const record = (sql: string, params: unknown[], r: SQLQueryResult) => {
  statements += 1;
  if (transcript) appendFileSync(transcript, JSON.stringify({ sql, params: params ?? [], rows: r.rows }) + "\n");
};
const recording: SQLDatabaseDriver = {
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const r = await base.query<T>(sql, params);
    record(sql, params, r as SQLQueryResult);
    return r;
  },
  async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
    const r = await base.batch(stmts);
    stmts.forEach((s, i) => record(s.sql, s.params ?? [], r[i]));
    return r;
  },
};

let status = 0;
let html = "";
let error = "";
try {
  const deck = await bootEdgeServingEngines(recording);
  const response = await handleEngineRequest(new Request(`https://edge.test${path}`), deck, { anonymous: true });
  status = response.status;
  html = await response.text();
} catch (e) {
  error = String((e as Error)?.stack ?? e).slice(0, 400);
}
if (out) writeFileSync(out, html);
process.stdout.write(`CLOSURE-RENDER ${JSON.stringify({ path, status, statements, bytes: html.length, error })}\n`);
