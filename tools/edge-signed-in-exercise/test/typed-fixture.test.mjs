import{test}from'node:test';import assert from'node:assert/strict';import Database from'better-sqlite3';
import{fixtureType}from'../lib/typed-fixture.mjs';
test('fixture labels resolve canonical types and never substitute an ordinary Basic card',()=>{
 const db=new Database(':memory:');try{
  db.exec('CREATE TABLE cards(id INTEGER,name TEXT,codename TEXT,type_id INTEGER,trash INTEGER DEFAULT 0)');
  const put=db.prepare('INSERT INTO cards(id,name,codename,type_id) VALUES (?,?,?,?)');
  put.run(5,'Cardtype','cardtype',5);put.run(3,'RichText','basic',5);put.run(40,'basic',null,3);put.run(50,'Pointer','pointer',5);put.run(60,'Owned Custom',null,5);
  assert.equal(fixtureType(db,'Basic').id,3);assert.equal(fixtureType(db,'RichText').id,3);
  assert.equal(fixtureType(db,'Pointer').id,50);assert.equal(fixtureType(db,'Owned Custom').id,60);
  assert.throws(()=>fixtureType(db,'Unavailable Type'),/unavailable/);
  put.run(70,'Not A Type',null,3);assert.throws(()=>fixtureType(db,'Not A Type'),/unavailable/);
 }finally{db.close()}
});
