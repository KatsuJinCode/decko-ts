import { describe, expect, it } from 'vitest';
import { LiveStoreDriver } from '../../../src/card/live/live-store-driver.js';
import { CARDS_COLUMNS } from '../../../src/card/live/store-row-evaluator.js';
import { LocalSqliteDriver } from '../../../src/server/drivers/local-sqlite.js';
import type { SQLDatabaseDriver, SQLQueryResult } from '../../../src/server/driver.js';

describe('identity reads do not demand unrelated content', () => {
  for (const identityRing of [false, true]) it(`keeps name lookup local and later fetches actual content (identity ring ${identityRing})`, async () => {
    const db = new LocalSqliteDriver({ path: ':memory:' });
    const marker = 'UNREQUESTED_CHILD_CONTENT';
    const observed: unknown[] = [];
    const base: SQLDatabaseDriver = {
      async query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
        const result = await db.query<T>(sql, params); observed.push(result.rows); return result;
      },
      async batch(statements) {
        const result = await db.batch(statements); observed.push(result.map(row => row.rows)); return result;
      },
    };
    const live = new LiveStoreDriver(base, { compact: true, identityRing });
    try {
      await db.query(`CREATE TABLE cards (${CARDS_COLUMNS.map(column => `${column} ${/_id$|^id$|^trash$|references_expired/.test(column) ? 'INTEGER' : 'TEXT'}`).join(', ')})`, []);
      await db.query(`INSERT INTO cards(id,name,key,type_id,left_id,right_id,trash,db_content) VALUES
        (1,'Anchor','anchor',3,NULL,NULL,0,''), (2,'Other','other',3,NULL,NULL,0,'other body'),
        (3,'Type','type',3,NULL,NULL,0,''), (20,NULL,NULL,3,1,3,0,?)`, [marker]);
      const name = 'SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1';
      expect((await live.query(name, [1])).rows).toEqual((await db.query(name, [1])).rows);
      // Exercise the memoized certified-answer path too.
      expect((await live.query(name, [1])).rows).toEqual((await db.query(name, [1])).rows);
      const full = 'SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1';
      expect((await live.query(full, [2])).rows).toEqual((await db.query(full, [2])).rows);
      expect(JSON.stringify(observed)).not.toContain(marker);
      // Reading the anchor whole may now expand its content/field frontier.
      expect((await live.query(full, [1])).rows).toEqual((await db.query(full, [1])).rows);
      expect((await live.query(full, [20])).rows).toEqual((await db.query(full, [20])).rows);
      expect(JSON.stringify(observed)).toContain(marker);
    } finally { live.close(); db.close(); }
  });
});
