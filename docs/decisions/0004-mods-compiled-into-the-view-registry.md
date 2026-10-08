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
this registry implements — producing a per-mod verdict of ported, partial or
missing. The classification deliberately excludes the universal views every
card routes through, because counting those would mark a mod ported on the
strength of one inherited fallback view.

## Consequences

Adding a mod is a code change reviewed like any other, not a data drop. A mod
whose behaviour the production deployment never needs can still be implemented,
because it costs nothing at runtime beyond a compiled function.

The consequence that costs the most is honesty in the verdict. The generator
compares **declarations**, not behaviour: it cannot tell a one-line stub from a
two-hundred-line rendering pipeline. So "covered" in a compatibility report
means a renderer exists — and for every view except the handful the captures
exercise, that is not the same as the renderer matching Ruby's output. The
report's own documentation says so, and the distinction has to be repeated
wherever a number from it is quoted.

The load-order mechanism is ported; the general notion of loading mods at
runtime is not, and the compatibility report is a snapshot of what has been
implemented rather than a claim that the general loader works.