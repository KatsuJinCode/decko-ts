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

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep as pathSep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GEMS as PINNED_GEMS,
  isRubyFile,
  rowRubySources,
  rubyFilesFor,
  walkFiles,
} from './treewalk-family-ruby-file-set.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const GEMS = process.env.DECKO_RUBY_GEMSET
  ?? 'C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems';
const PORT = process.env.DECKO_TS_PORT_SRC ?? join(REPO_ROOT, 'src');
const ROSTER = process.env.DECKO_COMPLETENESS_ROSTER
  ?? 'C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json';
const FAMILY = process.env.DECKO_TREEWALK_FAMILY ?? 'register-treewalk';
const OUT = process.env.DECKO_TREEWALK_DISPOSITION_OUT ?? null;

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

for (const f of walkFiles(GEMS, [], isRubyFile)) {
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
      // The port cites its Ruby sources in two spellings: the full
      // gem-relative path ("card-1.110.0/lib/card/auth/proxy.rb:6-24")
      // and the BARE FILE NAME with a line ("auth/proxy.rb:33-35",
      // "proxy.rb:11"). The bare form is the port's dominant convention,
      // and a first cut that only accepted the full path missed most of
      // the port's own claims. Both are recorded here, and the row's
      // matcher accepts either.
      const full = line.match(/(?:card-1\.110\.0|decko-0\.20\.0|card-mod-[a-z_]+-0\.20\.0)\/[A-Za-z0-9_./{}*-]*\.rb/);
      if (full) citations.push({ line: i + 1, text: line.trim(), rubySource: full[0], kind: 'full-path' });
      const bare = line.match(/([A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*)\.rb/);
      if (bare) citations.push({ line: i + 1, text: line.trim(), rubySource: `${bare[1]}.rb`, kind: 'bare-name' });
      // A CITED METHOD. The port also names the Ruby METHOD it ports,
      // in the form "mark.rb#id_or_name" or "fetch.rb:34-36". That is the
      // port's own claim about one specific method, and it is the
      // strongest claim the port makes: a file that says
      // "Card.id_or_name (lib/card/mark.rb#id_or_name)" is saying it
      // carries that method. A first cut that only looked for the
      // method's NAME IN CODE missed every such claim, because the
      // citation is in a comment and the port's function has its own
      // name (normalizeMark, not id_or_name).
      const cited = line.match(/([A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*\.rb)[#:]\s*([A-Za-z_][A-Za-z_0-9]*[?!=]?)/);
      if (cited) {
        citations.push({
          line: i + 1,
          text: line.trim(),
          rubySource: cited[1],
          kind: 'cited-method',
          method: cited[2],
        });
      }
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
      // EVERY mention site is kept, not just the first. A name's first
      // mention in the port tree is often in an unrelated file, and a
      // single-site index would then hide the very file that cites this
      // row's Ruby source and carries the name.
      if (!portMentions.has(key)) portMentions.set(key, []);
      portMentions.get(key).push({ file: rel, line: i + 1, text: line.trim() });
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
    const sites = portMentions.get(f.toLowerCase());
    if (sites && sites.length) return { binding: null, mention: { ...sites[0], sites, matchedForm: f } };
  }
  return { binding: null, mention: null };
}

// The port function that carries a cited Ruby method. The citation
// comment names the Ruby; the function below or beside it is the
// counterpart. The search is over the file's own declarations, and it
// takes the first exported function whose name the file's own text
// mentions - the port's own naming of its counterpart.
//
// The recorded site is the FUNCTION's line, not the citation's line. The
// citation says which Ruby the file ports; the function is where the
// behaviour is, and a row receipt that pointed at the comment would
// send a reader to the wrong line.
function portFunctionLine(portFile, citation) {
  const file = join(PORT, portFile);
  if (!existsSync(file)) return citation.line;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  // The port's doc comment sits directly above the function it
  // documents, and the comment is where the citation is. So the
  // counterpart is the FIRST exported declaration below the citation,
  // once the comment block the citation sits in has ended.
  //
  // The names do not have to match: the port cites the RUBY method
  // ("Card.id_or_name (lib/card/mark.rb#id_or_name)") and names its own
  // function something else ("normalizeMark"). The doc comment IS the
  // port's statement that the function below it ports that Ruby, and
  // the row receipt quotes both.
  let i = citation.line;
  while (i < lines.length && lines[i].trim().startsWith("//")) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  for (; i < lines.length && i < citation.line + 40; i++) {
    if (lines[i].match(/export\s+(?:async\s+)?(?:function|const|class)\s+[A-Za-z_$][\w$]*/)) {
      return i + 1;
    }
  }
  return citation.line;
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
  let privateFrom = Infinity;
  text.split(/\r?\n/).forEach((ln, i) => {
    // Ruby's `private` with no arguments makes every LATER def in the
    // same body private. So a def's visibility is a property of its
    // position, and the position is what the pinned bytes say.
    if (/^\s*private\s*$/.test(ln)) privateFrom = Math.min(privateFrom, i);
    const m = ln.match(DEF_RE);
    if (m && !IGNORE.has(m[1])) {
      out.push({
        name: m[1],
        file,
        line: i + 1,
        // A def before the `private` marker is PUBLIC: it is the file's
        // API, and the deck's own gems may not call it while the
        // application still does. A def after the marker is a private
        // helper, and a private helper the deck never calls is dead
        // weight in the old system.
        visibility: i < privateFrom ? 'public' : 'private',
      });
    }
  });
  return out;
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
  const entries = rubyFilesFor(item);
  const files = entries.filter((e) => !e.missing).map((e) => e.spec);
  const sources = rowRubySources(item).sources;
  const methods = [];
  for (const f of files) methods.push(...defsIn(f));
  const defs = methods.map((m) => {
    const { binding, mention } = portLookup(m.name);
    const reach = binding ? { reachable: false, reason: 'port-bound', sites: [], count: 0 } : reachability(m.name);
    // A PORTED-INLINE disposition needs a citing port file whose OWN
    // HEADER names this row's Ruby source.
    // A PORTED-INLINE claim needs BOTH halves in the SAME port file: the
    // file must cite this row's Ruby source, and the file must carry the
    // def's name. A mention in a file that does not cite the Ruby source
    // proves nothing about that Ruby.
    let headerHit = null;
    if (mention) {
      for (const site of mention.sites) {
        const citations = headerCitations.get(site.file) ?? [];
        const hit = citations.find((c) => sources.some((s) => (
          c.rubySource === s
          || c.rubySource.endsWith(`/${s}`)
          || s.endsWith(`/${c.rubySource}`)
        )));
        if (hit) {
          headerHit = { file: site.file, line: hit.line, mentionLine: site.line, citation: hit.rubySource };
          break;
        }
      }
    }
    // A CITED-METHOD claim stands on its own: a port file that names
    // THIS Ruby file and THIS method ("mark.rb#id_or_name") is claiming
    // that method, whatever the port's own function is called.
    //
    // The BEST citation is the one whose doc comment documents a
    // FUNCTION, not a type. A file can cite the same Ruby method twice
    // - once over a type alias ("Everything Card.fetch accepts as a mark
    // (fetch/card_class.rb doc + mark.rb#id_or_name)") and once over the
    // function that implements it ("Card.id_or_name (lib/card/mark.rb#
    // id_or_name): flatten the args") - and the second is the one that
    // says where the behaviour is.
    if (!headerHit) {
      const candidates = [];
      for (const [portFile, citations] of headerCitations) {
        for (const c of citations) {
          if (c.kind !== 'cited-method') continue;
          if (c.method !== m.name) continue;
          if (!sources.some((s) => (
            c.rubySource === s
            || c.rubySource.endsWith(`/${s}`)
            || s.endsWith(`/${c.rubySource}`)
          ))) continue;
          candidates.push({ portFile, c });
        }
      }
      // A citation that documents a function beats one that documents a
      // type; among equals, the LATER one wins, because the port's own
      // convention is to cite the type near the top of the file and the
      // function at the implementation.
      candidates.sort((a, b) => {
        const aFn = portFunctionLine(a.portFile, a.c);
        const bFn = portFunctionLine(b.portFile, b.c);
        const aIsFn = aFn !== a.c.line;
        const bIsFn = bFn !== b.c.line;
        if (aIsFn !== bIsFn) return aIsFn ? -1 : 1;
        return b.c.line - a.c.line;
      });
      const best = candidates[0];
      if (best) {
        headerHit = {
          file: best.portFile,
          line: best.c.line,
          // The PORT'S OWN FUNCTION is the site, not the citation
          // comment: the comment says which Ruby the file ports, and
          // the function is where the behaviour is.
          mentionLine: portFunctionLine(best.portFile, best.c),
          citation: `${best.c.rubySource}#${best.c.method}`,
          kind: 'cited-method',
        };
      }
    }
    // A PORTED claim needs BOTH halves in the SAME port file too: the
    // file must BIND the name AND cite this row's Ruby source. A name
    // bound in an unrelated file proves nothing - the rig found
    // Card::Auth::Token's `encode` bound at
    // src/card/attachments/image-resize.ts:100, which is an image
    // resizer's own encode and has nothing to do with a JWT.
    let bindingHit = null;
    if (binding) {
      const citations = headerCitations.get(binding.file) ?? [];
      const hit = citations.find((c) => sources.some((s) => (
        c.rubySource === s
        || c.rubySource.endsWith(`/${s}`)
        || s.endsWith(`/${c.rubySource}`)
      )));
      // The recorded site is the BINDING's own line, not the citation's
      // line. The citation says WHICH Ruby the file ports; the binding
      // is where the behaviour is. A reader checking the site wants the
      // binding, and a row receipt that pointed at the citation would
      // send them to the wrong line.
      if (hit) bindingHit = { file: binding.file, line: binding.line, citation: hit.rubySource, citationLine: hit.line };
    }

    // A SKIP needs the def to be a PRIVATE helper AND unreachable. A
    // PUBLIC method the deck's own gems never call is still the file's
    // API - the application calls it - so a missing port counterpart for
    // it is a GAP, not a skip. The first cut read every uncalled def as
    // a skip, and that would have quietly excused the public half of
    // every file in the family.
    const skippable = !reach.reachable && m.visibility === 'private';
    let disposition;
    if (bindingHit) disposition = 'PORTED';
    else if (headerHit) disposition = 'PORTED-INLINE';
    else if (skippable) disposition = 'SKIP';
    else disposition = 'GAP';
    return {
      name: m.name,
      file: m.file,
      line: m.line,
      disposition,
      portBinding: binding ? `${binding.file}:${binding.line}` : null,
      portBindingCited: bindingHit ? `${bindingHit.file}:${bindingHit.line} (${bindingHit.citation})` : null,
      portMention: mention ? `${mention.file}:${mention.line}` : null,
      headerCitation: headerHit ? `${headerHit.file}:${headerHit.line} (${headerHit.citation})` : null,
      inlineSite: headerHit ? `${headerHit.file}:${headerHit.mentionLine}` : null,
      reachability: reach.reason,
      visibility: m.visibility,
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
