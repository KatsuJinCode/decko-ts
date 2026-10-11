// format-census-view-set — the enumerator is asserted against RUBY'S OWN
// PARSER, not against a hand-kept list and not against the harness's own
// committed artifact.
//
// WHY THIS EXISTS (r2-phantom-rows lane, 2026-10-06). mod-harness.mjs's
// `mineViews` loop miner (`loopRe`) matched any `%i[a b c].each do |var|`
// and pushed every element as a `view:` row WITHOUT gating on the
// `view <blockvar>` look-ahead it had already computed. On card-mod-format
// that minted two rows for set/all/links.rb:146-152:
//
//     def interpret_data_opts_to_link_to opts
//       %i[remote method].each do |key|
//         next unless (val = opts.delete key)
//         opts["data-#{key}"] = val
//       end
//     end
//
// A private `link_to` option walk. No view named `remote` or `method` exists
// in the gem, and no such view is reachable. Both census rows were
// manufactured — the coverage ledger was carrying two obligations that do not
// exist.
//
// The oracle is tools/mod-porting-harness/ruby-oracles/card-mod-format/
// format-census-views.rb: Ripper (Ruby's stdlib parser) over the gem's
// set/*.rb. It counts a view only where a `view` CALL actually is —
// `view :name` direct, or `view <blockvar>` inside a `%i[...].each do
// |<blockvar>|` block. A `.each` block whose body declares no `view` call
// declares no views, whatever the array holds. Ripper is the independence
// that matters: the regex cannot see the difference between "an array of view
// names" and "an array of link_to option keys", and a parser can.
//
// RED DISCIPLINE: against the unfixed miner the two manufactured names fail
// this test and nothing else does — that failure IS the harness working. The
// diff is asserted as a set equality, not as a count, so a compensating
// omission could not hide behind it.
//
// SCOPE: card-mod-format's set/ tree, the format class named by the ask. The
// gem is read READ-ONLY; Ruby does no Rails boot, no DB, no network.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { describeOrSkipLoud } from "../../../tests/support/describe-with-corpus.js";
import { mineViews } from "../../../tools/mod-porting-harness/mod-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(dirname(HERE))); // tests/tools/mod-porting-harness -> repo root

// Same frozen gem set the harness mines (mod-harness.mjs GEM_DIR).
const GEM_DIR = "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems";
const GEM_PATH = join(GEM_DIR, "card-mod-format-0.20.0");
// Ruby's Dir.glob treats a backslash as an ESCAPE, not a path separator, so
// node's win32 join() output silently globs zero files. The oracle is handed
// a POSIX path for that reason — without it the oracle reports an EMPTY
// census and every set-equality below passes vacuously.
const GEM_PATH_FOR_RUBY = GEM_PATH.replaceAll("\\", "/");
const ORACLE = join(
  REPO,
  "tools",
  "mod-porting-harness",
  "ruby-oracles",
  "view-census-views.rb",
).replaceAll("\\", "/");

interface RubyViewRow {
  name: string;
  file: string;
  line: number;
  viaLoop: boolean;
}
interface RubyCensus {
  gem: string;
  views: RubyViewRow[];
  shadowedLoopVars: unknown[];
  unresolvedViewArgs: unknown[];
  totals: { files: number; views: number; loopDeclared: number };
}

/** walkFiles(root, ".rb") + .sort() — mod-harness.mjs's own file order. */
function rbFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".rb")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function rubyCensus(): RubyCensus {
  const res = spawnSync("ruby", [ORACLE, GEM_PATH_FOR_RUBY], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`ruby oracle failed (${res.status}): ${res.stderr}`);
  }
  return JSON.parse(res.stdout) as RubyCensus;
}

// GEM_DIR is the oracle machine's absolute gem path baked into this suite
// (and into mod-harness.mjs): on a machine without that tree the census walk
// below throws ENOENT and the suite fails red on a host it has never
// supported. Skip loudly instead — the fixture records a machine-specific
// compile verification against that gem checkout.
//
// THE GATE CHECKS THE DIRECTORY THE WALK ACTUALLY READS, NOT ITS PARENT.
// Checking existsSync(GEM_PATH) alone was not enough: rbFiles() below walks
// join(GEM_PATH, "set"), and the oracle is handed GEM_PATH as its root. A
// gem checkout present but without its `set/` subdirectory — a partial gem
// install, an interrupted copy, a stub directory — passes an
// existsSync(GEM_PATH) gate and then dies in readdirSync with ENOENT. That is
// a red suite on a host the gate was written to protect, and the failure
// names a missing directory rather than the missing prerequisite, so it reads
// as a real defect. Both paths are checked here, and the `set/` requirement is
// the stronger of the two (it implies the gem directory exists).
const GEM_TREE_PRESENT = existsSync(join(GEM_PATH, "set"));

describeOrSkipLoud(
  !GEM_TREE_PRESENT,
  "tests/tools/mod-porting-harness/format-census-view-set.test.ts",
  `the recorded gem tree is present at ${join(GEM_PATH, "set").replaceAll("\\", "/")} — the fixture records a machine-specific compile verification: the view census is mined from the oracle machine's card-mod-format checkout at an absolute path, absent here`,
)("card-mod-format view census == Ruby's view set", () => {
  const ruby = rubyCensus();
  const setFiles = rbFiles(join(GEM_PATH, "set"));
  const mined = setFiles.flatMap((full) => {
    const rel = relative(GEM_PATH, full).replaceAll("\\", "/");
    return mineViews(readFileSync(full, "utf8"), rel);
  });

  const rubyNames = ruby.views.map((v) => v.name);
  const minedNames = mined.map((v) => v.name);

  // The oracle must itself be TOTAL and non-empty: an unresolved binding, a
  // shadowed loop variable, or a silently empty census would mean the set
  // comparisons below are comparing partial sets — or nothing at all.
  it("the Ruby oracle walks every set file and resolves every view call", () => {
    expect(ruby.unresolvedViewArgs).toEqual([]);
    expect(ruby.shadowedLoopVars).toEqual([]);
    expect(ruby.totals.files).toBe(setFiles.length);
    expect(setFiles.length).toBeGreaterThan(0);
    expect(ruby.totals.views).toBe(rubyNames.length);
    expect(ruby.totals.views).toBeGreaterThan(0);
  });

  it("mines no view Ruby does not declare", () => {
    expect([...new Set(minedNames)].filter((n) => !rubyNames.includes(n)).sort()).toEqual([]);
  });

  it("misses no view Ruby declares", () => {
    expect([...new Set(rubyNames)].filter((n) => !minedNames.includes(n)).sort()).toEqual([]);
  });

  it("names no view that is not a real `view` call in the gem source", () => {
    // The named phantoms, pinned so a regression is legible rather than a
    // count difference. card-mod-format-0.20.0/set/all/links.rb:146-152 is a
    // `link_to` option walk — `interpret_data_opts_to_link_to`.
    for (const phantom of ["remote", "method"]) {
      expect(minedNames).not.toContain(phantom);
      expect(rubyNames).not.toContain(phantom);
      expect(ruby.views.some((v) => v.file === "set/all/links.rb" && v.name === phantom)).toBe(
        false,
      );
    }
  });

  it("counts the same number of set files the harness walks", () => {
    expect(ruby.totals.files).toBe(setFiles.length);
  });
});