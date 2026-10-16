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
test('actual deleted-target creation form fails even after a valid redirect', () => {
  assert.equal(check('<form action="/card/create"><input name="card[name]" value="Deleted_Target"></form>').pageAccepted, false);
});
test('unrelated nested creation form does not identify the deleted target', () => {
  assert.equal(check('<form action="/card/create"><input name="card[name]" value="Other Target"></form>').pageAccepted, true);
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

test('owner delete check captures exact response and after-DOM and retains status/trash refusal', async () => {
  for (const [status, trash, bodyLost, hostBody, expected] of [
    [200, 1, false, undefined, true], [422, 1, false, undefined, false], [200, 0, false, undefined, false],
    [200, 1, true, '{"redirect":"https://local.test/"}', true],
    [200, 1, true, '', false],
  ]) {
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
      database: () => ({ prepare: () => ({ get: () => ({ trash }) }) }),
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
