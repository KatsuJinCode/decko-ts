// src/card/request-context.ts
//
// PER-REQUEST ENGINE STATE. Three pieces of engine state are process-global:
// the sync name environment (name/environment.ts), the name memos of an open
// request scope (DeckoName.beginRequestScope), and the boot bundle
// (render/boot-cache.ts). Two renders that interleave across awaits would
// read each other's, so the edge used to run one render at a time per
// isolate (withIsolateRenderLock).
//
// runInRequestContext gives one async call tree its own copy of all three,
// carried by AsyncLocalStorage: every await inside it, however deeply nested,
// sees the same context, and code outside any context keeps using the
// process-global state exactly as before. Where the runtime has no
// AsyncLocalStorage, requestContextAvailable() is false and callers keep
// serializing renders.
//
// AsyncLocalStorage is looked up at run time (a global, as workerd provides
// it, or node:async_hooks through process.getBuiltinModule), never imported,
// so a runtime without it still loads the bundle.

import type { NameEnvironment } from "./name/environment.js";

/** The name memos of an open request scope (DeckoName.beginRequestScope). */
export interface NameScopeState {
  depth: number;
  markMemo?: Map<string, unknown>;
  parseMemo?: Map<string, unknown>;
  scopedMemos?: WeakMap<object, Map<string, unknown>>;
}

export interface RequestContext {
  environment: NameEnvironment | undefined;
  readonly nameScope: NameScopeState;
  bootBundle: unknown;
}

interface AlsLike<T> {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
}

function findAsyncLocalStorage(): (new () => AlsLike<RequestContext>) | undefined {
  const g = globalThis as {
    AsyncLocalStorage?: new () => AlsLike<RequestContext>;
    process?: { getBuiltinModule?: (id: string) => { AsyncLocalStorage?: new () => AlsLike<RequestContext> } | undefined };
  };
  if (typeof g.AsyncLocalStorage === "function") return g.AsyncLocalStorage;
  try {
    const mod = g.process?.getBuiltinModule?.("node:async_hooks");
    if (typeof mod?.AsyncLocalStorage === "function") return mod.AsyncLocalStorage;
  } catch {
    /* no async_hooks on this runtime */
  }
  return undefined;
}

const Als = findAsyncLocalStorage();
let storage: AlsLike<RequestContext> | undefined = Als === undefined ? undefined : new Als();
// A runtime with node:async_hooks but neither of the above (Deno before
// process.getBuiltinModule) is asked once, asynchronously, at load. The
// specifier is not a literal, so bundlers leave it alone and a runtime
// without the module just keeps serializing renders.
if (storage === undefined) {
  const specifier = ["node", "async_hooks"].join(":");
  import(/* @vite-ignore */ specifier).then(
    (m: { AsyncLocalStorage?: new () => AlsLike<RequestContext> }) => {
      if (storage === undefined && typeof m?.AsyncLocalStorage === "function") storage = new m.AsyncLocalStorage();
    },
    () => undefined,
  );
}

/** True when renders can run concurrently, each in its own context. */
export function requestContextAvailable(): boolean {
  return storage !== undefined;
}

/** The context of the running request, or undefined outside one. */
export function currentRequestContext(): RequestContext | undefined {
  return storage?.getStore();
}

/** Run `fn` in a fresh context whose name environment starts as the one
 *  visible to the caller, with no name scope open and no boot bundle. Without
 *  AsyncLocalStorage this just runs `fn` (the caller serializes). */
export function runInRequestContext<T>(environment: NameEnvironment | undefined, fn: () => Promise<T>): Promise<T> {
  if (storage === undefined) return fn();
  const ctx: RequestContext = { environment, nameScope: { depth: 0 }, bootBundle: undefined };
  return storage.run(ctx, fn);
}
