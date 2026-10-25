# reg-routes-A23: closed, the measured skip now checkable at the shipped tree

Row: "the Deck app template's conditional `mount JasmineRails::Engine`
(non-production only, when JasmineRails is defined)". The family's own
ledger closed the row as a measured skip at the round-eight tip (commit
8741baf4: the mount cannot fire on the pin this machine carries, and the
gemset drift is pinned rather than described); the roster held it WORKING ON
IT for the canonical-tree condition.

## The unblock, checked in this lane

At this lane's tip (based on deploy/full-candidate-20261101 at c17906db),
`git merge-base --is-ancestor 8b7fabf5 HEAD` exits 0: the row's evidence
commit (the inertness test, the capture fixture and the capture script the
roster names) is in the shipped tree.

## The row's instrument, run at the canonical tip

`npx vitest run tests/deploy/jasmine-mount-inertness.test.ts` reads 1 file,
5 tests, 0 failed, in this lane. The test reads BOTH committed captures
(fixtures/captured/jasmine-mount-ruby-oracle.json,
fixtures/captured/jasmine-mount-rebuilt-gemset-ruby-oracle.json), asserts
they differ in the gem count alone, cross-checks the count against the
round-seven forgery-posture capture, and asserts the mount's cannot-fire
answer over the pinned gemset's 151 and 68-gem shapes: no gem named jasmine,
no ruby source in the pin mentioning the JasmineRails constant, so the
template's route set for every deck this pin can build is the one mounted
Decko engine the port already serves. If a future pin adds a jasmine gem,
the fixture's mountCanFire flips and this test fails, which is the signal
that the mount has become a real port obligation.
