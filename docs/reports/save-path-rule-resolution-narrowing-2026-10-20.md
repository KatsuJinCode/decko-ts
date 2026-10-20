# The `self` lookup's rule resolution, narrowed — and the save's remaining cost, re-attributed (2026-10-20)

Continues `save-path-round-2-whole-deck-universe-rebuild-2026-10-20.md` (ff235c5c).
That round measured the save's remaining cost as five whole-deck composed-key
walks and proposed two structural cuts. This round did the equivalence proof,
landed one narrower resolver, and **measured the other proposed cut and found it
a regression**. It also corrects the attribution in ff235c5c's chain.

Branch `perf/savepath-rule-resolution-20261020`, base ff235c5c, worktree
`C:/localProjects/decko-ts-savepath-rewrite-20261020`.

## 1. Headline

| | |
|---|---|
| Landed | a per-key composed-name walk for the `self` set-pattern member lookup, proven equivalent to the whole-deck walk on **all 19,469** composed names of the serving deck |
| Rejected, with numbers | routing `firstApplicableReadRule` to the existing rule-closure walk — it is **3× slower** on this deck |
| Corrected | ff235c5c names the `self` lookup as the whole-deck consumer. It is not. **All five walks are `firstApplicableReadRule`.** |
| Open, for a parity decision | the walk composes through TRASHED sides; Ruby does not. 38 names on the serving deck. |
| Not done | the save's five walks are still five walks. This round did not cut them. |

## 2. The attribution was wrong, and measuring it was the whole first move

ff235c5c's chain ends at `set-read-rule.ts:608` — the `self` branch — and calls
it "the one write-path consumer" of `resolveRuleIdsByKeys`. It is the one
consumer asking for a **non-rule** key, but it is not the one consuming the
time. `firstApplicableReadRule` (`set-read-rule.ts:273`) calls the same
resolver, and that is what the save runs.

Established by tagging the walk's SQL with the call's own shape (a temporary
`/*wholeDeck|n=<keys>|<first key>*/` prefix, which survives the bundle's
minification where a stack frame does not), then reading the tags off
`tools/diagnose-owner-save-statement-ladder.mjs`'s own statement trace:

```
5x  wholeDeck | n=5 | person+company+*type_plu_right+*read
5x  wholeDeck | n=5 | person+skill+*type_plu_right+*read
5x  wholeDeck | n=5 | person+project_s_participating+*type_plu…
2x  wholeDeck | n=2 | basic_c+*type+*read
5x  wholeDeck | n=5 | person+related_person+*type_plu_right+*r…
```

Every one is a `ruleNamesForCard(card, "*read")` candidate list — rule-shaped,
ending in `*read` — which is `firstApplicableReadRule`. None is a single
composed card name, which is what the `self` branch asks for. The graded save
never reaches the `self` branch, so fixing it changes nothing for this save
(m§5).

## 3. What landed: `resolveComposedNameIdsByKeys`

`src/card/permissions/read-rules.ts`. Settles only the requested key's
contiguous `'+'`-segment runs, level by level, one `driver.batch` per level.

**Equivalence, and the proof.** Soundness: the universe's seed is a card whose
stored key IS a run of the requested key, and each arm's result is a run only
when *both* operands are (an arm concatenates them) — so nothing outside those
runs can contribute. Completeness: induct on segment count. A 1-segment run is
a stored-key read, which is the universe's own seed term; an n-segment run is
produced by exactly the two arm shapes, each concatenating a resolved ckey with a
STORED key, so its operands are strictly shorter runs already settled at that
level. Both shapes are evaluated, at *every* split, because the universe may
compose at any of them.

Measured, both statements lifted verbatim out of `read-rules.ts` and run against
the serving deck (`node:sqlite`, readonly,
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`,
19,482 live cards, 5,681 keyed, 13,801 keyless junctions), over **every** one of
its composed names:

| walk | keys checked | agree | wrong id | empty |
|---|---:|---:|---:|---:|
| per-key, vs `RULE_KEY_UNIVERSE_STATEMENT` | 19,469 | 19,469 | 0 | 0 |

**Cost, same deck, same process:**

| shape | per key | five lookups (the save's shape) |
|---|---:|---:|
| whole-deck universe | 203 ms warm | 898.8 ms |
| the per-key walk | 0.095 ms | 0.3 ms |

The per-key walk issues ~9.6 statements per key on this deck (max 83), batched to
one round trip per segment level. Bound parameters are chunked at 100 so every
adapter sees the bound form rather than leaning on D1's inlining.

**The arms' trash semantics, reproduced term for term.** The universe tests
`j.trash` but NOT the composed side's — `r.key IS NOT NULL`, no trash clause — so
a live junction composes through a trashed side. A hand-written walk that adds
the missing test is fail-open: the key stops resolving and the member lookup
falls through. Pinned in both directions, and carried a level deeper
(`alpha+trashed+beta`, a trashed side feeding a further composition).

**The ambiguous key is not guessed.** A key two cards both compose — a stored
compound key and a junction over the same sides; `cards.key` is UNIQUE, so the
two meet only that way — is answered by the whole-deck walk, whose Map collapses
it by output order. No cheaper walk reproduces that choice, so this one runs the
walk that decides instead of picking. It never fires on the serving deck (19,469
rows / 19,469 distinct ckeys) and is pinned to fire on a fixture where it does.

**Two bugs the contract caught before it went green** — both are the traps in
this walk:

- a run with no stored key of its own — the ordinary case, a composed name that
  exists only as a junction — had no entry to fold arm results into, so every
  arm result for it was dropped. That loses 12 of the fixture's composed names.
- the two arms coincide whenever both sides are stored and resolved (the
  ordinary depth-2 case), so pairs are deduped per run.

## 4. What was rejected: the rule-closure swap

`firstApplicableReadRule`'s candidates *are* rule-shaped, and
`resolveRuleIdsByRuleKeys` answers keys of that shape identically — so the swap
looks free. It was implemented, measured, and reverted.

Both statements lifted verbatim from `read-rules.ts`, same deck, 6 runs, warm:

| walk | rows | warm min | warm median |
|---|---:|---:|---:|
| `RULE_KEY_RULE_CLOSURE_STATEMENT` | 1,489 | 322.3 ms | 346.6 ms |
| `RULE_KEY_UNIVERSE_STATEMENT` | 19,469 | 109.1 ms | 114.3 ms |

**The scoped walk returns 13× fewer rows and takes 3× longer.** Its five
`MATERIALIZED` edge CTEs cost more to build than the deck they prune. The save
ladder agrees: 5 calls cost 310 ms whole-deck against 330 ms rule-closure.

`read-rules.ts` calls the scoped walk "~10× cheaper". That is **not reproducible
on this deck** — it was measured for the cold render path, a different workload,
and the two paths should not be assumed interchangeable on cost. The numbers
are now recorded at both call sites so nobody re-derives them.

The two walks DO agree: over all 1,493 rule-shaped composed keys, **0
disagreeing, 0 invented, 4 missing** — and the 4 are the setting cards' own bare
keys (`*read`, `*create`, `*update`, `*delete`, cards 6546–6549). The scoped
walk's projection admits only the `'+<setting>'` form, and no candidate is in
that form, so the swap would have been *correct*. It was still wrong on cost.

This makes ff235c5c's §4(a)–(c) four rejected cuts, all with numbers:

| cut | verdict |
|---|---|
| (a) push the requested key into the final projection | no speedup (ff235c5c) |
| (b) `UNION ALL` + final `DISTINCT` | 20–30% slower (ff235c5c) |
| (c) drop the `self` resolver call | wrong answer (ff235c5c) |
| (d) route `firstApplicableReadRule` to the rule-closure walk | **3× slower (this round)** |

## 5. Before / after on the graded save

`tools/diagnose-owner-save-statement-ladder.mjs`, same deck, base ff235c5c in a
second worktree and this branch, run **back to back in the same machine state**
so the millisecond columns are comparable. The control page — which nothing in
this branch touches — landed at 821 and 824 ms, so the two runs saw the same
machine.

| measure | BEFORE (ff235c5c) | AFTER (this branch) |
|---|---:|---:|
| pipeline POSTs | 439 | 439 |
| statements | 597 | 597 |
| db wall (ms) | 817 | 793 |
| save statement-exec (ms) | 473 | 487 |
| **whole-deck universe walks** | **5 × 387 ms** | **5 × 396 ms** |
| walk share of statement-exec | 82% | 81% |
| CONTROL edit page statement-exec (ms) | 821 | 824 |

**Counts are unchanged, and that is the honest result.** 439 / 597 / 5 in both.
The change removes the whole-deck universe from the `self` lookup, which the
graded no-edit save never calls, so the save's cost is untouched — 387 → 396 ms
and 473 → 487 ms are run-to-run noise at a control that matched to 0.4%. The
five walks it still pays are `firstApplicableReadRule`'s, and both available cuts
for those are measured dead (§4, and ff235c5c §4).

**What the per-key walk is worth** is on its own terms, measured in one process
against the same deck (§3): 0.095 ms against 203 ms per key, 19469/19469
equivalent. It is a correct, large, proven win on the `self` lookup — a save that
touches a `*self` set rule gets it, and the serving deck carries 20+ `*self`
set patterns, so that is a real population of saves. It is not this save.

## 6. Open: a Ruby divergence this lane reproduces rather than fixes

`RULE_KEY_UNIVERSE_STATEMENT`'s arms do not test the composed side's trash.
Measured on the serving deck: **268 trashed cards carry a key, and 38 composed
names resolve ONLY through one** — e.g. card 1607 `justin_gordon+description+
illustration`, whose right side (1599, `illustration`) is trashed.

Ruby does not do this. `Card::Lexicon#lex_to_id` filters `trash: false` at
every `id()` (`prototype/lib/card/lexicon.rb:120-128`), so
`Lexicon.id("justin_gordon+description+illustration")` returns nil in Ruby and
1607 in the port.

**The port is already carrying this divergence, and this lane reproduces it
rather than correcting it**, because changing it changes permission decisions and
that is not a performance lane's call. It is pinned as current behavior in
`tests/card/permissions/composed-name-self-pattern-resolution-equivalence.test.ts`
and needs a parity decision of its own: which is authoritative — the walk, or
Ruby's lexicon?

## 7. Reproduce

```
# base and branch, back to back, so the ms columns are comparable
git worktree add C:/localProjects/decko-ts-savepath-baseline-ff235c5c --detach ff235c5c
git worktree add C:/localProjects/decko-ts-savepath-rewrite-20261020 -b perf/savepath-rule-resolution-20261020 ff235c5c
node tools/bundle-bunny-edge-engine.mjs
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-BEFORE.json
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-AFTER.json
```

Both walk shapes measured against the serving deck, statements lifted verbatim
out of `read-rules.ts` (never retyped):

```
node tools/measure-rule-walk-shape-cost-and-equivalence.mjs
```

The call-site attribution in §2 needs the temporary SQL tag described there; it
was not landed.

## 8. What the remaining cut would take

The cost is five identical whole-deck walks per save, separated by writes, for
five candidate lists that overlap heavily. The two scoping ideas are now
measured dead. What is left is the structural option ff235c5c named second and
this round did not attempt: an **incremental** universe — one inserted row per
created card instead of a drop-and-re-walk — which needs an `UPDATE` arm for
moved sides and flipped trash flags, and needs its equivalence pinned against
the full walk on a real deck. That proof did not fit this round's budget and is
not claimed.

The measurement worth carrying forward: the whole-deck walk is 109 ms warm on a
19k-card deck, and the scoped walk meant to replace it is 322 ms. Whatever
replaces it should be measured against **both**, not against the doc's claim for
the scoped one.