// semantics-run-ruby.mjs -- run one Ruby probe under `decko runner` in the
// local oracle app copy, against the local copy of the capture deck.
// The child runs hidden; stdout/stderr go to <log>.
//
// The oracle app, the deck copy, and the cache directory are machine-local,
// gitignored assets (docs/parity-method.md documents their layout), so this
// driver takes them only through environment variables and refuses to guess
// a built-in machine path.
//
// usage: node semantics-run-ruby.mjs <probe.rb> <log> [KEY=VALUE ...]
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(
      `REFUSAL: ${name} is not set — the oracle app, deck copy, and cache are ` +
        `machine-local assets this driver will not hard-code; see docs/parity-method.md`,
    );
    process.exit(2);
  }
  return v;
}

const APP = requiredEnv("SEMANTICS_ORACLE_APP");
const DECK = requiredEnv("SEMANTICS_RUBY_DECK");
const CACHE = requiredEnv("SEMANTICS_RUBY_CACHE");
const RUBY = process.env.SEMANTICS_RUBY_BIN ?? "ruby";

const [probe, log, ...pairs] = process.argv.slice(2);
const env = { ...process.env, DATABASE_URL: `sqlite3:${DECK}`, DECKO_CACHE_DIR: CACHE };
for (const p of pairs) {
  const i = p.indexOf("=");
  env[p.slice(0, i)] = p.slice(i + 1);
}
const out = openSync(log, "w");
const child = spawn(
  RUBY,
  [path.join(APP, "script/decko"), "runner", path.resolve(probe)],
  { cwd: APP, env, stdio: ["ignore", out, out], windowsHide: true },
);
child.on("exit", (code) => {
  process.stdout.write(`ruby probe exited ${code}\n`);
  process.exitCode = code ?? 1;
});
