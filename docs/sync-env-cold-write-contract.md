# Contract: cold-engine junction-side type resolution (the sync name environment)

Recorded 2026-10-01. Evidence: `tests/card/actions/syncenv-cold-fidelity-probes.test.ts`
(6/6 probes green).

## 1. The contract statement

`resolveTypeId` (`src/card/actions/type-resolution.ts:52-93`) is the SINGLE type
authority for the action layer: the permission gate's virtual side parts call it
(`src/card/permissions/view-task-rules.ts:361-384 virtualSidePart`), and so does
the write path's side creation (`src/card/actions/card-action-engine.ts:610,666,992,1179`).
Whatever type a side resolves in a given engine state, the gate and the write
resolve the SAME type — the port can never gate-allow a type the write would not
apply. **There is no engine-internal bypass at any warmth.** This contract covers
the remaining axis: fidelity to Ruby when the engine is COLD.

## 2. The cold mechanism (what dies, what doesn't)

The type-assignment walk (`type_id_from_code` port,
`src/card/set-patterns/set-type-assignment.ts:126-178`) enumerates the card's
`assigns_type` patterns — `*right` and `*type plus right`, the only two
(`card-1.110.0 mod/core/set_pattern/07_right.rb:3, 08_type_plus_right.rb:5`) —
and builds each pattern's module key from the ANCHOR's codenames
(`src/card/set-patterns/instance.ts:158-176 anchorCodenames` → `moduleKey`
:178-186). Anchor codenames resolve through `DeckoName#cardId` → `DeckoName#codename`
(`src/card/name.ts:802-803, 817-820`), which read ONLY the sync name environment's
warm-cache peeks (`src/card/fetch.ts:661-664` adapters; `installNameEnvironment`
at :666 is opt-in with no caller in `src/`). **Cold (environment absent or
unwarmed): every anchored module key is null, the walk finds nothing, and
`resolveTypeId` falls through to `defaultTypeId`** (type-resolution.ts:101-112)
— the GLOBAL `*all+*default` rule card's type, resolved through the ASYNC
driver-backed registries (`normalizeMark` codename path,
`src/card/fetch/retrieve.ts:142-149`; multi-part compose via `nameFromMarkParts`),
which need no environment. A plain-named side therefore never throws cold; it
resolves to the global default type and its verdict flows through `*all`-level
rules whenever the default type has no type-scoped create rule.

Ruby has no cold state on this axis: `Card.new` runs `ensure_type_id`
(`mod/core/set/all/initialize.rb:54`) → `type_id_from_code || type_id_from_template`
(`mod/core/set/all/type.rb:58-66`) for EVERY new card, and the assignment walk's
anchor codenames resolve through the db-backed lexicon/codename cards
(`lib/card/set/pattern/base.rb:17-19 find_anchor_id, :40-44 anchor_codenames`).

## 3. Measured divergences (cold engine, entry-scoped probes)

| Arm | Deck | COLD port behavior (pre-fix, measured) | Ruby | Verdict |
|---|---|---|---|---|
| T1 | global `*all+*default` type 90, Editor-locked | **permission-denied** — `defaultTypeId` resolves cold | same deny | NO divergence |
| T2 | same, Anyone-open | side WRITTEN type 90 | same bytes | NO divergence |
| M | registration `Right::All`→`phrase` | sync `findAssignedTypeName` = `undefined` cold / `"phrase"` warm (still true for the render-side helper; the write path no longer rides it) | always resolves | mechanism pinned |
| P1 | assignment deck, Editor-locked Phrase (91) | create **ALLOWED**; compound side "Hatch+*all" **written type 42** (global default) | **DENIED**; side would be type 91 | **WAS DIVERGENT: verdict + bytes — CLOSED** (cold deny + no rows, both states) |
| P2 | same as P1, warm | **permission-denied** (nothing written) | same | warm parity restored |
| N1 | `*all+*right+*default` (type 90 Editor-locked), global default 42 | create **ALLOWED**, side **written type 42** — in EVERY state | **DENIED**; side type 90 via the name-scoped template | **WAS DIVERGENT: warm-or-cold — CLOSED** (deny + no rows, both states) |

The pre-fix cold behavior in the COLD port column was measured by those
probes (6/6 green pinning it). A follow-up fix closed P1/N1: the write
path's assignment walk is
now driver-backed (set-type-assignment.ts `findAssignedTypeNameDriverBacked`
— anchor codenames resolve through the async Lexicon + codehash
registries, the db-backed data Ruby answers at `Card.new`,
pattern/base.rb:17-19 + :40-44), and `resolveTypeId`'s fallback walks the
full `rule_card(:default)` set-candidate chain (type-resolution.ts
`templateTypeId`; templating.rb:52-53 → rule/all.rb:13-15 → :66-73) with
`defaultTypeId` kept as the walk's natural `*all` tail (type.rb:3-5).

P1/P2 are the primary create-path observation, measured. N1 is the
adjacent template-chain gap, discovered during grounding:
`resolveTypeId`'s fallback hard-coded `[{codename:"all"},{codename:"default"}]`
(type-resolution.ts:102-105 pre-fix), while Ruby's new-card template is
`rule_card(:default)` (`card-mod-content-0.20.0 set/all/templating.rb:52-53`)
whose `rule_card_id` walks ALL set candidates in precedence order
(`lib/card/rule/all.rb:9-14 → rule_id_lookup`) — a name-scoped `*default` rule
(`*all+*right+*default`, `Type+*default` on a live card's set, the `*structure`
branch of `new_card_template`, templating.rb:54-58) never reached the port's
side resolution. (Structure-branch closure: `templateTypeId` now ports the full
`new_card_template` including `dup_structure`'s default-typed dup walk —
`src/card/actions/type-resolution.ts`; corpus census:
`tests/card/rules/structure-governance-census-probe.test.ts`, 139 live
`*structure` rule rows, 8,780 governed new-card names, 2,164 with a
structure type different from the default-leg answer.*)

## 4. Why this is latent (no captured byte)

No captured page and no serving request can carry the cold behavior:

- **Boot ownership (exhaustive for serving):** the deployed worker installs the
  environment and pours the FULL lexicon before the first request
  (`deploy/worker.ts:224-250`, comment: "the worker boot has to install the
  adapters and warm the caches BEFORE the first request"); the staging seat does
  the same (`vm-staging-server.mjs:1180-1195`). The write route dispatches on
  that SAME warmed fetcher (`vm-staging-server.mjs:2946` — `ctx.fetcher` is the
  boot `fetcher`), so route writes are never cold. The only cold `FetchEngine`
  in the tree is the auth-flows fetcher (`vm-staging-server.mjs:510
  flowsFetcher`), whose writes are activation (`+*status`) and password
  (`+*password`) updates on EXISTING account cards — no junction creation, so
  the virtual-side walk never fires there.
- **Corpus sweep:** all 6,613 capture records (48 recapture shards): 5,061
  junction-named pages, ZERO render a create-permission denial; the 678
  form-bearing junction pages are edit forms on EXISTING cards (the update path
  has no side walk — `view-task-rules.ts:264-279`); the single new-form
  heuristic hit (`ihjvsxj+*type+*autoname`, shard 17) is the open view of an
  existing rule card (data-card-id 22021). Ruby captures are Ruby-rendered
  (db-backed, no cold state); TS re-renders run through the warmed boot.

## 5. Ownership

1. **Serving boots own warming** — already discharged: worker + staging install
   and fully warm pre-request (paths above). Any NEW serving boot must do the
   same before accepting requests; the mark-URL failure mode that shaped this
   is documented at `deploy/worker.ts:224-235`.
2. **Engine-only write embeddings own their warmth**: any embedding that boots
   `FetchEngine` + `CardActionEngine` directly (test harnesses today; future
   engine-only write paths) MUST run the boot composition —
   `await engine.codenames.ensureLoaded()`, warm the lexicon ids its anchors
   need (or `warmLexicon` over the deck), then `installNameEnvironment()` —
   BEFORE the first write that can create a junction with missing sides.
   The per-render backstop (`ensureCodenameMarksResolvable`,
   `src/card/render/page.ts:486-499`) covers page renders only.
3. **A fix that closes P1/N1 owns its pins**: warm the name environment in the
   write path's prepare (the same prepare that already runs verdict walks), or
   widen `defaultTypeId` to the `rule_card(:default)` candidate walk —
   Ruby-cited above — and flip P1/N1 to the Ruby verdict in the SAME commit,
   updating section 3's table here.
   **CLOSED**: the second form — the walk went driver-backed (cold-safe) AND
   the fallback widened to the candidate walk; P1/N1 flipped in the same
   commit. Ownership item 2 stays binding for engine-only write embeddings
   (the RENDER-side sync helper still reads the warm peeks;
   `ensureCodenameMarksResolvable` remains the render backstop).

## 6. Scope and stability

This contract changes NO engine code: the contract and its evidence probes are
additive (one test file, one doc). The probe file is scratch evidence, not a
standing pin suite; P1/N1 intentionally pin the
CONTRACT'S divergence side so a fix's flip is a visible, single-commit
event.
