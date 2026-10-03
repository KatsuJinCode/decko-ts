# The mod porting harness — port a Ruby Decko mod to TypeScript, start to finish

Tool: `tools/mod-porting-harness/mod-harness.mjs` (zero npm deps — the
`tools/compat-report` convention). Ruby side is READ-ONLY against the
installed gems; static-ruby oracle scripts run under
`C:/Ruby33-x64/bin/ruby.exe` with scratch state only under the repo's
`tmp/` — never another deck, never a network, never a production site.

The operator ruling this serves (2026-10-03): **"decko IS the mods... we
should make porting a mod to any language trivial by validating its full
behavior set. So we can give them the tool to port their mod and we port all
the mods we know about."** Deliverable shape: every PUBLIC mod ported,
behavior-validated; private mods are the only exclusion.

## The three commands

```bash
node tools/mod-porting-harness/mod-harness.mjs surface  <mod>
node tools/mod-porting-harness/mod-harness.mjs capture  <mod>
node tools/mod-porting-harness/mod-harness.mjs verify   <mod>
node tools/mod-porting-harness/mod-harness.mjs registry
```

`<mod>` accepts `comment` or `card-mod-comment`. Exit code: `verify` exits 1
when any behavior is RED — that is the harness working on an unported
behavior, not a tool failure.

### 1. `surface` — what does this mod DO?

Mines the gem's Ruby source (read-only) into the mod's FULL behavior set:

- views — including LOOP-DECLARED views
  (`%i[open open_content].each { view viewname }`), which the compat
  report's line regex cannot see (card-mod-comment's discussion views were
  invisible to it);
- events — name + full option tail (`:prepare_to_store, on: :save, when: :comment`);
- settings — every `set/self/<anchor>.rb` file, with the `raw_help_text`
  string extracted when it is a plain literal;
- seed cards — `data/*.yml` (name/codename/type/content, content hashed);
- config keys — `config/*.yml`;
- basket registrations — `basket[:key] << ...` lines.

Output (tracked): `tools/mod-porting-harness/reports/<mod>/surface.json`
(machine) + `surface.md` (plain-English "what this mod does").

### 2. `capture` — the Ruby oracle per behavior

Produces `fixtures/oracle-surfaces/<mod>.harness.jsonl`, one JSONL oracle
per line, every line carrying provenance. Strategies, in order:

1. **existing-capture** — if `fixtures/oracle-surfaces/<mod>.jsonl` already
   exists (a prior lane's live capture), it is referenced, not duplicated:
   `{kind: "existing-capture-ref", sha256, lines}`.
2. **static-ruby** — every script under
   `tools/mod-porting-harness/ruby-oracles/<mod>/*.rb` runs under the REAL
   interpreter. A script extracts the gem's own source lines VERBATIM (by
   line range) into minimal doubles and emits the behavior's true output —
   state machines, rendered fragments, pure functions. Every stub (Env,
   Auth, clock, wrap_with...) is documented in the script header, and each
   output line names its `gemSource` line range. Precedent: the date-parse
   table was generated the same way.
3. **live-deck** — byte-exact HTML from a booted scratch deck. NOT exercised
   yet; behaviors that need it are reported as `uncaptured` by name, never
   silently skipped.

Anything without an oracle is listed as UNCAPTURED on stdout — the honest
gap, per behavior.

### 3. `verify` — is the behavior there, and does it match?

Three layers, one scorecard:

1. **Registration matrix** — for each surface behavior: is it registered in
   the TS side? Views: the mod manifest (`src/card/mod-loader/mods/<mod>.ts`)
   OR the engine's shared view table (`src/card/render/views.ts` HTML_VIEWS —
   some mods, like bar_and_box, port engine-side by design). Events,
   settings, seeds, configs, baskets: manifest or consumer literal.
2. **Probe suite** — runs the mod's tracked test files (enumerated, never a
   bare run): the harness probe `tests/card/mod-loader/<mod>-harness-probe.test.ts`
   (which replays every line of the harness oracle capture) plus the mod's
   standing suites.
3. **Scorecard** — `reports/<mod>/scorecard.json` + `.md`, per behavior:
   `green` (registered + harness oracle + probe green) /
   `registered-standing-net` (registered + the mod's tracked suite pins it)
   / `uncaptured` (no oracle, no probe coverage) / `red-unported` /
   `red-oracle-probe`.

### 4. `registry` — the progress tracker

`public-mod-registry.json` + `.md`: every public mod (33 installed
card-mod-* gems + the core mod + TS-only mods), marked **ported / unported /
private-unknown**. Harness-first: a scorecard with 0 RED is the ported bar;
the compat report is the fallback citation. The re-measure column
(2026-10-03 census, tree 0287dab) keeps behavior gaps visible inside
otherwise-ported mods. Private-unknown requires evidence of site-private
source; the installed gems are public by construction (published, LICENSE
carrying — the same frozen set the license audit read), so no row carries
it.

## Porting a mod with the harness (the contributor loop)

1. **`surface <mod>`** — read `surface.md`. This is the mod's contract: the
   list of behaviors a complete port must have.
2. **Write capture scripts** for the behaviors whose oracle can be produced
   without a booted deck (state machines, pure logic, settings strings).
   Copy the pattern of
   `ruby-oracles/card-mod-comment/session-sticky-comment-author.rb`:
   header documents every stub; body extracts the gem's lines verbatim by
   line range; stdout is JSONL with `behaviorId` matching the surface ids.
   **`capture <mod>`** and check the UNCAPTURED list — what remains needs
   the live-deck strategy (future work; say so, do not fake it).
3. **Write the harness probe** `tests/card/mod-loader/<mod>-harness-probe.test.ts`:
   read the harness jsonl, replay each oracle against the TS port (see
   `card-mod-comment-harness-probe.test.ts` — request params, auth state,
   session bag and pending content in; content and session state out, byte
   compared). Run **`verify <mod>`**: it exits 1 with the failures — this is
   your RED list. Work behavior by behavior until exit 0.
4. **Register the behaviors** in the mod manifest
   (`src/card/mod-loader/mods/<mod>.ts`) — views/events/settings with their
   gem citations, remainders documented in the manifest header in the
   established style (see card-mod-comment.ts's header).
5. **`verify <mod>`** until exit 0, then **`registry`** — your mod's row now
   carries a scorecard, and the registry is the project's progress tracker
   for the ruling.

### RED discipline (the standing net)

The probe test is TRACKED. An unported behavior fails it in CI — the pin
fails against the unported state (RED), passes after the port (GREEN). This
is the same grading-harness pattern the project uses everywhere: capture
behavior, implement, probe byte-exactness, standing net. Never delete a
failing pin to make a run pass; port the behavior or document the remainder
in the manifest header.

## What this lane proved (2026-10-02, worktree e7f8289)

- End-to-end on **card-mod-comment**: surface (9 behaviors, including the
  loop-declared views the compat report missed) → capture (6 static-ruby
  oracles + the prior live capture reference) → verify RED (5 session
  scenarios failing) → the session-sticky comment_author port
  (`ModEventSaveInput.session` + the event body in the gem's own order:
  session write BEFORE the blank-comment return) → verify GREEN.
- **ace_editor**: 4 behaviors, 0 RED (setting + basket ops registered; the
  no-TS-consumer surfaces stay named remainders).
- **bar_and_box**: the compat report's "ported" was over-reported (core view
  names masked the mod's own); the harness's engine-view-table check + its
  17-test standing suite give the honest verdict: ported engine-side, 0 RED.
- **Registry**: 35 rows, all ported at mod level, with the 23-view gap
  inside 6 mods carried honestly per row.

## Known limits (honest)

- `live-deck` capture is not implemented — view-byte oracles for data-bound
  views (the 23 missing views) need a booted scratch deck; until then those
  behaviors score `uncaptured`, and the registry's gap note carries them.
- The static checks are source-level (registration, literals); byte truth
  comes from the oracle captures + the tracked probe suites.
- Surface mining is regex-based (no Ruby parser). It is strictly better than
  the compat report's (loop-declared views, event options, seeds, configs,
  baskets) but exotic Ruby could still hide a declaration; the UNCAPTURED
  and RED lists are where such gaps surface.
