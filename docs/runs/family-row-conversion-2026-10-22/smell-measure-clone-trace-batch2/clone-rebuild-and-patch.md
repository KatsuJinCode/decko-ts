# The instrumented clone rebuild, and the trace patch this lane wrote

The row `smell-measure-clone-trace-batch2` could not run because its instrumented clone tree
did not exist: the `B2_TRACE` patch had been hand-applied to a `dist` that was never committed,
so nothing in git could reproduce the clone. This file is the rebuild, written down so the
instrument is auditable.

## What was rebuilt, and from what

The clone root is `.runtime/exhaustive/probe-pageonly-batch2/livecopy` inside the measurement
checkout `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
`e8b70ad3aa85c75f9247d2cd1af747e4bf740505`. It holds:

- `dist/` - a copy of the candidate's own `dist` build (the same bytes the build receipt
  `distSha256` `2651f3522bd63f8aad78e4c0d12a537b890746945b11aff4cb6c3435bcc003fb` names, before
  the patch below).
- `vm-staging-server.mjs` - a copy of the candidate's own host script.
- `db/` - a copy of the candidate's migrations, which the host's `same-database` step scans.
- `reference-harness/browser/engines/ts-server.mjs` and `reference-harness/browser/lib/*.mjs` -
  copies of the candidate's own harness server and library, because the server resolves the
  repository root three levels up from itself and the mods' public dir relative to that root.
- `reference-harness/oracle/app/public/mod` - a copy of the candidate's gitignored mods' public
  dir, which `ts-server.mjs:76` refuses to boot without.
- `node_modules` - a directory junction to the shared package store, so the clone resolves the
  same dependencies as the measurement checkout.

## The trace patch

The patch is applied to the clone's `dist/src/card/permissions/view-task-rules.js`, immediately
after the line that resolves the rule candidates for a task, inside `applicableRuleId`:

```js
const resolved = await resolveRuleIdsByRuleKeys(fetcher.driver, candidates);
if (process.env.B2_TRACE === "1") console.error("[b2trace] task=" + task + " card=" + card.name + " candidates=" + JSON.stringify(candidates) + " resolved=" + JSON.stringify([...resolved.entries()].map(([k,v]) => [k,v])));
```

`applicableRuleId` is the port's `Card::Query`-free port of `permissions.rb:55-71`
`permission_rule_id`: it builds the set-pattern candidates for the card and the task and asks
`resolveRuleIdsByRuleKeys` which of them resolve to stored rules. The trace therefore prints
exactly the thing the row asks about: which candidate rule keys the live composition resolves,
and to which stored rule ids.

The engine manifest the instrument writes sets `env: { B2_TRACE: "1" }`, so the trace is off
everywhere else.

## What this patch is not

It is not the original hand-applied patch; that one was never committed and cannot be recovered.
This is a fresh instrument, written by this lane, and it is disclosed as such in the row's
record. The measurement it produces is about the port's own rule resolution, which is what the
row asks about; it is not a claim about any other engine's internals.
