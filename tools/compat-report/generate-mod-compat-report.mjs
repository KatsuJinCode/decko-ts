// generate-mod-compat-report.mjs — per-mod compatibility report for decko-ts.
//
// For every installed card-mod-* gem under GEM_DIR, inventory what it defines
// (set patterns, set modules, html views, rules - parsing set/*.rb, lib/**/*.rb,
// set/**/*.haml), then compare against the decko-ts implemented surface
// (src/card/set-patterns/, src/card/render/ - read-only inspection of source).
// Classify each mod as ported / partial / missing with one line of evidence per
// verdict. Legacy-labeled mods are flagged 'ignored'.
//
// Usage:
//   node tools/compat-report/generate-mod-compat-report.mjs
//   node tools/compat-report/generate-mod-compat-report.mjs --json-only
//   node tools/compat-report/generate-mod-compat-report.mjs --md-only
//
// Truth source: the Ruby gem source files (parsed by regex, not executed) and
// the TypeScript implementation files (read-only). No npm deps required.

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, basename, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(HERE)); // tools/compat-report -> repo root
const GEM_DIR =
  "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems";
const SET_PATTERNS_DIR = join(REPO, "src", "card", "set-patterns");
const RENDER_DIR = join(REPO, "src", "card", "render");
const RULES_DIR = join(REPO, "src", "card", "rules");
const PERMS_DIR = join(REPO, "src", "card", "permissions");

const OUTPUT_MD = join(HERE, "mod-compat-report.md");
const OUTPUT_JSON = join(HERE, "mod-compat-report.json");

// The 9 concrete set patterns registered by card-1.110.0 mod/core/set_pattern.
// (src/card/set-patterns/registry.ts PATTERN_TABLE - frozen, lookup-order.)
const IMPLEMENTED_PATTERNS = [
  "self",
  "type_plus_right",
  "right",
  "rule",
  "rstar",
  "star",
  "type",
  "all_plus",
  "all",
];

// "Universal" views shipped by card-mod-format and the deck core - every
// card renders through them. A mod that declares only these as its html
// views contributes NO mod-specific rendering; using them as the sole
// signal would over-report ported status (a mod that just calls
// `view :core do ...end` would appear "ported" because :core is in
// HTML_VIEWS, even though nothing mod-specific is implemented). See
// docs/mod-compat-notes.md.
const UNIVERSAL_HTML_VIEWS = new Set([
  "core",
  "content",
  "title",
  "titled",
  "titled_content",
  "menu",
  "open",
  "closed",
  "blank",
  "unknown",
  "mini_unknown",
  "no_search_results",
]);

// Patterns a card-mod can plausibly register an Abstract set module under.
// (per card-1.110.0 lib/cardio/mod/loader/set_pattern_loader.rb + abstract/.)
const ALLOWED_PATTERN_DIRS = [
  "abstract",
  "all",
  "all_plus",
  "type",
  "star",
  "type_plus_right",
  "right",
  "self",
  "rule",
  "rstar",
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function listGemDirs(gemDir) {
  if (!existsSync(gemDir)) {
    throw new Error(`gem dir not found: ${gemDir}`);
  }
  return readdirSync(gemDir)
    .filter((name) => name.startsWith("card-mod-"))
    .map((name) => ({
      name,
      path: join(gemDir, name),
      version: name.split("-").pop(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function walkFiles(rootDir, suffix) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith(suffix)) out.push(full);
    }
  }
  walk(rootDir);
  return out;
}

function readText(path) {
  return readFileSync(path, "utf8");
}

// strip Ruby comments + strings in a tolerant way for inventory use.
// not a parser — used only to drop noise before regex mining for top-level
// constructs (view :, format :, def , event , include_set, etc.)
function stripRubyNoise(src) {
  // remove line comments (but not inside strings - good enough for our usage).
  return src
    .replace(/^\s*#.*$/gm, "")
    .replace(/\\\n/g, "\n"); // line continuations
}

function grepAllViews(src) {
  // captures the view name in `view :foo` and the alias target in
  // `view :foo, :bar` (comma form).
  const re = /^[ \t]*view[ \t]+:([A-Za-z0-9_?!]+)(?:[ \t]*,[ \t]*:([A-Za-z0-9_?!]+))?/gm;
  const views = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    views.push({ name: m[1], alias: m[2] ?? null });
  }
  return views;
}

function grepFormatBlocks(src) {
  // captures `format :name do` lines. name is :html / :css / :text / etc.
  const re = /^[ \t]*format[ \t]+:([A-Za-z0-9_]+)/gm;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function grepDefs(src) {
  // captures `def name` and `def self.name`.
  const re = /^[ \t]*def[ \t]+(?:self\.)?([A-Za-z0-9_?!=]+)/gm;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function grepEvents(src) {
  // captures `event :name` (Ruby's event-callback DSL in lib/card/event.rb).
  const re = /^[ \t]*event[ \t]+:([A-Za-z0-9_?!]+)/gm;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function grepBefores(src) {
  // captures `before :view_name` hooks.
  const re = /^[ \t]*before[ \t](?:\(|\s+):([A-Za-z0-9_?!]+)/gm;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function grepIncludeSet(src) {
  // captures `include_set Abstract::Foo` etc - set module inclusions.
  const re = /^[ \t]*include_set[ \t]+(?:Abstract::)?([A-Za-z0-9_:]+)/gm;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function grepCardioConfigKeys(src) {
  // captures Cardio::Railtie.config.tap { |c| c.foo = ... } - config keys.
  const re = /config\.([a-z_][a-z0-9_]*)\s*=/gm;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// inventory one gem
// ---------------------------------------------------------------------------

function inventoryGem(gemPath, gemName) {
  const setDir = join(gemPath, "set");
  const libDir = join(gemPath, "lib");
  const dataDir = join(gemPath, "data");

  const rbSetFiles = existsSync(setDir) ? walkFiles(setDir, ".rb") : [];
  const rbLibFiles = existsSync(libDir) ? walkFiles(libDir, ".rb") : [];
  const hamlFiles = [
    ...(existsSync(setDir) ? walkFiles(setDir, ".haml") : []),
    ...(existsSync(libDir) ? walkFiles(libDir, ".haml") : []),
  ];

  const setModulesByPattern = {}; // pattern -> [{ modulePath, moduleName, hasViews }]
  const viewsByFormat = {}; // format (html/css/...) -> view name set
  const aliasPairs = []; // { from, to, file, line }
  const eventHooks = [];
  const beforeHooks = [];
  const defs = new Set();
  const includeSetRefs = new Set();
  const cardioConfigKeys = new Set();

  // mine set/ tree: each top-level subdir of set/ is a pattern name.
  if (existsSync(setDir)) {
    const patternDirs = readdirSync(setDir).filter((n) =>
      ALLOWED_PATTERN_DIRS.includes(n),
    );
    for (const pattern of patternDirs) {
      setModulesByPattern[pattern] = [];
      const patternDir = join(setDir, pattern);
      for (const entry of readdirSync(patternDir)) {
        const full = join(patternDir, entry);
        const st = statSync(full);
        if (st.isFile() && entry.endsWith(".rb")) {
          const modName = entry.slice(0, -3);
          const src = readText(full);
          const cleanSrc = stripRubyNoise(src);
          const views = grepAllViews(cleanSrc);
          // collect format views: which view is declared under which format block.
          // simplest signal: file declares a format :html / :css / etc. block.
          const formats = grepFormatBlocks(cleanSrc);
          for (const fmt of formats) {
            if (!viewsByFormat[fmt]) viewsByFormat[fmt] = new Set();
            for (const v of views) viewsByFormat[fmt].add(v.name);
          }
          for (const v of views) {
            if (v.alias) {
              aliasPairs.push({
                from: v.name,
                to: v.alias,
                file: relative(gemPath, full),
              });
            }
          }
          setModulesByPattern[pattern].push({
            modulePath: relative(gemPath, full).replaceAll(sep, "/"),
            moduleName: modName,
            viewCount: views.length,
          });
          for (const d of grepDefs(cleanSrc)) defs.add(d);
          for (const ev of grepEvents(cleanSrc)) {
            eventHooks.push({ event: ev, file: relative(gemPath, full).replaceAll(sep, "/") });
          }
          for (const b of grepBefores(cleanSrc)) {
            beforeHooks.push({ before: b, file: relative(gemPath, full).replaceAll(sep, "/") });
          }
          for (const inc of grepIncludeSet(cleanSrc)) includeSetRefs.add(inc);
        } else if (st.isDirectory()) {
          // set/<pattern>/<anchor>/  -- anchor submodule (e.g. set/all/bootstrap/)
          // recurse one level; each .rb in here is a sub-module.
          const subFiles = walkFiles(full, ".rb");
          if (subFiles.length > 0) {
            const anchor = entry;
            const moduleFiles = subFiles.map((sf) => {
              const src = readText(sf);
              const cleanSrc = stripRubyNoise(src);
              const views = grepAllViews(cleanSrc);
              const formats = grepFormatBlocks(cleanSrc);
              for (const fmt of formats) {
                if (!viewsByFormat[fmt]) viewsByFormat[fmt] = new Set();
                for (const v of views) viewsByFormat[fmt].add(v.name);
              }
              for (const v of views) {
                if (v.alias) {
                  aliasPairs.push({
                    from: v.name,
                    to: v.alias,
                    file: relative(gemPath, sf).replaceAll(sep, "/"),
                  });
                }
              }
              for (const d of grepDefs(cleanSrc)) defs.add(d);
              for (const ev of grepEvents(cleanSrc)) {
                eventHooks.push({ event: ev, file: relative(gemPath, sf).replaceAll(sep, "/") });
              }
              for (const b of grepBefores(cleanSrc)) {
                beforeHooks.push({ before: b, file: relative(gemPath, sf).replaceAll(sep, "/") });
              }
              for (const inc of grepIncludeSet(cleanSrc)) includeSetRefs.add(inc);
              return {
                modulePath: relative(gemPath, sf).replaceAll(sep, "/"),
                moduleName: basename(sf, ".rb"),
                viewCount: views.length,
              };
            });
            setModulesByPattern[pattern].push({
              modulePath: `set/${pattern}/${anchor}/`,
              moduleName: anchor,
              viewCount: moduleFiles.reduce((a, b) => a + b.viewCount, 0),
              submoduleCount: moduleFiles.length,
            });
          }
        }
      }
    }
  }

  // mine lib/ tree: only the top-level card/mod/<name>.rb and any namespace
  // folders contribute - we don't expand the full bootstrap component tree.
  if (existsSync(libDir)) {
    const libRbFiles = walkFiles(libDir, ".rb");
    for (const full of libRbFiles) {
      const src = readText(full);
      const cleanSrc = stripRubyNoise(src);
      for (const d of grepDefs(cleanSrc)) defs.add(d);
      for (const ev of grepEvents(cleanSrc)) {
        eventHooks.push({ event: ev, file: relative(gemPath, full).replaceAll(sep, "/") });
      }
      for (const inc of grepIncludeSet(cleanSrc)) includeSetRefs.add(inc);
      for (const k of grepCardioConfigKeys(cleanSrc)) cardioConfigKeys.add(k);
    }
  }

  // simplify viewsByFormat sets into sorted arrays.
  const viewsByFormatOut = {};
  for (const [fmt, set] of Object.entries(viewsByFormat)) {
    viewsByFormatOut[fmt] = [...set].sort();
  }

  // simplify setModulesByPattern counts.
  const setModulesSummary = {};
  let setModuleCount = 0;
  for (const [pattern, mods] of Object.entries(setModulesByPattern)) {
    setModuleCount += mods.length;
    setModulesSummary[pattern] = mods.length;
  }

  return {
    gem: gemName,
    gemPath,
    counts: {
      setRbFiles: rbSetFiles.length,
      libRbFiles: rbLibFiles.length,
      hamlFiles: hamlFiles.length,
      setModules: setModuleCount,
      viewsDeclared: Object.values(viewsByFormatOut).reduce(
        (a, b) => a + b.length,
        0,
      ),
      defs: defs.size,
      eventHooks: eventHooks.length,
      beforeHooks: beforeHooks.length,
      includeSetRefs: includeSetRefs.size,
      cardioConfigKeys: cardioConfigKeys.size,
      viewAliases: aliasPairs.length,
    },
    setModulesByPattern: setModulesSummary,
    viewsByFormat: viewsByFormatOut,
    aliasPairs,
    eventHooks,
    beforeHooks,
    includeSetRefs: [...includeSetRefs].sort(),
    cardioConfigKeys: [...cardioConfigKeys].sort(),
  };
}

// ---------------------------------------------------------------------------
// inventory decko-ts (read-only)
// ---------------------------------------------------------------------------

function inventoryDeckoTs() {
  // 1) implemented set patterns — by reading registry.ts PATTERN_TABLE.
  // We read the file once and grep `code: "<pattern>"` entries.
  const registryPath = join(SET_PATTERNS_DIR, "registry.ts");
  const registrySrc = existsSync(registryPath) ? readText(registryPath) : "";
  const patternRe = /code:\s*"([a-z_]+)"/g;
  const implementedPatterns = new Set();
  let m;
  while ((m = patternRe.exec(registrySrc)) !== null) {
    implementedPatterns.add(m[1]);
  }

  // 2) implemented html views — by reading src/card/render/views.ts HTML_VIEWS.
  const viewsPath = join(RENDER_DIR, "views.ts");
  const viewsSrc = existsSync(viewsPath) ? readText(viewsPath) : "";
  const htmlViewsRe = /^\s*([a-z_]+):\s*[a-z]\w*View/gm;
  const htmlViews = new Set();
  while ((m = htmlViewsRe.exec(viewsSrc)) !== null) {
    htmlViews.add(m[1]);
  }

  // also: views re-exported via 'view :name' references inside the file (core,
  // card_list, etc — plus a few mapped names).
  const referencedRe = /renderView\("([a-z_]+)"/g;
  while ((m = referencedRe.exec(viewsSrc)) !== null) {
    htmlViews.add(m[1]);
  }

  // 3) rule machinery presence — read rules/lookup.ts + apply.ts.
  const rulesDir = RULES_DIR;
  let hasRuleLookup = false;
  let hasRuleApply = false;
  if (existsSync(rulesDir)) {
    if (existsSync(join(rulesDir, "lookup.ts"))) hasRuleLookup = true;
    if (existsSync(join(rulesDir, "apply.ts"))) hasRuleApply = true;
  }

  // 4) permissions presence.
  let hasPerms = existsSync(join(PERMS_DIR, "read-rules.ts"))
    && existsSync(join(PERMS_DIR, "view-perms.ts"));

  return {
    implementedPatterns: [...implementedPatterns].sort(),
    htmlViews: [...htmlViews].sort(),
    hasRuleLookup,
    hasRuleApply,
    hasPerms,
  };
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

// Legacy-labeled mods per upstream maintainer guidance (decko-commons#1282
// thread). Determined conservatively: only mods with NO set/ tree (so porting
// them is vacuous - no set modules / no views to port) AND a clearly
// config-only or backend-only lib/ are flagged. Mods with non-trivial set/
// trees are NOT in this set, even if their lib/ is a thin config wrapper,
// because the set/ tree represents unported code that should show up as
// missing/partial in the report. See docs/mod-compat-notes.md for the
// evidence trail and the upstream-thread citations.
const LEGACY_MODS = new Set([
  // delayed_job: backend-only (lib/card/mod/delayed_job.rb + a single
  // integration helper); no set/ at all - explicitly "legacy backend".
  "card-mod-delayed_job-0.20.0",
  // defaults: pure data seeding (17 transform files), no set/, no lib/
  // ruby beyond the mod entry point - data-only, porting it is a data
  // load not a set/view port.
  "card-mod-defaults-0.20.0",
]);

function classify(inv, surface) {
  const gem = inv.gem;

  // Legacy gate first.
  if (LEGACY_MODS.has(gem)) {
    return {
      status: "ignored",
      verdict: "ignored (legacy-labeled per upstream maintainer guidance)",
      evidence: "no meaningful set/ tree; config-only or backend-only gem",
      metrics: {
        htmlViewsDeclared: 0,
        htmlViewsCovered: 0,
        htmlViewsMissing: 0,
        htmlViewsMissingNames: [],
        patternsUsed: [],
        patternsImplemented: [],
        patternsCoverage: 0,
        viewsCoverage: 0,
        setModules: inv.counts.setModules,
        libRbFiles: inv.counts.libRbFiles,
        hamlFiles: inv.counts.hamlFiles,
      },
    };
  }

  // Count implemented set patterns used by this mod.
  const patternsUsed = Object.entries(inv.setModulesByPattern)
    .filter(([pattern, n]) => {
      if (n === 0) return false;
      // 'abstract' isn't a pattern - it's a pseudo-pattern used for
      // include_set targets. Count it as 'all' for coverage purposes.
      if (pattern === "abstract") return true;
      return IMPLEMENTED_PATTERNS.includes(pattern);
    })
    .map(([pattern]) => (pattern === "abstract" ? "all" : pattern));

  const implementedUsed = patternsUsed.filter((p) =>
    surface.implementedPatterns.includes(p),
  );
  const patternsCoverage =
    patternsUsed.length === 0
      ? 0
      : implementedUsed.length / patternsUsed.length;

  // HTML views coverage.
  const htmlViewsDeclared = inv.viewsByFormat["html"] ?? [];
  const htmlViewsCovered = htmlViewsDeclared.filter((v) =>
    surface.htmlViews.includes(v),
  );
  const viewsCoverage =
    htmlViewsDeclared.length === 0
      ? 0
      : htmlViewsCovered.length / htmlViewsDeclared.length;

  // Mod-specific views: declared views that are NOT in the universal
  // baseline (card-mod-format + deck core supply these for every card).
  // A mod's contribution is its NON-universal views - that's what the
  // porting work actually adds.
  const specificViewsDeclared = htmlViewsDeclared.filter(
    (v) => !UNIVERSAL_HTML_VIEWS.has(v),
  );
  const specificViewsCovered = specificViewsDeclared.filter((v) =>
    surface.htmlViews.includes(v),
  );
  const specificViewsCoverage =
    specificViewsDeclared.length === 0
      ? 0
      : specificViewsCovered.length / specificViewsDeclared.length;

  // Evidence line - one line per mod.
  let evidence = "";
  if (htmlViewsDeclared.length > 0) {
    evidence = `${htmlViewsCovered.length}/${htmlViewsDeclared.length} html views in HTML_VIEWS (${specificViewsCovered.length}/${specificViewsDeclared.length} mod-specific)`;
  } else {
    evidence = "no html view declarations in this mod";
  }

  // Modules coverage signal: how many of this mod's set/<pattern>/ files
  // would land on a pattern that's already implemented in decko-ts.
  const totalSetModules = inv.counts.setModules;
  const patternBackedModules = totalSetModules > 0 && patternsUsed.length > 0;

  // Status thresholds (see docs/mod-compat-notes.md for the rubric).
  // ported:    ≥50% of MOD-SPECIFIC html views are in HTML_VIEWS AND ≥50%
  //            of patterns the mod uses are implemented AND the mod has
  //            pattern-backed set modules. The mod-specific check stops
  //            a "view :core only" mod from looking ported just because
  //            the universal :core view is implemented.
  // partial:   some coverage (any html view present, or ≥50% pattern
  //            coverage, or substantial lib/ + permissions), but not
  //            enough for ported.
  // missing:   zero coverage.
  let status = "missing";
  if (totalSetModules === 0 && inv.counts.libRbFiles === 0) {
    // Pure data/transform gem with no set/ and no lib/. Treat as
    // config-only / data-only — port is vacuous.
    status = "ignored";
    evidence = "data/transform-only gem (no set/ tree, no lib/ ruby)";
  } else if (
    specificViewsDeclared.length > 0 &&
    specificViewsCoverage >= 0.5 &&
    patternsCoverage >= 0.5 &&
    patternBackedModules
  ) {
    status = "ported";
  } else if (
    htmlViewsCovered.length > 0 ||
    patternsCoverage >= 0.5 ||
    (inv.counts.libRbFiles > 0 && surface.hasPerms) ||
    (totalSetModules > 0 && patternBackedModules)
  ) {
    status = "partial";
  } else {
    status = "missing";
  }

  // One-line verdict + evidence.
  let verdict = "";
  if (status === "ported") {
    verdict = `${specificViewsCovered.length} mod-specific view(s) ported: ${specificViewsCovered.slice(0, 6).join(", ")}${specificViewsCovered.length > 6 ? ", ..." : ""}`;
  } else if (status === "partial") {
    const specificMissing = specificViewsDeclared.filter(
      (v) => !surface.htmlViews.includes(v),
    );
    const covered = specificViewsCovered.length > 0
      ? specificViewsCovered.slice(0, 4).join(", ")
      : "(no mod-specific views covered)";
    const missing = specificMissing.length > 0
      ? specificMissing.slice(0, 6).join(", ") + (specificMissing.length > 6 ? ", ..." : "")
      : "(no mod-specific views)";
    verdict = `mod-specific: covered=${covered}; missing=${missing}`;
  } else if (status === "missing") {
    verdict = `no html view registered in HTML_VIEWS; ${totalSetModules} set module(s) across ${patternsUsed.length} pattern(s)`;
  } else if (status === "ignored") {
    verdict = evidence;
  }

  return {
    status,
    verdict,
    evidence,
    metrics: {
      htmlViewsDeclared: htmlViewsDeclared.length,
      htmlViewsCovered: htmlViewsCovered.length,
      htmlViewsMissing: htmlViewsDeclared.length - htmlViewsCovered.length,
      htmlViewsMissingNames: htmlViewsDeclared.filter(
        (v) => !surface.htmlViews.includes(v),
      ),
      patternsUsed,
      patternsImplemented: implementedUsed,
      patternsCoverage: Math.round(patternsCoverage * 1000) / 10,
      viewsCoverage: Math.round(viewsCoverage * 1000) / 10,
      setModules: totalSetModules,
      libRbFiles: inv.counts.libRbFiles,
      hamlFiles: inv.counts.hamlFiles,
    },
  };
}

// ---------------------------------------------------------------------------
// report rendering
// ---------------------------------------------------------------------------

function renderMd(report) {
  const lines = [];
  lines.push("# card-mod compatibility report — decko-ts");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Gem dir:   ${report.gemDir}`);
  lines.push(`Repo:      ${report.repo}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`Mods scanned: **${report.mods.length}**`);
  lines.push("");
  const byStatus = { ported: 0, partial: 0, missing: 0, ignored: 0 };
  for (const m of report.mods) byStatus[m.classification.status]++;
  lines.push(
    `- ported:  **${byStatus.ported}**`,
  );
  lines.push(
    `- partial: **${byStatus.partial}**`,
  );
  lines.push(
    `- missing: **${byStatus.missing}**`,
  );
  lines.push(
    `- ignored: **${byStatus.ignored}** (legacy-labeled or data-only)`,
  );
  lines.push("");
  lines.push("## decko-ts implemented surface (truth)");
  lines.push("");
  lines.push(`- Set patterns (${report.surface.implementedPatterns.length}): ${report.surface.implementedPatterns.join(", ")}`);
  lines.push(`- Html views in HTML_VIEWS (${report.surface.htmlViews.length}): ${report.surface.htmlViews.join(", ")}`);
  lines.push(`- Rules: lookup=${report.surface.hasRuleLookup ? "yes" : "no"}, apply=${report.surface.hasRuleApply ? "yes" : "no"}`);
  lines.push(`- Permissions: ${report.surface.hasPerms ? "yes" : "no"} (read-rules.ts, view-perms.ts)`);
  lines.push("");
  lines.push("## Per-mod report");
  lines.push("");
  lines.push("| mod | status | html views | set modules | lib rb | verdict |");
  lines.push("|-----|--------|-----------:|------------:|-------:|---------|");
  for (const m of report.mods) {
    const cls = m.classification;
    lines.push(
      `| \`${m.gem}\` | ${cls.status} | ${cls.metrics.htmlViewsCovered}/${cls.metrics.htmlViewsDeclared} | ${cls.metrics.setModules} (${m.inv.setModulesByPattern ? Object.entries(m.inv.setModulesByPattern).filter(([, n]) => n > 0).map(([p, n]) => `${p}=${n}`).join(", ") : ""}) | ${cls.metrics.libRbFiles} | ${cls.verdict.replace(/\|/g, "\\|").slice(0, 200)} |`,
    );
  }
  lines.push("");
  lines.push("## Per-mod detail");
  lines.push("");
  for (const m of report.mods) {
    const cls = m.classification;
    lines.push(`### ${m.gem}`);
    lines.push("");
    lines.push(`- **status**: \`${cls.status}\``);
    lines.push(`- **verdict**: ${cls.verdict}`);
    lines.push(`- **evidence**: ${cls.evidence}`);
    lines.push(`- **set modules by pattern**: ${Object.entries(m.inv.setModulesByPattern).filter(([, n]) => n > 0).map(([p, n]) => `${p}=${n}`).join(", ") || "(none)"}`);
    lines.push(`- **html views declared**: ${(m.inv.viewsByFormat.html ?? []).length ? m.inv.viewsByFormat.html.join(", ") : "(none)"}`);
    lines.push(`- **non-html views**: ${Object.entries(m.inv.viewsByFormat).filter(([fmt]) => fmt !== "html").flatMap(([fmt, vs]) => vs.map((v) => `${fmt}:${v}`)).join(", ") || "(none)"}`);
    lines.push(`- **view aliases**: ${m.inv.aliasPairs.length ? m.inv.aliasPairs.slice(0, 8).map((a) => `:${a.from} -> :${a.to}`).join(", ") + (m.inv.aliasPairs.length > 8 ? `, ...(${m.inv.aliasPairs.length - 8} more)` : "") : "(none)"}`);
    lines.push(`- **event hooks**: ${m.inv.eventHooks.length} (${m.inv.eventHooks.slice(0, 6).map((e) => `:${e.event}`).join(", ")}${m.inv.eventHooks.length > 6 ? ", ..." : ""})`);
    lines.push(`- **before hooks**: ${m.inv.beforeHooks.length} (${m.inv.beforeHooks.slice(0, 6).map((e) => `:${e.before}`).join(", ")}${m.inv.beforeHooks.length > 6 ? ", ..." : ""})`);
    lines.push(`- **include_set refs**: ${m.inv.includeSetRefs.length ? m.inv.includeSetRefs.join(", ") : "(none)"}`);
    lines.push(`- **Cardio config keys**: ${m.inv.cardioConfigKeys.length ? m.inv.cardioConfigKeys.join(", ") : "(none)"}`);
    lines.push(`- **haml templates**: ${m.inv.counts.hamlFiles}`);
    lines.push(`- **lib ruby files**: ${m.inv.counts.libRbFiles}`);
    lines.push("");
  }
  lines.push("## Method");
  lines.push("");
  lines.push("Per gem, walk `set/**/*.rb` and `lib/**/*.rb`, mine via regex:");
  lines.push("- `view :name` and `view :name, :target` (aliases)");
  lines.push("- `format :name do ... end` (which views live inside which format)");
  lines.push("- `def name` (set-module methods), `event :name` (event hooks), `before :view` (before-hooks), `include_set Abstract::Foo`");
  lines.push("- `Cardio::Railtie.config.tap { |c| c.key = ... }` (config keys)");
  lines.push("");
  lines.push("Compare against decko-ts `src/card/set-patterns/registry.ts` PATTERN_TABLE");
  lines.push("(which set patterns are registered) and `src/card/render/views.ts` HTML_VIEWS");
  lines.push("(which html views are implemented). Status thresholds:");
  lines.push("- **ported**: ≥50% of declared html views are in HTML_VIEWS AND ≥50% of patterns the mod uses are implemented AND the mod has pattern-backed set modules.");
  lines.push("- **partial**: some coverage (any html view present, or ≥50% pattern coverage, or lib/ + permissions), but not enough for ported.");
  lines.push("- **missing**: zero coverage.");
  lines.push("- **ignored**: legacy-labeled per upstream (decko-commons#1282 thread) or data/transform-only with no set/ tree.");
  lines.push("");
  lines.push("See `docs/mod-compat-notes.md` for caveats, false positives, and the");
  lines.push("boundary cases that move a mod between categories.");
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = new Set(process.argv.slice(2));
  const wantMd = !args.has("--json-only");
  const wantJson = !args.has("--md-only");

  const gems = listGemDirs(GEM_DIR);
  const surface = inventoryDeckoTs();
  const mods = gems.map((g) => {
    const inv = inventoryGem(g.path, g.name);
    const cls = classify(inv, surface);
    return { gem: g.name, version: g.version, classification: cls, inv };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    gemDir: GEM_DIR,
    repo: REPO,
    surface: {
      implementedPatterns: surface.implementedPatterns,
      htmlViews: surface.htmlViews,
      hasRuleLookup: surface.hasRuleLookup,
      hasRuleApply: surface.hasRuleApply,
      hasPerms: surface.hasPerms,
    },
    legacy: [...LEGACY_MODS],
    mods,
  };

  if (wantJson) {
    writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
    process.stderr.write(`wrote ${OUTPUT_JSON}\n`);
  }
  if (wantMd) {
    writeFileSync(OUTPUT_MD, renderMd(report));
    process.stderr.write(`wrote ${OUTPUT_MD}\n`);
  }
}

main();
