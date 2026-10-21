// server-time-budget.test.mjs — the rule behind the "9. timings" group, and
// the queue that keeps the measurement clean.
//
// TWO THINGS ARE PINNED HERE.
//
// 1. THE BUDGET RULE (lib/server-time-budget.mjs). The budget is the
//    engine's own `total;dur` from the Server-Timing header, pages and
//    saves are graded separately, and a request the engine did not label is
//    not graded at all.
//
// 2. THE MEASUREMENT CONTEXT (lib/one-at-a-time-queue.mjs). The number the
//    rule reads is the page's own work only when no other request shares the
//    engine with it. The local host therefore serves the engine's requests
//    one at a time. This is the fix for the leg's flaking: at the tranche-6
//    tip the SAME request (the cover-b E21 fixture's board_act page)
//    measured total;dur=2012 ms with stmt=1688 in the tranche-5 whole-family
//    run and total;dur=9675 ms with stmt=3774 in the tranche-6 one - 4.8x,
//    at nearly the same commit - and 59 of 3961 requests in that run
//    carried a `db;dur` GREATER than their own `total;dur`, which is
//    impossible for one request's own work.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/server-time-budget.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SERVER_TIME_BUDGET_MS,
  serverTotalMs,
  budgetViolations,
  pageBudgetViolations,
  saveBudgetViolations,
  budgetEvidence,
  serverTimeSummary,
} from "../lib/server-time-budget.mjs";
import { oneAtATimeQueue } from "../lib/one-at-a-time-queue.mjs";

// ---------------------------------------------------------------- the rule

const timing = (total) => `auth;dur=5, seat;dur=0, db;dur=400;stmt=60, render;dur=${total}, total;dur=${total}`;

test("the budget reads the engine's own total;dur, and nothing else", () => {
  assert.equal(SERVER_TIME_BUDGET_MS, 3000);
  assert.equal(serverTotalMs(timing(2500)), 2500);
  assert.equal(serverTotalMs("auth;dur=1, seat;dur=0, db;dur=2;stmt=3"), null, "no total;dur means no reading");
  assert.equal(serverTotalMs(undefined), null);
  assert.equal(serverTotalMs(null), null);
  assert.equal(serverTotalMs(1234), null);
});

test("a page over the budget breaks the page budget and a save does not", () => {
  const ledger = [
    { method: "GET", path: "/slow", ms: 3100, serverTiming: timing(3100) },
    { method: "POST", path: "/update/x", ms: 3100, serverTiming: timing(3100) },
  ];
  assert.deepEqual(pageBudgetViolations(ledger).map((row) => row.path), ["/slow"]);
  assert.deepEqual(saveBudgetViolations(ledger).map((row) => row.path), ["/update/x"]);
});

test("a request exactly on the budget is inside it", () => {
  const ledger = [{ method: "GET", path: "/edge", ms: 3000, serverTiming: timing(3000) }];
  assert.equal(pageBudgetViolations(ledger).length, 0);
  assert.equal(pageBudgetViolations([{ method: "GET", path: "/over", ms: 3001, serverTiming: timing(3001) }]).length, 1);
});

test("a request the engine did not label is not graded", () => {
  const ledger = [
    { method: "GET", path: "/unlabelled", ms: 99000, serverTiming: null },
    { method: "GET", path: "/no-header", ms: 99000 },
  ];
  assert.equal(pageBudgetViolations(ledger).length, 0);
  assert.equal(saveBudgetViolations(ledger).length, 0);
});

test("the evidence names the path, the wall and the server time it graded", () => {
  const longPath = "/" + "segment/".repeat(12) + "card";
  const evidence = budgetEvidence([{ path: longPath, ms: 4000, serverTiming: timing(4000) }]);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].ms, 4000);
  assert.equal(evidence[0].serverMs, 4000);
  assert.equal(evidence[0].path.length, 50);
  assert.equal(longPath.startsWith(evidence[0].path), true);
  assert.deepEqual(budgetEvidence([]), []);
});

test("the run's own summary says how many rows were labelled and how slow the slowest was", () => {
  const summary = serverTimeSummary([
    { method: "GET", path: "/a", serverTiming: timing(1200) },
    { method: "GET", path: "/b", serverTiming: timing(3400) },
    { method: "GET", path: "/c", serverTiming: null },
  ]);
  assert.equal(summary.labelledRequests, 2);
  assert.equal(summary.overBudgetRequests, 1);
  assert.equal(summary.slowestServerMs, 3400);
  assert.equal(summary.budgetMs, 3000);
  assert.deepEqual(serverTimeSummary([]), { labelledRequests: 0, budgetMs: 3000, overBudgetRequests: 0, slowestServerMs: null });
});

test("the budget rule is a pure function of the ledger", () => {
  const ledger = [{ method: "GET", path: "/x", serverTiming: timing(100) }];
  const before = JSON.stringify(ledger);
  budgetViolations(ledger, (row) => row.method === "GET");
  pageBudgetViolations(ledger);
  saveBudgetViolations(ledger);
  assert.equal(JSON.stringify(ledger), before);
});

// ------------------------------------------------------- the measurement context

test("the queue runs its works one at a time, in order", async () => {
  const enqueue = oneAtATimeQueue();
  let live = 0;
  let peak = 0;
  const order = [];
  const work = (name, ms) => async () => {
    live += 1;
    peak = Math.max(peak, live);
    order.push(`${name}:start`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    order.push(`${name}:end`);
    live -= 1;
    return name;
  };
  const results = await Promise.all([
    enqueue(work("a", 20)),
    enqueue(work("b", 5)),
    enqueue(work("c", 1)),
  ]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.equal(peak, 1, "two works must never run at the same time");
  assert.deepEqual(order, ["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
});

test("a work that throws does not stall the queue", async () => {
  const enqueue = oneAtATimeQueue();
  const failing = enqueue(async () => {
    throw new Error("the handler threw");
  });
  const following = enqueue(async () => "still running");
  await assert.rejects(failing, /the handler threw/);
  assert.equal(await following, "still running");
});

test("each caller gets its own work's answer", async () => {
  const enqueue = oneAtATimeQueue();
  const answer = await enqueue(async () => ({ id: 1 }));
  assert.deepEqual(answer, { id: 1 });
});
