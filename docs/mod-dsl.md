# Defining mods with `defineMod`

A Ruby Decko mod is a directory of set modules: `set/type/basic.rb`,
`set/all/help.rb`, `set/self/help.rb`, each written in the set-module DSL
(`format :html do`, `view :core do`, `event :x, :store do`). decko-ts mods are
written in the same shape with `defineMod`
(`src/card/mod-loader/mod-dsl.ts`). It compiles to the `DeckoModManifest` the
mod loader already consumes, so a mod written with it loads, registers and
renders exactly as a hand-written manifest does.

`card-mod-help`, `card-mod-markdown`, `card-mod-session` and
`card-mod-ace_editor` are written with it; read
`src/card/mod-loader/mods/card-mod-help.ts` beside the gem's `set/` tree to see
the correspondence on a real mod.

## The shape

```ts
import { defineMod } from "../mod-dsl.js";

export default defineMod("card-mod-example", { group: "gem" }, ({ set }) => {
  set("type/basic", ({ view, format, event, setting, accessor }) => {
    view("core", (ctx) => ctx.fmt.processContent(ctx.fmt.renderRaw()));
    format("html", ({ view }) => {
      view("bar", { cache: "never", wrap: "slot" }, (ctx) => "...");
    });
    event("my_event", "integrate", { on: "update", when: "my_predicate?" }, (card) => {
      /* ... */
    });
  });
});
```

`defineMod(gemName, options?, body)` returns the manifest. The gem name is
normalized the way `Cardio::Mod.normalize_name` does it: `card-mod-example`
becomes the mod `example`, and the manifest keeps `card-mod-example` as its
gem name. A name without the `card-mod-` prefix is a deck-local mod.
`options.group` is the `Cardio::Mod::Dirs` group (`gem-card`, `gem-defaults`,
`gem`, `custom`).

## Ruby to TypeScript

| Ruby (card 1.110.0)                              | `defineMod`                                              |
|--------------------------------------------------|----------------------------------------------------------|
| `set/type/basic.rb`                              | `set("type/basic", (s) => ...)`                           |
| `format :html do ... end`                        | `format("html", ({ view }) => ...)`                       |
| `format :json, :csv do ... end`                  | `format(["json", "csv"], ...)`                            |
| `format do ... end`, or `view` at set level      | `format(({ view }) => ...)`, or `view(...)` (base format) |
| `view :bar, cache: :never, wrap: :slot do ... end` | `view("bar", { cache: "never", wrap: "slot" }, fn)`     |
| `view :bar, template: :haml`                     | `view("bar", { template: "haml" }, fn)` (see below)       |
| `event :x, :store, on: :update do ... end`       | `event("x", "store", { on: "update" }, fn)`               |
| `event :x, after: :y, when: :z? do ... end`      | `event("x", { after: "y", when: "z?" }, fn)`              |
| `event :x, :validate, changed: :name`            | `event("x", "validate", { changed: "name" }, fn)`         |
| `setting_opts group: :editing, position: 1`      | `setting({ group: "editing", position: 1 })`              |
| `card_accessor :email, type: :phrase`            | `accessor("email", { type: "phrase" })`                   |
| `card_reader :status` / `card_writer :salt`      | `reader("status")` / `writer("salt")`                     |
| `assign_type :phrase`                            | `assignType("phrase")`                                    |
| `def content ... end` (set-module override)      | `content(fn)`                                             |
| `basket[:tasks][:x] = {...}`                     | `basketTask({...})`                                       |
| `basket[:warnings] << :x`                        | `basketWarning("x")`                                      |
| `set_pattern/tab.rb`                             | `setPattern("tab", spec, { index })` (mod level)          |
| boot-time rule warm (`Rule::Cache`)              | `prepareEngine(async (host) => ...)` (mod level)          |

Symbols are written as strings. Every call appends one entry to the
manifest in the order it is made, which is the order Ruby reads the file in;
the loader then walks mods, set patterns and set files in
`Cardio::Mod::Dirs` order, so the order of `set()` calls within a mod does
not change load order. Calling `set()` twice with the same path reopens the
same set file, as reopening a Ruby module does.

### Views

A view body is a `ViewFn`: `(ctx) => string | number | null`, where `ctx.fmt`
is the format (Ruby's `self` in a view block) and `ctx.voo` its view options.
The view options are Ruby's view settings: `unknown`, `perms`, `cache`,
`wrap`, `denial`, and `template`.

`template: "haml"` records that the Ruby view renders from a HAML template
beside its set file. The engine has no HAML interpreter, so a template view
still supplies its body as a function: the port of the template. The option
is kept so the port can be checked against the template it transcribes.

### Events

`event(name, stage?, options?, body?)` takes the stage positionally, as Ruby
does. The stages are Ruby's director stages (`initialize`,
`prepare_to_validate`, `validate`, `prepare_to_store`, `store`, `finalize`,
`integrate`, `after_integrate`, ...). Options:

- `on`: `"create"`, `"update"`, `"delete"` or `"save"`, or a list of them.
- `before` / `after`: the name of another event at the same stage. As in
  Ruby, an event placed relative to another takes that event's stage, so
  it is declared without one.
- `when`: the name of a predicate, such as `"codename?"`. Ruby also accepts a
  proc; here the name is resolved at fire time against the deck's predicate
  table (`defaultDeckEventPredicates` in `default-mod-deck.ts`). A name that
  nothing answers raises when the event is considered, as Ruby's does.
- `changed` / `changing`: the card fields whose change gates the event.
- `skip: "allowed"`, `trigger: "required"`, `priority`.
- `engineOwned: true`: the event's behaviour is implemented in the engine's
  own save path; the declaration records Ruby's event list with an empty
  body, and passing a body is an error.

The body receives the acting card (Ruby's `self`), the engine host, and the
event context. An event declared without a body is recorded with an empty
one; say at the call site why, as the ported mods do.

### Accessors

`accessor`, `reader` and `writer` record Ruby's trait declarations on the
set file. The loader collects them in load order with the set path and mod
name (`ModLoader.cardAccessorDeclarations()`). Resolving a trait to its
`+name` child card is the caller's job: the declarations do not yet generate
`<name>_card` methods the way Ruby's `card_accessor` does.

## Worked example: a word-count mod

A deck wants every card to offer a `word_count` view, and wants a note when
a Basic card's content grows past a limit. In Ruby this would be a mod
`card-mod-word_count` with two set files:

```ruby
# set/all/word_count.rb
format :html do
  view :word_count, cache: :never do
    count = card.content.split.size
    %(<span class="word-count">#{count} words</span>)
  end
end

# set/type/basic.rb
event :note_long_content, :integrate, on: :save, changed: :db_content,
                                      when: :long_content? do
  Rails.logger.info "#{name} is over the word limit"
end
```

The TypeScript mod:

```ts
// card-mod-word_count.ts, a new file in src/card/mod-loader/mods/
import { defineMod } from "../mod-dsl.js";
import type { ModEventCard } from "../mod-manifest.js";

export const WORD_LIMIT = 1000;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** The `when: :long_content?` predicate. */
export const wordCountModEventPredicates = {
  "long_content?": (card: ModEventCard): boolean => wordCount(card.dbContent ?? "") > WORD_LIMIT,
} as const;

export default defineMod("card-mod-word_count", { group: "custom" }, ({ set }) => {
  // set/all/word_count.rb
  set("all/word_count", ({ format }) => {
    format("html", ({ view }) => {
      view("word_count", { cache: "never" }, (ctx) => {
        const count = wordCount(ctx.fmt.renderRaw());
        return `<span class="word-count">${count} words</span>`;
      });
    });
  });

  // set/type/basic.rb
  set("type/basic", ({ event }) => {
    event(
      "note_long_content",
      "integrate",
      { on: "save", changed: "db_content", when: "long_content?" },
      (card) => {
        console.info(`${card.name} is over the word limit`);
      },
    );
  });
});
```

What each part becomes:

1. `set("all/word_count", ...)` is the set module `All::WordCount`; the view
   is registered for every card's HTML format with `cache: "never"`.
2. `set("type/basic", ...)` is `Type::Basic`; the event is recorded at the
   `integrate` stage for creates and updates that change the content, and
   runs only when `long_content?` answers true.
3. The predicate table is the port of the `long_content?` card method. Add it
   to `defaultDeckEventPredicates` in `default-mod-deck.ts` so the deck's
   event runtime can resolve the name.

To load the mod, give it to a `ModLoader` with the rest of the deck. A
deck-local mod goes in a deck mod directory, after the gem mods:

```ts
import { ModLoader } from "../mod-loader.js";
import { defaultDeckSources, portedBundleOrder } from "./default-mod-deck.js";
import cardModWordCount from "./mods/card-mod-word_count.js";

const loader = new ModLoader([...defaultDeckSources(), { manifest: cardModWordCount }]);
loader.resolveOrder({
  gemMods: portedBundleOrder(),
  deckModDirs: [{ listing: ["word_count"] }],
});
loader.load();
```

A gem mod is listed in `MANIFESTS` and `ORACLE_BUNDLE_ORDER` in
`default-mod-deck.ts` instead, at its position in the bundle.

## Checking a mod

- `ModLoader.load()` returns a report of the set modules, views and settings
  it registered; `setModules()`, `viewConfigFor(view)`, `eventRegistry()` and
  `cardAccessorDeclarations()` show where each registration landed.
- `tests/card/mod-loader/mod-dsl.test.ts` pins what each DSL call compiles to.
- A mod that ports a Ruby mod is held to Ruby's bytes: its tests compare
  against output captured from Ruby Decko, and the reference harness grades
  the whole deck (`reference-harness/SPEC.md`). Converting a hand-written
  manifest to `defineMod` must leave both unchanged; the four converted mods
  were checked that way (their existing tests unchanged, synthetic-v1
  rendering 1754/1754, measured 2026-10-14 with
  `node reference-harness/runner/run.mjs --adapter
  reference-harness/adapters/ts/adapter.json --fixture
  reference-harness/fixtures/synthetic-v1 --out tmp/g` followed by
  `node reference-harness/runner/grade.mjs --fixture
  reference-harness/fixtures/synthetic-v1 --actual tmp/g`).
