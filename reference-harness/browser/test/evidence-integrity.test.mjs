import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sha256, treeDigest } from "../lib/journey-provenance.mjs";
const candidate = "a".repeat(40);
const command = fileURLToPath(new URL("../compare-journeys.mjs", import.meta.url));
function fixture(fn) {
 const root=mkdtempSync(path.join(tmpdir(),"decko-journey-integrity-"));
 try {
  for(const d of ["fixture","ruby","ts"])mkdirSync(path.join(root,d));
  writeFileSync(path.join(root,"fixture/deck.json"),"{}");
  const steps=[{visit:"/"},{observe:"home"}];
  const journeys=path.join(root,"journeys.json");
  writeFileSync(journeys,JSON.stringify({journeys:[{id:"home",steps}]}));
  const p={format:"decko-browser-evidence/1",runId:"one-run",source:{commit:candidate,dirty:false,diffSha256:"diff"},artifacts:{distSha256:"b".repeat(64)},fixtureSha256:treeDigest(path.join(root,"fixture")),journeysSha256:sha256(readFileSync(journeys)),buildReceipt:{sourceCommit:candidate,sourceDiffSha256:"diff",distSha256:"b".repeat(64)}};
  const result={id:"home",completed:true,steps:steps.map((step,i)=>({step,i,outcome:"ok"})),observations:[{label:"home",url:"/",status:200,text:"Home",structure:[],fields:[]}],runtime:{ruby:"3.3.12",node:process.version},browserVersion:"actual-browser-test-fixture",provenance:p,rows:{},mail:[]};
  const write=(side,value,name="home")=>writeFileSync(path.join(root,side,name+".json"),JSON.stringify(value));
  write("ruby",result);write("ts",result);
  const run=()=>spawnSync(process.execPath,[command,"--expected",path.join(root,"ruby"),"--actual",path.join(root,"ts"),"--fixture",path.join(root,"fixture"),"--journeys",journeys,"--candidate",candidate,"--report",path.join(root,"report.json")],{encoding:"utf8",windowsHide:true});
  fn({root,result,write,run});
 } finally {rmSync(root,{recursive:true,force:true});}
}
test("complete bound evidence exits zero",()=>fixture(({root,run})=>{assert.equal(run().status,0);const report=JSON.parse(readFileSync(path.join(root,"report.json")));assert.equal(report.verdict,"pass");assert.equal(report.productionAcceptance,false);}));
for (const [name,change] of [
 ["missing",({root})=>rmSync(path.join(root,"ts/home.json"))],
 ["extra",({result,write})=>write("ts",{...result,id:"unexpected"},"extra")],
 ["duplicate",({result,write})=>write("ts",result,"duplicate")],
 ["HTTP500 equality",({result,write})=>{result.observations[0].status=500;write("ruby",result);write("ts",result);}],
 ["dirty candidate",({result,write})=>{result.provenance.source.dirty=true;write("ts",result);}],
 ["wrong candidate",({result,write})=>{result.provenance.source.commit="c".repeat(40);write("ts",result);}],
 ["missing provenance",({result,write})=>{delete result.provenance;write("ts",result);}],
 ["stale artifact",({result,write})=>{result.provenance.buildReceipt.distSha256="d".repeat(64);write("ts",result);}],
 ["incomplete steps",({result,write})=>{result.steps.pop();write("ts",result);}],
 ["duplicate observation",({result,write})=>{result.observations.push(result.observations[0]);write("ts",result);}],
 ["Ruby34",({result,write})=>{result.runtime.ruby="3.4.11";write("ruby",result);}],
 ["comparison mismatch",({result,write})=>{result.observations[0].text="wrong";write("ts",result);}],
]) test(`${name} fails closed`,()=>fixture(ctx=>{change(ctx);const r=ctx.run();assert.equal(r.status,1,r.stdout+r.stderr);}));
