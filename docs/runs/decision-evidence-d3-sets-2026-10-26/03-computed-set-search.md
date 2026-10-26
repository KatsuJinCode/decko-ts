# Decision 3 receipt: the computed-set search

## The claim under test

Decision 3's draft says: "We have found no computed set in your recorded
material." This record names the search that backs the sentence and its raw
results.

## Search method

Membership in a Decko set is decided by the set's PATTERN (which card
properties the pattern reads) plus the set's anchor (path-derived). Per-set
membership computation could live in exactly two places in the recorded
material:

1. a `set_pattern/*.rb` file (a custom pattern class with its own
   `pattern_applies?`),
2. a set-definition file that defines `pattern_applies?`/`applies?` or
   registers a pattern itself.

The search walked the pinned gems (C:/localProjects/decko-ruby-oracle-gems/
ruby/3.4.0/gems: card-1.110.0 including mod/core, and every card-mod-* gem):

- every `set_pattern` directory: exactly one exists, card-1.110.0
  mod/core/set_pattern/, holding the nine core pattern files 01_all.rb ..
  09_self.rb. No card-mod gem ships a set_pattern directory (checked per gem:
  `for d in gems/*/; do [ -d "$d/set_pattern" ] ...` - the only hit is
  card-1.110.0's mod/core).
- `grep -rn "def pattern_applies?"` over those nine files: four definitions,
  all at the pattern level (03_type.rb:19, 04_star.rb:13, 05_rstar.rb:15,
  06_rule.rb:15). These compute whether the PATTERN applies to a card (for
  example 04_star.rb:13-15 `card.name.star?`), shared by every set of that
  pattern. They are not per-set declarations.
- `grep -rEn "def (pattern_)?applies\?|Pattern\.register|register_set[^_]"`
  over every set-definition tree (card-1.110.0 mod/core/set plus every
  card-mod-*/set, 443 files): **zero hits**. No set definition computes its
  own membership.
- the only membership-adjacent calls in set files are 160 `include_set`
  lines: behavior composition (a set module reusing another's methods), which
  does not change which cards belong to the set.

## What the recorded computation is, and how the port carries it

The four `pattern_applies?` definitions are the recorded material's only
membership computation. The port carries them as data-plus-shared-lookup, not
as per-set declarations: the nine-entry PATTERN_TABLE
(src/card/set-patterns/registry.ts) gives each pattern an `applies` function
naming its Ruby source - `06_rule.rb#pattern_applies?: card.rule?` at
registry.ts:232-233, `05_rstar.rb#pattern_applies?: card.name.rstar?` at
:247-248, `04_star.rb#pattern_applies?: card.name.star?` at :262-263,
`03_type.rb#pattern_applies?: !!card.type_id` at :277-278, and the default
(class_methods.rb) for the other five. `ClassMethods#new` applies it exactly
where Ruby does (`super if pattern_applies? card`,
src/card/set-patterns/instance.ts:70-77).

## Result

**No computed set found.** All 438 recorded set definitions (415 distinct
sets) are path-derived declarations: pattern code plus anchor, with static
content (views, events, settings, methods). The only runtime membership
computation in the recorded material is the four shared pattern-level
`pattern_applies?` definitions above, and the port carries them at the same
layer (the shared pattern table) with the same answers.

The list that travels with the issue (01-declaration-list.md) is the check:
every line pairs a recorded set with the port declaration that carries it, so
a computed set hiding in the recorded material would show up as a set whose
port declaration cannot answer its membership.
