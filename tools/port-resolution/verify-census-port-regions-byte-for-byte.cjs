// Byte-verification of every region the census port transplanted, against the
// DONOR commit each region came from. This is the containment proof the fold
// window's rule demands: content comparison, never git cherry / patch-id.
//
// Run: node tools/port-resolution/verify-census-port-regions-byte-for-byte.cjs
// Exits 1 if any region diverges or any region cannot be located.
const { execFileSync } = require("child_process");
const fs = require("fs");

const DONOR_REPO = "C:/localProjects/decko-ts-restored";
const ADMIN = "src/card/mod-loader/mods/core-admin-runtime.ts";
const MOD = "src/card/mod-loader/mods/core-mod.ts";
const VIEWS = "src/card/render/views.ts";
const SEED = "tests/card/render/render-test-storage.ts";
const GUARD = "tests/card/render/mod-asset-section-and-permission-inherit-core-pins.test.ts";

const cache = new Map();
function donor(rev, path) {
  const k = rev + ":" + path;
  if (!cache.has(k)) {
    cache.set(k, execFileSync("git", ["show", k], { cwd: DONOR_REPO, maxBuffer: 1e9 }).toString("utf8"));
  }
  return cache.get(k);
}

const REGIONS = [
  ["M2     visibleSettingsForGroup", "43d55e80", VIEWS,
   "  const { code: prototypeCode, templateDerived } = setPrototypeTypeInfo(",
   "    return !templateDerived;\n  });"],
  ["M2ref  setPrototypeTypeInfo+wrapper", "43d55e80", VIEWS,
   "/** The prototype-type resolution WITH its derivation",
   "  return setPrototypeTypeInfo(engine, setCard).code;\n}"],
  ["M3     seeder doc block", "5f4b3084", SEED,
   "/** Direct INSERT (write path is another stream). Every row with a known",
   " *  canonical key column is unchanged).\n"],
  ["M3     seedCard nameColumn", "5f4b3084", SEED,
   "  const hasSides = opts.leftId !== undefined || opts.rightId !== undefined;",
   "  const nameColumn = isCompound && hasSides ? null : (opts.name ?? null);\n"],
  ["M4     MOD_SPECS.account deps", "a639ee62", ADMIN,
   "    // The LIVE-era gemspec's dependency list in declaration order (the",
   '    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list"],\n'],
  ["M4     MOD_SPECS.bootstrap deps", "a639ee62", ADMIN,
   "    // Live-era declaration order (census M4: mod: bootstrap's page bytes ",
   '    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style"],\n'],
  ["M4     MOD_SPECS.edit entry", "a639ee62", ADMIN,
   '  edit: {\n    gem: "card-mod-edit",\n    version: "0.20.0",\n    summary: "decko card editing',
   '    deps: ["card", "card-mod-list", "card-mod-rules"],\n  },\n'],
  ["M4     dependsOn ORDER doc + .sort() retired", "a639ee62", MOD,
   " *  ORDER (census M4, serializer-followup2 2026-10-03 — supersedes the",
   "    .map((name) => `mod_${name.slice(8)}`);\n"],
  ["M5     MOD_ASSET_GROUPS_SRC shades", "0377f4d3", ADMIN,
   "  // Census M5 (serializer-followup2): the graded expected-v2 corpus carries",
   '  style: {\n    styles: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]],\n'],
  ["M6     image :core main? arm", "32fe3163", VIEWS,
   "      // image.rb determine_image_size: voo.size, then the MAIN? arm",
   '      fmt.voo?.opts.size ?? (fmt.isMain ? "large" : "medium"),\n'],
  ["M10    MOD_ASSET_GROUPS_SRC tinymce_editor", "735e6a45", ADMIN,
   '  tabs: { scripts: [["group: local", ["tab.js.coffee"]]] },\n  // Census M10',
   "  },\n};\n"],
];

function region(s, a, b) {
  const i = s.indexOf(a);
  if (i < 0) return null;
  const j = s.indexOf(b, i);
  if (j < 0) return null;
  return s.slice(i, j + b.length);
}

let failures = 0;
for (const [name, rev, path, a, b] of REGIONS) {
  const d = region(donor(rev, path), a, b);
  const x = region(fs.readFileSync(path, "utf8"), a, b);
  let verdict;
  if (d === null) { verdict = "DONOR REGION NOT FOUND"; failures++; }
  else if (x === null) { verdict = "REGION NOT IN TREE"; failures++; }
  else if (d === x) { verdict = "byte-identical (" + d.length + " B)"; }
  else { verdict = "DIVERGENT"; failures++; }
  console.log((failures === 0 && verdict.startsWith("byte") ? "OK   " : "CHECK") + "  " + name.padEnd(46) + rev + "  " + verdict);
}

// The M10 guard file is a whole-blob transplant, so it is compared whole.
{
  const d = execFileSync("git", ["show", "735e6a45:" + GUARD], { cwd: DONOR_REPO, maxBuffer: 1e9 }).toString("utf8");
  const x = fs.readFileSync(GUARD, "utf8");
  const ok = d === x;
  if (!ok) failures++;
  console.log((ok ? "OK   " : "CHECK") + "  " + "M10    guard file (whole blob)".padEnd(46) + "735e6a45  " + (ok ? "byte-identical (" + d.length + " B)" : "DIVERGENT"));
}

console.log(failures === 0 ? "\nALL REGIONS BYTE-IDENTICAL TO DONOR" : "\n" + failures + " REGION(S) NOT BYTE-IDENTICAL");
process.exit(failures === 0 ? 0 : 1);
