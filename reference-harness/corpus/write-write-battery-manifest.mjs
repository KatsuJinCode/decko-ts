#!/usr/bin/env node
// Writes the write-battery-v1 fixture's MANIFEST.json: the sha256 of every
// committed file (the deck, the 70-operation Ruby probe recording, the
// 90-step Ruby scenario recording) and the provenance of how each was made.
// Both battery tests (tests/tools/persist-write-probe.test.ts,
// tests/tools/side-effects-scenario-battery.test.ts) and the recorded-grade
// assertion in tests/exercise/parity-2.test.ts read the manifest and refuse
// to grade against files that do not match it.
//
//   node reference-harness/corpus/write-write-battery-manifest.mjs
//
// Paths are fixed to the fixture this manifest describes; a changed generator
// or a new recording means a new fixture name, per reference-harness/SPEC.md
// section 6.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../fixtures/write-battery-v1/", import.meta.url));

const files = {};
const pin = (rel) => {
  files[rel] = createHash("sha256").update(readFileSync(join(FIXTURE, rel))).digest("hex");
};
const pinTree = (rel) => {
  for (const entry of readdirSync(join(FIXTURE, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) pinTree(child);
    else pin(child);
  }
};
pin("deck.json");
pin("deck/deck.sqlite3");
pinTree("deck/files");
const steps = readdirSync(join(FIXTURE, "expected", "persist-steps"))
  .filter((f) => /^step-\d+\.json$/.test(f))
  .sort();
if (steps.length !== 70) {
  console.error(`expected 70 probe step files, found ${steps.length}; refusing to write the manifest`);
  process.exit(1);
}
for (const step of steps) pin(`expected/persist-steps/${step}`);
pin("expected/persist-steps/ruby-outside-delta.json");
pin("expected/persist-steps/deliberate-differences.json");
pin("expected/side-effects-ruby.json");

// The recordings are content-free (synthetic names only) and carry no host
// paths; the manifest records how each half was made instead.
const manifest = {
  format: "decko-write-battery-fixture-manifest/1",
  fixture: "write-battery-v1",
  files,
  provenance: {
    deck_builder:
      "bash reference-harness/oracle/build-deck.sh reference-harness/fixtures/write-battery-v1 (stock decko setup seed, deck.json applied under the fixture clock, assets pre-compiled), then tools/parity-side-effects/ruby/seed.rb eats the mods' declared data into the copy (the seed's template cards ship without the account and email mods' data)",
    deck_generator:
      "node reference-harness/corpus/generate-write-battery-deck.mjs reference-harness/fixtures/write-battery-v1",
    scenario_recording:
      "bundle exec ruby tools/parity-side-effects/ruby/drive.rb reference-harness/oracle/app <deck.sqlite3> <work> — stdout committed as expected/side-effects-ruby.json",
    probe_recording:
      "bash tools/persistence/run-ruby-steps.sh reference-harness/oracle/app <deck.sqlite3> <out> 70 — per-step dumps committed as expected/persist-steps/",
    oracle: "decko 0.20.0 / card 1.110.0 (reference-harness/oracle/app, stock)",
    data_rule:
      "synthetic content only: invented names, example.com addresses, fixture passwords, generated files",
  },
};

writeFileSync(join(FIXTURE, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote MANIFEST.json with ${Object.keys(files).length} pinned files`);
