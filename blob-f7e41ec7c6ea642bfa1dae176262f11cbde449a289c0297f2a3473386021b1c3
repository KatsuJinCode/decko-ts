// src/server/transaction-statement-scope.ts
//
// TRANSACTION ATTRIBUTION FOR DRIVER STATEMENTS. The SQL drivers share one
// connection or Hrana stream across everything that uses the driver object,
// and a driver cannot tell from a query's text WHO is asking: a statement
// issued by the save running inside driver.transaction(work) must join that
// transaction, but the SAME statement shape issued by an unrelated request
// while the transaction happens to be open must NOT — until this module
// existed, it did join (bunny-db.ts sent it on the transaction's stream;
// LocalSqliteDriver executed it on the transaction's connection), so an
// unrelated request's acknowledged standalone write — the session row a
// sign-in just answered 200 for — was rolled back by a save it never
// belonged to, and its reads saw another request's uncommitted rows.
// Measured repro: tests/card/actions/write-path-races.test.ts ("a standalone
// write that lands inside another request's open save transaction").
//
// transaction() marks the async call tree it spawns with AsyncLocalStorage;
// every statement issued inside that tree — however deeply nested across
// awaits — is attributable to the transaction. A statement issued outside
// any transaction tree is attributable as a standalone statement, and the
// drivers route it accordingly (Bunny: its own pipeline read, or queued
// behind the open transaction as its own unit for writes; Local: queued
// behind the open transaction on the gate). Where the runtime has no
// AsyncLocalStorage, attribution is impossible: inTransactionStatementScope()
// returns undefined and the drivers keep the historical shared-object
// coupling, as documented in src/server/driver.ts.
//
// AsyncLocalStorage is looked up at run time (a global, as workerd provides
// it, or node:async_hooks through process.getBuiltinModule), never imported,
// so a runtime without it still loads the bundle — the same pattern as
// src/card/request-context.ts.

interface TransactionScope {
  /** True while the attributed statement tree belongs to an open
   *  driver.transaction(work) call. */
  active: boolean;
}

interface AlsLike<T> {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
}

function findAsyncLocalStorage(): (new () => AlsLike<TransactionScope>) | undefined {
  const g = globalThis as {
    AsyncLocalStorage?: new () => AlsLike<TransactionScope>;
    process?: { getBuiltinModule?: (id: string) => { AsyncLocalStorage?: new () => AlsLike<TransactionScope> } | undefined };
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
const storage: AlsLike<TransactionScope> | undefined = Als === undefined ? undefined : new Als();

/**
 * Whether the running statement belongs to a driver.transaction(work) call
 * tree. Three answers:
 *   - true  — the statement is part of the open transaction and must join it
 *     (ride its stream / connection);
 *   - false — the statement is standalone relative to every transaction this
 *     driver object could have open (all transactions open through
 *     transaction(), which marks its tree), and the driver must not couple it
 *     to the open transaction;
 *   - undefined — this runtime has no AsyncLocalStorage, so attribution is
 *     impossible; drivers keep the historical coupling.
 */
export function inTransactionStatementScope(): boolean | undefined {
  if (storage === undefined) return undefined;
  return storage.getStore()?.active === true;
}

/** Run `fn` marked as transaction work: every statement it issues, across
 *  every await, attributes to the transaction. Where the runtime has no
 *  AsyncLocalStorage this just runs `fn` (and attribution stays
 *  impossible). */
export function runInTransactionStatementScope<T>(fn: () => Promise<T>): Promise<T> {
  if (storage === undefined) return fn();
  const scope = { active: true };
  return storage.run(scope, async () => {
    try { return await fn(); }
    finally { scope.active = false; }
  });
}
