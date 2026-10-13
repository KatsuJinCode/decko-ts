// tools/d1-trickle/importer.mjs — plan and run the D1 trickle import.
//
// State directory (one per target database):
//   plan.json        the frozen, ordered plan (card ids per unit; no content)
//   checkpoint.json  units done, the unit in flight, rows written per UTC day
//   manifest.json    which pages can be served from what is imported so far
//   runs.jsonl       one line per run: when, units, rows written/read, stop reason
//
// A run sends units in plan order until the next unit would take today's
// rows-written past the allowance (default 90% of the daily limit), then
// stops. The next run (the next UTC day) resumes at the first unit not done.
// A unit is recorded "in flight" before it is sent; after a crash it is sent
// again, and INSERT OR IGNORE makes the rows already there cost nothing.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  openSource,
  sha256File,
  schemaStatements,
  indexCounts,
  columnNames,
  wholeTables,
  sqliteStat1Rows,
  CardGraph,
  bootBaseIds,
  bootRefIds,
  referenceIndex,
} from "./deck-source.mjs";
import { buildPlan, insertStatements, rowWriteCost, utcDay, remainingToday, unitFits, normaliseCheckpoint, recordUsage, manifest } from "./trickle-lib.mjs";

// Pages pinned in every plan run: only the deck's root-level pages by
// default. Operators pass their own pinned pages with --fixed (trickle.mjs,
// closure.mjs); no deck-specific page names are built in.
export const DEFAULT_FIXED_PAGES = ["/", "/About"];

const readJson = (p, d = undefined) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
function writeJsonAtomic(p, v) {
  writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 1));
  renameSync(`${p}.tmp`, p);
}

/** closures.jsonl → Map(page -> {page, status, ids}) */
export function readClosures(path) {
  const m = new Map();
  if (!path || !existsSync(path)) return m;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    m.set(c.page, c);
  }
  return m;
}

export function makePlan({ sourcePath, stateDir, closuresPath, poolPages = [], fixedPages = DEFAULT_FIXED_PAGES, unitCost = 2000 }) {
  mkdirSync(stateDir, { recursive: true });
  const db = openSource(sourcePath);
  try {
    const idx = indexCounts(db);
    const graph = new CardGraph(db);
    const baseIds = bootBaseIds(db, graph);
    const { byReferer, orphans } = referenceIndex(db);
    const closures = readClosures(closuresPath);
    const pageOf = (page) => {
      const c = closures.get(page);
      if (!c) return undefined;
      return { page, status: c.status, ids: c.status === "closed" ? c.ids : [], refIds: c.status === "closed" ? (c.ref_ids ?? []) : [] };
    };
    const fixed = fixedPages.map((p) => pageOf(p) ?? { page: p, status: "no-closure", ids: [] });
    const fixedSet = new Set(fixedPages);
    const pool = poolPages.filter((p) => !fixedSet.has(p) && closures.has(p)).map(pageOf);
    const whole = wholeTables(db).map((t) => ({ table: t, rows: Number(db.prepare(`SELECT count(*) n FROM "${t}"`).get().n), cost: rowWriteCost(idx.get(t) ?? 0) }));
    const plan = buildPlan({
      schema: schemaStatements(db),
      wholeTables: whole,
      baseIds,
      baseRefIds: bootRefIds(db),
      fixedPages: fixed,
      poolPages: pool,
      allCardIds: graph.allIds(),
      refsByReferer: byReferer,
      orphanRefs: orphans,
      cardCost: rowWriteCost(idx.get("cards") ?? 0),
      refCost: rowWriteCost(idx.get("card_references") ?? 0),
      unitCost,
    });
    const sourceSha = sha256File(sourcePath);
    const body = { version: 1, source: { path: sourcePath, sha256: sourceSha }, unit_cost: unitCost, fixed_pages: fixedPages, ...plan };
    body.plan_hash = createHash("sha256").update(JSON.stringify({ s: sourceSha, u: plan.units.map((u) => [u.kind, u.table, u.ids]) })).digest("hex");
    writeJsonAtomic(join(stateDir, "plan.json"), body);
    return body;
  } finally {
    db.close();
  }
}

function idList(ids) {
  return ids.join(",");
}

/** Send one unit; returns D1's own usage counts. Throws on a failed verify. */
async function sendUnit(unit, db, exec, ctx) {
  let written = 0;
  let read = 0;
  let requests = 0;
  const run = async (sql, params) => {
    const r = await exec.run(sql, params);
    written += r.meta.rows_written;
    read += r.meta.rows_read;
    requests += 1;
    return r;
  };
  const insertRows = async (table, rows) => {
    for (const s of insertStatements(table, ctx.columns(table), rows, { maxBytes: ctx.maxStatementBytes })) await run(s.sql, s.params);
  };
  const expectEqual = (what, got, want) => {
    if (String(got) !== String(want)) throw new Error(`verify failed for unit ${unit.index} (${unit.label}): ${what} is ${got} on D1, ${want} in the source`);
  };
  if (unit.kind === "schema") {
    for (const s of schemaStatements(db)) await run(s.sql, []);
    const want = schemaStatements(db).length;
    const got = (await run("SELECT count(*) AS n FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'", [])).results[0].n;
    if (Number(got) < want) expectEqual("schema objects", got, want);
  } else if (unit.kind === "table") {
    await insertRows(unit.table, db.prepare(`SELECT * FROM "${unit.table}"`).all());
    expectEqual(`rows in ${unit.table}`, (await run(`SELECT count(*) AS n FROM "${unit.table}"`, [])).results[0].n, unit.rows);
  } else if (unit.kind === "stats") {
    // The source's planner statistics describe the whole deck, so D1 plans
    // the engine's statements as the analysed mirror does from day one.
    const rows = sqliteStat1Rows(db);
    try {
      // Plain ANALYZE creates sqlite_stat1 (tables are still empty here, so
      // it reads almost nothing); the copied rows replace what it wrote, and
      // ANALYZE sqlite_schema makes the planner load them.
      await run("ANALYZE", []);
      await run("DELETE FROM sqlite_stat1", []);
      if (rows.length > 0) await insertRows("sqlite_stat1", rows);
      await run("ANALYZE sqlite_schema", []);
      ctx.notes.push(`planner statistics: ${rows.length} rows copied from the source`);
    } catch (e) {
      ctx.notes.push(`planner statistics could not be copied (${String(e.message).slice(0, 160)}); run ANALYZE once the deck is in`);
    }
  } else if (unit.kind === "cards") {
    const ids = unit.ids ?? [];
    const refs = unit.refs ?? [];
    if (ids.length > 0) {
      const list = idList(ids);
      await insertRows("cards", db.prepare(`SELECT * FROM cards WHERE id IN (${list}) ORDER BY id`).all());
      const src = db.prepare(`SELECT count(*) n, coalesce(sum(length(db_content)),0) len, coalesce(sum(length(name)),0) nl FROM cards WHERE id IN (${list})`).get();
      const got = (await run(`SELECT count(*) AS n, coalesce(sum(length(db_content)),0) AS len, coalesce(sum(length(name)),0) AS nl FROM cards WHERE id IN (${list})`, [])).results[0];
      expectEqual("cards", got.n, src.n);
      expectEqual("content length", got.len, src.len);
      expectEqual("name length", got.nl, src.nl);
    }
    if (refs.length > 0) {
      const list = idList(refs);
      const rows = db.prepare(`SELECT * FROM card_references WHERE referer_id IN (${list}) ORDER BY id`).all();
      await insertRows("card_references", rows);
      const got = (await run(`SELECT count(*) AS n FROM card_references WHERE referer_id IN (${list})`, [])).results[0].n;
      expectEqual("references", got, rows.length);
    }
  } else if (unit.kind === "refs") {
    const list = idList(unit.ids);
    await insertRows("card_references", db.prepare(`SELECT * FROM card_references WHERE id IN (${list}) ORDER BY id`).all());
    expectEqual("references", (await run(`SELECT count(*) AS n FROM card_references WHERE id IN (${list})`, [])).results[0].n, unit.ids.length);
  } else {
    throw new Error(`unknown unit kind ${unit.kind}`);
  }
  return { written, read, requests };
}

/**
 * One daily run. Returns a summary; never throws for "budget reached".
 * opts: { stateDir, exec, dailyLimit, share, dryRun, maxUnits, now, maxStatementBytes, log }
 */
export async function runImport(opts) {
  const { stateDir, exec, dailyLimit = 100_000, share = 0.9, dryRun = false, maxUnits = Infinity, now = () => new Date(), maxStatementBytes, log = () => {} } = opts;
  const plan = readJson(join(stateDir, "plan.json"));
  if (!plan) throw new Error(`no plan in ${stateDir}; run the plan command first`);
  const cpPath = join(stateDir, "checkpoint.json");
  const cp = normaliseCheckpoint(readJson(cpPath), plan.plan_hash);
  if (sha256File(plan.source.path) !== plan.source.sha256) throw new Error("the source deck changed since the plan was made; refusing to import a mix of two decks");
  const db = openSource(plan.source.path);
  const columns = new Map();
  const ctx = { maxStatementBytes, notes: [], columns: (t) => (columns.has(t) ? columns.get(t) : columns.set(t, columnNames(db, t)).get(t)) };
  const day = utcDay(now());
  const started = now().toISOString();
  const summary = { day, started, dry_run: dryRun, units_before: cp.unitsDone, sent: 0, rows_written: 0, rows_read: 0, requests: 0, stop: "", notes: ctx.notes };
  try {
    const account = dryRun ? undefined : await exec.accountUsageToday(day);
    const ledger = recordUsage(cp, day, {});
    let used = Math.max(ledger.rowsWritten, account?.rowsWritten ?? 0);
    summary.account_rows_written_at_start = account?.rowsWritten ?? null;
    summary.allowance = Math.floor(dailyLimit * share);
    let i = cp.unitsDone;
    let sent = 0;
    while (i < plan.units.length) {
      const unit = plan.units[i];
      const remaining = remainingToday({ dailyLimit, share, used });
      if (!unitFits(unit, remaining)) {
        summary.stop = `daily allowance reached: next unit needs ${unit.cost} rows written, ${remaining} left of ${summary.allowance}`;
        break;
      }
      if (sent >= maxUnits) {
        summary.stop = `max units (${maxUnits}) sent`;
        break;
      }
      if (dryRun) {
        used += unit.cost;
        summary.rows_written += unit.cost;
      } else {
        cp.inflight = i;
        writeJsonAtomic(cpPath, cp);
        const u = await sendUnit(unit, db, exec, ctx);
        recordUsage(cp, day, { rowsWritten: u.written, rowsRead: u.read, requests: u.requests });
        used = Math.max(used + u.written, cp.days[day].rowsWritten);
        summary.rows_written += u.written;
        summary.rows_read += u.read;
        summary.requests += u.requests;
        cp.unitsDone = i + 1;
        cp.inflight = null;
        writeJsonAtomic(cpPath, cp);
        writeJsonAtomic(join(stateDir, "manifest.json"), { generated: now().toISOString(), ...manifest(plan, cp.unitsDone) });
        log(`unit ${i + 1}/${plan.units.length} tier ${unit.tier} ${unit.label}: ${u.written} rows written (planned ${unit.cost})`);
      }
      sent += 1;
      i += 1;
    }
    if (i >= plan.units.length && !summary.stop) summary.stop = "deck complete";
    summary.sent = sent;
    summary.units_after = dryRun ? cp.unitsDone + sent : cp.unitsDone;
    summary.manifest = manifest(plan, summary.units_after);
    summary.manifest_complete_pages = summary.manifest.complete_pages.length;
    delete summary.manifest.complete_pages;
    if (!dryRun) {
      cp.runs.push({ day, started, units: sent, rows_written: summary.rows_written, stop: summary.stop });
      writeJsonAtomic(cpPath, cp);
      writeJsonAtomic(join(stateDir, "manifest.json"), { generated: now().toISOString(), ...manifest(plan, cp.unitsDone) });
      appendFileSync(join(stateDir, "runs.jsonl"), JSON.stringify(summary) + "\n");
    }
    return summary;
  } finally {
    db.close();
  }
}

/** Whole-deck check before the switch: every imported table's row count,
 *  and the cards' content and name lengths, must be equal on D1 and in the
 *  source. Reads every row of the source once. */
export async function verifyAll(stateDir, exec) {
  const plan = readJson(join(stateDir, "plan.json"));
  const db = openSource(plan.source.path);
  try {
    const checks = [];
    const tables = ["cards", "card_references", ...wholeTables(db)];
    for (const t of tables) {
      const want = Number(db.prepare(`SELECT count(*) n FROM "${t}"`).get().n);
      const got = Number((await exec.run(`SELECT count(*) AS n FROM "${t}"`, [])).results[0].n);
      checks.push({ what: `rows in ${t}`, d1: got, source: want, ok: got === want });
    }
    const q = "SELECT coalesce(sum(length(db_content)),0) AS len, coalesce(sum(length(name)),0) AS nl, coalesce(sum(id),0) AS ids FROM cards";
    const src = db.prepare(q).get();
    const got = (await exec.run(q, [])).results[0];
    for (const k of ["len", "nl", "ids"]) checks.push({ what: `cards ${k}`, d1: Number(got[k]), source: Number(src[k]), ok: Number(got[k]) === Number(src[k]) });
    return { ok: checks.every((c) => c.ok), checks };
  } finally {
    db.close();
  }
}

export function status(stateDir) {
  const plan = readJson(join(stateDir, "plan.json"));
  if (!plan) return { error: "no plan" };
  const cp = readJson(join(stateDir, "checkpoint.json"), { unitsDone: 0, days: {}, runs: [] });
  const m = manifest(plan, cp.unitsDone ?? 0);
  const left = plan.totalCost - m.rows_written_planned_done;
  return { ...m, complete_pages: m.complete_pages.length, rows_written_left: left, inflight: cp.inflight ?? null, days: cp.days, last_run: cp.runs?.at(-1) ?? null };
}
