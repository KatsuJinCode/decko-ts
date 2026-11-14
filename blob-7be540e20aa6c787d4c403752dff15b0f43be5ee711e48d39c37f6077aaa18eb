# RSS non-XML view evidence

Nine views from stock `card-mod-format-0.20.0/set/all/rss.rb` now dispatch
through the RSS format chain: `closed`, `comment_box`, `content`,
`feed_description`, `feed_item_description`, `feed_title`, `menu`,
`open_content`, and `open`.

The aliases capture the blocks Ruby specifies through `mod: All::Base::Format`.
`content` and `open_content` run base core's raw-content processing, even if
the card overrides core. In contrast, `open` runs the captured titled block,
which dispatches the card's current core view. The feed title reads the same
prepared `*title` setting as the existing page-title implementation and strips
one initial star from the card name.

Measured against the committed stock Ruby outputs in
`reference-harness/fixtures/synthetic-v2-mod-probes`, with `ts-composed`, on
2026-10-15:

| Render-only comparison | Identical | Differing | Reproduced upstream failures |
|---|---:|---:|---:|
| CSS parent 8108343b | 436 / 549 | 104 | 9 |
| RSS views added | 445 / 549 | 95 | 9 |

All nine implemented RSS declarations match their direct oracle probes.
Eight direct probes improve; open_content was already matching through the
inherited implementation. The ninth improvement is recent-search
feed_item_description. No formerly matching probe becomes different.

This remains a partial development comparison: semantics and write scenarios
were not rerun, and the preexisting render-session read-write mismatch remains.
The XML-writing `feed`, `feed_body`, and `feed_item` views remain unimplemented
in the composed view registry. Their shared Builder state and the reference
runtime's date-conversion failure require separate work. No captured stack
frames or expected XML have been copied into implementation code.

The behavioral evaluator refreshed in memory with this run's render results,
retaining historical event evidence, reports card-mod-format incomplete:
112 of 154 declarations identical, 42 different, two events with no observed
effect. This mixed-scope diagnostic is not a release grade.

Validation: 80 tests pass across RSS/CSS dispatch, existing format mod, format
ancestry, and flat-registration census suites; TypeScript checking passes.
The RSS tests compare all nine views against retained stock Ruby captures and
exercise the alias/core-override distinction using a separate test mod.
Grading instruments and expected outputs are unchanged. No hosted behavior
was exercised.
