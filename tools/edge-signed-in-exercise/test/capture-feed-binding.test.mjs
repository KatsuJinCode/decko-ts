// capture-feed-binding.test.mjs: the pins for the capture-feed binding.
//
//   node --test tools/edge-signed-in-exercise/test/capture-feed-binding.test.mjs
//
// WHAT IS PINNED. The registry's grader credits a capability when a result
// carries one of its declared check names and that result passed. One
// capability of this family is proved by a different instrument, the
// reference-harness probe, and its committed receipt is bound into the
// harness run through the row's own captureFeed block. These legs pin the
// binding's own rules: which rows carry a feed, where the named paths may
// point, what a feed that cannot be read contributes, and that the feed's
// verdict is the reader's and is carried in unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve as resolvePath, sep } from 'node:path';
import { captureFeedBindings, captureFeedResults, resolveInside } from '../lib/capture-feed-binding.mjs';

const REGISTRY_ROWS = [
  { id: 'C13', captureFeed: { receipt: 'reference-harness/browser/probe-receipts/probe-c13-run3-result.json', instrument: 'reference-harness/browser/probe-c13-create-and-edit-templated-card.mjs', reader: 'tools/edge-signed-in-exercise/lib/capture-feed.mjs' } },
  { id: 'A4', checks: ['no capture feed here'] },
];

test('only the rows that name both a receipt and a reader carry a feed', () => {
  const bindings = captureFeedBindings(REGISTRY_ROWS);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].capabilityId, 'C13');
  assert.equal(bindings[0].instrument, 'reference-harness/browser/probe-c13-create-and-edit-templated-card.mjs');
});

test('a row that names a receipt without a reader carries no feed', () => {
  assert.deepEqual(captureFeedBindings([{ id: 'X', captureFeed: { receipt: 'a.json' } }]), []);
  assert.deepEqual(captureFeedBindings([{ id: 'X', captureFeed: { reader: 'reader.mjs' } }]), []);
  assert.deepEqual(captureFeedBindings([{ id: 'X' }]), []);
});

test('a path inside the repository resolves and a path out of it does not', () => {
  const root = 'C:/repo';
  assert.equal(resolveInside(root, 'tools/edge-signed-in-exercise/lib/capture-feed.mjs'),
    resolvePath(root, 'tools/edge-signed-in-exercise/lib/capture-feed.mjs'));
  assert.equal(resolveInside(root, '../outside.json'), null, 'a climbing path is refused');
  assert.equal(resolveInside(root, '/etc/passwd'), null, 'an absolute path is refused');
  assert.equal(resolveInside(root, ''), null);
  assert.equal(resolveInside(root, undefined), null);
});

test('the reader the row names converts the receipt, and its verdict is carried in unchanged', async () => {
  const { results, notes } = await captureFeedResults(captureFeedBindings(REGISTRY_ROWS), {
    repoRoot: 'C:/repo',
    readFile: () => JSON.stringify({ checkName: 'the named check' }),
    loadReader: () => ({ resultsFromProbeReceipt: (receipt) => [{ check: receipt.checkName, pass: false, evidence: { red: true } }] }),
  });
  assert.equal(notes.length, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].check, 'the named check');
  assert.equal(results[0].pass, false, 'a red receipt is a failed check, not a hidden one');
  assert.match(results[0].group, /^capture feed \(C13, /);
  assert.equal(results[0].captureFeed.receipt, 'reference-harness/browser/probe-receipts/probe-c13-run3-result.json');
});

test('a feed whose receipt cannot be read contributes nothing and is named', async () => {
  const { results, notes } = await captureFeedResults(captureFeedBindings(REGISTRY_ROWS), {
    repoRoot: 'C:/repo',
    readFile: () => { throw new Error('the receipt is not there'); },
    loadReader: () => ({ resultsFromProbeReceipt: () => [{ check: 'x', pass: true }] }),
  });
  assert.equal(results.length, 0, 'no result, so the row stays where it was');
  assert.equal(notes.length, 1);
  assert.match(notes[0].skipped, /the receipt could not be read/);
});

test('a feed whose reader cannot be loaded contributes nothing and is named', async () => {
  const { results, notes } = await captureFeedResults(captureFeedBindings(REGISTRY_ROWS), {
    repoRoot: 'C:/repo',
    readFile: () => '{}',
    loadReader: () => { throw new Error('the reader is not there'); },
  });
  assert.equal(results.length, 0);
  assert.equal(notes.length, 1);
  assert.match(notes[0].skipped, /the reader could not be loaded/);
});

test('a reader that exports no converter contributes nothing and is named', async () => {
  const { results, notes } = await captureFeedResults(captureFeedBindings(REGISTRY_ROWS), {
    repoRoot: 'C:/repo',
    readFile: () => '{}',
    loadReader: () => ({}),
  });
  assert.equal(results.length, 0);
  assert.equal(notes.length, 1);
  assert.match(notes[0].skipped, /no resultsFromProbeReceipt/);
});

test('a feed whose path points out of the repository is refused, not read', async () => {
  const bindings = [{ capabilityId: 'X', receipt: '../outside.json', reader: 'reader.mjs', instrument: null }];
  const { results, notes } = await captureFeedResults(bindings, {
    repoRoot: 'C:/repo',
    readFile: () => { throw new Error('nothing outside the repository may be read'); },
    loadReader: () => ({ resultsFromProbeReceipt: () => [{ check: 'x', pass: true }] }),
  });
  assert.equal(results.length, 0);
  assert.equal(notes.length, 1);
  assert.match(notes[0].skipped, /not a file inside this repository/);
});
