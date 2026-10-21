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

const argv = process.argv.slice(2);

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
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const formatMatch = trimmed.match(/^format\b(.*)$/);
    if (formatMatch) {
      const argument = formatMatch[1].trim();
      format = argument.startsWith(":") ? argument.slice(1).split(/[\s,]/)[0] : "base";
      continue;
    }
    const viewMatch = trimmed.match(/^view\s*\(?\s*:?["']?([a-z_0-9]+)["']?/);
    if (viewMatch) {
      views.push({ name: viewMatch[1], format, line: lines.indexOf(line) + 1 });
      continue;
    }
    const eventMatch = trimmed.match(/^event\s*\(?\s*:?["']?([a-z_0-9]+)["']?/);
    if (eventMatch) events.push({ name: eventMatch[1], line: lines.indexOf(line) + 1 });
  }
  gemViews.set(relative, views);
  gemEvents.set(relative, events);
}

// ---- the port side ---------------------------------------------------------

// Strip comments so a Ruby citation inside a comment is not read as a
// registration. Block comments and whole-line comments only.
const stripped = portText
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

const portSetPaths = new Map(); // set path -> { views: Set, events: Set }
const chunks = stripped.split(/setPath:\s*"/);
for (let i = 1; i < chunks.length; i += 1) {
  const chunk = chunks[i];
  const name = chunk.slice(0, chunk.indexOf('"'));
  const body = chunk.split(/setPath:\s*"/)[0];
  const views = new Set();
  const events = new Set();
  for (const match of body.matchAll(/view:\s*"([a-z_0-9]+)"/g)) views.add(match[1]);
  for (const match of body.matchAll(/event:\s*"([a-z_0-9]+)"/g)) events.add(match[1]);
  if (!portSetPaths.has(name)) portSetPaths.set(name, { views, events });
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
  for (const view of row.portViews) allPortViews.add(view);
  for (const event of row.gemEvents) allGemEvents.add(event);
  for (const event of row.portEvents) allPortEvents.add(event);
}
lines.push(`gem view names (unique): ${[...allGemViews].sort().join(", ")}`);
lines.push(`port view names (unique): ${[...allPortViews].sort().join(", ")}`);
lines.push(
  `gem view names with no port registration anywhere on that set path: ${[...allGemViews]
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
        rows,
        gaps,
      },
      null,
      2,
    )}\n`,
  );
}

process.exit(gaps.length === 0 ? 0 : 1);
