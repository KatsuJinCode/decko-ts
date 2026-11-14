// one-at-a-time-queue.mjs — the primitive the local edge host uses to serve
// the engine's requests one at a time.
//
// WHY IT EXISTS. The harness drives many browser contexts into ONE Node
// process, and Node runs one request's JavaScript at a time. When two
// requests overlap, the one waiting for the database hands the thread to the
// other, so the first request's measured wall carries the second request's
// CPU, and the engine's per-isolate db ledger (the header's db;dur and
// stmt= are deltas of one monotonic counter -
// deploy/bunny-worker-src/bunny-edge-server-timing.ts:62-71) counts the
// other request's round trips inside this request's window.
//
// MEASURED at the tranche-6 tip: 59 of the 3961 requests in one whole-family
// run carried `db;dur` GREATER than `total;dur` - impossible for a single
// request's own work, because the database wall cannot exceed the request's
// own wall. And the SAME request (the cover-b E21 fixture's board_act page)
// measured total;dur=2012 ms with stmt=1688 in the tranche-5 run and
// total;dur=9675 ms with stmt=3774 in the tranche-6 run: 4.8x, at nearly
// the same commit, on a page whose own cost did not change. That one
// request decided the "9. timings" verdict in the tranches that failed and
// did not decide it in the tranche that passed.
//
// The engine's own instrument states the contract this restores: "the
// per-request numbers are exact whenever requests do not overlap driver
// activity" (bunny-edge-server-timing.ts:66-68). The overlap is created
// here, in the harness's own host, so it is removed here.
//
// THE CONTRACT OF THIS PRIMITIVE:
//   - the queued works run one at a time, in the order they were queued;
//   - a work that THROWS does not stall the queue: the next work still runs;
//   - each caller gets its own work's result or its own work's error.

/**
 * A queue that runs its works one at a time.
 * @returns {(work: () => Promise<any>) => Promise<any>} the enqueue function
 */
export function oneAtATimeQueue() {
  let serving = Promise.resolve();
  return function enqueue(work) {
    const result = serving.then(work, work);
    // The chain continues on both outcomes: a rejected work must not stop
    // the queue. The caller still sees the rejection through `result`.
    serving = result.then(() => undefined, () => undefined);
    return result;
  };
}
