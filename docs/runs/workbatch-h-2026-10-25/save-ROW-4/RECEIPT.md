# save-ROW-4: the store phase's junction reads, named at the lever

- The row's own label: "the store phase's type walk: the junction reads the
  walk asks for over and over"
- The row's own receipts:
  `docs/reports/owner-save-junction-read-walk-2026-10-23.md` and
  `docs/reports/receipts/owner-save-junction-read-walk-20261023.json`, plus
  the save-path family's round reports under `docs/reports/owner-save-family-round-*.md`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`.

## Verdict: named, not closed. The population is measured, the lever that
## could pay for it is named, and the lever's own risk is why it is not this
## row's to close.

## The population

The store phase's type walk asks for the same junction reads over and over.
The round two report's own census reads 71 of the 184 statements naming a
standard card on one side, and the declaration that knows the walk would
have to know which standard card pairs with which.

## The lever, and its measured pay

The save family's round four lever is a pin separation: it keeps a by-id
answer alive across a write that assigns the read's WHERE column but pins
another id. On the graded save it fires 1331 times and keeps 35 more memoized
answers alive, and it pays NO round trip: 257 pipeline POSTs before and 257
after. The reason is measured and not guessed: every answer the rule keeps
alive is one no reader asks for again, because the reads whose answers the
card write drops are reads of the very card the write touched, and those
must be re-read whatever the memo says. The junction reads this row names
are not among the answers that survive, so the repeated junction reads are
still repeated.

## Why it is not landed as a closure

The lever that could pay here is a narrowing that treats "the write assigns
the value the row already carries" as "not assigned". That rule decides when
a memoized answer is stale, and a stale answer is a wrong answer, so it
stays the family's named lever and not this fold's to close.

## The port body and the merge state

`src/card/drivers/bunny-db.ts` carries the driver's transaction read memo.
That body is in the canonical lead and in the shipping candidate, so the
engine the live edge serves is unchanged by the round four's lever, which
lives on `port/savepath-round4-20261023` and in neither the canonical lead
nor the shipping candidate.

## What would close it

The staleness rule, landed with the save-path family's own battery, because
it decides when a memoized answer may be reused at all. This lane did not
land it: a wrong answer served from a memo is a save that corrupts a card,
and that change belongs to the family's own measurement, not to a fold of
this roster.
