# Cloudflare anonymous cache recovery (local evidence)

Recovered from the preserved `perf/cf-free-cpu` worktree onto `6b64644c` plus CPU tooling `dac3e86b` (local cherry-pick `4461c9a1`). The original checkout was not edited. This is source and local workerd evidence, not hosted free-plan CPU or browser acceptance.

`DECKO_EDGE_CACHE=1` is opt-in and defaults off. Both actual `worker.ts` and benchmark `deploy/worker.ts` cache successful anonymous default/open HTML card pages without query parameters. JSON, explicit views, operational routes and writes bypass. Session cookies, Authorization and token query credentials bypass matching/storage and produce private/no-store responses. Response cookies, Vary and private/no-cache/no-store are respected. Successful public anonymous rendering explicitly supplies public policy; arbitrary private responses are never made public. Every hit reads the committed deck-data stamp through the D1 adapter transaction barrier, so edits and permission changes invalidate old entries. No whole-deck indexing is started by GET.

Deployment now explicitly orders migrations, source-only engine compilation, remote nest-index preparation, Worker publication and setup-token issuance. The index tool selects the DB binding, fails on missing/placeholder configuration, and retains explicit D1/SQLite/local forms. Migration0014 installs the same undo-journal lock state table/bootstrap row used by the adapter, avoiding the missing-table first query. No remote operation was executed for this work.

Recovered pure name/link/HTML optimizations preserve algorithms. Request memo keys include all inputs as JSON arrays; memo lifetime remains the existing isolated render context. URL keys use immutable-instance WeakMap storage.

Verification: the recovered cache first failed five credential/policy negative tests. Both real workerd entries then exposed blanket no-store blocking every insertion; the emitter policy was narrowed to anonymous open pages. Real-runtime miss/hit bytes, credential bypass, edit invalidation, permission revocation, dynamic JSON/view bypass and write gating now pass. Focused cache/runtime/deploy-chain/context checks32pass; name243 and link2 pass; earlier write-surface16/twin17 and D1-index/manifest13 pass. Typecheck passed. Composed synthetic-v1:1754render/2389semantic/16persistence/19effects/8read-write/12other-table comparisons pass on dirty working source; this is explicitly not a release grade.

## Local process CPU

Run `node benchmarks/cf-scale/measure-workerd-cpu.mjs --deck cf-scale --page '500-item pointer' --n 40 --batches 2 --nest-index [--edge-cache] --json <output>`.

The500-item pointer measured16.41ms/request without cache versus7.03ms/request with cache (two20-request batch means; cachedp95=7.81ms); identical64392-byte200response, oneD1stampread/request. The small ordinary card was5.86ms with/without cache. Cold `/` remained156.25–187.5ms. These are Windows workerd process CPU upper bounds including local D1+HTTP, not billed Worker CPU; batch-mean percentiles are not individual-request percentiles. Raw reports are `cf-free-cpu-local-evidence.json`. No free-plan acceptance claim is made.

Smallest next hosted experiment, separately authorized: one disposable test Worker and one D1 database, no R2/queue; bounded seed/migration/index writes (estimate at most5000),60GETs covering cold/warm/page sizes/credentials/denial, one authorized content update plus post-update/revocation reads. Read actual provider CPU distributions and errors; verify source/bundle/config/database identity. No resources or paid calls were created here. Cold boot and full actual candidate journeys remain acceptance dependencies.
