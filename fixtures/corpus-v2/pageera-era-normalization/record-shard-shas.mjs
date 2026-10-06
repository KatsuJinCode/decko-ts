// record-shard-shas.mjs -- record or verify the sha256 of every expectation
// shard in a corpus tree, plus the corpus db, against the engine's pin.
//
// USAGE
//   node record-shard-shas.mjs --corpus <root> --out <shas.json>
//   node record-shard-shas.mjs --corpus <root> --verify <shas.json>
//
// A bound manifest is only reversible if the pre-state it binds to is itself
// recorded and independently re-derivable, so this is written first and
// verified before any transform touches a byte.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(flag);

const CORPUS = path.resolve(argValue("--corpus", "tmp/raw-ground-truth"));
const OUT = argValue("--out", "");
const VERIFY = argValue("--verify", "");
const PIN_PATH = path.resolve(
  argValue("--engine-pin", "tests/card/render/raw-corpus-override-capture-restored-rows.json"),
);

const sha = (b) => createHash("sha256").update(b).digest("hex");

const shards = {};
for (const lane of ["view-lane", "page-lane"]) {
  shards[lane] = {};
  const dir = path.join(CORPUS, "expected-v2", lane);
  const { readdirSync } = await import("node:fs");
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".jsonl")) continue;
    shards[lane][f] = sha(readFileSync(path.join(dir, f)));
  }
}

const dbPath = path.join(CORPUS, "bench-corpus-raw.sqlite3");
const corpusDbSha256 = sha(readFileSync(dbPath));
let enginePin = null;
try {
  enginePin = JSON.parse(readFileSync(PIN_PATH, "utf8")).meta.corpusSha256;
} catch {
  console.error("RECORD-REFUSE: engine corpus pin unreadable at " + PIN_PATH);
  process.exit(2);
}
const enginePinMatch = enginePin === corpusDbSha256;
const total = Object.values(shards).reduce((s, m) => s + Object.keys(m).length, 0);

if (VERIFY) {
  const rec = JSON.parse(readFileSync(path.resolve(VERIFY), "utf8"));
  const drift = [];
  for (const lane of Object.keys(rec.shards)) {
    for (const f of Object.keys(rec.shards[lane])) {
      if (shards[lane]?.[f] !== rec.shards[lane][f]) {
        drift.push(lane + "/" + f);
      }
    }
  }
  if (drift.length > 0) {
    console.error(
      `VERIFY-FAIL drift=${drift.length} corpusDb=${corpusDbSha256.slice(0, 16)} enginePinMatch=${enginePinMatch}`,
    );
    console.error("  drifted: " + drift.slice(0, 20).join(" | "));
    process.exit(3);
  }
  console.log(
    `VERIFY-OK shards=${total} corpusDb=${corpusDbSha256.slice(0, 16)} enginePinMatch=${enginePinMatch}`,
  );
  process.exit(0);
}

if (!OUT) {
  console.error("usage: --out <shas.json> or --verify <shas.json>");
  process.exit(2);
}
writeFileSync(
  path.resolve(OUT),
  JSON.stringify(
    {
      schema: "pageera-prestate/1",
      recordedAt: new Date().toISOString(),
      corpusRoot: CORPUS,
      corpusDbSha256,
      engineCorpusPin: enginePin,
      enginePinMatch,
      shards,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `RECORD-OK shards=${total} view=${Object.keys(shards["view-lane"]).length} page=${Object.keys(shards["page-lane"]).length} corpusDb=${corpusDbSha256.slice(0, 16)} enginePinMatch=${enginePinMatch} -> ${OUT}`,
);
