# pd-15: the cardtype validators of the unported-systems sweep, and what is left of it

- The row's own label: "the seven faked systems + format-dispatch repairs
  landed (register update was purely additive, +697 lines, 0 repairs)"
- The named source: `docs/reports/unported-systems-sweep-2026-10-18.md`,
  item 2 (the cardtype validators) and item 3 (the format ROUTE dispatch)
- The instrument: `tests/card/mod-loader/core-mod-cardtype-events.test.ts`,
  which runs the three cardtype events through the mod event seam
- Commands:
  - `npx vitest run tests/card/mod-loader/core-mod-cardtype-events.test.ts`
    (1 file, 11 tests, 11 passed, after this change)
  - the same command with the `was_cardtype?` predicate put back to its
    seed-id form: **1 failed | 10 passed**, the failure being the new test
    below, which is the red-before measurement
  - `npx tsc --noEmit` (no errors)
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip
  of `deploy/full-candidate-20261101`, which is the tip this branch starts
  from.

## Verdict: the cardtype half of the named repair is landed; the format-dispatch half is named

## What the sweep named, and what the tree already carried

The sweep's item 2 asked for three cardtype validators on the write path, and
for the Cardtype id to be resolved through the codename registry instead of
the literal `3`.

| what the repair named | the tree at this tip |
|---|---|
| `cards_of_type_exist?` as a `trash=false, type_id=?` existence query | landed: `src/card/mod-loader/mods/core-mod.ts:1993-2013` (`cardsOfTypeExist`) |
| the delete guard (`check_for_cards_of_type`) | landed: `core-mod.ts:2015-2032` (`checkForCardsOfTypeEvent`), message from `en.yml:4` |
| the type-change guard (`check_for_cards_of_type_when_type_changed`) | landed: `core-mod.ts:2034-2054` (`checkForCardsOfTypeWhenTypeChangedEvent`), message from `en.yml:8` |
| the `<>/` name check (`validate_cardtype_name`) | landed: `core-mod.ts:2056-2072` (`validateCardtypeNameEvent`), message from `en.yml:14` |
| the Cardtype id resolved through the codename registry | **not** landed: `was_cardtype?` compared `card.typeIdBeforeAct === 3` |

The Ruby truth is in the pinned gem tree:
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-1.110.0/mod/core/set/type/cardtype.rb`,
where `was_cardtype?` is `type_id_before_act == Card::CardtypeID`, the boot's
constant for the cardtype card's id, and the seed row that carries it in this
port is `{ id: 3, name: "Cardtype", key: "cardtype", codename: "cardtype" }`
(`src/card/auth/boot-seed.ts`).

## What this commit changes

`was_cardtype?` now resolves the Cardtype id through the codename registry
(`ctx.fetch.codenames.id("cardtype")`), with the seed id as the fallback for a
dispatch with no read engine. The predicate contract already allows an async
predicate with the stage context (`ModEventPredicateTable`,
`src/card/mod-loader/mod-event-dispatch.ts:497-500`), and the dispatcher
awaits it (`mod-event-dispatch.ts:654`).

Why it matters, in one sentence: on a deck whose cardtype card is not the
seeded one, the type-change guard did not fire, so the port allowed a retype
that Ruby refuses, which lets a deck pull a cardtype out from under the cards
that depend on it.

## The test, red before and green after

`tests/card/mod-loader/core-mod-cardtype-events.test.ts` gains two cases in a
new describe block:

- "a Cardtype card whose id is not the seed id gates the type-change guard
  too": the deck's cardtype card moves off the seed id (the seeded card loses
  the `cardtype` codename, a runtime cardtype at id 900 carries it), a card of
  that cardtype is created, and the cardtype's own retype must be refused
  with the `en.yml:8` wording. **This case fails with the seed-id predicate
  and passes with the registry lookup** (measured both ways, above).
- "a card whose type was NOT a Cardtype is not gated by the runtime cardtype's
  id": the guard does not reach a card of the widget type, so the fix does not
  over-fire.

## What stays open, and why

The sweep's item 3, the format ROUTE dispatch, is not landed. The port still
dispatches formats by a per-path suffix list instead of by the registered
format classes, and the list is not the same on every boot path:

| boot path | the per-path suffix tests |
|---|---|
| Cloudflare worker | `deploy/worker.ts:897` (`.json`), `deploy/worker.ts:952-953` (`.csv`, `.rss`) |
| Bunny edge surface | `deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts:65-66`, `:76` |
| Bunny edge handler | `deploy/bunny-worker-src/bunny-edge-engine-handler.ts:517`, `:625` |
| Bunny worker | `deploy/bunny-worker-src/bunny-worker.ts:283`, `:289` |
| Bunny origin server | `deploy/bunny-origin/bunny-origin-server.mjs:335` |
| local boot path | `vm-staging-server.mjs:3138`, `:3173`, `:4908`, `:4914-4915` |

Ruby's mechanism is one lookup: `params[:format]` resolved against
`Card::Format.registered` (`card/lib/card/format/registration.rb:20-31`), so
any registered format dispatches. The sweep's repair asks for one shared
`parseFormatSuffix(pathname, searchParams)` helper and a `Map<format,
FormatShow>` registry that all three boot paths call, so a format dispatches
because it is registered rather than because a route remembered its suffix.

That repair is a change to the request grammar on every boot path, and its
parity is pinned by suites that run in the correctness gate, so it is a
change with its own battery rather than a line to land inside this row's
commit. It is named here with the exact call sites, and it is not closed.

The row's third half, "re-run the sweep on the release line", is an audit
activity, not a script: the sweep of 2026-10-18 was a one-pass audit with
live probes (`docs/reports/unported-systems-sweep-2026-10-18.md`), and no
instrument for it is committed in either tree. This lane re-measured the two
items the row names by reading the tree and by running the cardtype suite,
which is what this receipt records.

## What this lane did not do

It did not touch the format dispatch, did not change the engine's behaviour
outside the `was_cardtype?` predicate, did not re-record an oracle capture,
and did not contact a hosted edge.
