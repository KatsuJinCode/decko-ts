// The LibSass program the SCSS compile seam runs (sassc-coffeescript-compile-
// engines.ts sasscRender): LibSass 3.6.4 built from the sassc 2.4.0 gem's
// bundled source, vendored under tools/libsass/libsass. The tests need the
// built program; this builds it once when it is absent, with the same build
// script an operator runs (tools/libsass/build-native.mjs).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const exeSuffix = process.platform === "win32" ? ".exe" : "";
const BUILT = fileURLToPath(new URL(`../../tools/libsass/build/sassc-stdin${exeSuffix}`, import.meta.url));
const BUILD_SCRIPT = fileURLToPath(new URL("../../tools/libsass/build-native.mjs", import.meta.url));
const SOURCE = fileURLToPath(new URL("../../tools/libsass/libsass", import.meta.url));

/** Ensure the LibSass program exists; build it from the vendored source when
 *  it does not. A failed build throws with the build's own output. */
export function ensureLibsassProgram(): void {
  if (process.env["DECKO_SASSC"] !== undefined && process.env["DECKO_SASSC"] !== "") return;
  if (existsSync(BUILT)) return;
  execFileSync(process.execPath, [BUILD_SCRIPT, SOURCE], {
    windowsHide: true,
    stdio: "pipe",
    timeout: 600_000,
  });
}
