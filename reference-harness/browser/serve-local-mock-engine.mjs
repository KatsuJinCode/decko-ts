#!/usr/bin/env node
// serve-local-mock-engine.mjs — boots ONE engine manifest against ONE fixture
// on a throwaway staged deck copy and HOLDS IT OPEN, printing the base URL, so
// a host-override run (--base-url / DECKO_LIVE_BASE; engines/live.json) has a
// LOCAL mock to attach to. This is the rehearsal/proof host for the live-walk
// profile: identical journeys, a deck staged from the same fixture, zero
// requests to any deployed host.
//
//   node reference-harness/browser/serve-local-mock-engine.mjs \
//     --engine reference-harness/browser/engines/ts.json \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     [--base-file <path>]   # write the resolved base URL here for the driver
//
// Stop conditions: a stop file appearing beside the base file (--stop-file,
// default <base-file>.stop), SIGINT or SIGTERM. Stdin is deliberately NOT a
// stop signal: a detached background process (the proof driver's case) has no
// stdin at all, and wiring "stdin closed = stop" made the holder exit the
// moment it was launched that way. Closing stdin is harmless here.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, rmSync } from "node:fs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
for (const k of ["engine", "fixture"]) if (!args[k]) throw new Error(`--${k} is required`);

const engine = loadEngine(resolve(args.engine));
const fixtureDir = resolve(args.fixture);
if (engine.mode === "host-override") throw new Error("the host-override profile attaches to a host; give this tool a booting engine (e.g. engines/ts.json) to serve as the mock");

const server = await startEngine(engine, fixtureDir);
console.log(`[serve-local-mock-engine] engine=${engine.name} fixture=${fixtureDir}`);
console.log(`[serve-local-mock-engine] base=${server.base}`);
const baseFile = args["base-file"] ?? null;
if (baseFile) writeFileSync(baseFile, server.base, "utf8");
const stopFile = args["stop-file"] ?? (baseFile ? `${baseFile}.stop` : null);
console.log(`[serve-local-mock-engine] holding open — touch ${stopFile ?? "(SIGINT)"} to stop it and remove the staged deck`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log(`[serve-local-mock-engine] stopping engine and removing the staged deck`);
  await server.stop();
  if (stopFile && existsSync(stopFile)) rmSync(stopFile, { force: true });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const poll = setInterval(() => {
  if (stopFile && existsSync(stopFile)) { clearInterval(poll); void stop(); }
}, 500);
poll.unref?.();
