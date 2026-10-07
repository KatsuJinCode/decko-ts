// write-budget.mjs — the D1 free-tier write-budget gate for the one-click
// Cloudflare deploy.
//
// Why this module exists: a bulk deck import written around 1.2M D1 rows in
// a single day against the free tier's 100,000 rows-written/day — about 13
// days of the entire daily budget — and repeated COUNT verifications read
// through much of the 5M rows-read/day allowance. Before ANY D1 write step,
// this module DECLARES the step's exact row count, computes it against the
// limit, and REFUSES the step if it would cross the guard (80% of the daily
// limit, leaving 20% headroom).
//
// Accounting conventions (stated, not hidden):
// * One single-row INSERT statement = 1 row written. The fitting-scale seed
//   is built exclusively from single-row INSERTs, so chunk row counts are
//   exact by construction.
// * The arithmetic counts TABLE ROWS only — the same convention as the
//   import's own arithmetic (93,700 cards + 1,112,560 refs = 1,206,260). If D1's
//   rows_written metric also counts index-entry writes, the 20% headroom
//   absorbs the delta; the /_status + __metrics probe after the run is what
//   reports the platform's own number.
// * DDL (CREATE TABLE / CREATE INDEX) is counted as 0 data rows.
// * ANALYZE writes one sqlite_stat1 row per index (35 in the current schema)
//   plus per-table entries; estimated conservatively at 50 rows.
// * The ledger keys on the UTC date because the D1 free-tier day resets at
//   UTC midnight (5pm PT).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Cloudflare D1 free tier, rows written per UTC day. */
export const D1_FREE_DAILY_ROW_WRITES = 100_000;
/** Guard: refuse any step that would take cumulative writes past this
 * fraction of the daily limit, leaving 20% headroom. */
export const GUARD_FRACTION = 0.8;
export const GUARD_ROW_LIMIT = D1_FREE_DAILY_ROW_WRITES * GUARD_FRACTION; // 80,000

/** Cloudflare D1 free tier, rows read per UTC day (for the record; this
 * tool's steps are write-dominated and read-trivial). */
export const D1_FREE_DAILY_ROW_READS = 5_000_000;

/** Conservative ANALYZE cost: sqlite_stat1 rows for 35 indexes + tables. */
export const ANALYZE_ROWS_ESTIMATE = 50;

function utcDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export class WriteBudgetLedger {
  /**
   * @param {object} opts
   * @param {string} opts.ledgerPath  JSON file persisting today's committed writes.
   * @param {number} [opts.spentTodayExternal] rows already written today by
   *        operations outside this tool (supplied by the caller via
   *        --spent-today). Always counted; never guessed.
   * @param {"dry-run"|"local"|"execute"} opts.mode
   */
  constructor({ ledgerPath, spentTodayExternal = 0, mode }) {
    this.ledgerPath = ledgerPath;
    this.spentTodayExternal = spentTodayExternal;
    this.mode = mode;
    this.today = utcDateStamp();
    this.committed = this.#load();
  }

  #load() {
    if (!existsSync(this.ledgerPath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.ledgerPath, "utf8"));
      if (parsed.utcDate !== this.today) return {}; // new CF day -> ledger resets
      return parsed.steps ?? {};
    } catch {
      // A corrupt ledger must never silently undercount: treat as fatal.
      throw new Error(
        `write-budget: ledger file ${this.ledgerPath} is not valid JSON — ` +
          `fix or delete it by hand; refusing to guess spent-today rows.`,
      );
    }
  }

  /** Rows this tool has already committed today (persisted across runs). */
  spentByThisTool() {
    return Object.values(this.committed).reduce((sum, n) => sum + n, 0);
  }

  spentTodayTotal() {
    return this.spentTodayExternal + this.spentByThisTool();
  }

  remainingToday() {
    return Math.max(0, D1_FREE_DAILY_ROW_WRITES - this.spentTodayTotal());
  }

  /**
   * DECLARE -> ARITHMETIC -> PASS/FAIL for one step.
   * `pendingRows`: rows from earlier steps of THIS run not yet committed
   * (dry-run projection) — the projection must accumulate across the plan,
   * never show each step in isolation.
   * Returns the verdict; the CALLER decides to proceed. A failing verdict
   * must abort the run with the "--budget-exceeded" marker.
   */
  check(label, rows, pendingRows = 0) {
    const alreadySpent = this.spentTodayTotal();
    const projected = alreadySpent + pendingRows + rows;
    const pass = projected <= GUARD_ROW_LIMIT;
    return {
      label,
      rows,
      pass,
      alreadySpent,
      projected,
      guardLimit: GUARD_ROW_LIMIT,
      remainingAfterPass: D1_FREE_DAILY_ROW_WRITES - projected,
      percentOfDailyLimit: ((projected / D1_FREE_DAILY_ROW_WRITES) * 100).toFixed(2),
      reason: pass
        ? null
        : `step "${label}" would write ${rows} rows -> ${projected} total today, ` +
          `past the ${GUARD_ROW_LIMIT} guard (80% of the ${D1_FREE_DAILY_ROW_WRITES}/day ` +
          `free-tier limit). Lower --cards, or split the run across UTC days; this ` +
          `tool does not proceed past the guard.`,
    };
  }

  /** Record a step whose rows actually left this machine. ONLY execute-mode
   * rows enter the ledger: the ledger's meaning is "rows written against the
   * Cloudflare free-tier day", and local workerd writes consume none —
   * counting them would make the ledger lie in BOTH directions (blocking
   * local re-runs, then overstating the CF day). */
  commit(label, rows) {
    if (this.mode !== "execute") return;
    this.committed[label] = (this.committed[label] ?? 0) + rows;
    mkdirSync(dirname(this.ledgerPath), { recursive: true });
    writeFileSync(
      this.ledgerPath,
      JSON.stringify(
        { utcDate: this.today, mode: this.mode, steps: this.committed },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }

  summary() {
    return {
      mode: this.mode,
      utcDate: this.today,
      spentTodayExternal: this.spentTodayExternal,
      spentByThisTool: this.spentByThisTool(),
      spentTodayTotal: this.spentTodayTotal(),
      dailyLimit: D1_FREE_DAILY_ROW_WRITES,
      guardLimit: GUARD_ROW_LIMIT,
      remainingToday: this.remainingToday(),
    };
  }
}
