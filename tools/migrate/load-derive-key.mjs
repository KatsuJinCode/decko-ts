// load-derive-key.mjs — load the port's key function (Card::Name#key) into
// a plain-node tool.
//
// src/ is TypeScript whose relative imports use ".js" specifiers, which bare
// node does not rewrite, so the name code is bundled with esbuild into a
// temporary directory, imported, and the directory is removed before this
// function returns.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** @returns {Promise<(name: string) => string>} */
export async function loadDeriveKey() {
  const { build } = await import("esbuild");
  const dir = mkdtempSync(path.join(os.tmpdir(), "decko-derive-key-"));
  try {
    const outfile = path.join(dir, "derive-key.bundle.mjs");
    await build({
      entryPoints: [path.join(HERE, "derive-key-entry.mjs")],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      logLevel: "warning",
    });
    const mod = await import(pathToFileURL(outfile).href);
    return mod.deriveKey;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
