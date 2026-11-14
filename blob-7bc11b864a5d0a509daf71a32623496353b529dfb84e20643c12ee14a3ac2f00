# The `setup` before_action, host by host: where each of its three actions lands

**Register row:** `register-routes B6` — "`setup` before_action (`rest.rb:31-35`):
cache renew + asset refresh + Env.reset".

This file is the disposition for B6. The three actions all exist in this
port, but not as a method named `setup` and not at one call site — they are
split across the two serving hosts and the engine's per-request machinery.
A reader checking for `rest.rb`'s three lines finds no `setup`, so the row
reads as unported. This document is the mapping, and it is also where the
part that is genuinely NOT equivalent is written down.

## Ruby's source

`decko-0.20.0 lib/card_controller/rest.rb:31-35`, a private before_action on
the only controller:

```ruby
def setup
  Card::Cache.renew
  Card::Assets.refresh unless params[:explicit_file]
  Card::Env.reset self
end
```

Three actions, in that order, before `authenticate`, `load_mark` and
`load_card` (rest.rb:37-54) run.

## The three actions in this port

### 1. `Card::Cache.renew` — STRUCTURALLY EQUIVALENT, split in two

`card-1.110.0 lib/card/cache/class_methods.rb:20-36` resets the counter,
renews the shared cache when one is configured, and calls `temp.reset` on
every per-class cache. The port has no single call with that name because
the two halves are separate concerns:

- **The per-request memo reset.** `DeckoName.beginRequestScope` opens the
  per-request name memo (`src/card/request-context.ts`, the
  `NameScopeState` there); the edge host enters that scope through
  `runInRequestContext` at each render entry
  (`deploy/bunny-worker-src/bunny-edge-engine-request.ts:580, 625, 1003-1004,
  1197, 1230`). This is the analogue of `cache.temp.reset` — memoized work
  that must not survive the request boundary.
- **The session-committed chrome reset.** `resetRequestSession`
  (`src/card/render.ts:8251-8268`) blanks the prepared chrome and the
  `ensure_roles` fill state, so the next render is the session's FIRST
  render. Its own doc comment names the correspondence: "The harness's
  fresh-process boundary (the Ruby rigs' Cache.renew)".

**Not equivalent, and named:** Ruby's `renew_shared` reaches every process
of a deployed site through the shared cache. This port keeps the shared
marker in one host process (or one isolate), so a multi-isolate edge does
not share it. The same limit is already stated for the asset refresh below
(`src/card/actions/asset-read-refresh.ts`, module header) and is inherent
to running the engine in isolates rather than in one long-lived process.

### 2. `Card::Assets.refresh unless params[:explicit_file]` — PORTED, with the mode semantics

`src/card/actions/asset-read-refresh.ts` is the whole of it, including the
gate that makes the row non-trivial: `Card::Assets.refresh` returns unless
`force || refresh?` (card-mod-assets `lib/card/assets.rb:13-14`), and
`refresh?` reads `Cardio.config.asset_refresh`:

| `Cardio.config.asset_refresh` | behavior | Ruby source |
| --- | --- | --- |
| `:eager` | refresh every request | `development.rb:10` only |
| `:never` | never | — |
| `:cautious` | refresh once, writing a REFRESHED marker to the shared cache | `railtie.rb:34` — a deployed site |

A deployed Decko runs `:cautious`, and the port's default is `:cautious`
with the marker held per host process.

**Where it runs, per host — this is the part that is NOT equivalent:**

- **Staging wires it.** `vm-staging-server.mjs:255` imports
  `createReadAssetRefresh`, `:645` constructs it from
  `DECKO_ASSET_REFRESH` (default `"cautious"`, validated at `:641-643`),
  and `:4131-4140` calls `beforeRead` before a card read renders. The
  `explicit_file` argument is hard-coded `false` there, because the host
  excludes `/files/...` from the arm outright (`:4130`).
- **The edge does NOT wire it.** `grep -rn "beforeRead\|createReadAssetRefresh"
  deploy/` returns nothing. So on the edge, Ruby would refresh the asset
  inputs once per cache lifetime and this port does not refresh them at
  all. This is a real gap on the serving host, not a naming difference.

**Disposition for that half:** the ACTION is ported and correct; its
EDGE WIRING is absent. Closing B6 completely needs `beforeRead` called from
the edge request core on the same card-request condition staging uses. That
is left undone here and named rather than claimed — see the status line in
this file's header commit.

### 3. `Card::Env.reset self` — STRUCTURALLY EQUIVALENT

`Card::Env.reset controller` (card-1.110.0 `lib/card/env.rb`) rebinds the
process-global environment to the current controller's request, params and
session. The port's shape is `runInRequestContext` +
`installNameEnvironment`:

- `runInRequestContext` (`src/card/request-context.ts`) gives one async call
  tree its own name environment, name memos and boot bundle, carried by
  `AsyncLocalStorage` — the "process-global state becomes this request's"
  effect `Env.reset` has, scoped so concurrent requests cannot read each
  other's.
- `installNameEnvironment` (`src/card/fetch.ts`) installs the engine's
  lexicon and codename adapters and `Card::Name.session`. It carries the
  request's own `Card::Env.main_name` forward, because that value is the
  REQUEST's (rest.rb:63-66) and the edge's live render re-installs the
  engine half on every request.

## Summary

| Ruby's action | This port | Equivalent? |
| --- | --- | --- |
| `Card::Cache.renew` | `beginRequestScope` + `resetRequestSession` | Yes, except the shared-cache cross-process marker (isolate limit, shared with row 2) |
| `Card::Assets.refresh unless explicit_file` | `createReadAssetRefresh(...).beforeRead` | Action yes; **staging wires it, the edge does not** |
| `Card::Env.reset self` | `runInRequestContext` + `installNameEnvironment` | Yes |

So B6 is structural-equivalent on staging and incomplete on the edge for one
of its three actions. This document does not close the row on the edge; it
records exactly what is equivalent and what is not, so the next reader does
not have to re-derive it from three files.