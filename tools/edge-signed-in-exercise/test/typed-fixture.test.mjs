import{test}from'node:test';import assert from'node:assert/strict';import Database from'better-sqlite3';
import{fixtureType,fixtureCard}from'../lib/typed-fixture.mjs';
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

test('stored fixture junctions resolve by component identity when name and key are null',()=>{
 const db=new Database(':memory:');try{
  db.exec('CREATE TABLE cards(id INTEGER,name TEXT,key TEXT,type_id INTEGER,left_id INTEGER,right_id INTEGER,trash INTEGER DEFAULT 0,db_content TEXT)');
  db.exec("INSERT INTO cards(id,name,type_id) VALUES(1,'Fixture',3),(2,'*right',260),(3,'*options',22281); INSERT INTO cards(id,left_id,right_id,type_id) VALUES(4,1,2,259),(5,4,3,30)");
  assert.equal(fixtureCard(db,'Fixture+*right+*options').id,5);
  assert.equal(fixtureCard(db,'Fixture+missing'),undefined);
 }finally{db.close()}
});
