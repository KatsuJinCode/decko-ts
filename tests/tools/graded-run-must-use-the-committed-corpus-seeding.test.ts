// graded-run-must-use-the-committed-corpus-seeding.test.ts -- the pin for the
// negative-delta page family (145 page-lane failures, 1,084,985 missing bytes).
//
// WHAT THIS PINS
//   The family's root cause was never the engine and was never a missing fix.
//   The engine's generated `referred_to_by` SQL is correct; the FIX was already
//   committed (search-final lane, 2026-09-29) in the corpus seeding home
//   tests/card/render/raw-corpus-seeding.ts as the "FULL REFERENCE GRAPH PASS".
//   The graded run never loaded it: tools/oracle/dual-lane-direct-runner-core.ts
//   imported the per-worktree STAGING COPY under tmp/ (gitignored,
//   .gitignore:45), which predates the pass. That copy stages 3,184
//   card_references rows where the committed home stages 556,526, so every card
//   a search card queries had no outgoing reference rows and the engine rendered
//   `search-no-results` where the Ruby oracle renders a result list.
//
//   Measured on `media+GBA+YouTube Browser` (page-lane shard 000008):
//     staging copy : expected=110105 actual=16989  delta=-93116
//                    signature {lists:0, items:0, no:2}
//     committed home: expected=110105 actual=103829 delta=-6276
//                    signature {lists:2, items:30, no:0}   <- the oracle's shape
//
//   These are STRUCTURAL pins: they read two source files and assert the wiring.
//   No corpus, no storage boot, no engine render, no Ruby. That is deliberate --
//   the failure this guards is a one-line import path, and a pin that needed the
//   217MB corpus to notice a changed import would be skipped more often than the
//   bug it guards.
//
// Case map (each names the incident behavior it pins):
//   runner import        the graded runner resolves the COMMITTED seeding home
//   no staging copy      the graded runner names NO path under the gitignored
//                        tmp/ instrument tree for the seeding
//   committed home has
//   the reference pass   the module the runner loads carries the full
//                        card_references pass, so the pin cannot pass against a
//                        home that regressed to the partial three-slice seeding
//   exports present      the loaded module's export contract is asserted, the
//                        same one the runner refuses without
//   the stale copy really
//   does lack the pass   the fixture proving the pins above discriminate: the
//                        staging copy's shape FAILS both structural pins, so a
//                        green suite is evidence, not a tautology

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..");

const RUNNER = join(REPO, "tools", "oracle", "dual-lane-direct-runner-core.ts");
const COMMITTED_SEEDING = join(REPO, "tests", "card", "render", "raw-corpus-seeding.ts");
/** The copy the runner used to load. Present in gitignored trees only, so the
 *  fixture below carries its shape inline rather than reading the filesystem. */
const STAGING_COPY_PATH = "tmp/raw-ground-truth/scripts/raw-corpus-seeding.js";

/** The marker of the fix: the pass copies the corpus card_references table
 *  verbatim (all five columns) for every seeded referer. Matched on the
 *  verbatim-insert statement, not the prose, so a comment edit cannot satisfy
 *  the pin and a real removal breaks it. */
const REFERENCE_GRAPH_PASS =
  /INSERT INTO card_references \(id, referer_id, referee_key, referee_id, ref_type, is_present\)/;

/** Source with block and line comments removed and whitespace collapsed, so a
 *  structural assertion reads the CODE a run would execute and is not moved by
 *  a comment that explains the very bug it guards. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/\s+/g, "");
}

describe("the graded run uses the committed corpus seeding", () => {
  it("runner import: resolves the COMMITTED seeding home", () => {
    const runner = readFileSync(RUNNER, "utf8");
    expect(runner).toContain(
      'path.join(REPO_ROOT, "tests", "card", "render", "raw-corpus-seeding.js")',
    );
  });

  it("no staging copy: the runner names NO seeding path under the gitignored tmp/ tree", () => {
    const code = codeOnly(readFileSync(RUNNER, "utf8"));
    // The incident: a run that imports a module git never ships or hashes
    // cannot carry a fix that is committed. This is the assertion that would
    // have failed before the fix.
    //
    // Matched on CODE with comments stripped and across path.join segments,
    // not on a literal substring of the whole file. Both weakenings were
    // falsified against git HEAD before this assertion was settled:
    //   - a plain `toContain` of the joined path passes against the buggy
    //     runner, which spells it `path.join(REPO_ROOT, "tmp",
    //     "raw-ground-truth", "scripts", "raw-corpus-seeding.js")`;
    //   - matching the raw text also fails the FIXED runner, because the fix's
    //     own comment explains the incident in prose. A pin that cannot tell
    //     prose from code is not a pin.
    expect(code).not.toMatch(/tmp[\s\S]{0,160}?raw-corpus-seeding/);
    // ...and positively: the only seeding module the runner LOADS is the
    // committed home.
    expect(code.match(/raw-corpus-seeding/g) ?? []).toHaveLength(1);
  });

  it("committed home has the reference pass: copies card_references verbatim", () => {
    const seeding = readFileSync(COMMITTED_SEEDING, "utf8");
    expect(seeding).toMatch(REFERENCE_GRAPH_PASS);
  });

  it("exports present: the module the runner loads exports the runner's contract", () => {
    const seeding = readFileSync(COMMITTED_SEEDING, "utf8");
    expect(seeding).toMatch(/export\s+const\s+RAW_CORPUS_DB/);
    expect(seeding).toMatch(/export\s+async\s+function\s+createRawStructureSeededStorage/);
  });

  it("the stale copy really does lack the pass: the pins above discriminate", () => {
    // The staging copy, reduced to the two properties the pins test. If this
    // fixture ever passed the structural pins, the suite would be a tautology
    // and a green run would prove nothing.
    const staleCopy = [
      "// raw-corpus-seeding.ts -- 2026-09-24 RAW ground-truth seeding.",
      'const SEEDING = "tmp/raw-ground-truth/scripts/raw-corpus-seeding.js";',
      "for (const ref of refs) { await seedReference(storage, ref.referer_id, ref.referee_id, ref.referee_key); }",
      "for (const ref of setRefs) { await seedReference(storage, ref.referer_id, ref.referee_id, ref.referee_key); }",
      "for (const ref of childRefs) { await seedReference(storage, ref.referer_id, ref.referee_id, ref.referee_key); }",
    ].join("\n");
    expect(staleCopy).toContain(STAGING_COPY_PATH);
    expect(staleCopy).not.toMatch(REFERENCE_GRAPH_PASS);
  });
});
