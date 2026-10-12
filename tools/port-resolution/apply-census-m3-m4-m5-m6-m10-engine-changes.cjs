// Apply five engine changes to the tree, one file-splice per mechanism, each
// read from its own source revision (the revisions are named at each splice).
//
// WHAT EACH MECHANISM TOUCHES:
//   m3   tests/card/render/render-test-storage.ts   the SEEDER
//   m4   src/card/mod-loader/mods/core-admin-runtime.ts + core-mod.ts
//   m5   src/card/mod-loader/mods/core-admin-runtime.ts
//   m6   src/card/render/views.ts
//   m10  src/card/mod-loader/mods/core-admin-runtime.ts
//        + tests/card/render/mod-asset-section-and-permission-inherit-core-pins.test.ts
//
// SCOPE, stated honestly: m3's change is a TEST-SEEDER change, not production
// engine. It alters what tests/card/render/render-test-storage.ts writes into
// the in-test sqlite deck (a side-less compound junction row keeps its stored
// name), so it moves test fixtures across the whole render suite. It is applied
// because the m3 pin is corpus-derived and the corpus graph is shared, but it
// is the one change here whose blast radius is the fixture layer rather than
// the engine.
//
// m10 is TWO changes in one revision: the MOD_ASSET_GROUPS_SRC tinymce
// entry, and a repair of an existing guard file
// (mod-asset-section-and-permission-inherit-core-pins.test.ts) whose
// assertion had gone stale when m5 landed. Both are applied; the guard repair
// is only meaningful once m5's shades entry is in, so m5 must be applied first
// (this script does m5 before m10).
//
// BYTE DISCIPLINE. views.ts carries 527 deliberate CRLF line endings and is only
// touched by m6's single-line splice, which is asserted 527/527/0 before AND
// after. The other three files are pure LF (0/0/0 measured);
// their splices assert 0/0/0 before AND after so this script cannot silently
// be pointed at a file whose line endings matter.
//
// IDEMPOTENCE. Each splice is a no-op when the source bytes are already present,
// and every assertion is on the source's own text, so re-running is safe.
const fs = require("fs");
const { execFileSync } = require("child_process");

const DONOR_REPO = "C:/localProjects/decko-ts-restored";
const donorCache = new Map();
function donorFile(rev, path) {
  const key = `${rev}:${path}`;
  if (!donorCache.has(key)) {
    donorCache.set(key, readText(execFileSync("git", ["show", `${rev}:${path}`], {
      cwd: DONOR_REPO,
      maxBuffer: 1e9,
    }), path));
  }
  return donorCache.get(key);
}

/** Read a file (or a git-show buffer) as UTF-8, after PROVING the decode is
 *  lossless: decode, re-encode, and require the bytes back. If a file were not
 *  valid UTF-8 this throws instead of silently substituting U+FFFD and writing
 *  a corrupted file. This is why the anchors below can carry em-dashes and
 *  other multi-byte characters and still match the donor exactly. */
function readText(buf, label) {
  const s = buf.toString("utf8");
  if (!Buffer.from(s, "utf8").equals(buf)) {
    throw new Error(
      `${label}: not valid UTF-8 (decode/encode is not lossless). Refusing to write - a lossy decode would corrupt the file.`,
    );
  }
  return s;
}

function crlfCounts(buf) {
  let cr = 0;
  let crlf = 0;
  let lone = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 13) {
      cr++;
      if (buf[i + 1] === 10) crlf++;
      else lone++;
    }
  }
  return { cr, crlf, lone };
}

/** STRUCTURAL WEIGHT: the net brace DELTA of a region (opens minus closes).
 *  A legitimate splice replaces one region with another of the same shape, so
 *  the deltas must match. Counting only lines that START with a brace - the
 *  first version of this guard - was too weak: `function f() {` starts with
 *  `f`, so a donor region that carried a whole function scored 0 and sailed
 *  through a fold region that was one comment line. That bug landed twice in
 *  this script (MOD_SPECS.edit's block head, then dependsOn's function), so
 *  the guard now counts braces anywhere on the line.
 *
 *  The known limit, stated rather than hidden: a brace inside a string
 *  literal or a code example inside a comment is counted too. That can mask an
 *  imbalance, which is why the pair of regions is also checked by the byte
 *  verification (tools/port-resolution/verify-census-port-regions-byte-for-byte.cjs)
 *  and by tsc. */
function structuralWeight(region) {
  let n = 0;
  for (let i = 0; i < region.length; i++) {
    if (region[i] === "{") n++;
    else if (region[i] === "}") n--;
  }
  return n;
}

/** One guarded splice. `expectCrlf` is the house baseline for the file. */
function splice(path, rev, expectCrlf, edits) {
  const before = crlfCounts(fs.readFileSync(path));
  if (before.crlf !== expectCrlf || before.lone !== 0) {
    throw new Error(
      `${path}: pre-condition failed: ${JSON.stringify(before)} want crlf=${expectCrlf} lone=0`,
    );
  }
  let s = readText(fs.readFileSync(path), path);
  const donor = donorFile(rev, path);
  // The PRISTINE fold base for this file, used to prove each edit's no-op
  // marker is a real discriminator. Without this the "already applied" test
  // can be fooled by a marker that the fold base already carries - which it
  // did twice in this script's earlier runs: the dependsOn `.map` line and the
  // `  },\n};` table terminator are common to both sides, so using them as
  // markers reported a no-op on a tree where the change had never been made.
  const pristine = readText(
    execFileSync("git", ["show", `d39da609:${path}`], {
      cwd: DONOR_REPO,
      maxBuffer: 1e9,
    }),
    `d39da609:${path}`,
  );
  let applied = 0;
  for (const [name, mode, foldStart, donorAnchor, donorEnd, noOpMarker, foldEnd] of edits) {
    // The no-op marker must be a line the DONOR carries and the PRISTINE fold
    // base does not. If it cannot discriminate, the no-op test is meaningless
    // and the script refuses rather than silently skipping the change.
    if (!donor.includes(noOpMarker)) {
      throw new Error(`${path} :: ${name}: the no-op marker is not in the donor at ${rev}: ${JSON.stringify(noOpMarker.slice(0, 70))}`);
    }
    if (pristine.includes(noOpMarker)) {
      throw new Error(`${path} :: ${name}: the no-op marker is ALSO in the pristine fold base d39da609, so it cannot discriminate: ${JSON.stringify(noOpMarker.slice(0, 70))}. Pick a line the donor introduced.`);
    }
    if (s.includes(noOpMarker)) {
      console.log(`  ${path} :: ${name} :: already the donor bytes - no-op`);
      continue;
    }
    const at = donor.indexOf(donorAnchor);
    if (at < 0) throw new Error(`${path} :: ${name}: donor anchor not found at ${rev}`);
    const endAt = donor.indexOf(donorEnd, at);
    if (endAt < 0) throw new Error(`${path} :: ${name}: donor end not found at ${rev}`);
    const replacement = donor.slice(at, endAt + donorEnd.length);
    // The FOLD region. When the edit supplies `foldEnd`, the fold region is
    // computed as everything from `foldStart` to `foldEnd` in THIS file, so the
    // two regions provably span the same logical boundary without the author
    // hand-typing the fold side (which is how a 13-line doc block came to be
    // anchored on its first line and strand the other 12). With no `foldEnd`,
    // `foldStart` IS the whole fold region.
    const foldAt = s.indexOf(foldStart);
    if (foldAt < 0) throw new Error(`${path} :: ${name}: fold-side start not found`);
    if (s.indexOf(foldStart, foldAt + 1) >= 0) {
      throw new Error(`${path} :: ${name}: fold-side start is NOT unique - refusing`);
    }
    let foldRegion = foldStart;
    if (foldEnd !== undefined) {
      const foldEndAt = s.indexOf(foldEnd, foldAt);
      if (foldEndAt < 0) throw new Error(`${path} :: ${name}: fold-side end not found`);
      foldRegion = s.slice(foldAt, foldEndAt + foldEnd.length);
    }
    // Two modes, because these changes are two different things:
    //   "replace" - one region becomes another of the SAME shape (a data
    //     entry for a data entry, a doc block plus a function for the same).
    //     The brace deltas must match, or the donor anchor sits at a different
    //     point in the donor than the fold anchor sits in this file and the
    //     splice duplicates or strands structure until the file stops parsing.
    //     That bug landed twice in this script's earlier runs.
    //   "insert" - a NEW key is added to an object, so the delta legitimately
    //     grows. The guard is instead that the donor region CARRIES the fold
    //     anchor at one of its ends: the region is the anchor plus adjacent new
    //     content, which is what makes the insertion well-formed.
    const wFold = structuralWeight(foldRegion);
    const wDonor = structuralWeight(replacement);
    if (mode === "replace" && wFold !== wDonor) {
      throw new Error(
        `${path} :: ${name}: replace-mode regions are not the same SHAPE (brace delta ${wDonor} vs ${wFold}). Re-anchor both sides on the SAME logical boundary or the splice duplicates or strands structure.`,
      );
    }
    if (
      mode === "insert" &&
      !replacement.startsWith(foldRegion) &&
      !replacement.endsWith(foldRegion)
    ) {
      throw new Error(
        `${path} :: ${name}: insert-mode donor region does not CARRY the fold anchor at either end. An insertion is the anchor plus adjacent new content; if the region neither starts nor ends with the anchor, the splice duplicates or drops structure. Got a region spanning ${JSON.stringify(replacement.slice(0, 40))} ... ${JSON.stringify(replacement.slice(-40))}.`,
      );
    }
    s = s.slice(0, foldAt) + replacement + s.slice(foldAt + foldRegion.length);
    applied++;
  }
  if (applied === 0) return false;
  fs.writeFileSync(path, s, "utf8");
  const after = crlfCounts(fs.readFileSync(path));
  if (after.crlf !== expectCrlf || after.lone !== 0) {
    throw new Error(
      `${path}: POST-CONDITION FAILED - CRLF changed ${JSON.stringify(before)} -> ${JSON.stringify(after)} want crlf=${expectCrlf} lone=0. Stop.`,
    );
  }
  console.log(
    `  ${path} :: ${applied} splice(s) from ${rev}; CRLF ${before.crlf}/${before.lone} -> ${after.crlf}/${after.lone} (${expectCrlf}/0 held)`,
  );
  return true;
}

const ADMIN = "src/card/mod-loader/mods/core-admin-runtime.ts";
const MOD = "src/card/mod-loader/mods/core-mod.ts";
const VIEWS = "src/card/render/views.ts";
const SEED = "tests/card/render/render-test-storage.ts";
const GUARD = "tests/card/render/mod-asset-section-and-permission-inherit-core-pins.test.ts";

const mechanisms = process.argv.slice(2);
if (mechanisms.length === 0) {
  throw new Error(
    "name the mechanisms to apply, e.g. m3 m4 m5 m6 m10 - this script never applies all five blindly",
  );
}

// ---- M3: the seeder keeps the stored name on side-less compound rows -------
function m3() {
  console.log("M3 (5f4b3084): the seeder's name-NULL convention, narrowed to SIDE-BACKED junctions");
  // The functional line. Fold base (read at render-test-storage.ts:225-226):
  //   const isCompound = hasName && opts.name!.includes("+");
  //   const nameColumn = isCompound ? null : (opts.name ?? null);
  splice(SEED, "5f4b3084", 0, [
    [
      "seedCard nameColumn",
      "replace",
      "  const nameColumn = isCompound ? null : (opts.name ?? null);\n",
      "  const hasSides = opts.leftId !== undefined || opts.rightId !== undefined;\n",
      "  const nameColumn = isCompound && hasSides ? null : (opts.name ?? null);\n",
      "  const nameColumn = isCompound && hasSides ? null : (opts.name ?? null);\n",
    ],
  ]);
  // The doc block that records WHY (the side-less rows and the
  // name-composition walk). The tree's doc block is the same paragraph with
  // one clause added ("SIDE-BACKED junction rows store the key"); the source
  // appended a further paragraph after the tree's, so the replacement
  // runs from the doc's first line to the end of that appended paragraph.
  const MARK = "SIDE-LESS junction rows keep their stored NAME (census M3,";
  if (readText(fs.readFileSync(SEED), SEED).includes(MARK)) {
    console.log(`  ${SEED} :: seeder doc block :: already present - no-op`);
    return;
  }
  splice(SEED, "5f4b3084", 0, [
    [
      "seeder doc block",
      "replace",
      "/** Direct INSERT (write path is another stream). Every row with a known\n *  name stores its CANONICAL key; junction rows store the key and keep\n *  name NULL (lead option (b), 2026-09-23, refined by the R4 lane proof):\n",
      "/** Direct INSERT (write path is another stream). Every row with a known\n",
      " *  canonical key column is unchanged).\n",
      " *  canonical key column is unchanged).\n",
    ],
  ]);
}

// ---- M4: Depends-on renders the live gemspec's declaration order ------------
function m4() {
  console.log("M4 (a639ee62): MOD_SPECS membership+order realigned, the dependsOn .sort() retired");
  splice(ADMIN, "a639ee62", 0, [
    [
      "MOD_SPECS.account deps",
      "replace",
      '    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list", "card-mod-integrate", "card-mod-edit"],\n',
      "    // The LIVE-era gemspec's dependency list in declaration order (the\n",
      '    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list"],\n',
      "    // The LIVE-era gemspec's dependency list in declaration order (the\n",
    ],
    [
      "MOD_SPECS.bootstrap deps",
      "replace",
      '    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style", "card-mod-script"],\n',
      "    // Live-era declaration order (census M4: mod: bootstrap's page bytes ",
      '    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style"],\n',
      "    // Live-era declaration order (census M4: mod: bootstrap's page bytes ",
    ],
    [
      // Symmetric regions: the WHOLE MOD_SPECS.edit entry on both sides. The
      // first run anchored the fold at `summary:` and the donor at the block
      // head, so the donor's `gem:`/`version:` lines were re-inserted beside
      // the originals and the table stopped parsing.
      "MOD_SPECS.edit entry",
      "replace",
      '  edit: {\n    gem: "card-mod-edit",\n    version: "0.20.0",\n    summary: "Edit handling",\n    description: "",\n    deps: ["card", "card-mod-rules", "card-mod-list"],\n  },\n',
      '  edit: {\n    gem: "card-mod-edit",\n    version: "0.20.0",\n    summary: "decko card editing and card type management",\n',
      '    deps: ["card", "card-mod-list", "card-mod-rules"],\n  },\n',
      '    summary: "decko card editing and card type management",\n',
    ],
  ]);
  // The common tail both regions end on, so the two regions span the same
  // logical boundary: the whole ORDER doc, the whole function head, and the
  // whole name-mapping body. The .map line is identical on both sides, which
  // is what makes it a valid shared end anchor.
  const MAP_LINE = "    .map((name) => `mod_${name.slice(8)}`);\n";
  splice(MOD, "a639ee62", 0, [
    [
      // Symmetric regions: the WHOLE ORDER doc + dependsOn on both sides. The
      // first run anchored the fold at the `const names` lines and the donor at
      // the ORDER doc, so the donor's function signature and
      // `if (spec === undefined)` were re-inserted inside the function body.
      "dependsOn ORDER doc + .sort() retirement",
      "replace",
      // The fold region must be the WHOLE old doc + function, not just the
      // ORDER line. An earlier run used the single ORDER line as the fold
      // anchor, which left the rest of the fold's doc block stranded after the
      // transplanted block and broke the parse.
      " *  ORDER (mm-cstructural, 2026-09-30 — a real bug this lane fixed): the\n",
      " *  ORDER (census M4, serializer-followup2 2026-10-03 — supersedes the\n",
      MAP_LINE,
      " *  ORDER (census M4, serializer-followup2 2026-10-03 — supersedes the\n",
      // foldEnd: the fold region runs from the old ORDER line to the shared
      // .map tail, so all 13 lines of the old doc leave with it.
      MAP_LINE,
    ],
  ]);
}

// ---- M5: mod: shades Scripts section renders the four-file local group ------
function m5() {
  console.log("M5 (0377f4d3): MOD_ASSET_GROUPS_SRC gains the shades scripts entry");
  // The fold base's MOD_ASSET_GROUPS_SRC ends `... search, style, tabs };` and
  // the donor inserts `shades` BETWEEN search and style (verified by reading
  // both sides: the donor's search->style gap carries the M5 block). The
  // insertion point is the `style:` key, which is unique in the file.
  splice(ADMIN, "0377f4d3", 0, [
    [
      "MOD_ASSET_GROUPS_SRC shades",
      "insert",
      '  style: {\n    styles: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]],\n',
      "  // Census M5 (serializer-followup2): the graded expected-v2 corpus carries\n",
      '      ["group: local", ["decko_logo.js", "decko_org.js.coffee", "snap.js", "snap_svg.js"]],\n    ],\n  },\n  style: {\n    styles: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]],\n',
      "  // Census M5 (serializer-followup2): the graded expected-v2 corpus carries\n",
    ],
  ]);
}

// ---- M6: the image :core branch gains the determine_image_size main? arm ---
function m6() {
  console.log("M6 (32fe3163): views.ts image :core gains the main? -> :large arm");
  splice(VIEWS, "32fe3163", 527, [
    [
      "coreViewBase image size",
      "replace",
      "      // image.rb determine_image_size: voo.size || default_size (:medium).\n      fmt.voo?.opts.size ?? \"medium\",\n",
      "      // image.rb determine_image_size: voo.size, then the MAIN? arm\n",
      "      fmt.voo?.opts.size ?? (fmt.isMain ? \"large\" : \"medium\"),\n",
      '      fmt.voo?.opts.size ?? (fmt.isMain ? "large" : "medium"),\n',
    ],
  ]);
}

// ---- M10: the tinymce Styles/Scripts section bodies, plus the stale guard ---
function m10() {
  console.log("M10 (735e6a45): MOD_ASSET_GROUPS_SRC gains the tinymce_editor entry; stale shades guard repaired");
  splice(ADMIN, "735e6a45", 0, [
    [
      "MOD_ASSET_GROUPS_SRC tinymce_editor",
      "insert",
      // The donor puts tinymce_editor AFTER the tabs key, so the donor region
      // is the tabs anchor FOLLOWED BY the new block - the mirror of M5, where
      // the new block precedes the anchor. foldText and donorAnchor are the
      // same line here by construction: the insertion is anchored on the key
      // the new block lands against.
      "  tabs: { scripts: [[\"group: local\", [\"tab.js.coffee\"]]] },\n",
      "  tabs: { scripts: [[\"group: local\", [\"tab.js.coffee\"]]] },\n",
      "  },\n",
      "  // Census M10 (serializer-followup2, the tinymce adjudication): the parent\n",
    ],
  ]);
  // The guard repair: the donor commit also fixed
  // mod-asset-section-and-permission-inherit-core-pins.test.ts, whose
  // "table SILENT for shades" assertion had been failing since M5 landed. On
  // the fold base that file exists, so the donor's version is a real update,
  // not an add. Take the donor's blob for the file and assert it differs.
  const before = readText(fs.readFileSync(GUARD), GUARD);
  const after = donorFile("735e6a45", GUARD);
  if (before === after) {
    console.log(`  ${GUARD} :: the fold base already holds the donor's post-M10 bytes - no-op`);
    return;
  }
  if (after.includes("shades") === false) {
    throw new Error(`${GUARD}: the donor's post-M10 text does not mention shades - refusing`);
  }
  fs.writeFileSync(GUARD, after, "utf8");
  console.log(
    `  ${GUARD} :: replaced wholesale with 735e6a45's blob (${before.length} -> ${after.length} bytes); verified the donor text carries the post-M5 shades truth`,
  );
}

const table = { m3, m4, m5, m6, m10 };
for (const m of mechanisms) {
  const fn = table[m];
  if (fn === undefined) throw new Error(`unknown mechanism: ${m}`);
  fn();
}
console.log("census M3/M4/M5/M6/M10 splices: done");
