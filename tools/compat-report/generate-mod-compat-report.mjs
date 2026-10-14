// generate-mod-compat-report.mjs — per-mod compatibility report for decko-ts.
//
// For every installed card-mod-* gem under GEM_DIR, inventory what it defines
// (set patterns, set modules, html views, rules - parsing set/*.rb, lib/**/*.rb,
// set/**/*.haml), then compare against the decko-ts implemented surface
// (src/card/set-patterns/, src/card/render/ - read-only inspection of source).
// Classify each mod as declared-complete / partial / missing with one line of
// evidence per verdict. Legacy-labeled mods are flagged 'ignored'.
//
// "declared-complete" measures DECLARATIONS ONLY: that a manifest registers the
// mod's views and a test file pins some of their bytes, or that the mod's
// declared html view names and set patterns exist in the implemented surface.
// It does NOT measure executable behavior: it says nothing about whether an
// event hook fires, whether a non-html format (json, css, email, rss, csv)
// renders, or whether any renderer beyond the handful of byte-pinned views
// matches Ruby's output. See docs/decisions/0004-mods-compiled-into-the-view-registry.md.
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
// The Ruby gem home is machine-local; it comes from the environment (the
// standard GEM_HOME, whose gems/ subfolder holds the installed gems) and the
// generated report records only the $GEM_HOME reference, never the absolute
// path of the machine that produced it.
const GEM_DIR = process.env.GEM_HOME ? join(process.env.GEM_HOME, "gems") : undefined;
if (!GEM_DIR || !existsSync(GEM_DIR)) {
  console.error(
    "generate-mod-compat-report: set GEM_HOME to the Ruby gem home " +
      "(e.g. <ruby>/lib/ruby/gems/3.3.0 -- the installed gems live under its " +
      "gems/ subfolder) and re-run",
  );
  process.exit(2);
}
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
// signal would over-report declared-complete status (a mod that just calls
// `view :core do ...end` would appear "declared-complete" because :core is
// in HTML_VIEWS, even though nothing mod-specific is declared). See
// docs/decisions/0004-mods-compiled-into-the-view-registry.md.
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
  // captures the view name in `view :foo` AND `view(:foo, ...) { ... }`
  // (single-line parens form, common in card-mod-bar_and_box bar.rb:26-28),
  // plus the alias target in `view :foo, :bar` (comma form) and the
  // parenthesized alias form `view(:foo, :bar)`.
  const re = /^[ \t]*view[ \t]*\(?[ \t]*:([A-Za-z0-9_?!]+)(?:[ \t]*,[ \t]*:([A-Za-z0-9_?!]+))?/gm;
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
    // relative to the gems root: the report must stay portable across
    // machines (the absolute root is machine-local)
    gemPath: gemName,
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
    // Event-hook and before-hook NAMES are counted, not listed. This report
    // measures views and set patterns; whether a hook fires is explicitly not
    // measured (see the Method section), so an inventory of hook names would
    // be a claim about a mod's executable surface that nothing here verifies —
    // and a hook name is a precise statement about what the upstream gem does,
    // which is not this report's to publish. The counts stay: they measure how
    // much of a gem's structure is set modules and views rather than hooks.
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
  const htmlViews = new Set();
  const htmlViewsRe = /^\s*([a-z_]+):\s*[a-z]\w*View/gm;
  while ((m = htmlViewsRe.exec(viewsSrc)) !== null) {
    htmlViews.add(m[1]);
  }

  // also: views re-exported via 'view :name' references inside the file (core,
  // card_list, etc — plus a few mapped names).
  const referencedRe = /renderView\("([a-z_]+)"/g;
  while ((m = referencedRe.exec(viewsSrc)) !== null) {
    htmlViews.add(m[1]);
  }

  // 2b) MOD-LOADER REGISTRATIONS — every registered mod's manifest exports
  // additional views through manifest.views[]; the rendered surface the
  // engine consults at request time is HTML_VIEWS + the mod-loader
  // view-chains table (src/card/mod-loader.ts#viewsTable). Without unioning
  // the manifest views, the HTML_VIEWS-only check under-reports covered
  // views — the report's "mod-specific covered/total" column says 0 for
  // every mod that registers its views only through the manifest.
  const modsDir = join(REPO, "src", "card", "mod-loader", "mods");
  const manifestViewRe = /\{\s*view:\s*"([a-z_]+)"/g;
  if (existsSync(modsDir)) {
    for (const modFile of readdirSync(modsDir)) {
      if (!modFile.endsWith(".ts")) continue;
      const src = readText(join(modsDir, modFile));
      while ((m = manifestViewRe.exec(src)) !== null) {
        htmlViews.add(m[1]);
      }
    }
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
// per-mod manifest + test pin inventory (byte-pin verification)
// ---------------------------------------------------------------------------

// For each mod: scan the mod's manifest (mod-loader/mods/*.ts) for the
// view registrations it contributes, and the mod's test file
// (tests/card/mod-loader/*.test.ts) for the A/B pin tests that prove each
// rendered view matches the Ruby oracle bytes. A mod is declared-complete
// in the classifier's sense when the manifest exists AND the test file has
// byte-pinning assertions (toBe(<literal-string>) per the existing pin style
// in tests/card/mod-loader/card-mod-format.test.ts). That is still a
// declaration-level signal: the pins cover the views they render, not every
// view the manifest registers.
function inventoryModPins(gemName) {
  // gemName is e.g. "card-mod-format-0.20.0"; mod id is "card-mod-format".
  const modId = gemName.replace(/-0\.\d+\.\d+$/, "");
  const manifestPath = join(REPO, "src", "card", "mod-loader", "mods", modId + ".ts");
  const testPath = join(REPO, "tests", "card", "mod-loader", modId + ".test.ts");

  let manifestExists = false;
  let manifestViews = [];
  if (existsSync(manifestPath)) {
    manifestExists = true;
    const src = readText(manifestPath);
    const re = /\{\s*view:\s*"([a-z_]+)"/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(src)) !== null) {
      if (! seen.has(m[1])) {
        seen.add(m[1]);
        manifestViews.push(m[1]);
      }
    }
  }

  let testExists = false;
  let testCount = 0;
  let bytePins = 0;
  if (existsSync(testPath)) {
    testExists = true;
    const src = readText(testPath);
    testCount = (src.match(/^\s*it\(/gm) || []).length;
    const pinMatches = src.match(/expect\([^)]+\)\.toBe\([^)]+\)/g) || [];
    for (const p of pinMatches) {
      // Pin shape: expect(<var>).toBe('literal-string') — the single-quoted
      // / double-quoted / backtick form. Numeric-only literals (toBe(5)) do
      // not count as byte pins.
      if (/toBe\(\s*['"`]/.test(p)) bytePins++;
    }
  }

  return {
    manifestExists,
    manifestViews,
    testExists,
    testCount,
    bytePins,
  };
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

// Mods with no set/ tree and a config-only or backend-only lib/: there is
// nothing for this engine to port, so they are not evaluated here at all.
// The label says exactly that.
//
// It does NOT say "legacy". An earlier version of this file labelled these
// "ignored (legacy-labeled per upstream maintainer guidance)" and cited
// docs/decisions/0004-mods-compiled-into-the-view-registry.md as the
// evidence trail. That record carries no such guidance and no
// upstream-thread citation for it - the only thing it establishes is that
// this repository contains hand-ports of the site's own mods, which is a
// different claim. So the label claimed a receipt that does not exist.
// Anyone who wants these evaluated needs a ported surface to evaluate; the
// honest report row is "unported (not evaluated)".
const LEGACY_MODS = new Set([
  // delayed_job: backend-only (lib/card/mod/delayed_job.rb + a single
  // integration helper); no set/ at all.
  "card-mod-delayed_job-0.20.0",
  // defaults: pure data seeding (17 transform files), no set/, no lib/
  // ruby beyond the mod entry point - data-only.
  "card-mod-defaults-0.20.0",
]);

function classify(inv, surface, pins) {
  const gem = inv.gem;

  // Legacy gate first.
  if (LEGACY_MODS.has(gem)) {
    return {
      status: "ignored",
      verdict: "unported (not evaluated)",
      evidence: "no meaningful set/ tree; config-only or backend-only gem",
    metrics: {
      htmlViewsDeclared: 0,
      htmlViewsCovered: 0,
      htmlViewsMissing: 0,
      htmlViewsMissingNames: [],
      specificViewsDeclared: 0,
      specificViewsCovered: 0,
      specificViewsCoverage: 0,
      patternsUsed: [],
      patternsImplemented: [],
      patternsCoverage: 0,
      viewsCoverage: 0,
      setModules: inv.counts.setModules,
      libRbFiles: inv.counts.libRbFiles,
      hamlFiles: inv.counts.hamlFiles,
      manifestExists: pins.manifestExists,
      manifestViewsDeclared: pins.manifestViews.length,
      testExists: pins.testExists,
      testCount: pins.testCount,
      bytePins: pins.bytePins,
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

  // HTML views coverage. surface.htmlViews is the union of HTML_VIEWS and
  // every registered mod's manifest.views[] (added by inventoryDeckoTs).
  const htmlViewsDeclared = inv.viewsByFormat["html"] ?? [];
  const htmlViewsCovered = htmlViewsDeclared.filter((v) =>
    surface.htmlViews.includes(v),
  );
  const viewsCoverage =
    htmlViewsDeclared.length === 0
      ? 0
      : htmlViewsCovered.length / htmlViewsDeclared.length;

  // Mod-specific views: declared views that are NOT in the universal
  // baseline (card-mod-format + deck core supply these for every card)
  // AND are NOT aliases (view :foo, :bar adds zero new rendering - just
  // a rename). A mod's contribution is its real new views - that's what
  // the porting work actually adds.
  const aliasFromSet = new Set(inv.aliasPairs.map((a) => a.from));
  const specificViewsDeclared = htmlViewsDeclared.filter(
    (v) => !UNIVERSAL_HTML_VIEWS.has(v) && !aliasFromSet.has(v),
  );
  // Aliases count as covered when their target is covered (the mod's
  // rename of an implemented view is also "implemented").
  const specificViewsCovered = specificViewsDeclared.filter((v) => {
    if (surface.htmlViews.includes(v)) return true;
    const alias = inv.aliasPairs.find((a) => a.from === v);
    if (alias && surface.htmlViews.includes(alias.to)) return true;
    return false;
  });
  const specificViewsCoverage =
    specificViewsDeclared.length === 0
      ? 0
      : specificViewsCovered.length / specificViewsDeclared.length;

  // Modules coverage signal: how many of this mod's set/<pattern>/ files
  // would land on a pattern that's already implemented in decko-ts.
  const totalSetModules = inv.counts.setModules;
  const patternBackedModules = totalSetModules > 0 && patternsUsed.length > 0;

  // Byte-pin evidence from the per-mod test file: the A/B pattern
  // (tests/card/mod-loader/card-mod-XYZ.test.ts) pins the rendered bytes
  // against the Ruby oracle capture. >=5 byte-pins per mod is the threshold
  // for calling a mod "declared-complete" on the byte-pin criterion — below
  // that, the manifest may exist but the views are not yet byte-pinned.
  const hasManifest = pins.manifestExists;
  const hasTest = pins.testExists;
  const bytePins = pins.bytePins;
  const bytePinComplete = hasManifest && hasTest && bytePins >= 5;

  // Evidence line - one line per mod.
  let evidence = "";
  if (htmlViewsDeclared.length > 0) {
    evidence = `${htmlViewsCovered.length}/${htmlViewsDeclared.length} html views in HTML_VIEWS∪mod-manifests (${specificViewsCovered.length}/${specificViewsDeclared.length} mod-specific)`;
  } else {
    evidence = "no html view declarations in this mod";
  }
  // Append the byte-pin evidence so the report's per-mod detail surfaces
  // the "manifest + bytePins" tally.
  if (hasManifest || hasTest) {
    evidence += `; mod-loader pins: manifest=${hasManifest ? "yes" : "no"}, test=${pins.testCount} it(), byte-pins=${bytePins}`;
  }

  // Status thresholds (see docs/decisions/0004-mods-compiled-into-the-view-registry.md for the rubric).
  // declared-complete:
  //            either (a) >=50% of MOD-SPECIFIC html view NAMES declared by the
  //            mod exist in the implemented surface AND >=50% of the patterns
  //            it uses are implemented AND pattern-backed set modules exist
  //            (the name+pattern rubric); OR (b) the mod has a registered
  //            manifest + a byte-pinned test file with >=5 toBe(<literal>)
  //            pins (the byte-pin criterion). Both measure
  //            declarations: a name present in the view table, a manifest
  //            present in the loader, pins for the views they render. None of
  //            it measures executable behavior, event hooks, or non-html
  //            formats.
  // partial:   some declarations (any html view name present, or >=50% pattern
  //            coverage, or substantial lib/ + permissions, or a partial
  //            pin file), but not enough for declared-complete.
  // missing:   zero coverage.
  let status = "missing";
  if (totalSetModules === 0 && inv.counts.libRbFiles === 0 && !hasManifest) {
    // Pure data/transform gem with no set/ and no lib/. Treat as
    // config-only / data-only — declaration is vacuous.
    status = "ignored";
    evidence = "data/transform-only gem (no set/ tree, no lib/ ruby)";
  } else if (
    (specificViewsDeclared.length > 0 &&
      specificViewsCoverage >= 0.5 &&
      patternsCoverage >= 0.5 &&
      patternBackedModules) ||
    bytePinComplete
  ) {
    status = "declared-complete";
  } else if (
    htmlViewsCovered.length > 0 ||
    patternsCoverage >= 0.5 ||
    (inv.counts.libRbFiles > 0 && surface.hasPerms) ||
    (totalSetModules > 0 && patternBackedModules) ||
    (hasManifest && hasTest && bytePins > 0)
  ) {
    status = "partial";
  } else {
    status = "missing";
  }

  // One-line verdict + evidence.
  let verdict = "";
  if (status === "declared-complete") {
    // The label is a threshold, not a statement that every view is present.
    // A mod can hold it with view names still missing, so say so here rather
    // than leaving a reader to subtract covered from total to find out.
    const missingNames = specificViewsDeclared.filter((v) => !specificViewsCovered.includes(v));
    const incomplete =
      missingNames.length > 0
        ? ` — ${missingNames.length} declared view name(s) NOT in the implemented surface: ${missingNames.slice(0, 8).join(", ")}${missingNames.length > 8 ? ", ..." : ""}`
        : specificViewsDeclared.length === 0
          ? " — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone"
          : "";
    if (bytePinComplete && specificViewsCovered.length === 0) {
      // Honored via the byte-pin criterion alone.
      verdict = `manifest + byte-pinned test (${bytePins} pins across ${pins.testCount} it()): ${pins.manifestViews.slice(0, 6).join(", ")}${pins.manifestViews.length > 6 ? ", ..." : ""}${incomplete}`;
    } else {
      verdict = `${specificViewsCovered.length} mod-specific view(s) declared: ${specificViewsCovered.slice(0, 6).join(", ")}${specificViewsCovered.length > 6 ? ", ..." : ""}${incomplete}`;
    }
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
    const pinSuffix = bytePins > 0 ? `; pins=${bytePins}/${pins.testCount}` : "";
    verdict = `mod-specific: covered=${covered}; missing=${missing}${pinSuffix}`;
  } else if (status === "missing") {
    verdict = `no html view registered in HTML_VIEWS∪mod-manifests; ${totalSetModules} set module(s) across ${patternsUsed.length} pattern(s)`;
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
      specificViewsDeclared: specificViewsDeclared.length,
      specificViewsCovered: specificViewsCovered.length,
      specificViewsCoverage: Math.round(specificViewsCoverage * 1000) / 10,
      patternsUsed,
      patternsImplemented: implementedUsed,
      patternsCoverage: Math.round(patternsCoverage * 1000) / 10,
      viewsCoverage: Math.round(viewsCoverage * 1000) / 10,
      setModules: totalSetModules,
      libRbFiles: inv.counts.libRbFiles,
      hamlFiles: inv.counts.hamlFiles,
      manifestExists: hasManifest,
      manifestViewsDeclared: pins.manifestViews.length,
      testExists: hasTest,
      testCount: pins.testCount,
      bytePins,
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
  const byStatus = { "declared-complete": 0, partial: 0, missing: 0, ignored: 0 };
  for (const m of report.mods) byStatus[m.classification.status]++;
  lines.push(
    `- declared-complete:  **${byStatus["declared-complete"]}**`,
  );
  lines.push(
    `- partial: **${byStatus.partial}**`,
  );
  lines.push(
    `- missing: **${byStatus.missing}**`,
  );
  lines.push(
    `- ignored: **${byStatus.ignored}** (not ported, so not evaluated)`,
  );
  lines.push("");
  lines.push(
    "**What these labels measure: declarations only.** \"declared-complete\" is a THRESHOLD, not a statement that every view is present. The generator calls a mod declared-complete when EITHER (a) at least 50% of the mod-specific html view names it declares exist in the implemented surface, AND at least 50% of the set patterns it uses are implemented, AND it has pattern-backed set modules; OR (b) it has a registered manifest plus a byte-pinned test file with 5 or more `toBe(<literal>)` pins. A mod can therefore hold the label with view names still missing — read the `covered/total` column per mod to see which. It does NOT measure executable behavior: no event hook is exercised, no non-html format (json, css, email, rss, csv) is rendered, and every view beyond the handful the byte-pins render is unproven against Ruby's output. The threshold is decision 0004's rubric, unchanged; where a figure from this report is quoted, the covered/total it rests on is quoted with it. Where the evidence for what IS byte-proven lives: `docs/coverage-inventory.md`.",
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
  lines.push("| mod | status | mod-specific views | manifest views | set modules | lib rb | test it() / byte-pins | verdict |");
  lines.push("|-----|--------|-------------------:|---------------:|------------:|-------:|----------------------:|---------|");
  for (const m of report.mods) {
    const cls = m.classification;
    const modSpec = `${cls.metrics.specificViewsCovered ?? 0}/${cls.metrics.specificViewsDeclared ?? 0}`;
    const manifestSpec = `${m.pins.manifestViews.length} (covered=${m.pins.manifestViews.filter((v) => report.surface.htmlViews.includes(v)).length})`;
    const setModSummary = Object.entries(m.inv.setModulesByPattern || {})
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `${p}=${n}`)
      .join(", ");
    const pinsSummary = `${m.pins.testCount}/${m.pins.bytePins}`;
    lines.push(
      `| \`${m.gem}\` | ${cls.status} | ${modSpec} | ${manifestSpec} | ${cls.metrics.setModules} (${setModSummary}) | ${cls.metrics.libRbFiles} | ${pinsSummary} | ${cls.verdict.replace(/\|/g, "\\|").slice(0, 200)} |`,
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
    lines.push(`- **mod-loader manifest**: ${m.pins.manifestExists ? `yes (${m.pins.manifestViews.length} views registered)` : "no"}`);
    lines.push(`- **byte-pinned test**: ${m.pins.testExists ? `yes (${m.pins.testCount} it() blocks, ${m.pins.bytePins} toBe(<literal>) pins)` : "no"}`);
    lines.push(`- **set modules by pattern**: ${Object.entries(m.inv.setModulesByPattern).filter(([, n]) => n > 0).map(([p, n]) => `${p}=${n}`).join(", ") || "(none)"}`);
    lines.push(`- **mod-specific html views (covered/total)**: ${cls.metrics.specificViewsCovered}/${cls.metrics.specificViewsDeclared} (${(m.inv.viewsByFormat.html ?? []).filter((v) => !["core","content","title","titled","titled_content","menu","open","closed","blank","unknown","mini_unknown","no_search_results"].includes(v)).join(", ") || "(none)"})`);
    lines.push(`- **all html views declared**: ${(m.inv.viewsByFormat.html ?? []).length ? m.inv.viewsByFormat.html.join(", ") : "(none)"}`);
    lines.push(`- **non-html views**: ${Object.entries(m.inv.viewsByFormat).filter(([fmt]) => fmt !== "html").flatMap(([fmt, vs]) => vs.map((v) => `${fmt}:${v}`)).join(", ") || "(none)"}`);
    lines.push(`- **view aliases**: ${m.inv.aliasPairs.length ? m.inv.aliasPairs.slice(0, 8).map((a) => `:${a.from} -> :${a.to}`).join(", ") + (m.inv.aliasPairs.length > 8 ? `, ...(${m.inv.aliasPairs.length - 8} more)` : "") : "(none)"}`);
    lines.push(`- **event hooks**: ${m.inv.counts.eventHooks} (counted, not listed: this report does not measure whether a hook fires)`);
    lines.push(`- **before hooks**: ${m.inv.counts.beforeHooks} (counted, not listed, for the same reason)`);
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
  lines.push("- `def name` (set-module methods), `event :name` and `before :view` (counted only; the names are not emitted), `include_set Abstract::Foo`");
  lines.push("- `Cardio::Railtie.config.tap { |c| c.key = ... }` (config keys)");
  lines.push("");
  lines.push("Compare against decko-ts `src/card/set-patterns/registry.ts` PATTERN_TABLE");
  lines.push("(which set patterns are registered) and `src/card/render/views.ts` HTML_VIEWS");
  lines.push("UNIONED with every registered mod's manifest views under");
  lines.push("`src/card/mod-loader/mods/*.ts` (the engine resolves both —");
  lines.push("HTML_VIEWS is the seed table, the mod loader's `viewsTable` is the");
  lines.push("post-load live table). Status thresholds — all declaration-level:");
  lines.push("- **declared-complete**: either (a) >=50% of the MOD-SPECIFIC html view NAMES the mod declares exist in the implemented surface AND >=50% of the patterns the mod uses are implemented AND the mod has pattern-backed set modules; OR (b) the mod has a registered manifest under `src/card/mod-loader/mods/` AND a byte-pinned test under `tests/card/mod-loader/` with >=5 `toBe(<literal>)` assertions (the byte-pin criterion). Neither branch renders the mod end to end: (a) compares names, (b) pins the bytes of the views its tests render only.");
  lines.push("- **partial**: some declarations (any html view name present, or >=50% pattern coverage, or lib/ + permissions, or a manifest + partial pin file), but not enough for declared-complete.");
  lines.push("- **missing**: zero coverage.");
  lines.push("- **ignored**: not ported, and therefore not evaluated here - data/transform-only or backend-only gems with no set/ tree, so there is no set module or view to compare against the implemented surface.");
  lines.push("");
  lines.push("NOT measured by any label above: whether event hooks fire (they are");
  lines.push("counted, never listed), whether");
  lines.push("non-html formats (json, css, email, rss, csv) render, and whether any");
  lines.push("renderer beyond the byte-pinned views matches Ruby's bytes. See");
  lines.push("`docs/coverage-inventory.md` for where byte-level evidence actually");
  lines.push("exists, and `docs/decisions/0004-mods-compiled-into-the-view-registry.md`");
  lines.push("for caveats, false positives, and the boundary cases that move a mod");
  lines.push("between categories.");
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
    const pins = inventoryModPins(g.name);
    const cls = classify(inv, surface, pins);
    return { gem: g.name, version: g.version, classification: cls, inv, pins };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    gemDir: "$GEM_HOME",
    // portable placeholder, per the header comment: the report must stay
    // portable across machines, so it records no absolute checkout path.
    repo: "REPO_ROOT",
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
