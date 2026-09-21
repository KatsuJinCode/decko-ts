# Unknown-nest notes: rendering `{{references to cards that do not exist}}`

Stream: unknown-nest (2026-09-21). Makes the TS render engine produce Ruby's
unknown-card rendering for nest fetch misses instead of throwing
`nest target not found` (src/card/render/format.ts). Every claim below cites
the installed gem source or a measured corpus artifact.

## The Ruby mechanism (card-1.110.0 / decko-0.20.0)

**A nest fetch miss never raises.** `Card::Format::Nest::Fetch#new_card`
(card-1.110.0/lib/card/format/nest/fetch.rb:48-51) resolves every name
reference with `Card.fetch cardish, new: new_card_args`. On a miss,
`Card::Fetch::Results#results` (lib/card/fetch/results.rb:8-15) still returns
a card: `card if new_opts || card.known?` — a NEW (unknown) card with the
referenced name and the context card as supercard (`new_card_args`,
fetch.rb:53-58). The nest then renders its view on that unknown card.

**The unknown card's view is substituted before dispatch.** The render's
`ok_view` is `altered_view || requested_view` (lib/card/view.rb:86). For an
unknown card (`mod/core/set/all/states.rb#known?` — real? || virtual?; a
missing simple target is neither), `Card::View::Permission#alter_unknown`
(lib/card/view/permission.rb:36-44) runs:

1. Views with `perms: :none` skip the whole check (`skip_check?`,
   permission.rb:25-27) and render as requested.
2. A view configured `unknown: true` renders as requested
   (permission.rb:40).
3. Otherwise the substituted view is the nest's `unknown:` option (shark
   key, view/options.rb) or the view definition's `unknown:` config, and
   `Card::Format::Error#view_for_unknown` (lib/card/format/error.rb:18-25)
   turns that into `setting_view || :unknown` for nested (non-page) renders.

The `unknown:` configs live as `_view_<view>__unknown` setting methods
(lib/card/set/format.rb:178-181) on the set's format modules, so a
same-module view redefinition leaves earlier settings intact (the setting is
a separate define_method; `ViewDefinition#define_standard_view_method`
redefines only the view method). Effective html-format table:

| view | unknown: config | source |
|---|---|---|
| mini_bar, mini_unknown, bar_left, bar_menu, bar_body | `true` (render as-is) | card-mod-bar_and_box-0.20.0 set/all/bar.rb:15,26,35,36; card-mod-format-0.20.0 set/all/html/error.rb:21 |
| closed, bar, full_bar | `:mini_bar` | bar.rb:38,9,20 |
| bar_middle, bar_right | `:blank` | bar.rb:27,28 |
| titled_content | `:blank` | card-mod-format set/all/base.rb:105 (base format, inherited by html) |
| labeled | `:labeled` (same view) | html/views.rb:67 |
| labeled_content | `:mini_unknown` | base.rb:101 |
| one_line_content, raw_one_line_content | `:mini_unknown` | html/views.rb:29,24 |
| everything else (titled, content, open, core, ...) | none -> `:unknown` | format/error.rb:23 |

**The rendered bytes on the captured surface.** The corpus deck's viewer is
anonymous and cannot create. The html `view :unknown`
(card-mod-format-0.20.0 set/all/html/error.rb:15-17) is
`createable { wrap { unknown_link "#{unknown_icon} #{render_title}" } }`,
and `createable` renders `""` without create permission (error.rb:19-21) —
the createable branch would emit the unknown-link wrap. The captured
fixtures contain NO unknown-link bytes anywhere (grep over
fixtures/corpus/*.jsonl), so on the captured surface every `:unknown` /
`:mini_unknown` substitution renders the EMPTY STRING, and `:blank` is
literally `""` (base.rb:109-111). Corpus proof: shard-000000 entry 640
(`uiqxodma`, content `<p>{{xxxxxxxxxxxxxxxxxxxxx}}</p>`) expects exactly
`<p></p>` at the nest site.

**The blank reference (`{{}}`) is a different mechanism.** A blank mark
short-circuits fetch entirely: `Card::Fetch::Retrieve#retrieve_existing`
(lib/card/fetch/retrieve.rb:9-12) skips blank marks, and
`Results#results` returns nil (`return if card.nil?`). No card — not even an
unknown one — is built, and the nil-card nest surfaces through the html
denial path (`quiet_denial`, html error.rb): a bare
`<span class="denied"><!-- Sorry, you don't have permission (read) --></span>`.
Corpus oracle: shard-000000 entry 636 (`thez+*right+*default`) carries
`{{}}` mid-text; its captured content view shows the surrounding text joined
directly onto that span.

## The TS port (src/card/render/**)

- `RenderFormat.nest` (format.ts): on a fetch miss builds the unknown card
  (name/key from the resolved reference, no id/type/content,
  `unknown: true`, `reportUnknownCard` hook) and renders the requested nest
  view in a subformat — substitution happens in `renderView`, mirroring
  Ruby's ok_view, so inner views of the unknown card (e.g. bar_left inside
  mini_bar) substitute identically. The blank reference returns the denial
  span directly. **No queries are added: unknown cards do not exist and are
  rendered from the miss; the prefetch batch shape (#1282) is untouched.**
- `RenderFormat.viewForUnknown` (format.ts): the substitution table above
  (`UNKNOWN_VIEW_CONFIG`), the perms-:none exemption set
  (`PERMS_NONE_VIEWS`, incl. `:title` whose base-format `perms: :none`
  survives html's redefinition — title renders normally on unknown cards,
  which matters for bar_left inside mini_bar), and the nest's `unknown:`
  option taking precedence (rides the voo via `nestOptionEntries`).
  The main+root page branch (`page_view_for_unknown` :not_found/:new) is
  NOT ported — the capture never renders an unknown MAIN card; hitting it
  throws a named error instead of diverging silently.
- `HTML_VIEWS` (views.ts) gains `unknown` (""), `blank` (""), `mini_unknown`
  (""), and `mini_bar` (the existing item-bar machinery with the mini_bar
  slot wrap — shape follows bar.rb's identical prepare_bar/haml :bar path,
  but NO corpus bytes pin an unknown card's mini_bar, so it is
  oracle-unverified).

## Corpus counts (benchmarks/corpus-v2/replay-shard.test.ts, shard 0 only)

Judged classes per the driver's own classification order: structure-pending
first, then the nestGap filter (`nest target not found` in the failure
message), then permission-pending.

| renders (2426 total) | before | after |
|---|---|---|
| pass | 1698 | 1772 |
| structurePending | 106 | 106 |
| nestGap | 112 | **0** |
| permissionPending | 816 | 816 |
| realFail | 510 | 548 |

The class collapses to zero. All 112 formerly-throwing views now render;
74 of them byte-match Ruby exactly. The other 38 render but mismatch on
other classes (verified from the failure excerpts): the RULE set-key the
set-keys stream has in flight, the menu help-popover content (Ruby renders
the *help rule text, the port renders `&nbsp;`), cross-shard nest targets
that exist in the deck but outside the shard's seeded rows (entry 80/81/85:
TS renders the unknown view, Ruby rendered the real card), and
nested-denied spans (entry 80's `{{*admin info|content}}`). The card-engine
records column is untouched by this stream (999 total, 0 realFail both
runs). The driver's `expect(total.renders.realFail).toBe(0)` still fails
(548) exactly as it failed before (510) — the residual belongs to the
streams above, not to nest resolution.

## Byte-parity proof

- tests/card/render/unknown-nest-corpus-replay.test.ts — corpus entries
  640, 643, 639, 1120 (shard-000000; all 16 captured views): RichText cards
  whose content nests genuinely absent simple targets, replays
  byte-identically. Seeding = shard ids + type cards + transitive junction
  sides (same loop as junction-depth-corpus-replay.test.ts). These are
  structure-clean entries (captured record.content == db row) so they judge
  the nest renderer and nothing else.
- tests/card/render/unknown-nest-blank-reference.test.ts — the `{{}}`
  denial-span bytes, pinned at unit level (its only full corpus oracle,
  entry 636, also carries the RULE set-key that the set-keys stream has in
  flight, so the whole entry cannot pass yet).
- tests/card/render/render-engine.test.ts — the old
  `rejects.toThrow(/nest target not found/)` pin now asserts the oracle
  shape (`<p>{{ghost}}</p>` renders `<p></p>`).

## Honest remainder

- **mini_bar on unknown cards is oracle-unverified.** The substitution
  `closed/bar/full_bar -> mini_bar` is implemented from the Ruby source,
  but no captured fixture renders an unknown card's bar (closed-view nests
  stub their bodies; the captured deck nests unknown cards only at the
  default :titled view). Byte shape follows the :bar machinery.
- **The `createable` branch of :unknown/:mini_unknown is not implemented**
  (permission-gated; the captured surface is create-denied and renders "").
  If a future surface grants anonymous create, Ruby emits
  `wrap { unknown_link("#{unknown_icon} #{render_title}") }` — unported.
- **The main+root unknown page branch is not ported** (see above); it
  throws a named error rather than diverging.
- **Warm re-renders of unknown-nest roots re-run the closure prefetch**
  (one extra batched round trip per re-render): `closureWarm` lives in
  src/card/render.ts, outside this stream's directories, so the
  `reportUnknownCard` hook is optional and the engine does not consume it
  yet. Bytes are unaffected (the prefetch deterministically misses the same
  keys); Ruby has no cache for unknown cards either. A negative-key set in
  RenderEngine.closureWarm closes this when the render.ts owner takes it.
- **Cross-shard nest targets are a harness class, not an engine class:**
  shard-0 entries whose content references EXISTING deck cards that sit
  outside the shard's seeded rows (e.g. entry 80 `{{ufmxqszifajstr}}`, card
  id 9922) now byte-mismatch (TS renders the unknown view, Ruby rendered
  the card) — they used to throw into nestGap. They need seed-side
  resolution in the replay driver, which is outside this stream's
  directories. Same for nested-denied targets (entry 80's
  `{{*admin info|content}}` captures a read-denied span inside the nest:
  the permissions stream's class).
- Entry 636 (the `{{}}` oracle) also fails on the RULE set-key class
  (set-keys stream, in flight) — observed-not-mine.
