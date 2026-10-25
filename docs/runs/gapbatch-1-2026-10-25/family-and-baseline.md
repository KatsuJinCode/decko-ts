# Gap batch 1: the whole-family exercise at the final commit, against the branch's own baseline

The brief's acceptance: row W4's four legs are the acceptance test, the
whole-family exercise runs at the final commit, and the family baseline
holds or the regression is named.

## The runs

Both runs used the family's own recipe on the local signed-in deck (the
same deck snapshot SHA-256 6aebb654... the W4 probe recorded), the rebuilt
deploy bundle, two throwaway local accounts and a headless browser with a
throwaway profile. Nothing reached a live site and nothing deployed.

| run | command | source | result |
|---|---|---|---|
| the baseline (before the seat) | `node tools/edge-signed-in-exercise.mjs --out .runtime/gapbatch1/baseline/report.md` | `a20b5a21` (the instrument port, the seat not yet in) | 310 / 320; failures: the RichText editor toolbar leg, N9 applied layout, P5 `*type_plus_right`, P6 update-rule-from-Rules-tab, C20 junction, the timings leg, and the four W4 legs |
| the family at the final commit | `node tools/edge-signed-in-exercise.mjs --out .runtime/gapbatch1/final2/report.md` | `23b701e9` | **314 / 320**; failures: the RichText editor toolbar leg, N9 applied layout, P5 `*type_plus_right`, C20 junction, the timings leg, and the W4 dashboard leg (the residual below). Capability coverage moved from 90 covered / 1 not covered at the baseline to 91 covered / 0 not covered |
| the W4 module alone, at the final commit | `node tools/edge-signed-in-exercise.mjs --only w4-follow-views` | `23b701e9` | 8 / 9: the followers-list, count and empty-control legs PASS; the dashboard leg FAIL |
| the E7 module alone, at base | `node tools/edge-signed-in-exercise.mjs --only unmeasured-save-edit-create` | `95654138` (the unmodified roll tip, in a separate base worktree) | 13 / 13 |
| the E7 module alone, mid-lane | same, at `ef472024` | `ef472024` | 12 / 13: E7 failed ("Nest rules help form unavailable") |
| the E7 module alone, at the final commit | same, at `23b701e9` | `23b701e9` | 13 / 13 |

## The verdict against the baseline

The baseline holds. The final family's six failures are the baseline's own
named failures minus the three W4 legs this batch closed (and minus P6,
which failed in the baseline and passed in both family runs at this lane's
commits), plus nothing new. The net family movement is +4 checks.

## The four W4 legs at the final commit

Three of the four legs pass, and they are the three gaps this batch set out
to close (see this directory's three receipts):

```
PASS  W4 the followers list names exactly the accounts that follow the card
PASS  W4 the Engage tab's follower count equals the accounts the followers list names
FAIL  W4 the all-followed-cards view lists the followed cards and no unfollowed card
PASS  W4 a card nobody follows has an empty followers list
```

The dashboard leg's residual, measured and named (not attributable to the
seat): both of the dashboard's doors answer 200 with the follow editor
("Follow Ignore") where the pre-seat bundle answered 403 on both, but the
editor's items list renders empty ("no entries") where the leg needs the
stored follow preference rules named (rendered 0 against the deck's own
stored rule count). Two mechanisms, both downstream of the seat:

1. The deck-shape limit the W4 finding itself declares: the dashboard
   junction's set-module coverage rides the account card's TYPE (the
   type_plus_right anchor resolves through the left card's type), and this
   deck's accounts are not all typed the way the stock gemset names them.
   The probe measured the predicates on the deck: the dashboard junction of
   a `BasicCs`-typed account (this deck's own) resolves NO follow set
   module, in the port and, by the same codename arithmetic, in the pinned
   Ruby - "resolves to no follow set module on this deck, in the original
   as well as in the port, and both take the unknown card branch" (the W4
   finding's own words). The harness member's junction DOES resolve (its
   type's codename maps to the registered module), which is why its page
   renders at all.
2. The follow editor's items walk renders no entries on the serving path
   for the junction that does resolve: the port's own pins prove the view
   layer can render the preference-rule pointer list
   (tests/card/set-modules/virtual-set-modules.test.ts, "the user's follow
   PREFERENCE RULE CARDS are the dashboard's items", 17 of 17 pass), so the
   remaining divergence is in the serving path's editor item walk, the
   follow mod's view layer - the next defect, reachable only because the
   seat now renders the junction as a card at all.

## The regression this lane found in itself, and closed

The first family run at the seat (`ef472024`) failed the E7 leg ("the nest
dialog offers a Rules editor option whose form accepts a rule name and
persists the rule") that the baseline passed. The isolation runs attribute
it: E7 passes at the unmodified base, fails at `ef472024`, passes at
`23b701e9`. The mechanism, measured with a direct render probe at both
flag postures: the nest dialog's rules tab asks `view=nest_rules` of a
ROWLESS type_plus_right set junction, which the structure-rule universe
resolves as a KNOWN virtual card (fetch.ts's lookup, typeId Set). The
seat's rebuild arm re-fetched that record with new-card arguments, the
fetch answered a plain new card (the new-card arm returns ahead of the
structure arm), seatAbsentRoot marked it unknown, and the unknown-card gate
substituted the configured :unknown view for the rules editor. `23b701e9`
keeps the structure-resolved record and makes the absent-card arms
flag-indifferent for it; the probe renders byte-identical editors at both
postures (9039 bytes each, differing only in the nondeterministic slot-id
hashes), and the E7 leg passes at the final commit.

## The single-run swaps, named

Two legs moved against the baseline in single runs, in opposite directions:
P6 (update rule set from the Rules tab) failed in the baseline and passed
in both family runs at this lane's commits; E7 failed in the first family
run (the seat regression above, since closed) and passed in the baseline
and at the final commit. Neither leg exercises the follow surface. P6's
failure is present at the roll tip before any of this lane's changes (it is
in the baseline, which predates the seat) and absent on re-runs, so the
run-level evidence reads as a flank, not a delta this lane introduced.

## Code-level acceptance at the final commit

- `node --test tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs`:
  5 tests, 5 pass.
- `npx vitest run` over the absent-card page pins, the not-found format
  parity, the set-module pins, the follow mod view pins and the follow
  directory: 96 tests, 13 files, 0 failures.
- The deploy suite at the final commit: the same two failing files the
  UNMODIFIED roll tip fails (staging-rss-format-d3, worker-edge-cache-
  runtime; verified by running both at `95654138` in a separate worktree,
  identical assertions), 89 files pass.
