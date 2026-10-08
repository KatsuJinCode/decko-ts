#!/usr/bin/env node
// tools/d1-trickle/closure.mjs — each page's inclusion closure: the smallest
// set of card bundles (beyond the boot tier) with which the page renders
// exactly as it does on the whole deck.
//
// How (a fixpoint, checked by replay, so it never guesses):
//   1. A replica SQLite holds the schema, the small tables, the planner
//      statistics, the boot tier, and the page's set S (empty at first).
//   2. The page is rendered against the replica in a FRESH process through
//      the edge handler's page path, recording every statement and its rows.
//   3. Every recorded statement is re-run against the whole deck. If all
//      answers match, the render read exactly what it would read on the
//      whole deck, so its bytes are the same: the page is "closed" over S.
//   4. Otherwise the card ids in the whole deck's answers to the statements
//      that differed (id, left_id, right_id, type_id, referer_id, ...) are
//      added to S with their name parts, and the page is rendered again.
//   5. If a statement still differs but names no new card (a deck-wide count,
//      say), the page is "needs-full": it is served only once the whole deck
//      is in.
// A closed page is then rendered once against the whole deck and the two
// pages are compared byte for byte (data-slot-id masked), as a second check.
//
//   node tools/d1-trickle/closure.mjs --source deck.sqlite3 --out closures.jsonl \
//        [--fixed] [--pool page-sample-pool.txt --from 0 --limit 100] [--concurrency 2]
//
// Appends one JSON line per page to --out and skips pages already in it, so
// a stopped run resumes. All scratch lives in one temp folder removed on exit.

import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, copyFileSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { openSource, schemaStatements, wholeTables, sqliteStat1Rows, CardGraph, bootBaseIds, bootRefIds } from "./deck-source.mjs";
import { readClosures, DEFAULT_FIXED_PAGES } from "./importer.mjs";
import { readPagePool } from "./deck-source.mjs";
import { idsInRows, witnessSql, maskSlots } from "./trickle-lib.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const source = resolve(arg("source"));
const outPath = resolve(arg("out"));
const maxIter = Number(arg("max-iter", "16"));
const concurrency = Number(arg("concurrency", "2"));

const shape = (sql) => sql.replace(/\s+/g, " ").slice(0, 120);

const scratch = mkdtempSync(join(tmpdir(), "d1-closure-"));
const cleanup = () => rmSync(scratch, { recursive: true, force: true });
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

async function buildRenderer() {
  const here = resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const outfile = join(scratch, "closure-render.mjs");
  await build({
    entryPoints: [join(here, "closure-render.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    external: [...builtinModules, ...builtinModules.map((n) => `node:${n}`), "node:sqlite", "sass", "coffeescript", "better-sqlite3"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  return outfile;
}

function renderOnce(renderer, db, path, transcript, out) {
  return new Promise((res, rej) => {
    // Recording wants plain rows; compact encoding changes only how rows
    // travel, never which rows the engine reads.
    const child = spawn(process.execPath, [renderer, "--db", db, "--path", path, "--transcript", transcript, "--out", out], {
      windowsHide: true,
      env: { ...process.env, DECKO_LIVE_COMPACT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let so = "";
    let se = "";
    child.stdout.on("data", (d) => (so += d));
    child.stderr.on("data", (d) => (se += d));
    const timer = setTimeout(() => child.kill(), 110_000);
    child.on("close", () => {
      clearTimeout(timer);
      const m = /CLOSURE-RENDER (.*)/.exec(so);
      if (!m) return rej(new Error(`render of ${path} printed no report: ${se.slice(-400)}`));
      res(JSON.parse(m[1]));
    });
  });
}

const insertCards = (db, ids) => {
  if (ids.length > 0) db.exec(`INSERT OR IGNORE INTO main.cards SELECT * FROM src.cards WHERE id IN (${ids.join(",")})`);
};
const insertRefs = (db, refererIds) => {
  if (refererIds.length > 0) db.exec(`INSERT OR IGNORE INTO main.card_references SELECT * FROM src.card_references WHERE referer_id IN (${refererIds.join(",")})`);
};

function buildBaseReplica(path, baseIds, baseRefIds) {
  const src = openSource(source);
  const db = new DatabaseSync(path);
  for (const s of schemaStatements(src)) db.exec(s.sql);
  db.exec(`ATTACH DATABASE '${source.replace(/'/g, "''")}' AS src`);
  for (const t of wholeTables(src)) db.exec(`INSERT INTO main."${t}" SELECT * FROM src."${t}"`);
  db.exec("ANALYZE");
  db.exec("DELETE FROM sqlite_stat1");
  const ins = db.prepare("INSERT INTO sqlite_stat1 (tbl, idx, stat) VALUES (?, ?, ?)");
  for (const r of sqliteStat1Rows(src)) ins.run(r.tbl, r.idx, r.stat);
  // The boot tier: its card rows and the permission rules' references.
  // Other reference rows come only where a page's fixpoint finds a
  // statement over card_references that needs them.
  insertCards(db, [...baseIds]);
  insertRefs(db, [...baseRefIds]);
  db.exec("DETACH DATABASE src");
  db.close();
  src.close();
}

const bindable = (params) => params.map((p) => (p === undefined ? null : typeof p === "boolean" ? Number(p) : p));

async function closePage(renderer, page, baseReplica, graph, baseIds, baseRefIds, full) {
  const dir = mkdtempSync(join(scratch, "p-"));
  const replica = join(dir, "replica.sqlite3");
  copyFileSync(baseReplica, replica);
  // Page set, beyond the boot tier: card rows, and the cards whose
  // reference rows the render reads (a card's references cost writes too,
  // so they come only when a statement over card_references needs them).
  const S = new Set();
  const R = new Set();
  const result = { page, status: "needs-full", ids: [], ref_ids: [], iterations: 0, statements: 0 };
  try {
    for (let it = 1; it <= maxIter; it++) {
      result.iterations = it;
      const transcript = join(dir, `t${it}.jsonl`);
      const html = join(dir, `r${it}.html`);
      const rep = await renderOnce(renderer, replica, page, transcript, html);
      result.render_status = rep.status;
      result.statements = rep.statements;
      if (rep.error) result.error = rep.error;
      const lines = existsSync(transcript) ? readFileSync(transcript, "utf8").split("\n").filter(Boolean) : [];
      const growCards = new Set();
      const growRefs = new Set();
      const stuck = new Set();
      let differing = 0;
      for (const line of lines) {
        const s = JSON.parse(line);
        let stmt;
        try {
          stmt = full.prepare(s.sql);
        } catch {
          continue;
        }
        if (stmt.columns().length === 0) continue;
        const want = stmt.all(...bindable(s.params)).map((r) => ({ ...r }));
        if (JSON.stringify(want) === JSON.stringify(s.rows)) continue;
        differing += 1;
        let ids = idsInRows(want);
        const w = witnessSql(s.sql);
        if (w !== undefined) {
          try {
            ids = new Set([...ids, ...idsInRows(full.prepare(w).all(...bindable(s.params)))]);
          } catch {
            /* unrecognised after all; the fixpoint decides */
          }
        }
        const refsToo = /\bcard_references\b/i.test(s.sql);
        let added = 0;
        for (const id of ids) {
          if (!graph.has(id)) continue;
          if (!baseIds.has(id) && !S.has(id)) {
            growCards.add(id);
            added += 1;
          }
          if (refsToo && !baseRefIds.has(id) && !R.has(id)) {
            growRefs.add(id);
            added += 1;
          }
        }
        if (added === 0) stuck.add(shape(s.sql));
      }
      result.differing = differing;
      if (differing === 0) {
        result.status = "closed";
        // Second check: the whole deck renders the same bytes.
        const fullHtml = join(dir, "full.html");
        const frep = await renderOnce(renderer, source, page, join(dir, "full.jsonl"), fullHtml);
        result.full_status = frep.status;
        result.bytes = readFileSync(html, "utf8").length;
        result.bytes_identical = maskSlots(readFileSync(html, "utf8")) === maskSlots(readFileSync(fullHtml, "utf8"));
        // Only a page the whole deck serves (200) and the replica serves
        // byte-identically counts as closed.
        if (frep.status !== 200 || rep.status !== 200 || !result.bytes_identical) result.status = `not-served-${frep.status}`;
        break;
      }
      const before = S.size + R.size;
      graph.closeOverParts(growCards, S);
      for (const id of growRefs) R.add(id);
      if (S.size + R.size === before) {
        result.stuck = [...stuck].slice(0, 5);
        break;
      }
      const db = new DatabaseSync(replica);
      db.exec(`ATTACH DATABASE '${source.replace(/'/g, "''")}' AS src`);
      insertCards(db, [...S]);
      insertRefs(db, [...R]);
      db.close();
    }
    result.ids = [...S].filter((id) => !baseIds.has(id)).sort((a, b) => a - b);
    result.ref_ids = [...R].sort((a, b) => a - b);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  let pages = [];
  if (argv.includes("--fixed")) pages.push(...DEFAULT_FIXED_PAGES);
  if (arg("pool")) {
    const from = Number(arg("from", "0"));
    pages.push(...readPagePool(arg("pool")).slice(from, from + Number(arg("limit", "50"))));
  }
  if (arg("pages")) pages.push(...arg("pages").split(","));
  const done = readClosures(outPath);
  pages = [...new Set(pages)].filter((p) => !done.has(p));
  if (pages.length === 0) return console.log("nothing to do");
  const renderer = await buildRenderer();
  const src = openSource(source);
  const graph = new CardGraph(src);
  const baseIds = bootBaseIds(src, graph);
  const baseRefIds = bootRefIds(src);
  src.close();
  const baseReplica = join(scratch, "base.sqlite3");
  buildBaseReplica(baseReplica, baseIds, baseRefIds);
  const full = new DatabaseSync(source, { readOnly: true });
  let next = 0;
  const worker = async () => {
    while (next < pages.length) {
      const page = pages[next++];
      const t0 = Date.now();
      let r;
      try {
        r = await closePage(renderer, page, baseReplica, graph, baseIds, baseRefIds, full);
      } catch (e) {
        r = { page, status: "error", ids: [], error: String(e.message).slice(0, 300) };
      }
      r.ms = Date.now() - t0;
      appendFileSync(outPath, JSON.stringify(r) + "\n");
      console.log(JSON.stringify({ page: r.page, status: r.status, ids: r.ids.length, ref_ids: r.ref_ids?.length, iterations: r.iterations, bytes_identical: r.bytes_identical, render_status: r.render_status, ms: r.ms, stuck: r.stuck }));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  full.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exitCode = 1;
});
