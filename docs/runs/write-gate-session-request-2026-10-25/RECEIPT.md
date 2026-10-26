# The live-walk write gate: the request decides, not the card's name

Date: 2026-10-25.
Branch: `port/writegate-sessionmark-20261024`, base commit `c17906db`.

## The flaw, in one mechanism sentence

The live-walk write gate decided whether a request could reach the target
from the card's NAME alone, so a request whose target card was called
"signin", "*signin", "account" or "*account" skipped the check whatever the
request actually was, and a request the gate never classified as a write
reached the target without being checked at all.

Three requests reached an owned server in read-only mode. The smell
probe's own receipt
(`docs/runs/smell-row-conversion-r5b-2026-10-24/smell-prove-host-override-read-admission/RECEIPT.md`)
named them and their two mechanisms:

| probe | how it got through |
|---|---|
| `POST /update/account` | the session-mark carve-out, decided from the name alone |
| `POST /card/create` (`card[name]=*signin`) | the same carve-out: a create named the session card |
| `GET /delete/OwnedCard` | never classified as a write: the gate's table carried only the GET update alternative |

## The fix

Two changes, both in the gate's own decision layer
(`reference-harness/browser/lib/live-walk-profile.mjs`):

1. **A session operation is a request, never a card name.** The engine's own
   arms (`src/server/write-routes.ts`) give the login action to the update
   verb on the `*signin` card and the logout action to the delete verb on it.
   Those two requests stay permitted in every mode; every other verb on that
   card, and every card that merely carries a session-ish name, is an
   ordinary card write and stays gated. The check-level gate
   (`assertCardWrite`) has no request, so a name alone opens nothing there
   either.

2. **The table the gate asks is the engine's, with the engine's own method
   override applied first** (`src/server/write-routes.ts` `effectiveMethod`:
   only a POST is overridable, and only to PATCH, PUT or DELETE). That
   closes the `POST` carrying `_method=delete` shape, which the old table
   read as a POST and therefore not a write at all. The engine's GET
   alternatives to the create and delete actions (`engine_routes.rb:41-44`)
   are write routes here too: the port keeps them off its own plain-link
   surface (its recorded hardening), but the gate stands in front of an
   engine this repository does not control, where a plain GET on
   `/delete/<mark>` is a delete.

The rule is pinned by
`tests/tools/live-walk-write-gate-inspects-the-request-not-the-card-name.test.ts`
(8 assertions), and the hosted-discovery suite's session-mark assertions were
rewritten to the request-shaped rule they now describe.

A second, smaller change was needed for the probe to be able to run at all:
`launchHarnessBrowser` accepted `ignoreHTTPSErrors` and dropped it, always
creating a permissive context, so the instrument's strict-browser leg could
not be run. The option is now carried into the context and inherited by
child contexts.

## The three proofs

The operator's own instrument, run twice: once against the pre-fix gate
(the base commit's `live-walk-profile.mjs`, in a scratch tree) and once
against the fixed one. Every assertion is the instrument's, unchanged; the
two runs differ only in the two modules the instrument imports.

```
node prove-host-override-read-admission-before-20261025.mjs writegate-before-r2-20261025
node prove-host-override-read-admission-after-20261025.mjs writegate-after-r2-20261025
```

Both runs drive the real installed headless browser against two owned
`127.0.0.2` TLS listeners. No public network, no user browser or profile, no
production write, no credential read. The receipts are `before.json` and
`after.json` beside this file.

| proof | before (`before.json`) | after (`after.json`) |
|---|---|---|
| owner pages render | "exact target document admitted", "same-origin JSON fetch admitted" | same, plus the child context's page |
| unauthorized writes refused | the first three probes refused, the last three reached the owned server | all six refused; the owned server saw no POST and no `/update/` or `/delete/` URL |
| the three probes now refused | `GET /delete/OwnedCard`, `POST /update/account`, `POST /card/create` all reached the owned server | all three refused before the owned server |
| the session route still works | not reached (the run stopped at the failed assertion) | `POST /update/*signin` reached the owned server (200) |

The after run is green on every leg (`pass: true`, eight checks), including
the two the earlier receipts never reached: the sign-in route still reaches
the owned session endpoint, and a strict browser refuses the owned
self-signed certificate.

The unit-level pin runs the same rule without a browser:

```
npx vitest run tests/tools/live-walk-write-gate-inspects-the-request-not-the-card-name.test.ts \
                  tests/tools/hosted-discovery-probe-dependencies-are-recoverable-and-read-only.test.ts
```

## The battery line

```
npx vitest run tests/tools/side-effects-scenario-battery.test.ts
```

GREEN: "80 steps pass, the 7 steps whose declared differences are pinned are
declared, and no mismatch remains" over the 87 public steps of the committed
synthetic deck. That is the recorded battery line, unchanged.

```
npx vitest run tests/tools/persist-write-probe.test.ts
```

RED, and red before this lane touched anything: the probe reports step 50
("change type of a cardtype with instances") as an unexpected divergence,
where the recorded Ruby step succeeded and the port refuses the type change
("can't alter this type; PersistProbe Type Probe cards still exist"). The
expected set of diverging steps is empty, so the assertion fails.

This is not this lane's change. Measured in a clean detached worktree at the
lane's base commit `c17906db`, with no modified file in it and the same
node_modules, the same probe fails the same way:

```
git worktree add --detach C:/localProjects/decko-ts-writegate-baseline-20261025 c17906db
npx vitest run tests/tools/persist-write-probe.test.ts      # expected [] received [50]
```

The change under test here is in the harness's write gate
(`reference-harness/browser/lib/`, `tools/edge-signed-in-exercise/lib/`); the
probe drives the engine through `src/`, which this lane did not touch. The
known failure set in `KNOWN_FAILURES.md` is an empty table, so this red is
not in it: the known failure set does NOT hold at this tip, and that is a
finding about the tree, not about this change.

## What this lane did not do

It did not change the engine, the port's write path, the port's own
hardening of the GET create/delete alternatives, or the port's divergence
ledger. It did not change the operator's instrument or its assertions. It
sent no request to any live host, read no credential, and deployed nothing.
