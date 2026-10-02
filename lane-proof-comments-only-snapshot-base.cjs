// Comments-only proof for the decko-ts lane-jargon-tranche3 scrub (tests/).
// Adaptation of lane-proof-comments-only.cjs after the 2026-10-02 root-checkout
// deletion accident: the original base commit 12397694 no longer exists as a
// git object in the reconstructed repo (git cat-file: "Not a valid object
// name"), so base bytes are read from an extracted snapshot tree instead.
// Base tree: reconstruction snapshot 79a22b1 (lane-pass20-int tip, byte-faithful),
// cross-validated byte-identical to snapshot 7f5a7f3 (lane-postfix-canvas, which
// sat at base 12397694) across all 459 files under tests/ — two independent
// worktrees agreeing pins the base content for every tests/ file.
// Method unchanged: for each touched .ts file, strip every TS-compiler-lexed
// comment range from the base file and from the working-tree file; the two
// outputs must be byte-identical. Any difference is executable-content drift.
// .rb files are proven separately (hash-strip) — pass them as extra args.
const { createRequire } = require("module");
// decko-ts resolves TypeScript 7 (native port, no JS AST API); use csdm-release's TS 5.9 for the lexer.
const repoRequire = createRequire("C:/localProjects/csdm-release/package.json");
const ts = repoRequire("typescript");
const { execFileSync } = require("child_process");
const fs = require("fs");

const REPO = "C:/localProjects/decko-ts-lane-jargon4";
const BASE_DIR = "C:/Users/jpswi/AppData/Local/Temp/jargon3-basesub/pass20int";
const GIT = "C:/Program Files/Git/cmd/git.exe";

function stripCommentsTs(source, fileName) {
  // Token-scan collection (fixed 2026-10-02): the original AST-walk
  // (ts.forEachChild) missed comments in expression positions (e.g.
  // between array elements), under-stripping both sides and producing a
  // false FAIL on true comment-only edits. A linear scanner pass visits
  // EVERY token, so every comment run is found: each comment is
  // immediately before some token (leading) or on the same line after one
  // (trailing), and getLeading/TrailingCommentRanges return whole runs.
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const seen = new Map(); // pos -> end
  const addAll = (ranges) => { if (ranges) for (const r of ranges) seen.set(r.pos, r.end); };
  // Deep getChildren() walk: unlike ts.forEachChild (which visits only
  // "interesting" children and skips token nodes), getChildren() yields
  // EVERY child including keyword/punctuation tokens, so every comment run
  // — wherever it sits, including expression positions between array
  // elements — is some token's leading/trailing trivia and gets collected.
  const collect = (node) => {
    addAll(ts.getLeadingCommentRanges(source, node.getFullStart()));
    addAll(ts.getTrailingCommentRanges(source, node.end));
    for (const child of node.getChildren(sf)) collect(child);
  };
  collect(sf);
  addAll(ts.getLeadingCommentRanges(source, sf.end));
  const ranges = [...seen.entries()]
    .map(([pos, end]) => ({ pos, end }))
    .sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const r of ranges) out = out.slice(0, r.pos) + out.slice(r.end);
  return { stripped: out, commentCount: ranges.length };
}

// Ruby: strip # line comments (not inside strings — good enough because the
// compare is base-vs-work and both sides go through the same naive stripper;
// any executable drift still changes the stripped bytes unless it is inside a
// string AFTER a # character, which these capture scripts do not have).
function stripCommentsRb(source) {
  return source
    .split("\n")
    .map((l) => {
      const i = l.indexOf("#");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

const rbFiles = process.argv.slice(2);
// Discovery: files differing from the base snapshot 79a22b1 under tests/ —
// covers the whole lane's touches (committed or not), unlike git status,
// which goes clean after each batch commit.
const tsFiles = execFileSync(GIT, ["diff", "--name-only", "79a22b1", "--", "tests/"], { cwd: REPO, encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((f) => f.endsWith(".ts"));

let failures = 0;
for (const f of tsFiles) {
  const base = fs.readFileSync(`${BASE_DIR}/${f}`, "utf8");
  const work = fs.readFileSync(`${REPO}/${f}`, "utf8");
  const a = stripCommentsTs(base, f);
  const b = stripCommentsTs(work, f);
  const same = Buffer.compare(Buffer.from(a.stripped, "utf8"), Buffer.from(b.stripped, "utf8")) === 0;
  if (!same) failures++;
  console.log(`${same ? "PASS" : "FAIL"}  ${f}  (base comments ${a.commentCount}, work comments ${b.commentCount})`);
}
for (const f of rbFiles) {
  const base = fs.readFileSync(`${BASE_DIR}/${f}`, "utf8");
  const work = fs.readFileSync(`${REPO}/${f}`, "utf8");
  const same = Buffer.compare(Buffer.from(stripCommentsRb(base), "utf8"), Buffer.from(stripCommentsRb(work), "utf8")) === 0;
  if (!same) failures++;
  console.log(`${same ? "PASS" : "FAIL"}  ${f}  (rb hash-strip proof)`);
}
console.log(failures === 0 ? "PROOF PASS: executable content byte-identical in all touched files" : `PROOF FAIL: ${failures} file(s) differ`);
process.exit(failures === 0 ? 0 : 1);
