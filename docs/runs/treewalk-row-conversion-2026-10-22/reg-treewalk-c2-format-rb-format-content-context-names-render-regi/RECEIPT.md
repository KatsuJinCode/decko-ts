# reg-treewalk-c2-format-rb-format-content-context-names-render-regi

- Ruby's file set: `card-1.110.0/lib/card/format.rb, format/{content,context_names,render,registration,wrapper,method_delegation,card_action_view}.rb`
- The row's own label: `format.rb`, `format/{content,context_names,render,registration,wrapper,method_delegation,card_actio
- 8 Ruby file(s), 76 def(s).
- PORTED 12 / PORTED-INLINE 44 / NAMED-COLLAPSE 18 / SKIP 2 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries the format layer by a different mechanism and names where each of the row's defs went in its own source. Five of the nineteen it did not carry before are carried at the site that carries them and are cited by name: with_voo is the render's own save and restore of the current voo (src/card/render/format.ts), before_view is the before-hook table the render runs (the same file), supports_view? is the refusal with the same UserError surface (the same file), final_render_call is the resolved view's own call (the same file), and render_with_card_layout is the page's layout assembly (src/card/render/page.ts). The other fourteen are named as collapses in the port's own words: the card guard, the source-location string, the view-cache setting, the cached-content stub expansion, the debug annotation and the debug switch (src/card/render/format.ts), the class lookup and its inverse (src/server/registered-format-route.ts), the wrapper dispatch and the wrapper send (src/card/render/page.ts), the ActionView instance, the template lookup and the template cache (src/card/mod-loader/mod-form-substrate.ts), and the params-side context round trip (src/card/render/format.ts). The pinned bytes were executed for the row's probes.

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
