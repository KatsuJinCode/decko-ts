import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { createRenderTestStorage, seedCard, bindModLoaderToEngine } from "../card/render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModSearch from "../../src/card/mod-loader/mods/card-mod-search.js";
import cardModFormat from "../../src/card/mod-loader/mods/card-mod-format.js";
import { jsonShowResult } from "../../src/card/render/json-show.js";

async function deck() {
  const s=await createRenderTestStorage();
  const readRuleId=s.bootstrapRule!;
  await seedCard(s,{id:100,name:"Basic",typeId:100,readRuleId});
  await seedCard(s,{id:101,name:"A & B",typeId:100,readRuleId});
  await seedCard(s,{id:200,name:"Search",codename:"search_type",typeId:100,readRuleId});
  await seedCard(s,{id:201,name:"*search",codename:"search",typeId:200,readRuleId,dbContent:'{"type":"Basic"}'});
  const loader=new ModLoader([{manifest:cardModFormat},{manifest:cardModSearch}]);loader.load();bindModLoaderToEngine(s,loader);
  await loader.installInto(modEngineHost(s.engine,s.fetcher));
  return {s,loader};
}

async function withHttp<T>(run:(base:string,s:Awaited<ReturnType<typeof deck>>["s"])=>Promise<T>) {
  const {s,loader}=await deck();
  const server=createServer(async(req,res)=>{
    try{
      const url=`http://127.0.0.1:${(server.address() as {port:number}).port}${req.url}`;
      const response=await handleEngineRequest(new Request(url),{fetcher:s.fetcher,render:s.engine});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(e){res.writeHead(500);res.end(String(e))}
  });
  try{await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;return await run(base,s)}
  finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));loader.reset();s.close()}
}

describe("raw JSON view answers and HTTP presentation",()=>{
  it("serves already-typed JSON status views as parseable HTTP JSON, with actual request metadata",async()=>withHttp(async(base)=>{
    const url=base+"/A_%26_B/status.json";
    const response=await fetch(url);expect(response.status).toBe(200);
    const value=await response.json();
    expect(value).toMatchObject({status:"real",id:101,url});
  }));
  it("keeps hashes raw in renderRaw and serializes exactly once at the actual HTTP boundary",async()=>withHttp(async(base,s)=>{
    expect(await s.engine.renderRaw("A & B","select2_option",{format:"json"})).toEqual({id:"~101",text:"A & B"});
    const url=base+"/A_%26_B/select2_option.json";
    const response=await fetch(url);expect(response.status).toBe(200);expect(response.headers.get("content-type")).toContain("application/json");
    const value=await response.json();expect(value).toMatchObject({id:"~101",text:"A & B",url});
    expect(value.requested_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC$/);
  }));
  it("returns actual autocomplete arrays as raw values and HTTP JSON arrays",async()=>withHttp(async(base,s)=>{
    const raw=await s.engine.renderRaw("*search","search_box_complete",{format:"json",search:{term:"A"}});
    expect(Array.isArray(raw)).toBe(true);
    const response=await fetch(base+"/*search/search_box_complete.json?term=A");expect(response.status).toBe(200);
    const items=await response.json();expect(Array.isArray(items)).toBe(true);
    expect(items.some((x:{action:string;value:string})=>x.action==="goto"&&x.value==="A & B")).toBe(true);
  }));
  it("does not turn unsupported HTML views or absent marks into successful JSON",async()=>withHttp(async(base)=>{
    expect((await fetch(base+"/A_%26_B/select2_option")).status).toBe(422);
    const absent=await fetch(base+"/Absent/select2_option.json");expect(absent.status).toBe(404);
  }));
  it("leaves string answers verbatim, and serializes nil/numbers/arrays without hash metadata",()=>{
    expect(jsonShowResult('{"literal":true}',"https://example.test/")).toBe('{"literal":true}');
    expect(jsonShowResult(null,"https://example.test/")).toBe("null");
    expect(jsonShowResult(2,"https://example.test/")).toBe("2");
    expect(JSON.parse(jsonShowResult([{id:1}],"https://example.test/"))).toEqual([{id:1}]);
    expect(jsonShowResult([1,2],"https://example.test/","")).toBe("[1,2]");
    expect(jsonShowResult([1,2],"https://example.test/",false)).toContain("\n");
  });
});
