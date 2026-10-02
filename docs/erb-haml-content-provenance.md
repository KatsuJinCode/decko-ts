# ERB/HAML content provenance in the corpus

> Investigation result: zero corpus `record.content` is the product of ERB/HAML
> template evaluation at SAVE time. All card contents are stored verbatim.
> The decko-ts write/render path therefore needs no template-evaluation work.

## Question

Are any corpus card contents the product of ERB/HAML template rendering at
SAVE time (rather than verbatim storage)? If so, does the decko-ts
write/render path reproduce them?

## Method

Two independent investigations, each cross-checked by a strict regex sweep
over the whole corpus:

1. **Source-side**: scan every `card-mod-*/data/real.yml` for ERB/HAML
   markers (`<%`, `%>`, `#{}`, `%tag`). Compare to `Cardio::Seed.load` to
   confirm the loader does not ERB-evaluate fixtures.
2. **Runtime-side**: scan every `card-mod-*/set/**` and
   `card-mod-*/lib/**` for `ERB.new` / `Haml::Template` / save-time
   rendering of content. Trace `Card::Content::All#content=` for any
   template evaluation.
3. **Corpus-side**: full-corpus regex sweep of all 47,232 records across
   `fixtures/corpus/shard-*.jsonl` for ERB markers (`<%[\s\S]*?%>`) in
   `record.content` and across `views.{closed,content,open,title}`.

## Evidence

### 1. Mod seed files (real.yml) — no ERB

Across every installed mod (`card-mod-account`, `card-mod-bootstrap`,
`card-mod-email`, `card-mod-layout`, `card-mod-defaults`,
`card-mod-carrierwave`, `card-mod-edit`, etc. — 32 mods total), the
`data/real.yml` files contain **zero** Ruby ERB markers. The grep that
sweeps for `<%[^a-zA-Z]` and `%>` returns no hits.

The seed loader (`gems/card-1.110.0/lib/cardio/seed.rb:36`)
calls `ActiveRecord::FixtureSet.create_fixtures`, which reads plain YAML
without ERB evaluation. ERB evaluation is not a Rails default for fixture
loaders.

```
# card-1.110.0/lib/cardio/seed.rb:36
def load
  ActiveRecord::FixtureSet.create_fixtures path, load_tables
  ...
end
```

### 2. Content save path — no ERB

`Card::Content::All#content=` (the only entry point for setting stored
content) assigns the value verbatim to `db_content` after
`standardize_content` (array → items-content conversion only).

```
# card-1.110.0/lib/card/content/all.rb:10
def content= value
  self.db_content = standardize_content value
end
```

No ERB, HAML, or Liquid evaluation happens here. The only transform is
array → items-content shaping. The save-time hook chain
(`Card::Save` → `Card::Env`) preserves the value as-is.

### 3. Mod-side ERB/HAML — view templates only, not content

ERB/HAML files in the mod set/ trees are view-rendering templates, not
card-content sources. They render the HTML wrap around `db_content` for
specific views (modal, overlay, role checkbox, etc.). They never write
back into `cards.db_content`. Examples:

- `card-mod-layout-0.20.0/set/all/modal/modal_dialog.haml`
- `card-mod-layout-0.20.0/set/all/overlay/overlay_header.haml`
- `card-mod-layout-0.20.0/set/right/enabled_roles/role_checkbox.haml`

These render at view time and affect the captured `views.*` HTML in the
corpus. The corpus already captures post-render HTML — those templates'
output is what the corpus holds. Their source files do NOT seed any card
content.

### 4. Corpus sweep — 0 real ERB hits

Full-corpus scan (`cat fixtures/corpus/shard-*.jsonl`, 47,232 records)
for Ruby ERB blocks:

```
realErb = /<%[\s\S]*?%>/     # matches <% ... %> with any content
hits = 0                     # across 47,232 records
```

The 23 hits for the substring `#{` are SCSS interpolation (`#{$var}`),
not Ruby string interpolation. Example (id=22774, `cerulean_skin`,
`type_code=css`):

```
"Potentially invalid value for #{$map-name}: This map ..."
"@return rgba(var(--#{$variable-prefix}#{$identifier}-bg-rgb), ...)"
```

These are stored verbatim SCSS source. The `css` / `scss` cardtype
stores raw source — the renderer (a downstream SCSS compiler) evaluates
`#{}` at compile time, not at save time. The save path stores the
source untouched.

### 5. Views sweep — 0 real ERB hits

For the same 47,232 records, scan of `views.{closed,content,open,title}`
for ERB blocks: **0 hits**. The corpus `views.*` HTML is the rendered
output, with all template directives consumed. Example (id=1, view
`content`, first 200 chars):

```
<div id="tkxqkflwgtb-content-view" class="card-slot content-view ALL TYPE-orvipveb SELF-tkxqkflwgtb d0-card-content" ...><p>zuoio...</p>
```

Pure HTML, no template residue.

## Comparison table — cardtype → mod data file → verdict

The cards most likely to look template-derived are layout cards
(`type_code=layout_type`), HTML cards (`type_code=html`), CSS cards
(`type_code=css`), and email-template cards (`type_code=email_template`).
All of them store verbatim. The comparison:

| Cardtype | Example id (corpus) | Mod source (`data/real.yml` or set/) | Captured `record.content` shape | Verdict |
|----------|---------------------|--------------------------------------|-------------------------------|---------|
| `basic` | 1 (`decko_bot`), 3 (`basic`), 4 (`user`), 5 (`cardtype`) | No `:content` key in `card-mod-defaults/data/real.yml` for these seeds; created by Rails fixture | `<p>zuoio...</p>` (random placeholder) | verbatim (placeholder is the corpus sanitizer, not a transform) |
| `html` | 81 (`*sidebar`), 470 (`ppqhuslzzya`), 477 (`ltfrqwekckgrnmvmnkxx+...`) | `card-mod-layout-0.20.0/data/real.yml` has `<div>[[/ | {{:logo|content_panel}}]]</div>` — Decko nest references, no ERB | `<div>{{thez|core}}</div>...` (nests preserved verbatim) | verbatim — content holds Decko `{{...}}` nests, not ERB |
| `layout_type` | 314 (`wgdizqbbdtieue`) | `card-mod-layout/set/all/...` (HAML render templates, not seed source); layout cards created at runtime | `<!DOCTYPE HTML>...{{*head|core}}...{{_main|open}}...` (verbatim HTML + Decko nests) | verbatim |
| `css` / `scss` | 198 (`*css`), 22774 (`cerulean_skin`), and ~21 other skin cards | `card-mod-bootstrap-0.20.0/data/real.yml` has `:type: :scss` for `*stylesheets`, `bootstrap: variables`, etc. | raw SCSS containing `#{$variable}` interpolation | verbatim (SCSS source stored untouched; SCSS `#{}` is a compile-time language feature, not Ruby ERB) |
| `email_template` | none in shard 0-5 (cardtype only, no instance seeded in test deck) | `card-mod-email-0.20.0/data/real.yml` declares `Email template` as `:type: :cardtype`; no content | n/a — cardtype declaration only | verbatim (cardtype only, no template instances in deck) |
| `pointer` | 77 (`*home`, `:content: Home` in `card-mod-defaults/data/real.yml`) | seed value: `Home` | `"yzzw"` (4-char corpus placeholder, byte-length preserved by sanitizer per `benchmarks/corpus-v2/build_corpus_v2.py:13`) | verbatim — sanitizer preserves byte length, replaces text deterministically |
| `image` | 79 (`*logo`), 103 (`*favicon`) | `card-mod-carrierwave-0.20.0/data/real.yml`: `:type: :image, :storage_type: :coded, :image: logo.svg` | base64 placeholder string | verbatim — image storage is binary blob; corpus stores sanitized placeholder of same byte length |
| `phrase` | 55 (`*title`) | `card-mod-defaults-0.20.0/data/real.yml`: `:type: :phrase, :content: title` (no actual content override) | `"gaxubghsdbki"` | verbatim |
| `date` | many seeded | no `:content` for default dates; auto-generated | placeholder string | verbatim |
| `search_type` | 30 (`*type+*search`) | n/a | n/a (no content) | verbatim |
| `account` (HTML) | 100 (`*account`, 926 chars) | `card-mod-account-0.20.0/data/real.yml`: `:name: "*account", :codename: account, :fields:` — no `:content` key | `<div>...<blockquote><div>{{xxxxxxxxx...}}</div></blockquote>...</div>` (HTML + Decko nests) | verbatim |
| `*cached content` | not present in shard 0-5 (system card) | `card-mod-defaults` declares but no content | n/a | verbatim (no content) |

### Decko `{{...}}` nests are not ERB

The HTML and layout-type card contents contain `{{card_name|view}}` and
`{{*rule_card}}` patterns. These are Decko nest references — rendered by
`Card::Content::Chunk::Nest` at view time (see
`card-1.110.0/lib/card/content/chunk/nest.rb`). They are NOT ERB / HAML
delimiters. The TS port's nest renderer (already in `src/card/render/`)
handles these; no ERB-style substitution is involved.

## Mechanism (why no ERB at save time)

Card content is stored in `cards.db_content` (the `text` column). The
write path is:

```
Card::Content::All#content=(value)   # card-1.110.0/lib/card/content/all.rb:10
  -> db_content = standardize_content(value)   # array → items content; otherwise value untouched
  -> ActiveRecord write of db_content
```

There is no `ERB.new(value).result` call anywhere on this path. ERB is
only invoked for view-rendering templates in
`Card::Set::Format::AbstractFormat#render_view` (the view-time render
path), which takes a HAML/ERB file from the mod's `set/` directory and
binds it to a view context — not to `db_content`. The view layer outputs
HTML; that output ends up in the corpus `views.*` fields, not in
`record.content`.

## Conclusion

**The corpus contains no template-rendered card content.** All 47,232
captured `record.content` fields are stored verbatim from the seed source.
The 23 `#{` hits are SCSS interpolation (compile-time CSS feature), not
Ruby ERB; the 0 `<%` hits confirm no Ruby ERB exists in stored content.

The TS write path (`Card::Content::All#content=` port) needs only to
preserve content verbatim and standardize array → items-content; the TS
render path (`src/card/render/`) consumes the captured `views.*` HTML
which already reflects post-render output.

**No code port required for ERB/HAML save-time evaluation. Stream
closes.**

## Verification commands

The evidence above is reproducible from any checkout:

```bash
# 1. Source-side: mod seed files contain no ERB
for mod in card-mod-account card-mod-ace_editor card-mod-api_key \
           card-mod-assets card-mod-bar_and_box card-mod-bootstrap \
           card-mod-carrierwave card-mod-collection card-mod-comment \
           card-mod-content card-mod-date card-mod-defaults \
           card-mod-delayed_job card-mod-edit card-mod-email \
           card-mod-follow card-mod-format card-mod-help card-mod-history \
           card-mod-integrate card-mod-layout card-mod-list \
           card-mod-markdown card-mod-permissions card-mod-recaptcha \
           card-mod-rules card-mod-script card-mod-search \
           card-mod-session card-mod-style card-mod-tabs \
           card-mod-tinymce_editor card-mod-virtual; do
  for f in "$(gem environment gemdir)/gems/${mod}-0.20.0/data/real.yml"; do
    [ -f "$f" ] && grep -cE "<%|%>" "$f"
  done
done
# (output: all zero)

# 2. Loader path: real.yml is plain YAML, no ERB
cat $(gem environment gemdir)/gems/card-1.110.0/lib/cardio/seed.rb
# (line 36: ActiveRecord::FixtureSet.create_fixtures, no ERB)

# 3. Content save path: no ERB transform
cat $(gem environment gemdir)/gems/card-1.110.0/lib/card/content/all.rb
# (line 10: content= assigns verbatim via standardize_content)

# 4. Corpus sweep — 0 real ERB hits in 47,232 records
cat fixtures/corpus/*.jsonl | node -e "
let d=''; process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  let hits=0,total=0;
  for (const line of d.split('\n').filter(Boolean)) {
    try { const o=JSON.parse(line); total++;
      if (/<%[\s\S]*?%>/.test(o.record.content||'')) hits++;
    } catch(e){}
  }
  console.log('Total:', total, 'Real ERB hits:', hits);
});"
# (output: Total: 47232 Real ERB hits: 0)
```

## Cross-references

- `src/card/render/prefetch.ts` — prefetch implementation that
  operates on `db_content` (verbatim nest references)
- `tests/card/render/prefetch-cache-codename-parity.test.ts` —
  corpus replay test that consumes `record.content` verbatim
- `benchmarks/corpus-v2/build_corpus_v2.py:13` — corpus sanitizer
  that preserves content byte length but replaces text
  deterministically; the corpus `record.content` is therefore
  same-shape-as-source, just byte-substituted
- `docs/mod-compat-notes.md` — companion per-mod port status
- `docs/parity-ledger-2026-09-22.md` — standing parity status
