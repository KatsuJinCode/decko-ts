import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteOutcome } from '../lib/delete-outcome.mjs';
import { ownerRequiredChecks } from '../lib/owner-checks.mjs';

const base = { name: 'Deleted Target', origin: 'https://local.test', finalUrl: 'https://local.test/', responseBody: '{"redirect":"https://local.test/"}' };
const check = (html, overrides = {}) => deleteOutcome({ ...base, html, ...overrides });

test('completed previous-page redirect tolerates a roles update form, even id=new_card', () => {
  const result = check('<form class="card-form slotter autosave" id="new_card" action="/update/Admin+*enabled_roles"><input name="card[name]" value="Deleted Target"></form>');
  assert.equal(result.targetCreateForm, false);
  assert.equal(result.redirectCompleted, true);
  assert.equal(result.pageAccepted, true);
});
test('the deleted name unknown-card create form is an observation, not a recreation', () => {
  // Decko renders its new-card form for any absent card name through the
  // unknown-card page branch, and the ORACLE's own delete answer lands on the
  // deleted card's own edit URL (8cc080d2). Offering the form is that landing
  // page; it is recorded, and it cannot fail the check on its own.
  const html = '<form action="/card/create"><input name="card[name]" value="Deleted_Target"></form>';
  const result = check(html);
  assert.equal(result.targetCreateForm, true);
  assert.equal(result.redirectCompleted, true);
  assert.equal(result.pageAccepted, true);
});
test('an actual recreation under the deleted name fails even after a valid redirect', () => {
  const html = '<form action="/card/create"><input name="card[name]" value="Deleted_Target"></form>';
  assert.equal(check(html, { targetRecreated: true }).pageAccepted, false);
});
test('unrelated nested creation form does not identify the deleted target', () => {
  const result = check('<form action="/card/create"><input name="card[name]" value="Other Target"></form>');
  assert.equal(result.targetCreateForm, false);
  assert.equal(result.pageAccepted, true);
});
test('targeted inline deletion confirmation succeeds without a redirect', () => {
  assert.equal(check('<div class="card-slot just_deleted-view" data-card-name="Deleted Target">Deleted Target deleted</div>', { responseBody: '<div>slot response</div>' }).pageAccepted, true);
});
test('unrelated confirmation and arbitrary success page cannot pass', () => {
  assert.equal(check('<div class="just_deleted-view" data-card-name="Other Target">deleted</div>', { responseBody: '' }).pageAccepted, false);
  assert.equal(check('<main>Home</main>', { responseBody: '' }).pageAccepted, false);
});
test('unfinished redirect, mismatched query and cross-origin redirect fail', () => {
  assert.equal(check('', { finalUrl: 'https://local.test/Deleted_Target/edit' }).pageAccepted, false);
  assert.equal(check('', { responseBody: '{"redirect":"/?page=2"}' }).pageAccepted, false);
  assert.equal(check('', { responseBody: '{"redirect":"https://other.test/"}', finalUrl: 'https://other.test/' }).pageAccepted, false);
});

test('a live row under the deleted name is refused by the owner check itself', async () => {
  // The clause is read from the deck, not from the landing page: a completed
  // redirect plus a trashed card still FAILS when a live row carries the
  // deleted name, which is what "without recreating that target" means.
  const html = '<form action="/card/create"><input name="card[name]" value="Deleted_Target"></form>';
  const responseBody = '{"redirect":"https://local.test/"}';
  const created = [];
  const records = [];
  await ownerRequiredChecks({
    stack: { origin: base.origin }, created,
    attempt: async (label, fn) => label === 'row 7 Delete button deletes a card' ? await fn() : undefined,
    visit: async () => ({}),
    record: (...args) => records.push(args),
    ledger: () => [],
    linesSince: () => [{ path: '/delete/' + created[0], status: 200, deleteResponseBody: responseBody }],
    database: () => ({ prepare: (sql) => (/COUNT\(\*\)/i.test(sql)
      ? { get: () => ({ n: 1 }) }
      : { get: () => ({ trash: 1 }) }) }),
    captureEvidence: () => ({ capture: 'owned-after' }),
    page: {
      locator: () => ({ first: () => ({ fill: async () => {}, click: async () => {} }) }),
      waitForTimeout: async () => {}, goto: async () => {}, evaluate: async () => {},
      waitForResponse: async () => ({ text: async () => responseBody, status: () => 200 }),
      waitForURL: async () => {}, waitForFunction: async () => {},
      content: async () => html, url: () => base.finalUrl,
    },
  });
  assert.equal(records.length, 1);
  assert.equal(records[0][1], false);
  assert.equal(records[0][2].targetRecreated, true);
  assert.equal(records[0][2].liveRowsForName, 1);
});

test('owner delete check captures exact response and after-DOM and retains status/trash refusal', async () => {
  for (const [status, trash, bodyLost, hostBody, expected] of [
    [200, 1, false, undefined, true], [422, 1, false, undefined, false], [200, 0, false, undefined, false],
    [200, 1, true, '{"redirect":"https://local.test/"}', true],
    [200, 1, true, '', false],
  ]) {
    const recreated = false;
    const html = '<form class="card-form" action="/update/Admin+*enabled_roles"></form>';
    const responseBody = '{"redirect":"https://local.test/"}';
    const created = [];
    const records = [];
    const captures = [];
    await ownerRequiredChecks({
      stack: { origin: base.origin }, created,
      attempt: async (label, fn) => label === 'row 7 Delete button deletes a card' ? await fn() : undefined,
      visit: async () => ({}),
      record: (...args) => records.push(args),
      ledger: () => [],
      linesSince: () => [{ path: '/delete/' + created[0], status, deleteResponseBody: hostBody }],
      database: () => ({ prepare: (sql) => (/COUNT\(\*\)/i.test(sql)
        ? { get: () => ({ n: recreated ? 1 : 0 }) }
        : { get: () => ({ trash }) }) }),
      captureEvidence: (after, metadata) => { captures.push({ after, metadata }); return { capture: 'owned-after' }; },
      page: {
        locator: () => ({ first: () => ({ fill: async () => {}, click: async () => {} }) }),
        waitForTimeout: async () => {}, goto: async () => {}, evaluate: async () => {},
        waitForResponse: async () => ({ text: async () => { if(bodyLost)throw Error('body discarded');return responseBody; }, status: () => status }),
        waitForURL: async target => assert.equal(target, base.finalUrl),
        waitForFunction: async () => {},
        content: async () => html, url: () => base.finalUrl,
      },
    });
    assert.equal(records.length, 1);
    assert.equal(records[0][1], expected);
    assert.equal(captures[0].after, html);
    assert.equal(captures[0].metadata.responseBody, bodyLost ? hostBody : responseBody);
    assert.equal(captures[0].metadata.responseStatus, status);
    assert.deepEqual(records[0][2].raw, { capture: 'owned-after' });
  }
});
