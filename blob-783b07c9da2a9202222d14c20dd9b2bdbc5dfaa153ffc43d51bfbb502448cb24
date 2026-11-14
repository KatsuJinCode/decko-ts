# The owner's save: the notification phase's card-independent reads (2026-10-23)

Family round two, row ROW-3. The rest of the tip's section 6.1 population
(the post-commit fan-out) after ROW-1 took its junction reads.

## 1. Headline

| | |
|---|---|
| The graded save, pipeline POSTs | 284 (this row does not change it: the lever is a ruling, not a change) |
| The population | **14 POSTs** of the 284: the preferences read (7) and the users-of-the-user-type read (7) |
| The lever | one read per SAVE instead of one read per saved card |
| Why it is not landed | **the lever is a visibility decision, and the family named it as the operator's** (section 4) |
| The evidence the operator needs | Ruby's own behaviour caches BOTH reads deck-wide (section 4) |

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/ladder-ROUND2-SP3-ATTR.json
node tmp/census-round2-repeats.mjs tmp/ladder-ROUND2-SP3-ATTR.json
```

The measurement is the local Hrana endpoint against the local copy of the
serving deck. The hosted Bunny service was NOT contacted.

## 3. The population, measured

The attribution copy of the ladder, the statements AFTER the commit (212 of
the save's 812):

| statements | distinct argument sets | shape | POSTs |
|---:|---:|---|---:|
| 7 | **1** | the preferences read (`SELECT preferences.id AS rule_id, ...`) | 7 |
| 7 | **1** | the users of the user type (`SELECT id FROM cards WHERE type_id = ?`) | 7 |
| 7 | 7 | the reference count (`SELECT COUNT(*) AS n FROM card_references ...`) | 7 |
| 14 | 2 | the follower's junction read | 7 |
| 21 | 3 | the follower's junction-content read | 8 |

**THE TWO CARD-INDEPENDENT READS ARE THE SAME READ SEVEN TIMES.** The
notification phase resolves the followers of every saved card, and each
card's resolution reads the deck's preference rows and the deck's users of
the user type. Neither read's parameters depend on the card, and the
attribution shows ONE argument set for each across all seven cards: the
same statement, the same parameters, seven round trips.

**THE REFERENCE COUNT IS NOT IN THIS ROW.** Its parameters are the left
card's id and the field's id, so each card's count is a different question.

## 4. The lever, and the ruling it needs

**THE LEVER.** Read both once per save, at the start of the notification
phase, and use that answer for every saved card. That is 14 POSTs -> 2.

**THE BATCH CANNOT DO IT.** A batch rides several statements on one round
trip, and each of these is a single statement. The two cannot ride together
either: the users-of-the-user-type read is only needed when the preference
rows name the `*all` user, and that is the preferences read's own answer, so
the second read's NEED is the first read's result.

**WHY THIS LANE DID NOT LAND IT.** The tip named this lever and named the
obstacle: "a memo that outlives the commit would serve the notification
phase a view of the deck that a concurrent writer had already changed
(Brandon's deck has real readers), and a follower could then not be
notified. That is a visibility decision, not a transport one, and it is the
operator's to make" (the family's tip report of 2026-10-22, "The
card-block declaration, reaching the other blocks", section 6.1).

**THE EVIDENCE THE RULING NEEDS, FROM RUBY'S OWN SOURCE.** The pinned gem's
`card-1.110.0/lib/card/rule/preference_cache.rb` caches the preferences
DECK-WIDE, not per request:

```ruby
class PreferenceCache < Cache
  self.sql = %( SELECT preferences.id AS rule_id, ... ).freeze
  self.cache_key = "PREFERENCES".freeze
  USER_ID_CACHE_KEY = "USER_IDS".freeze

  def user_ids
    Card.cache.read(USER_ID_CACHE_KEY) || (populate && user_ids)
  end
  def populate_user_ids
    Card.cache.write USER_ID_CACHE_KEY, user_id_hash
  end
```

and `card-1.110.0/lib/card/cache.rb` shows the cache's `read` and `write`
both going through `Card.cache`, the deck-wide shared cache. So Ruby reads
the preference rows ONCE and serves them to every save until the cache is
cleared, and Ruby caches the user ids the same way.

**WHAT THAT MEANS FOR THE RULING.** The port's per-card re-read is FRESHER
than Ruby's own behaviour: the port sees the deck's preferences as of each
card's resolution, Ruby sees them as of the last cache populate. Reading
once per save sits between the two: fresher than Ruby, less fresh than the
port is today. The visible consequence is narrow and nameable: a follow
preference that another writer changes DURING the notification phase would
be seen by the later cards under the port's today and not seen under the
lever. A follower could then not be notified of that change, which is
exactly the consequence the tip named.

**THE RULING, SPELLED OUT.** Should the notification phase read the deck's
preference rows and the deck's user-type rows ONCE per save, or once per
saved card as it does today? The lever is 14 POSTs of the graded save's
284 (4.9%). The operator's answer decides it; this lane does not make that
call.

## 5. The disk cost and the residue

```
added to the repo:
  docs/reports/owner-save-card-independent-reads-2026-10-23.md   (new) this report
  docs/reports/receipts/owner-save-card-independent-reads-20261023.json  (new) the receipt
changed: nothing (the code is untouched: this row changes no source file)
removed from the repo: 0
residue: this lane's clone (C:/localProjects/decko-ts-savepath-round2-20261023,
  on its own branch port/savepath-round2-20261023), node_modules/ (a junction
  to the release-lead tree's, gitignored), and the lane's gitignored tmp/
  scratch.
```

## 6. What was not done

- **Nothing was deployed and nothing was pushed to a live host.**
- **The lever was not landed.** It is a visibility decision about the deck,
  and the family named it as the operator's. The measurement and the Ruby
  comparison above are what the decision needs.
- **The reference count (7 POSTs) was not reached**: its parameters differ
  per card, so no batch and no per-save memo can serve it.
