// Feature inventory over every .haml template the deck's gems ship (the
// concrete template set that `haml card.content` / `haml :group_list` compile).
// Read-only. Usage: GEM_HOME=<ruby gems root> node tools/haml-slice/haml-feature-inventory.mjs

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// The gem home is machine-local; it comes from the environment (the standard
// GEM_HOME, whose gems/ subfolder holds the installed gems) and every path
// this tool prints is displayed relative to that gems folder.
const GEMROOT = process.env.GEM_HOME ? join(process.env.GEM_HOME, "gems") : undefined;
if (!GEMROOT || !existsSync(GEMROOT)) {
  console.error(
    "haml-feature-inventory: set GEM_HOME to the Ruby gem home " +
      "(e.g. <ruby>/lib/ruby/gems/3.3.0 -- the installed gems live under its " +
      "gems/ subfolder)",
  );
  process.exit(2);
}
const DIRS = readdirSync(GEMROOT).filter(
  (d) => d === "card-1.110.0" || /^card-mod-.*-0\.20\.0$/.test(d),
);
const displayPath = (f) => relative(GEMROOT, f).replaceAll(sep, "/");

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".haml")) files.push(p);
  }
};
for (const d of DIRS) walk(join(GEMROOT, d));
files.sort();

const feat = new Map();
const add = (k, file, line, text) => {
  if (!feat.has(k)) feat.set(k, []);
  feat.get(k).push({ file, line, text });
};

const tagNames = new Map();
const attrs = new Map();
let nLines = 0;

for (const f of files) {
  const rel = displayPath(f);
  const src = readFileSync(f, "utf8");
  src.split("\n").forEach((raw, i) => {
    nLines += 1;
    const line = raw.replace(/\r$/, "");
    const t = line.trim();
    if (t === "") return;
    if (/^!!!/.test(t)) add("doctype", rel, i + 1, t);
    if (/^%\{/.test(t) || /^\{/.test(t) && !/^[%.#]/.test(t)) add("interpolation-first", rel, i + 1, t);
    if (/^-#\{/.test(t)) add("filter", rel, i + 1, t);
    if (/^-#/.test(t) && !/^-#\{/.test(t)) add("silent-comment", rel, i + 1, t);
    if (/^-#\[/.test(t)) add("multiline-comment", rel, i + 1, t);
    if (/^-\s*[A-Za-z_]/.test(t) || /^-\s*if/.test(t) || /^-\s*end\b/.test(t))
      add("silent-code", rel, i + 1, t);
    if (/^\/[^ ]/.test(t)) add("escaped-html", rel, i + 1, t);
    if (/^&[^ ]/.test(t)) add("unescaped-html", rel, i + 1, t);
    if (/^\.\s/.test(t)) add("nested-div-dot", rel, i + 1, t);
    if (/^=[^=]/.test(t)) add("output", rel, i + 1, t);
    if (/^==/.test(t)) add("unescaped-output", rel, i + 1, t);
    if (/^~\s/.test(t)) add("not-tag-notch", rel, i + 1, t);
    if (/^\|/.test(t)) add("multiline-text-block", rel, i + 1, t);
    if (/^\s*:\w/.test(line)) add("filter-or-attrs", rel, i + 1, t);
    if (/^\s*\{\.\w/.test(line)) add("merged-class", rel, i + 1, t);
    if (/\bdo\s+\w+/.test(t)) add("do-block", rel, i + 1, t);
    if (/\bif\s/.test(t) || /\bunless\s/.test(t) || /\belse\b/.test(t))
      add("conditional", rel, i + 1, t);
    if (/\beach\b|\.each\b/.test(t)) add("iteration", rel, i + 1, t);
    if (/\bcapture\b/.test(t)) add("capture", rel, i + 1, t);
    if (/\bhelper\b/.test(t)) add("helper", rel, i + 1, t);
    if (/^\s*- \w+\(/.test(line) || /\bcard\./.test(t) || /\bvoo\./.test(t))
      add("ruby-ctx", rel, i + 1, t);
    // tag lines
    const tm = /^%([\w:-]+)/.exec(t);
    if (tm) tagNames.set(tm[1], (tagNames.get(tm[1]) ?? 0) + 1);
    // attribute hashes on tag lines
    for (const am of line.matchAll(/\{([^}]*)\}/g)) {
      for (const pair of am[1].split(/[,;]\s*/)) {
        const key = /^\s*([\w-]+)\s*[=:]/.exec(pair) || /^\s*"([^"]+)"/.exec(pair);
        if (key) attrs.set(key[1], (attrs.get(key[1]) ?? 0) + 1);
        add("attr-hash", rel, i + 1, pair.trim());
      }
    }
    if (/^%[\w:-]*\s+\{?[\w-]+=['"]/.test(t) || /^%[\w:-]+\.[\w-]+\s/.test(t))
      add("attr-short", rel, i + 1, t);
  });
}

console.log(`GEM HAML TEMPLATE INVENTORY (${DIRS.length} mods, ${files.length} files, ${nLines} lines)`);
console.log(`\nFILES:`);
for (const f of files) console.log(`  ${displayPath(f)}  (${statSync(f).size} bytes)`);

console.log(`\nFEATURES (count of matching lines, example rel:line):`);
for (const [k, v] of [...feat.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (k === "attr-hash") continue;
  console.log(`  ${k.padEnd(22)} ${String(v.length).padStart(4)}  e.g. ${v[0].file}:${v[0].line}  ${JSON.stringify(v[0].text)}`);
}
console.log(`  ${"attr-hash (total)".padEnd(22)} ${String(feat.get("attr-hash").length).padStart(4)}`);

console.log(`\nTAGS (${tagNames.size} distinct):`);
console.log(
  "  " +
    [...tagNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  "),
);

console.log(`\nATTRIBUTE KEYS (${attrs.size} distinct):`);
console.log(
  "  " +
    [...attrs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  "),
);
