# reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4

- Ruby's file set: `card-1.110.0/lib/card/view.rb, view/{classy,permission}.rb, view/cache (4)`
- The row's own label: `view.rb`, `view/{classy,permission}.rb`, `view/cache*` (4)
- 5 Ruby file(s), 55 def(s).
- PORTED 7 / PORTED-INLINE 16 / NAMED-COLLAPSE 15 / SKIP 17 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries the voo surface it rendered for and names the rest in its own source (src/card/render/format.ts, the Voo block): the top-of-chain accessor and test (view.rb:90-97 root, root?) collapse into the render entry's own handle on the first voo and the deepExtraClasses walk's recursion stop; the cross-format hops (view.rb:100-123 deep_root, deep_root?, next_ancestor, next_format_ancestor) collapse or have no counterpart because the port's formats do not chain; the removal family (classy.rb class_down, without_upped_class, remove_extra_classes) has no counterpart because no deck file calls the temporary-up form; the extra-class write is carried by classUp, whose body is classy.rb:55-58 add_extra_classes' merge; the ancestor walk collapses into deepExtraClasses over the voo chain; the storage-site table, the privacy-list read and the scope-to-privacy table (classy.rb:103-153) collapse into the port's single voo-stored class-list map, which is the one scope the deck's calls use; and the per-view cache dispatch (cache_action.rb:18-27 cache_action, log_cache_action) collapses into the port's always-render path, because the port runs no per-view cache and Ruby's off status answers :yield. The pinned bytes were executed for the row's probes.

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-round1b-20261024` in KatsuJinCode/decko-ts.
