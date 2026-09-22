# Help-popover parity notes (stream R1)

The `:menu` view's help popover renders the card's help text in
`data-bs-content`. Before this stream the port hardcoded the no-help
placeholder (`data-bs-content="&amp;nbsp;"`) for every card, which failed
every shard-0 corpus entry whose captured bytes carry real help text (140
distinct cards, ~280 captured views; the "~200 shard-0 fails" class in the
fleet brief also includes the RULE set-key class owned by the set-keys
stream, e.g. corpus:67, and the CodeRay/core-content classes).

## The Ruby mechanism, end to end

Render chain for the menu's help anchor (every citation from the installed
gems under `C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/`):

1. `card-mod-format-0.20.0/set/all/html/menu.rb:35-37` — `view :help_link`
   = `help_link render_help_text, help_title`; `menu.rb:54-56` menu_items
   puts it first; `menu.rb:97-101` `help_link` adds `_card-menu-popover`
   and `link_to icon_tag(:help), opts`.
2. `menu.rb:103-107` — `help_popover_opts`: `text ||= render_help_text`,
   `opts = { "data-bs-placement": :left, class: "help-link" }`, then
   delegates to the bootstrap helper.
3. `card-mod-bootstrap-0.20.0/set/all/bootstrap/helper.rb:46-57` —
   `popover_opts`: `add_class opts, "ps-1 _popover_link"`;
   **`text = "&nbsp;" unless text.present?`** (the placeholder the port
   hardcoded); `reverse_merge! path: "#", tabindex: 0, data:
   { "bs-toggle": "popover", "bs-trigger": "hover focus", "bs-content":
   text }`; `opts["data-bs-title"] = title if title`.
4. Attribute escaping: `link_to` → `content_tag("a", ...)` →
   `actionview-7.2.3.2 .../tag_helper.rb:261-306` (`tag_options` → for the
   `:data` hash `prefix_tag_option` → `tag_option`), `tag_helper.rb:310-323`
   escapes the value with `ERB::Util.unwrapped_html_escape` — which is
   `CGI.escapeHTML` semantics: `& < > " '` (escape `'` → `&#39;`;
   activesupport-7.2.3.2 `core_ext/erb/util.rb:10-18` → ruby 3.3
   `erb/escape.rb`). This is why captured bytes show `&#39;` inside
   `data-bs-content`/`data-bs-title`. The port's `h()`
   (src/card/render/slot-html.ts) already implements exactly this table.
5. Help text — `card-mod-help-0.20.0/set/all/help.rb`:
   - `:32-34 help_text` = `voo.help || rule_based_help` (voo.help is never
     set on the captured menu surface);
   - `:36-38 raw_help_text` = `card.try(:raw_help_text) ||
     card.help_rule_card&.content`;
   - `:40-48 rule_based_help` = `""` when raw_help_text is nil, else
     `process_content raw, chunk_list: :references` (current card's format:
     help-card nests resolve against the rendered card);
   - `:1-4 help_rule_card` = `rule_card(:help)` gated by `ok?(:read)`;
   - `:14-16 view :help_text` = `wrap_help_text help_text`; `:18-25
     wrap_help_text` prepends `"<span class='d-none'>#{edit_link}</span>"`
     exactly when `card.help_rule_card` is truthy (i.e. only when the text
     itself came from that readable rule card).
6. Rule resolution — `card-1.110.0/lib/card/rule/all.rb:9-15`:
   `rule_card(:help)` = fetch over `rule_id_lookup(Card::Rule.rule_cache,
   :help)` walking the card's `rule_lookup_keys`
   (`lib/card/set/pattern/all.rb:66-68` = patterns in precedence order;
   `lib/card/set/pattern/base.rb:70-77` = `"anchor_id+pattern_code"` or
   bare `pattern_code`) against the deck-wide rule cache
   (`lib/card/rule/cache.rb:10-27` — ONE deck-wide SQL load keyed
   `[anchor_id, pattern_code, setting_code].join("+")`).
7. Nested edit link — `help.rb:21`
   `nest(rule_card, view: :edit_link)`; the rule card's `:edit_link`
   (menu.rb:16-17 → `edit_link edit_link_view`) targets **:rule_edit**
   because `card-mod-rules-0.20.0/set/rule/editor.rb:60-62` overrides
   `edit_link_view` for rule cards — hence the captured
   `href="/<rule name>/rule_edit"` inside the d-none span.
8. RULE-card help-text override — `card-mod-rules-0.20.0/set/rule/
   board_rules_editor.rb:17-19`: for cards matching the RULE set pattern,
   `view :help_text` = `wrap_help_text [rule_based_help,
   setting_link].join(" ")` with `setting_link` (`:21-27`) =
   `<div class="ms-auto"><a class="text-muted known-card" href="/<setting
   url key>"> (N <title> rules)</a></div>`, N from `Setting#count`
   (`card-mod-rules-0.20.0/set/type/setting.rb:12-14` = `Card.search
   left: {type: SetID}, right: id, return: :count`).
9. `[[...]]` link chunks — `card-mod-content-0.20.0/lib/card/content/chunk/
   link.rb:13-15` (full_re `\[\[([^\]]+)\]\]`), `:77-109` (explicit targets
   matching `^(/|https?:|mailto:)`; first pipe outside a nest span divides
   target|label; `objectify` strips both sides), `:46-54` name targets nest
   the referee at `view :link`; `card-mod-format-0.20.0/set/all/base.rb:
   35-43` (`:link` → `link_view`: known/wanted class +
   `link_to_card name, _render_title`), `set/all/links.rb`
   (`add_known_or_wanted_class`, html `link_to_resource` +
   `add_resource_opts:150-153` → `target="_blank" class="external-link"`).
   Captured shape: `<a class="wanted-card" href="/Layouts"><span
   class="card-title" title="Layouts">Layouts</span></a>` /
   `<a target="_blank" class="external-link" href="http://...">more</a>`.

## What changed

New files (stream-owned):

- `src/card/render/setting-help-text.ts` — the static setting help-text
  registry (codename → self/right strings), sourced verbatim from the gems'
  `setting_opts ... help_text:` registrations and `def raw_help_text`
  definitions (card- and format-level defs produce the same observable
  string; see the file header). Covers exactly the settings the corpus
  exercises; extending is one map entry.
- `src/card/render/help-popover.ts` — the help-text processor
  (`[[link]]` chunks over the real nest machinery) and
  `HelpRulesResolver`: the deck-wide `*help`-rule load (ONE
  `driver.batch`: rule cards + transitive sides + per-setting rule counts)
  run once per engine (canary-guarded), mirroring Ruby's Rule::Cache shape;
  plus the synchronous `menuHelpContentBytes` implementing the whole
  help.rb/popover_opts/board_rules_editor chain from the enriched render
  map.
- tests: `tests/card/render/help-popover.test.ts` (8 units: span bytes,
  nbsp fallback, setting self/right strings, RULE-card setting_link with
  live count, wanted-card link chunks, pattern precedence, query shape),
  `tests/card/render/help-popover-corpus-replay.test.ts` (byte-exact corpus
  proof, below).

Modified (stream-owned):

- `src/card/render/views.ts` — `menuView` takes `data-bs-content` from
  `fmt.menuHelpContentBytes()` (blank → `&nbsp;` → `&amp;nbsp;` — the
  previous hardcode, byte-identical when no help resolves); new `:link`
  view (base.rb) for link-chunk targets.
- `src/card/render/format.ts` — `RenderFormat.menuHelpContentBytes()` +
  optional `helpRules` on `RenderEngineLike`.

One-line adjacent fix (disclosed): `tests/card/render/
permission-corpus-seeding.ts` — added the optional `record` field to the
shared `ShardLine` interface; the structure stream's new
`structure-corpus-replay.test.ts` reads `line.record.content` and the
missing field broke `npx tsc --noEmit` for the whole tree.

## Query shape (#1282)

`HelpRulesResolver.prepare` is deck-wide and closure-independent (the rule
load is Ruby's own Rule::Cache design): ONE batch with 2 statements
(`*help` rule cards + transitive sides + type cards; per-setting rule
counts), issued once per engine and canary-guarded — after the first
render, every render (cold or warm closure) resolves help with ZERO
additional queries, and `prepare()` re-runs only if the engine's caches
were reset (the canary rule card leaves the render map).

The coordinator's fold for the strict one-batch cold render: append the two
statements (`helpRuleSidesStatement`, `settingRuleCountsStatement` — export
them from help-popover.ts if preferred) to render.ts's existing
`coldStatements` and run the absorber over `stats.additionalResults` after
the codename fold; then `installHelpRules` needs no standalone prepare. The
resolver deliberately does not depend on the walk's output, so the fold is
pure statement appending (the prefetch.ts `additionalStatements` contract).

Composition today (until the fold): `installHelpRules(engine, fetcher)` +
`await resolver.prepare()` — used by the two new test files. Engines
without the resolver render the previous placeholder bytes unchanged
(worker.ts/deploy is untouched).

## Corpus proof (shard-000000, byte-exact via the replay harness)

`tests/card/render/help-popover-corpus-replay.test.ts` replays every
captured view of these entries and requires byte-identical HTML:

- 53 `*TinyMCE` (setting text, heredoc leading spaces + newlines; closed +
  title views — see exclusions), 61 `*thanks`, 81 `*sidebar`, 82 `*help`,
  86 `*content options` (wanted-card [[List]]/[[Pointer]]/[[Search]]
  chunks), 241 `*input type`, 247 `*autoname`, 252 `*content option view`
  (double-space bytes), 255 `*layout` (pipe-space `[[url | more]]` chunk),
  256 `*captcha`, 317 `*structure` — the setting-text class;
- 79 `*logo` — the rule-card class: `<span class='d-none'>` + rule_edit
  edit link + the `qqddl+*type+*help` rule content;
- 318 `*default`, 89 `*table of contents` — the empty class (no
  registration, no rule) → `&amp;nbsp;`.

## Honest remainder

1. **The setting_link count entries cannot be proven from the corpus DB.**
   26 shard-0 captured menus end in `(N <setting> rules)</a></div>` where N
   is a deck-wide aggregate Ruby computed at CAPTURE time; the provided
   `bench-corpus-v2.sqlite3` is a LATER deck state (Ruby captured
   "(49 default rules)"; the seeded DB resolves to 140; table of contents
   4→6; input type 9→12). The TS reproduces the exact CQL
   (`Setting#count`), so the aggregate it renders is whatever the seeded DB
   holds — the drift is unfixable at render level. The MECHANISM is pinned
   at unit level (help-popover.test.ts, "RULE-card variant"). If the fleet
   wants these 26 entries byte-proven, the corpus needs a recapture or a
   count fixture.
2. **Core-content classes exclude some proof views.** Entry 53's
   content/open views embed CodeRay syntax highlighting (the
   syntax-highlight stream's pending class); entry 79/81's open/content
   views embed logo/sidebar cores. The proof replays the views that judge
   the help class (closed pins the full menu incl. data-bs-content; title
   pins the title bytes) and skips core-embedding views with in-file
   justification.
3. **Link chunks inside link labels** (`[[A|{{B}}]]`) are not modeled
   (Ruby's `render_obj` builds a Content object); the corpus contains none.
   Nest-bearing help RULE CONTENT works (nests delegate to the real nest
   machinery).
4. **`:link` view label path inlines the title bytes** because the shared
   `:title` view does not read `voo.title` yet (wave-3). No-label links —
   the entire corpus surface — render the real `:title` view. Ruby's
   no-label `title` option is `fully_stripped`, which differs from the name
   only for compound link targets not present in the corpus.
5. **preference?-shape rule cards**: `isRuleCard` implements
   `standard_rule?` (right part Setting + left part Set, rule/all.rb:37-40);
   the `preference?` shape (rule/all.rb:43-48) is not modeled — no corpus
   menu renders a preference card's help.
6. **`card.known?` for link targets** is resolved against the prefetched
   render map (a target that exists in the DB but sits outside every
   prefetch closure renders `wanted-card` where Ruby would render
   `known-card`). Corpus link targets are all genuinely absent, so the
   captured bytes are exact; flagging the theoretical divergence.
7. The static help-text table covers the settings the corpus exercises
   plus none speculative: a deck that loads additional mods with
   `help_text:` registrations needs one more map entry per setting
   (verbatim string from the gem).

## Gates

At stream completion, with my diff applied:

- My files compile clean (`npx tsc --noEmit` lists no diagnostics in any
  help-popover/setting-help-text/views/format/structure/permission-seeding
  file). The tree-wide tsc currently reports 3 errors, ALL from concurrent
  streams' in-flight files: `src/card/mod-loader.ts` (untracked new file,
  mod-loader stream), `tests/card/conformance/write-path.test.ts`
  (write-path stream), and the structure stream's temp
  `zz-structure-debug.test.ts` (came and went during the stream).
- `npx vitest run tests/card/permissions tests/card/render`: 75/76 green —
  every permission test, every pre-existing render test, all 8
  help-popover units, and BOTH corpus replays (mine: 14/14 proof entries
  byte-exact; the structure stream's — passing after I installed the
  resolver there, since its sample entry 61 pins MY class's bytes). The one
  red test is `render-engine.test.ts` "constant query count"
  (`statementsByDepth[8]` 11 not < 11): concurrent stream work on
  `render.ts#computeIsRule` (the corpus:253 ORDER PARITY fix, landed
  mid-stream by the structure/set-keys stream) added one enrichment fetch
  for 3-part names. My diff is query-inert on that path: the failing test
  composes `createRenderTestStorage()` with NO resolver installed, and
  `menuHelpContentBytes()` is then a property read returning "".
- Adjacent fixes I made for shared green (disclosed):
  - `permission-corpus-seeding.ts`: added the optional `record` field to
    `ShardLine` (the structure stream's test reads it; its absence broke
    tree-wide tsc).
  - `structure-corpus-replay.test.ts`: installed the help resolver
    (installHelpRules + prepare, 2 lines + import) — its sampled entry 61
    pins the help-popover bytes, which only the resolver serves.
