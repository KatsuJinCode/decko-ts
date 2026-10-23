# The notification phase has no read memo: the save pays 78 round trips after its commit (2026-10-23)

Row ROW-3 of the save path's round three. Lane `port/savepath-round3-20261023`,
in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round3-20261023`.

**THIS ROW IS MEASURED AND NAMED, NOT LANDED.** The lever is a visibility
decision the family named as the operator's, and this lane does not make it.

## 1. The headline

| | |
|---|---|
| The population | the notification phase's 81 repeated reads: the phase runs after the commit, with no transaction and therefore with no read memo |
| The lever | a read memo that lives to the end of the notification phase |
| The measured price of not having it | **13 round trips** carry nothing but a repeat of a read the phase had already made |
| Why it is not landed | the visibility decision is the operator's (round two's ROW-3 named it as such, and this row's measurement confirms the population) |

## 2. The measurement

**THE SAVE HAS THREE PHASES, AND ONLY ONE OF THEM HAS A READ MEMO.** This
lane's own instrument (a driver-side trace of every round trip, every memo
store, every memo drop and every memo clear; not landed) named the path each
round trip took:

| phase | round trips | the memo |
|---|---:|---|
| before the transaction | 7 | none (no transaction yet) |
| inside the transaction | 171 | the transaction read memo |
| after the commit | **78** | **none: the transaction's memo dies with the transaction** |

The notification phase is the save's integration phase: the followers are
resolved, the ancestors' timestamps are bumped, the mail goes out. Ruby's
`after_commit :integration_phase` runs it after the commit, and a failed save
sends no mail, so the port runs it after the commit too.

**78 ROUND TRIPS CARRY 213 STATEMENTS, AND 81 OF THOSE STATEMENTS ARE
REPEATS**: the same statement with the same arguments, read again in the same
phase. The repeated shapes:

| the read | repeats |
|---|---|
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | 39 |
| `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 18 |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 12 |
| `SELECT preferences.id AS rule_id, sets.id AS set_id, ...` (the deck's preference rows) | 6 |
| `SELECT id FROM cards WHERE type_id = ?` (the deck's users of the user type) | 6 |

**13 OF THE PHASE'S ROUND TRIPS CARRY NOTHING BUT A REPEAT**, and those 13
are the two deck-wide reads round two named as ROW-3:

| the read | round trips |
|---|---|
| the deck's preference rows | 6 |
| the deck's users of the user type | 6 |
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | 1 |

## 3. The lever, and why this lane does not pull it

**THE LEVER: A READ MEMO THAT LIVES TO THE END OF THE NOTIFICATION PHASE.**
The phase's own reads would then be served from the phase's own first read,
and the 13 round trips that carry nothing but a repeat would go.

**WHY IT IS NOT THIS LANE'S TO LAND.** A memo that outlives the commit
serves the notification phase a view of the deck that a concurrent writer
had already changed: a follower that joined the deck after the phase's
first read would not be notified, and a follower that left it would be.
That is a VISIBILITY decision about what a save promises its followers, and
the family named it as the operator's. Round two's ROW-3 measured the
deck-wide half of this population (14 POSTs, one argument set each, seven
cards) and did not land it for the same reason; this row's measurement is
the same population at this round's tip, and the conclusion is the same.

**THE EVIDENCE THE RULING NEEDS IS ALREADY ON THE TABLE.** Ruby's own
behaviour caches both deck-wide reads, and the port does not:

- `card-1.110.0/lib/card/rule/preference_cache.rb`: the preference rows are
  cached deck-wide (`self.cache_key = "PREFERENCES"`, read through
  `Card.cache.read`);
- the user ids are cached under `USER_ID_CACHE_KEY`.

So Ruby resolves a save's followers against a cached view of the deck's
preferences and user type, and the port resolves them against seven fresh
reads. **That is the evidence the operator needs to rule either way, and
this lane does not rule.**

## 4. What the operator's ruling would be worth

**13 ROUND TRIPS, measured, plus the repeats inside the phase's packed
batches.** The 68 repeated reads that ride inside the phase's 28 packed
round trips are not counted here: whether removing them removes a round trip
depends on how the packing re-forms the runs, and this lane did not measure
that, because the lever is the operator's to decide first.

## 5. What was not done

- **Nothing was deployed and nothing was pushed to a live host.**
- **The visibility decision was not made.** That is the operator's.
- **The phase's reads were not batched across the phase.** The follower's
  per-card walks are batched per card (round two's ROW-1), and the phase's
  seven walks each carry their own batches. One batch per shape across the
  whole phase would collapse them, and the seam that would hold the whole
  phase's names does not exist yet: the phase resolves the followers one
  card at a time, and each card's walk is what produces the next card's
  work.
