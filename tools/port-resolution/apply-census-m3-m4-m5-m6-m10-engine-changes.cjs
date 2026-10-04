// Port the serializer line's census M3, M4, M5, M6 and M10 engine changes onto
// the fold line, one file-splice per mechanism, each with its own donor rev.
//
// Donor revs (the serializer line, lane-serializer-followup2-2026-10-03):
//   M3  5f4b3084  tests/card/render/render-test-storage.ts   the SEEDER
//   M4  a639ee62  src/card/mod-loader/mods/core-admin-runtime.ts + core-mod.ts
//   M5  0377f4d3  src/card/mod-loader/mods/core-admin-runtime.ts
//   M6  32fe3163  src/card/render/views.ts
//   M10 735e6a45  src/card/mod-loader/mods/core-admin-runtime.ts
//                 + tests/card/render/mod-asset-section-and-permission-inherit-core-pins.test.ts
//
// SCOPE, stated honestly: M3's change is a TEST-SEEDER change, not production
// engine. It alters what tests/card/render/render-test-storage.ts writes into
// the in-test sqlite deck (a side-less compound junction row keeps its stored
// name), so it moves test fixtures across the whole render suite. It is ported
// because the M3 pin is corpus-derived and the corpus graph is shared, but it
// is the one change here whose blast radius is the fixture layer rather than
// the engine.
//
// M10 is TWO changes in one donor commit: the MOD_ASSET_GROUPS_SRC tinymce
// entry, and a repair of an existing guard file
// (mod-asset-section-and-permission-inherit-core-pins.test.ts) whose
// assertion had gone stale when M5 landed. Both are applied; the guard repair
// is only meaningful once M5's shades entry is in, so M5 must be applied first
// (this script does M5 before M10).
//
// BYTE DISCIPLINE. views.ts carries 527 deliberate CRLF carriers and is only
// touched by M6's single-line splice, which is asserted 527/527/0 before AND
// after. The other three files are pure LF on the fold base (0/0/0 measured);
// their splices assert 0/0/0 before AND after so this script cannot silently
// be pointed at a file whose line endings matter.
//
// IDEMPOTENCE. Each splice is a no-op when the donor bytes are already present,
// and every assertion is on the donor's own text, so re-running is safe.
const fs = require("fs");
const { execFileSync } = require("child_process");

const DONOR_REPO = "C:/localProjects/decko-ts-restored";
const donorCache = new Map();
function donorFile(rev, path) {
  const key = `${rev}:${path}`;
  if (!donorCache.has(key)) {
    donorCache.set(
      key,
      execFileSync("git", ["show", `${rev}:${path}`], {
        cwd: DONOR_REPO,
        maxBuffer: 1e9,
      }).toString("latin1"),
    );
  }
  return donorCache.get(key);
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

/** One guarded splice. `expectCrlf` is the house baseline for the file. */
function splice(path, rev, expectCrlf, edits) {
  const before = crlfCounts(fs.readFileSync(path));
  if (before.crlf !== expectCrlf || before.lone !== 0) {
    throw new Error(
      `${path}: pre-condition failed: ${JSON.stringify(before)} want crlf=${expectCrlf} lone=0`,
    );
  }
  let s = fs.readFileSync(path).toString("latin1");
  const donor = donorFile(rev, path);
  let applied = 0;
  for (const [name, foldText, donorAnchor, donorEnd] of edits) {
    // The no-op marker is the donor's END anchor, never its start: several of
    // these replacements share their first line with the fold text (the seeder
    // doc block opens identically on both sides), so a start-anchored
    // "already applied" test would report a no-op on a fresh tree.
    if (s.includes(donorEnd)) {
      console.log(`  ${path} :: ${name} :: already the donor bytes - no-op`);
      continue;
    }
    const at = donor.indexOf(donorAnchor);
    if (at < 0) throw new Error(`${path} :: ${name}: donor anchor not found at ${rev}`);
    const endAt = donor.indexOf(donorEnd, at);
    if (endAt < 0) throw new Error(`${path} :: ${name}: donor end not found at ${rev}`);
    const replacement = donor.slice(at, endAt + donorEnd.length);
    const first = s.indexOf(foldText);
    if (first < 0) throw new Error(`${path} :: ${name}: fold-side text not found`);
    if (s.indexOf(foldText, first + 1) >= 0) {
      throw new Error(`${path} :: ${name}: fold-side text is NOT unique - refusing`);
    }
    s = s.slice(0, first) + replacement + s.slice(first + foldText.length);
    applied++;
  }
  if (applied === 0) return false;
  fs.writeFileSync(path, s, "latin1");
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
      "  const nameColumn = isCompound ? null : (opts.name ?? null);\n",
      "  const hasSides = opts.leftId !== undefined || opts.rightId !== undefined;\n",
      "  const nameColumn = isCompound && hasSides ? null : (opts.name ?? null);\n",
    ],
  ]);
  // The doc block that records WHY (the 23 side-less rows and the
  // name-composition walk). The fold doc block is the same paragraph with one
  // clause added ("SIDE-BACKED junction rows store the key"); the donor
  // appended a whole M3 paragraph after the R4 paragraph, so the replacement
  // runs from the doc's first line to the end of the M3 paragraph.
  const MARK = "SIDE-LESS junction rows keep their stored NAME (census M3,";
  if (fs.readFileSync(SEED, "latin1").includes(MARK)) {
    console.log(`  ${SEED} :: seeder doc block :: already present - no-op`);
    return;
  }
  splice(SEED, "5f4b3084", 0, [
    [
      "seeder doc block",
      "/** Direct INSERT (write path is another stream). Every row with a known\n *  name stores its CANONICAL key; junction rows store the key and keep\n *  name NULL (lead option (b), 2026-09-23, refined by the R4 lane proof):\n",
      "/** Direct INSERT (write path is another stream). Every row with a known\n",
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
      '    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list", "card-mod-integrate", "card-mod-edit"],\n',
      "    // The LIVE-era gemspec's dependency list in declaration order (the\n",
      '    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list"],\n',
    ],
    [
      "MOD_SPECS.bootstrap deps",
      '    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style", "card-mod-script"],\n',
      "    // Live-era declaration order (census M4: mod: bootstrap's page bytes —\n",
      '    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style"],\n',
    ],
    [
      "MOD_SPECS.edit summary+deps",
      '    summary: "Edit handling",\n    description: "",\n    deps: ["card", "card-mod-rules", "card-mod-list"],\n',
      "  edit: {\n    gem: \"card-mod-edit\",\n    version: \"0.20.0\",\n",
      '    deps: ["card", "card-mod-list", "card-mod-rules"],\n',
    ],
  ]);
  splice(MOD, "a639ee62", 0, [
    [
      "dependsOn ORDER doc + .sort() retirement",
      "  const names = [...spec.deps]\n    .sort()\n    .filter((name) => name.startsWith(\"card-mod\"))\n",
      " *  ORDER (census M4, serializer-followup2 2026-10-03 — supersedes the\n",
      "  const names = spec.deps\n    .filter((name) => name.startsWith(\"card-mod\"))\n",
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
      '  style: {\n    styles: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]],\n',
      "  // Census M5 (serializer-followup2): the graded expected-v2 corpus carries\n",
      '        ["group: local", ["decko_logo.js", "decko_org.js.coffee", "snap.js", "snap_svg.js"]],\n    ],\n  },\n',
    ],
  ]);
}

// ---- M6: the image :core branch gains the determine_image_size main? arm ---
function m6() {
  console.log("M6 (32fe3163): views.ts image :core gains the main? -> :large arm");
  splice(VIEWS, "32fe3163", 527, [
    [
      "coreViewBase image size",
      "      // image.rb determine_image_size: voo.size || default_size (:medium).\n      fmt.voo?.opts.size ?? \"medium\",\n",
      "      // image.rb determine_image_size: voo.size, then the MAIN? arm\n",
      "      fmt.voo?.opts.size ?? (fmt.isMain ? \"large\" : \"medium\"),\n",
    ],
  ]);
}

// ---- M10: the tinymce Styles/Scripts section bodies, plus the stale guard ---
function m10() {
  console.log("M10 (735e6a45): MOD_ASSET_GROUPS_SRC gains the tinymce_editor entry; stale shades guard repaired");
  splice(ADMIN, "735e6a45", 0, [
    [
      "MOD_ASSET_GROUPS_SRC tinymce_editor",
      "  tabs: { scripts: [[\"group: local\", [\"tab.js.coffee\"]]] },\n",
      "  // Census M10 (serializer-followup2, the tinymce adjudication): the parent\n",
      "        \"tinymce_config.js.coffee\",\n        ],\n      ],\n    ],\n  },\n",
    ],
  ]);
  // The guard repair: the donor commit also fixed
  // mod-asset-section-and-permission-inherit-core-pins.test.ts, whose
  // "table SILENT for shades" assertion had been failing since M5 landed. On
  // the fold base that file exists, so the donor's version is a real update,
  // not an add. Take the donor's blob for the file and assert it differs.
  const before = fs.readFileSync(GUARD, "latin1");
  const after = donorFile("735e6a45", GUARD);
  if (before === after) {
    console.log(`  ${GUARD} :: the fold base already holds the donor's post-M10 bytes - no-op`);
    return;
  }
  if (after.includes("shades") === false) {
    throw new Error(`${GUARD}: the donor's post-M10 text does not mention shades - refusing`);
  }
  fs.writeFileSync(GUARD, after, "latin1");
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
