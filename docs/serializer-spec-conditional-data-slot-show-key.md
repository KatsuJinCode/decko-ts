# Serializer spec — the conditional data-slot `show` key (upstreamable)

Status: SPEC ONLY — no engine serializer change in the close-71-with-live
lane. This section is the fix a later lane implements in the engine once
the corpus is uniformly live-era; today the swapped expectations carry the
truth (swap-manifest-37-view-expectations-2026-10-03.json).

## The rule, language-neutral

The data-slot attribute's `show` list (`data-slot="{&quot;view&quot;:...,
&quot;show&quot;:[...],&quot;hide&quot;:[...]}"`) is emitted IFF the slot
carries actionable hide/visibility information beyond the requested view
itself. Derived from live reference-deck behavior measured 2026-10-03
(live-check-71: carry/omit agreement with the recaptured expectations
37/37):

1. **OMIT `show` entirely** when the slot is a plain open/closed root whose
   show list would name nothing but the view already named by
   `data-slot.view` (live omits on all 26 plain roots measured:
   15 `mod: <x>:closed`, Message content+open, children:open,
   `*favicon` closed+open, `*all+*head` content+open,
   PCTS content+open, Guns:open, Anonymous+*account+*email:open).
   A `show` entry equal to the slot's own view carries zero information —
   the client already knows the view it requested.
2. **CARRY `show`** when the slot nests an actionable sub-region the client
   must be able to reveal — measured live: every discussion open carries
   `show:["comment_box"]` (11/11), i.e. the slot offers a comment box the
   default render does not include.
3. `hide` is NOT affected by this rule (both eras emit `hide` whenever the
   list is non-empty, e.g. `hide:["bar_middle"]` on every measured slot);
   only `show` is conditional.

Formally, over the engine's `show` candidate list `S` for a slot with
requested view `v`: emit `show` iff `S \ {v} ≠ ∅`; when emitted, the list
is `S` in the engine's existing order minus nothing (live's carried form
keeps the actionable entries: `["comment_box"]`, never `["open",
"comment_box"]` — the stale-era form that named the view itself).

## Why the engine cannot adopt this yet (the corpus is two-era)

The frozen oracle corpus (3,693 slots carry `show`, only 14 lack it —
restore-w2-format lane's census) records the pinned-gem era whose
serializer ALWAYS enrolled the requested view into `show`
(`{"view":"closed","show":["closed"],"hide":["bar_middle"]}` passes
byte-exact today). Live's serializer is the conditional rule above.
Adopting the rule engine-side before the corpus is uniformly live-era
flips ~2,393 passing frozen-form entries RED (restore-w2-format BLOCKER C
arithmetic). Sequencing: corpus to live-era first (this lane moved the 37
W3 view entries; the remaining frozen-form view lines follow the same
swap-manifest pattern per entry with live captures), then the engine
implements this spec in one change.

## Engine implementation surface (for the later lane)

- `src/card/render/format.ts` — `slotOptions()` (:323-334 area) enrolls
  the requested view into `show` when viz is set; this is the emit point
  the rule gates.
- `src/card/render/format.ts` — `processVisibility` (:241-267, the port of
  visibility.rb:73-77) is the second `show` producer.
- The comparison surface is `src/testing/diff.ts` (byte-exact except
  slot-id/accordion normalizations) — no normalization for `show` is
  wanted: the attribute is engine output spec, not per-response noise.
- Ruby reference for the later lane to verify against (NOT verified in
  this lane): the pinned gems' `visibility.rb:73-77` always-list behavior
  vs the live 0.19.1 serializer's conditional behavior — the live-side
  rule here is measured from served bytes, and its Ruby source location in
  the deployed gems is unverified (training-data inference, flagged per
  the verify-claims rule).

## Measured evidence table (live, 2026-10-03)

| slot shape | live `show` | frozen `show` |
|---|---|---|
| discussion open (11/11) | `["comment_box"]` | `["open","comment_box"]` |
| `mod: <x>` closed (15/15) | omitted | `["closed"]` |
| plain open roots (Guns, children, `*favicon`, Anonymous+*account+*email) | omitted | `["open"]` |
| content/open rule views (Message, `*all+*head`, PCTS) | omitted | `["content"]` / `["open"]` |
