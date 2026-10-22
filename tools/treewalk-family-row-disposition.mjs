#!/usr/bin/env node
// treewalk-family-row-disposition.mjs - the treewalk family's per-DEF
// disposition, measured against the pinned gemset and the port tree.
//
// WHAT THIS IS. The family's own closure rule (set by the family's own
// branch, in docs/core/treewalk-name-sub-files-verification.md) is that
// every `def` in a row's Ruby file set gets one of four dispositions:
//
//   PORTED        the port BINDS the behaviour under the same name.
//   PORTED-INLINE the port carries the semantics at a CALL SITE, and the
//                 citing port file's own HEADER names this row's Ruby
//                 source as the thing it ports. The header citation is
//                 what makes this a disposition rather than a guess.
//   SKIP          neither, AND the PINNED GEMSET NEVER CALLS the def, so
//                 the behaviour is unreachable in the system the port
//                 replaces. The citation is the grep that shows it.
//   GAP           neither, AND the pinned gemset DOES call the def. This is
//                 a real behavioural hole in the port.
//
// A row closes to DONE only when every def in its file set is PORTED,
// PORTED-INLINE or SKIP. A row with a GAP stays WORKING, and the GAP is
// named.
//
// WHY THE REACHABILITY GREP IS THE LOAD-BEARING PART. A def the pinned
// gemset never calls cannot be a port gap: nothing in the old system can
// reach it, so nothing in the new system can miss it. A def the pinned
// gemset DOES call, with no port counterpart, is a real hole in the port.
// Without this grep every unported def would look like a gap, and the
// family would drown in holes that do not exist.
//
// WHY THE HEADER CITATION IS THE OTHER LOAD-BEARING PART. A port file that
// merely MENTIONS a Ruby's name proves nothing - a comment can mention
// anything. The port files in this tree carry a header block that names
// the Ruby source they port, and the family's DONE rows are closed on
// exactly that basis ("verified - the port file's own header names this
// Ruby source as the thing it ports"). So PORTED-INLINE requires a citing
// file whose header names this row's Ruby source, and the header's own
// line is recorded.
//
// ONE PASS, NOT ONE PASS PER DEF. The pinned gemset is a few thousand
// Ruby files. Indexing every identifier occurrence once and answering the
// per-def reachability question from the index keeps the whole run at
// seconds instead of a minute.
//
// Run:
//   node tools/treewalk-family-row-disposition.mjs <row-id> [<row-id> ...]
//   node tools/treewalk-family-row-disposition.mjs --all
//   node tools/treewalk-family-row-disposition.mjs <row-id> --json

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
const OUT = process.env.DECKO_TREEWALK_DISPOSITION_OUT ?? null;

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

// ── the pinned gemset, indexed ONCE ─────────────────────────────────────────

// THE DECK GEMS ONLY. The reachability question is "can the old DECK reach
// this def", not "can any gem in the world call a method with this name".
// Counting third-party gems would make Rails' own `public`, `connection`,
// `down` and `banner` look like deck behaviour, which they are not. The
// deck is: the card gem, the deck gem, and the 33 card-mod gems.
const DECK_GEM = /^(card|decko)-[a-z_]*-?\d|^card-mod-[a-z_]+-\d/;
function isDeckGem(rel) {
  const gem = rel.split('/')[0];
  return DECK_GEM.test(gem);
}

// For every identifier occurrence in the deck gems' Ruby, the places it
// appears as a CALL. The index is the reachability evidence.
const callIndex = new Map(); // identifier -> [{ file, line, text }]
// Every def in the deck gems, by name, with the file that defines it.
const defOwners = new Map(); // identifier -> [{ file, line }]

for (const f of walkFiles(GEMS, [], (e) => e.endsWith('.rb'))) {
  const rel = relative(GEMS, f).replace(/\\/g, '/');
  if (!isDeckGem(rel)) continue;
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  // The nearest preceding `def` in this file: the enclosing method, and
  // the caller of any call made inside it.
  let enclosing = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;                 // a comment is not a call
    const isDefLine = /^\s*def\s/.test(line);
    if (isDefLine) {
      const m = line.match(/^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z_0-9]*[?!=]?)/);
      if (m) {
        if (!defOwners.has(m[1])) defOwners.set(m[1], []);
        defOwners.get(m[1]).push({ file: rel, line: i + 1 });
        enclosing = m[1];
      }
    }
    for (const m of line.matchAll(/([A-Za-z_][A-Za-z_0-9]*[?!=]?)/g)) {
      const name = m[1];
      if (isDefLine) continue;                        // the definition is not a call
      // The call forms: `name(`, `name arg`, `name` at end of line. A name
      // followed by `=` is a writer, and a name with `!`/`?` is a
      // DIFFERENT method than the bare name.
      const rest = line.slice(m.index + m[0].length);
      const isCall = /^\s*\(/.test(rest) || /^\s+[^\s=]/.test(rest) || /^\s*$/.test(rest);
      if (!isCall) continue;
      if (!callIndex.has(name)) callIndex.set(name, []);
      callIndex.get(name).push({ file: rel, line: i + 1, text: line.trim(), caller: enclosing });
    }
  }
}

// The internal-call graph: a def that calls another def in the SAME file
// creates the edge caller -> callee. A helper inherits its caller's
// reachability, so the graph is walked from the externally-called seeds.
const internalEdges = new Map(); // caller -> Set(callee)
const externalSeed = new Set();  // names the deck calls from outside their own file
for (const [name, calls] of callIndex) {
  const owners = defOwners.get(name);
  if (!owners) continue;                    // not a deck def: not deck behaviour
  for (const c of calls) {
    const sameFile = owners.some((o) => o.file === c.file);
    if (!sameFile) { externalSeed.add(name); continue; }
    if (!c.caller) continue;                // a call at file scope
    if (!internalEdges.has(c.caller)) internalEdges.set(c.caller, new Set());
    internalEdges.get(c.caller).add(name);
  }
}

// The reachable set: the external seeds, plus everything they reach
// through the internal-call graph, to a fixpoint.
const reachable = new Set(externalSeed);
let grew = true;
while (grew) {
  grew = false;
  for (const caller of [...reachable]) {
    for (const callee of internalEdges.get(caller) ?? []) {
      if (reachable.has(callee)) continue;
      reachable.add(callee);
      grew = true;
    }
  }
}

// A def is REACHABLE when the deck can get to it. The rule has two parts,
// and both are needed:
//
//   1. EXTERNAL: the deck calls it from a file OTHER than the one that
//      defines it. That caller is deck code, so the behaviour matters.
//   2. INTERNAL: the deck calls it only from its own defining file, but
//      some other def in that file IS reachable. The helper inherits its
//      caller's reachability. This is the fixpoint: a private helper
//      called by a public method is reachable, and a private helper
//      called by nothing is not.
function reachability(name) {
  const owners = defOwners.get(name) ?? [];
  const calls = callIndex.get(name) ?? [];
  if (owners.length === 0) {
    // Not a def in the deck: it is a call to something outside the deck
    // (a Rails method, a stdlib method). The deck's own use of it does not
    // make it deck behaviour.
    return { reachable: false, reason: 'not-a-deck-def' };
  }
  if (reachable.has(name)) {
    const external = calls.filter((c) => !owners.some((o) => o.file === c.file));
    return {
      reachable: true,
      reason: external.length ? 'external' : 'internal-reachable',
      sites: (external.length ? external : calls).slice(0, 5).map((c) => `${c.file}:${c.line}`),
      count: (external.length ? external : calls).length,
    };
  }
  return {
    reachable: false,
    reason: 'unreachable',
    sites: calls.slice(0, 5).map((c) => `${c.file}:${c.line}`),
    count: calls.length,
  };
}

// ── the port tree ───────────────────────────────────────────────────────────

const DECLARATION_PATTERNS = [
  /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/g,
  /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g,
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
  /^\s*(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+)*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\(/g,
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*:\s*[A-Za-z_$]/g,
];

const portBindings = new Map();
const portMentions = new Map();
// Per port file, the Ruby source its OWN HEADER names. A header is the
// leading comment block of the file.
const headerCitations = new Map(); // port file -> [{ line, text }]

for (const f of walkFiles(PORT, [], (e) => e.endsWith('.ts'))) {
  const rel = relative(PORT, f).replace(/\\/g, '/');
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  const citations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isComment = /^\s*\/\//.test(line) || /^\s*\*/.test(line);
    // A CITATION is a comment line naming a pinned Ruby source. The port
    // tree cites its Ruby sources in both the file header and the doc
    // comments above each function, and BOTH are the port's own claim
    // about which Ruby it ports. A citation is what turns a name match
    // into a claim the port itself makes about that Ruby file.
    if (isComment) {
      const rubySource = line.match(/(?:card-1\.110\.0|decko-0\.20\.0|card-mod-[a-z_]+-0\.20\.0)\/[A-Za-z0-9_./{}*-]*\.rb/);
      if (rubySource) citations.push({ line: i + 1, text: line.trim(), rubySource: rubySource[0] });
      continue;
    }
    for (const re of DECLARATION_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const key = m[1].toLowerCase();
        if (portBindings.has(key)) continue;
        portBindings.set(key, { file: rel, line: i + 1, text: line.trim() });
      }
    }
    for (const m of line.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const key = m[1].toLowerCase();
      if (portMentions.has(key)) continue;
      portMentions.set(key, { file: rel, line: i + 1, text: line.trim() });
    }
  }
  if (citations.length) headerCitations.set(rel, citations);
}

const camel = (s) => s.replace(/[_-]([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (s) => { const c = camel(s); return c[0].toUpperCase() + c.slice(1); };

function portLookup(rubyName) {
  const stem = rubyName.replace(/[?!=]$/, '');
  if (!stem) return { binding: null, mention: null };
  const forms = [rubyName, stem, camel(rubyName), camel(stem), pascal(rubyName), pascal(stem)];
  for (const f of forms) {
    const hit = portBindings.get(f.toLowerCase());
    if (hit) return { binding: { ...hit, matchedForm: f }, mention: null };
  }
  for (const f of forms) {
    const hit = portMentions.get(f.toLowerCase());
    if (hit) return { binding: null, mention: { ...hit, matchedForm: f } };
  }
  return { binding: null, mention: null };
}

// ── the row's Ruby file set ─────────────────────────────────────────────────

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

function statSyncSafe(p) { try { return statSync(p); } catch { return null; } }

function resolveSpec(spec, baseDir, gemRoot) {
  if (/^[a-z0-9_-]+-\d/.test(spec)) return join(GEMS, spec);
  const baseRelative = join(GEMS, baseDir, spec);
  if (statSyncSafe(baseRelative)) return baseRelative;
  if (/^(lib|mod|config|db|bin)\//.test(spec)) {
    const gemRelative = join(GEMS, gemRoot, spec);
    if (statSyncSafe(gemRelative)) return gemRelative;
  }
  return baseRelative;
}

function rubyFilesFor(item) {
  const specs = splitSpecs(item.sourceParent);
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
  const add = (rel) => { if (seen.has(rel)) return; seen.add(rel); files.push(rel); };
  for (const spec of specs) {
    if (spec.endsWith('/.rb')) {
      const dir = resolveSpec(spec.slice(0, -3), baseDir, gemRoot);
      const st = statSyncSafe(dir);
      if (st && st.isDirectory()) {
        for (const f of walkFiles(dir, [], (e) => e.endsWith('.rb'))) add(relative(GEMS, f).replace(/\\/g, '/'));
        continue;
      }
    }
    if (spec.includes('*')) {
      const dir = dirname(resolveSpec(spec.replace(/\*.*$/, ''), baseDir, gemRoot));
      const leaf = spec.slice(spec.lastIndexOf('/') + 1);
      const pattern = new RegExp('^' + leaf.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      for (const f of walkFiles(dir, [], (e) => e.endsWith('.rb'))) {
        if (pattern.test(f.slice(f.lastIndexOf('/') + 1))) add(relative(GEMS, f).replace(/\\/g, '/'));
      }
      continue;
    }
    const abs = resolveSpec(spec, baseDir, gemRoot);
    const st = statSyncSafe(abs);
    if (!st) { files.push(spec); continue; }
    if (st.isDirectory()) {
      for (const f of walkFiles(abs, [], (e) => e.endsWith('.rb'))) add(relative(GEMS, f).replace(/\\/g, '/'));
    } else {
      add(relative(GEMS, abs).replace(/\\/g, '/'));
    }
  }
  return files;
}

// ── the defs ────────────────────────────────────────────────────────────────

const DEF_RE = /^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z_0-9]*[?!=]?)/;
const IGNORE = new Set([
  'initialize', 'inspect', 'to_s', 'hash', 'eql', '==', 'method_missing',
  'respond_to_missing', 'define_method', 'instance_variable_get',
  'instance_variable_set', 'instance_variables', 'singleton_class',
  'freeze', 'dup', 'clone', 'itself', 'tap', 'then', 'yield_self', 'display',
  'frozen?', 'nil?', 'object_id', 'send', 'public_send', 'class', 'is_a?',
  'kind_of?', 'instance_of?', 'respond_to?', 'pretty_print',
]);

function defsIn(file) {
  const abs = join(GEMS, file);
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { return []; }
  const out = [];
  text.split(/\r?\n/).forEach((ln, i) => {
    const m = ln.match(DEF_RE);
    if (m && !IGNORE.has(m[1])) out.push({ name: m[1], file, line: i + 1 });
  });
  return out;
}

// The row's Ruby sources, in the spelling the port headers use.
function rowRubySources(item) {
  const files = rubyFilesFor(item);
  const sources = new Set();
  for (const f of files) {
    const m = f.match(/^([a-z0-9_-]+-\d[^/]*)\/(.*)$/);
    if (!m) continue;
    sources.add(`${m[1]}/${m[2]}`);
  }
  // The base names too: a header may name "lib/card/name.rb" without the
  // gem prefix, or "card/name.rb".
  const extra = new Set();
  for (const s of sources) {
    const withoutGem = s.replace(/^[a-z0-9_-]+-\d[^/]*\//, '');
    extra.add(withoutGem);
  }
  for (const s of extra) sources.add(s);
  return { files, sources: [...sources] };
}

// ── the rows ────────────────────────────────────────────────────────────────

const roster = JSON.parse(readFileSync(ROSTER, 'utf8'));
const items = roster.items.filter((i) => i.family === FAMILY);

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const all = process.argv.includes('--all');
const selected = all ? items : items.filter((i) => wanted.includes(i.id));

const results = [];
for (const item of selected) {
  const { files, sources } = rowRubySources(item);
  const methods = [];
  for (const f of files) methods.push(...defsIn(f));
  const defs = methods.map((m) => {
    const { binding, mention } = portLookup(m.name);
    const reach = binding ? { reachable: false, reason: 'port-bound', sites: [], count: 0 } : reachability(m.name);
    // A PORTED-INLINE disposition needs a citing port file whose OWN
    // HEADER names this row's Ruby source.
    let headerHit = null;
    if (mention) {
      const citations = headerCitations.get(mention.file) ?? [];
      const hit = citations.find((c) => sources.some((s) => c.rubySource.endsWith(s) || s.endsWith(c.rubySource)));
      if (hit) headerHit = { file: mention.file, line: hit.line, citation: hit.rubySource };
    }
    let disposition;
    if (binding) disposition = 'PORTED';
    else if (headerHit) disposition = 'PORTED-INLINE';
    else if (!reach.reachable) disposition = 'SKIP';
    else disposition = 'GAP';
    return {
      name: m.name,
      file: m.file,
      line: m.line,
      disposition,
      portBinding: binding ? `${binding.file}:${binding.line}` : null,
      portMention: mention ? `${mention.file}:${mention.line}` : null,
      headerCitation: headerHit ? `${headerHit.file}:${headerHit.line} (${headerHit.citation})` : null,
      reachability: reach.reason,
      pinnedCallSites: reach.sites,
      pinnedCallCount: reach.count,
    };
  });
  const counts = defs.reduce((acc, d) => {
    acc[d.disposition] = (acc[d.disposition] ?? 0) + 1;
    return acc;
  }, {});
  results.push({
    id: item.id,
    bucket: item.bucket,
    verdict: item.verdict,
    label: item.label,
    sourceParent: item.sourceParent,
    rubyFiles: files.length,
    rubySources: sources,
    defCount: defs.length,
    counts,
    closable: (counts.GAP ?? 0) === 0,
    gaps: defs.filter((d) => d.disposition === 'GAP'),
    defs,
  });
}

if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));

if (asJson) {
  console.log(JSON.stringify(results, null, 1));
} else {
  for (const r of results) {
    const c = r.counts;
    console.log(
      `${r.id}\n`
      + `  files=${r.rubyFiles} defs=${r.defCount} `
      + `PORTED=${c.PORTED ?? 0} INLINE=${c['PORTED-INLINE'] ?? 0} `
      + `SKIP=${c.SKIP ?? 0} GAP=${c.GAP ?? 0}  -> ${r.closable ? 'CLOSABLE' : 'HAS GAPS'}`,
    );
    for (const g of r.gaps.slice(0, 20)) {
      console.log(`    GAP ${g.name} (${g.file}:${g.line}) called ${g.pinnedCallCount}x, e.g. ${g.pinnedCallSites[0]}`);
    }
    if (r.gaps.length > 20) console.log(`    … +${r.gaps.length - 20} more gaps`);
    console.log('');
  }
}
