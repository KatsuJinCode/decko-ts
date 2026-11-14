import { expect, it } from 'vitest';
import { LocalSqliteDriver } from '../../src/server/drivers/local-sqlite.js';
import { inTransactionStatementScope, runInTransactionStatementScope } from '../../src/server/transaction-statement-scope.js';

for (const rejects of [false, true]) it(`retires escaped async work after transaction ${rejects ? 'rejection' : 'completion'}`, async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let escaped!: Promise<boolean | undefined>;
  await runInTransactionStatementScope(async () => {
    expect(inTransactionStatementScope()).toBe(true);
    escaped = (async () => { await gate; return inTransactionStatementScope(); })();
    if (rejects) throw Error('rollback');
  }).catch(error => { if (!rejects) throw error; });
  release();
  expect(await escaped).toBe(false);
});

it('late work from a finished transaction cannot join and be rolled back by the next transaction', async () => {
  const driver = new LocalSqliteDriver({ path: ':memory:' });
  let releaseLate!: () => void, releaseNext!: () => void, startedNext!: () => void;
  const lateGate = new Promise<void>(resolve => { releaseLate = resolve; });
  const nextGate = new Promise<void>(resolve => { releaseNext = resolve; });
  const nextStarted = new Promise<void>(resolve => { startedNext = resolve; });
  let late!: Promise<unknown>, next: Promise<unknown> | undefined;
  let lateAnswered = false;
  try {
    await driver.query('CREATE TABLE proof (tag TEXT)', []);
    await driver.transaction(async () => {
      late = (async () => {
        await lateGate;
        await driver.query("INSERT INTO proof VALUES ('independent late write')", []);
        lateAnswered = true;
      })();
    });
    next = driver.transaction(async () => {
      await driver.query("INSERT INTO proof VALUES ('next transaction rolls back')", []);
      startedNext();
      await nextGate;
      throw Error('next rollback');
    });
    await nextStarted;
    releaseLate();
    await new Promise<void>(resolve => setImmediate(resolve));
    const answeredInsideNext = lateAnswered;
    releaseNext();
    await next.catch(() => undefined);
    await late;
    expect((await driver.query('SELECT tag FROM proof', [])).rows).toEqual([{ tag: 'independent late write' }]);
    expect(answeredInsideNext).toBe(false);
  } finally {
    releaseLate?.(); releaseNext?.();
    await Promise.allSettled([late, next].filter(Boolean));
    driver.close();
  }
});
