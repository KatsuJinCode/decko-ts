# CSS save failure atomicity

Checked against lead `20a948fccd9f60c591e5989fcc1830f2f7f03ffa` on 2026-10-15.
Canonical Ruby 3.3.12 rejects `.probe { color:` with a content error and no
row delta. Both TypeScript adapters instead reported a failed save after
persisting that content, an action, an act and change rows. Compilation ran
in the post-commit asset step. A transaction around the earlier card writes
therefore did not protect this failure.

The save now compiles changed CSS content/type before storage, walking the
whole submitted subtree first. It uses the host's actual LibSass compiler
and returns its rejection as a content validation error. Drafts and changes
from another type to CSS pass the same guard. No compiler output or oracle
answer is synthesized. The existing compiler memo reuses a successful
source/style result during asset finalization.

This is a failure-atomicity repair, not complete Ruby Sass parser parity:
stock `validate_css` uses `Sass::SCSS::Parser`, while the host uses the real
LibSass asset compiler. The error text consequently differs. The documented
mod callback stub and event-completeness classification remain unchanged.
SCSS variable-context validation and other post-commit asset failures remain
separate work.

Focused commands from the repository root of the original verification checkout:

```
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/tools/reference-harness-style-compiler.test.ts tests/server/write-routes-compiler-dispatch.test.ts tests/card/actions/style-asset-events-save-path.test.ts
node node_modules/vitest/vitest.mjs run tests/server/edge-compiler-byte-identity.test.ts
node tools/test-gates.mjs check
git diff --check
```

Both actual adapter sessions assert exact equality of every SQLite table
and every staged file byte after malformed update, create, and a subcard
update. The real localhost HTTP regression saves valid CSS, builds its
stylesheet through LibSass, then rejects malformed edits, drafts, type
changes and a nested CSS create with 422/content errors. Card, history,
virtual, reference, data-version and sequence rows and every asset file
remain unchanged; a subsequent GET returns the last valid content. The
stylesheet still contains the valid blue rule.

Final focused run: 8/8 tests passed in 7.12s; TypeScript passed; all 730
test files classified; whitespace check passed. The unchanged compiler's
29 byte-identity tests also passed (17.25s combined earlier run, including
the then-failing HTTP test before its fixture corrections). Browser
journey acceptance remains a separate check; no live deployment was made.
