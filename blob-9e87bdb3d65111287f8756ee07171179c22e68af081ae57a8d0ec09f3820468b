// tools/libsass/build-wasm.mjs — build the LibSass compiler the Ruby oracle
// uses (sassc-ruby 2.4.0 bundles LibSass 3.6.4) as a WebAssembly module for
// the edge hosts (Cloudflare Workers / Bunny edge), where no native program
// can run. The wrapper is sassc-wasm.c; the output is a generated base64
// module vendored at vendor/libsass-wasm/libsass-<version>-wasm-base64.js and
// loaded by src/server/libsass-wasm.ts behind the same ScssCompiler seam the
// Node host uses (src/server/libsass-process.ts).
//
//   node tools/libsass/build-wasm.mjs <libsass source dir> [out file]
//
// <libsass source dir> is a LibSass 3.6.4 checkout (the directory holding
// src/, include/ and VERSION; the sassc-2.4.0 gem ships one at ext/libsass).
// The output defaults to vendor/libsass-wasm/libsass-<version>-wasm-base64.js.
//
// Toolchain: the Emscripten SDK (github.com/emscripten-core/emsdk — clone,
// `emsdk install latest`, `emsdk activate latest`), with EMCC on the
// environment pointing at its emcc launcher:
//
//   EMCC=<emsdk>/upstream/emscripten/emcc.exe node tools/libsass/build-wasm.mjs ...
//
// LibSass is MIT-licensed (vendor/libsass-wasm/LICENSE, taken from the
// libsass 3.6.4 tag). The artifact is vendored with that license; the repo's
// NOTICE defers to it (Third-party components).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const [srcArg, outArg] = process.argv.slice(2);
if (!srcArg) {
  console.error("usage: node tools/libsass/build-wasm.mjs <libsass source dir> [out file]");
  process.exit(2);
}
const SRC = resolve(srcArg);
const version = readFileSync(join(SRC, "VERSION"), "utf8").trim();
const OUT = resolve(outArg ?? join(repo, "vendor", "libsass-wasm", `libsass-${version}-wasm-base64.js`));
mkdirSync(dirname(OUT), { recursive: true });
const EMCC = process.env.EMCC;
if (!EMCC || !existsSync(EMCC)) {
  console.error("EMCC must name the emsdk emcc launcher (see the header of this file)");
  process.exit(2);
}
// The C++ driver (em++), derived from EMCC's path: C++ sources need the C++
// runtime at the link (operator new/delete), and emcc alone links none.
const EMPP = EMCC.replace(/emcc(\.exe|\.bat)?$/, (m) => `em++${m.startsWith("emcc.") ? m.slice(4) : ""}`);
if (!existsSync(EMPP)) {
  console.error(`no em++ launcher next to EMCC (${EMCC})`);
  process.exit(2);
}
const OBJ = mkdtempSync(join(tmpdir(), "libsass-wasm-obj-"));
const JOBS = Number(process.env.LIBSASS_JOBS ?? 4);
const define = `-DLIBSASS_VERSION="${version}"`;
const include = ["-I", join(SRC, "include"), "-I", join(SRC, "src")];

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")}\n${out}`))));
  });
}

// src/ and its memory/ subdirectory (b64/ and utf8/ are header-only),
// exactly the sources build-native.mjs compiles.
const sources = ["src", join("src", "memory")].flatMap((dir) =>
  readdirSync(join(SRC, dir))
    .filter((f) => /\.(cpp|c)$/.test(f))
    .map((f) => join(SRC, dir, f)));
const common = [
  "-O2",
  // WebAssembly exception handling: LibSass throws through its parser and
  // eval, and the module carries no Emscripten JS glue to emulate it. Every
  // runtime that serves these bundles implements the proposal (V8 in
  // workerd and Node; verified by the edge gates).
  "-fwasm-exceptions",
  "-sALLOW_MEMORY_GROWTH=1",
  // LibSass recurses through the bootstrap sources' nested selectors and
  // media queries; the 64 KiB default wasm stack overflows where the native
  // build's megabyte-scale thread stack does not. 16 MiB. (No
  // -sSTACK_OVERFLOW_CHECK: its prologue bounds check traps at _initialize in
  // a --no-entry reactor, whose stack-pointer globals are set for a JS-driven
  // runtime this module deliberately does not carry.)
  "-sSTACK_SIZE=16MB",
  "-sFILESYSTEM=0",
  // The C++ iostream static initializers (libsass links <sstream>) wire up
  // the standard streams at ctor time; with the filesystem compiled out they
  // hit an unreachable. Keep the (never-used-for-files) stdio layer; the
  // loader's WASI stubs answer the fd calls (EOF on read, a sink on write).
  "-sEXPORTED_FUNCTIONS=_malloc,_free,_sassc_compile",
  define,
  ...include,
];
const jobs = sources.map((file) => ({
  file,
  obj: join(OBJ, basename(file).replace(/\.(cpp|c)$/, ".o")),
  args: [...common, "-c", file, "-o", join(OBJ, basename(file).replace(/\.(cpp|c)$/, ".o"))],
  cmd: file.endsWith(".cpp") ? EMPP : EMCC,
}));
let next = 0;
let done = 0;
const failures = [];
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    try {
      await run(j.cmd, j.args);
    } catch (error) {
      failures.push(error);
      return;
    }
    done++;
    console.log(`compiled ${basename(j.file)} (${done}/${jobs.length})`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
if (failures.length > 0) {
  rmSync(OBJ, { recursive: true, force: true });
  throw failures[0];
}

const wrapperObj = join(OBJ, "sassc-wasm.o");
await run(EMCC, [...common, "-c", join(here, "sassc-wasm.c"), "-o", wrapperObj]);
// A standalone module: the only artifacts are the .wasm and the host loader
// (src/server/libsass-wasm.ts) — no Emscripten JS glue, so nothing in the
// bundle depends on an environment the edge runtimes would have to fake.
// --no-entry makes it a reactor: no main is linked, and the module exports
// _initialize (the libc/ctor runner the host calls once before compiling).
// LIBSASS_WASM_DEBUG=1 builds an unoptimized, named diagnostic module instead
// (same output shape, for the probe workflow when a compile misbehaves).
const debugBuild = process.env.LIBSASS_WASM_DEBUG === "1";
const wasmTmp = join(OBJ, "libsass.wasm");
await run(EMPP, [
  ...(debugBuild ? [...common.map((f) => (f === "-O2" ? "-O0" : f)), "-g2"] : common),
  "-sSTANDALONE_WASM=1",
  "--no-entry",
  "-o",
  wasmTmp,
  wrapperObj,
  ...jobs.map((j) => j.obj),
]);
const wasmBytes = readFileSync(wasmTmp);
const base64 = wasmBytes.toString("base64");
const module = [
  `// LibSass ${version} compiled to WebAssembly — GENERATED by`,
  `// tools/libsass/build-wasm.mjs (emcc ${basename(dirname(EMCC))}); do not edit.`,
  `// Sources: the LibSass ${version} tag (MIT, vendor/libsass-wasm/LICENSE),`,
  `// the same sources the Node host builds natively`,
  `// (tools/libsass/build-native.mjs) and the Ruby oracle's sassc gem ships.`,
  `// Standalone reactor module: exports malloc, free, sassc_compile,`,
  `// _initialize and memory; loaded by src/server/libsass-wasm.ts.`,
  `const libsass${version.replace(/\./g, "_")}WasmBase64 =`,
  `  "${base64}";`,
  `export default libsass${version.replace(/\./g, "_")}WasmBase64;`,
  ``,
].join("\n");
writeFileSync(OUT, module);
rmSync(OBJ, { recursive: true, force: true });
console.log(`built ${OUT} (LibSass ${version}, wasm ${wasmBytes.length} bytes, base64 module ${module.length} bytes)`);
