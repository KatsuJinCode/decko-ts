#!/usr/bin/env node
// tools/d1-trickle/snapshot-bunny.mjs — a local SQLite snapshot of a Bunny
// Database (libSQL over Hrana v2), read with a READ-ONLY token, as the
// trickle importer's source deck.
//
//   node tools/d1-trickle/snapshot-bunny.mjs --creds-file <file> --url-key BUNNY_DB_URL \
//        --token-key BUNNY_DB_READ_ONLY_TOKEN --out deck-snapshot.sqlite3
//
// - Refuses unless the token's own claims grant read-only access (its
//   permission claim grants "ro" and nothing that writes), so a run can
//   never write to the database.
// - Copies the schema as the database holds it, then every deck table's
//   rows, paged by rowid. Never copies the rows of session tables (secrets)
//   or of the edge's stored-page table (this deployment does not cache);
//   their tables are created empty.
// - Runs ANALYZE locally, so the importer can copy whole-deck planner
//   statistics to D1.
// - Prints counts only; never a token.

import { DatabaseSync } from "node:sqlite";
import { existsSync, renameSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { readCredsFile, maskSecrets } from "./executors.mjs";
import { rowsNeverCopied, TABLES_SKIPPED } from "./deck-source.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};

/** The JWT payload, decoded; undefined when the token is not a JWT. */
export function jwtPayload(token) {
  const part = String(token).split(".")[1];
  if (!part) return undefined;
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

/** A libSQL/Bunny database token that can only read: its permission claim
 *  `p` grants `ro` and nothing that writes (`rw`, `rwa`, `ddl`). */
export function tokenIsReadOnly(token) {
  const p = jwtPayload(token)?.p;
  if (!p || typeof p !== "object") return false;
  return p.ro != null && p.rw == null && p.rwa == null && p.ddl == null;
}

/** Hrana value → JS value (the same mapping the engine's driver uses). */
export function fromHrana(v) {
  switch (v.type) {
    case "null":
      return null;
    case "integer": {
      const b = BigInt(v.value);
      return b >= BigInt(Number.MIN_SAFE_INTEGER) && b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b;
    }
    case "float":
      return Number(v.value);
    case "text":
      return v.value;
    case "blob":
      return Buffer.from(v.base64, "base64");
    default:
      throw new Error(`unknown Hrana value type ${v.type}`);
  }
}

const toHrana = (v) => (typeof v === "number" && Number.isInteger(v) ? { type: "integer", value: String(v) } : v === null ? { type: "null" } : { type: "text", value: String(v) });

async function main() {
  const urlKey = arg("url-key");
  const tokenKey = arg("token-key");
  const out = arg("out");
  const c = readCredsFile(arg("creds-file"), [urlKey, tokenKey]);
  const token = c[tokenKey];
  if (!c[urlKey] || !token) throw new Error("credentials file lacks the named url or token key");
  if (!tokenIsReadOnly(token)) throw new Error("refusing: the token's claims do not grant read-only access only (need p.ro set and p.rw, p.rwa, p.ddl empty)");
  const base = c[urlKey].replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "");
  let posts = 0;
  let bytes = 0;
  const run = async (sql, args = []) => {
    posts += 1;
    const res = await fetch(`${base}/v2/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Accept-Encoding": "gzip, identity" },
      body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: args.map(toHrana) } }, { type: "close" }] }),
    });
    let buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.length;
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
    const text = buf.toString("utf8");
    if (!res.ok) throw new Error(`pipeline ${res.status}: ${maskSecrets(text.slice(0, 300), [token])}`);
    const r = JSON.parse(text).results[0];
    if (r.type !== "ok") throw new Error(`statement failed: ${maskSecrets(JSON.stringify(r.error).slice(0, 300), [token])}`);
    const result = r.response.result;
    return { cols: result.cols.map((x) => x.name), rows: result.rows.map((row) => row.map(fromHrana)) };
  };

  const tmp = `${out}.partial`;
  if (existsSync(tmp)) rmSync(tmp);
  const db = new DatabaseSync(tmp);
  const schema = await run("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid");
  const tables = [];
  for (const [type, name, tbl, sql] of schema.rows) {
    if (TABLES_SKIPPED.has(tbl)) continue;
    if (type !== "table" && type !== "index") continue;
    db.exec(sql);
    if (type === "table") tables.push(name);
  }
  const counts = {};
  db.exec("BEGIN");
  for (const t of tables) {
    if (rowsNeverCopied(t)) {
      counts[t] = "not copied";
      continue;
    }
    let last = -Infinity;
    let n = 0;
    for (;;) {
      const page = await run(`SELECT rowid AS __rowid, * FROM "${t}" WHERE rowid > ? ORDER BY rowid LIMIT 5000`, [last === -Infinity ? -9007199254740991 : last]);
      if (page.rows.length === 0) break;
      const cols = page.cols.slice(1);
      const ins = db.prepare(`INSERT INTO "${t}" (${cols.map((x) => `"${x}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
      for (const row of page.rows) ins.run(...row.slice(1));
      last = Number(page.rows[page.rows.length - 1][0]);
      n += page.rows.length;
      if (page.rows.length < 5000) break;
    }
    counts[t] = n;
  }
  db.exec("COMMIT");
  db.exec("ANALYZE");
  db.close();
  if (existsSync(out)) rmSync(out);
  renameSync(tmp, out);
  console.log(JSON.stringify({ out, tables: counts, pipeline_posts: posts, wire_bytes: bytes }));
}

if (process.argv[1]?.endsWith("snapshot-bunny.mjs")) {
  main().catch((e) => {
    console.error(e?.message ?? e);
    process.exitCode = 1;
  });
}
