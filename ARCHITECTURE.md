# Architecture

How the decko-ts engine is organised, and how it maps onto the Ruby Decko
source it was ported from.

The guiding rule: **stay a faithful port.** Where Ruby Decko has a concept,
this codebase uses the same name, the same shape and the same semantics.
Deviating is a decision that has to be justified and written down, never a
default.

---

## The card model

Decko stores everything as **cards**: rows in a `cards` table with an `id`, a
`name`, a `key` (the normalised name used for lookup), a `type_id`, `db_content`
and a `trash` flag. A compound name such as `Book+author` is itself a card whose
`left_id` and `right_id` point at its two parts, so names form a tree and
nesting needs no separate adjacency table.

Everything else is built from cards:

- **Codenames** give stable identities to cards the engine depends on
  (`*read`, `*layout`, `Basic`), independent of their display names.
- **Sets** group cards by pattern: `*all`, a type (`Book+*type`), a single
  card (`Home+*self`), a right part (`author+*right`), a type and right part
  together (`Book+author+*type plus right`), and so on. Membership is computed
  from the card's name and type, never stored.
- **Rules** are cards named `<set>+<setting>`, for example `*all+*read` or
  `Book+*type+*structure`. To answer a setting for a card, the engine walks the
  card's sets from most to least specific and takes the first rule found.
  Permissions (`*read`, `*update`, `*create`, `*delete`) are rules like any
  other.
- **Nests** are references in content: `{{Card name}}` or
  `{{Card name|view: titled}}`. Rendering follows them recursively, each nested
  card under its own permissions, rules and view.
- **Formats** (HTML, JSON, text, CSS, ...) each own a set of **views**. A view
  is a plain function under a name — the registry is a flat
  `Record<string, ViewFn>` — and **this port does not register views per set
  and has no Ruby-style `view :foo do … end` DSL**; which view a card renders
  is decided by the resolution rules under "Views are a name→function
  registry" below. A page is the layout card's content with the requested card
  nested into it.

---

## Layout of the source

`src/card/` is **named after** Ruby's `card/lib/card/` and follows it where
the two trees genuinely correspond, but it is **not a directory-for-directory
mirror**, and it is not meant to be read as one. Three directories correspond
closely enough that the parallel is useful — `name/`, `fetch/` and `auth/` —
and the rest are named for the concept they carry rather than for a Ruby
directory that happens to hold it. `permissions/`, `render/`, `actions/` and
`set-patterns/` each cover ground Ruby splits across several files or gems;
`live/` and `one-trip/` have no upstream directory at all, because they are
this port's own machinery. Read the table as "what this directory is for",
not as a mapping a reader can rely on to find the Ruby original.

| TypeScript | Ruby | What it does |
|---|---|---|
| `name/`, `name.ts` | `cardname` gem, `card/name/` | names, keys, inflection, the lexicon |
| `fetch/`, `fetch.ts` | `card/fetch/` | loading card rows from storage |
| `auth/` | `card/auth/` | sign-in, sessions |
| `set-patterns/`, `set-patterns.ts` | `card/set/` | set patterns and set membership |
| `rules/` | `card/rule/` | rule lookup by set specificity |
| `permissions/` | `card/permission/` (and parts of `card-mod-permissions`) | permission rules; the read/write halves live with the auth and rules areas |
| `render/`, `render.ts` | `card/format/`, `card/view/` | formats, views, nesting, page assembly |
| `actions/` | `card/act/`, `card/content/` | writes and their events, plus content parsing (there is no `content/` directory here — content parsing and the write path are one area) |
| `history/` | `card/history/` | acts, actions and changes |
| `mod-loader/`, `mod-loader.ts` | `card/mod/`, the `card-mod-*` gems | loading mods and registering their sets and views |
| `follow/`, `notify/` | `card-mod-follow`, mailers | following cards and notification mail |
| `attachments/`, `assets/` | `card-mod-carrierwave`, `card-mod-assets` | file and image cards, compiled assets |
| `session/`, `pods/`, `drivers/`, `i18n/` | various | session state, pod import/export, engine drivers, locale strings |
| `live/` | none | the request-local row store (see below) |
| `one-trip/` | none | batching a page's fetches into a few round trips (see below) |

**How faithful each area is, and it is not uniform.** The **name layer is
line-faithful**: `name/inflect.ts` transcribes ActiveSupport's inflection rule
tables rather than reimplementing them, and `name.ts` ports `Cardname` and
`Card::Name` method for method, so a name this engine derives matches the one
Ruby derives by the same rules rather than by an equivalent outcome. The
**render/views layer is a re-implementation using Decko's vocabulary**: it
speaks Decko's nouns — views, formats, slots, nests, sets — and cites the Ruby
view each view came from, but a view here is a function in a record that
produces the captured bytes, not Ruby HAML compiled into set-module methods.
The port is therefore strongest where behaviour is arithmetic (names, keys,
inflection) and is a faithful re-derivation where behaviour is markup
(rendering), with the byte comparison against the oracle — not a structural
correspondence — as what holds the second kind to the first one's standard.

Outside `card/`:

| Path | What it does |
|---|---|
| `src/cql/` | CQL, Decko's card query language: parsing, SQL generation, matching |
| `src/server/` | the SQL driver interface (`driver.ts`), its adapters (`drivers/`), schema, and the request server's routes |
| `src/blob/` | the blob-storage driver interface (`driver.ts`) and its adapters |
| `src/testing/` | shared test helpers and corpus path resolution |
| `worker.ts` | the Cloudflare Worker entry point |
| `deploy/` | migrations, seeds, the edge entry points and their bundlers |
| `tools/oracle/` | the harness that captures Ruby output and grades the engine against it |

### File naming

Dashed-lowercase, tracking Ruby's snake_case: `store-row-evaluator.ts` sits
where a Ruby author would write `store_row_evaluator.rb`. This keeps the two
trees comparable by eye.

---

## The render pipeline

A page request, in order:

1. **Resolve the name.** The request path becomes a card name and key. Key
   derivation follows `cardname` exactly, including the deck's inflection
   settings (`src/card/name/inflect.ts`).
2. **Fetch.** Rows come from storage through the fetch layer
   (`src/card/fetch/`).
3. **Check permissions.** The `*read` rule for the card's sets decides whether
   the actor may see it. A denied main card renders Ruby's denial page with
   status 403.
4. **Choose the view.** The view for the card is resolved by the two layers
   below — a flat compiled table, plus a mod loader's set chain when one is
   bound — against the format requested.
5. **Render and nest.** The view's output is produced; each nest repeats steps
   2 to 5 for the nested card, with its own permissions and view.
6. **Wrap.** The layout card's content is rendered with the main card nested
   into it.

### What is request-local, and what is retained

Two kinds of state are kept, under different rules.

Within one request, `src/card/live/request-store.ts` holds the rows that
request has fetched, and `store-row-evaluator.ts` answers a later statement
from those rows only when it can prove they are the complete result; otherwise
the statement goes to storage. Nothing in that store outlives the request.

The engines that serve `/:card/:view` paths and signed-in actors are
long-lived, and they do keep state between requests: loaded card rows, the
name lexicon and resolved rules. Each request's render reads the deck's
data-version stamp once — a counter that database triggers advance on every
change to cards or references — and resets the retained state when the counter
has moved, so nothing retained is served past the write that invalidated it
(`src/card/render.ts`; a warm render's whole extra cost is that one stamp
read).

**The public proof is
`tests/deploy/no-caching-synthetic.test.ts`** — the same proofs on the
committed reference-harness synthetic deck rather than on an internal one, so
a clean clone can run it (`npm run test:no-caching-freshness`; it is also a
stage of `npm run release-check`). It installs
`deploy/migrations/0003-deck-data-version-stamp.sql` on its copy exactly as a
provisioned deck has the triggers, then makes each change through a SEPARATE
database connection, as another process's committed write would, and renders
again in the same process — the engine is told nothing, so whatever it kept
must notice by itself. It covers the anonymous bare-page path, the
`/:card/:view` path and the signed-in per-actor engine, and pins that a
signed-in render's verdicts never reach the next anonymous render.
`tests/deploy/no-caching-decision-state.test.ts` runs the same
two-requests-one-process shape on internal fixtures.

**What the stamp covers, and what it does not.** The triggers are on `cards`
and `card_references` only. That is the whole retained render surface — card
rows, the lexicon and resolved rules — so a stamp move invalidates everything
it is responsible for. It is not a stamp on every table the render reads: the
render also reads `card_actions` (the edit form's conflict tracker, and the
history views), and the write path can mutate `card_actions` on its own — a
reserved action row inserted with `card_id` NULL before its card exists
(`ActWriter.reserveAction`), the `action_type` / `super_action_id` patches, and
the draft clears. Every one of those rides inside a save that also writes
`cards`, so the stamp moves with it; but a `card_actions`-only mutation that
was a save's last write and changed no card would leave the stamp unmoved. The
migration file enumerates the uncovered writes and names the one retained
reader a stamp move is responsible for
(`deploy/migrations/0003-deck-data-version-stamp.sql`, "SCOPE, AND WHAT A
card_actions-ONLY WRITE DOES NOT BUMP"). Widening the triggers to
`card_actions` would close it at the cost of a write per action row — a
trade-off, not a comment, so it is not made here.

Platform-level response caches (`DECKO_EDGE_CACHE`, `DECKO_EDGE_GLOBAL_CACHE`)
are a separate, optional layer: off by default, and not relied on for
correctness by anything above.

### Round trips per page

A naive render issues one query per nest level, which on an edge database
means hundreds of network round trips per page. `src/card/one-trip/` computes
the rows a page needs (its closure) ahead of rendering and fetches them in
batched statements. The measured shape
([docs/scaling-comparison-deep-nesting.md](docs/scaling-comparison-deep-nesting.md),
pinned by `tests/card/render/deep-nesting-trip-attribution.test.ts`): a cold
render costs four fixed round trips plus one per level of nesting below the
root, however many cards each level holds — breadth costs nothing extra, so a
fan of 200 cards is 5 round trips. Ruby sends one query per card at every
depth. It is a performance path, not a semantic one: the page must be
byte-identical with and without it, and the tests compare both.

---

## Mods

Ruby Decko's behaviour lives mostly in mods (`card-mod-*` gems). Each ported
mod is a module under `src/card/mod-loader/mods/` that registers, for its
sets, the views, events and settings the Ruby mod defines. The loader applies
them in Ruby's load order so that later mods override earlier ones in the
same way. A generator compares each mod's declared views, set modules, events
and settings against what the registry implements, and reports a per-mod
verdict of declared-complete, partial or missing — a declaration-level
measure, not a behavior one (see `docs/decisions/0004-mods-compiled-into-the-view-registry.md`
for exactly what is and is not supported); see `tools/compat-report/`.

### Views are a name→function registry, and how they get chosen

**A view is a plain function under a name, not a set module.** The compiled
table is `HTML_VIEWS: Record<string, ViewFn>`
(`src/card/render/views.ts:6601`) — a flat map from `"title"`, `"closed"`,
`"header"` and the rest to `(ctx: ViewContext) => string`
(`src/card/render/format.ts:481`). There is no per-view class, no `View`
module to reopen, and no Ruby-style `view :foo do ... end` block: a view is a
value in a record, and behaviour that Ruby expresses by reopening a set
module is expressed here by a mod registering into that record.

Resolution has two layers (`RenderEngine.computeResolvedView`,
`src/card/render.ts:2311`), and which one answers depends on whether a mod
loader is bound to the engine:

1. **Per-set chain, when a loader is bound.** `loader.viewChain(setKeys,
   view, format)` walks the card's sets most-specific-first with format
   inheritance, and the first entry wins. This is the set-scoped dispatch
   Ruby gets from its set modules.
2. **The flat compiled table, when no loader is bound** — and as the base
   layer under the chain when one is. The table is the whole answer for a
   loader-less engine.

**The graded corpus harness binds no loader.** `modDeckBound()` is literally
`this.modLoader !== undefined` (`src/card/render.ts:2304`), and the corpus
runner never sets one — it builds its engine and registers replay handlers,
not a mod deck. The Bunny deployment host **does**: it calls
`defaultDeckLoader()` at boot, before constructing the render engine
(`deploy/bunny-worker-src/bunny-edge-deck-boot.ts:113`). So the corpus grade
exercises layer 2 and the deployed engine exercises both. A view that only
resolves through the chain is, by construction, not something the corpus
figure covers. The harness papers over the resulting gap for one case only —
`ensureCoreAdminRuntime` builds the core mod's admin runtime lazily for
engines with no bound loader, and says so at
`src/card/render.ts:5117-5124`.

### What the save path dispatches, and what it does not

The action engine walks a fixed set of stages, and **`:after_integrate` and
`:integrate_with_delay` are declared but not dispatched**. Both appear in
`ModEventStage` (`src/card/mod-loader/mod-manifest.ts:166-167`) and
`:integrate_with_delay` carries real declarations — card-mod-follow registers
at it (`src/card/mod-loader/mods/card-mod-follow.ts:1185`), card-mod-carrierwave
at it (`card-mod-carrierwave.ts:893`) — but `dispatchEventStage` is called
only for the stages the engine implements, and neither of those two is among
them. `integrate_with_delay` appears in exactly two places on the save path:
as a **filter** (`allHooks.filter((h) => h.stage !== "integrate_with_delay")`,
`src/card/actions/card-action-engine.ts:611`, which drops the delayed stage for
an upload) and as the `stage` value on the built-in follow-notify hook
(`src/card/notify/follow-notify.ts:115`). `:integrate` **is** dispatched, on
create, update and delete (`card-action-engine.ts:1348`, `:2035`, `:3178`).

The boundary this draws is the one the corpus grade sits on: a graded replay
never runs the save path at all, so a save-time event that exists only as a
declaration is invisible to it by construction. The full statement, with the
upstream file:line references, is
[`docs/decisions/0008-view-registry-and-directory-layout.md`](docs/decisions/0008-view-registry-and-directory-layout.md).

---

## Storage

The engine never imports a vendor SDK. It talks to two interfaces.

**SQL** (`src/server/driver.ts`). Adapters: Cloudflare D1, libSQL over HTTP
(Bunny Database), and local SQLite. They are held to one conformance suite
(`tests/server/drivers/`), including byte parity of the rendered output across
adapters.

**Which providers that suite actually runs against.** The claim is "held to
one suite", so the honest question is *where* it runs, and the answer has
three tiers:

| Provider | How the suite reaches it | What it proves |
| --- | --- | --- |
| Local SQLite (`better-sqlite3`) | a real file in a temp directory | the full suite, against a real database |
| libSQL over HTTP | an **in-process** mock Hrana v2 server (`tests/server/drivers/mock-hrana-server.ts`) that speaks the protocol | the adapter's wire behaviour against a protocol-faithful peer, without a hosted database |
| Cloudflare D1 | **miniflare**'s local D1 emulation (`tests/server/drivers/d1-miniflare.test.ts`, and the cross-adapter parity run) | the adapter against a local emulation of D1's API surface |

Cross-adapter byte parity runs all of the above plus `@libsql/client`'s
file: URL driver, over one deck of operations, and compares the resulting
transcript to a hash pinned in the test
(`tests/server/drivers/cross-adapter-byte-parity.test.ts:99-145`).

**Not run: the hosted providers.** Neither Bunny Database nor Cloudflare D1
is reached over the network by any committed suite. A pass here is a pass
against local SQLite, an in-process mock, and a local emulation — it is not
evidence about a hosted deployment's behaviour, latency, or limits. That is
a deliberate consequence of the suite running on a clean checkout with no
credentials; the hosted paths are exercised in deployment, not in CI.

**Blob storage** (`src/blob/driver.ts`). `put`, `get`, `getBytes`, `head`,
`delete` and `list`, over POSIX-style keys validated in one place
(`assertBlobKey`). Adapters: memory, filesystem, Cloudflare R2 and Bunny
Storage, all held to the shared suite in `tests/server/blob-conformance.ts`.
The filesystem adapter uses Ruby's own `files/` layout
(`<card_id>/<action_id><ext>`) as its key space, so an existing Ruby deck's
files directory is read without conversion.

The blob side has the same shape as the SQL side, and the same limit: R2 runs
under miniflare's local emulation (`tests/server/blob-r2-miniflare.test.ts`)
and Bunny Storage against an in-process mock
(`tests/server/blob-bunny-mock.test.ts`). **The blob suite proves interface
conformance for R2 and Bunny Storage; it does not prove hosted-provider
behaviour**, for the same reason. Cross-adapter parity
(`tests/server/blob-cross-adapter-parity.test.ts`) closes the gap the shared
suite cannot — each adapter runs one deck of operations and the transcript is
hashed — but again over local implementations.

---

## Testing approach

Parity is tested by byte comparison against output captured from a running
Ruby Decko. There are no snapshot tests: nothing records the engine's own
output and compares it to itself. See docs/TESTING.md for
what runs on a clean clone and what needs data that is not redistributed.

---

## Relationship to upstream

This is a derivative work of [decko-commons/decko](https://github.com/decko-commons/decko),
licensed GPL-3.0-or-later, targeting `card` 1.110.0 and `decko` 0.20.0. Its
authors are credited in [NOTICE](NOTICE). The record of what was ported from
which upstream file, and what is deliberately different, lives in the source
comments: every module under `src/` names the Ruby file its area was ported
from. See [docs/README.md](docs/README.md) for the decisions that shape the engine
and how its parity is measured.
