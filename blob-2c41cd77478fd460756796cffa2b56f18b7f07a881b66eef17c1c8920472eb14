// bounded-wait.test.mjs: the pins for the harness's deadline rule.
//
//   node --test tools/edge-signed-in-exercise/test/bounded-wait.test.mjs
//
// WHAT IS PINNED. The whole-family exercise is a battery, and a battery that
// stops reporting is worse than a battery that fails. The tranche-8 baseline
// run (2026-10-21 20:27 local, at the tranche-7 tip) reached 205 checks with
// 0 failures and then sat at 0.00 s of CPU for twenty minutes and never
// wrote its report. The rule that ends that class of silence is here:
// every unbounded wait gets a deadline, and a deadline that fires is
// reported, never waited on.
//
// The legs below are the rule's own statements, one per leg, so a change to
// the rule that breaks any of them fails this test rather than the battery.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline, withShutdownWindow, DeadlineExceeded } from '../lib/bounded-wait.mjs';

test('a work that finishes in time returns its own value', async () => {
  const value = await withDeadline(Promise.resolve('the value'), 5_000, 'the fast work');
  assert.equal(value, 'the value');
});

test('a work that fails in time returns its own error', async () => {
  await assert.rejects(
    () => withDeadline(Promise.reject(new Error('the work failed')), 5_000, 'the failing work'),
    /the work failed/,
  );
});

test('a work that never settles is reported, not waited on', async () => {
  const started = Date.now();
  await assert.rejects(
    () => withDeadline(new Promise(() => {}), 120, 'the stuck work'),
    (error) => {
      assert.ok(error instanceof DeadlineExceeded);
      assert.equal(error.label, 'the stuck work');
      assert.equal(error.budgetMs, 120);
      assert.match(error.message, /deadline exceeded: the stuck work \(budget 120 ms\)/);
      return true;
    },
  );
  assert.ok(Date.now() - started < 5_000, 'the deadline fired instead of the wait');
});

test('the abandoned work cannot become an unhandled rejection', async () => {
  const seen = [];
  const onUnhandled = (reason) => { seen.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    // A work that rejects LATE, after its deadline has already fired.
    let rejectLate;
    const late = new Promise((_, reject) => { rejectLate = reject; });
    await assert.rejects(() => withDeadline(late, 50, 'the late work'), /deadline exceeded/);
    rejectLate(new Error('the late failure'));
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(seen, [], 'the late rejection was swallowed by the deadline');
});

test('a work given as a function is called, and its value is returned', async () => {
  let called = 0;
  const value = await withDeadline(() => { called += 1; return 'from the function'; }, 5_000, 'the called work');
  assert.equal(called, 1);
  assert.equal(value, 'from the function');
});

test('a graceful shutdown inside its window is reported as a clean close', async () => {
  let closed = false;
  const report = await withShutdownWindow(async () => { closed = true; }, 5_000, 'the clean shutdown', () => { throw new Error('the forced path must not run'); });
  assert.equal(closed, true);
  assert.deepEqual(report, { closed: true, forced: false, label: 'the clean shutdown' });
});

test('a graceful shutdown past its window runs the owner forced path', async () => {
  let forced = 0;
  const report = await withShutdownWindow(() => new Promise(() => {}), 80, 'the stuck shutdown', () => { forced += 1; });
  assert.equal(forced, 1, 'the forced path ran');
  assert.equal(report.forced, true);
  assert.equal(report.closed, false);
  assert.equal(report.label, 'the stuck shutdown');
  assert.match(report.error, /deadline exceeded/);
});

test('a forced path that itself fails is reported, not thrown', async () => {
  const report = await withShutdownWindow(() => new Promise(() => {}), 80, 'the stubborn shutdown', () => { throw new Error('the forced path failed'); });
  assert.equal(report.forced, false);
  assert.equal(report.closed, false);
  assert.match(report.error, /the forced path failed/);
});

test('a shutdown that fails on its own terms throws that error', async () => {
  await assert.rejects(
    () => withShutdownWindow(() => Promise.reject(new Error('the shutdown failed')), 5_000, 'the failing shutdown', () => {}),
    /the shutdown failed/,
  );
});
