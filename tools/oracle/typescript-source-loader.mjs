// typescript-source-loader.mjs -- support for the direct grade runner.
//
// WHAT THIS IS
//   The measuring instrument (tools/oracle/verify-dual-lane.test.ts) is a
//   vitest spec, and vitest is what currently supplies the two things the
//   engine source needs to run at all:
//
//     1. `.js` -> `.ts` specifier resolution. Every in-repo import spells the
//        sibling COMPILED (`import ... from "./render.js"`) because tsconfig
//        is `"module": "NodeNext"`. On disk only `.ts` exists.
//     2. TypeScript -> JavaScript transform, including the type-only-import
//        elision the repo depends on. `src/cql/sql.ts:24` imports
//        `{ CqlBadQuery, ConditionNode, ... }` from `./ast.js` where
//        `ConditionNode` is `export type` (src/cql/ast.ts:14) -- the import
//        is unmarked, so a transform that cannot see type information leaves
//        the name in place and the ESM link fails.
//
//   This loader supplies both outside vitest, so a worker child pays Node
//   startup instead of a test-framework boot, and the vitest spec can stay in
//   the tree as the parity oracle.
//
// WHY VITE'S TRANSFORMER AND NOT NODE'S OWN
//   Node's built-in TypeScript support was measured here first and neither
//   mode runs this graph:
//     - strip-only (`node` default): `tests/card/render/render-test-storage.ts:72`
//       is `constructor(private readonly inner: SQLDatabaseDriver) {}` --
//       ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX.
//     - `--experimental-transform-types`: that one passes, but the unmarked
//       type import above is left in the emitted import list --
//       "does not provide an export named 'ConditionNode'".
//   `transformWithOxc` is the SAME transformer vitest resolves its TS through
//   (vitest 5 runs on the vite 8 in this tree), so the direct runner and the
//   spec see the same emitted JavaScript for the same source. That is the
//   point: this loader changes who boots the graph, not what the graph means.
//
// WHY NOT A BUNDLE
//   A bundle would move every module to one output file, and this graph
//   resolves real paths from `import.meta.url` in ways that change rendered
//   bytes. `src/card/render/bootstrap-code-files.ts:42` derives
//   BOOTSTRAP_SCSS_DIR from its own module URL; `src/testing/replay.ts:35`,
//   `src/card/auth/migrations.ts:37`, and
//   `src/card/assets/uglify-harmony-compile-engine.ts:47` do the same. A
//   bundle was built and MEASURED to get this wrong: rolldown rewrote
//   `import.meta.url` to the OUTPUT file's URL and RAW_CORPUS_DB came back
//   resolved under the output location instead of the repo root -- a path
//   that does not exist. Per-file loading keeps every module at its real
//   path, so those derivations are untouched.
//
// COST (measured, not estimated)
//   transformWithOxc on the two files above: 4 ms and 1 ms. A transform cache
//   (see transformCacheKey) keeps repeat worker boots off the transform path.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformWithOxc } from "vite";

/** `.js` -> `.ts` for relative specifiers only. A real `.js` file always
 *  wins: nextResolve is tried first and only a failure triggers the remap. */
function typescriptSibling(specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  if (!specifier.endsWith(".js")) return null;
  if (specifier.startsWith("./node_modules/")) return null;
  return `${specifier.slice(0, -".js".length)}.ts`;
}

/** The sibling path for a `file:` URL specifier. The direct runner imports
 *  the per-worktree staging module by ABSOLUTE path (its location is the
 *  repo's gitignored instrument tree, not a fixed relative depth), so the
 *  relative-only rule above cannot see it. Same discipline: a real `.js` file
 *  wins, and only a `.ts` sibling that exists is substituted. */
function typescriptSiblingForFileUrl(specifier) {
  if (!specifier.startsWith("file:") || !specifier.endsWith(".js")) return null;
  const asPath = fileURLToPath(specifier);
  const candidate = `${asPath.slice(0, -".js".length)}.ts`;
  return existsSync(candidate) ? pathToFileURL(candidate).href : null;
}

export async function resolve(specifier, context, nextResolve) {
  const absolute = typescriptSiblingForFileUrl(specifier);
  if (absolute !== null) return await nextResolve(absolute, context);

  const sibling = typescriptSibling(specifier);
  if (sibling !== null && context.parentURL !== undefined) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      const parentPath = fileURLToPath(context.parentURL);
      const candidate = pathToFileURL(path.resolve(path.dirname(parentPath), sibling));
      if (existsSync(fileURLToPath(candidate))) {
        return await nextResolve(sibling, context);
      }
      throw err;
    }
  }
  return await nextResolve(specifier, context);
}

// ---------- transform cache ----------
//
// Keyed by content hash, so it can never serve a stale body: change one byte
// of a source file and its key changes. W workers booting at once would
// otherwise each re-transform the whole graph; with the cache the first boot
// pays and the rest read. The cache is a pure function of (bytes -> emitted
// js), so a warm cache is the same code a cold run would have produced -- it
// is a speed path, not a different program.

const CACHE_DIR = process.env.DUAL_LANE_TSC_CACHE_DIR;

function cachePathFor(source) {
  const hash = createHash("sha256").update(source).digest("hex");
  return path.join(CACHE_DIR, `${hash.slice(0, 32)}.mjs`);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) {
    return await nextLoad(url, context);
  }
  const filePath = fileURLToPath(url);
  const source = readFileSync(filePath, "utf8");

  if (CACHE_DIR !== undefined) {
    try {
      const cached = cachePathFor(source);
      if (existsSync(cached)) {
        return { format: "module", source: readFileSync(cached, "utf8"), shortCircuit: true };
      }
      const { code } = await transformWithOxc(source, filePath, { lang: "ts" });
      try {
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(cached, code);
      } catch {
        // A read-only or contended cache directory degrades to a cold
        // transform, never to a wrong answer.
      }
      return { format: "module", source: code, shortCircuit: true };
    } catch {
      // fall through to the uncached path below
    }
  }

  const { code } = await transformWithOxc(source, filePath, { lang: "ts" });
  return { format: "module", source: code, shortCircuit: true };
}
