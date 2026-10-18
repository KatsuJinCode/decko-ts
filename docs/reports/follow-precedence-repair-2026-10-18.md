# Follower preferences must use most-specific-first lookup

On the exact private cc1c8788 bundle, an owned loopback probe creates a card,
saves the member's explicit self follow preference, and edits as admin. Both
writes return303; the preference has the correct Set, Person and Setting types,
and the notification template has nonempty subject/text/HTML. A fresh read-only
resolver still finds zero followers, and the actual local mail sink gets zero.
The source deck carries a global all-user `*never` preference (card22735).

The notify resolver constructed patterns in numbered file order, All to Self,
and used that order for preference lookup and reason selection. Installed Ruby
loads those files sorted, but Pattern.register inserts each at index0. Actual
lookup is Self to All. The shared TypeScript set-pattern registry already has
the correct order; this private notification walk contradicted it. Its old
unit tests explicitly asserted the same wrong general-before-specific result.

The repair reverses this private walk into the actual registration order. It
does not change preference data, grants, names, option line order, transport,
actor exclusion or recipient read gates. A self opt-in can override a global
default opt-out; a self opt-out still overrides a general opt-in.

Evidence and controls:

- The installed Ruby registration and rule_id_lookup methods, executed over
  synthetic conflict hashes, choose self in all three cases. This is a minimal
  method-level oracle, not full Ruby application acceptance.
- Four corrected precedence cases fail on the old implementation (4 red,
  9 green). They cover deduplicated reason selection, self always/type never,
  self never/type always, and self user opt-in/global all-user opt-out without
  notifying unrelated users.
- The complete selected six-file suite passes47/47 after the repair, including
  mail recipient permissions, follow field/nest behavior, save-path wiring,
  option semantics and follow runtime. Normal typecheck passes.
- Actual post-repair resolver/mail evidence is still required on a new exact
  full bundle; it follows this coherent checkpoint.

The W5 instrument independently fails with `no such column: r.trash`; its table
has no trash column. Its nested-mail fixture/predicate and that schema repair
remain on the source author's line. A rendered inclusion cannot substitute for
mail delivery; stock update_includers.feature requires included plus fields
and explicitly excludes standalone included cards. No predicted W5 pass is
accepted. The earlier 206/223 and46/51 totals are unchanged.
