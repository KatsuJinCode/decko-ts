# Row smell-audit-capability-bindings

Family row conversion, 2026-10-22. Disposition: DONE.

- Roster row: `smell-audit-capability-bindings` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/audit-capability-bindings.mjs`
- What this lane did: Restored the pinned checkout the row names as its unblock and ran the audit, in a COPY of the evidence tree, so the receipt of record in the shared tree was not overwritten.
- Command: `node audit-capability-bindings.mjs (run in a copy of the evidence tree)`
- Observed: Exit 0. The audit ran its own checks: E11 and E21 each have exactly one stored passing result in the frozen report, and it printed {before: covered 36, partial 15, not_covered 40, out_of_scope 3, proposed: covered 38, partial 16, not_covered 39, out_of_scope 1}. The fresh output does NOT reproduce the committed record of record: the audited source digest is 7651f1b06a1ff9c475aa68519263c58ec60772828ea2c3d9f41a719494316c44 against the record's 6fc619ce3a65d92dc032f18583b54368c4eda3a1d330ae1323934f0c39bb6118, and the two out-of-scope capabilities in the record are proposed as covered or partial in the fresh run.
- Gap, in one mechanism sentence: the audit's proposal depends on which capabilities.json it audits, and the pinned checkout's copy is a different tree from the one the record of record was computed from, so the record cannot be reproduced until that input is pinned.
- Pin: the fresh audit output is this receipt's evidence; the drift rule behind it is pinned by tools/edge-signed-in-exercise/test/check-modules.test.mjs (the tranche-2 pin, carried on this branch).

## Disposition

`DONE`. The row's blocker was that the probe had never been run, because running it would overwrite the receipt it is checked against. It has now been run, in a copy, and it completed clean with the two bindings it exists to check: E11 and E21 each have exactly one stored passing result in the frozen report. The count difference against the record of record is disclosed above and is a difference of audited input, not of the port's behaviour.
