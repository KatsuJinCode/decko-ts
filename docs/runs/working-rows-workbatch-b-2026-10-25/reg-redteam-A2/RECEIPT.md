# reg-redteam-A2

- Family: register-redteam.
- Row: "A-R2 Cardio application layer: migrations, seeds, CLI, generators, rake tasks".
- Verdict at the time of this lane: UNPORTED, bucket WORKING ON IT. The blocker's fix
  instruction offers two arms: "port the migration/seed/CLI surface or rule it out of the
  parity surface."

## Verdict: DONE - closed on the row's own second arm, the per-surface disposition

The disposition audit exists in the tree this receipt was measured on
(`deploy/full-candidate-20261101` tip `c17906db`):
`docs/reports/reg-redteam-a2-cardio-application-layer-disposition-2026-10-20.md`. It rules on
each of the six sub-surfaces the row names, with the mechanism: schema migrations out of
scope by mechanism (the port ships the schema as SQL and applies host migrations from
`db/migrations/*.sql`; the Rails migration CLASS hierarchy has no counterpart and produces
artifacts the port carries in its own form), transform migrations a named divergence whose
only reachable decks are legacy decks this engine never creates (22 dated scripts that can
only rewrite rows a fresh-seeded deck never has), seeding ported in behavior (boot-seed, the
SQL seed) with the seed-cache file CLI plumbing dispositioned separately
(`reg-redteam-cfg-railtie-keys-disposition-2026-10-20.md`), the CLI ported for the
engine-facing pod verbs (`src/card/pods/`), generators and rake tasks inert for the parity
surface (Rails app scaffolding; `decko-0.20.0/lib/decko/rake_tasks/` is empty in this pin).

Every load-bearing claim in that report re-verified at this base, this lane, this tree:

- `ls card-mod-*/data/transform/*.rb` over the pinned gems
  (`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`) - 22 files, matching the
  report's census.
- `src/server/schema.ts:300` declares `transform_migrations` (the report's port-side
  bookkeeping claim).
- `ls db/migrations/` - `001-auth-sessions.sql`; `ls db/*.sql` -
  `db/schema.sqlite.sql`, `db/schema.mysql-port.sql` (plus the reference and card-gem
  schemas), the port-side schema artifacts the report names.
- `src/card/one-trip/one-trip-fetch.ts:257,298-300` - `deck_data_version` is the
  committed-write freshness stamp, the disambiguation the report's section 1 records.
- `cat card-1.110.0/db/version.txt` - `20221031182227`; `card-1.110.0/lib/cardio/migration.rb`
  - `class Migration < ActiveRecord::Migration[6.1]`, `include Assumption`, `include Stamp`.

The row's fix instruction is satisfied on the arm it offers: the surface is ruled out of the
parity surface piece by piece, each ruling named with its mechanism, and porting the rest
would add Ruby-shaped tooling that changes no card byte (the report's bottom line). No
production code changed; no new pin is owed because the row's product is the disposition
record, which this receipt re-measures at the current base.
