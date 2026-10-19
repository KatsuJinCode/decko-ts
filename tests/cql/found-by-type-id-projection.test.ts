import {expect,it} from 'vitest';
import {createFetchTestStorage,seedCard} from '../card/fetch/fetch-test-storage.js';
import {executeQuery} from '../../src/cql/execute.js';
import type {SQLDatabaseDriver,SQLQueryResult} from '../../src/server/driver.js';

async function fixture(){
 const storage=await createFetchTestStorage();
 await seedCard(storage,{id:5,name:'Cardtype',codename:'cardtype',typeId:5});
 await seedCard(storage,{id:2,name:'Basic',codename:'basic',typeId:5});
 await seedCard(storage,{id:10,name:'Note',typeId:5});
 await seedCard(storage,{id:200,name:'Search',codename:'search_type',typeId:5});
 await seedCard(storage,{id:201,name:'Set',codename:'set',typeId:5});
 await seedCard(storage,{id:202,name:'*type',codename:'type',typeId:2});
 await seedCard(storage,{id:305,name:'Note+*type',leftId:10,rightId:202,typeId:201,dbContent:''});
 await seedCard(storage,{id:101,name:'Alpha',typeId:10,dbContent:'needle '+ 'a'.repeat(100000)});
 await seedCard(storage,{id:102,name:'Beta',typeId:10,dbContent:'plain '+ 'b'.repeat(100000)});
 await seedCard(storage,{id:103,name:'Trashed',typeId:10,trash:true});
 const queries:{sql:string;fields:string[][]}[]=[];
 const driver:SQLDatabaseDriver={query:async<T>(sql:string,params:unknown[]):Promise<SQLQueryResult<T>>=>{const r=await storage.driver.query<T>(sql,params);queries.push({sql,fields:r.rows.map(row=>Object.keys(row as object))});return r},batch:statements=>storage.driver.batch(statements)};
 const ids:Record<string,number>={Cardtype:5,Note:10,Search:200,'Note+*type':305,'Type Query':300,'Match Query':301,'Group Query':302,'Empty Query':303,'Nested Query':304};
 const options={parse:{resolveCardId:(name:string)=>ids[name]},matchPostFilter:true};
 async function search(id:number,name:string,statement:unknown){await seedCard(storage,{id,name,typeId:200,dbContent:JSON.stringify(statement)})}
 const members=()=>queries.filter(q=>/c0\.type_id = \?/.test(q.sql));
 async function run(name:string,extra:Record<string,unknown>={}){const r=await executeQuery(driver,{found_by:name,sort:'name',...extra},options);if(!('rows'in r))throw Error('Expected membership rows');return r.rows.map(row=>row.id)}
 return{storage,queries,members,search,run};
}

it('fetches only the complete ID set for a scalar type target while root paging and trash filtering stay intact',async()=>{
 const f=await fixture();try{await f.search(300,'Type Query',{type_id:10,limit:1,offset:99,return:'content',sort:'name'});
 expect(await f.run('Type Query',{limit:1,offset:1})).toEqual([102]);
 expect(f.members()).toHaveLength(1);expect(f.members()[0].fields).toEqual([['id'],['id']]);
 }finally{f.storage.close()}
});
it('applies the same narrow projection to a Cardtype target and a contextual scalar type name',async()=>{
 const f=await fixture();try{expect(await f.run('Note')).toEqual([101,102]);expect(await f.run('Note+*type')).toEqual([101,102]);await f.search(300,'Type Query',{type:'Note'});expect(await f.run('Type Query')).toEqual([101,102]);expect(f.members().every(q=>q.fields.every(fields=>fields.length===1&&fields[0]==='id'))).toBe(true)}finally{f.storage.close()}
});
it('keeps full content for match post-filter targets instead of dropping their matching rows',async()=>{
 const f=await fixture();try{await f.search(301,'Match Query',{type_id:10,match:'needle'});expect(await f.run('Match Query')).toEqual([101]);expect(f.members().some(q=>q.fields.some(fields=>fields.includes('db_content')))).toBe(true)}finally{f.storage.close()}
});
it('leaves grouped target projection unchanged',async()=>{
 const f=await fixture();try{await f.search(302,'Group Query',{type_id:10,group:'c0.type_id'});expect(await f.run('Group Query')).toHaveLength(1);expect(f.members().some(q=>q.fields.some(fields=>fields.includes('db_content')))).toBe(true)}finally{f.storage.close()}
});
it('preserves empty membership refusal and nested found_by intersections',async()=>{
 const f=await fixture();try{await f.search(303,'Empty Query',{type_id:999});expect(await f.run('Empty Query')).toEqual([]);await f.search(300,'Type Query',{type_id:10});await f.search(304,'Nested Query',{found_by:'Type Query',id:102});expect(await f.run('Nested Query')).toEqual([102])}finally{f.storage.close()}
});
