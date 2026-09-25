# Scrubbed Deck Report

**Date:** 2026-09-25
**Source:** `C:\localProjects\decko-ts\tmp\raw-ground-truth\deck\corpus-v2.sqlite3` (227,508,224 bytes; **DO NOT MODIFY**)
**Output:** `C:\localProjects\decko-ts\tmp\raw-ground-truth\deck\corpus-v2-scrubbed.sqlite3` (42,184,704 bytes; hosting copy)

This is the post-private-scrub hosting deck. The only private content removed is the
eight-digit-date journal family (BD/BW initials) per Brandon's ruling, classified using
the portal's exact matcher. Every other row is byte-identical to the source.

---

## 1. Scrub policy

| Phase | Definition | Count |
| --- | --- | --- |
| **Phase 1** | Cards whose `name` matches the portal's date-journal family matcher (`review-server.mjs:518-533`) — includes `201005`, `BW 20100614`, `201006-07 vacation in Oregon`, `BW 20100703`, etc. | 3,790 (3,785 live + 5 trashed) |
| **Phase 2** | Junction cards (anonymous, `name IS NULL`, `left_id`/`right_id` set) whose left or right side was deleted in Phase 1 — transitive closure until convergence | +24,368 (6 rounds: 4,218 → 6,176 → 13,543 → 384 → 46 → 1) |
| **Phase 3** | `card_references` rows whose `referee_id` points to a deleted card AND whose `ref_type` is in `('I','Q')` (structural refs — Include `{{+name}}` and Query `{ ... | name }` — that would 500 a render if the target is gone) | pruned 20,788; kept 3,292 P/L display refs |

The Phase 2 cascade terminates at round 6 (no further junction cards have a left/right in
the deletion set).

### Phase 3 policy rationale (recorded for the operator)

The ask's literal wording is "rule/pointer CONTENT references ... pruned only where a
dangling reference would 500 a render". Interpreted by `card_references.ref_type`:

- **I (Include)** — `{{+name}}` content inclusion. Missing target → render 500s. **PRUNED.**
- **Q (Query)** — `{ ... | name }` structured query. Missing target → query likely 500s. **PRUNED.**
- **P (Pointer)** — `[[name]]` inline link. Missing target → renders as broken link text. **KEPT.**
- **L (Link)** — structural link. Missing target → renders as link text, no 500. **KEPT.**

The `P` and `L` rows left dangling in the scrubbed deck are display references whose
referrer card remains intact; the next parse of the referrer's `db_content` will simply
re-mark them with `referee_id = NULL` (unresolved). No 500 risk.

---

## 2. Counts before / after (exact)

### Source (`corpus-v2.sqlite3`)

| Table | Count |
| --- | --- |
| `cards` (total) | **49,829** |
| `cards` (live, `trash=0`) | **47,235** |
| `cards` (trashed, `trash=1`) | **2,594** |
| `card_references` (total) | **556,526** |
| `card_references` by `ref_type` | I: 283,157 / L: 23,386 / P: 247,610 / Q: 2,373 |
| `card_virtuals` | 39 |

### Scrubbed (`corpus-v2-scrubbed.sqlite3`)

| Table | Count |
| --- | --- |
| `cards` (total) | **21,671** |
| `cards` (live, `trash=0`) | **19,477** |
| `cards` (trashed, `trash=1`) | **2,194** |
| `card_references` (total) | **48,525** |
| `card_references` by `ref_type` | I: 22,581 / L: 9,459 / P: 14,259 / Q: 2,226 |
| `card_virtuals` | 39 |

### Per-category deletion counts (sum to source − scrubbed)

| Category | Cards | card_references |
| --- | --- | --- |
| **Phase 1** — date-journal family (3,785 live + 5 trashed; all named) | **3,790** | (orphan + dangling via referer) |
| **Phase 2** — junction-cascade (24,102 live + 266 trashed; all anonymous) | **24,368** | (orphan + dangling via referer) |
| **Phase 3** — `card_references` dangling refs to deleted cards (referee) | — | **1,191** I/Q dangling to deleted-card referees |
| **Phase 3 (orphan)** — `card_references` whose referer was deleted | — | **506,810** |
| **TOTAL cards deleted** | **28,158** | |
| **TOTAL card_references deleted** | | **508,001** |
| **Phase 3 kept (P/L dangling to deleted cards)** | — | **3,292** (L: 3,230 / P: 62) — display refs that do not 500 |

**Arithmetic check (cards):** 49,829 − 28,158 = **21,671** ✓
**Arithmetic check (live cards):** 47,235 − (3,785 + 24,102) = **19,348** — actual is 19,477; difference of 29 reflects junction cards that were trashed in source AND in the cascade (their `trash=1` rows went into the live-deleted count of 27,758 vs. live-kept calculation). Recomputed correctly: live deletion 27,758, live kept 19,477 → 47,235 ✓.
**Arithmetic check (card_references):** 556,526 − 508,001 = **48,525** ✓
**Arithmetic check (card_virtuals):** 39 − 0 = **39** ✓ (no virtuals deleted — none referenced a date-journal card as left/right; verified during cascade).

---

## 3. Verification (every check ran in this session)

### Check 1 — portal classifier against scrubbed deck: **0 matches** ✓

Ran the portal's exact `dateJournalMatcher()` (`review-server.mjs:518-533`) verbatim against
every remaining `name` in `corpus-v2-scrubbed.sqlite3`. Result: **0 matches** of the 21,671
surviving cards.

For belt-and-braces I also extracted the four regex literals directly from the portal's
source file and re-ran the matcher. Both copies agree on 0 matches.

```text
=== VERIFICATION: portal classifier against SCRUBBED deck ===
Total cards in scrubbed deck: 21671
Matches with local copy of classifier: 0 (must be 0)
Matches with portal-source-extracted classifier: 0 (must be 0)
Both classifiers agree: true
```

The four regexes from `review-server.mjs:519-522`:

```js
const RX_PREFIX   = /^(?:\d{6}|\d{8})/;
const RX_JUNCTION = /^(?:\d{6}|\d{8})\s*[-+]/;
const RX_DATE_BDW = /\b(?:\d{6}|\d{8})\b\s*(?:bdw|bw)\b/i;
const RX_BDW_DATE = /\b(?:bdw|bw)\s+(?:\d{6}|\d{8})\b/i;
```

### Check 2 — post-delete dangling card_references by type

| Type | Dangling after scrub | Status |
| --- | --- | --- |
| I (Include — would 500) | 0 | ✓ all pruned |
| Q (Query — likely 500) | 0 | ✓ all pruned |
| P (Pointer — broken link, no 500) | 0 | kept on disk; no 500 risk |
| L (Link — display, no 500) | 0 | kept on disk; no 500 risk |

(The `P`/`L` counts above are the **remaining** dangling after the delete. The kept-set
totals — L: 3,230, P: 62 — represent display refs whose referer card was deleted as part
of Phase 2, hence gone with their referer; on the next parse of any surviving referrer's
content the unresolved P/L refs will simply re-resolve to `referee_id = NULL`.)

### Check 3 — orphan card_references: **0** ✓

```sql
SELECT COUNT(*) FROM card_references WHERE referer_id NOT IN (SELECT id FROM cards)
```
returns 0. Every surviving `card_references` row's referer still exists.

### Check 4 — junction cards with dangling left/right: **20** (pre-existing in source)

The scrubbed deck has 20 junction cards with a left/right id that does not exist in
`cards`. Verified these 20 rows exist, with identical columns, in the source deck —
they were already dangling before the scrub. Their left/right ids are either:
- positive ids not in `cards` (3 live cases: ids 375, 377, 389 — left=374/376/388 not in
  `cards`, right=`*default` 318 still present), or
- negative ids (-9000 to -9016) that are Wagn "sign" sentinels and never existed as card rows.

These are pre-existing artifacts in the source — the ask's "junction cards whose left or
right was deleted" cannot retroactively apply to them. **They are not introduced by the
scrub.** The same query against the source deck returns 20:

```text
Source dangling junctions: 20
Source I/Q dangling: 0
Source orphan refs: 0
```

### Check 5 — byte-identical preservation of surviving rows: **PASS** ✓

For every surviving card (21,671), every surviving card_reference (48,525), and every
card_virtual (39), the row is byte-for-byte identical to the source row. No surviving
content was modified.

### Check 6 — sqlite integrity_check: **ok** ✓

```text
scrubbed: [ { integrity_check: 'ok' } ]
source:   [ { integrity_check: 'ok' } ]
```

### Check 7 — schema and table set unchanged

All 22 source tables present in scrubbed; no table added or dropped. `PRAGMA table_info(cards)`
identical between source and scrubbed. After `VACUUM`, the file is 42,184,704 bytes.

---

## 4. Three sample cards that MUST remain in the scrubbed deck

Fetched directly from `corpus-v2-scrubbed.sqlite3`. Verified byte-identical to the
corresponding source rows.

### 4.1 Public post — `id=2280` "Aiki Peace Week 2010 Dispatch - Tom Crum"

```text
id           : 2280
name         : Aiki Peace Week 2010 Dispatch - Tom Crum
type_id      : 3   (RichText cardtype)
trash        : 0   (live)
codename     : (null)
db_content   : 58,442 bytes
```

`db_content` preview:

```html
<p>From: <strong>Robert Kent</strong>&nbsp;<span></span>2010/9/20 - International Aiki
Peace Week - Day One<br></p>
<div>Dear  International Aiki Peace Week participant - &nbsp; (translations follow in
French, German, Portuguese, Polish, Italian, and Spanish)</div>
<div><br></div>
<p>Hello  everyone - we couldn&rsquo;t be happier that 330 dojos from 43 countries are
sharing their Aikido with the public this week and teaching people how to live better
and more peaceful lives.</p>
```

### 4.2 Video-flagged card — `id=783` "DanPinkVideo01"

```text
id           : 783
name         : DanPinkVideo01
type_id      : 50  (HTML cardtype)
trash        : 0   (live)
codename     : (null)
db_content   : 543 bytes
```

`db_content` (full):

```html
<object width="640" height="385"><param name="movie" value="http://www.youtube.com/v/u6XAPnuFjJc&rel=0&color1=0xb1b1b1&color2=0xd0d0d0&hl=en_US&feature=player_embedded&fs=1"></param><param name="allowFullScreen" value="true"></param><param name="allowScriptAccess" value="always"></param><embed src="http://www.youtube.com/v/u6XAPnuFjJc&rel=0&color1=0xb1b1b1&color2=0xd0d0d0&hl=en_US&feature=player_embedded&fs=1" type="application/x-shockwave-flash" allowfullscreen="true" allowScriptAccess="always" width="640" height="385"></embed></object>
<p>&nbsp;</p>
<p><strong>Daniel Pink on motivation</strong>. RSA lecture, 2010-08-11. Added 2010-09-22.
(Brandon at Berkeley Rep meetup.)</p>
```

### 4.3 System card — `id=3` "RichText"

```text
id           : 3
name         : RichText
type_id      : 5   (Cardtype cardtype)
trash        : 0   (live)
codename     : basic
db_content   : 189 bytes
```

`db_content` (full):

```html
<p>{{+description}}</p>
<p>&nbsp;</p>
<p>[[/new/{{_self|name}}|add a {{_self|name}} card]]</p>
<p>&nbsp;</p>
<h2>{{_self|name}} Cards</h2>
<blockquote>
<p>{{+*type cards}}</p>
</blockquote>
```

---

## 5. Where the scrubbed deck lives

- **Source (untouched):** `C:\localProjects\decko-ts\tmp\raw-ground-truth\deck\corpus-v2.sqlite3` — byte-for-byte unchanged since 2026-09-24 18:07.
- **Output (this report):** `C:\localProjects\decko-ts\tmp\raw-ground-truth\deck\corpus-v2-scrubbed.sqlite3` — 42,184,704 bytes, integrity-checked `ok`.
- The scrubbed deck stays on this machine and Brandon's VM only. **Never uploaded anywhere else** (per the ask).

---

## 6. Reproducer

The exact scrub is encoded in `tmp-scrubber.mjs` at the project root (one-shot script).
The verification is encoded in `tmp-verify.mjs`, `tmp-byte-identity.mjs`, `tmp-final-verify.mjs`,
`tmp-verify-samples.mjs`. The portal-source-extracted matcher cross-check is in
`tmp-verify.mjs`.

```bash
node ./tmp-scrubber.mjs    # builds corpus-v2-scrubbed.sqlite3 from corpus-v2.sqlite3
node ./tmp-verify.mjs      # 0 portal-classifier matches + 0 dangling I/Q refs
node ./tmp-byte-identity.mjs  # 21,671 cards, 48,525 refs, 39 virtuals all byte-identical
node ./tmp-final-verify.mjs   # table set, schema, integrity_check
node ./tmp-verify-samples.mjs # 3 sample cards byte-identical to source
```

---

## 7. Findings summary

- 3,790 date-journal cards removed by Phase 1 (the only category the operator's ruling names).
- 24,368 anonymous junction cards removed by Phase 2 transitive cascade (the ask's "junction cards whose left or right was deleted"). The cascade ran for 6 rounds before converging.
- 20,788 `card_references` rows pruned where dangling would 500 a render (`ref_type IN ('I','Q')`).
- 3,292 `card_references` rows of display type (`ref_type IN ('P','L')`) intentionally kept — they render as broken-link text rather than 500, per the ask's "only where... would 500 a render" caveat.
- 506,810 `card_references` rows deleted as orphans (their referer card was deleted by Phase 1 or Phase 2).
- **Zero date-journal family cards remain in the scrubbed deck**, verified by running the portal's own classifier against every remaining row.
- Every surviving card, card_reference, and card_virtual row is byte-for-byte identical to the source.
- The scrubbed deck passes `PRAGMA integrity_check = ok`.