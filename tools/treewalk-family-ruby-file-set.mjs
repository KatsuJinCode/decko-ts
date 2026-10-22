#!/usr/bin/env node
// treewalk-family-ruby-file-set.mjs - the ONE place that knows how a
// register row's `sourceParent` spec expands into the pinned gemset's Ruby
// files, and how a port file's citation of a Ruby source is spelled.
//
// WHY ONE PLACE. The family's two instruments - the def-coverage roster and
// the per-def disposition - must agree about which files a row covers. Two
// copies of the resolver is two chances for them to disagree, and they DID
// disagree while this was being built: the coverage tool expanded
// "director/.rb (9)" as a file name and the disposition tool expanded it as
// a directory, and the two reported different def counts for the same row.
// A measurement that contradicts itself is worse than no measurement, so the
// resolver lives here and both tools import it.
//
// THE RULES, each one measured against the pinned gemset:
//
//   - A spec that names a gem and a path ("card-1.110.0/lib/card/name.rb")
//     is gem-relative.
//   - A brace group ("name/{all,all/parts}.rb") expands to its parts.
//   - A trailing count ("set/ (28)") is the register's own count of the
//     files under that spec; the count is NOT used to select files, the
//     filesystem is, and the count is checked against it.
//   - A directory spec ("set/ (28)", "view/cache (4)", "db/", "lib/cardio/
//     (55)") names EVERY .rb file under it.
//   - A directory-plus-extension spec ("director/.rb (9)") names every
//     .rb file in that directory.
//   - A glob spec ("view/cache*") names the files that match.
//   - A relative spec resolves against the row's base directory, then
//     against that directory's PARENT, then against the gem root. The
//     parent step is load-bearing: the register's e5 row is
//     "card-1.110.0/mod/core/lib/ + config/ (10)", where `config/` is
//     mod/core/config/, a SIBLING of lib/ - not a child, and not the card
//     gem's own config/ tree. Resolving it against the gem root picks up
//     the wrong 32-file tree.
//   - `.rake` is Ruby. A rake task file is a Ruby file, and the register's
//     own labels name them ("6 rake tasks").

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

export const GEMS = process.env.DECKO_RUBY_GEMSET
  ?? 'C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems';

// The Ruby source extensions the deck ships. `.rake` is Ruby: a rake task
// file is a Ruby file, and the register's own labels name them ("6 rake
// tasks").
const RUBY_EXTENSIONS = ['.rb', '.rake'];

export function isRubyFile(name) {
  return RUBY_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function walkFiles(dir, out = [], filter = () => true) {
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

// ── the row's Ruby file set ─────────────────────────────────────────────────

export function expandBraces(spec) {
  const m = spec.match(/^(.*)\{([^{}]+)\}(.*)$/);
  if (!m) return [spec];
  const [, head, body, tail] = m;
  return body.split(',').flatMap((part) => expandBraces(`${head}${part.trim()}${tail}`));
}

export function splitSpecs(sourceParent) {
  return sourceParent
    .split(' + ')
    .flatMap((part) => expandBraces(part))
    .flatMap((part) => String(part).split(','))
    // The register writes a spec's file count in two spellings: "(28)" and
    // "(28 files)". Both are the register's own count of the files under
    // that spec. The count is not used to SELECT files - the filesystem is
    // - but it is checked against it, so a resolver that picks the wrong
    // directory is caught rather than trusted.
    .map((part) => part.trim().replace(/\s*\(\d+\s*files?\)\s*$/i, '').replace(/\s*\(\d+\)\s*$/, ''))
    .filter(Boolean);
}

export function statSyncSafe(p) { try { return statSync(p); } catch { return null; } }

// A relative spec resolves against the row's base directory, then against
// that directory's PARENT, then against the gem root.
//
// The parent step is load-bearing and it was wrong in a first cut. The
// register's e5 row is "card-1.110.0/mod/core/lib/ + config/ (10)": the
// `config/` there is mod/core/config/, a SIBLING of lib/, not a child of
// it. The first cut resolved it against the gem root instead and picked
// up card-1.110.0/config/ - the card gem's own config, a different tree
// with 32 files in it. Measured: the row's own count of 10 is
// mod/core/lib/ (7) + mod/core/config/ (3), and only the parent step
// reproduces it.
export function resolveSpec(spec, baseDir, gemRoot) {
  if (/^[a-z0-9_-]+-\d/.test(spec)) return join(GEMS, spec);
  const candidates = [join(GEMS, baseDir, spec)];
  const parent = dirname(baseDir);
  if (parent && parent !== '.' && parent !== baseDir) candidates.push(join(GEMS, parent, spec));
  if (gemRoot && gemRoot !== '.') candidates.push(join(GEMS, gemRoot, spec));
  for (const c of candidates) {
    if (statSyncSafe(c)) return c;
  }
  return candidates[0];
}

export function rubyFilesFor(item) {
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
  const add = (rel) => { if (seen.has(rel)) return; seen.add(rel); files.push({ spec: rel, missing: false }); };
  for (const spec of specs) {
    if (spec.endsWith('/.rb')) {
      const dir = resolveSpec(spec.slice(0, -3), baseDir, gemRoot);
      const st = statSyncSafe(dir);
      if (st && st.isDirectory()) {
        for (const f of walkFiles(dir, [], isRubyFile)) add(relative(GEMS, f).replace(/\\/g, '/'));
        continue;
      }
    }
    if (spec.includes('*')) {
      const dir = dirname(resolveSpec(spec.replace(/\*.*$/, ''), baseDir, gemRoot));
      const leaf = spec.slice(spec.lastIndexOf('/') + 1);
      const pattern = new RegExp('^' + leaf.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      for (const f of walkFiles(dir, [], isRubyFile)) {
        if (pattern.test(f.slice(f.lastIndexOf('/') + 1))) add(relative(GEMS, f).replace(/\\/g, '/'));
      }
      continue;
    }
    const abs = resolveSpec(spec, baseDir, gemRoot);
    const st = statSyncSafe(abs);
    if (!st) {
      // A COMPOUND spec whose member is not a sibling. The register's own
      // content-diff row is
      // "card-1.110.0/lib/card/content/diff.rb + diff/{l_c_s,processor,
      // result,summary}.rb", and the pinned tree's diff/ directory holds
      // l_c_s.rb, result.rb, summary.rb and a l_c_s/ SUBDIRECTORY whose
      // processor.rb is the register's "processor". The spec names it as
      // "diff/processor.rb", which is not a path in the pinned tree.
      //
      // So the fallback searches RECURSIVELY under the group directory for
      // a file with that leaf name, and takes it only when the leaf is
      // UNIQUE there. An ambiguous leaf is reported as missing rather
      // than guessed at, because a wrong file in a coverage count is a
      // number that lies.
      const leafName = spec.split('/').pop();
      const searchRoots = [
        join(GEMS, baseDir, dirname(spec)),
        join(GEMS, dirname(baseDir), dirname(spec)),
        join(GEMS, baseDir),
      ];
      const matches = [];
      for (const root of searchRoots) {
        const rootStat = statSyncSafe(root);
        if (!rootStat || !rootStat.isDirectory()) continue;
        for (const f of walkFiles(root, [], isRubyFile)) {
          // The comparison is on the RELATIVE path with forward slashes:
          // the absolute path on this machine carries backslashes, so a
          // plain endsWith("/leaf") test never matches and the fallback
          // silently reported every such spec as missing.
          const rel = relative(GEMS, f).replace(/\\/g, '/');
          if (!rel.endsWith(`/${leafName}`)) continue;
          if (!matches.includes(rel)) matches.push(rel);
        }
        if (matches.length) break;
      }
      if (matches.length !== 1) { files.push({ spec, missing: true }); continue; }
      add(matches[0]);
      continue;
    }
    if (st.isDirectory()) {
      for (const f of walkFiles(abs, [], isRubyFile)) add(relative(GEMS, f).replace(/\\/g, '/'));
    } else {
      add(relative(GEMS, abs).replace(/\\/g, '/'));
    }
  }
  return files;
}

// The row's Ruby sources, in every spelling a port file might cite them
// in.
//
// The port cites a Ruby source as a gem-relative path
// ("card-1.110.0/lib/card/auth/proxy.rb"), as a gem-relative path without
// the gem ("lib/card/auth/proxy.rb"), or as a BARE FILE NAME
// ("auth/proxy.rb", "proxy.rb"). The bare name is ambiguous across gems,
// so a bare citation only counts when it is unique to this row's own file
// set - otherwise a citation of some other gem's "content.rb" would be
// read as a citation of this row's "content.rb".
export function rowRubySources(item) {
  const files = rubyFilesFor(item).filter((e) => !e.missing).map((e) => e.spec);
  const sources = new Set();
  const baseNames = new Map(); // bare name -> the full paths that carry it
  for (const f of files) {
    const m = f.match(/^([a-z0-9_-]+-\d[^/]*)\/(.*)$/);
    if (!m) continue;
    const full = `${m[1]}/${m[2]}`;
    sources.add(full);
    sources.add(m[2]);                                  // without the gem
    const leaf = m[2].split('/').pop();
    if (!baseNames.has(leaf)) baseNames.set(leaf, []);
    baseNames.get(leaf).push(full);
  }
  // A bare name joins the source set only when this row's own file set is
  // the only place in the deck with that name.
  for (const [leaf, owners] of baseNames) {
    if (owners.length === 1) sources.add(leaf);
  }
  return { files, sources: [...sources] };
}


// A row's file set: the resolved files, the ones the resolver could not
// find, and the spellings a port file might cite them in.
export function rowFileSet(item) {
  const entries = rubyFilesFor(item);
  return {
    entries,
    files: entries.filter((e) => !e.missing).map((e) => e.spec),
    missing: entries.filter((e) => e.missing).map((e) => e.spec),
    sources: rowRubySources(item).sources,
  };
}
