# The followers LIST address, settled against a live Ruby oracle

Lane: `port/oracle-followers-address-settle-20261022`
Base: `9ef568c9` (the full candidate v10 roll tip)
Date: 2026-10-22

## Verdict

**The un-asterisked `<card>+followers` is NOT a followers list on Ruby.** It is
a different card that does not exist, so Ruby renders its not-found surface for
an anonymous reader and the plain create form for a reader with create rights.
The followers LIST lives at the asterisked `<card>+*followers`, and only there.

The candidate lane's reading was correct. Matrix tranche-6's reading was not,
and its instrument, not its engine, is why.

## The measurement

Real HTTP GETs through the full Rack stack and the real Decko router
(`ActionDispatch::Integration::Session`), on one seeded card
`Oracle Followers Address Probe` (RichText):

| Address | Status | What came back |
| --- | --- | --- |
| `/Oracle_Followers_Address_Probe+followers` | **404** | `Not Found / Could not find Oracle Followers Address Probe+followers / Please sign in or sign up to create it.` |
| `/Oracle_Followers_Address_Probe+*followers` | **200** | the followers LIST surface |
| `/Oracle_Followers_Address_Probe` | **200** | the card |

Body text of the un-asterisked read, verbatim from the capture:

```
Oracle Followers Address Probe+followers - My Deck ... Not Found Could not find
Oracle Followers Address Probe+followers Please sign in or sign up to create it.
```

Body text of the asterisked read, same run:

```
Oracle Followers Address Probe+*followers - My Deck ... Oracle Followers Address
Probe + *followers help edit space_dashboard
```

The object-level fact behind those two answers, same boot:

```
Card.new(name: "<card>+followers").virtual?  == false    (no set module matched)
Card.new(name: "<card>+*followers").virtual? == true     (Followers matched)
```

`virtual?` is exactly the set-module matcher: `card-mod-follow-0.20.0/set/right/followers.rb:20-22`
defines `def virtual?; new?; end` for the Followers set. The mod's own first
line names its address, and the capture carries that line:

```
set/right/followers.rb:1  # X+*followers provides a list of all users following X.
```

The capture's set inventory for the follow family is `set/right/follow.rb`,
`set/right/follow_fields.rb`, `set/right/followers.rb`,
`set/right/following.rb`. There is no `set/left/followers.rb`, so nothing in the
mod resolves the un-asterisked spelling. That is the whole difference.

The port already agreed, and said so before this lane ran:
`tests/card/set-modules/virtual-set-modules.test.ts:7-15` pins the oracle answer
`/Ada_Admin+followers 200 firstView=new (the CREATE FORM)` against
`/Ada_Admin+*followers 200 firstView=titled "Ada_Admin+*followers Mira Member"`,
and `src/card/mod-loader/mods/card-mod-follow.ts:280-284` records the same in
the port's own source comment.

## Which instrument was wrong, and why

**Tranche-6's grade predicate was wrong, not its engine.** It graded the
followers read with `status === 200 && /Mira/i.test(#main innerText)`, and its
own recorded `followersText` is a single line naming the UN-asterisked
junction's heading:

```
"followersText": "HarnessW4MemberFollows mvin9svw6s1+followers Mira Member"
"followersRead": { "status": 200, "url": ".../HarnessW4MemberFollows_mvin9svw6s1+followers" }
```

(from `docs/reports/receipts/row-mx-155-act155-probe-leg-2026-10-21-tranche6.json`)

Mechanism, in one sentence: the predicate asked only "is this page a 200 that
mentions Mira", and the create form at the un-asterisked address is exactly
that, so the leg graded a create form as a followers list and the disagreement
was an artefact of the predicate rather than of either engine.

The candidate lane's reading needed no correction. One refinement is recorded
rather than asserted away: it recorded "the plain create form", and an
ANONYMOUS reader gets 404 with "Please sign in or sign up to create it" at that
address. Both are the same structural fact (no set module is matched there, so
there is no list to render); they differ by the reader's permissions.

## The oracle boot this lane ran

Per the documented flow: `decko new`, the two Gemfile additions
(`docs/parity-method.md`), `decko setup`, then `bundle exec decko runner`.

Booted and measured on:

| | |
| --- | --- |
| Ruby | 3.3.12 x64-mingw-ucrt (the version `docs/parity-method.md` pins) |
| card | 1.110.0 |
| card-mod-follow | 0.20.0 |
| Rails | 7.2.4 |
| Rung | SQLite, the rung `docs/parity-method.md:205` names |

Boot probe, run before any measurement:

```
RAILS_ENV=development bundle exec decko runner tools/oracle/boot_probe.rb
BOOTED
cards: 604
*all -> id=7 type_code=set
```

Two deviations from the paths the task named, each with its mechanism:

1. **Gemset.** The task named `C:/localProjects/decko-ruby-oracle-gems`. That
   tree cannot boot: its 38 card/decko gems carry no RubyGems activation stub,
   and their gemspecs cannot even be read, because `card.gemspec:3` does
   `require "../decko_gem"`, a build helper from the decko monorepo that is not
   present once the monorepo is flattened into a gem home (only
   `gems/decko-0.20.0` and the `card-mod-*` directories are there; no
   `decko_gem.rb`). Its 30 Rails-level stubs are present, which is why it reads
   as a usable gem home until something asks for `decko`. This lane booted on
   `C:/Ruby33-x64/lib/ruby/gems/3.3.0`, which carries the same pinned versions
   with 277 working stubs and is the version `docs/parity-method.md` names.

2. **Rung.** The MySQL rung needs the untracked machine assets
   `tools/oracle/boot-mysql-server.sh` checks for
   (`portable-mariadb`, `mysql-server/my.ini`, `mysql-client-scratch`). All
   three are absent from every checkout on this machine as of 2026-10-22, so the
   capture rigs' `RUBY_DLL_PATH` line has nothing to point at, and requiring
   `mysql2` without it aborts the boot (`LoadError 126` on `mysql2.so`). The
   SQLite rung is the documented alternative and is what this capture ran on.

One more environment note, since it changes how the commands must be typed: the
`bundle` that comes first on PATH is Ruby 3.4's, and running it against the Ruby
3.3 gem home reports every native extension as unbuilt
(`Source locally installed gems is ignoring ... because it is missing
extensions`). Every command below names Ruby 3.3 explicitly.

## What landed

- `tests/card/mod-loader/oracle-capture-followers-address-junction.rb`, the
  capture rig, re-runnable with the command above. (The task named
  `tests/server/oracle-capture-*.rb` for the boot pattern; the rig family
  actually lives in `tests/card/mod-loader/`.)
- `fixtures/captured/followers-address-junction.json`, its captured rows.
- `reference-harness/browser/lib/follow-dashboard-expectations.mjs`, the
  expectation module, now carrying the followers-address expectations with
  their citations: `FOLLOWERS_JUNCTION_TAG`, `UNASTERISKED_FOLLOWERS_TAG`,
  `followersJunctionPath`, `isFollowersListAddress`, `namesFollowersList`,
  `namesUnknownJunctionCreateForm`.
- `reference-harness/browser/test/follow-dashboard-expectations.test.mjs`, its
  test, extended from 10 to 20 cases. The cases that matter are the ones
  carrying tranche-6's recorded text verbatim and asserting it is NOT a list.
- `reference-harness/browser/probe-never-measured-batch1.mjs`, the ACT-155 leg:
  the `/Mira/i` clause is replaced by `isFollowersListAddress(followersRead.url)`
  and `namesFollowersList(memberScratch, followersText)`, and the block comment
  now carries the settled finding instead of two unresolved readings.

## Commands run for this receipt

Battery over the areas this change touches. The scope is the areas, not the
whole net, and the vitest scope is the three suites that cover the followers
address and the follow mod.

```
npx vitest run tests/card/mod-loader/ tests/card/follow/ tests/card/set-modules/
  -> Test Files 173 passed (173)
     Tests      2266 passed | 14 skipped (2280)
     exit 0
     1 suite not run: parityfix-row7-mod-edit-gemspec-summary.test.ts is
     corpus-gated and reports NOT RUN on a checkout without the corpus
     (docs/TESTING.md), the same as the prior tranche's battery

npx tsc --noEmit -p tsconfig.json
  -> exit 0, zero diagnostics

node --test reference-harness/browser/test/follow-dashboard-expectations.test.mjs
  -> tests 20, pass 20, fail 0

node --check reference-harness/browser/probe-never-measured-batch1.mjs
node --check reference-harness/browser/lib/follow-dashboard-expectations.mjs
node --check reference-harness/browser/test/follow-dashboard-expectations.test.mjs
  -> all three parse clean
```

The capture, and its determinism contract (two consecutive captures produce
byte-identical fixtures, the contract every rig in this family states):

```
RAILS_ENV=development bundle exec decko runner \
  tests/card/mod-loader/oracle-capture-followers-address-junction.rb
  -> exit 0; WROTE fixtures/captured/followers-address-junction.json
  -> sha256 6ac4b7920bc5d5179d67cc09a2f4783e402539bc4df2fbd9c3672ee84bdbc39c
     on two consecutive runs: IDENTICAL
```

One run-shape note for whoever runs this battery next: that vitest invocation
took 271 s because it spawned one worker per file (173 workers, ~854 ms startup
each). Vitest's own output names the fix, `isolate: false`, worth about 73 s on
this scope.

## Limitations

- The capture's HTTP GET is anonymous by construction (an
  `ActionDispatch::Integration::Session` starts with no cookies), so the
  un-asterisked address is recorded as 404. The create-form variant, which a
  reader with create rights sees at the same address, is NOT re-measured here;
  it is cited from the port's committed oracle fixtures
  (`tests/card/set-modules/virtual-set-modules.test.ts:7-15`). The settlement
  turns on "not a followers list", which holds under both.
- No signed-in Ruby read was taken. Creating a user card failed on this boot
  (`unknown attribute 'email' for Card`), because the deck's `Card::User`
  constant is not materialized in a runner context, and no sign-in path was
  available without it.
- The SQLite rung, not the MySQL rung. CQL `match` cannot execute on SQLite at
  all; this capture runs no CQL, so the rung does not bear on the answer.
- The capture rig writes a fixture whose `textDigest` includes the deck's own
  chrome, so the digest is deck-specific. The parity target is the status and
  the junction the page names, both of which are stable.