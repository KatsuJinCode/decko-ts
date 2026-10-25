# pd-5: the signed-in edit-link parity regression, stated instead of deleted

- The row's own label: "the signed-in edit-link parity regression stated
  publicly instead of deleted from the ledger"
- The instrument: the suite that pins the bytes,
  `tests/card/mod-loader/card-mod-edit-views.test.ts`, over the committed
  Ruby recording `fixtures/captured/edit-views.json`
- Commands:
  - `npx vitest run tests/card/mod-loader/card-mod-edit-views.test.ts`
    (exit 0, 1 file, 14 tests, 14 passed, 185 ms)
  - `npm test` (the full correctness gate) at commit `c17906db`, where the
    same file is green in the full run as well
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip
  of `deploy/full-candidate-20261101`, which is the tip this branch starts
  from.

## Verdict: the defect was fixed, and the ledger now says so

The row asked for the current status of a regression that had been deleted
from the ledger, because a deleted row cannot say whether a defect was fixed
or forgotten. It was fixed.

## What the defect was

The guide rule card's edit link was rendered for every viewer. `guide.rb`
prepends the link only when the guide card is allowed to be updated. The
port's gate could only deny: it asked the engine for that card's update
verdict and suppressed the link only on an explicit refusal. A verdict the
engine had not established was not a refusal, the guide rule card is nested
rather than a render root, so its verdict was not established for it, and the
link rendered for viewers who must not see it.

That is the row's own old wording, from the ledger before commit 39b46ef3
(2026-10-14) removed it.

## What fixed it

The gate reads the task seam's deny-by-default posture now: the link is
rendered only on an affirmative verdict.

| | before the fix | at this tree |
|---|---|---|
| `src/card/mod-loader/mods/card-mod-edit.ts` | `if (taskAllowed !== undefined && taskAllowed === false) return text;` (line 2111 at `17ce204a^`) | `if (taskAllowed !== true) return text;` (line 2308) |
| `src/card/mod-loader/mods/card-mod-help.ts` | the same shape (line 299 at `17ce204a^`) | `if (taskAllowed !== true) return text;` (line 290) |

The fix landed in commit 17ce204a, 2026-10-11.

## The evidence, oracle matched

The Ruby recording is committed, so the answer is a comparison and not an
opinion. Counted in `fixtures/captured/edit-views.json`, target
`basic_note`:

| arm | `guide_tab` | `overlay_guide` |
|---|---|---|
| bot stand-in (always ok) | 1 `edit-link` | 1 `edit-link` |
| plain-member stand-in | 0 | 0 |
| anonymous | 0 | 0 |

Ruby's own bytes carry the link for the viewer that may update the guide and
no link for the two that may not. The suite renders the same three arms and
compares every pinned view byte for byte against those bytes, and it is green
here: 14 tests, 14 passed.

## What landed

- `KNOWN_FAILURES.md` carries the section "The signed-in edit-link parity
  regression: fixed at this tree, and how to tell", with the defect, the
  mechanism, the two lines of the fix, the fix commit and the evidence above.
  The file keeps the memory of the defect, so a reader can tell a fixed
  defect from a forgotten one.

## What this lane did not do

It did not re-record the Ruby capture, did not change any port source, did not
change the suite, and did not touch a hosted edge.
