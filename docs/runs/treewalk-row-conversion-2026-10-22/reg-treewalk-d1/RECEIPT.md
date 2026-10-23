# reg-treewalk-d1

- Ruby's file set: `card-1.110.0/config/ (32) + db/ (4)`
- The row's own label: Rails env config, core-extension initializers, locale catalogs, schema.rb
- 30 Ruby file(s), 62 def(s).
- PORTED 14 / PORTED-INLINE 7 / NAMED-COLLAPSE 1 / SKIP 10 / INERT-API 1 / GAP 29.

## Verdict: WORKING ON IT

The port does not carry 29 of the row's defs: the port is not Rails and has no Rails initializers, environments or schema loader: the row's twenty-nine defs are the Rails core extensions (the Hash and Module extensions, the ActiveRecord patches) and the better_errors patch, mechanisms Rails provides and the port has no use for.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `initialize_nested` | hash.rb:17 | public | unreachable |
| `css_merge` | hash.rb:36 | public | unreachable |
| `css_merge!` | hash.rb:42 | public | unreachable |
| `string_merge` | hash.rb:49 | public | unreachable |
| `string_merge!` | hash.rb:55 | public | unreachable |
| `bury` | hash.rb:64 | public | external |
| `validate_bury_key!` | hash.rb:78 | private | internal-reachable |
| `suppress_warnings` | kernel.rb:3 | public | unreachable |
| `const_get_if_defined` | module.rb:3 | public | internal-reachable |
| `const_remove_if_defined` | module.rb:7 | public | external |
| `const_get_or_set` | module.rb:11 | public | external |
| `deep_clone` | object.rb:9 | public | unreachable |
| `deep_clone_instance_variables` | object.rb:60 | public | unreachable |
| `pluck_in_batches` | active_record.rb:20 | public | external |
| `cleaned_batch_items` | active_record.rb:39 | private | internal-reachable |
| `prepare_batch_pluck` | active_record.rb:43 | private | internal-reachable |
| `pluck_in_batches_batch_start` | active_record.rb:66 | private | internal-reachable |
| `pluck_in_batches_items` | active_record.rb:72 | private | internal-reachable |
| `applies?` | active_support.rb:7 | public | port-bound |
| `included` | better_errors.rb:10 | public | port-bound |
| `corrections` | better_errors.rb:16 | public | external |
| `real_filename_and_line_offset` | better_errors.rb:21 | public | internal-reachable |
| `tmp_file?` | better_errors.rb:41 | public | internal-reachable |
| `correct_tmp_file` | better_errors.rb:45 | public | internal-reachable |
| `included` | kaminari.rb:5 | public | port-bound |
| `page_url_for` | kaminari.rb:11 | public | internal-reachable |
| `params_for` | kaminari.rb:21 | private | internal-reachable |
| `translate` | internationalization.rb:16 | public | unreachable |
| `transform_text` | internationalization.rb:24 | public | internal-reachable |

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
