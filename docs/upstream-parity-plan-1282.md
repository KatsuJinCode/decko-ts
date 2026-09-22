# Upstream parity plan — decko-commons#1282 + Astra's four parities

> Coordination update, 2026-09-21: [Decko Core](core/README.md) is the
> governing project contract. The [private work board](core/work-board.md)
> maps these streams to acceptance issues without changing active ownership.
> [Publication gates](core/governance.md) apply to all delivery work below.
> Public placement and deployments require Julian's exact-package approval.
> PostgreSQL and shared Ruby/TS optimization are parallel work on that board.

Work items for the fleet executing the full migration plan. Spec sources:
decko-commons/decko issue 1282 (byte-parity acceptance, constant-queries
promise, one-click deploy, seamless migration, provider adapters) and the
Astra framework adopted in the #1282 thread: TypeScript and Ruby are two
implementations of one abstracted system, verified across FOUR kinds of
parity — **persistence, semantics, rendering, side effects**.

Status legend: `[x]` landed, `[~]` in flight (owner), `[ ]` queued.
Pool: REG = regular-model background agent, MM = MiniMax-M3 agent.

## Rendering parity

- `[~]` R1 help-popover menu content — ~200 shard-0 realFails; menuView
  hardcodes `data-bs-content="&amp;nbsp;"` where Ruby renders the `*help`
  rule content. Owner: REG pool. Owns `views.ts` + `format.ts` +
  new helper under `src/card/render/`. (docs/set-keys-parity-notes.md
  first sampled it.)
- `[~]` R2 `*structure` rule templates — 106 structurePending entries on
  shard 0: cards with no db_content render their set's `*structure` rule
  template content in Ruby. Owner: REG pool. Owns `src/card/rules/**`
  extensions + `render.ts` prepare-phase hook.
- `[ ]` R3 search-core views — card_list / search nested views in the
  captured corpus (fail class "search cores"). Blocked on R1 (shares
  `views.ts`).
- `[ ]` R4 HAML/ERB-encoded rule content — rule stream deferred the
  HAML/Ruby round-trip to a v2 stream (docs/rules-port-notes.md).
- `[ ]` R5 unknown-page remainders — mini_bar-on-unknown oracle-unverified;
  loud/focal denial (page layer); main+root unknown branch (docs/
  unknown-nest-notes.md honest remainder).

## Semantics parity

- `[~]` S2 non-anonymous permission actors — Anonymous is the only wired
  viewer; Ruby parties come from account member cards / roles
  (card-mod-account set/abstract/account_holder.rb:27-53,115-123). The
  seam is `readPermissionStateFromResults(actorId, signedIn)`. Owner:
  REG pool. Owns `src/card/permissions/**` + session glue.
- `[ ]` S1 CQL `match` — needs a MySQL oracle rung (impossible on SQLite;
  docs/oracle-harness.md), then driver UDF/FTS5 decision.
- `[~]` S3 mod loader + 33 card-mods — mechanism LANDED 2026-09-21
  (REG): load order (Bundler closure), SetPattern front-insert, view
  override/config semantics; card-mod-help proven end-to-end vs a live
  sha-stable Ruby capture (28 tests; docs/mod-loader-port-notes.md).
  Remaining: per-mod ports, sequenced by the T6 report (1 ported /
  30 partial / 2 ignored); unknown-card mod-view hook is a documented
  3-line coordinator patch.
- `[ ]` S5 non-read view perms (`perms: :update`, skip_perms) — IN FLIGHT
  (REG pool, launched 2026-09-21).
- `[~]` S6 Gherkin features port — first slice LANDED 2026-09-21 (MM
  wave A): 13 upstream features inventoried, CRUD/names/views ported
  (31 tests green), per-feature blockers documented
  (docs/gherkin-port-notes.md). Remaining 10 features queued behind
  email/follow/CQL/history modules.

## Persistence parity

- `[~]` P1 write-path conformance — LANDED 2026-09-21 (MM wave A): 8
  Ruby scenarios captured (`fixtures/write-conformance/`), TS replay
  10/10 structural byte-parity on scenarios 01–06; two real defects
  found and routed below. Owns `benchmarks/capture-write-conformance.rb`
  + `tests/card/conformance/`.
- `[ ]` P2 history edges: drafts surface, nested supercard action trees.
- `[ ]` P3 `set_read_rule` on save — TS write path never derives
  read_rule_id/read_rule_class (Ruby: card-mod-permissions
  set/all/permissions.rb:1-5); found by P1 scenario 07 (7 change rows
  vs Ruby's 9). Owner: permissions window (after S5).
- `[ ]` P4 `card_references` write population — schema exists, no write
  path populates it (Ruby writes 'I'/'P' rows on name touches; found by
  P1 scenario 08). New stream.

## Side-effect parity

- `[ ]` E1 mailers/notifications (Ruby email machinery) — nothing built.
- `[ ]` E2 mod save-hooks / observer surface (rides S3).

## Runtime abstraction + delivery (#1282 product surface)

- `[x]` T6 mod compatibility report generator — LANDED 2026-09-21 (MM
  wave A): 33 mods → 1 ported / 30 partial / 0 missing / 2 ignored;
  `tools/compat-report/**` + `docs/mod-compat-notes.md`. Static
  inventory only (no runtime load test — rides S3).
- `[ ]` T1 Deploy-to-Cloudflare button on a public repo (artifact shipped;
  repo placement is Julian's call).
- `[ ]` T2 Bunny Edge Scripting + Bunny Database adapter path.
- `[ ]` T3 config-page provisioning payload doubling as recovery artifact
  (non-button providers).
- `[ ]` T4 migration tool generalization (tracker stream 14) — the
  proven Culturesmith importer into the one-click path.
- `[ ]` T5 shadow-compare router (TS behind Ruby, live-traffic byte
  comparison, clean-cutover report).
- `[ ]` T7 M3 published metrics: live culturesmith.com vs actual CF deploy
  (needs Julian/Ethan coordination; local numbers are engineering
  artifacts).

## Coordinator-held (not fleet work)

- Replay driver: pre-seed all shards (cross-shard nest targets) + flip
  the denied-span skip → judged (needs permission seeding enrichment per
  docs/permissions-port-notes.md) → full 48-shard M1 replay.
- Integration, gates, commits, pushes, deploys.
