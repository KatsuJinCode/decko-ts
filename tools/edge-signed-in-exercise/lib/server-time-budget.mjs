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
 * The ledger rows that broke the budget.
 * @param {object[]} requests the ledger rows (method, path, ms, serverTiming)
 * @param {(row: object) => boolean} isGraded which rows this budget covers
 * @param {number} budgetMs the budget
 */
export function budgetViolations(requests, isGraded, budgetMs = SERVER_TIME_BUDGET_MS) {
  return (Array.isArray(requests) ? requests : []).filter((row) => {
    if (!isGraded(row)) return false;
    const total = serverTotalMs(row?.serverTiming);
    return total !== null && total > budgetMs;
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

/** The evidence line for a budget verdict: the first few rows over budget. */
export function budgetEvidence(violations, limit = 6) {
  return (violations ?? []).slice(0, limit).map((row) => ({
    path: String(row?.path ?? "").slice(0, 50),
    ms: row?.ms ?? null,
    serverMs: serverTotalMs(row?.serverTiming),
    timing: row?.serverTiming ?? null,
  }));
}

/**
 * The whole ledger's server-time summary: how many rows the engine labelled,
 * and the slowest of them. It is the run's own receipt of the measurement the
 * budget was taken from.
 */
export function serverTimeSummary(requests) {
  const labelled = (Array.isArray(requests) ? requests : []).filter((row) => serverTotalMs(row?.serverTiming) !== null);
  const totals = labelled.map((row) => serverTotalMs(row.serverTiming));
  const over = totals.filter((total) => total > SERVER_TIME_BUDGET_MS);
  return {
    labelledRequests: labelled.length,
    budgetMs: SERVER_TIME_BUDGET_MS,
    overBudgetRequests: over.length,
    slowestServerMs: totals.length ? Math.max(...totals) : null,
  };
}
