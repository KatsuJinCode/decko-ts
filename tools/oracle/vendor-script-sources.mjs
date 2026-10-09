// tools/oracle/vendor-script-sources.mjs — copy the script sources the site
// script is built from out of the installed Decko gems into fixtures/vendor/,
// byte for byte, with a manifest the engine reads.
//
//   node tools/oracle/vendor-script-sources.mjs <site-script-probe.json> <gems dir>
//
// <site-script-probe.json> is the output of tools/oracle/site-script-probe.rb
// run against the oracle deck: its `items` list is every *all+*script item in
// order, each item's asset groups, and each group's file leaves with the
// base path, the relative path and the sha256 of the content Ruby read.
// <gems dir> holds the installed card-mod-* gems those base paths point into.
//
// Writes:
//   fixtures/vendor/mod-script-assets/<gem>/<path>   one copy per leaf
//   fixtures/vendor/mod-script-assets/manifest.json  the groups in order:
//       { mods: { "<mod name>": [ { group, groupType,
//                                   files: [ { file, name, type, sha256 } ] } ] } }
//   tests/card/assets/fixtures/site-script-oracle.json
//       the oracle digests the tests pin: per item the groups, the leaves'
//       content and compressed-render sha256s, and the assembled input's
//       digest; the whole *all+*script assembled input's digest
//
// Every copy is checked against the sha256 the probe recorded. The sources
// are MIT (jQuery UI, the file upload widget, Bootstrap, the colorpicker) or
// GPL-3.0-or-later (the Decko mods), as in their gems.

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [probeFile, gemsDir] = process.argv.slice(2);
if (!probeFile || !gemsDir) {
  console.error("usage: node tools/oracle/vendor-script-sources.mjs <site-script-probe.json> <gems dir>");
  process.exit(2);
}
const probe = JSON.parse(readFileSync(probeFile, "utf8"));
const GEMS = resolve(gemsDir).replace(/\\/g, "/");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const out = join(root, "fixtures", "vendor", "mod-script-assets");
mkdirSync(out, { recursive: true });
const mods = {};
let files = 0;
for (const item of probe.items) {
  // "mod: ace editor+*script" -> mod "ace_editor": the mod card's codename
  // is mod_<name> (card-mod-assets mod_assets.rb mod_name strips the prefix)
  // and the card name spells the mod name with spaces.
  const modName = item.name.replace(/^mod: /, "").replace(/\+\*script$/, "").replace(/ /g, "_");
  const groups = [];
  for (const group of item.groups) {
    const rows = [];
    for (const leaf of group.leaves) {
      const abs = resolve(leaf.base_path, leaf.db_content).replace(/\\/g, "/");
      if (!abs.startsWith(`${GEMS}/`)) throw new Error(`${abs} is outside ${GEMS}`);
      const rel = relative(GEMS, abs).replace(/\\/g, "/").replace(/^(card-mod-[a-z_]+)-\d+\.\d+\.\d+\//, "$1/");
      const bytes = readFileSync(abs);
      if (sha(bytes) !== leaf.content_sha256) {
        throw new Error(`${rel}: sha256 ${sha(bytes)} differs from the probe's ${leaf.content_sha256}`);
      }
      const dest = join(out, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(abs, dest);
      rows.push({ file: rel, name: leaf.name, type: leaf.type_code, sha256: leaf.content_sha256 });
      files++;
    }
    groups.push({ group: group.name, groupType: group.type_code, files: rows });
  }
  mods[modName] = groups;
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify({ mods }, null, 2)}\n`);
console.log(`mod script files: ${files} in ${Object.keys(mods).length} mods`);

// ---- the tests' oracle fixture (no machine paths: the base paths and the
// work directory stay in the probe, only digests and names ship)
const fixture = {
  whole: probe.whole,
  items: probe.items.map((item) => ({
    name: item.name,
    assembled: item.assembled,
    groups: item.groups.map((group) => ({
      name: group.name,
      leaves: group.leaves.map((leaf) => ({
        name: leaf.name,
        type: leaf.type_code,
        content_sha256: leaf.content_sha256,
        compressed_sha256: leaf.compressed_sha256,
        compressed_length: leaf.compressed_length,
      })),
    })),
  })),
};
const fixturePath = join(root, "tests", "card", "assets", "fixtures", "site-script-oracle.json");
mkdirSync(dirname(fixturePath), { recursive: true });
writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${fixturePath}`);
