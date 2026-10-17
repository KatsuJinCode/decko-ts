import {describe,it,expect} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {searchWithRelatedStatement,decodeSearchWithRelated} from "../../../src/card/live/search-with-related.js";
import {CARDS_COLUMNS} from "../../../src/card/live/store-row-evaluator.js";
import {LiveStoreDriver} from "../../../src/card/live/live-store-driver.js";
import {LocalSqliteDriver} from "../../../src/server/drivers/local-sqlite.js";
import {BunnyDbDriver} from "../../../src/card/drivers/bunny-db.js";
import {startMockHranaServer} from "../../server/drivers/mock-hrana-server.js";

const schema=`CREATE TABLE cards (${CARDS_COLUMNS.map(c=>`${c} ${/_id$|^id$|^trash$|references_expired/.test(c)?"INTEGER":"TEXT"}`).join(", ")})`;
const seed="INSERT INTO cards(id,name,key,type_id,left_id,right_id,trash,db_content) VALUES (1,'One','one',3,5,6,0,'root'),(2,'Two','two',3,1,6,0,'root'),(3,'Type','type',3,NULL,NULL,0,''),(5,'Left','left',3,NULL,NULL,0,''),(6,'Right','right',3,NULL,NULL,1,'')";

describe("search and related rows in one statement",()=>{
  it("preserves exact search order, duplicate rows, DISTINCT, paging, and the related identity set",()=>{
    const db=new DatabaseSync(":memory:");
    try{
      db.exec(schema);db.exec(seed);
      const queries=[
        "SELECT c0.* FROM cards c0 WHERE c0.id IN (1,2)",
        "SELECT c0.* FROM cards c0 WHERE c0.id IN (1,2) ORDER BY c0.name DESC",
        "SELECT c0.* FROM cards c0 WHERE c0.id IN (1,2) ORDER BY c0.name DESC LIMIT 1 OFFSET 1",
        "SELECT c0.* FROM cards c0 JOIN (SELECT 1 AS n UNION ALL SELECT 2) copies WHERE c0.id=1 ORDER BY copies.n DESC",
        "SELECT DISTINCT c0.* FROM cards c0 JOIN (SELECT 1 AS n UNION ALL SELECT 2) copies WHERE c0.id=1",
        "SELECT c0.* FROM cards c0 WHERE c0.id=999",
      ];
      for(const sql of queries){
        const plain=db.prepare(sql).all();
        const fused=searchWithRelatedStatement({sql,params:[]})!;
        const decoded=decodeSearchWithRelated(db.prepare(fused.sql).all())!;
        expect(decoded.search).toEqual(plain);
        const own=new Set(plain.map(row=>row.id));
        const related=new Set(plain.flatMap(row=>[row.type_id,row.left_id,row.right_id]).filter(id=>id!==null&&!own.has(id)));
        expect(new Set(decoded.related.map(row=>row.id))).toEqual(related);
      }
      const params={sql:"SELECT c0.* FROM cards c0 WHERE c0.id=?",params:[2]};
      const fused=searchWithRelatedStatement(params)!;
      expect(decodeSearchWithRelated(db.prepare(fused.sql).all(...params.params))!.search).toEqual(db.prepare(params.sql).all(...params.params));
    }finally{db.close()}
  });

  it("executes the search once and refuses lossy root or related encodings",()=>{
    const db=new DatabaseSync(":memory:");let calls=0;
    try{
      db.exec(schema);db.exec(seed);db.function("probe",()=>{calls++;return 1});
      const sql="SELECT c0.* FROM cards c0 WHERE probe()=1 AND c0.id IN (1,2) ORDER BY c0.id";
      db.prepare(sql).all();const plainCalls=calls;calls=0;
      const fused=searchWithRelatedStatement({sql,params:[]})!;
      expect(decodeSearchWithRelated(db.prepare(fused.sql).all())!.search).toHaveLength(2);
      expect(calls).toBe(plainCalls);
      const good=db.prepare(fused.sql).all();
      expect(decodeSearchWithRelated(good.map(row=>({...row,__decko_kind:null})))).toBeUndefined();
      expect(decodeSearchWithRelated([null])).toBeUndefined();
      db.exec("UPDATE cards SET db_content=x'0102' WHERE id=3");
      expect(decodeSearchWithRelated(db.prepare(fused.sql).all())).toBeUndefined();
      db.exec("UPDATE cards SET db_content=x'0102' WHERE id=1");
      expect(decodeSearchWithRelated(db.prepare(fused.sql).all())).toBeUndefined();
      expect(searchWithRelatedStatement({sql:"SELECT c0.id FROM cards c0",params:[]})).toBeUndefined();
      expect(searchWithRelatedStatement({sql:"SELECT c0.* FROM cards c0 WHERE name REGEXP ?",params:["x"]})).toBeUndefined();
    }finally{db.close()}
  });

  for(const mode of ["native","hrana"] as const) it(`the ${mode} speculative driver preserves results and keeps plain fallback`,async()=>{
    const server=mode==="hrana"?await startMockHranaServer():undefined;
    const local=server?undefined:new LocalSqliteDriver({path:":memory:"});
    const base=local??new BunnyDbDriver({url:server!.url,authToken:"owned-local"});
    try{
      await base.query(schema,[]);await base.query(seed,[]);
      for(const variant of ["plain","related-blob","root-blob"]){
        const blob=variant!=="plain";
        await base.query("UPDATE cards SET db_content='' WHERE id=3",[]);
        if(variant==="related-blob")await base.query("UPDATE cards SET db_content=x'0102' WHERE id=3",[]);
        if(variant==="root-blob")await base.query("UPDATE cards SET key=x'0102' WHERE id=1",[]);
        const live=new LiveStoreDriver(base,{compact:true});live.mode="spec";
        const sql="SELECT c0.* FROM cards c0 WHERE c0.db_content=? ORDER BY c0.name DESC";
        const expected=await base.query(sql,["root"]);
        await live.query(sql,["root"]);await live.flushSpeculative();
        expect((await live.query(sql,["root"])).rows).toEqual(expected.rows);
        expect(live.stats.round_trips).toBe(blob?2:1);
        // The cold store also fetches its full/identity widening pair.
        // Search+related contributes one statement; refusal adds the two originals.
        expect(live.stats.statements_sent).toBe(blob?5:3);
        expect(live.stats.compact_fallbacks).toBe(blob?2:0);
        live.close();
      }
      expect(server?.violations??[]).toEqual([]);
    }finally{local?.close();await server?.close()}
  });
});
