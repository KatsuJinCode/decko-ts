// bounded-wait.mjs: the rule that every unbounded wait in the harness gets a
// deadline, and that a deadline which fires is REPORTED rather than waited on.
//
// WHY IT EXISTS. The whole-family exercise is a battery: it drives a browser
// against a local engine and reports every check. A battery that can stop
// reporting is worse than a battery that fails, because a failure is a fact
// and a hang is silence.
//
// MEASURED at the tranche-8 baseline (the run this lane took at the tranche-7
// tip b80dfd18, node tools/edge-signed-in-exercise.mjs, started 2026-10-21
// 20:27:04 local): the run reached 205 checks with 0 failures, the engine
// served its last response (status 200, 19538 bytes) at 2026-10-22T03:52:11Z
// in the run's own trace (.runtime/.../report.md.memory.jsonl), and then the
// process burned 0.00 s of CPU across a 20-minute sample while no further
// engine request was made and no connection to the run's own origin port
// stayed open. The run never ended and never wrote its report: a battery
// that can hang cannot be a measurement.
//
// THE MECHANISM. Two awaits in the harness have no bound:
//   - a check body, awaited by the runner's `attempt` helper, and
//   - the browser's own shutdown, awaited by the check's `finally`.
// A browser operation that never settles (a navigation whose third-party
// subresource never arrives, a page that never becomes closable) parks the
// first await, and the second then parks forever behind it, because the
// close is what would have released the browser.
//
// THE CONTRACT OF THIS PRIMITIVE:
//   - a work that finishes in time is returned UNCHANGED, value or error;
//   - a work that has not finished by the deadline rejects with a
//     DeadlineExceeded naming the label and the budget;
//   - the late arrival of the abandoned work is SWALLOWED: it can never
//     become an unhandled rejection and can never crash the run;
//   - the deadline is a WALL-CLOCK budget on the await, not a guess about
//     what the work does.
//
// A deadline is not a licence to be slow. The budgets are set from the
// measured reference run: the tranche-7 whole-family run took about 30
// minutes for 242 checks, and the slowest single check body in that run was
// the role-plus-right module's C20 leg, which took about 12 minutes of a
// 30-minute run. A check body budget of 600 s is therefore five times the
// slowest observed body, and the browser's graceful-close budget of 20 s is
// far above the fastest observed close (the same run closed its browsers in
// well under a second) and far below any wait an operator would have to sit
// through.

/** The error a deadline raises. It names the wait and the budget. */
export class DeadlineExceeded extends Error {
  constructor(label, ms) {
    super(`deadline exceeded: ${label} (budget ${ms} ms)`);
    this.name = 'DeadlineExceeded';
    this.label = label;
    this.budgetMs = ms;
  }
}

/**
 * A promise that settles by the deadline.
 * @param {Promise<any>|(() => Promise<any>)} work the work to await; a
 *   function is called with no arguments.
 * @param {number} ms the budget in milliseconds.
 * @param {string} label what the wait is for, named in the error.
 * @returns {Promise<any>} the work's own value, or its own error.
 */
export function withDeadline(work, ms, label) {
  const promise = typeof work === 'function' ? Promise.resolve().then(work) : Promise.resolve(work);
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(label, ms)), ms);
    // A pending timer must not hold the process open on its own.
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

/**
 * A shutdown that gets a graceful window and then a forced one.
 *
 * The graceful window is the software's own shutdown path. When it expires,
 * `force` runs: the owner of the process decides what to do with it, and
 * this helper records that the forced path was taken, so a report never
 * claims a clean shutdown that did not happen.
 *
 * @param {() => Promise<any>} graceful the software's own shutdown.
 * @param {number} ms the graceful budget in milliseconds.
 * @param {string} label what the shutdown is for, named in the record.
 * @param {() => any} force the owner's forced path, run only when the
 *   graceful window expires.
 * @returns {Promise<{closed: boolean, forced: boolean, label: string, error?: string}>}
 */
export async function withShutdownWindow(graceful, ms, label, force) {
  try {
    await withDeadline(graceful, ms, label);
    return { closed: true, forced: false, label };
  } catch (error) {
    if (error instanceof DeadlineExceeded) {
      let forced = false;
      try {
        if (typeof force === 'function') await force();
        forced = true;
      } catch (forceError) {
        return { closed: false, forced: false, label, error: String(forceError?.message ?? forceError).slice(0, 200) };
      }
      return { closed: false, forced: true, label, error: error.message };
    }
    throw error;
  }
}
