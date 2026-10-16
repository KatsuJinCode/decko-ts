import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
import { PostgresDriver } from '../../../src/server/drivers/postgres.js';
import { lexQuery } from '../../../src/card/fetch/lexicon.js';
import { findTrashedKeyObstacle } from '../../../src/card/actions/name-validation.js';

it('live and trashed drifted ASCII keys resolve on actual PostgreSQL', async () => {
 const driver=new PostgresDriver({client:await PGlite.create()});
 try{
  await driver.query('CREATE TABLE cards (id INTEGER PRIMARY KEY, key TEXT, trash INTEGER)',[]);
  await driver.query('INSERT INTO cards (id,key,trash) VALUES (?,?,?)',[1,'DRIFTED_NAME',0]);
  await driver.query('INSERT INTO cards (id,key,trash) VALUES (?,?,?)',[2,'TRASHED_NAME',1]);
  const query=lexQuery('Drifted Name');
  expect((await driver.query<{id:number}>('SELECT id FROM cards WHERE '+query.sql+' AND trash = 0',query.params)).rows.map(r=>r.id)).toEqual([1]);
  expect((await findTrashedKeyObstacle(driver,'trashed_name'))?.id).toBe(2);
 }finally{await driver.close()}
});
