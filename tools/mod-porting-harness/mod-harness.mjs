// mod-harness.mjs — the mod porting harness (decko-mod-porting-harness lane,
// 2026-10-02). Makes porting a Ruby Decko mod to TypeScript (or any language)
// trivial by validating the mod's FULL BEHAVIOR SET, per the operator ruling:
// "decko IS the mods... make porting a mod to any language trivial by
// validating its full behavior set. Give them the tool to port their mod and
// we port all the mods we know about."
//
// Three commands' worth of leverage per mod:
//   node tools/mod-porting-harness/mod-harness.mjs surface  <mod>
//       Enumerate the mod's FULL behavior set from the Ruby gem source
//       (cardtypes/views incl. loop-declared views, events, settings, seeds,
//       configs, basket ops). Output: reports/<mod>/surface.json (machine)
//       + surface.md (plain-English "what this mod does").
//   node tools/mod-porting-harness/mod-harness.mjs capture  <mod>
//       Produce the Ruby ORACLE for each behavior. Strategies, in order:
//       existing-capture (fixtures/oracle-surfaces/<mod>.jsonl, referenced
//       with sha256 provenance), static-ruby (scripts under ruby-oracles/
//       <mod>/ run under the real interpreter, gem source extracted
//       verbatim), live-deck (booted scratch deck — NOT exercised by the
//       skeleton lane; reported honestly as uncaptured). Output:
//       fixtures/oracle-surfaces/<mod>.harness.jsonl, one JSONL oracle per
//       line, every line carrying provenance.
//   node tools/mod-porting-harness/mod-harness.mjs verify   <mod>
//       Run the TS implementation against every oracle: registration checks
//       (is the behavior present in the TS mod manifest / repo?) + probe run
//       (enumerated vitest on the mod's harness probe test file, which pins
//       the oracle bytes/state). Output: reports/<mod>/scorecard.json +
//       scorecard.md (behaviors validated / total, per-behavior RED/GREEN).
//       RED is the harness working on an unported behavior, not a failure of
//       the tool.
//   node tools/mod-porting-harness/mod-harness.mjs registry
//       The PUBLIC MOD REGISTRY: every public mod from the installed gems
//       (+ the core mod + TS-only mods), marked ported / unported /
//       private-unknown, with the harness scorecard column. Output:
//       public-mod-registry.json + public-mod-registry.md.
//
// Zero npm deps (the tools/compat-report convention). Ruby side is
// READ-ONLY against the installed gems; static-ruby scripts run under
// C:/Ruby33-x64/bin/ruby.exe with scratch state only under <repo>/tmp/
// (never another deck, never a network, never a production site).

import { spawnSync } from "node:child_process";
import {
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(HERE)); // tools/mod-porting-harness -> repo root
const GEM_DIR = "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems";
const RUBY = "C:/Ruby33-x64/bin/ruby.exe";
const MOD_LOADER_MODS = join(REPO, "src", "card", "mod-loader", "mods");
const TESTS_DIR = join(REPO, "tests", "card", "mod-loader");
const ORACLE_DIR = join(REPO, "fixtures", "oracle-surfaces");
const REPORTS_DIR = join(HERE, "reports");
const SCRATCH_DIR = join(REPO, "tmp", "mod-harness");
const RUBY_ORACLES = join(HERE, "ruby-oracles");
const REGISTRY_JSON = join(HERE, "public-mod-registry.json");
const REGISTRY_MD = join(HERE, "public-mod-registry.md");
const COMPAT_JSON = join(REPO, "tools", "compat-report", "mod-compat-report.json");

// Re-measurement 2026-10-03 (tree 0287dab) — the mod-coverage-remeasure
// lane's authoritative view census, cited (not recomputed) for the registry.
// Source: brandonDojoTech/tmp/wrong-goal-hunt/mod-coverage-remeasure-lane.md
// + deliverables/mod-coverage-authoritative-2026-09-28.md (re-measure section).
const REMEASURE = {
  tree: "0287dab",
  date: "2026-10-03",
  declaredViews: 377,
  bytePinned: 174,
  renderAtAll: 354,
  missingViews: 23,
  modsZeroMissing: "28 of 34",
  missingByMod: {
    "card-mod-account": 6,
    "card-mod-follow": 4,
    "card-mod-format": 2,
    "card-mod-history": 1,
    "card-mod-style": 4,
    "card-mod-tinymce_editor": 6,
  },
};

// NAMED REMAINDERS (mod-porting wave-1 lane, 2026-10-03) - harness surface
// behaviors that are NOT ports owed and NOT oversights: each carries its
// named, evidenced reason (the wave's end condition: "the uncaptured set is
// empty or every remainder is named"). A red-unported registration whose
// behaviorId appears here scores "named-remainder" (never counted RED,
// never counted validated).
const NAMED_REMAINDERS = {
  "card-mod-history": {
    // export.rb:14-16 view :actions - a JSON-FORMAT view. The hash shapes
    // ARE ported + suite-pinned (actionHashList/actHash/actionHash/
    // changesHash, export.rb:18-47); the engine has no non-html render
    // route for manifest-registered json views (the same class
    // card-mod-list's csv/js/data/json surfaces are named remainders for).
    "view:actions":
      "json-format view; the export.rb hash shapes are ported + suite-pinned, the engine's non-html render route is the named remainder (same class as card-mod-list's csv/js/data/json)",
    // data/test.yml seed cards - the gem's OWN test-suite fixtures
    // (`decko seed` TEST data consumed by the gem's specs), not deck data.
    "seed:First":
      "data/test.yml is the gem's own test-suite fixture data (decko seed TEST data for the gem's specs), not deck data; no TS seed consumer exists or is needed for a running deck",
  },
  "card-mod-style": {
    // CLASS remainders (the same engine-route classes format's table
    // carries): the css/scss FORMAT views (the engine has no css/scss
    // format dispatch; compiled/compressed additionally need the SassC
    // engine - the mod header's documented remainder), the runtime-basket
    // ops, and the yml seed.
    "<view:(import|compiled|compressed|concat)>":
      "a css/scss FORMAT view (the engine has no css/scss format dispatch; compiled/compressed additionally need the SassC engine - the mod header's documented remainder), not a census-gap view",
    "<basket:.*>":
      "a basket registration (non_createable_types folder groups) with no TS consumer seam yet - the runtime-basket seam is the named remainder",
    "<seed:.*>":
      "a data/yml seed card (the gem's fixture data), not deck data; no TS seed consumer exists or is needed for a running deck",
  },
  "card-mod-format": {
    // set/all/html/error.rb:4-8 view :debug_server_error - the BetterErrors
    // dev-tool page (BetterErrors::ErrorPage.new Card::Error.current, ...).
    // The better_errors gem is NOT in the frozen gem set (the gems dir has
    // no better_errors entry) - in the installed-gems environment the view
    // RAISES NameError; its byte behavior is defined by an external dev
    // gem's page renderer that no installed gem carries.
    "view:debug_server_error":
      "the BetterErrors dev-tool error page (error.rb:4-8); the better_errors gem is NOT in the frozen gem set, so the view raises NameError in the installed-gems environment - its behavior belongs to an external dev dependency, not the deck's public surface",
    // CLASS remainders (matched by regex below): the non-html format
    // blocks (data/json/csv/rss/text/yaml/js/jsonld - the manifest
    // header's documented format-specific class; the engine renders the
    // html format only), their validate events, the basket ops and the
    // yml seed - every one the SAME engine-route class, none in the
    // census's 23-view html gap.
    // CLASS: the non-html format blocks (data/json/csv/rss - the manifest
    // header's documented format-specific class; the engine renders the
    // html format only) and their validate events, the two basket ops and
    // the yml seed - one engine-route class, none in the census's 23-view
    // html gap. Keys wrapped in <...> are regex classes matched against
    // the behaviorId (namedRemainderFor below).
    "<view:(import|body|row|pod|nucleus|atom|molecule|ancestors|cast|items|links|test|format_unsupported|style|source|status|page|remote|method|feed|feed_body|feed_title|feed_item|feed_item_description|feed_description)>":
      "a NON-HTML format-block view (the data/json/csv/rss format classes the surface mines; the manifest header's documented format-specific class - the engine renders the html format only), not a census-gap view",
    "<event:(validate_json|validate_number)>":
      "a non-html format's validate event (the json/number write-path validation the engine's write route does not reach yet - the same non-html render/write route class)",
    "<basket:.*>":
      "a basket registration (head_views / cache_seed_names) with no TS consumer seam yet - the runtime-basket seam is the named remainder",
    "<seed:.*>":
      "a data/yml seed card (the gem's fixture data), not deck data; no TS seed consumer exists or is needed for a running deck",
  },
  "card-mod-follow": {
    // CLASS remainders: the notification WRITE-PATH events (the notify
    // stream: Card::Director integrate phases, ActiveJob's
    // integrate_with_delay, ActionMailer.deliver, the FollowerStash write)
    // and the yml seed cards (data/real.yml's setting surfaces + the
    // follower notification email template, or data/test*.yml TEST-suite
    // fixtures). The mod header's documented remainder; no census-gap
    // view is in either class.
    "<event:.*>":
      "a write-path event (the notify stream: Card::Director integrate phases, ActiveJob, ActionMailer.deliver, the follower_stash write) - the headless render engine has no save path; the mod header's documented remainder, not a census-gap view",
    "<seed:.*>":
      "a data/yml seed card (data/real.yml setting surfaces + the follower notification email template, or data/test*.yml TEST-suite fixtures), not deck data to port; no TS seed consumer exists or is needed for a running deck",
  },
};

/** Exact key first, then <regex> class keys. */
function namedRemainderFor(modId, behaviorId) {
  const table = NAMED_REMAINDERS[modId];
  if (table === undefined) return undefined;
  if (Object.hasOwn(table, behaviorId)) return table[behaviorId];
  for (const [key, reason] of Object.entries(table)) {
    if (key.startsWith("<") && key.endsWith(">")) {
      if (new RegExp(`^${key.slice(1, -1)}$`).test(behaviorId)) return reason;
    }
  }
  return undefined;
}

// WAVE-1 PORTING STATE (the 10-03 ruling's first porting wave) - the
// census-missing views BY NAME and their current disposition. A view moves
// here when it is ported + harness-verified GREEN on this lane; the row
// cites the lane branch. Views not listed stay uncaptured by name until
// this wave lands them or names them.
const WAVE1 = {
  branch: "lane-mod-porting-wave1-2026-10-03",
  portedViews: {
    "card-mod-history": [
      {
        view: "board_act",
        source: "set/all/history_board.rb:18-26",
        oracle: "static-ruby x8 scenarios (board-act-view.rb; title bytes cross-checked against fixtures/captured/board-views.json)",
        status: "ported, verify GREEN (harness capture + probe)",
      },
    ],
    "card-mod-style": [
      {
        view: "remote_include_tags",
        source: "set/type_plus_right/mod/style.rb:26-32",
        oracle: "static-ruby (style-tag-views.rb; the tag bytes cross-checked against the captured corpus constant REMOTE_STYLE_TAG)",
        status: "ported, verify GREEN (harness capture + probe)",
      },
      {
        view: "remote_style_tags",
        source: "set/self/style_mods.rb:8-14",
        oracle: "static-ruby (style-tag-views.rb; the item nest + present-filter + output join)",
        status: "ported, verify GREEN (harness capture + probe)",
      },
      {
        view: "stylesheet_include_tag",
        source: "set/type_plus_right/mod/style.rb:20-24 + set/abstract/style_group.rb:37-40",
        oracle: "static-ruby (style-tag-views.rb; the abstract arm's bare helper is defined in no installed gem - the registered arm throws the Ruby body's NoMethodError and the engine's quiet rescue emits the standard bytes)",
        status: "ported (the mod/style nest arm GREEN; the abstract arm registered as the raising arm - the byte-equivalent quiet rescue)",
      },
      {
        view: "stylesheet_path",
        source: "set/type_plus_right/set/style.rb:28-33",
        oracle: "static-ruby (style-tag-views.rb; the headless params absence computes the else arm)",
        status: "ported, verify GREEN (harness capture + probe; the params[:debug] arm is the named remainder)",
      },
    ],
    "card-mod-follow": [
      {
        view: "subedit_notice",
        source: "set/all/notify/base_views.rb:25-31 (the BASE format block)",
        oracle: "static-ruby x11 scenarios (follow-census-views.rb; the changed-field rows ride the render-time history seam)",
        status: "ported, verify GREEN (harness capture + probe; the registered :list_of_changes keeps the email lane's page arm - the divergence named in the view comment)",
      },
      {
        view: "follower",
        source: "set/all/notify/base_views.rb:41-43 (the BASE format block)",
        oracle: "static-ruby (follow-census-views.rb; active_notice nil headlessly -> the literal fallback)",
        status: "ported, verify GREEN (harness capture + probe; the send-path ivar is the same disclosed basis the flat record's followed/unfollow_url arms carry)",
      },
      {
        view: "rule_editor",
        source: "set/right/following.rb:32-38",
        oracle: "static-ruby (follow-census-views.rb; the dispatch contract + the applied-string arm's raise - rule? is false on the simple option card)",
        status: "ported, verify GREEN (harness capture + probe; the seam's rule_editor branch resolves the actor + the applied content, the rules mod's ruleFormView owns the form bytes)",
      },
      {
        view: "errors",
        source: "set/type_plus_right/user/follow.rb:65-78",
        oracle: "static-ruby (follow-census-views.rb; the no-errors arm is the only arm a headless render reaches)",
        status: "ported, verify GREEN (harness capture + probe; the permission arm's pieces probe-pinned, the super() arm dispatches card-mod-format's all-set body)",
      },
    ],
    "card-mod-format": [
      {
        view: "demo",
        source: "set/all/demo.rb:2-7",
        oracle: "static-ruby x4 scenarios (demo-view.rb; the codename list parsed from the REAL frozen admin.yml files under the real interpreter)",
        status: "ported, verify GREEN (harness capture + probe)",
      },
    ],
  },
  namedRemainderViews: {
    "card-mod-format": [
      {
        view: "debug_server_error",
        source: "set/all/html/error.rb:4-8",
        reason:
          "the BetterErrors dev-tool error page; the better_errors gem is NOT in the frozen gem set - the view raises NameError in the installed-gems environment, its behavior belongs to an external dev dependency",
      },
    ],
  },
  status(modId) {
    const ported = this.portedViews[modId];
    const named = this.namedRemainderViews[modId];
    if (!ported && !named) return null;
    const census = REMEASURE.missingByMod[modId] ?? 0;
    return {
      branch: this.branch,
      portedViews: ported ?? [],
      namedRemainderViews: named ?? [],
      censusMissingRemaining: census - (ported?.length ?? 0) - (named?.length ?? 0),
    };
  },
};

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function die(msg) {
  process.stderr.write(`mod-harness: ${msg}\n`);
  process.exit(2);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
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

/** Resolve a mod argument ("comment" or "card-mod-comment") to
 *  { modId, gemName, gemPath }. Reads the gems dir READ-ONLY. */
function resolveMod(modArg) {
  const id = modArg.startsWith("card-mod-") ? modArg : `card-mod-${modArg}`;
  if (!existsSync(GEM_DIR)) die(`gem dir not found: ${GEM_DIR}`);
  const match = readdirSync(GEM_DIR)
    .filter((n) => n === id || n.startsWith(`${id}-`))
    .sort()
    .pop();
  if (match === undefined) {
    die(`no installed gem matching "${modArg}" under ${GEM_DIR}`);
  }
  return { modId: id, gemName: match, gemPath: join(GEM_DIR, match) };
}

function writeOut(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  process.stderr.write(`wrote ${path}\n`);
}

// ---------------------------------------------------------------------------
// SURFACE — enumerate the mod's full behavior set from the gem source
// ---------------------------------------------------------------------------

/** Views declared directly (`view :name`, `view(:name, ...)`, with alias
 *  and trailing config), plus the LOOP form the compat report's regex
 *  misses: `%i[a b c].each do |viewname| ... view viewname ... end`
 *  (card-mod-comment set/right/discussion.rb:1-6). Returns
 *  [{ name, alias, config, line, viaLoop }] */
function mineViews(src, relFile) {
  const views = [];
  const seen = new Set();
  const push = (name, alias, line, viaLoop, config) => {
    const key = `${name}`;
    if (seen.has(key)) {
      const prev = views.find((v) => v.name === name);
      if (prev && config && !prev.config) prev.config = config;
      return;
    }
    seen.add(key);
    views.push({ name, alias: alias ?? null, line, viaLoop, config: config ?? null, file: relFile });
  };

  // direct forms (multiline-tolerant for `view :name,` option lists)
  const directRe = /^[ \t]*view[ \t]*\(?[ \t]*:([A-Za-z0-9_?!]+)(?:[ \t]*,[ \t]*:([A-Za-z0-9_?!]+))?([^\n]*)/gm;
  let m;
  while ((m = directRe.exec(src)) !== null) {
    push(m[1], m[2] ?? null, src.slice(0, m.index).split("\n").length, false, (m[3] ?? "").trim() || null);
  }

  // loop form: `%i[...]`.each / %w[...].each with a block that calls
  // `view <blockvar>` (optionally with a config hash on the same line).
  const loopRe = /%[iwa]\[([^\]]+)\][ \t]*\.each[ \t]+do[ \t]*\|([A-Za-z0-9_]+)\|([^\n]*)/g;
  while ((m = loopRe.exec(src)) !== null) {
    const names = m[1].split(/\s+/).filter(Boolean);
    const blockVar = m[2];
    const tail = m[3] ?? "";
    // look ahead 15 lines for `view <blockvar>`; carry any `unknown:`-style
    // config text on that call line.
    const after = src.slice(m.index, m.index + 2000);
    const lines = after.split("\n").slice(0, 16);
    const callLine = lines.find((l) =>
      new RegExp(`^[ \\t]*view[ \\t]+${blockVar}\\b`).test(l),
    );
    let config = (tail.match(/([a-z_]+:\s*[^\s].*)/)?.[1] ?? "").trim() || null;
    if (callLine) {
      const cfg = callLine.replace(new RegExp(`^[ \\t]*view[ \\t]+${blockVar}`), "").trim();
      if (cfg) config = cfg;
    }
    const line = src.slice(0, m.index).split("\n").length;
    for (const raw of names) {
      const name = raw.replace(/^:/, "");
      push(name, null, line, true, callLine ? config : config);
    }
  }
  return views;
}

function mineEvents(src, relFile) {
  const events = [];
  const re = /^[ \t]*event[ \t]+:([A-Za-z0-9_?!]+)([^\n]*)/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    events.push({
      event: m[1],
      options: (m[2] ?? "").trim(),
      line: src.slice(0, m.index).split("\n").length,
      file: relFile,
    });
  }
  return events;
}

function mineBaskets(src, relFile) {
  const ops = [];
  const re = /^[ \t]*basket\[([^\]]+)\]([^\n]*)/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    ops.push({
      op: `basket[${m[1]}]${m[2]}`.trim(),
      line: src.slice(0, m.index).split("\n").length,
      file: relFile,
    });
  }
  return ops;
}

function mineRawHelpText(src) {
  // the raw_help_text string body: join the double-quoted " \ "-continued
  // lines into the literal the source carries (no Ruby evaluation needed —
  // the segments are plain double-quoted strings without interpolation in
  // every installed gem; a $-interpolation found here is reported null and
  // the behavior is marked live-deck-required).
  const re = /def raw_help_text\s*((?:"(?:[^"\\]|\\.)*"\s*\\\s*)*"(?:[^"\\]|\\.)*")/m;
  const m = re.exec(src);
  if (m === null) return null;
  const joined = m[1].replace(/"\s*\\\s*"/g, "");
  if (/#\{/.test(joined)) return null;
  return JSON.parse(joined); // double-quoted Ruby string == JSON string here
}

function parseSimpleSeedYml(text) {
  // data/real.yml seeds: lines "- :name:", ":codename:", ":type:", and the
  // ":content: |" block. NOT a YAML parser — the seed inventory the surface
  // needs (name/codename/type/content-shape), tolerant of the two-space
  // shape every installed gem's real.yml uses.
  const seeds = [];
  let cur = null;
  let inContent = false;
  let contentIndent = 0;
  for (const line of text.split("\n")) {
    if (inContent) {
      if (/^\s*$/.test(line) || line.length - line.trimStart().length >= contentIndent) {
        cur.contentLines.push(line.slice(contentIndent).replace(/\s+$/, ""));
        continue;
      }
      inContent = false;
      cur.content = cur.contentLines.join("\n");
    }
    const entry = /^- :name:\s*(.*)$/.exec(line);
    if (entry) {
      if (cur) seeds.push(cur);
      cur = { name: entry[1].trim(), codename: null, type: null, content: null, contentLines: [] };
      continue;
    }
    const codename = /^\s*:codename:\s*(.*)$/.exec(line);
    if (codename && cur) cur.codename = codename[1].trim() || null;
    const type = /^\s*:type:\s*(.*)$/.exec(line);
    if (type && cur) cur.type = type[1].trim() || null;
    const content = /^\s*:content:\s*\|$/.exec(line);
    if (content && cur) {
      inContent = true;
      contentIndent = line.length - line.indexOf(":content:");
    }
  }
  if (cur) {
    if (inContent) cur.content = cur.contentLines.join("\n");
    delete cur.contentLines;
    seeds.push(cur);
  } else if (seeds.length) {
    for (const s of seeds) delete s.contentLines;
  }
  return seeds;
}

function surfaceMod(modId, gemName, gemPath) {
  const setDir = join(gemPath, "set");
  const files = walkFiles(setDir, ".rb").sort();
  const behaviors = [];
  const setFiles = [];

  for (const full of files) {
    const rel = relative(gemPath, full).replaceAll("\\", "/");
    const src = readText(full);
    const views = mineViews(src, rel);
    const events = mineEvents(src, rel);
    const baskets = mineBaskets(src, rel);
    const helpText = mineRawHelpText(src);
    setFiles.push({ file: rel, views: views.length, events: events.length, baskets: baskets.length });

    for (const v of views) {
      behaviors.push({
        id: `view:${v.name}`,
        kind: "view",
        name: v.name,
        alias: v.alias,
        config: v.config,
        source: `${gemName}/${rel}:${v.line}${v.viaLoop ? " (loop-declared)" : ""}`,
      });
    }
    for (const e of events) {
      behaviors.push({
        id: `event:${e.event}`,
        kind: "event",
        name: e.event,
        options: e.options,
        source: `${gemName}/${rel}:${e.line}`,
      });
    }
    for (const b of baskets) {
      behaviors.push({
        id: `basket:${b.op}`,
        kind: "basket-op",
        op: b.op,
        source: `${gemName}/${rel}:${b.line}`,
      });
    }
    // settings: set/self/<anchor>.rb — the *<anchor> setting's help text
    if (/^self\//.test(rel)) {
      const anchor = basename(rel, ".rb");
      behaviors.push({
        id: `setting:${anchor}`,
        kind: "setting",
        name: anchor,
        rawHelpText: helpText,
        helpTextCapturable: helpText !== null,
        source: `${gemName}/${rel}`,
      });
    }
  }

  // seeds + configs + assets
  const seeds = [];
  const dataDir = join(gemPath, "data");
  if (existsSync(dataDir)) {
    for (const yml of walkFiles(dataDir, ".yml")) {
      for (const s of parseSimpleSeedYml(readText(yml))) {
        seeds.push({ ...s, file: relative(gemPath, yml).replaceAll("\\", "/") });
        behaviors.push({
          id: `seed:${s.codename ?? s.name}`,
          kind: "seed",
          name: s.name,
          codename: s.codename,
          type: s.type,
          contentSha: s.content ? sha256(s.content).slice(0, 16) : null,
          source: `${gemName}/${relative(gemPath, yml).replaceAll("\\", "/")}`,
        });
      }
    }
  }
  const configs = [];
  const configDir = join(gemPath, "config");
  if (existsSync(configDir)) {
    for (const yml of walkFiles(configDir, ".yml")) {
      const keys = [...readText(yml).matchAll(/^([A-Za-z0-9_]+):/gm)].map((m) => m[1]);
      configs.push({ file: relative(gemPath, yml).replaceAll("\\", "/"), keys });
      for (const k of keys) {
        behaviors.push({
          id: `config:${k}`,
          kind: "config",
          name: k,
          source: `${gemName}/${relative(gemPath, yml).replaceAll("\\", "/")}`,
        });
      }
    }
  }
  const assets = walkFiles(join(gemPath, "assets"), "").map((p) =>
    relative(gemPath, p).replaceAll("\\", "/"),
  );
  const publicAssets = existsSync(join(gemPath, "public"))
    ? walkFiles(join(gemPath, "public"), "").length
    : 0;

  return { modId, gemName, gemPath, setFiles, behaviors, seeds, configs, assets, publicAssets };
}

function surfaceMarkdown(s) {
  const L = [];
  const kind = (k) => s.behaviors.filter((b) => b.kind === k);
  const views = kind("view");
  L.push(`# ${s.gemName} — behavior surface`);
  L.push("");
  L.push(`What this mod does (mined from the Ruby gem source, READ-ONLY):`);
  L.push("");
  const bits = [];
  if (views.length) bits.push(`${views.length} view(s)`);
  const evs = kind("event");
  if (evs.length) bits.push(`${evs.length} event hook(s)`);
  const sets = kind("setting");
  if (sets.length) bits.push(`${sets.length} setting card(s)`);
  const seedsB = kind("seed");
  if (seedsB.length) bits.push(`${seedsB.length} seed card(s)`);
  const cfg = kind("config");
  if (cfg.length) bits.push(`${cfg.length} config key(s)`);
  const bsk = kind("basket-op");
  if (bsk.length) bits.push(`${bsk.length} basket registration(s)`);
  L.push(`- ${bits.join(", ") || "declarations only (no executable behaviors found)"}.`);
  L.push(`- ${s.setFiles.length} set module file(s); ${s.assets.length} asset file(s); ${s.publicAssets} public/ asset file(s).`);
  L.push("");
  if (views.length) {
    L.push("## Views");
    L.push("");
    for (const v of views) {
      L.push(`- \`${v.name}\`${v.alias ? ` (alias of :${v.alias})` : ""}${v.viaLoop ? " (loop-declared)" : ""}${v.config ? ` — ${v.config}` : ""} — ${v.source}`);
    }
    L.push("");
  }
  if (evs.length) {
    L.push("## Events");
    L.push("");
    for (const e of evs) L.push(`- \`${e.name}\` ${e.options} — ${e.source}`);
    L.push("");
  }
  const settingBehaviors = kind("setting");
  if (settingBehaviors.length) {
    L.push("## Settings");
    L.push("");
    for (const st of settingBehaviors) {
      L.push(`- \`*${st.name}\`${st.rawHelpText ? ` — help text: "${st.rawHelpText}"` : " — help text requires live capture"}`);
    }
    L.push("");
  }
  if (seedsB.length) {
    L.push("## Seed cards");
    L.push("");
    for (const sd of s.seeds) {
      L.push(`- ${sd.name}${sd.codename ? ` (codename ${sd.codename})` : ""}${sd.type ? ` type ${sd.type}` : ""} — ${sd.file}`);
    }
    L.push("");
  }
  if (bsk.length) {
    L.push("## Basket registrations");
    L.push("");
    for (const b of bsk) L.push(`- \`${b.op}\` — ${b.source}`);
    L.push("");
  }
  if (cfg.length) {
    L.push("## Config keys");
    L.push("");
    for (const c of cfg) L.push(`- \`${c.name}\` — ${c.source}`);
    L.push("");
  }
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// CAPTURE — produce the Ruby oracle per behavior
// ---------------------------------------------------------------------------

function captureMod(modId, gemName, gemPath) {
  const lines = [];
  const existingPath = [join(ORACLE_DIR, `${modId}.jsonl`), join(ORACLE_DIR, `${modId.replace(/^card-mod-/, "")}.jsonl`)]
    .find((p) => existsSync(p));
  if (existingPath !== undefined) {
    const text = readText(existingPath);
    lines.push({
      kind: "existing-capture-ref",
      mod: modId,
      sourceFile: relative(REPO, existingPath).replaceAll("\\", "/"),
      sha256: sha256(text),
      lines: text.trim() ? text.trim().split("\n").length : 0,
      provenance: "prior lane's live/oracle capture; see the repo history of that file for its capture deck + discipline",
    });
  }

  // static-ruby: run every script under ruby-oracles/<modId>/*.rb
  const scriptDir = join(RUBY_ORACLES, modId);
  const scripts = existsSync(scriptDir)
    ? readdirSync(scriptDir).filter((f) => f.endsWith(".rb")).sort()
    : [];
  const scratch = join(SCRATCH_DIR, modId, "capture");
  mkdirSync(scratch, { recursive: true });
  for (const script of scripts) {
    const full = join(scriptDir, script);
    const res = spawnSync(RUBY, [full, gemPath], {
      cwd: scratch,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (res.status !== 0) {
      lines.push({
        kind: "capture-error",
        mod: modId,
        strategy: "static-ruby",
        script,
        error: (res.stderr || `exit ${res.status}`).slice(0, 2000),
      });
      continue;
    }
    const rubyVersion = spawnSync(RUBY, ["-v"], { encoding: "utf8" }).stdout.trim();
    for (const line of res.stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        lines.push({ kind: "capture-error", mod: modId, strategy: "static-ruby", script, error: `unparseable line: ${line.slice(0, 200)}` });
        continue;
      }
      obj.provenance = {
        strategy: "static-ruby",
        script: relative(REPO, full).replaceAll("\\", "/"),
        gemSource: obj.gemSource ?? null,
        extraction: "gem source lines extracted verbatim by the script; stubs documented in the script header",
        ruby: rubyVersion,
        capturedAt: new Date().toISOString(),
      };
      lines.push(obj);
    }
  }

  // uncaptured: surface behaviors with no oracle line of their own
  const surfacePath = join(REPORTS_DIR, modId, "surface.json");
  let uncaptured = [];
  if (existsSync(surfacePath)) {
    const surface = JSON.parse(readText(surfacePath));
    const covered = new Set(lines.map((l) => l.behaviorId).filter(Boolean));
    uncaptured = surface.behaviors
      .filter((b) => !covered.has(b.id))
      .map((b) => ({ behaviorId: b.id, kind: b.kind, source: b.source, captureStrategy: "none (live-deck capture not exercised by this lane)" }));
  }

  const outPath = join(ORACLE_DIR, `${modId}.harness.jsonl`);
  writeOut(outPath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { outPath, total: lines.length, uncaptured };
}

// ---------------------------------------------------------------------------
// VERIFY — run the TS implementation against every oracle
// ---------------------------------------------------------------------------

/** The engine's shared view table (src/card/render/views.ts HTML_VIEWS) —
 *  the same mining the compat report uses. Some mods (bar_and_box) port
 *  their views ENGINE-SIDE instead of through a manifest (their test
 *  headers document the choice), so a view behavior is registration-verified
 *  by manifest OR engine table. */
function mineEngineViews() {
  const src = readText(join(REPO, "src", "card", "render", "views.ts"));
  const names = new Set();
  const re = /^\s*([a-z_]+):\s*[a-z]\w*View/gm;
  let m;
  while ((m = re.exec(src)) !== null) names.add(m[1]);
  return names;
}

function registrationChecks(surface, engineViews) {
  const manifestPath = join(MOD_LOADER_MODS, `${surface.modId}.ts`);
  const manifestSrc = existsSync(manifestPath) ? readText(manifestPath) : null;
  // cross-mod registration sweep (wave-1 lane): a view the SURFACE mod
  // declares can be REGISTERED by another mod's manifest (format.rb's
  // comment_box override is registered by card-mod-comment). The seed and
  // config checks already sweep; the view check gains the same arm.
  const checks = [];
  const crossModFor = (name) => {
    for (const f of walkFiles(MOD_LOADER_MODS, ".ts")) {
      const file = relative(REPO, f).replaceAll("\\", "/");
      if (file.endsWith(`${surface.modId}.ts`)) continue;
      const src = readText(f);
      if (new RegExp(`\\{\\s*view:\\s*"${name}"`).test(src)) return file;
    }
    return null;
  };
  for (const b of surface.behaviors) {
    if (b.kind === "view") {
      const inManifest =
        manifestSrc !== null &&
        new RegExp(`\\{\\s*view:\\s*"${b.name}"`).test(manifestSrc);
      const crossMod = !inManifest && !engineViews.has(b.name) ? crossModFor(b.name) : null;
      const registered = inManifest || engineViews.has(b.name) || crossMod !== null;
      checks.push({
        behaviorId: b.id,
        check: "ts-view-registration",
        pass: registered,
        evidence: registered
          ? crossMod !== null
            ? `view "${b.name}" registered in ANOTHER mod's manifest (${crossMod}) - the surface mod's override dispatches through the mod chain`
            : engineViews.has(b.name)
              ? `view "${b.name}" registered (engine HTML_VIEWS${inManifest ? " + manifest" : ""})`
              : `${surface.modId}.ts registers view "${b.name}"`
          : `no view "${b.name}" registration in ${surface.modId}.ts, any other mod manifest, or the engine HTML_VIEWS table`,
      });
    } else if (b.kind === "event") {
      const registered =
        manifestSrc !== null &&
        new RegExp(`event:\\s*"${b.name}"`).test(manifestSrc);
      checks.push({
        behaviorId: b.id,
        check: "ts-manifest-registration",
        pass: registered,
        evidence: registered
          ? `${surface.modId}.ts registers event "${b.name}"`
          : `no event "${b.name}" registration in ${surface.modId}.ts`,
      });
    } else if (b.kind === "setting") {
      const registered =
        manifestSrc !== null &&
        new RegExp(`setPath:\\s*"self/${b.name}"`).test(manifestSrc);
      checks.push({
        behaviorId: b.id,
        check: "ts-manifest-registration",
        pass: registered,
        evidence: registered
          ? `${surface.modId}.ts registers set module self/${b.name}`
          : `no self/${b.name} set module in ${surface.modId}.ts`,
      });
    } else if (b.kind === "seed") {
      // seeds ride the standard write path — search the whole mods tree +
      // core seeds for the codename/name.
      let found = null;
      const hay = walkFiles(MOD_LOADER_MODS, ".ts");
      for (const f of hay) {
        const src = readText(f);
        const needle = b.codename ?? b.name;
        if (src.includes(`"${needle}"`) || src.includes(`'${needle}'`)) {
          found = relative(REPO, f).replaceAll("\\", "/");
          break;
        }
      }
      checks.push({
        behaviorId: b.id,
        check: "ts-seed-present",
        pass: found !== null,
        evidence: found ?? `no TS registration naming "${b.codename ?? b.name}"`,
      });
    } else if (b.kind === "config" || b.kind === "basket-op") {
      // no TS consumer seam for admin configs / baskets unless a manifest
      // names the same literal — search manifests.
      const needle = b.kind === "basket-op"
        ? (b.op.match(/"([^"]+)"/)?.[1] ?? b.op)
        : b.name;
      let found = null;
      for (const f of walkFiles(MOD_LOADER_MODS, ".ts")) {
        const src = readText(f);
        if (src.includes(needle)) {
          found = relative(REPO, f).replaceAll("\\", "/");
          break;
        }
      }
      checks.push({
        behaviorId: b.id,
        check: "ts-consumer-literal",
        pass: found !== null,
        evidence: found ?? `no TS literal "${needle}" (no consumer seam yet)`,
      });
    }
  }
  return checks;
}

function runProbeTests(probeFiles) {
  if (probeFiles.length === 0) return { ran: false, passed: 0, failed: 0, detail: "no probe test files" };
  const scratch = join(SCRATCH_DIR, "verify");
  mkdirSync(scratch, { recursive: true });
  const outJson = join(scratch, `probe-result-${Date.now()}.json`);
  // platform-neutral spawn (win32 + linux): the vitest CLI entry directly
  // under this repo's node_modules, run by the current node — no npx.cmd
  // (a CMD shell builtin that spawnSync(shell:false) cannot start).
  const vitestEntry = join(REPO, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitestEntry)) {
    return { ran: false, passed: 0, failed: 0, detail: `vitest entry not found: ${vitestEntry} (junction node_modules into this worktree first)` };
  }
  const res = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--reporter=json", `--outputFile=${outJson}`, "--maxWorkers=2", ...probeFiles],
    { cwd: REPO, encoding: "utf8", timeout: 300_000 },
  );
  if (!existsSync(outJson)) {
    return { ran: false, passed: 0, failed: 0, detail: `vitest produced no json (exit ${res.status}): ${(res.stderr || res.stdout || "").slice(-800)}` };
  }
  const report = JSON.parse(readText(outJson));
  let passed = 0;
  let failed = 0;
  const failures = [];
  for (const tr of report.testResults ?? []) {
    for (const ar of tr.assertionResults ?? []) {
      if (ar.status === "passed") passed++;
      else if (ar.status === "failed") {
        failed++;
        failures.push({ fullName: ar.fullName, messages: (ar.failureMessages ?? []).slice(0, 1) });
      }
    }
  }
  rmSync(outJson, { force: true });
  return { ran: true, passed, failed, failures, detail: `${passed} passed / ${failed} failed` };
}

function verifyMod(modId) {
  const surfacePath = join(REPORTS_DIR, modId, "surface.json");
  if (!existsSync(surfacePath)) die(`no surface for ${modId} — run the surface command first`);
  const surface = JSON.parse(readText(surfacePath));
  const engineViews = mineEngineViews();
  const regChecks = registrationChecks(surface, engineViews);

  const oraclePath = join(ORACLE_DIR, `${modId}.harness.jsonl`);
  const oracleLines = existsSync(oraclePath)
    ? readText(oraclePath).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const capturedIds = new Set(
    oracleLines.map((l) => l.behaviorId).filter(Boolean),
  );
  const dashId = modId.replace(/_/g, "-");
  const probeCandidates = [
    join(TESTS_DIR, `${modId}-harness-probe.test.ts`),
    join(TESTS_DIR, `${modId}.test.ts`),
    join(TESTS_DIR, `${dashId}.test.ts`),
    join(TESTS_DIR, `${modId}-save-event.test.ts`),
    join(TESTS_DIR, `${dashId}-views.test.ts`),
  ]
    .filter((p) => existsSync(p))
    // dedupe (modId == dashId for mods without underscores)
    .filter((p, i, a) => a.indexOf(p) === i);
  const probe = runProbeTests(probeCandidates);

  const byBehavior = {};
  for (const c of regChecks) byBehavior[c.behaviorId] = { registration: c };
  for (const b of surface.behaviors) {
    const slot = (byBehavior[b.id] ??= {});
    slot.captured = capturedIds.has(b.id)
      ? oracleLines.find((l) => l.behaviorId === b.id)?.provenance?.strategy ?? "existing-capture"
      : null;
  }

  const rows = surface.behaviors.map((b) => {
    const slot = byBehavior[b.id] ?? {};
    const reg = slot.registration;
    const captured = slot.captured !== null && slot.captured !== undefined;
    // state: green = registered AND (probe suite green OR no probe needed);
    // red = registration missing OR probe suite failed;
    // uncaptured = no oracle (live-deck required) — never counted validated.
    // named-remainder = red-unported registration whose behaviorId carries a
    // named, evidenced reason (NAMED_REMAINDERS via namedRemainderFor -
    // exact keys then <regex> classes) — never counted RED, never
    // counted validated (the wave's end condition: every remainder named).
    const remainderReason = !reg?.pass ? namedRemainderFor(modId, b.id) : undefined;
    let state;
    if (remainderReason !== undefined) {
      state = "named-remainder";
    } else if (reg === undefined) {
      state = captured ? "green-no-registration-check" : "captured-unprobed";
    } else if (!reg.pass) {
      state = "red-unported";
    } else if (probe.ran && probe.failed > 0) {
      // probe failures name RED; the scorecard records the probe result at
      // mod level (the probe files pin oracle bytes across behaviors).
      state = "red-oracle-probe";
    } else if (captured) {
      state = "green";
    } else if (probe.ran) {
      // registered, no harness oracle for THIS behavior, but the mod's
      // tracked suite ran green inside this verify — the behavior is
      // pinned by the standing net (e.g. bar_and_box's engine-side views),
      // not by a harness oracle line.
      state = "registered-standing-net";
    } else {
      state = "uncaptured";
    }
    return {
      behaviorId: b.id,
      kind: b.kind,
      source: b.source,
      registration: reg?.pass === true ? "yes" : reg?.pass === false ? "no" : "n/a",
      captured: slot.captured ?? null,
      state,
      remainderReason: remainderReason ?? null,
      evidence: reg?.evidence ?? null,
    };
  });

  const validated = rows.filter((r) => r.state === "green" || r.state === "green-no-registration-check").length;
  const standingNet = rows.filter((r) => r.state === "registered-standing-net").length;
  const namedRemainder = rows.filter((r) => r.state === "named-remainder").length;
  const red = rows.filter((r) => r.state.startsWith("red")).length;
  const uncaptured = rows.filter((r) => r.state === "uncaptured" || r.state === "captured-unprobed").length;

  const scorecard = {
    mod: modId,
    gem: surface.gemName,
    generatedAt: new Date().toISOString(),
    totals: { behaviors: rows.length, validated, standingNet, namedRemainder, red, uncaptured },
    probeSuite: {
      files: probeCandidates.map((p) => relative(REPO, p).replaceAll("\\", "/")),
      ran: probe.ran,
      detail: probe.detail,
      failures: probe.failures ?? [],
    },
    behaviors: rows,
  };
  writeOut(join(REPORTS_DIR, modId, "scorecard.json"), JSON.stringify(scorecard, null, 2) + "\n");

  const L = [];
  L.push(`# ${modId} — harness scorecard`);
  L.push("");
  L.push(`Behaviors validated: **${validated} / ${rows.length}** (standing-net: ${standingNet}, named-remainder: ${namedRemainder}, RED: ${red}, uncaptured: ${uncaptured})`);
  L.push("");
  L.push(`State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.`);
  L.push("");
  if (probe.ran) L.push(`Probe suite: ${probe.detail} (${scorecard.probeSuite.files.join(", ")})`);
  else L.push(`Probe suite: not run — ${probe.detail}`);
  L.push("");
  L.push("| behavior | kind | state | ts registration | captured | evidence |");
  L.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    L.push(`| \`${r.behaviorId}\` | ${r.kind} | ${r.state} | ${r.registration} | ${r.captured ?? "-"} | ${(r.evidence ?? r.source).replaceAll("|", "\\|").slice(0, 140)} |`);
  }
  L.push("");
  writeOut(join(REPORTS_DIR, modId, "scorecard.md"), L.join("\n"));
  return scorecard;
}

// ---------------------------------------------------------------------------
// REGISTRY — every public mod, ported / unported / private-unknown
// ---------------------------------------------------------------------------

function buildRegistry() {
  if (!existsSync(COMPAT_JSON)) die(`compat report not found: ${COMPAT_JSON}`);
  const compat = JSON.parse(readText(COMPAT_JSON));
  const byGem = new Map(compat.mods.map((m) => [m.gem, m]));

  const rows = [];
  // the core mod (card-1.110.0 mod/core) — the engine itself is its port.
  rows.push({
    mod: "card (core mod, card-1.110.0 mod/core)",
    status: "ported",
    statusEvidence: "the decko-ts engine IS the core port (src/card/*); not a card-mod-* gem",
    harnessScorecard: "see the engine suites",
    privateUnknown: false,
    reMeasureMissingViews: null,
  });

  for (const gemDir of readdirSync(GEM_DIR).filter((n) => n.startsWith("card-mod-")).sort()) {
    const modId = gemDir.replace(/-\d+\.\d+\.\d+$/, "");
    const gemPath = join(GEM_DIR, gemDir);
    const c = byGem.get(gemDir);
    const manifestPath = join(MOD_LOADER_MODS, `${modId}.ts`);
    const manifestExists = existsSync(manifestPath);
    const scorecardPath = join(REPORTS_DIR, modId, "scorecard.json");
    let scorecard = "not harness-validated yet";
    if (existsSync(scorecardPath)) {
      const sc = JSON.parse(readText(scorecardPath));
      scorecard = `${sc.totals.validated}/${sc.totals.behaviors} validated${sc.totals.red ? ` (RED ${sc.totals.red})` : ""}`;
    }
    // Public evidence: the gem is a published, LICENSE-carrying checkout
    // under the installed gem dir (the same frozen set the license audit
    // read). Every card-mod-* gem is public by construction.
    const license = existsSync(join(gemPath, "LICENSE")) ? "LICENSE present" : "no LICENSE file";
    const compatStatus = c?.classification?.status ?? "unknown";
    // harness-first status: the scorecard's RED count is the ruling's bar —
    // "ported" means behavior-validated, not regex-classified. The compat
    // report is the fallback for mods the harness has not run yet.
    let status;
    let statusEvidence;
    let sc = null;
    if (existsSync(scorecardPath)) {
      sc = JSON.parse(readText(scorecardPath));
    }
    if (compatStatus === "ignored") {
      // legacy-labeled (decko-commons#1282 thread): data-only/backend-only,
      // no set/ tree to port. The ruling's ported/unported axis: their
      // behavior set is empty or backend-only, so ported-vacuous.
      status = "ported";
      statusEvidence = `legacy-labeled per upstream (#1282): ${c?.classification?.verdict ?? "no set/ tree"}; nothing to port`;
    } else if (sc !== null && sc.totals.red > 0) {
      status = "unported";
      statusEvidence = `harness scorecard: ${sc.totals.red} RED behavior(s) of ${sc.totals.behaviors} (see tools/mod-porting-harness/reports/${modId}/scorecard.md)`;
    } else if (sc !== null) {
      status = "ported";
      statusEvidence = `harness scorecard, 0 RED: ${sc.totals.validated}/${sc.totals.behaviors} harness-oracle-validated, ${sc.totals.standingNet} pinned by the mod's standing suite${sc.totals.namedRemainder ? `, ${sc.totals.namedRemainder} named-remainder(s) (see the scorecard rows)` : ``} (see tools/mod-porting-harness/reports/${modId}/scorecard.md)`;
    } else if (manifestExists && compatStatus === "ported") {
      status = "ported";
      statusEvidence = c?.classification?.verdict ?? "compat report ported + manifest present (harness not yet run)";
    } else {
      status = "unported";
      statusEvidence = c?.classification?.verdict ?? (manifestExists ? "manifest present but compat report not ported (harness not yet run)" : "no TS manifest");
    }
    rows.push({
      mod: modId,
      gem: gemDir,
      gemVersion: gemDir.split("-").pop(),
      status,
      statusEvidence,
      compatStatus,
      manifest: manifestExists,
      harnessScorecard: scorecard,
      reMeasureMissingViews: REMEASURE.missingByMod[modId] ?? 0,
      wave1: WAVE1.status(modId),
      privateUnknown: false,
      publicEvidence: `installed gem ${gemDir} under ${GEM_DIR}; ${license}`,
    });
  }

  // TS-only mods: manifests without a gem (the marketplace mod).
  for (const f of readdirSync(MOD_LOADER_MODS).filter((n) => n.startsWith("card-mod-") && n.endsWith(".ts")).sort()) {
    const modId = f.replace(/\.ts$/, "");
    if (rows.some((r) => r.mod === modId)) continue;
    const scorecardPath = join(REPORTS_DIR, modId, "scorecard.json");
    let scorecard = "not harness-validated yet";
    if (existsSync(scorecardPath)) {
      const sc = JSON.parse(readText(scorecardPath));
      scorecard = `${sc.totals.validated}/${sc.totals.behaviors} validated`;
    }
    rows.push({
      mod: modId,
      status: "ported",
      statusEvidence: "TS-only mod (no Ruby gem — no Ruby-declared surface; decko-ts marketplace mod)",
      harnessScorecard: scorecard,
      privateUnknown: false,
      reMeasureMissingViews: null,
    });
  }

  const ported = rows.filter((r) => r.status === "ported").length;
  const unported = rows.filter((r) => r.status === "unported").length;
  const privateUnknown = rows.filter((r) => r.privateUnknown).length;

  const json = {
    generatedAt: new Date().toISOString(),
    ruling: "every PUBLIC mod ported, behavior-validated; private mods are the only exclusion",
    reMeasureCite: `mod-coverage-remeasure 2026-10-03 (tree ${REMEASURE.tree}): ${REMEASURE.declaredViews} declared views / ${REMEASURE.bytePinned} byte-pinned / ${REMEASURE.renderAtAll} render-at-all / ${REMEASURE.missingViews} missing; ${REMEASURE.modsZeroMissing} mods with zero missing views`,
    totals: { mods: rows.length, ported, unported, privateUnknown },
    mods: rows,
  };
  writeOut(REGISTRY_JSON, JSON.stringify(json, null, 2) + "\n");

  const L = [];
  L.push("# Public mod registry — the porting-harness progress tracker");
  L.push("");
  L.push(`Generated ${json.generatedAt} by tools/mod-porting-harness/mod-harness.mjs registry`);
  L.push("");
  L.push(`Ruling: every PUBLIC mod ported, behavior-validated. Private mods are the only exclusion (none in the installed gem set — every row's public evidence names its gem).`);
  L.push("");
  L.push(`**${ported} ported / ${unported} unported / ${privateUnknown} private-unknown** across ${rows.length} mods.`);
  L.push("");
  const modsWithMissing = rows.filter((r) => (r.reMeasureMissingViews ?? 0) > 0);
  const missingTotal = modsWithMissing.reduce((a, r) => a + (r.reMeasureMissingViews ?? 0), 0);
  if (missingTotal > 0) {
    L.push(`**Honest gap note:** the mod-level ported status does not mask behavior gaps — ${modsWithMissing.length} ported mod(s) still carry ${missingTotal} missing view(s) per the re-measurement (${modsWithMissing.map((r) => `${r.mod}: ${r.reMeasureMissingViews}`).join(", ")}). Those behaviors are unported INSIDE ported mods; their rows show them in the re-measure column until their harness scorecards land.`);
    L.push("");
  }
  const notHarnessValidated = rows.filter(
    (r) => r.harnessScorecard === "not harness-validated yet",
  ).length;
  L.push(`**Harness coverage of the registry:** ${rows.length - notHarnessValidated} of ${rows.length} rows carry a harness scorecard; the other ${notHarnessValidated} are cited on compat-report evidence only and are the next surface/capture/verify runs to make.`);
  L.push("");
  L.push(`Re-measurement cite: ${json.reMeasureCite}.`);
  L.push("");
  L.push("| mod | status | re-measure missing views | harness scorecard | evidence |");
  L.push("|-----|--------|-------------------------:|-------------------|----------|");
  for (const r of rows) {
    L.push(`| \`${r.mod}\` | ${r.status} | ${r.reMeasureMissingViews ?? "-"} | ${r.harnessScorecard.replaceAll("|", "\\|")} | ${r.statusEvidence.replaceAll("|", "\\|").slice(0, 180)} |`);
  }
  L.push("");
  L.push("## Private-unknown evidence policy");
  L.push("");
  L.push("A mod is marked `private-unknown` only with evidence that its source is site-private (not published). The installed `card-mod-*` gem set is public by construction (published gems with LICENSE files — the same frozen set the license audit read), so no row carries private-unknown here. The TS-only marketplace row cites its no-gem status.");
  L.push("");
  writeOut(REGISTRY_MD, L.join("\n"));
  return json;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const [cmd, modArg] = process.argv.slice(2);
  if (cmd === "surface") {
    if (!modArg) die("usage: mod-harness.mjs surface <mod>");
    const { modId, gemName, gemPath } = resolveMod(modArg);
    const s = surfaceMod(modId, gemName, gemPath);
    writeOut(join(REPORTS_DIR, modId, "surface.json"), JSON.stringify(s, null, 2) + "\n");
    writeOut(join(REPORTS_DIR, modId, "surface.md"), surfaceMarkdown(s));
    process.stdout.write(`${modId}: ${s.behaviors.length} behaviors across ${s.setFiles.length} set files\n`);
  } else if (cmd === "capture") {
    if (!modArg) die("usage: mod-harness.mjs capture <mod>");
    const { modId, gemName, gemPath } = resolveMod(modArg);
    const res = captureMod(modId, gemName, gemPath);
    process.stdout.write(`${modId}: ${res.total} oracle lines -> ${res.outPath}\n`);
    if (res.uncaptured.length) {
      process.stdout.write(`${modId}: ${res.uncaptured.length} behavior(s) UNCAPTURED (live-deck strategy not exercised by this lane):\n`);
      for (const u of res.uncaptured) process.stdout.write(`  - ${u.behaviorId} (${u.kind})\n`);
    }
  } else if (cmd === "verify") {
    if (!modArg) die("usage: mod-harness.mjs verify <mod>");
    const { modId } = resolveMod(modArg);
    const sc = verifyMod(modId);
    process.stdout.write(`${modId}: ${sc.totals.validated}/${sc.totals.behaviors} validated (RED ${sc.totals.red}, uncaptured ${sc.totals.uncaptured})\n`);
    if (sc.totals.red > 0) process.exit(1); // RED is loud: the harness working
  } else if (cmd === "registry") {
    const reg = buildRegistry();
    process.stdout.write(`registry: ${reg.totals.ported} ported / ${reg.totals.unported} unported / ${reg.totals.privateUnknown} private-unknown across ${reg.totals.mods} mods\n`);
  } else {
    die("usage: mod-harness.mjs <surface|capture|verify|registry> [mod]");
  }
}

main();
