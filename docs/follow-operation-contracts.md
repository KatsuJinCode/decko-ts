# Positive follow-operation contracts

The unchanged legacy member-board journey can complete with two HTTP200
observations even though its actual GET mutation returns422 and stores
nothing. Stock Ruby does the same on this fixture. Equality is useful
compatibility evidence; it does not establish a successful unfollow.

`acceptance-follow-operations.json` is a separate prospective definition
file. Its three flows require the actual stock GET update target, correct
stored preference, expected notification, a new browser profile, an owned
host restart, login and a reload showing the persisted state. It does not
replace the existing 51 definitions or their captures.

The separate `acceptance-follow-operation-contracts.json` policy requires
200 for each exact action request, `*always`/`*never` in the specific recorded
card mutation, exact notification count/recipient/subject with a body, and
the expected follow control on reload. The mail-unfollow policy's target910
is the existing fixture's `*all+Mira Member+*follow` card. These IDs/content
come from the actual pinned fixture/captured rows, not port-derived expected
results. A stock422/403 remains a failed positive operation; permissions
are not relaxed to make this fixture pass.

Run the unchanged first-class browser runner with the new journey file, then:

```powershell
node reference-harness/browser/evaluate-follow-operations.mjs --actual <new-run> --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --policy reference-harness/browser/journeys/acceptance-follow-operation-contracts.json --engine reference-harness/browser/engines/bunny-local.json --candidate <full-clean-commit> --report <new-report.json>
```

The evaluator is additive and candidate-only. It verifies complete matching
steps, real restart receipts, exact observation labels, fixture/definition/
default-policy/engine hashes, clean candidate/build/runtime identity and
consistent final run metadata. It also retains executed-step and captured
default-policy expectations. It checks failed required assets independently
of page status. Missing action, failed retry, wrong target/verb, absent
mutation, wrong preference, missing/incorrect mail and stale reload all fail.

Its report pins the additional policy, evaluator, every raw result and final
metadata hash. Policies are evaluated against immutable observations after
capture; they are not retroactively executed browser assertions. The CLI
creates a new report exclusively and refuses to overwrite an existing one.
It never rewrites raw evidence, captured policy, Ruby expectations or
normalization. This tool's product verdict is additional evidence, not an
override of the legacy comparator or deployed-runtime acceptance.

Thirty-five evaluator controls pass, including the deliberately misleading
HTTP200-page/GET422/no-mutation cases, provenance/default-policy failures,
missing real restart, overwrite refusal, and raw-input immutability. The
controls use explicitly labelled unit fixtures; only actual browser runs
can substantiate a product claim.

## Actual prospective run

Clean `aeecbd4cd9d7c03de5fa331df767d52a80f8e8c5` ran all three definitions
serially through the actual local Bunny handler. Every flow completed the
new profile, real owned restart, authenticated reload and final observation;
the owned processes closed naturally. The additional evaluator returns
FAIL/exit1 with **one of three positive operations passing**:

- Admin follow passed in 27.876s, including successful GET, stored preference,
  follower notice and the following control after restart/login.
- Member-board unfollow completed in 23.330s but its action returned422,
  no `*never` preference persisted and fresh reload still showed following.
- Mail unfollow completed in 34.328s but returned403, target910 did not change
  to `*never`, and the global follow section still showed following after
  restart/login.

The exact-candidate evaluation has no fixture, definition, default-policy,
engine, source/build or run-identity errors. The first invocation supplied
an incorrect full candidate hash and was refused; that operator error and
its original report are preserved separately from the corrected, uniquely
named exact-candidate report. It is not represented as a planned negative
control or discarded. All original browser JSON/HTML, policies, scripts,
receipts and SHA manifest are preserved under private evidence-bundle ID
`follow-positive-operations-aeecbd4c`.
These results strengthen the visible product failures; they do not relax
permissions or claim Ruby parity/deployed acceptance.
