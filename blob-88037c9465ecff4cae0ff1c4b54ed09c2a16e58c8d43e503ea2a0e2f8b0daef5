#!/usr/bin/env node
// Runs Decko's own browser scenarios (its cucumber features tagged
// @javascript) on stock Ruby Decko, with the Capybara driver in ../capybara
// over an installed headless browser. No WebDriver binary is used or
// downloaded.
//
//   node reference-harness/browser/cucumber/run-features.mjs --decko <decko git checkout> \
//     [--ref v0.20.0] [--features attach,conflict] --out <dir>
//
// The feature files and the cucumber support gem come from the decko
// repository at --ref (the release the installed gems are), extracted into
// .work/decko-src. The deck in ./app runs the installed gems unpatched; its
// database, cache and files live in .work and are removed on exit. Each
// feature runs as its own cucumber process, one at a time. Decko's support
// code reseeds the database before every scenario through a second Ruby
// process (`rake db:seed:replant`), as it does upstream.
//
// Writes <out>/junit-<feature>/ (cucumber's JUnit report), <out>/<feature>.txt
// (the pretty report) and <out>/summary.json: every scenario with its result
// and, when it did not pass, the failing step and message.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "app");
const work = path.join(here, ".work");
const register = path.join(here, "..", "capybara", "register.rb");
const fwd = (p) => p.split(path.sep).join("/");

function parseArgs(argv) {
  const args = { ref: "v0.20.0" };
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!args.decko) throw new Error("--decko <decko git checkout> is required");
  if (!args.out) throw new Error("--out <dir> is required");
  return args;
}

function run(cmd, cmdArgs, { cwd, env, log, allowFail = false, timeoutMs = 30 * 60_000 } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd, env, windowsHide: true, encoding: "utf8", maxBuffer: 1 << 28, timeout: timeoutMs });
  if (log) writeFileSync(log, `$ ${cmd} ${cmdArgs.join(" ")}\n${r.stdout ?? ""}\n${r.stderr ?? ""}`, { flag: "a" });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} exited ${r.status}\n${String(r.stderr ?? "").slice(-2000)}`);
  }
  return r;
}

// A Ruby script by name from PATH (bundle, cucumber), portable to Windows.
const ruby = (script, scriptArgs, opts) => run("ruby", ["-S", script, ...scriptArgs], opts);

const xmlText = (s) =>
  String(s ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
const attr = (attrs, name) => xmlText(attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]);

/** Every scenario of a cucumber JUnit report, with its result: passed,
 *  failed, undefined (a step with no definition) or skipped. */
function scenarios(xml, feature) {
  const out = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = m[2] ?? "";
    const failure = body.match(/<failure\b([^>]*)>(?:\s*<!\[CDATA\[([\s\S]*?)\]\]>)?/);
    const skipped = body.match(/<skipped\b([^>]*)\/?>/);
    let status = "passed";
    let message;
    if (failure) {
      status = attr(failure[1], "type") || "failed";
      message = (failure[2] ?? attr(failure[1], "message")).trim().split("\n").slice(0, 3).join(" | ");
    } else if (skipped) {
      message = attr(skipped[1], "message");
      status = /undefined/i.test(message) ? "undefined" : "skipped";
    }
    out.push({ feature, scenario: attr(m[1], "name"), status, ...(message ? { message: message.slice(0, 400) } : {}) });
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const out = path.resolve(args.out);
mkdirSync(out, { recursive: true });
const log = path.join(out, "setup.log");
writeFileSync(log, "");
const webdriversCache = path.join(os.homedir(), ".webdrivers");
const hadWebdriversCache = existsSync(webdriversCache);

rmSync(work, { recursive: true, force: true });
mkdirSync(path.join(work, "decko-src"), { recursive: true });
try {
  // The release's features and cucumber support gem.
  const tar = path.join(work, "src.tar");
  run("git", ["-C", args.decko, "archive", "--format=tar", "-o", tar, args.ref,
    "decko_gem.rb", "card/VERSION", "card/lib/cardio/version.rb", "decko/features", "support/decko-cucumber"], { log });
  run("tar", ["-xf", "../src.tar"], { cwd: path.join(work, "decko-src"), log });

  const env = {
    ...process.env,
    BUNDLE_GEMFILE: fwd(path.join(app, "Gemfile")),
    CUCUMBER_WORK: fwd(work),
    // cucumber-rails would take the app root from the features directory.
    RAILS_ROOT: fwd(app),
    // Decko's support code reseeds through `env RAILS_ENV=test bundle exec ...`.
    RAILS_ENV: "test",
  };
  mkdirSync(path.join(work, "cache"));
  mkdirSync(path.join(work, "files"));
  mkdirSync(path.join(work, "tmp"));
  // Each installed card mod's public directory at public/mod/<mod>, as
  // `decko setup` links them (copied: links need privileges on Windows).
  const gemDir = run("ruby", ["-e", "print Gem.dir"], { log }).stdout.trim();
  for (const g of readdirSync(path.join(gemDir, "gems"))) {
    const m = g.match(/^card-mod-(.+)-0\.20\.0$/);
    const pub = path.join(gemDir, "gems", g, "public");
    if (m && existsSync(pub)) cpSync(pub, path.join(work, "public", "mod", m[1]), { recursive: true });
  }
  ruby("bundle", ["install", "--local", "--quiet"], { cwd: app, env, log });
  // A deck with Decko's schema and its test seed. Decko's support code
  // reseeds it before every scenario, but the card mods load once, at boot,
  // from what the database holds then.
  ruby("bundle", ["exec", "rake", "db:schema:load"], { cwd: app, env, log });
  ruby("bundle", ["exec", "rake", "db:seed:replant"], { cwd: app, env, log });

  const featuresDir = path.join(work, "decko-src", "decko", "features");
  const wanted = args.features ? new Set(args.features.split(",")) : null;
  const features = readdirSync(featuresDir)
    .filter((f) => f.endsWith(".feature"))
    .filter((f) => !wanted || wanted.has(f.replace(/\.feature$/, "")))
    // Tagged (not commented-out) @javascript features; one whose scenarios
    // are all commented out runs zero scenarios and is reported as such.
    .filter((f) => /^\s*@javascript/m.test(readFileSync(path.join(featuresDir, f), "utf8")))
    .sort();

  const all = [];
  for (const f of features) {
    const base = f.replace(/\.feature$/, "");
    const t0 = Date.now();
    ruby(
      "bundle",
      [
        "exec", "cucumber",
        "--tags", "@javascript",
        "-r", fwd(featuresDir), "-r", fwd(register),
        // cucumber 7's JSON formatter fails under json 3; its JUnit report is read.
        "--format", "junit", "--out", fwd(path.join(out, `junit-${base}`)),
        "--format", "pretty", "--no-color", "--out", fwd(path.join(out, `${base}.txt`)),
        fwd(path.join(featuresDir, f)),
      ],
      {
        cwd: app,
        // A cold deck on a busy machine answers slower than upstream CI: the
        // steps' ajax waits get 15 s unless CAPYBARA_WAIT says otherwise.
        env: { CAPYBARA_WAIT: "15", ...env, RAILS_ENV: "cucumber", DECKO_FEATURES_DIR: fwd(featuresDir) },
        log,
        allowFail: true,
      },
    );
    const junitDir = path.join(out, `junit-${base}`);
    const found = existsSync(junitDir)
      ? readdirSync(junitDir)
          .filter((x) => x.endsWith(".xml"))
          .flatMap((x) => scenarios(readFileSync(path.join(junitDir, x), "utf8"), f))
      : [];
    const prettyFile = path.join(out, `${base}.txt`);
    const pretty = existsSync(prettyFile) ? readFileSync(prettyFile, "utf8") : "";
    // JUnit reports a scenario with an undefined step as skipped; the pretty
    // report's tally says how many of the skipped ones were undefined.
    const undefinedCount = Number(pretty.match(/^\d+ scenarios? \(([^)]*)\)/m)?.[1].match(/(\d+) undefined/)?.[1] ?? 0);
    const skipped = found.filter((s) => s.status === "skipped");
    if (undefinedCount > 0 && skipped.length <= undefinedCount) {
      for (const s of skipped) s.status = "undefined";
    }
    if (found.length === 0) {
      if (/^0 scenarios/m.test(pretty)) {
        console.log(`${f}: no active scenarios (all commented out upstream)`);
        continue;
      }
      found.push({ feature: f, scenario: "(feature did not run)", status: "error" });
    }
    all.push(...found);
    const tally = found.reduce((t, s) => ({ ...t, [s.status]: (t[s.status] ?? 0) + 1 }), {});
    console.log(`${f}: ${JSON.stringify(tally)} (${Date.now() - t0} ms)`);
  }

  const counts = all.reduce((t, s) => ({ ...t, [s.status]: (t[s.status] ?? 0) + 1 }), {});
  const summary = {
    ref: args.ref,
    gems: "decko 0.20.0, card 1.110.0 (installed, unpatched)",
    driver: "reference-harness/browser/capybara (playwright-core over an installed headless browser)",
    scenarios: all.length,
    counts,
    results: all,
  };
  writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(`scenarios: ${all.length} ${JSON.stringify(counts)}`);
  if (!hadWebdriversCache && existsSync(webdriversCache)) {
    console.error(`WARNING: ${webdriversCache} appeared during the run; a WebDriver download was attempted`);
    process.exitCode = 2;
  }
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
