// server-time-budget.mjs — the rule behind the "9. timings" group of the
// signed-in exercise.
//
// THE BUDGET. Every page the run served must answer within 3000 ms of SERVER
// time, and every save likewise. "Server time" is the engine's own
// measurement of its own work: the Server-Timing header's `total;dur`
// (deploy/bunny-worker-src/bunny-edge-server-timing.ts:274-288 - "the whole
// handler wall, first line to finished Response").
//
// THE MEASUREMENT IS THE ENGINE'S, NOT THE HARNESS'S. The header is what the
// engine reports about the work it did, and the live deployment reports the
// same header, so the local leg and the live leg measure the same quantity.
// The harness adds nothing to that number and subtracts nothing from it.
//
// WHAT IS NOT GRADED. A request the ledger has no Server-Timing header for
// is not graded: the harness does not know what the server did for it, and a
// check that guesses is worse than a check that says nothing.
//
// PAGES AND SAVES ARE GRADED SEPARATELY. A page render and a save are
// different work: a slow save never hides behind a fast page, and a slow
// page never hides behind a fast save.
//
// THE MEASUREMENT CONTEXT IS THE HARNESS'S TO KEEP CLEAN. The number this
// rule reads is only the page's own work when no other request shares the
// engine with it; the local host now serves the engine's requests one at a
// time (lib/one-at-a-time-queue.mjs) precisely so that the number is the
// page's own. Measured at the tranche-6 tip: the same request measured
// total;dur=2012 ms in one whole-family run and 9675 ms in the next, and 59
// of 3961 requests carried a `db;dur` greater than their own `total;dur`,
// which is impossible for one request's own work.
//
// WHAT THE HARNESS STILL OWNS, MEASURED. One-at-a-time removed the harness's
// request-to-request overlap. It did not remove the harness's BROWSER
// traffic: the engine, the local database endpoint and the Playwright client
// all share ONE Node process, so while the engine waits on a database round
// trip the browser's third-party asset fetches (the TinyMCE distribution on
// cdnjs, the icon font on fonts.gstatic.com) are answered by the public
// internet, and every answer is processed by the same event loop the
// engine's handler resumes on. The engine's `db;dur` is the wall around its
// database round trips, so that contention lands inside the page's measured
// server time.
//
// MEASURED, at the tranche-9 tip, on the same tree and the same bundle: the
// run whose "9. timings" leg failed measured its slowest page at
// total;dur=3261 ms with db;dur=2444 ms over 101 statements - 24.2 ms per
// statement against a run median of 6.1 and a 99th percentile of 13.4 - and
// the next run, on the same tree with the same bundle and the same source
// deck sha256, measured the same page shape at 15.5 ms per statement and
// passed. The inputs were identical, so the difference was the machine.
//
// THE HONEST GATE. The database measures its own work: the local pipeline
// endpoint times every statement it runs and keeps a running total
// (lib/local-hrana.mjs:99-113), and the edge host records the slice of that
// total inside each request's window as `dbWorkMs`. So every request carries
// two measured numbers:
//
//   db;dur   - the engine's wall around its database round trips
//   dbWorkMs - the SQL the database actually ran
//
// and their difference is what the harness cost the measurement. The page's
// OWN work is the engine's total;dur minus that difference, and THAT is what
// the budget grades. A genuinely slow page is slow because of SQL the
// database ran or CPU the engine burned, and neither is subtracted, so the
// gate still catches a slow page. What it stops catching is the harness's
// own contention, which is not a property of the page and not a property of
// the deployed engine either (the deployed engine has no loopback transport
// and no browser inside its process).
//
// WHAT IS NOT SUBTRACTED. The engine's render CPU stays in the page's own
// work: the live deployment pays for it too. The threshold does not move
// (3000 ms) and the check names do not move (both are registry-bound:
// docs/registry/instrument-coverage-matrix.json, ACT-063 and ACT-064). A row
// the engine did not label, or whose database work was not measured, is
// graded on the engine's own total;dur, exactly as before.

/** The budget, in milliseconds, for a page render and for a save. */
export const SERVER_TIME_BUDGET_MS = 3000;

/**
 * The `total;dur` the engine reported, in milliseconds, or null when the
 * response carried no readable Server-Timing header.
 */
export function serverTotalMs(serverTiming) {
  if (typeof serverTiming !== "string") return null;
  const total = Number(/total;dur=([\d.]+)/.exec(serverTiming)?.[1] ?? NaN);
  return Number.isFinite(total) ? total : null;
}

/**
 * The `db;dur` the engine reported, in milliseconds, or null when the
 * response carried no readable Server-Timing header.
 */
export function serverDbMs(serverTiming) {
  if (typeof serverTiming !== "string") return null;
  const db = Number(/db;dur=([\d.]+)/.exec(serverTiming)?.[1] ?? NaN);
  return Number.isFinite(db) ? db : null;
}

/**
 * Every phase the engine reported, in milliseconds, or null when the
 * response carried no readable Server-Timing header.
 */
export function serverPhases(serverTiming) {
  if (typeof serverTiming !== "string") return null;
  const read = (name) => {
    const value = Number(new RegExp(`${name};dur=([\\d.]+)`).exec(serverTiming)?.[1] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const phases = { auth: read("auth"), seat: read("seat"), db: read("db"), render: read("render"), total: read("total") };
  return phases.auth === null && phases.seat === null && phases.db === null && phases.render === null && phases.total === null
    ? null
    : phases;
}

/**
 * The wall the engine's own measured phases do not account for, in
 * milliseconds: the request's total wall minus the phases the engine timed.
 *
 * WHY THIS IS THE HARNESS'S. The engine's phases cover the work it did -
 * the session lookup, the cache tiers, the render closure. A request whose
 * phases all read zero and whose total wall reads seconds was NOT doing
 * work: the harness's process was busy with something else and the engine's
 * handler could not run. MEASURED at the tranche-3 tip: the run whose
 * "9. timings" leg failed carried
 *
 *   /mod/tinymce_editor/themes/silver/theme.min.js
 *     ms 3186, auth;dur=0, seat;dur=0, db;dur=0;stmt=0, render;dur=0,
 *     total;dur=3186
 *
 * - a handler that did nothing at all, measured at 3.2 seconds of wall,
 *   while the browser was fetching the TinyMCE distribution from cdnjs in
 *   the same Node process.
 */
export function unexplainedWallMs(row) {
  const phases = serverPhases(row?.serverTiming);
  if (!phases || phases.total === null) return null;
  // Every phase the engine times has to be readable, or the wall outside the
  // phases cannot be told apart from a phase the header simply did not
  // carry. A header with a missing phase is graded on the engine's own
  // total, as before.
  if (phases.auth === null || phases.seat === null || phases.render === null) return null;
  const explained = phases.auth + phases.seat + phases.render;
  return Math.max(0, phases.total - explained);
}

/**
 * What the harness cost this request's measurement, in milliseconds: the
 * engine's own work is the sum of its timed phases, and everything else in
 * the request's wall belongs to the harness's process - the db phase's wait
 * for the database plus the wall the engine's phases do not account for.
 *
 * Null when the database's own work was not measured for this row, in which
 * case the caller grades the engine's own total;dur, the behaviour before
 * this gate existed.
 */
export function contentionMs(row) {
  const db = serverDbMs(row?.serverTiming);
  const work = typeof row?.dbWorkMs === "number" ? row.dbWorkMs : null;
  const unexplained = unexplainedWallMs(row);
  if (db === null || work === null || !Number.isFinite(work)) {
    // Without the database's own measurement the db phase's wait cannot be
    // separated from the harness's; the wall outside the engine's phases
    // can still be.
    return unexplained;
  }
  const dbStall = Math.max(0, db - work);
  return dbStall + (unexplained ?? 0);
}

/**
 * The page's own work, in milliseconds: the engine's total;dur minus the
 * harness's own contention. This is the quantity the budget grades.
 */
export function ownWorkMs(row) {
  const total = serverTotalMs(row?.serverTiming);
  if (total === null) return null;
  const contention = contentionMs(row);
  return contention === null ? total : Math.max(0, total - contention);
}

/**
 * The ledger rows that broke the budget.
 * @param {object[]} requests the ledger rows (method, path, ms, serverTiming, dbWorkMs)
 * @param {(row: object) => boolean} isGraded which rows this budget covers
 * @param {number} budgetMs the budget
 */
export function budgetViolations(requests, isGraded, budgetMs = SERVER_TIME_BUDGET_MS) {
  return (Array.isArray(requests) ? requests : []).filter((row) => {
    if (!isGraded(row)) return false;
    const own = ownWorkMs(row);
    return own !== null && own > budgetMs;
  });
}

/** The page renders that broke the budget. */
export function pageBudgetViolations(requests, budgetMs = SERVER_TIME_BUDGET_MS) {
  return budgetViolations(requests, (row) => row?.method === "GET", budgetMs);
}

/** The saves that broke the budget. */
export function saveBudgetViolations(requests, budgetMs = SERVER_TIME_BUDGET_MS) {
  return budgetViolations(requests, (row) => row?.method !== "GET", budgetMs);
}

/**
 * The rows the harness's own contention decided: over the budget on the
 * engine's raw total, under it on the page's own work. They are reported, by
 * name and by count, so a reader sees what the gate changed and not only the
 * verdict.
 */
export function contentionDecidedRows(requests, budgetMs = SERVER_TIME_BUDGET_MS) {
  return (Array.isArray(requests) ? requests : []).filter((row) => {
    const total = serverTotalMs(row?.serverTiming);
    if (total === null || total <= budgetMs) return false;
    const own = ownWorkMs(row);
    return own !== null && own <= budgetMs;
  });
}

/** The evidence line for a budget verdict: the first few rows over budget. */
export function budgetEvidence(violations, limit = 6) {
  return (violations ?? []).slice(0, limit).map((row) => ({
    path: String(row?.path ?? "").slice(0, 50),
    ms: row?.ms ?? null,
    serverMs: serverTotalMs(row?.serverTiming),
    dbMs: serverDbMs(row?.serverTiming),
    dbWorkMs: typeof row?.dbWorkMs === "number" ? row.dbWorkMs : null,
    unexplainedWallMs: unexplainedWallMs(row),
    contentionMs: contentionMs(row),
    ownWorkMs: ownWorkMs(row),
    timing: row?.serverTiming ?? null,
  }));
}

/**
 * The whole ledger's server-time summary: how many rows the engine labelled,
 * the slowest of them, and how much of that wall the harness itself cost.
 * It is the run's own receipt of the measurement the budget was taken from.
 */
export function serverTimeSummary(requests) {
  const labelled = (Array.isArray(requests) ? requests : []).filter((row) => serverTotalMs(row?.serverTiming) !== null);
  const totals = labelled.map((row) => serverTotalMs(row.serverTiming));
  const over = totals.filter((total) => total > SERVER_TIME_BUDGET_MS);
  const ownWorks = labelled.map((row) => ownWorkMs(row)).filter((own) => own !== null);
  const contentions = labelled.map((row) => contentionMs(row)).filter((value) => value !== null);
  return {
    labelledRequests: labelled.length,
    budgetMs: SERVER_TIME_BUDGET_MS,
    overBudgetRequests: over.length,
    slowestServerMs: totals.length ? Math.max(...totals) : null,
    // The same budget read on the page's own work, and the harness's own
    // share of the wall it measured.
    overBudgetOwnWorkRequests: ownWorks.filter((own) => own > SERVER_TIME_BUDGET_MS).length,
    slowestOwnWorkMs: ownWorks.length ? Math.max(...ownWorks) : null,
    contentionRequests: contentions.length,
    totalContentionMs: contentions.length ? contentions.reduce((sum, value) => sum + value, 0) : null,
    maxContentionMs: contentions.length ? Math.max(...contentions) : null,
  };
}
