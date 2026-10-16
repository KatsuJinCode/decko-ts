// Research only. No production imports/default changes. Vendor bytes stay intact.
// Run from this existing checkout; outputs are private durable evidence, not scratch.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { transform, build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const repo = process.cwd();
const out = process.argv[2];
assert.ok(out, "pass an explicit private evidence output directory");
assert.ok(path.isAbsolute(out), "evidence output must be an absolute path");
mkdirSync(out); // Refuse an existing evidence identity; never overwrite a prior run.
const hash = value => createHash("sha256").update(value).digest("hex");
const dir = path.join(repo, "vendor/uglifier-4.2.1-uglify-harmony");
const files = ["es5.js", "split.js", "source-map.js", "uglify-harmony.js", "uglifier.js"];
const texts = files.map(file => readFileSync(path.join(dir, file), "utf8"));
const originalSource = texts.join("\n");
const baseline = vm.createContext({});
vm.runInContext(originalSource, baseline);

// Record only trusted module initialization. User source is never supplied
// while capturing; no parser/compressor output is used as an expectation.
const recorded = new Map();
let constructorCalls = 0;
const capture = vm.createContext({});
const NativeFunction = vm.runInContext("Function", capture);
function recordFunction(...args) {
  constructorCalls++;
  assert.ok(args.every(x => typeof x === "string"));
  recorded.set(JSON.stringify(args), args);
  return Reflect.construct(NativeFunction, args);
}
recordFunction.prototype = NativeFunction.prototype;
capture.Function = recordFunction;
vm.runInContext(originalSource, capture);
// OutputStream lazily constructs one additional predicate from the literal
// "( [ + * / - , . `" (vendor offset 138968). Initialize that trusted fixed
// table with empty source; no user input participates in factory discovery.
capture.uglifier({ source: "", output: { comments: false }, compress: false, mangle: false, ie8: true });
// The fifth audited site is the empty Function fallback (unsafe evaluation).
// It has no body or parameters and may not execute during initialization.
recorded.set("[]", []);

const factories = [...recorded].map(([key, args]) => {
  const params = args.slice(0, -1).join(",");
  const body = args.at(-1) ?? "";
  return `${JSON.stringify(key)}: () => function anonymous(${params}) {\n${body}\n}`;
}).join(",\n");
const staticPrelude = `let constructorHits=0; const constructorMisses=[];
const factories={${factories}};
function __trustedStaticFunction(...args){
 const key=JSON.stringify(args); const factory=factories[key];
 if(!Object.hasOwn(factories,key)){constructorMisses.push(key);throw new Error('unrecorded trusted constructor');}
 constructorHits++; return factory();
}`;

// Exact five executable constructor sites, independently audited from the
// immutable vendor source. Exclude the diagnostic string at offset 283807.
const harmony = texts[3];
const candidates = [...harmony.matchAll(/\bnew Function\b/g)].map(x => x.index);
const sites = candidates.filter(offset => offset !== 283807);
assert.equal(sites.length, 5);
let staticHarmony = harmony;
for (const offset of sites.toReversed()) {
  staticHarmony = staticHarmony.slice(0, offset) + "new __trustedStaticFunction" + staticHarmony.slice(offset + "new Function".length);
}

// Adapt the old UMD globals explicitly to one ESM namespace. The vendor files
// themselves are neither edited nor forked. source-map's top-level `this`
// becomes this wrapper's explicit namespace, not an undefined ESM global.
const staticModule = `${staticPrelude}
const compiler=(function(){var UglifyJS,MOZ_SourceMap,sourceMap;
${texts[0]}\n${texts[1]}\n${texts[2]}
sourceMap=this.sourceMap;
${staticHarmony}\n${texts[4]}
return uglifier;}).call({});`;

// Use the existing production default options exactly, without duplicating
// them in this measuring instrument. Transform in memory; do not build dist.
const provider = readFileSync(path.join(repo, "src/card/assets/uglify-harmony-options.ts"), "utf8");
const transformed = await transform(provider, { loader: "ts", format: "esm" });
const { uglifierOptionsFor } = await import("data:text/javascript;base64," + Buffer.from(transformed.code).toString("base64"));
const cases = ["", "// comment", "let x=1;const f=n=>n+x;", "class X { method(x) { return x * 2; } }", "const [x,y]=[1,2]; console.log(`${x+y}`);", "var re=/[a-z]+/g;", "var fn=new Function('return 1');", "probe e106b", "var invalid = ;", "var a='unterminated", "var ok=1;\nfunction broken( {", "var unicode='😀';\nprobe invalid", "var café='😀'; console.log(café);", "var café=1; café café", "var smile='😀'; probe invalid"];
// A shipped fixture's existing compiled script is a larger independent input.
cases.push(readFileSync(path.join(repo, "reference-harness/fixtures/synthetic-v3-mod-probes-ruby33/deck/files/307/1789819200.js"), "utf8"));
const options = cases.map(uglifierOptionsFor);
const expected = options.map(value => JSON.parse(JSON.stringify(baseline.uglifier(structuredClone(value)))));
const manifest = {
  source: "Vendored Uglifier 4.2.1; research-only static initialization",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
  proofSha256: hash(readFileSync(new URL(import.meta.url))),
  miniflare: JSON.parse(readFileSync(path.join(repo, "node_modules/miniflare/package.json"))).version,
  workerd: JSON.parse(readFileSync(path.join(repo, "node_modules/workerd/package.json"))).version,
  compatibilityDate: "2026-10-13", node: process.version,
  vendor: Object.fromEntries(files.map((f, i) => [f, { bytes: Buffer.byteLength(texts[i]), sha256: hash(texts[i]) }])),
  constructorCalls, uniqueSignatures: recorded.size, executableSites: sites,
  sourceMapNamespaceAdapter: true,
  inputs: cases.map(source => ({ bytes: Buffer.byteLength(source), sha256: hash(source) })),
};

// No eval, dynamic Function, unsafe-eval binding, Node compatibility flag or
// network/compiler service is supplied to either actual workerd runtime.
let entry = `${staticModule}
export default {async fetch(request){try{
 if(request.headers.get('x-proof-control')==='unknown-constructor')__trustedStaticFunction('return 42');
 if(request.headers.get('x-proof-control')==='native-codegen')new Function('return 42')();
 const options=await request.json();
 const result=compiler(options);
 const diagnostic=result?.error?{name:result.error.name,message:result.error.message,stack:result.error.stack,own:Object.getOwnPropertyNames(result.error)}:null;
 return Response.json({result,diagnostic,constructorHits,constructorMisses});
}catch(e){return Response.json({error:String(e),constructorHits,constructorMisses},{status:500});}}};`;
if (process.argv.includes("--adopted")) {
  const compiled = await build({ stdin: { contents: `import {staticUglifier, trustedUglifierFunction} from './src/card/assets/uglify-harmony-static.generated.ts';
export default {async fetch(request){try{
 if(request.headers.get('x-proof-control')==='unknown-constructor')trustedUglifierFunction('return 42');
 if(request.headers.get('x-proof-control')==='native-codegen')new Function('return 42')();
 const result=staticUglifier(await request.json());
 const diagnostic=result?.error?{name:result.error.name,message:result.error.message,own:Object.getOwnPropertyNames(result.error)}:null;
 return Response.json({result,diagnostic});
}catch(e){return Response.json({error:String(e)},{status:500});}}};`, resolveDir: repo, sourcefile: "adopted-static-proof.mjs" }, bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022", minify: true, metafile: true });
  entry = compiled.outputFiles[0].text;
  assert.ok(!Object.keys(compiled.metafile.inputs).some(file => file.endsWith("uglify-harmony-compile-engine.ts")));
  manifest.adoptedGeneratedProvider = true;
  manifest.minified = true;
  manifest.generatedSha256 = hash(readFileSync(path.join(repo,"src/card/assets/uglify-harmony-static.generated.ts")));
}
writeFileSync(path.join(out, "static-worker.mjs"), entry);
writeFileSync(path.join(out, "generator-manifest.json"), JSON.stringify({ ...manifest, workerBytes: Buffer.byteLength(entry), workerSha256: hash(entry) }, null, 2) + "\n");
const observations = [];
const controls = [];
let mf;
try {
  const start = performance.now();
  mf = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: "2026-10-13", modules: [{ type: "ESModule", path: "proof.mjs", contents: entry }], port: 0 }));
  for (let i = 0; i < options.length; i++) {
    const t = performance.now();
    const response = await mf.dispatchFetch("http://proof/", { method: "POST", body: JSON.stringify(options[i]) });
    const actual = await response.json();
    const observed = { index: i, input: manifest.inputs[i], status: response.status, elapsedMs: Math.round(performance.now() - t), result: actual.result, diagnostic: actual.diagnostic, error: actual.error, constructorHits: actual.constructorHits, constructorMisses: actual.constructorMisses };
    observations.push(observed);
    assert.equal(response.status, 200, JSON.stringify(actual));
    assert.deepEqual(actual.result, expected[i], `original Node/static workerd result differs for case ${i}`);
    if (actual.constructorMisses !== undefined) assert.deepEqual(actual.constructorMisses, []);
  }
  for (const control of ["native-codegen", "unknown-constructor"]) {
    const response = await mf.dispatchFetch("http://proof/", { method: "POST", headers: { "x-proof-control": control }, body: "{}" });
    const actual = await response.json();
    controls.push({ control, status: response.status, actual });
    assert.equal(response.status, 500);
    if (control === "native-codegen") assert.match(actual.error, /EvalError.*Code generation from strings disallowed/);
    else assert.equal(actual.error, process.argv.includes("--adopted") ? "Error: unrecorded trusted Uglifier constructor" : "Error: unrecorded trusted constructor");
  }
  manifest.totalMs = Math.round(performance.now() - start);
} finally {
  await mf?.dispose();
  // Do not store the large source/output strings in summary evidence; their
  // hashes plus the unchanged input/derived module preserve reproducibility.
  const compact = observations.map(({ result, ...rest }) => ({ ...rest, result: result?.error ? result : { codeBytes: Buffer.byteLength(result?.code ?? ""), codeSha256: hash(result?.code ?? "") } }));
  writeFileSync(path.join(out, "observed.json"), JSON.stringify({ ...manifest, observations: compact, controls }, null, 2) + "\n");
  console.log(JSON.stringify({ cases: observations.length, controls: controls.map(x => ({ control: x.control, status: x.status, error: x.actual.error })), constructorCalls, uniqueSignatures: recorded.size, totalMs: manifest.totalMs, outputs: out }));
}
