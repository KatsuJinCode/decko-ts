import {it,expect} from 'vitest';
import {applyServedEnvironmentDeltas} from '../../deploy/bunny-worker-src/bunny-edge-page-shell.js';
import {resolveServedEnvironmentDeltas} from '../../deploy/bunny-worker-src/bunny-edge-served-deltas.js';
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
