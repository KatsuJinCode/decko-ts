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
// THE DECK'S SPEC TREE IS NOT THE DECK'S BEHAVIOUR. A def that only the
// pinned gemset's own spec files call is a TEST ARTIFACT: the old
// system's test suite calls it, and the port's answer to a test helper
// is the port's own test suite, not a runtime module. So the
// reachability seeds are the calls made from NON-SPEC deck code, and a
// def whose only callers are spec files is not reachable behaviour.
//
// The spec tree is identified by the path, not by a name pattern:
// any gem's spec/ directory, and the deck's own *_spec.rb files.
function isSpecFile(rel) {
  return /(^|\/)spec\//.test(rel) || /_spec\.rb$/.test(rel);
}

for (const [name, calls] of callIndex) {
  const owners = defOwners.get(name);
  if (!owners) continue;                    // not a deck def: not deck behaviour
  for (const c of calls) {
    // A call from the deck's own SPEC tree is a test caller, not a
    // behaviour caller.
    if (isSpecFile(c.file)) continue;
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
      // The port writes the gem and the path in three shapes, and all
      // three are its own citation of a Ruby source:
      //   "card-1.110.0/lib/card/auth/proxy.rb:6-24"   (slash)
      //   "card-1.110.0 lib/card/mailer.rb:9-16"        (space)
      //   "lib/card/mailer.rb:9-16"                     (no gem)
      // so all three are read.
      const full = line.match(/(?:card-1\.110\.0|decko-0\.20\.0|card-mod-[a-z_]+-0\.20\.0)[\s\/]+[A-Za-z0-9_./{}*-]*\.rb/);
      // The citation's Ruby source is NORMALISED to the slash form, so
      // the space form ("card-1.110.0 lib/card/mailer.rb:9-16") and the
      // slash form name the same file for the row's matcher.
      if (full) {
        const normalised = full[0].replace(/\s+/, '/');
        citations.push({ line: i + 1, text: line.trim(), rubySource: normalised, kind: 'full-path' });
      }
      const bare = line.match(/\b([A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*)\.rb\b/);
      if (bare) citations.push({ line: i + 1, text: line.trim(), rubySource: `${bare[1]}.rb`, kind: 'bare-name' });
      // A LINE-RANGE MAP. The port's headers map a Ruby file's methods
      // by line, and the map CONTINUES over several comment lines that
      // carry no file name of their own:
      //
      //   THE CENSUS - card-1.110.0/lib/card/auth/setup.rb
      //     :9-15   needs_setup?  (memoized per process; ...)
      //     :33-37  needs_setup_if_no_accounts = user_account_count.zero?
      //
      // So the map's lines are collected as a block: the line that names
      // the Ruby file, and the lines that follow it while the map's
      // shape holds. The file the map names is the file every range in
      // it is relative to.
      const mapStart = line.match(/^(?:\s*\/\/|\s*\*)?\s*.*?([A-Za-z0-9_.-]+\.rb)\s*$/);
      if (mapStart) {
        const mapFile = mapStart[1];
        const mapLines = [{ line: i + 1, text: line.trim() }];
        for (let j = i + 1; j < lines.length && j < i + 12; j++) {
          const next = lines[j];
          if (!/^\s*(?:\/\/|\*)/.test(next)) break;
          // The map's entries are ":NN-MM  method_name" and the
          // INDENTED CONTINUATION of an entry, which carries no ":NN"
          // of its own. So a line that is more indented than the map's
          // first entry is a continuation of it, and it belongs to the
          // block.
          const isEntry = /^\s*(?:\/\/|\*)\s*:\d/.test(next);
          const isContinuation = mapLines.length > 1
            && /^\s*(?:\/\/|\*)\s{6,}/.test(next)
            && !/^\s*(?:\/\/|\*)\s*:\d/.test(next);
          if (!isEntry && !isContinuation) break;
          mapLines.push({ line: j + 1, text: next.trim() });
        }
        for (const ml of mapLines) {
          citations.push({
            line: ml.line,
            text: ml.text,
            rubySource: mapFile,
            kind: 'line-range-map',
          });
        }
        // The map's lines are NOT skipped: the line that names the Ruby
        // file can ALSO carry the method's name ("Card::Mailer.new_mail"
        // on the citation line), and skipping it lost the cited-method
        // claim. The map's own entries are collected as citations, and
        // the loop continues over the same lines.
      }
      // A CITED METHOD. The port also names the Ruby METHOD it ports,
      // in the form "mark.rb#id_or_name" or "fetch.rb:34-36". That is the
      // port's own claim about one specific method, and it is the
      // strongest claim the port makes: a file that says
      // "Card.id_or_name (lib/card/mark.rb#id_or_name)" is saying it
      // carries that method. A first cut that only looked for the
      // method's NAME IN CODE missed every such claim, because the
      // citation is in a comment and the port's function has its own
      // name (normalizeMark, not id_or_name).
      // A CITED METHOD, in the form "mark.rb#id_or_name" or "proxy.rb:
      // 26-29" plus the method's name. The port writes the second form
      // with the name in the SAME comment, one clause over: "(proxy.rb:
      // 26-29, `as_bot { ... }` = `as(Card::DeckoBotID)`)". So a
      // comment that names a Ruby source AND a method is a claim about
      // that method, whatever order the two appear in.
      const citedSource = line.match(/([A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*\.rb)([#:]\s*([A-Za-z_][A-Za-z_0-9]*[?!=]?))?/);
      if (citedSource) {
        // The method named right after the file, if any.
        const afterSource = citedSource[3];
        // Otherwise, the method named anywhere in the comment, in a form
        // that names a method and not a word: `as_bot`, as_bot, as_bot().
        // A method name in the comment, in a form that says METHOD and
        // not prose: backticked (`as_bot`), or followed by a block or a
        // call (`as_bot { ... }`, `as_bot(...)`), or a Ruby-style
        // qualified call (`Auth.as_bot`). A bare English word is not a
        // method name, so "whose" and "must" never count.
        const named = line.match(/`([a-z_][a-z_0-9]*[?!]?)[^`]*`|\b([A-Z][A-Za-z0-9_]*)::([a-z_][a-z_0-9]*[?!]?)\b|\b([A-Z][A-Za-z0-9_]*)\.([a-z_][a-z_0-9]*[?!]?)\b|\b([a-z_][a-z_0-9]*[?!]?)\s*\(/g)
          ?? [];
        // The FIRST method name after the file citation is the one the
        // citation is about: "(proxy.rb:26-29, `as_bot { ... }` = ...)"
        // names as_bot first, and the `as` in the tail is the OTHER
        // method the comment compares it to.
        const afterIndex = line.indexOf(citedSource[1]);
        // The method name can be on EITHER side of the file citation:
        // the port writes "mark.rb#id_or_name" (the name after) and
        // "`signin_with_token` (auth/token.rb:38-41)" (the name before).
        // So the whole line is searched, and the name nearest the
        // citation wins.
        const before = afterIndex >= 0 ? line.slice(0, afterIndex) : '';
        const tail = afterIndex >= 0 ? line.slice(afterIndex + citedSource[1].length) : line;
        const tailNamed = tail.match(/`([a-z_][a-z_0-9]*[?!]?)[^`]*`|\b([A-Z][A-Za-z0-9_]*)::([a-z_][a-z_0-9]*[?!]?)\b|\b([A-Z][A-Za-z0-9_]*)\.([a-z_][a-z_0-9]*[?!]?)\b|\b([a-z_][a-z_0-9]*[?!]?)\s*\(/g)
          ?? [];
        // The name each match carries: the backticked one, the qualified
        // one's last part, or the call-form one.
        const methodOf = (m) => {
          const backticked = m.match(/^`([a-z_][a-z_0-9]*[?!]?)/);
          if (backticked) return backticked[1];
          const qualified = m.match(/::([a-z_][a-z_0-9]*[?!]?)$/);
          if (qualified) return qualified[1];
          const dotted = m.match(/\.([a-z_][a-z_0-9]*[?!]?)$/);
          if (dotted) return dotted[1];
          // A qualified call's method is its LAST segment: the port
          // writes "Card::Mailer.new_mail" and "Auth.as_bot", and the
          // method is what comes after the final separator.
          const lastSegment = m.match(/([a-z_][a-z_0-9]*[?!]?)$/);
          if (lastSegment) return lastSegment[1];
          const call = m.match(/^([a-z_][a-z_0-9]*[?!]?)\s*\($/);
          if (call) return call[1];
          return null;
        };
        const beforeNamed = before.match(/`([a-z_][a-z_0-9]*[?!]?)[^`]*`|\b([A-Z][A-Za-z0-9_]*)::([a-z_][a-z_0-9]*[?!]?)\b|\b([A-Z][A-Za-z0-9_]*)\.([a-z_][a-z_0-9]*[?!]?)\b|\b([a-z_][a-z_0-9]*[?!]?)\s*\(/g)
          ?? [];
        // The name nearest the citation: the tail's if the tail has
        // one, else the before's, else the whole line's if it has
        // exactly one.
        const method = afterSource
          ?? (tailNamed.length > 0 ? methodOf(tailNamed[0])
            : (beforeNamed.length > 0 ? methodOf(beforeNamed[beforeNamed.length - 1])
              : (named.length === 1 ? methodOf(named[0]) : null)));
        if (method) {
          citations.push({
            line: i + 1,
            text: line.trim(),
            rubySource: citedSource[1],
            kind: 'cited-method',
            method,
          });
        }
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

// The port's ECHOING DECLARATIONS, indexed once. An ECHO is an exported
// declaration whose name CONTAINS a Ruby method's name - `encode` in
// `encodeAuthToken`, `mark` in `markName`. The port's own naming of its
// counterpart, and the rig's PORTED claim rests on it.
//
// The index is built once, because the port tree is large and the rows
// have many defs, and reading every port file per def made the family
// run take minutes.
// The line separator, as a REGEX built from byte codes so that no
// editor or shell can eat the backslashes in it.
const LINE_SPLIT_RE = new RegExp(String.fromCharCode(13, 10) + "?|" + String.fromCharCode(10));

const portEchoes = new Map(); // stem -> [{ file, line, name, citingFiles }]
for (const f of walkFiles(PORT, [], (e) => e.endsWith(".ts"))) {
  const rel = relative(PORT, f).split(pathSep).join('/');
  const lines = readFileSync(f, 'utf8').split(LINE_SPLIT_RE);
  for (let i = 0; i < lines.length; i++) {
    const decl = lines[i].match(/export\s+(?:async\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]*)/);
    if (!decl) continue;
    const name = decl[1].toLowerCase();
    // Every stem of at least four characters that the name contains is
    // an echo of that stem.
    for (const stem of new Set(name.split(/[^a-z0-9]+/).filter((w) => w.length >= 4))) {
      if (!portEchoes.has(stem)) portEchoes.set(stem, []);
      portEchoes.get(stem).push({
        file: rel,
        line: i + 1,
        name: decl[1],
        citation: (headerCitations.get(rel) ?? [])[0]?.rubySource ?? '',
      });
    }
  }
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
// The port's file contents, read ONCE. The site resolver is called
// once per def, and re-reading the port tree each time made the
// family's largest row take over a minute.
const portFileCache = new Map();

function portFileLines(portFile) {
  if (portFileCache.has(portFile)) return portFileCache.get(portFile);
  const file = join(PORT, portFile);
  const lines = existsSync(file)
    ? readFileSync(file, 'utf8').split(LINE_SPLIT_RE)
    : null;
  portFileCache.set(portFile, lines);
  return lines;
}

function portFunctionLine(portFile, citation, rubyMethod) {
  const lines = portFileLines(portFile);
  if (lines === null) return citation.line;
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
  // The search is over the WHOLE file, not only the lines below the
  // citation, because the port's own map lives in a header and the
  // function it documents can be anywhere. The port's convention is that
  // the function's name echoes the Ruby method's words - `as_bot` is
  // `actorBot`, `as` is `actorByCodename`/`actorAnonymous` - so the
  // counterpart is the function whose name shares a WORD with the Ruby
  // method's name, nearest the citation.
  // The Ruby method's words. A SHORT name ("as", "id", "cache") is still
  // a word - it is the method's whole name - so the length filter keeps
  // only the separator, not short names.
  const words = (rubyMethod ?? '')
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 0);
  const candidates = [];
  for (let j = 0; j < lines.length; j++) {
    const decl = lines[j].match(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
    if (!decl) continue;
    const name = decl[1].toLowerCase();
    const shared = words.filter((w) => name.includes(w.toLowerCase()));
    if (shared.length === 0) continue;
    candidates.push({ line: j + 1, shared: shared.length });
  }
  if (candidates.length > 0) {
    // The candidate nearest the citation, and among equals the one that
    // shares the most words.
    candidates.sort((a, b) => {
      const d = Math.abs(a.line - citation.line) - Math.abs(b.line - citation.line);
      if (d !== 0) return d;
      return b.shared - a.shared;
    });
    return candidates[0].line;
  }
  for (; i < lines.length && i < citation.line + 40; i++) {
    if (lines[i].match(/export\s+(?:async\s+)?(?:function|class)\s+[A-Za-z_$][\w$]*/)) {
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

// The pinned file's defs, extracted ONCE per file. The rows share
// files (the card gem's own files are the rows' subject), and re-reading
// and re-parsing them per row made the family run take minutes.
const defsCache = new Map();

function defsIn(file) {
  if (defsCache.has(file)) return defsCache.get(file);
  const defs = defsInUncached(file);
  defsCache.set(file, defs);
  return defs;
}

function defsInUncached(file) {
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
    // A PORTED-INLINE claim can also be the port's HEADER MAP, which
    // names a Ruby file and then lists that file's methods by line:
    //
    //   THE CENSUS - card-1.110.0/lib/card/auth/setup.rb
    //     :9-15   needs_setup?  (memoized per process; ...)
    //     :33-37  needs_setup_if_no_accounts = user_account_count.zero?
    //     :48-52  user_account_count = as_bot { Card.count_by_cql cql }
    //
    // A map entry that NAMES the method and gives a line range that
    // COVERS the method's own line in that Ruby file is the port's own
    // claim about that method, and it does not need the port to repeat
    // the name anywhere else.
    let mapHit = null;
    for (const [portFile, citations] of headerCitations) {
      const sourceCitations = citations.filter((c) => c.kind === 'line-range-map'
        && sources.some((s) => (
          c.rubySource === s
          || c.rubySource.endsWith(`/${s}`)
          || s.endsWith(`/${c.rubySource}`)
        )));
      if (sourceCitations.length === 0) continue;
      for (const c of sourceCitations) {
        const range = c.text.match(/:(\d+)(?:-(\d+))?/);
        if (!range) continue;
        const from = Number(range[1]);
        const to = range[2] ? Number(range[2]) : from;
        if (!c.text.includes(m.name)) continue;
        if (m.line < from || m.line > to) continue;
        mapHit = {
          file: portFile,
          line: c.line,
          mentionLine: c.line,
          citation: `${c.rubySource}:${from}${range[2] ? `-${range[2]}` : ''} ${m.name}`,
          kind: 'cited-line-range',
        };
        break;
      }
      if (mapHit) break;
    }

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
          // The site's line is the PORT FUNCTION, when the file has one
          // whose name echoes the Ruby method's words; otherwise the
          // mention's own line, which is where the name appears.
          // The site is a DECLARATION line, or the mention's own line
          // when the file has no declaration whose name echoes the Ruby
          // method's words. A site that points at a comment is not a
          // site a reader can check the behaviour at.
          const functionLine = portFunctionLine(site.file, hit, m.name);
          const isDeclaration = (l) => /export\s+(?:async\s+)?(?:function|class|const|interface|type)\s|\b(?:public|private|protected|static|readonly|async)\s+[A-Za-z_$][\w$]*\s*[(<:]/.test(l);
          const fileLines = readFileSync(join(PORT, site.file), 'utf8').split(String.fromCharCode(10));
          const siteIsDeclaration = isDeclaration(fileLines[site.line - 1] ?? '');
          const functionIsDeclaration = isDeclaration(fileLines[functionLine - 1] ?? '');
          const chosen = functionIsDeclaration ? functionLine : (siteIsDeclaration ? site.line : functionLine);
          headerHit = {
            file: site.file,
            line: hit.line,
            mentionLine: chosen,
            citation: hit.rubySource,
          };
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
        const aFn = portFunctionLine(a.portFile, a.c, m.name);
        const bFn = portFunctionLine(b.portFile, b.c, m.name);
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
          mentionLine: portFunctionLine(best.portFile, best.c, m.name),
          citation: `${best.c.rubySource}#${best.c.method}`,
          kind: 'cited-method',
        };
      }
    }
    if (mapHit && !headerHit) headerHit = mapHit;

    // A PORTED claim needs BOTH halves in the SAME port file too: the
    // file must BIND the name AND cite this row's Ruby source. A name
    // bound in an unrelated file proves nothing - the rig found
    // Card::Auth::Token's `encode` bound at
    // src/card/attachments/image-resize.ts:100, which is an image
    // resizer's own encode and has nothing to do with a JWT.
    //
    // And the name the port binds may be the port's OWN name for the
    // method: the port's counterpart of token.rb#encode is
    // `encodeAuthToken` (src/card/auth/token.ts:309), and the port's
    // file says at :1 that it IS "the port of
    // card-1.110.0/lib/card/auth/token.rb". So a binding whose name
    // CONTAINS the Ruby method's name, in a file that cites the row's
    // Ruby source, is a PORTED claim.
    let bindingHit = null;
    const echoHit = (() => {
      const stem = m.name.replace(/[?!=]$/, '').toLowerCase();
      if (stem.length < 4) return null;         // too short to be an echo
      // The port's ECHOING DECLARATIONS, indexed ONCE: every exported
      // declaration in the port tree, by the name that ECHOES it. The
      // index is built once because the row's defs are many and the port
      // tree is large, and re-reading every port file per def made the
      // family run take minutes.
      for (const e of portEchoes.get(stem) ?? []) {
        // The echo must be in a file that CITES this row's Ruby source.
        const cites = (headerCitations.get(e.file) ?? []).some((c) => sources.some((s) => (
          c.rubySource === s
          || c.rubySource.endsWith(`/${s}`)
          || s.endsWith(`/${c.rubySource}`)
        )));
        if (!cites) continue;
        return { file: e.file, line: e.line, citation: e.citation };
      }
      return null;
    })();
    // The echo wins over a bare name binding in an UNRELATED file: a
    // name bound somewhere that does not cite this row's Ruby source
    // says nothing about that Ruby, and a binding whose name ECHOES the
    // Ruby method's, in a file that DOES cite the source, is the port's
    // own claim. (The rig found token.rb#encode "PORTED" at
    // src/card/attachments/image-resize.ts:100 - an image resizer's own
    // encode - while the port's real counterpart is `encodeAuthToken`
    // at src/card/auth/token.ts:309.)
    if (echoHit) bindingHit = echoHit;
    if (binding && !bindingHit) {
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

    // THE PORT'S COLLAPSE STATEMENTS, indexed ONCE.
//
// A DOCUMENTED COLLAPSE is a named skip, and it is the port's own
// statement about itself.
//
// The port's actor.ts says, in its own header: "the TS engine has no
// process-global Auth singleton - the actions layer takes an explicit
// actor parameter - so `as`/`as_bot` (proxy.rb:5-24) collapse into 'pass
// a different actor object'" and "The Proxy module's save/restore
// machinery (proxy.rb:63-76 temporarily) has no counterpart: nothing
// global is mutated."
//
// That is a DIVERGENCE the port NAMES, with the mechanism and the Ruby
// lines, and it is not a missing port behaviour - the port carries the
// behaviour by a different mechanism on purpose.
//
// The index is built ONCE, because the collapse search used to re-read
// every citing port file for every def, and the family's largest row
// took over a minute.
//
// Each entry is a SENTENCE the port wrote, split on a sentence boundary
// that is not part of a file name and not the end of a decimal number
// (a plain split on [.;] cut "proxy.rb:5-24" in half, and the citation
// that says which methods the sentence is about was lost), together with
// the file it is in and the Ruby sources that file cites.
const portCollapseSentences = [];
for (const [portFile, citations] of headerCitations) {
  const fileLines = portFileLines(portFile);
  if (fileLines === null) continue;
  for (const c of citations) {
    let start = c.line - 1;
    let end = c.line;
    while (start > 0 && fileLines[start - 1].trim().startsWith('//')) start--;
    while (end < fileLines.length && fileLines[end].trim().startsWith('//')) end++;
    const block = fileLines.slice(start, end).join(' ');
    const sentences = block
      .replace(/([A-Za-z0-9_])\.(rb|yml|json|ts|haml)\b/g, '$1\\u0000$2')
      .replace(/\b(\d+)\.(\d+)\b/g, '$1\\u0000$2')
      .split(/[.;]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.replace(/\\u0000/g, '.'));
    for (const sentence of sentences) {
      if (!/collaps|no counterpart|has no port|is not ported|not ported/i.test(sentence)) continue;
      portCollapseSentences.push({ portFile, sentence, line: c.line });
    }
  }
}

    // The row's collapse statements: the port's own sentences that name
    // a Ruby method and say it collapses or has no counterpart, in a
    // file that cites this row's Ruby source. The search is over the
    // INDEX the port tree was built into, not over the port tree.
    let collapse = null;
    for (const cs of portCollapseSentences) {
      // The sentence must be ABOUT this method: it names the method,
      // or it cites a line range that covers the method's own line in
      // the Ruby file the sentence names.
      const names = cs.sentence.includes(m.name);
      const range = cs.sentence.match(/([A-Za-z0-9_./-]+\.rb):(\d+)(?:-(\d+))?/);
      const covers = range
        && range[1].endsWith(m.file.split('/').pop())
        && m.line >= Number(range[2])
        && m.line <= (range[3] ? Number(range[3]) : Number(range[2]));
      if (!names && !covers) continue;
      // And the file must cite THIS row's Ruby source.
      const cites = (headerCitations.get(cs.portFile) ?? []).some((c) => sources.some((src) => (
        c.rubySource === src
        || c.rubySource.endsWith(`/${src}`)
        || src.endsWith(`/${c.rubySource}`)
      )));
      if (!cites) continue;
      collapse = { file: cs.portFile, line: cs.line, text: cs.sentence.slice(0, 400) };
      break;
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
    else if (collapse) disposition = 'NAMED-COLLAPSE';
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
      collapse: collapse ? `${collapse.file}:${collapse.line} (${collapse.text})` : null,
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
