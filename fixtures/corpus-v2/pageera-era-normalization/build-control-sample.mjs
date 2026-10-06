// build-control-sample.mjs -- draw the control sample from the shards the
// transform NEVER touches, and record each entry's page_html sha256 so the
// post-state can be re-checked entry by entry.
//
// R2's step 4 drew 500 view entries from untouched shards and its step 7(b)
// REFUTED the isolation half of that claim: 3 of the drawn shards turned out to
// be transformed ones anyway, because the draw was computed before the census
// surfaced three same-class entries into the transform set. This draw is
// computed AFTER the transform set is fixed, and it asserts the exclusion
// rather than asserting it in prose: if any drawn entry shares a shard file
// with a transformed entry, this refuses to produce a sample.
//
// The draw is a POOL, not a filtered sample. The 500 are chosen by the probe
// (entries that PASS at pre-state under the graded arm), because a control that
// is known-failing proves nothing about movement. The pool is therefore larger
// than 500 and its size is recorded.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const arg = (f, d) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const CORPUS = arg("--corpus", "tmp/raw-ground-truth");
const PLAN = arg("--plan", "tmp/pageera/manifests/transform-plan.json");
const POOL_SIZE = Number(arg("--pool", "900"));
const OUT_POOL = arg("--out-pool", "tmp/pageera/targets-control-pool.txt");
const OUT_SHAS = arg("--out-shas", "tmp/pageera/manifests/sample-control-prestate-shas.json");

const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

const plan = JSON.parse(readFileSync(PLAN, "utf8"));
const transformedShards = new Set(plan.targets.map((t) => t.shard));
const dir = path.join(CORPUS, "expected-v2", "page-lane");
const all = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();

// Deterministic, spread-across-shards draw: walk the untouched shards in name
// order and take every k-th record, so the pool spans as many shards as
// possible instead of clustering in the first one.
const untouched = all.filter((f) => !transformedShards.has(f));
if (untouched.length === 0) {
  console.error("CONTROL-REFUSE: no untouched page shard to draw from");
  process.exit(2);
}
const pool = [];
const shas = {};
const perShard = new Map();
for (const f of untouched) {
  const lines = readFileSync(path.join(dir, f), "utf8").split("\n");
  const names = [];
  for (const l of lines) {
    if (l.trim() === "") continue;
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    if (typeof o.page_html === "string") names.push({ name: o.name, html: o.page_html });
  }
  perShard.set(f, names);
}
const stride = 1; // every untouched shard contributes, so the pool spans all 45
for (let si = 0; si < untouched.length && pool.length < POOL_SIZE; si += stride) {
  const f = untouched[si];
  const names = perShard.get(f);
  const step = Math.max(1, Math.floor(names.length / 12)); // ~12 per shard clears the mandate's 500 across 45 shards
  for (let i = 0; i < names.length && pool.length < POOL_SIZE; i += step) {
    pool.push({ shard: f, name: names[i].name });
    shas[`${f} | ${names[i].name}`] = sha(names[i].html);
  }
}

// The assertion R2's isolation claim failed: no drawn entry may share a shard
// FILE with a transformed entry.
const drawn = new Set(pool.map((p) => p.shard));
const overlap = [...drawn].filter((f) => transformedShards.has(f));
if (overlap.length > 0) {
  console.error(`CONTROL-REFUSE: pool shares shard file(s) with the transform: ${overlap.join(" | ")}`);
  process.exit(2);
}

writeFileSync(OUT_POOL, pool.map((p) => `page\t${p.shard}\t${p.name}\tpage`).join("\n") + "\n");
writeFileSync(OUT_SHAS, JSON.stringify({ schema: "pageera-control-prestate/1", poolSize: pool.length, drawnShards: drawn.size, transformedShards: [...transformedShards], shas }, null, 2) + "\n");
console.log(`CONTROL pool=${pool.length} drawnShards=${drawn.size} untouchedShards=${untouched.length} transformedShardsExcluded=${[...transformedShards].sort().join(",")}`);
