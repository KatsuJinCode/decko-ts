# Decko Core private work board

Canonical board: https://github.com/KatsuJinCode/decko-ts/issues

Created 2026-09-21 under Julian-approved scope. Existing fleet ownership is preserved; these issues organize acceptance rather than dispatch duplicate work.

| Work | Issue |
|---|---|
| Decko Core: runtime-independent architecture and audited delivery | [parent](https://github.com/KatsuJinCode/decko-ts/issues/1) |
| [Architecture] Define the shared Decko contract and first-class Ruby support | [architecture](https://github.com/KatsuJinCode/decko-ts/issues/2) |
| [Governance] Enforce private commit/push gates and audit the publication surface | [governance](https://github.com/KatsuJinCode/decko-ts/issues/3) |
| [Parity] Integrate persistence, semantics, rendering and side-effect acceptance | [parity](https://github.com/KatsuJinCode/decko-ts/issues/4) |
| [Compatibility] Port the DSL and nonlegacy mods under the shared contract | [dsl](https://github.com/KatsuJinCode/decko-ts/issues/5) |
| [Parity] Complete account, authentication and permission behavior | [auth](https://github.com/KatsuJinCode/decko-ts/issues/6) |
| [Storage] Establish semantic conformance for runtime/provider adapters | [provider](https://github.com/KatsuJinCode/decko-ts/issues/7) |
| [Storage] Add PostgreSQL support in parallel | [postgres](https://github.com/KatsuJinCode/decko-ts/issues/8) |
| [Performance] Share optimization dividends across Ruby and TypeScript | [optimization](https://github.com/KatsuJinCode/decko-ts/issues/9) |
| [Delivery] Verify complete migration, one-click setup and recovery | [migration](https://github.com/KatsuJinCode/decko-ts/issues/10) |
| [Evidence] Measure hosting and performance claims before replacing public values | [metrics](https://github.com/KatsuJinCode/decko-ts/issues/11) |
| [Upstream] Prepare an annotated contribution series and support plan | [delivery](https://github.com/KatsuJinCode/decko-ts/issues/12) |

## Active stream mapping

- Rendering R1-R5, semantic S1/S5/S6, persistence P1/P2 and effects E1/E2 map to the parity gate.
- S2 maps to authentication/permissions; S3/R4/E2/T6 map to DSL/mod compatibility.
- T2 maps to provider conformance; T1/T3/T4/T5 map to migration/deployment/recovery; T7 maps to measured claims.
- The existing coordinator retains full-shard replay and integration ownership. See ../upstream-parity-plan-1282.md for stream detail; owner/status notes there are snapshots to verify before assignment.

Older decko-demo issues remain historical references. New work lives here; do not reopen completed slices simply to represent expanded acceptance scope.

## Related documentation to reconcile

- workspace/docs/plans/decko-typescript-edge-port-strategy.md
- decko-demo/docs/plans/2026-09-20-decko-port-parent-direction.md
- decko-demo/docs/decisions/2026-09-20-decko-ts-port-phase-ruby-parity.md
- This repository docs/port-tracker.md and stream notes

The Decko Core architecture contract governs future cross-runtime work. Historical records should link to it while retaining their original decisions and evidence.
