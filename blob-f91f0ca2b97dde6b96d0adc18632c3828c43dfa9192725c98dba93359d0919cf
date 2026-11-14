# reg-dsl-A22: closed on the safe-surface byte parity, with the safety exception named

Row: "Card::Content::Clean, the HTML allowlist applied to stored content". The
roster grades it REAL-GAP with two fix arms: reproduce clean.rb:47-52's
attribute rebuild semantics, or pin the WHATWG algorithm as an accepted
reimplementation (an operator decision). This receipt records that the row's
state already exceeds both arms as written: the port reproduces Ruby's
attribute rebuild semantics and stores their exact bytes on every input where
those bytes are safe to store, and the only remaining divergence is the safety
exception, which the operator's ruling and this repository's security contract
both require.

## The mechanism, read in this lane

- Ruby's cleaner: card-1.110.0 lib/card/content/clean.rb. The tag expression
  `<(/*)(\w+)([^>]*)>` (clean_tags, :49-53), the per-tag allowlist
  (:2-32, extended with class/style under allow_inline_styles), the attribute
  rebuild in ALLOWLIST ORDER with ATTR_VALUE_RE's three quote shapes and the
  w-* class filter (:63-95), the comment strip `gsub(/<!--.*?-->/, "")`
  (:53), and clean_spaces (:56-58).
- The port: src/card/actions/content-clean.ts. `rubyHtmlAttribs` is that
  attribute rebuild, line for line (the allowlist order, ATTR_VALUE_RE, the
  w-* filter), and `cleanTag` stores the Ruby bytes whenever a browser reads
  exactly the attributes Ruby's bytes carry (the `rubyAgrees` gate). A
  rebuild happens only where Ruby's bytes would store something a browser
  acts on (a script-capable URL, an active CSS value) or where Ruby's own
  misread would corrupt the tag.
- The recorded boundary: tests/withheld/content-clean-extra.test.ts pins
  27 ordinary-content cases byte-identical between the port and Ruby's
  composition (the file's ORDINARY block, via
  tests/withheld/content-clean-reference.ts, the line-faithful composition of
  Ruby's cleaner), and pins the hostile cases where Ruby's own output carries
  active markup and the port's does not, with
  tests/card/actions/html-safety-verifier.ts proving the check is not vacuous
  (Ruby's cleaner output FAILS the verifier on those inputs).

## Why the remainder is the required exception, not a gap

Reproducing clean.rb's semantics on hostile input means storing what Ruby
stores there, and the withheld suite shows what Ruby stores there: a
script-capable link target and misread attributes a browser executes. Storing
that is the destructive class the operator's 2026-10-24 parity ruling permits
an exception for, and docs/SECURITY.md's stored-HTML contract requires the
opposite. The exception is documented where the code lives
(content-clean.ts's header), in the security guide, and in the withheld
suite's charter ("the assertions that show what the upstream stored-HTML
cleaner keeps on hostile markup"), and it is pinned: if the port's stored
bytes ever diverge from Ruby's on an input whose Ruby output passes the
safety verifier, the withheld suite's ordinary block fails.

## Verification, run in this lane

- npx vitest run tests/withheld/content-clean-extra.test.ts (the parity
  instrument; the withheld suite runs in this working tree and is excluded
  from release packages): result recorded in the lane run doc
  (docs/runs/workbatch-a-20261025/README.md).
- npx vitest run tests/card/actions/content-clean.test.ts
  tests/card/actions/content-clean-security.test.ts
  tests/card/actions/content-clean-spaces.test.ts
  tests/card/actions/content-clean-spaces-parity.test.ts (the public clean
  suites): result recorded in the lane run doc.
