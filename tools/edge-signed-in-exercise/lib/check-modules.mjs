// check-modules.mjs — loads every tools/edge-signed-in-exercise/checks-*.mjs
// module and runs each one's checks. Four agents each add checks in their own
// file, so a new file joins the run with no edit here.
//
// EXPORT SHAPE (one module per file, filename checks-<topic>.mjs):
//
//   export const meta = {
//     topic: "account",            // short name, printed in the run record
//     capabilityIds: ["cap-1"],    // optional; ids from capabilities.json this
//                                  // module claims (recorded in the run record)
//   };
//
//   export const checks = [
//     {
//       name: "the check's exact sentence",   // same text as capabilities.json `check`
//       only: "account",                      // optional topic filter (--only account)
//       run: async (ctx) => {
//         // ctx: { stack, page, creds, record, attempt, group, ... } as the
//         // runner passes it. Call ctx.record(name, pass, evidence) per assertion.
//         // A thrown error fails the check (the runner's attempt wrapper).
//       },
//     },
//   ];
//
// Rules: one `run` per assertion group; a thrown error is a FAILED check, never
// a fatal. `meta` and `checks` are required; `meta.topic` must be unique across
// modules. Names should match capabilities.json `check` values exactly so the
// coverage report credits the capability.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Reads and validates every checks-*.mjs next to this file, sorted by name. */
export async function loadCheckModules(dir) {
  const files = readdirSync(dir).filter((f) => /^checks-.*\.mjs$/.test(f)).sort();
  const modules = [];
  const topics = new Set();
  for (const file of files) {
    const loaded = await import(pathToFileURL(join(dir, file)).href);
    const { meta, checks } = loaded;
    if (!meta || typeof meta.topic !== "string" || meta.topic === "") {
      throw new Error(`${file}: export const meta with a string topic is required`);
    }
    if (!Array.isArray(checks) || checks.length === 0) {
      throw new Error(`${file}: export const checks must be a non-empty array`);
    }
    if (topics.has(meta.topic)) throw new Error(`${file}: duplicate topic ${meta.topic}`);
    topics.add(meta.topic);
    for (const check of checks) {
      if (!check || typeof check.name !== "string" || typeof check.run !== "function") {
        throw new Error(`${file}: every check needs a string name and a run function`);
      }
      if (check.only !== undefined && typeof check.only !== "string") {
        throw new Error(`${file}: check ${check.name}: only must be a string`);
      }
    }
    modules.push({ file, meta, checks });
  }
  return modules;
}

/**
 * Runs every module's checks whose `only` matches --only (or all when no
 * --only). ctx.attempt is the runner's check wrapper, so a thrown error is a
 * failed check. Returns one line per module for the run record.
 */
export async function runCheckModules(modules, ctx, onlyTopic) {
  const ran = [];
  for (const { file, meta, checks } of modules) {
    const selected = checks.filter((c) => onlyTopic === undefined || c.only === onlyTopic || meta.topic === onlyTopic);
    if (selected.length === 0) continue;
    ctx.group(`checks module ${meta.topic} (${file})`);
    for (const check of selected) {
      await ctx.attempt(check.name, () => check.run(ctx));
    }
    ran.push({ topic: meta.topic, file, checks: selected.length, capabilityIds: meta.capabilityIds ?? [] });
  }
  return ran;
}
