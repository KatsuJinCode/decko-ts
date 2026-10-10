# Mods are compiled into the view registry

## Context

Most of Ruby Decko's behaviour lives in mods: separate gems that register
views, set patterns, events and settings, layered on a core. The loader
resolves them in load order, so a later mod overrides an earlier one.

Two constraints collide here. The first is that the production edge worker
binds **no mod deck** — there is no mod directory to read, no filesystem to
read it from, and no Ruby gem manifest to interpret. The second is that the
acceptance criterion is byte parity, so a mod's views have to produce Ruby's
bytes, and the captured output that pins them is the only evidence that
happens.

A runtime mod loader would also mean shipping a data format — manifests,
ordering rules, per-card dispatch — whose correctness nothing else in the
project could check.

## Decision

Each ported mod is a module under `src/card/mod-loader/mods/` that registers,
for its sets, the views, events and settings the Ruby mod defines. The loader
applies them in Ruby's load order, so overriding behaves the same way.

The view registry is a **record**: a map from view name to a function, built at
module load rather than resolved from a mod directory at request time. Mod
views live in that record alongside core views.

Compatibility is measured rather than assumed. A generator walks every
installed mod's set and library trees, mines the view, format, set-module,
event and configuration declarations, and compares that inventory against what
this registry implements — producing a per-mod verdict of declared-complete,
partial or missing. The classification deliberately excludes the universal
views every card routes through, because counting those would mark a mod
declared-complete on the strength of one inherited fallback view.

## What is and is not supported

This is the whole mod contract. Nothing outside it is claimed.

**Supported:** the site's own mods — the `card-mod-*` gems that ship with
card 1.110.0 / decko 0.20.0 — hand-ported into `src/card/mod-loader/mods/`,
one module per mod, registering the views, events and settings the Ruby mod
declares. The evidence is graded, not assumed: the compatibility report
(`tools/compat-report/mod-compat-report.md`) inventories each gem's
declarations against the registry, and `tests/card/mod-loader/*.test.ts` pin
the rendered bytes of a subset of views against Ruby oracle captures. What the
evidence covers, and what it does not, is inventoried in
`docs/coverage-inventory.md`.

**Not supported:** executing an existing Ruby mod's code unchanged. A
`card-mod-*` gem's Ruby is never loaded, interpreted or translated at runtime;
there is no Ruby runtime on any host this engine deploys to. Also not
supported: loading mods at runtime — no mod directory is read at request time,
no gem manifest is interpreted in production, and a deck cannot gain a mod by
dropping files into a folder. The loader's load order is ported; its
filesystem-driven loading is not.

**What a third-party mod author must do today:** hand-port the mod — write a
TypeScript module under `src/card/mod-loader/mods/` that registers the mod's
views and events through the same manifest interface, port any set modules it
needs onto the implemented set patterns, add byte-pin tests against a captured
Ruby oracle output for every view whose bytes matter, and re-run the
compatibility report. There is no import path from a Ruby mod gem to a
registered TS mod; the promise of "mods included" in the upstream discussion
(decko-commons#1282) means this repository includes hand-ports of the site's
own mods, not a general Ruby-mod execution capability.

## Consequences

Adding a mod is a code change reviewed like any other, not a data drop. A mod
whose behaviour the production deployment never needs can still be implemented,
because it costs nothing at runtime beyond a compiled function.

The consequence that costs the most is honesty in the verdict. The generator
compares **declarations**, not behaviour: it cannot tell a one-line stub from a
two-hundred-line rendering pipeline. So "declared-complete" in a compatibility
report means the declarations exist — a manifest registers the views, the set
patterns land, some views are byte-pinned — and for every view except the
handful the pins render, that is not the same as the renderer matching Ruby's
output. No label in the report measures executable behavior, event hooks, or
non-html formats. The report's own documentation says so, and the distinction
has to be repeated wherever a number from it is quoted.

The load-order mechanism is ported; the general notion of loading mods at
runtime is not, and the compatibility report is a snapshot of what has been
declared rather than a claim that the general loader works.