import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checks,
  capabilityChecks,
  duplicateActIds,
  actIdSequence,
} from '../checks-recent-changes-feed-dedup.mjs';

const entry = (actId, title) => ({ actId, collapseId: actId, title });

test('a feed listing each act once reports no repeat', () => {
  assert.deepEqual(duplicateActIds([entry('act-id-9', 'a'), entry('act-id-8', 'b'), entry('act-id-7', 'c')]), []);
});

test("the crawl's 2-to-6-times shape is one entry with its repeat count", () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const feed = Array.from({ length: count }, () => entry('act-id-41', 'Harness_feed_same'));
    const found = duplicateActIds(feed);
    assert.equal(found.length, 1);
    assert.equal(found[0].actId, 'act-id-41');
    assert.equal(found[0].count, count);
    assert.deepEqual(found[0].at, Array.from({ length: count }, (_, i) => i));
  }
});

test('two different acts repeating are two findings', () => {
  const found = duplicateActIds([
    entry('act-id-3', 'a'), entry('act-id-3', 'a'), entry('act-id-2', 'b'), entry('act-id-2', 'b'),
  ]);
  assert.deepEqual(found.map(f => [f.actId, f.count]), [['act-id-3', 2], ['act-id-2', 2]]);
});

test('distinct acts on the same card are not repeats of each other', () => {
  // Several distinct acts legitimately name one card (two edits, an edit and a
  // follow), so grading on title would red a correct page.
  assert.deepEqual(duplicateActIds([entry('act-id-5', 'Home'), entry('act-id-4', 'Home'), entry('act-id-3', 'Home')]), []);
});

test('an entry with no stamped act id cannot be deduped and is not counted', () => {
  assert.deepEqual(duplicateActIds([entry('', 'x'), entry('', 'y'), { title: 'z' }]), []);
  assert.deepEqual(actIdSequence([entry('act-id-1', 'a'), { title: 'no id' }]), ['act-id-1', '']);
});

/** Drives the real check body against a scripted feed. The rendered entries
 *  are what page.evaluate would hand back from #main .accordion-item. `entries`
 *  may be a function of the card name the check itself creates, so a fixture
 *  can carry that act the way the live feed does. */
const runCheck = async (entries, { storeWorks = true, signedIn = true } = {}) => {
  const recorded = [];
  const ctx = {
    stack: { origin: 'https://127.0.0.1:1' },
    page: {
      // Playwright's APIResponse exposes status() as a method, which the check
      // calls; a bare property here would read as undefined and pass silently.
      context: () => ({ request: { post: async () => ({ status: () => (storeWorks ? 200 : 500) }) } }),
      goto: async () => ({ status: () => 200 }),
      waitForSelector: async () => undefined,
      content: async () => '<html>rendered</html>',
      evaluate: async () => (typeof entries === 'function' ? entries(ctx.created[0]) : entries),
    },
    creds: { admin: { id: 53041, name: 'Harness Admin', email: 'a@b.c', password: 'pw' } },
    signIn: async () => ({ hasSessionCookie: signedIn }),
    database: () => ({ prepare: () => ({ get: () => (storeWorks ? { id: 1 } : undefined) }) }),
    created: [],
    captureEvidence: () => ({ capture: 'test' }),
    fixtureState: { fatalReason: null },
    record: (name, pass, evidence) => recorded.push({ name, pass, evidence }),
  };
  await checks[0].run(ctx);
  return { recorded, ctx };
};

test('a clean feed grades dedup PASS and carries this run’s act', async () => {
  const { recorded, ctx } = await runCheck(created => [
    entry('act-id-101', created),
    entry('act-id-100', 'Other card'),
    entry('act-id-99', 'Home'),
  ]);
  assert.deepEqual(recorded.map(r => [r.name, r.pass]), [
    [capabilityChecks.N14[0], true],
    [capabilityChecks.N14_SEEN[0], true],
  ]);
  const [dedup] = recorded;
  assert.equal(dedup.evidence.renderedActEntries, 3);
  assert.equal(dedup.evidence.distinctActIds, 3);
  assert.deepEqual(dedup.evidence.duplicates, []);
  assert.deepEqual(ctx.created.length, 1);
});

test('a repeated act grades dedup FAIL and names the repeated id and count', async () => {
  const { recorded } = await runCheck(created => [
    entry('act-id-101', created),
    entry('act-id-77', 'Home'),
    entry('act-id-77', 'Home'),
    entry('act-id-77', 'Home'),
  ]);
  assert.equal(recorded[0].pass, false);
  assert.deepEqual(recorded[0].evidence.duplicates, [{ actId: 'act-id-77', count: 3, at: [1, 2, 3] }]);
  assert.match(recorded[0].evidence.note, /more than once/);
});

test('an empty feed is NOT a dedup pass', async () => {
  const { recorded } = await runCheck([]);
  assert.equal(recorded[0].pass, false);
  assert.match(recorded[0].evidence.note, /no act entries/);
  assert.equal(recorded[0].evidence.renderedActEntries, 0);
  assert.equal(recorded[1].pass, false);
});

test('a feed missing this run’s act fails the positive control even when dedup holds', async () => {
  // The wrong-page shape the SELF-Xrecent branch exists to prevent: a deduped
  // list of somebody else's acts must not read as evidence for this run.
  const { recorded } = await runCheck([entry('act-id-100', 'Other card'), entry('act-id-99', 'Home')]);
  assert.equal(recorded[0].pass, true);
  assert.equal(recorded[1].pass, false);
  assert.equal(recorded[1].evidence.createdCardActRows, 0);
});

test('a fixture that did not store aborts before the feed is read', async () => {
  await assert.rejects(runCheck([], { storeWorks: false }), /feed act fixture was not stored/);
});

test('a non-loopback origin refuses the check', async () => {
  const ctx = { stack: { origin: 'https://example.com' } };
  await assert.rejects(checks[0].run(ctx), /disposable loopback deck/);
});