// tools/libsass/build-native.mjs — build the LibSass compiler the Ruby oracle
// uses (sassc-ruby 2.4.0 bundles LibSass 3.6.4) as a native command-line
// program, `sassc-stdin` (see sassc-stdin.c), for Node hosts and the parity
// harness.
//
//   node tools/libsass/build-native.mjs <libsass source dir> [out dir]
//
// <libsass source dir> is a LibSass 3.6.4 checkout (the directory holding
// src/, include/ and VERSION; sassc-ruby 2.4.0 ships one at ext/libsass).
// The output defaults to tools/libsass/build/ (not committed). Needs a C++11
// compiler on PATH (CXX, default g++; CC, default gcc). Objects are compiled
// in parallel (LIBSASS_JOBS, default 3) and linked statically against the
// C++ runtime so the program runs without the compiler's DLLs.
//
// LibSass is MIT-licensed (LibSass LICENSE, in the source directory).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [srcArg, outArg] = process.argv.slice(2);
if (!srcArg) {
  console.error("usage: node tools/libsass/build-native.mjs <libsass source dir> [out dir]");
  process.exit(2);
}
const SRC = resolve(srcArg);
const OUT = resolve(outArg ?? join(here, "build"));
const OBJ = join(OUT, "obj");
mkdirSync(OBJ, { recursive: true });
const CXX = process.env.CXX ?? "g++";
const CC = process.env.CC ?? "gcc";
const JOBS = Number(process.env.LIBSASS_JOBS ?? 3);
const version = readFileSync(join(SRC, "VERSION"), "utf8").trim();
const define = `-DLIBSASS_VERSION="${version}"`;
const include = ["-I", join(SRC, "include"), "-I", join(SRC, "src")];

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stdout.on("data", (d) => { err += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")}\n${err}`))));
  });
}

// src/ and its memory/ subdirectory (b64/ and utf8/ are header-only).
const sources = ["src", join("src", "memory")].flatMap((dir) =>
  readdirSync(join(SRC, dir))
    .filter((f) => /\.(cpp|c)$/.test(f))
    .map((f) => join(SRC, dir, f)));
const jobs = sources.map((file) => {
  const obj = join(OBJ, basename(file).replace(/\.(cpp|c)$/, ".o"));
  const cpp = file.endsWith(".cpp");
  const args = [...(cpp ? ["-std=c++11"] : []), "-O2", define, ...include, "-c", file, "-o", obj];
  return { file, obj, cmd: cpp ? CXX : CC, args };
});
const stale = jobs.filter((j) => !existsSync(j.obj) || statSync(j.obj).mtimeMs < statSync(j.file).mtimeMs);
let next = 0;
let done = 0;
async function worker() {
  while (next < stale.length) {
    const j = stale[next++];
    await run(j.cmd, j.args);
    done++;
    console.log(`compiled ${basename(j.file)} (${done}/${stale.length})`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));

const cliObj = join(OBJ, "sassc-stdin.o");
await run(CC, ["-O2", ...include, "-c", join(here, "sassc-stdin.c"), "-o", cliObj]);
const exe = join(OUT, process.platform === "win32" ? "sassc-stdin.exe" : "sassc-stdin");
await run(CXX, [
  "-o", exe, cliObj, ...jobs.map((j) => j.obj),
  "-static-libgcc", "-static-libstdc++", ...(process.platform === "win32" ? ["-static"] : ["-lm"]),
]);
console.log(`built ${exe} (LibSass ${version})`);
