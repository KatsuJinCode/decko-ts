# Mod compatibility report — method + caveats

> Per-mod ported/partial/missing verdict for every installed card-mod-* gem
> against the decko-ts implemented surface. Companion to
> `tools/compat-report/mod-compat-report.{md,json}`. Generator:
> `tools/compat-report/generate-mod-compat-report.mjs`.

## Method

For every `card-mod-*` directory under
`C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/` (the live oracle gems, decko 0.20.0
+ card 1.110.0):

1. **Walk `set/**/*.rb` and `lib/**/*.rb`** recursively.
2. **Mine each `.rb` file by regex** (not Ruby parsing — the script runs in
   Node and avoids any Ruby dependency):
   - `view :name` and `view :name, :target` (alias form) and the
     single-line `view(:name, ...) { ... }` parens form
   - `format :name do ... end` (which views live inside which format block)
   - `def name` / `def self.name` (set-module methods)
   - `event :name` (event hooks), `before :view_name` (before-hooks)
   - `include_set Abstract::Foo` (set-module inclusions)
   - `Cardio::Railtie.config.tap { |c| c.key = ... }` (config keys)
3. **Inventory the decko-ts surface** by reading source files only (no
   runtime):
   - `src/card/set-patterns/registry.ts` — `PATTERN_TABLE` codes (the 9
     concrete patterns: all, all_plus, type, star, rstar, rule, right,
     type_plus_right, self)
   - `src/card/render/views.ts` — `HTML_VIEWS` registry (19 views as of
     this writing) plus `renderView("...")` references inside the file
   - `src/card/rules/` — `lookup.ts` + `apply.ts` presence
   - `src/card/permissions/` — `read-rules.ts` + `view-perms.ts` presence
4. **Classify** each mod (see rubric below).
5. **Emit** `tools/compat-report/mod-compat-report.md` (human) and
   `tools/compat-report/mod-compat-report.json` (machine).

## Classification rubric

A mod's "mod-specific" view is a declared html view that is NOT in the
universal baseline shipped by card-mod-format + the deck core. The universal
set is the 12 views every card routes through:

    core, content, title, titled, titled_content, menu,
    open, closed, blank, unknown, mini_unknown, no_search_results

Anything else declared by the mod is a mod-specific contribution. Aliases
(`view :foo, :target`) are zero-work declarations and are dropped from the
denominator — they get counted as covered only when their target is covered.

| Status     | Condition |
|------------|-----------|
| **ported** | ≥50% of mod-specific html views in HTML_VIEWS, AND ≥50% of patterns the mod uses are implemented, AND the mod has pattern-backed set modules. |
| **partial** | At least one of: any html view in HTML_VIEWS; ≥50% pattern coverage; lib/ ruby + permissions; pattern-backed set modules present. |
| **missing** | None of the partial criteria hold. |
| **ignored** | Legacy-labeled per upstream maintainer guidance (`decko-commons#1282` thread), OR data/transform-only with no set/ tree. |

### Why the "mod-specific" carve-out exists

A naive "view covered / total" check would say a mod is ported just because
its one declared view is `:core`. `:core` is the universal fallback view that
every card renders through — it lives in `HTML_VIEWS` regardless of which mod
you're auditing. The mod-specific carve-out asks: of the views this mod
itself added (not the views it inherits from the framework), how many are in
the TS registry?

Real-world examples that drove the carve-out:

- `card-mod-recaptcha-0.20.0` declares only `view :core` in its set/ tree
  (set/self/recaptcha_settings.rb:11). Naively: "1/1 = ported." After
  the carve-out (and after removing `core` from the universal set):
  "0/1 specific covered" → partial. Its specific captcha-validation
  machinery is not ported.
- `card-mod-bar_and_box-0.20.0` declares bar, mini_bar, full_bar, bar_bottom,
  bar_menu, bar_body, closed, closed_bar, accordion_bar, open, open_bar,
  expanded_bar, boxed, boxed_link, bar_left, bar_middle, bar_right (17 views,
  of which closed and open are universal → 15 mod-specific, minus aliases
  closed_bar/accordion_bar/open_bar/expanded_bar → 11). Covered: bar,
  bar_bottom, mini_bar, bar_left, bar_middle, bar_right = 6 → 55% → ported.
  views.ts:178-249 reimplements `prepare_bar`, `build_accordion_bar`,
  `bar_bottom`, `bar_body`, `bar_stub` from bar.rb:50-105; views.ts:300-353
  reimplements the `:bar` (search-item) shape with the dropdown menu. The
  haml-derived byte shapes (single-quoted attrs, accordion markup, bar-body
  columns) are pinned by the captured corpus.

### Legacy-labeled mods

The legacy set is small and conservative. It only includes gems whose `set/`
tree is empty (porting them is vacuous — no set modules / no views to port)
AND whose `lib/` is clearly config-only or backend-only. Mods with
non-trivial `set/` trees are NOT in this set, even if their `lib/` is a thin
config wrapper, because the `set/` tree represents unported code that
should show up as missing/partial in the report.

Currently legacy-labeled (see `LEGACY_MODS` in the generator):

- `card-mod-delayed_job-0.20.0` — backend-only; `set/` empty;
  `lib/card/mod/delayed_job.rb` is a single config + a `Delayed::Worker`
  monkey-patch.
- `card-mod-defaults-0.20.0` — pure data seeding (17 transform files);
  no `set/`, no `lib/` ruby beyond the mod entry point. Porting is a data
  load, not a set/view port.

Recaptcha was initially flagged as legacy (lib recycles deprecation
comments: "deprecated; use recaptcha_site_key instead") but pulled out of
the set because it has 8 set modules and a non-trivial html view
(`:core` on the recaptcha settings card). Its `set/` tree is not ported,
and the report shows that honestly as partial.

## Honest caveats

The classifier is heuristic. Every entry should be read as "the inventory
of declared views/set modules/event hooks matches/doesn't match the TS
registry surface" — not as "this mod is feature-complete in TS." Things the
classifier CANNOT see:

1. **Behavior, not just declarations.** A `view :foo do ... end` line tells
   the report that the mod declares a `:foo` view. It does NOT tell the
   report whether the body is a 1-line stub (`view(:bar_right, unknown: :blank) { "" }`)
   or a 200-line rendering pipeline. The captured corpus (`fixtures/captured/`)
   is the only byte-level proof of behavioral parity for the four views it
   exercises (title, content, open, closed, titled). For all other views,
   "covered" means "a renderer exists in TS" — not "the renderer matches
   Ruby's output."

2. **Set-module load order.** The TS pattern registry
   (`registry.ts:147-319`) is the lookup table; the Ruby SetPatternLoader
   resolves the same precedence via mod/core/set_pattern/NN_*.rb files. The
   report checks which pattern CODES are registered, not whether the
   per-instance behavior (anchor_name, anchor_id, label variants) is
   byte-identical for a specific card. That's pattern-stream work, not
   mod-compat work.

3. **Format coverage beyond html.** The report mines `format :html` views
   explicitly and reports `format :css / :rss / :csv / :data / :text` views
   in the per-mod detail ("non-html views" line) but does not score them
   against TS. TS ships html + data only as of this writing
   (src/card/render/format.ts is html-only).

4. **Hamls.** Every `.haml` template paired with a `view :foo, template: :haml`
   is inventoried as a count and listed in per-mod detail. TS reimplements
   the shape of `bar.haml` and `bar_body.haml` in views.ts (lines 220-249,
   304-325) but does not run a haml runtime. Other hamls (bootstrap
   accordion_item.haml, signin core.haml, signup core.haml, etc.) are not
   rendered by TS — they would need their own per-template ports.

5. **Event hooks / before-hooks / defs / include_set refs.** Reported as
   raw counts and short previews, not scored. The TS render path covers
   the visual surface; event hooks (`event :signin, :validate, on: :update`)
   are write-path code (history stream, write stream) and are out of scope
   for this compat report.

6. **Permissions and rules.** `card-mod-permissions` (rule admin UI) shows
   up as partial because TS has `src/card/rules/` and
   `src/card/permissions/` (lookup + apply + read-rules + view-perms) but
   the per-mod rule SET definitions (set/right/*.rb, set/type/setting/*.rb,
   set/type/set/html_views/*.rb, set/rule/rule_form.rb) are not ported.
   The `:open` / `:content` rule lookup paths are wired; the rule admin UI
   (rule_form, set_picker, accordion_rule_list, board_rules_tab) is not.

7. **What "mod loader" means.** `card-1.110.0` and the 33 `card-mod-*`
   gems form a single Ruby load chain (`Cardio::Mod::Loader`). decko-ts does
   not have a mod loader at all — it has stream-owned slices of the
   registry. The compat report is a snapshot of what decko-ts has ported
   statically, not a declaration that the loader works.

8. **Counts may be off by one or two.** The regex miner is tolerant
   (handles comments, the parens-form `view(:foo) { ... }`, both
   `view :foo, :bar` and `view :foo do ... end` shapes) but does not parse
   Ruby — a `view :foo` inside a heredoc with a `:` delimiter, or inside a
   multi-line string, could be miscounted. For the size of this corpus
   (33 gems, ~600 .rb files) a per-mod ±2 view count does not change
   classification; for very small mods (≤3 declared views) it could.

9. **The legacy list is upstream-maintainer opinion.** The decko-commons
   #1282 thread (referenced in the task brief) names certain mods as
   legacy or maintenance-frozen. The list here is the AGENT's read of
   that thread, conservatively narrowed to mods with NO `set/` tree. A
   different agent reading the thread could reasonably flag a wider set
   (e.g. `card-mod-ace_editor` has 2 rb files and might be considered
   legacy by a stricter reading). Adjust `LEGACY_MODS` in the generator
   if the upstream guidance shifts.

## Reading the report

For each mod the report gives:

| Field | Meaning |
|-------|---------|
| status | ported / partial / missing / ignored |
| mod-specific views (covered / total) | how many mod-specific views are in HTML_VIEWS, out of how many mod-specific views the mod declares |
| set modules | count and per-pattern breakdown (e.g. `all=20, type=10, right=1`) |
| lib rb | count of .rb files under `lib/` (config + namespaces; out of render scope) |
| verdict | one-line summary naming the covered/missing views |

In the per-mod detail block the report also lists:

- every html view declared by the mod
- non-html format views (css/rss/csv/data/text) by `format:view` pairs
- view aliases (`view :foo, :bar`) up to 8 (with overflow count)
- event hooks (`event :name`) up to 6 (with overflow count)
- before-hooks (`before :view_name`) up to 6
- include_set references
- Cardio::Railtie config keys
- haml template count

These counts are the inventory; the classification is the comparison.

## Reproducing

From the repo root:

    node tools/compat-report/generate-mod-compat-report.mjs

Both outputs (`mod-compat-report.md`, `mod-compat-report.json`) are written
to `tools/compat-report/`. Flags: `--json-only`, `--md-only`.

No `npm install` is required — the generator uses only `node:fs`,
`node:path`, `node:url`.

## Cross-references

- `docs/upstream-parity-plan-1282.md` line 49 — S3 (mod loader + 33
  card-mods) tracks the runtime loading story; this report is the
  per-mod inventory that loader work consumes.
- `docs/upstream-parity-plan-1282.md` line 70 — T6 entry that introduced
  this tool.
- `src/card/render/views.ts:1-34` — list of which Ruby source files each
  ported view traces to; the byte shapes are pinned by the captured
  corpus (`fixtures/captured/smoke.json`).
- `src/card/set-patterns/registry.ts:1-31` — mod-load note: "Only
  card-1.110.0's core mod ships set_pattern files; none of the installed
  card-mod-* gems add one." That is why the report does not check for
  mod-supplied patterns.
