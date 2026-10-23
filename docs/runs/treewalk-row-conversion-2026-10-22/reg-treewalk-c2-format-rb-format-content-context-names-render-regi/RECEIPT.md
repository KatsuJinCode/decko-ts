# reg-treewalk-c2-format-rb-format-content-context-names-render-regi

- Ruby's file set: `card-1.110.0/lib/card/format.rb, format/{content,context_names,render,registration,wrapper,method_delegation,card_action_view}.rb`
- The row's own label: `format.rb`, `format/{content,context_names,render,registration,wrapper,method_delegation,card_actio
- 8 Ruby file(s), 76 def(s).
- PORTED 12 / PORTED-INLINE 38 / NAMED-COLLAPSE 3 / SKIP 3 / INERT-API 0 / GAP 20.

## Verdict: WORKING ON IT

The port does not carry 20 of the row's defs: the port's format module is the renderer's own and has no Rails-facing surface: the row's defs are require_card_to_initialize!, the mime type, the context-names round trip, the render and wrapper methods and the registration helpers.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `require_card_to_initialize!` | format.rb:56 | public | internal-reachable |
| `mime_type` | format.rb:86 | public | external |
| `context_names_to_params` | context_names.rb:38 | public | unreachable |
| `with_voo` | render.rb:16 | public | external |
| `before_view` | render.rb:24 | public | external |
| `pretty_path` | render.rb:44 | public | internal-reachable |
| `view_cache_setting` | render.rb:51 | public | external |
| `stub_render` | render.rb:59 | public | external |
| `supports_view?` | render.rb:76 | public | internal-reachable |
| `final_render_call` | render.rb:102 | private | internal-reachable |
| `add_debug_info` | render.rb:106 | private | internal-reachable |
| `show_debug_info?` | render.rb:115 | private | internal-reachable |
| `class_from_name` | registration.rb:34 | public | external |
| `symbol_from_classname` | registration.rb:55 | private | internal-reachable |
| `render_with_wrapper` | wrapper.rb:31 | public | internal-reachable |
| `render_with_card_layout` | wrapper.rb:35 | public | internal-reachable |
| `send_wrapper_method` | wrapper.rb:49 | public | external |
| `new_action_view` | method_delegation.rb:65 | private | internal-reachable |
| `lookup_context` | card_action_view.rb:10 | public | unreachable |
| `compiled_method_container` | card_action_view.rb:15 | public | unreachable |

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-convert-20261022` in KatsuJinCode/decko-ts.
