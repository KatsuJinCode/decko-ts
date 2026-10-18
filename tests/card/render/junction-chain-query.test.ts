import {describe,it,expect} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {PostgresDriver} from "../../../src/server/drivers/postgres.js";
import {LocalSqliteDriver} from "../../../src/server/drivers/local-sqlite.js";
import {junctionChainQuery} from "../../../src/card/render/junction-chain-query.js";

describe("bound junction tuples",()=>{
  for(const mode of ["sqlite","postgres"] as const)it(`returns the requested live chains on ${mode}`,async()=>{
    const driver=mode==="sqlite"?new LocalSqliteDriver({path:":memory:"}):new PostgresDriver({client:await PGlite.create()});
    try{
      await driver.query('CREATE TABLE cards(id INTEGER PRIMARY KEY,name TEXT,"key" TEXT,left_id INTEGER,right_id INTEGER,trash INTEGER)',[]);
      await driver.query('CREATE INDEX cards_key ON cards("key")',[]);
      await driver.query('CREATE UNIQUE INDEX card_pair ON cards(left_id,right_id)',[]);
      await driver.query('INSERT INTO cards(id,name,"key",left_id,right_id,trash) VALUES(1,\'A\',\'a\',NULL,NULL,0),(2,\'B\',\'b\',NULL,NULL,0),(3,\'C\',\'c\',NULL,NULL,0),(4,\'D\',\'d\',NULL,NULL,1),(5,NULL,NULL,1,2,0),(6,NULL,NULL,5,3,0),(7,NULL,NULL,5,4,0),(8,NULL,NULL,6,3,0)',[]);
      const query=junctionChainQuery([["a","b","c"],["a","b","c"],["a","b","missing"],["a","b","d"]]);
      expect((await driver.query<{id:number}>(query.sql,query.params)).rows.map(row=>row.id)).toEqual([6]);
      const deep=junctionChainQuery([["a","b","c","c"]]);
      expect((await driver.query<{id:number}>(deep.sql,deep.params)).rows.map(row=>row.id)).toEqual([8]);
      await driver.query('UPDATE cards SET trash=1 WHERE id=5',[]);
      expect((await driver.query(query.sql,query.params)).rows).toEqual([]);
      expect((await driver.query(deep.sql,deep.params)).rows).toEqual([]);
    }finally{await driver.close()}
  });
  it("refuses malformed or over-budget tuples before sending SQL",()=>{
    expect(()=>junctionChainQuery([])).toThrow();
    expect(()=>junctionChainQuery([["a","b","c"],["a","b"]])).toThrow();
    expect(()=>junctionChainQuery(Array.from({length:31},()=>["a","b","c"]))).toThrow();
  });
  it("splits a wide ask so no compound SELECT carries more than D1's five terms, with the rows unchanged",async()=>{
    for(const mode of ["sqlite","postgres"] as const){
      const driver=mode==="sqlite"?new LocalSqliteDriver({path:":memory:"}):new PostgresDriver({client:await PGlite.create()});
      try{
        await driver.query('CREATE TABLE cards(id INTEGER PRIMARY KEY,name TEXT,"key" TEXT,left_id INTEGER,right_id INTEGER,trash INTEGER)',[]);
        await driver.query('CREATE INDEX cards_key ON cards("key")',[]);
        await driver.query('CREATE UNIQUE INDEX card_pair ON cards(left_id,right_id)',[]);
        await driver.query('INSERT INTO cards(id,name,"key",left_id,right_id,trash) VALUES(1,\'A\',\'a\',NULL,NULL,0),(2,\'B\',\'b\',NULL,NULL,0),(3,\'C\',\'c\',NULL,NULL,0),(4,\'D\',\'d\',NULL,NULL,1),(5,NULL,NULL,1,2,0),(6,NULL,NULL,5,3,0),(7,NULL,NULL,5,4,0),(8,NULL,NULL,6,3,0)',[]);
        // Twelve depth-3 tuples (36 params, inside the 90 budget): repeats,
        // misses and a trashed part, with one real chain among them.
        const tuples=Array.from({length:3},()=>[["a","b","c"],["a","b","c"],["a","b","missing"],["a","b","d"]]).flat();
        const query=junctionChainQuery(tuples);
        expect((await driver.query<{id:number}>(query.sql,query.params)).rows.map(row=>row.id)).toEqual([6]);
        // THE D1 CONTRACT (docs/deploy-cloudflare.md:116-124): every compound
        // SELECT in the statement stays within five terms. A wider UNION
        // chain is emitted as requested_0, requested_1, ... of at most five
        // terms each, with `requested` as their UNION.
        const cteBodies=[...query.sql.matchAll(/AS \(([^)]+)\)/g)].map(m=>m[1]!);
        expect(cteBodies.length).toBeGreaterThan(1);
        for(const body of cteBodies) expect(body.split(" UNION ").length,"CTE terms: "+body).toBeLessThanOrEqual(5);
        expect(query.sql).toContain("requested_0(k0, k1, k2)");
        // The dedup the UNION introduces cannot change the DISTINCT answer:
        // the same ask with the duplicates collapsed resolves identically.
        const deduped=junctionChainQuery([["a","b","c"],["a","b","missing"],["a","b","d"]]);
        expect((await driver.query<{id:number}>(deduped.sql,deduped.params)).rows.map(row=>row.id)).toEqual([6]);
      }finally{await driver.close()}
    }
  });
});
