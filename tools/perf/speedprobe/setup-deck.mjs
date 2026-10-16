// setup-deck.mjs — build a LOCAL deck copy for the speed probe: copy the
// immutable source snapshot's rows onto the engine schema (indexes +
// ANALYZE), seed the disposable admin/member accounts, and build the nest
// index. Writes tools/perf/speedprobe/deck.sqlite3 and tools/perf/speedprobe/creds.json.
//
// Usage: node tools/perf/speedprobe/setup-deck.mjs [--source <deck.sqlite3>]
import { existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildLocalDeck } from "../../edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "../../edge-signed-in-exercise/lib/seed-local-accounts.mjs";

const REPO = resolve(import.meta.dirname, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const SOURCE = resolve(arg("source", "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3"));
const OUT_DIR = join(REPO, "tmp", "speedprobe");
const DECK = join(OUT_DIR, "deck.sqlite3");
const CREDS = join(OUT_DIR, "creds.json");

if (!existsSync(SOURCE)) throw new Error(`source deck not found: ${SOURCE}`);
if (existsSync(SOURCE + "-wal") && statSync(SOURCE + "-wal").size > 0) throw new Error("source deck has an active WAL; use an immutable snapshot");

mkdirSync(OUT_DIR, { recursive: true });
if (existsSync(DECK)) rmSync(DECK);
const report = await buildLocalDeck({ source: SOURCE, out: DECK });
console.log(`deck built: ${DECK} (${(statSync(DECK).size / 1048576).toFixed(1)} MB); source rows ${JSON.stringify(report).slice(0, 400)}`);

await seedLocalAccounts({ deck: DECK, credentialsOut: CREDS });
console.log(`accounts seeded; credentials at ${CREDS}`);

execFileSync(process.execPath, [join(REPO, "tools/deploy/build-nest-index.mjs"), "--db", DECK], { cwd: REPO, stdio: "inherit", timeout: 600_000 });
console.log("nest index built");