// The LibSass program the SCSS compile seam runs (sassc-coffeescript-compile-
// engines.ts sasscRender): LibSass 3.6.4 built from the sassc 2.4.0 gem's
// bundled source, vendored under tools/libsass/libsass. The tests need the
// built program; the build script verifies its source/toolchain cache on
// every call and compiles once per input identity across shared worktrees.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUILD_SCRIPT = fileURLToPath(new URL("../../tools/libsass/build-native.mjs", import.meta.url));
const SOURCE = fileURLToPath(new URL("../../tools/libsass/libsass", import.meta.url));

/** Verify or build the compiler. File existence alone is not provenance;
 *  the build script checks input and binary hashes before reusing it. */
export function ensureLibsassProgram(): void {
  if (process.env["DECKO_SASSC"] !== undefined && process.env["DECKO_SASSC"] !== "") return;
  execFileSync(process.execPath, [BUILD_SCRIPT, SOURCE], {
    windowsHide: true,
    stdio: "pipe",
    timeout: 600_000,
  });
}

/** Verify or build the compiler and answer the program's path - the value
 *  DECKO_SASSC carries when a spawned host must compile stylesheets (the
 *  staging server composes its compiler from that env alone). */
export function libsassProgramPath(): string {
  ensureLibsassProgram();
  const exe = process.platform === "win32" ? "sassc-stdin.exe" : "sassc-stdin";
  return fileURLToPath(new URL(`../../tools/libsass/build/${exe}`, import.meta.url));
}
