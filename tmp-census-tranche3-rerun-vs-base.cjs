// Census re-run for lane-jargon-tranche3 (tests/ scope): rebuilds the
// comment-line census for scope vocabulary over the current worktree tests/
// tree, compares it against attempt-1's committed base census
// (tmp_census_lane_comments.txt, taken at base 12397694), and reports
// fixed / added / remaining with normalized paths so Windows path-separator
// drift cannot misalign the sets. Scope vocabulary: \blane any case on
// comment-looking lines (// /* * #). Output written to
// tmp_census_tranche3_current.txt next to the base census.
const fs = require("fs");
const path = require("path");

const REPO = "C:/localProjects/decko-ts-lane-jargon4";
const BASE_TREE = "C:/Users/jpswi/AppData/Local/Temp/jargon3-basesub/pass20int";
const OUT = path.join(REPO, "tmp_census_tranche3_current.txt");

function census(root, testsSub) {
  const rows = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|rb)$/.test(e.name)) {
        const rel = "tests/" + path.relative(testsSub, p).split(path.sep).join("/");
        fs.readFileSync(p, "utf8").split("\n").forEach((l, i) => {
          if (new RegExp("\\blane", "i").test(l)) {
            const t = l.trim();
            if (/^(\/\/|\/\*|\*|#)/.test(t)) {
              rows.push(rel + ":" + (i + 1) + ":" + l);
            }
          }
        });
      }
    }
  })(testsSub);
  return rows.sort();
}

// Both sides through the IDENTICAL walker+filter: current worktree vs the
// cross-validated base-substitute extract (79a22b1 == 7f5a7f3 == base for
// tests/). No legacy census file in the loop.
const rows = census(REPO, REPO + "/tests");
const base = census(BASE_TREE, BASE_TREE + "/tests");

const baseSet = new Set(base);
const nowSet = new Set(rows);
const fixed = base.filter((l) => !nowSet.has(l));
const added = rows.filter((l) => !baseSet.has(l));

fs.writeFileSync(OUT, rows.join("\n") + "\n");
fs.writeFileSync(OUT.replace(/\.txt$/, "-fixed-vs-base.txt"), fixed.join("\n") + "\n");
console.log("base census lines:", base.length);
console.log("current census lines:", rows.length);
console.log("fixed (in base, absent now):", fixed.length);
console.log("added (absent in base, present now):", added.length);
if (added.length) console.log("--- ADDED ---\n" + added.join("\n"));
