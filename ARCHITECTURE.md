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
- **Formats** (HTML, JSON, text, CSS, ...) each own a set of **views**. Views
  are registered per set, so the view a card renders depends on which sets it
  belongs to. A page is the layout card's content with the requested card
  nested into it.

---

## Layout of the source

`src/card/` mirrors Ruby's `card/lib/card/` directory for directory:

| TypeScript | Ruby | What it does |
|---|---|---|
| `name/`, `name.ts` | `cardname` gem, `card/name/` | names, keys, inflection, the lexicon |
| `fetch/`, `fetch.ts` | `card/fetch/` | loading card rows from storage |
| `set-patterns/`, `set-patterns.ts` | `card/set/` | set patterns and set membership |
| `rules/` | `card/rule/` | rule lookup by set specificity |
| `permissions/`, `auth/` | `card/auth/`, `card/permission/` | actors, sign-in, sessions, permission rules |
| `render/`, `render.ts` | `card/format/`, `card/view/` | formats, views, nesting, page assembly |
| `content/`, `actions/` | `card/content/`, `card/act/` | parsing content; writes and their events |
| `history/` | `card/history/` | acts, actions and changes |
| `mod-loader/`, `mod-loader.ts` | `card/mod/`, the `card-mod-*` gems | loading mods and registering their sets and views |
| `follow/`, `notify/` | `card-mod-follow`, mailers | following cards and notification mail |
| `attachments/`, `assets/` | `card-mod-carrierwave`, `card-mod-assets` | file and image cards, compiled assets |
| `live/` | none | the request-local row store (see below) |
| `one-trip/` | none | rendering a page in one storage round trip (see below) |

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
4. **Choose the view.** The view for the card is resolved from the sets it
   belongs to and the format requested.
5. **Render and nest.** The view's output is produced; each nest repeats steps
   2 to 5 for the nested card, with its own permissions and view.
6. **Wrap.** The layout card's content is rendered with the main card nested
   into it.

### Request-local state only

Nothing that depends on deck content is kept between requests. Within one
request, `src/card/live/request-store.ts` holds the rows that request has
fetched, and `store-row-evaluator.ts` answers a later statement from those rows
only when it can prove they are the complete result; otherwise the statement
goes to storage. `tests/deploy/no-caching-decision-state.test.ts` checks that
permission verdicts, rule resolutions and search results do not carry over
from one request to the next.

### One round trip per page

A naive render issues one query per nest level, which on an edge database
means hundreds of network round trips per page. `src/card/one-trip/` computes
the rows a page needs (its closure) ahead of rendering and fetches them in a
few batched statements. It is a performance path, not a semantic one: the page
must be byte-identical with and without it, and the tests compare both.

---

## Mods

Ruby Decko's behaviour lives mostly in mods (`card-mod-*` gems). Each ported
mod is a module under `src/card/mod-loader/mods/` that registers, for its
sets, the views, events and settings the Ruby mod defines. The loader applies
them in Ruby's load order so that later mods override earlier ones in the
same way. A generator compares each mod's declared views, set modules, events
and settings against what the registry implements, and reports a per-mod
verdict; see `tools/compat-report/`.

---

## Storage

The engine never imports a vendor SDK. It talks to two interfaces.

**SQL** (`src/server/driver.ts`). Adapters: Cloudflare D1, libSQL over HTTP
(Bunny Database), and local SQLite. They are held to one conformance suite
(`tests/server/drivers/`), including byte parity of the rendered output across
adapters.

**Blob storage** (`src/blob/driver.ts`). `put`, `get`, `getBytes`, `head`,
`delete` and `list`, over POSIX-style keys validated in one place
(`assertBlobKey`). Adapters: memory, filesystem, Cloudflare R2 and Bunny
Storage, all held to the shared suite in `tests/server/blob-conformance.ts`.
The filesystem adapter uses Ruby's own `files/` layout
(`<card_id>/<action_id><ext>`) as its key space, so an existing Ruby deck's
files directory is read without conversion.

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
