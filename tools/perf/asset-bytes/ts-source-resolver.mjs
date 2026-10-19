// ts-source-resolver.mjs — a Node ESM resolve hook that maps the repo's
// `.js` import specifiers onto the `.ts` sources they name, so a plain
// `node --experimental-strip-types` run can import engine modules directly
// without a build step or an install.
//
// WHY IT EXISTS. The engine is TypeScript; its internal imports are written
// with `.js` extensions (the compiled-output spelling, so the emitted JS
// resolves). Node resolves `../card/render/font-awesome.js`, finds no such
// file in the source tree, and refuses the import. Repointing every import at
// `.ts` would be a large diff for an instrument's benefit; this hook does it
// at load time instead.
//
// `format: "module-typescript"` is load-bearing: Node hands the source to
// --experimental-strip-types only for that format. Returning "module" instead
// parses the type annotations as JavaScript and fails on the first `: Return`
// in the file.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.endsWith(".js")) return nextResolve(specifier, context);
  const parentUrl = context.parentURL ?? pathToFileURL(`${process.cwd()}/`);
  const base = specifier.startsWith("file:") ? new URL(specifier) : new URL(specifier, parentUrl);
  const asTs = new URL(`${base.href.slice(0, -3)}.ts`, base);
  if (existsSync(fileURLToPath(asTs))) {
    return { url: asTs.href, shortCircuit: true, format: "module-typescript" };
  }
  return nextResolve(specifier, context);
}