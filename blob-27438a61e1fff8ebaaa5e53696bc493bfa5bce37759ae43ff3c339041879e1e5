import {it,expect} from 'vitest';
import {applyServedEnvironmentDeltas} from '../../deploy/bunny-worker-src/bunny-edge-page-shell.js';
import {resolveServedEnvironmentDeltas} from '../../deploy/bunny-worker-src/bunny-edge-served-deltas.js';
import {CONFLICT_RETRY_SCRIPT} from '../../deploy/bunny-worker-src/bunny-edge-conflict-retry-script.js';
it('keeps stock pages and fragments unchanged, and only adds the configured repair once',()=>{
 const page='<html><body>editor</body></html>\n';
 expect(applyServedEnvironmentDeltas(page)).toBe(page);
 expect(applyServedEnvironmentDeltas(page,resolveServedEnvironmentDeltas({DECKO_CONFLICT_RETRY:'true'}))).toBe(page);
 const enabled=resolveServedEnvironmentDeltas({DECKO_CONFLICT_RETRY:'1'});
 const fixed=applyServedEnvironmentDeltas(page,enabled);
 expect(fixed).toContain('data-decko-conflict-retry="1"');
 expect(applyServedEnvironmentDeltas(fixed,enabled)).toBe(fixed);
 expect(applyServedEnvironmentDeltas('<div>fragment</div>\n',enabled)).toBe('<div>fragment</div>\n');
 expect(resolveServedEnvironmentDeltas({DECKO_SERVED_DELTAS:'{"conflictRetry":true}'}).conflictRetry).toBe(true);
});
it('scopes the 409 revision refresh to the errored form, not the modal origin slot',()=>{
 // The stock 409 branch (slotter.js.coffee showErrorResponse) reads the
 // revision through slot() — whose data-slot-selector ("modal-origin") on an
 // edit form resolves to the slot that OPENED the modal. With two stacked
 // edit modals (the graded S2 shape in tools/modal-stack-interactions-
 // driver.mjs: the pre-filled ?view=edit modal + the menu's edit modal, both
 // for the same card) that target is the page's main slot, which holds
 // neither the form's revision input nor the conflict notice, so the stock
 // refresh no-ops and the same-form retry re-submits the stale revision and
 // 409s forever (measured: revision stays 3 against current 7, retry 409;
 // receipts tmp/modal-stack-two-modals-lane-20261018/*234938 [stock] vs
 // *235144 [flag armed], 2026-10-18). The compensating script must therefore
 // select BOTH the revision input and the notice INSIDE the submitted form,
 // and only for the 409 status on that form's own card. These pins fail if
 // the script's selection drifts back to slot()-scoped resolution.
 expect(CONFLICT_RETRY_SCRIPT).toContain('xhr.status!==409');
 expect(CONFLICT_RETRY_SCRIPT).toContain(`form.find('input.current_revision_id[name="card[last_action_id_before_edit]"]')`);
 expect(CONFLICT_RETRY_SCRIPT).toContain(`form.find('.card-notice .new-current-revision-id')`);
 // The errored form's slot and the notice's slot must be the SAME card, and
 // the copied revision must be numeric (the engine's :conflict answer span).
 expect(CONFLICT_RETRY_SCRIPT).toContain("card=form.closest('.card-slot').attr('data-card-id')");
 expect(CONFLICT_RETRY_SCRIPT).toContain("conflicted=marker.closest('.card-slot').attr('data-card-id')");
 expect(CONFLICT_RETRY_SCRIPT).toContain('card!==conflicted');
 expect(CONFLICT_RETRY_SCRIPT).toContain('field.val(revision)');
});
