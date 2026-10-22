#!/usr/bin/env node
// treewalk-family-def-coverage.mjs - the treewalk family's per-row Ruby def
// coverage, measured against the PINNED gemset and the PORT tree.
//
// WHAT THIS IS. Every register-treewalk row names a set of Ruby files (the
// card gem's own core files) and the row's verdict rests on one question:
// for every `def` in those files, does the port carry the same behaviour?
// This tool answers the mechanical half of that question, and it is the
// instrument the row receipts cite.
//
// THE TWO FIXES OVER THE 2026-10-19 PASS, both of which changed numbers:
//
//   1. DIRECTORY SPECS ARE EXPANDED. The earlier pass read "set/ (28)",
//      "view/cache (4)", "db/", "lib/cardio/ (55)" and "director/.rb" as
//      file names, found nothing, and recorded them as `rubyFilesUnread`.
//      A row that names a directory names every .rb file under it. Those
//      rows now measure their real def counts.
//   2. THE PORT SEARCH IS A DECLARATION SEARCH, NOT A MENTION SEARCH. The
//      earlier pass counted a def as ported when its name appeared ANYWHERE
//      in a non-comment port line, including a call site or a string. This
//      pass requires the name to be bound as a declaration (a `function`,
//      `const`, `class`, `export`, or a method shorthand) so a def whose
//      name merely appears in prose does not count as ported.
//
// THE HONEST PART. A name match is NOT a behaviour match. This tool reports
// what it measured, and says so: the row receipt is where a name match is
// promoted to VERIFIED (with a pinned test) or demoted to a named skip (with
// the citation that makes it a skip). A row is never closed on this tool's
// output alone.
//
// Run:
//   node tools/treewalk-family-def-coverage.mjs            # human table
//   node tools/treewalk-family-def-coverage.mjs --json     # machine table
//
// The port tree defaults to this checkout's src/ and the pinned gemset to
// the machine's pinned install. Both are overridable by env var so the
// same instrument can measure another checkout.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const GEMS = process.env.DECKO_RUBY_GEMSET
  ?? 'C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems';
const PORT = process.env.DECKO_TS_PORT_SRC ?? join(REPO_ROOT, 'src');
const ROSTER = process.env.DECKO_COMPLETENESS_ROSTER
  ?? 'C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json';
const FAMILY = process.env.DECKO_TREEWALK_FAMILY ?? 'register-treewalk';
const OUT = process.env.DECKO_TREEWALK_COVERAGE_OUT ?? null;

// ── file helpers ────────────────────────────────────────────────────────────

function walkFiles(dir, out = [], filter = () => true) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries.sort()) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkFiles(p, out, filter);
    else if (filter(e)) out.push(p);
  }
  return out;
}

// ── the port tree ───────────────────────────────────────────────────────────

const portFiles = walkFiles(PORT, [], (e) => e.endsWith('.ts'));

// A declaration line, with the declaration's own name. A def is counted as
// ported when the port BINDS the name, not when the name merely appears.
const DECLARATION_PATTERNS = [
  // export function foo / export const foo = / export class Foo
  /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/g,
  /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g,
  // object-literal method shorthand: `  foo(a, b) {`
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
  // class field with an arrow function: `  foo = (a) =>`
  /^\s*(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+)*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\(/g,
  // `foo(a, b): ReturnType {`  (a TS method signature)
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*:\s*[A-Za-z_$]/g,
];

const portBindings = new Map(); // lowercased name -> { file, line, text }
const portMentions = new Map(); // lowercased name -> { file, line, text }

for (const f of portFiles) {
  const rel = relative(PORT, f);
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) continue;           // a comment is not a binding
    if (/^\s*\*/.test(line)) continue;             // a block-comment line
    for (const re of DECLARATION_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const name = m[1];
        if (!name) continue;
        const key = name.toLowerCase();
        if (portBindings.has(key)) continue;
        portBindings.set(key, { file: rel, line: i + 1, text: line.trim() });
      }
    }
    // A MENTION: the name appears in a non-comment line without being
    // bound there. The family's own vocabulary calls this VERIFIED-INLINE:
    // the semantics are carried at the call site, with the Ruby line cited,
    // and no same-named function. A mention is NOT a port counterpart - it
    // is the reason a row receipt has to cite the call site, so the receipt
    // can be checked.
    for (const m of line.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const key = m[1].toLowerCase();
      if (portMentions.has(key)) continue;
      portMentions.set(key, { file: rel, line: i + 1, text: line.trim() });
    }
  }
}

const camel = (s) => s.replace(/[_-]([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (s) => { const c = camel(s); return c[0].toUpperCase() + c.slice(1); };

// Ruby names the port never binds and never needs: the language's own
// boilerplate and the private helpers with no port surface.
const IGNORE = new Set([
  'initialize', 'inspect', 'to_s', 'hash', 'eql', '==', 'method_missing',
  'respond_to_missing', 'define_method', 'instance_variable_get',
  'instance_variable_set', 'instance_variables', 'singleton_class',
  'freeze', 'dup', 'clone', 'itself', 'tap', 'then', 'yield_self', 'display',
  'frozen?', 'nil?', 'object_id', 'send', 'public_send', 'class', 'is_a?',
  'kind_of?', 'instance_of?', 'respond_to?', 'tap', 'pretty_print',
]);

// Ruby names the port binds under a DIFFERENT spelling, and the mapping is
// the same in every row: Ruby's `?` and `!` suffixes carry no meaning in a
// name-based port, so they are dropped for the lookup only.
function portBindingFor(rubyName) {
  const stem = rubyName.replace(/[?!=]$/, '');
  if (!stem) return null;
  const forms = [rubyName, stem, camel(rubyName), camel(stem), pascal(rubyName), pascal(stem)];
  for (const f of forms) {
    const hit = portBindings.get(f.toLowerCase());
    if (hit) return { ...hit, matchedForm: f };
  }
  return null;
}

// The weaker signal: the port mentions the name somewhere without binding
// it. A mention is where the semantics may be carried inline; the row
// receipt has to cite that site, and the citation is what a reader checks.
function portMentionFor(rubyName) {
  const stem = rubyName.replace(/[?!=]$/, '');
  if (!stem) return null;
  const forms = [rubyName, stem, camel(rubyName), camel(stem), pascal(rubyName), pascal(stem)];
  for (const f of forms) {
    const hit = portMentions.get(f.toLowerCase());
    if (hit) return { ...hit, matchedForm: f };
  }
  return null;
}

// ── the roster ──────────────────────────────────────────────────────────────

const roster = JSON.parse(readFileSync(ROSTER, 'utf8'));
const items = roster.items.filter((i) => i.family === FAMILY);

// ── expanding a row's Ruby file set ─────────────────────────────────────────

// A spec is one of:
//   "card-1.110.0/lib/card/name.rb"            an absolute gem-relative path
//   "card-1.110.0/lib/card/set/ (28)"          a directory, with a count
//   "name/{all,all/descendants}.rb"            a brace group, gem-relative
//   "set/ (28)"                                a directory, relative to the
//                                               row's own base directory
//   "view/cache (4)"                           the same
//   "director/.rb (9)"                         the same, with a count
//   "lib/cardio.rb + lib/cardio/ (55)"         a plus-joined set
// The relative specs resolve against the row's BASE DIRECTORY, which is the
// directory of the row's first absolute spec.
function expandBraces(spec) {
  const m = spec.match(/^(.*)\{([^{}]+)\}(.*)$/);
  if (!m) return [spec];
  const [, head, body, tail] = m;
  return body.split(',').flatMap((part) => expandBraces(`${head}${part.trim()}${tail}`));
}

function splitSpecs(sourceParent) {
  return sourceParent
    .split(' + ')
    .flatMap((part) => expandBraces(part))
    .flatMap((part) => String(part).split(','))
    .map((part) => part.trim().replace(/\s*\(\d+\)\s*$/, ''))
    .filter(Boolean);
}

function resolveSpec(spec, baseDir, gemRoot) {
  // An absolute gem-relative path.
  if (/^[a-z0-9_-]+-\d/.test(spec)) return join(GEMS, spec);
  // A spec written as "lib/...", "mod/...", "config/...", "db/..." or
  // "bin/..." is relative to the GEM ROOT, even when the row's base
  // directory is deeper. The row's own base directory is tried first,
  // because "set/" and "view/cache" are relative to lib/card/.
  const baseRelative = join(GEMS, baseDir, spec);
  if (statSyncSafe(baseRelative)) return baseRelative;
  if (/^(lib|mod|config|db|bin)\//.test(spec)) {
    const gemRelative = join(GEMS, gemRoot, spec);
    if (statSyncSafe(gemRelative)) return gemRelative;
  }
  return baseRelative;
}

function statSyncSafe(p) { try { return statSync(p); } catch { return null; } }

function rubyFilesFor(item) {
  const specs = splitSpecs(item.sourceParent);
  // The base directory: the directory of the first absolute spec.
  let baseDir = '.';
  let gemRoot = '.';
  for (const spec of specs) {
    if (/^[a-z0-9_-]+-\d/.test(spec)) {
      baseDir = dirname(spec);
      gemRoot = spec.split('/')[0];
      break;
    }
  }
  const files = [];
  const seen = new Set();
  const add = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    files.push({ spec: rel, missing: false });
  };
  for (const spec of specs) {
    // A spec that names a directory's files by extension, e.g.
    // "director/.rb", means every .rb file in that directory.
    if (spec.endsWith('/.rb')) {
      const dir = resolveSpec(spec.slice(0, -3), baseDir, gemRoot);
      const st = statSyncSafe(dir);
      if (st && st.isDirectory()) {
        for (const f of walkFiles(dir, [], (e) => e.endsWith('.rb'))) {
          add(relative(GEMS, f).replace(/\\/g, '/'));
        }
        continue;
      }
    }
    // A spec that names a file INSIDE a directory by glob, e.g.
    // "view/cache*", expands to the files that match.
    if (spec.includes('*')) {
      const dir = dirname(resolveSpec(spec.replace(/\*.*$/, ''), baseDir, gemRoot));
      const pattern = new RegExp('^' + spec.slice(spec.lastIndexOf('/') + 1).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      for (const f of walkFiles(dir, [], (e) => e.endsWith('.rb'))) {
        if (!pattern.test(f.slice(f.lastIndexOf('/') + 1))) continue;
        add(relative(GEMS, f).replace(/\\/g, '/'));
      }
      continue;
    }
    const abs = resolveSpec(spec, baseDir, gemRoot);
    const st = statSyncSafe(abs);
    if (!st) { files.push({ spec, missing: true }); continue; }
    if (st.isDirectory()) {
      for (const f of walkFiles(abs, [], (e) => e.endsWith('.rb'))) {
        add(relative(GEMS, f).replace(/\\/g, '/'));
      }
    } else {
      add(relative(GEMS, abs).replace(/\\/g, '/'));
    }
  }
  return files;
}

// ── the defs ────────────────────────────────────────────────────────────────

const DEF_RE = /^\s*def\s+(?:self\.)?([a-z_][a-z_0-9]*[?!=]?)/;

function defsIn(file) {
  const lines = readFileSync(join(GEMS, file), 'utf8').split(/\r?\n/);
  const out = [];
  lines.forEach((ln, i) => {
    const m = ln.match(DEF_RE);
    if (m && !IGNORE.has(m[1])) out.push({ name: m[1], file, line: i + 1 });
  });
  return out;
}

// ── the rows ────────────────────────────────────────────────────────────────

const rows = [];
for (const item of items) {
  const files = rubyFilesFor(item);
  const read = files.filter((f) => !f.missing);
  const unread = files.filter((f) => f.missing).map((f) => f.spec);
  const methods = [];
  for (const f of read) methods.push(...defsIn(f.spec));
  const checked = methods.map((m) => {
    const hit = portBindingFor(m.name);
    const mention = hit ? null : portMentionFor(m.name);
    return {
      ...m,
      portBinding: hit ? `${hit.file}:${hit.line} (${hit.matchedForm})` : null,
      portMention: mention ? `${mention.file}:${mention.line} (${mention.matchedForm})` : null,
    };
  });
  const noPort = checked.filter((c) => !c.portBinding);
  rows.push({
    id: item.id,
    verdict: item.verdict,
    bucket: item.bucket,
    label: item.label,
    sourceParent: item.sourceParent,
    rubyFiles: read.length,
    rubyFilesUnread: unread,
    methodCount: methods.length,
    portBound: checked.length - noPort.length,
    noPortCount: noPort.length,
    noPort: noPort.map((n) => ({ name: n.name, file: n.file, line: n.line, portMention: n.portMention })),
    portBindings: checked.filter((c) => c.portBinding)
      .map((c) => ({ name: c.name, file: c.file, line: c.line, port: c.portBinding })),
  });
}

if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log('id                                              bucket     files defs bound noPort unread');
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(46)} ${r.bucket.padEnd(9)} ${String(r.rubyFiles).padStart(5)} `
      + `${String(r.methodCount).padStart(4)} ${String(r.portBound).padStart(5)} `
      + `${String(r.noPortCount).padStart(6)} ${String(r.rubyFilesUnread.length).padStart(6)}`,
    );
  }
  console.log('\n--- no-port method names, per row (up to 14) ---');
  for (const r of rows) {
    if (!r.noPortCount) continue;
    console.log(` ${r.id}: ${r.noPort.slice(0, 14).map((n) => n.name).join(', ')}${r.noPort.length > 14 ? ` … +${r.noPort.length - 14}` : ''}`);
  }
  console.log('\n--- rows whose Ruby files were unreadable ---');
  for (const r of rows) if (r.rubyFilesUnread.length) console.log(' ', r.id, r.rubyFilesUnread.join(', '));
}
