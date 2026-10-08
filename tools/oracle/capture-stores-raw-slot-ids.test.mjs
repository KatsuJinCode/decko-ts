// Guard: no Ruby capture or probe script rewrites slot ids before storing
// Ruby's output. The slot id's value is random per render and is masked only
// at compare time (reference-harness/runner/normalize.mjs, N1), with its quote
// style kept; a capture that rewrites it (as the old rigs did, to
// data-slot-id="RANDOMIZED") erases the quote style Ruby wrote, and an engine
// matched to such a reference cannot be graded on it.
//
//   node --test tools/oracle/capture-stores-raw-slot-ids.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = ["tools", "benchmarks"];
const SKIP_DIRS = new Set(["node_modules", ".git", "tmp", "decko-oracle-app"]);

function rubyFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) rubyFiles(p, out);
    else if (name.endsWith(".rb")) out.push(p);
  }
  return out;
}

// A gsub/sub whose pattern is the slot-id regex constant or an inline
// data-slot-id regex.
export const SLOT_REWRITE = /\.g?sub!?\(\s*(?:SLOT_ID_RE\b|\/data-slot-id)/;

test("the rewrite detector sees the old rig forms and passes the raw form", () => {
  assert.match(`  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')`, SLOT_REWRITE);
  assert.match(`html = html.gsub(/data-slot-id=(["'])\\h+\\1/, 'x')`, SLOT_REWRITE);
  assert.match(`html.sub!(SLOT_ID_RE, "")`, SLOT_REWRITE);
  assert.doesNotMatch(`def normalize(html)\n  html\nend`, SLOT_REWRITE);
  assert.doesNotMatch(`SLOT_ID_RE = /data-slot-id=(["'])\\h+\\1/.freeze`, SLOT_REWRITE);
});

test("no Ruby capture or probe script rewrites slot ids", () => {
  const files = ROOTS.flatMap((r) => rubyFiles(path.join(REPO, r)));
  assert.ok(files.length > 20, `expected to scan the capture scripts, found ${files.length}`);
  const offenders = [];
  for (const f of files) {
    readFileSync(f, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (SLOT_REWRITE.test(line)) offenders.push(`${path.relative(REPO, f)}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, []);
});
