# CSS format view evidence

The five views in stock `card-mod-format-0.20.0/set/all/css.rb` now dispatch
through the CSS format chain: `titled`, `content`, `unknown`, `import`, and
`url`. SCSS inherits that chain. `content` and `import` delegate to the card's
`core` view, preserving more-specific core implementations. Comment borders
count Unicode codepoints, as Ruby String#length does. CSS URL generation
implements the local-file-storage path in `set/all/path.rb`; remote-file-storage
absolute URL behavior remains unimplemented.

Measured against the committed stock Ruby oracle outputs in
`reference-harness/fixtures/synthetic-v2-mod-probes`, using `ts-composed`, on
2026-10-15:

| Render-only comparison | Identical | Differing | Reproduced upstream failures |
|---|---:|---:|---:|
| Parent 2ee84710 | 427 / 549 | 113 | 9 |
| CSS views added | 436 / 549 | 104 | 9 |

All five direct CSS probes match. Nine render probes improve, with no formerly
matching probe becoming different. The other four improvements are image CSS
content, list CSS content/titled, and style CSS import probes. This does not
establish complete implementations of those mods.

Both runs are partial development comparisons: semantics and write scenarios
were not run. Both retain a render-session read-write mismatch involving the
oracle's updater_id change on card 307. No comparison rules, expected outputs,
or shared grading instruments were changed.

The behavioral evaluator, refreshed in memory with this run's render results
while retaining historical event evidence, reports card-mod-format incomplete:
99 of 154 declared views identical, 55 different, and two events with no
observed effect. This mixed-scope result is diagnostic, not a release grade.

Validation: 70 tests pass across the CSS dispatch, existing format mod, format
ancestry, and flat-registration census suites; TypeScript checking passes.
The new regression suite compares all five views and inherited SCSS behavior
with the committed Ruby captures and separately exercises dynamic content and
Unicode comment length. No hosted behavior was exercised.
