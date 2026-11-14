// Read-only exact SDK composition of scoped JSON/image-source hunks onto a clean candidate.
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {builtinModules} from "node:module";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {build} from "esbuild";
import {coffeescriptNodeBuiltinStubs} from "./vendor/coffeescript-edge-bundler-stubs.mjs";
const own=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const integration=path.resolve(process.argv[2]);const out=path.resolve(process.argv[3]);mkdirSync(out);
const git=(cwd,...args)=>execFileSync("git",args,{cwd,windowsHide:true,encoding:"utf8"}).trim();
const hash=b=>createHash("sha256").update(b).digest("hex");
const commit=git(integration,"rev-parse","HEAD");assert.equal(git(integration,"status","--porcelain","--untracked-files=no"),"");
const paths=["src/card/render.ts","src/card/render/format.ts","src/card/history/render-seam.ts","src/card/mod-loader/mods/card-mod-search.ts","src/card/mod-loader/mods/card-mod-carrierwave.ts","deploy/bunny-worker-src/bunny-edge-engine-request.ts"];
const range=process.argv[4];
const patch=execFileSync("git",["diff",...(range?[range]:[]),"--unified=3","--",...paths],{cwd:own,windowsHide:true,encoding:"utf8"});
assert.ok(patch.includes("diff --git"),"proof expects scoped JSON changes (optional fourth argument: git diff range)");
writeFileSync(path.join(out,"source.patch"),patch);
const overlays=new Map();let name,hunks=[];const flush=()=>{
  if(name===undefined)return;let source=readFileSync(path.join(integration,name),"utf8");const before=hash(source);
  for(const h of hunks){const old=h.filter(l=>l[0]!=="+").map(l=>l.slice(1)).join("\n")+"\n";const next=h.filter(l=>l[0]!=="-").map(l=>l.slice(1)).join("\n")+"\n";assert.equal(source.split(old).length,2,"hunk must match once: "+name);source=source.replace(old,next)}
  overlays.set(path.normalize(path.join(integration,name)),{source,before,after:hash(source)});
};
let h;
for(const line of patch.split("\n")){
  if(line.startsWith("diff --git ")){flush();name=line.match(/ b\/(.*)$/)[1];hunks=[];h=undefined}
  else if(line.startsWith("@@")){h=[];hunks.push(h)}
  else if(h&&/^[ +\-]/.test(line)&&!line.startsWith("--- ")&&!line.startsWith("+++ "))h.push(line);
}flush();
const helper="src/card/render/json-show.ts";const helperSource=readFileSync(path.join(own,helper),"utf8");
if(existsSync(path.join(integration,helper)))assert.equal(hash(readFileSync(path.join(integration,helper))),hash(helperSource),"existing shared JSON helper must match; do not overlay unrelated source");
const overlay={name:"read-only-json-presentation-composition",setup(b){
  b.onResolve({filter:/json-show\.js$/},args=>({path:path.join(integration,helper)}));
  b.onLoad({filter:/json-show\.ts$/},()=>({loader:"ts",contents:helperSource}));
  b.onLoad({filter:/\.(ts|mjs)$/},args=>{const hit=overlays.get(path.normalize(args.path));return hit?{loader:"ts",contents:hit.source}:undefined});
}};
const builtins=[...new Set([...builtinModules,...builtinModules.map(n=>`node:${n}`)])];
const options={absWorkingDir:integration,entryPoints:[path.join(integration,"deploy/bunny-worker-src/bunny-edge-engine-entry.ts")],outfile:path.join(integration,"deploy/dist/bunny-edge-engine.bundle.js"),bundle:true,write:false,format:"esm",platform:"neutral",target:"es2022",minify:true,external:[...builtins,"@bunny.net/edgescript-sdk"],conditions:["deno","bunny","import","default"],mainFields:["module","main"],alias:{"@cf-wasm/photon":"@cf-wasm/photon/node"},plugins:[coffeescriptNodeBuiltinStubs()],logLevel:"warning",metafile:true,banner:{js:'globalThis.__deckoEval0=[typeof performance<"u"?performance.now():-1,Date.now()];'}};
const baseline=await build(options);const actual=readFileSync(options.outfile);assert.equal(hash(baseline.outputFiles[0].contents),hash(actual),"baseline must equal existing first-class built SDK bytes");
const composed=await build({...options,plugins:[overlay,coffeescriptNodeBuiltinStubs()]});
assert.equal(git(integration,"rev-parse","HEAD"),commit);assert.equal(git(integration,"status","--porcelain","--untracked-files=no"),"");assert.equal(hash(readFileSync(options.outfile)),hash(actual));
const result={integrationCommit:commit,baselineMatchesFirstClassArtifact:true,rootSourceAndDistUnchanged:true,baselineBytes:actual.length,composedBytes:composed.outputFiles[0].contents.length,addedBytes:composed.outputFiles[0].contents.length-actual.length,remainingBytes:10_000_000-composed.outputFiles[0].contents.length,composedSha256:hash(composed.outputFiles[0].contents),sourceHunks:Object.fromEntries([...overlays].map(([p,v])=>[p,{before:v.before,after:v.after}])),newHelperSha256:hash(helperSource),hostedRuntimeTested:false};
writeFileSync(path.join(out,"observed.json"),JSON.stringify(result,null,2)+"\n");writeFileSync(path.join(out,"bunny-edge-engine.composed.js"),composed.outputFiles[0].contents);console.log(JSON.stringify(result));assert.ok(result.remainingBytes>=0,"composed SDK exceeds conservative decimal10MB limit");
