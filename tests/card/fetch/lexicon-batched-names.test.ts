import {expect,it} from 'vitest';
import {DbLexicon} from '../../../src/card/fetch/lexicon.js';
import {CardCache} from '../../../src/card/fetch/cache.js';
import {DeckoName} from '../../../src/card/name.js';
import {createFetchTestStorage,seedCard,type FetchTestStorage} from './fetch-test-storage.js';
import type {SQLDatabaseDriver,SQLQueryResult,SQLStatement} from '../../../src/server/driver.js';

function observed(storage:FetchTestStorage,cache=new CardCache()) {
  const calls={single:0,batches:[] as number[]};
  const driver:SQLDatabaseDriver={
    query:async<T>(sql:string,params:unknown[]):Promise<SQLQueryResult<T>>=>{calls.single++;return storage.driver.query<T>(sql,params)},
    batch:async(statements:SQLStatement[])=>{calls.batches.push(statements.length);return storage.driver.batch(statements)},
  };
  return {lexicon:new DbLexicon(driver,cache),calls};
}

async function graph(storage:FetchTestStorage) {
  await seedCard(storage,{id:10,name:'Alpha'});
  await seedCard(storage,{id:11,name:'Beta',trash:true});
  await seedCard(storage,{id:12,name:'Alpha+Beta',leftId:10,rightId:11});
  await seedCard(storage,{id:13,name:'Gamma'});
  await seedCard(storage,{id:14,name:'Alpha+Beta+Gamma',leftId:12,rightId:13});
  await seedCard(storage,{id:15,name:'Legacy+Label',leftId:10,rightId:13});
  await storage.driver.query('UPDATE cards SET name=? WHERE id=?',['Legacy+Label',15]);
  await seedCard(storage,{id:16,name:'Alpha+Ghost',leftId:10,rightId:999});
}

it('batches the exact name-read shapes and preserves serial names for simple, compound, trashed, missing and legacy rows',async()=>{
  const storage=await createFetchTestStorage();
  try {
    await graph(storage);
    const ids=[14,10,11,15,16,999,14],serial=new DbLexicon(storage.driver,new CardCache());
    const expected=new Map<number,string|undefined>();for(const id of ids)expected.set(id,(await serial.name(id))?.s);
    const {lexicon,calls}=observed(storage);
    const result=await lexicon.names(ids);
    expect(new Map([...result].map(([id,name])=>[id,name?.s]))).toEqual(expected);
    expect(calls.single).toBe(0);expect(calls.batches.length).toBeGreaterThan(0);
    expect(result.get(14)?.s).toBe('Alpha+Beta+Gamma');expect(result.get(11)?.s).toBe('Beta');
    expect(result.get(16)?.s).toBe('Alpha+');expect(result.get(999)).toBeUndefined();
  }finally{storage.close()}
});

it('keeps held unsaved names and explicit temporary negatives ahead of storage, but never materializes an unheld shared miss',async()=>{
  const storage=await createFetchTestStorage();
  try {
    await graph(storage);await seedCard(storage,{id:999,name:'Now exists'});
    const backing=new Map<string,unknown>();
    const cache=new CardCache({sharedStore:{read:k=>backing.get(k),write:(k,v)=>{backing.set(k,v)},delete:k=>{backing.delete(k)},exist:k=>backing.has(k)},database:'batched-names'});
    const {lexicon,calls}=observed(storage,cache);
    lexicon.write(10,DeckoName.parse('Unsaved Alpha'),'Alpha');
    cache.temp.write('999',undefined);
    const first=await lexicon.names([14,999]);
    expect(first.get(14)?.s).toBe('Unsaved Alpha+Beta+Gamma');expect(first.get(999)).toBeUndefined();
    cache.temp.reset();cache.shared!.write('999',undefined);
    expect((await lexicon.names([999])).get(999)?.s).toBe('Now exists');
    expect(calls.single).toBe(0);
  }finally{storage.close()}
});

it('retains reverse-lookup cache write order instead of priming unused rows into that cache',async()=>{
  const storage=await createFetchTestStorage();
  try {
    await seedCard(storage,{id:10,name:'First',key:'first'});
    await seedCard(storage,{id:11,name:'Second',key:'second'});
    await storage.driver.query('UPDATE cards SET name=? WHERE id=?',['First',11]);
    await seedCard(storage,{id:12,name:'First+Second',leftId:10,rightId:11});
    const serial=new DbLexicon(storage.driver,new CardCache()),{lexicon}=observed(storage);
    for(const id of [11,12])await serial.name(id);
    await lexicon.names([11,12]);
    expect(await lexicon.id('First')).toBe(await serial.id('First'));
  }finally{storage.close()}
});

it('honors invalidation after a rename and never substitutes the durable old name',async()=>{
  const storage=await createFetchTestStorage();
  try {
    await graph(storage);const {lexicon}=observed(storage);
    await lexicon.names([14]);
    await storage.driver.query('UPDATE cards SET name=?,key=? WHERE id=?',['Renamed','renamed',10]);
    lexicon.deleteFor(10,'Alpha');
    expect((await lexicon.names([14])).get(14)?.s).toBe('Renamed+Beta+Gamma');
  }finally{storage.close()}
});

it('bounds batches and releases the temporary cache hold after returning a large result',async()=>{
  const storage=await createFetchTestStorage();
  try {
    const ids=Array.from({length:505},(_,i)=>100+i);
    for(const id of ids)await seedCard(storage,{id,name:'Card '+id});
    const cache=new CardCache({maxTemporaryKeys:4}),{lexicon,calls}=observed(storage,cache);
    const names=await lexicon.names(ids);
    expect(names.size).toBe(ids.length);expect(names.get(604)?.s).toBe('Card 604');
    expect(calls.single).toBe(0);expect(calls.batches.length).toBeGreaterThan(1);expect(Math.max(...calls.batches)).toBeLessThanOrEqual(500);
    expect(cache.temp.exist('100')).toBe(false);
  }finally{storage.close()}
});

it('releases its hold when storage fails',async()=>{
  const cache=new CardCache({maxTemporaryKeys:1});
  const driver:SQLDatabaseDriver={query:async()=>{throw Error('unexpected scalar')},batch:async()=>{throw Error('database unavailable')}};
  const lexicon=new DbLexicon(driver,cache);
  await expect(lexicon.names([10])).rejects.toThrow('database unavailable');
  cache.temp.write('a',1);cache.temp.write('b',2);cache.temp.write('c',3);
  expect(cache.temp.exist('a')).toBe(false);
});
