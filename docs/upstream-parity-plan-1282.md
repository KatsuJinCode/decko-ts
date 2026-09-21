# Upstream parity plan — decko-commons#1282 + Astra's four parities

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
- `[ ]` S3 mod loader + 33 card-mods (tracker stream 13, NOT STARTED).
- `[ ]` S5 non-read view perms (`perms: :update`, skip_perms).
- `[ ]` S6 Gherkin features port as the second behavior layer (#1282
  acceptance section). Owner: MM pool, first slice.

## Persistence parity

- `[~]` P1 write-path conformance — Ruby captures row states for a write
  battery (create/update/rename/delete/type-change, read-rule-affected
  saves exercising set_read_rule derivation, references expiry); TS
  actions engine replays and byte-compares. Owner: MM pool. Owns
  `benchmarks/capture-write-conformance.rb` + `tests/card/conformance/`.
- `[ ]` P2 history edges: drafts surface, nested supercard action trees.

## Side-effect parity

- `[ ]` E1 mailers/notifications (Ruby email machinery) — nothing built.
- `[ ]` E2 mod save-hooks / observer surface (rides S3).

## Runtime abstraction + delivery (#1282 product surface)

- `[~]` T6 mod compatibility report generator — per-mod
  ported/partial/missing verdict with evidence, from the installed
  card-mod gems vs the TS registry surface. Owner: MM pool. Owns
  `tools/compat-report/**`.
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
