// tools/oracle/vendor-style-sources.mjs — copy the style sources a skin's
// stylesheet is built from out of the installed Decko gems into
// fixtures/vendor/, byte for byte, with a manifest the engine reads.
//
//   node tools/oracle/vendor-style-sources.mjs <skin-probe.json> <gems dir>
//
// <skin-probe.json> is the output of tools/oracle/skin-stylesheet-probe.rb
// run against the oracle deck: its `style_mod_leaves` list is every file the
// `style: mods` card's recursed items read, in Ruby's order (the mods named
// by the deck's `style: mods` list, each mod's style groups, each group's
// files), with the sha256 of the content Ruby read. <gems dir> holds the
// installed card-mod-* gems those leaves' base paths point into.
//
// Writes:
//   fixtures/vendor/mod-style-assets/<gem>/<path>   one copy per leaf
//   fixtures/vendor/mod-style-assets/manifest.json  the leaves in order:
//       { mods: { "<mod name>": [ { file, type, sha256 } ] } }
//   fixtures/vendor/bootswatch/<theme>/_variables.scss and _bootswatch.scss
//       for every theme directory in card-mod-bootstrap's vendored
//       bootswatch dist (the files a themed skin reads, bootswatch_skin.rb
//       scss_from_theme_file)
//
// Every copy is checked against the sha256 Ruby recorded; a mismatch stops
// the script. The sources are MIT (Bootstrap, Bootswatch, select2, the
// colorpicker) or GPL-3.0-or-later (the Decko mods), as in their gems.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [probeFile, gemsDir] = process.argv.slice(2);
if (!probeFile || !gemsDir) {
  console.error("usage: node tools/oracle/vendor-style-sources.mjs <skin-probe.json> <gems dir>");
  process.exit(2);
}
const probe = JSON.parse(readFileSync(probeFile, "utf8"));
const GEMS = resolve(gemsDir).replace(/\\/g, "/");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// ---- mod style files
const modOut = join(root, "fixtures", "vendor", "mod-style-assets");
mkdirSync(modOut, { recursive: true });
// Each mod style card lists its groups; each group its files. The leaves
// arrive flattened in the same order, so the groups' file counts split them.
const leaves = [...probe.style_mod_leaves];
const mods = {};
for (const modCard of probe.mod_style_cards) {
  // "mod: api key+*style" -> mod "api_key" (the mod card's codename is
  // mod_<name>; mod_assets.rb mod_name strips the prefix)
  const modName = modCard.name.replace(/^mod: /, "").replace(/\+\*style$/, "").replace(/ /g, "_");
  const files = [];
  for (const group of modCard.items) {
    for (let i = 0; i < group.files.length; i++) {
      const leaf = leaves.shift();
      if (leaf === undefined) throw new Error(`leaf list ended inside ${modCard.name}`);
      const abs = resolve(leaf.base_path, leaf.db_content).replace(/\\/g, "/");
      if (!abs.startsWith(`${GEMS}/`)) throw new Error(`${abs} is outside ${GEMS}`);
      const rel = relative(GEMS, abs).replace(/\\/g, "/").replace(/^(card-mod-[a-z_]+)-\d+\.\d+\.\d+\//, "$1/");
      const bytes = readFileSync(abs);
      if (sha(bytes) !== leaf.sha) throw new Error(`${rel}: sha256 ${sha(bytes)} differs from the oracle's ${leaf.sha}`);
      const dest = join(modOut, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(abs, dest);
      files.push({ file: rel, type: leaf.type, sha256: leaf.sha });
    }
  }
  mods[modName] = files;
}
if (leaves.length > 0) throw new Error(`${leaves.length} leaves left over`);
writeFileSync(join(modOut, "manifest.json"), `${JSON.stringify({ mods }, null, 2)}\n`);
console.log(`mod style files: ${Object.values(mods).flat().length} in ${Object.keys(mods).length} mods`);

// ---- bootswatch themes
const distDir = join(GEMS, "card-mod-bootstrap-0.20.0", "vendor", "bootswatch", "dist");
const themeOut = join(root, "fixtures", "vendor", "bootswatch");
let themes = 0;
for (const theme of readdirSync(distDir).sort()) {
  for (const file of ["_variables.scss", "_bootswatch.scss"]) {
    const src = join(distDir, theme, file);
    if (!existsSync(src)) continue;
    mkdirSync(join(themeOut, theme), { recursive: true });
    copyFileSync(src, join(themeOut, theme, file));
  }
  themes++;
}
const license = join(GEMS, "card-mod-bootstrap-0.20.0", "vendor", "bootswatch", "LICENSE");
if (existsSync(license)) copyFileSync(license, join(themeOut, "LICENSE"));
console.log(`bootswatch themes: ${themes}`);
