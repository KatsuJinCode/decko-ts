// semantics-run-ruby.mjs -- run one Ruby probe under `decko runner` in the
// private oracle app copy, against the private copy of the capture deck.
// The child runs hidden; stdout/stderr go to <log>.
//
// usage: node semantics-run-ruby.mjs <probe.rb> <log> [KEY=VALUE ...]
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";

const APP = process.env.SEMANTICS_ORACLE_APP ?? "C:/localProjects/decko-oracle-app-parity-fix";
const DECK = process.env.SEMANTICS_RUBY_DECK ?? "C:/localProjects/decko-ts-parity-semantics/tmp/sem/ruby-deck.sqlite3";
const CACHE = process.env.SEMANTICS_RUBY_CACHE ?? "C:/localProjects/decko-ts-parity-semantics/tmp/sem/rubcache";

const [probe, log, ...pairs] = process.argv.slice(2);
const env = { ...process.env, DATABASE_URL: `sqlite3:${DECK}`, DECKO_CACHE_DIR: CACHE };
for (const p of pairs) {
  const i = p.indexOf("=");
  env[p.slice(0, i)] = p.slice(i + 1);
}
const out = openSync(log, "w");
const child = spawn(
  "C:/Ruby33-x64/bin/ruby.exe",
  [path.join(APP, "script/decko"), "runner", path.resolve(probe)],
  { cwd: APP, env, stdio: ["ignore", out, out], windowsHide: true },
);
child.on("exit", (code) => {
  process.stdout.write(`ruby probe exited ${code}\n`);
  process.exitCode = code ?? 1;
});
