#!/usr/bin/env node
// Audit: what does a pinned card-mod gem declare, and what does the port
// register for it?
//
// WHAT IT ANSWERS
// The pinned Ruby gemset is the specification of the old system. For one
// card-mod gem this script prints, per gem set file, the view and event
// declarations the file makes (with the format block each declaration sits
// in), and whether the port's mod file registers the same set path, the same
// view names and the same event names. The output is a coverage table, not a
// verdict: a name the port does not register may be a real gap, a named
// skip, or a view the port registers on a different set module.
//
// USAGE
//   node tools/audit-mod-declaration-coverage.mjs \
//     --gems <pinned-gems-root> \
//     --mod <gem-directory-name> \
//     --port <path-to-the-port-mod-file> \
//     [--json <out-path>]
//
//   --gems  the directory that holds the pinned gems, e.g.
//           C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems
//   --mod   the gem directory name, e.g. card-mod-follow
//   --port  the port-side mod file, e.g. src/card/mod-loader/mods/card-mod-follow.ts
//
// EXIT
//   0 when every gem set file has a port registration (set path) and every
//   gem-declared event name is registered port-side.
//   1 when a set file has no port registration, or a gem event name is not
//   registered port-side.
//   2 on a usage or input error (nothing is deleted, nothing is written).

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPortSetPathRegistrations } from "./audit-mod-port-registration-reader.mjs";

const argv = process.argv.slice(2);

// The repository root, so the default search root is the port's own src/.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function optionValue(name, fallback) {
  const at = argv.indexOf(name);
  if (at === -1) return fallback;
  const value = argv[at + 1];
  if (value === undefined) fail(`option ${name} needs a value`);
  return value;
}

function fail(message) {
  process.stderr.write(`audit-mod-declaration-coverage: ${message}\n`);
  process.exit(2);
}

const gemsRoot = optionValue("--gems", null);
if (!gemsRoot) fail("--gems <pinned-gems-root> is required");

const modName = optionValue("--mod", null);
if (!modName) fail("--mod <gem-directory-name> is required");

const portPath = optionValue("--port", null);
if (!portPath) fail("--port <path-to-the-port-mod-file> is required");

const jsonOut = optionValue("--json", null);

// Where to look for a port-side implementation of a name the mod file does
// not register. Many of the gems' views are ENGINE views in the port (the
// render layer's view table), so a name missing from the mod file is not
// by itself a port gap. This root is searched for the name so the census
// can say WHERE the port implements it, or that nothing implements it.
const searchRoot = optionValue("--search-root", path.join(REPO_ROOT, "src"));

const gemDir = resolveGemDir(gemsRoot, modName);
const gemSetDir = path.join(gemDir, "set");

// The pinned gems carry a version suffix (card-mod-follow-0.20.0). Accept
// either the plain name or the exact directory name.
function resolveGemDir(root, name) {
  const exact = path.join(root, name);
  if (existsSync(exact) && statSync(exact).isDirectory()) return exact;
  const matches = readdirSync(root).filter(
    (entry) => entry === name || entry.startsWith(`${name}-`),
  );
  if (matches.length === 0) fail(`no gem directory for ${name} under ${root}`);
  if (matches.length > 1) fail(`ambiguous gem directory for ${name}: ${matches.join(", ")}`);
  return path.join(root, matches[0]);
}

function listRubyFiles(dir) {
  const out = [];
  // A gem with no set/ tree declares nothing: card-mod-defaults is a
  // lib-only gem (Cardio::Railtie.config.seed_mods.unshift :defaults),
  // and reading its set tree used to abort the census with ENOENT.
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRubyFiles(full));
    else if (name.endsWith(".rb")) out.push(full);
  }
  return out.sort();
}

let portText;
try {
  portText = readFileSync(portPath, "utf8");
} catch (error) {
  fail(`cannot read port file ${portPath}: ${error.message}`);
}

// ---- the gem side ----------------------------------------------------------

const rubyFiles = listRubyFiles(gemSetDir);
const gemViews = new Map(); // set file (relative) -> [{ name, format }]
const gemEvents = new Map(); // set file (relative) -> [names]

for (const file of rubyFiles) {
  const relative = path.relative(gemSetDir, file).replace(/\\/g, "/");
  const lines = readFileSync(file, "utf8").split("\n");
  let format = "base";
  const views = [];
  const events = [];
  // A loop-declared view: Ruby writes
  //   %i[titled titled_content content].each do |viewname|
  //     view(viewname, unknown: true) { super() }
  //   end
  // and the census would read the loop variable as a view named
  // "viewname". The literal list is read here so the census names the
  // views the gem really declares.
  const loopLiterals = new Map(); // loop variable -> [names]
  for (const line of lines) {
    const loopMatch = line.trim().match(/^%[iw]\[([^\]]+)\]\.each do \|(\w+)\|/);
    if (loopMatch) {
      loopLiterals.set(
        loopMatch[2],
        loopMatch[1].split(/\s+/).filter((entry) => entry.length > 0),
      );
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const formatMatch = trimmed.match(/^format\b(.*)$/);
    if (formatMatch) {
      const argument = formatMatch[1].trim();
      format = argument.startsWith(":") ? argument.slice(1).split(/[\s,]/)[0] : "base";
      continue;
    }
    // A Ruby declaration, not an identifier that merely STARTS with
    // "view" or "event". Without the word-boundary guard the census read
    // "view_list.map do |v|" (a method call) as a view named "_list",
    // "view_opts = ..." as a view named "_opts", "event_cards :on_delete"
    // as an event named "_cards", and the interpolated
    // `event :"observer_#{action}"` as an event named "observer_".
    const viewMatch = trimmed.match(/^view(?![A-Za-z0-9_])\s*\(?\s*:?["']?([a-z_0-9]+)["']?/);
    if (viewMatch) {
      const loopNames = loopLiterals.get(viewMatch[1]);
      if (loopNames) {
        for (const name of loopNames) views.push({ name, format, line: lines.indexOf(line) + 1 });
      } else {
        views.push({ name: viewMatch[1], format, line: lines.indexOf(line) + 1 });
      }
      continue;
    }
    const eventMatch = trimmed.match(/^event(?![A-Za-z0-9_])\s*\(?\s*:?["']?([a-z_0-9]+)["']?/);
    if (eventMatch) {
      const loopNames = loopLiterals.get(eventMatch[1]);
      if (loopNames) {
        for (const name of loopNames) events.push({ name, line: lines.indexOf(line) + 1 });
      } else {
        events.push({ name: eventMatch[1], line: lines.indexOf(line) + 1 });
      }
    }
  }
  gemViews.set(relative, views);
  gemEvents.set(relative, events);
}

// ---- the port side ---------------------------------------------------------

// The port-side reader lives in its own module so the census tool and the
// test that guards it read the file the same way:
// tools/audit-mod-port-registration-reader.mjs
//
// WHY THE READER IS A LEXER AND NOT A REGEX: a regex that removes
// /* ... */ pairs first reads a "/*" that sits inside a LINE comment as a
// block-comment opener and swallows the real code up to the next "*/". In
// card-mod-account.ts the line
// "    // /*signin titled body rendered the card's EMPTY RichText content and"
// (line 1616) did exactly that: 41969 characters of the file were removed
// as one "comment", every set path after it (self/signin, type/role,
// type/signup, type/user, the type_plus_right trio) went unread, and the
// census reported eight gem set files as having no port registration when
// the port registers all twenty-three of them.
const { bySetPath: portSetPathMap } = readPortSetPathRegistrations(portText);

const portSetPaths = new Map(); // set path -> { views: string[], events: string[] }
for (const [name, entry] of portSetPathMap) {
  portSetPaths.set(name, {
    views: new Set(entry.views),
    events: new Set(entry.events),
  });
}

// ---- the comparison --------------------------------------------------------

const rows = [];
const gaps = [];
for (const relative of rubyFiles.map((file) => path.relative(gemSetDir, file).replace(/\\/g, "/"))) {
  const views = gemViews.get(relative);
  const events = gemEvents.get(relative);
  // The gem's set file is type/image.rb; the port's set path is type/image.
  const registration = portSetPaths.get(relative.replace(/\.rb$/, ""));
  if (!registration) {
    gaps.push(`set file ${relative} has no port registration`);
  }
  const portViews = registration ? registration.views : new Set();
  const portEvents = registration ? registration.events : new Set();
  for (const view of views) {
    if (!portViews.has(view.name)) {
      gaps.push(
        `view :${view.name} (${relative}, ${view.format} format) is not registered on that set path`,
      );
    }
  }
  for (const event of events) {
    if (!portEvents.has(event.name)) {
      gaps.push(`event :${event.name} (${relative}) is not registered on that set path`);
    }
  }
  rows.push({
    setFile: relative,
    registered: Boolean(registration),
    gemViews: views.map((view) => `${view.name}@${view.format}`),
    gemEvents: events.map((event) => event.name),
    portViews: [...portViews].sort(),
    portEvents: [...portEvents].sort(),
  });
}

// ---- where the port implements a name the mod file does not register ----

function listSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// A name the mod file does not register can still be implemented: the
// render layer's view table holds the engine's views, and other mods hold
// their own. This searches the port tree for the name and reports the
// first hits, so a census line can say WHERE the port implements it.
function findNameHits(name) {
  const hits = [];
  if (!existsSync(searchRoot)) return hits;
  for (const file of listSourceFiles(searchRoot)) {
    const relative = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    if (relative === path.relative(REPO_ROOT, path.resolve(portPath)).replace(/\\/g, "/")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes(`"${name}"`)) continue;
      hits.push(`${relative}:${i + 1}`);
      if (hits.length >= 4) return hits;
    }
  }
  return hits;
}

const missingViewHits = {};
const missingEventHits = {};

const lines = [];
lines.push(`gem: ${gemDir}`);
lines.push(`port file: ${portPath}`);
lines.push(`gem set files: ${rubyFiles.length}`);
lines.push(`port set paths: ${portSetPaths.size}`);
lines.push("");
for (const row of rows) {
  lines.push(`set file: ${row.setFile} (${row.registered ? "registered" : "NO PORT REGISTRATION"})`);
  if (row.gemViews.length > 0) lines.push(`  gem views:   ${row.gemViews.join(", ")}`);
  if (row.gemEvents.length > 0) lines.push(`  gem events:  ${row.gemEvents.join(", ")}`);
  if (row.portViews.length > 0) lines.push(`  port views:  ${row.portViews.join(", ")}`);
  if (row.portEvents.length > 0) lines.push(`  port events: ${row.portEvents.join(", ")}`);
}
lines.push("");
const allGemViews = new Set();
const allPortViews = new Set();
const allGemEvents = new Set();
const allPortEvents = new Set();
for (const row of rows) {
  for (const view of row.gemViews) allGemViews.add(view.split("@")[0]);
  for (const event of row.gemEvents) allGemEvents.add(event);
}
// The PORT side is read from EVERY registration the port file carries, not
// only from the ones that line up with a gem set file. A view the port
// registers on a set path the gem does not have (card-mod-assets
// registers :asset_output_url on the two concrete includer sets,
// type_plus_right/set/style and type_plus_right/set/script, because the
// TS pattern surface has no abstract membership) is still a port
// registration, and reading the port side from the rows alone hid it and
// reported the name as missing everywhere.
for (const entry of portSetPaths.values()) {
  for (const view of entry.views) allPortViews.add(view);
  for (const event of entry.events) allPortEvents.add(event);
}
lines.push(`gem view names (unique): ${[...allGemViews].sort().join(", ")}`);
lines.push(`port view names (unique): ${[...allPortViews].sort().join(", ")}`);
lines.push(
  `gem view names with no port registration anywhere in the port file: ${[...allGemViews]
    .filter((name) => !allPortViews.has(name))
    .join(", ") || "none"}`,
);
lines.push(`gem event names (unique): ${[...allGemEvents].sort().join(", ")}`);
lines.push(`port event names (unique): ${[...allPortEvents].sort().join(", ")}`);
lines.push(
  `gem event names with no port registration: ${[...allGemEvents]
    .filter((name) => !allPortEvents.has(name))
    .join(", ") || "none"}`,
);
lines.push("");
for (const name of [...allGemViews].filter((n) => !allPortViews.has(n)).sort()) {
  missingViewHits[name] = findNameHits(name);
}
for (const name of [...allGemEvents].filter((n) => !allPortEvents.has(n)).sort()) {
  missingEventHits[name] = findNameHits(name);
}
lines.push(
  "where the port implements a gem view name the mod file does not register (empty = nowhere in src/):",
);
for (const [name, hits] of Object.entries(missingViewHits)) {
  lines.push(`  view :${name} -> ${hits.length ? hits.join(", ") : "NOT FOUND in src/"}`);
}
lines.push(
  "where the port implements a gem event name the mod file does not register (empty = nowhere in src/):",
);
for (const [name, hits] of Object.entries(missingEventHits)) {
  lines.push(`  event :${name} -> ${hits.length ? hits.join(", ") : "NOT FOUND in src/"}`);
}
lines.push("");
if (gaps.length === 0) {
  lines.push("NO GAPS FOUND by this comparison.");
} else {
  lines.push("gaps this comparison reports (each needs a read, not a verdict):");
  for (const gap of gaps) lines.push(`  ${gap}`);
}

process.stdout.write(`${lines.join("\n")}\n`);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    `${JSON.stringify(
      {
        gem: gemDir,
        portFile: portPath,
        setFileCount: rubyFiles.length,
        portSetPathCount: portSetPaths.size,
        portSetPaths: [...portSetPaths.keys()].sort(),
        // The three gap classes, separated. A per-set-path gap can be a
        // false alarm: Ruby's set modules inherit, so a view declared in
        // abstract/x.rb may be registered port-side on all/x. A name that
        // is missing from the WHOLE port file is a real hole.
        setFilesWithNoPortRegistration: rows
          .filter((row) => !row.registered)
          .map((row) => row.setFile),
        viewNamesMissingEverywhere: [...allGemViews]
          .filter((name) => !allPortViews.has(name))
          .sort(),
        eventNamesMissingEverywhere: [...allGemEvents]
          .filter((name) => !allPortEvents.has(name))
          .sort(),
        viewNameHitsOutsideTheModFile: missingViewHits,
        eventNameHitsOutsideTheModFile: missingEventHits,
        rows,
        gaps,
      },
      null,
      2,
    )}\n`,
  );
}

process.exit(gaps.length === 0 ? 0 : 1);
