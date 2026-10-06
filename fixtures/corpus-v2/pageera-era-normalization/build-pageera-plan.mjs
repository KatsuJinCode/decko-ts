// build-pageera-plan.mjs -- build the transform plan from the PROBE's own
// dumped bytes. Nothing is transcribed: the pre-state sha comes from the
// staged corpus, the post-state bytes come from the `actual--*.html` file the
// graded-era probe wrote for that entry, and the corpus is RE-READ to bind the
// pre sha. A no-op entry (frozen bytes already equal to the corpus bytes)
// is refused, so the plan can never claim to have normalized an entry that was
// already in the frozen form -- the same refusal R2's plan builder carried.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const CORPUS = "tmp/raw-ground-truth";
const PROBE_DIR = process.argv.includes("--probe-dir")
  ? process.argv[process.argv.indexOf("--probe-dir") + 1]
  : "tmp/pageera/probe-graded-prestate";
const TARGETS = process.argv.includes("--targets")
  ? process.argv[process.argv.indexOf("--targets") + 1]
  : "tmp/pageera/targets-era-11.txt";
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "tmp/pageera/manifests/transform-plan.json";
const BASE = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : null;
const ENGINE_PIN = JSON.parse(
  readFileSync("tests/card/render/raw-corpus-override-capture-restored-rows.json", "utf8"),
).meta.corpusSha256;

const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
const SLOT_ID_PATTERN = /data-slot-id=(["'])[0-9a-f]{20}\1/g;
const normalizeSlotIds = (h) => h.replace(SLOT_ID_PATTERN, 'data-slot-id="RANDOMIZED"');

const rows = readFileSync(TARGETS, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"))
  .map((l) => {
    const [lane, shard, name, view] = l.split("\t");
    return { lane, shard, name, view };
  });

const shardCache = new Map();
function shardLines(lane, shard) {
  const key = `${lane}/${shard}`;
  if (shardCache.has(key)) return shardCache.get(key);
  const p = path.join(CORPUS, "expected-v2", lane === "view" ? "view-lane" : "page-lane", shard);
  const lines = readFileSync(p, "utf8").split("\n");
  shardCache.set(key, lines);
  return lines;
}

const targets = [];
const noops = [];
for (const t of rows) {
  const lines = shardLines(t.lane, t.shard);
  const idx = lines.findIndex((l) => {
    if (l.trim() === "") return false;
    try { return JSON.parse(l).name === t.name; } catch { return false; }
  });
  if (idx < 0) { console.error(`PLAN-REFUSE: record ${t.name} not in ${t.shard}`); process.exit(2); }
  const parsed = JSON.parse(lines[idx]);
  if (typeof parsed.page_html !== "string") {
    console.error(`PLAN-REFUSE: ${t.name} carries no page_html string`);
    process.exit(2);
  }
  const preBytes = parsed.page_html;
  const preSha = sha(preBytes);
  const safe = `${t.name}__${t.view}`.replace(/[^\w.-]+/g, "_").slice(0, 100);
  const frozenFile = path.join(PROBE_DIR, `actual--${safe}.html`);
  let frozenRaw;
  try {
    frozenRaw = readFileSync(frozenFile, "utf8");
  } catch {
    console.error(`PLAN-REFUSE: no probe dump for ${t.name} at ${frozenFile}`);
    process.exit(2);
  }
  const postBytes = normalizeSlotIds(frozenRaw);
  if (sha(postBytes) === preSha) {
    noops.push(`${t.name}:${t.view}`);
    continue;
  }
  targets.push({
    lane: t.lane, shard: t.shard, name: t.name, view: t.view,
    preSha256: preSha, frozenBytesFile: frozenFile,
    postSha256: sha(postBytes),
    deltaBytes: Buffer.byteLength(postBytes, "utf8") - Buffer.byteLength(preBytes, "utf8"),
  });
}

if (noops.length > 0) {
  console.log(`PLAN: ${noops.length} no-op(s) DROPPED (already frozen-form): ${noops.join(" | ")}`);
}
const plan = {
  schema: "pageera-transform-plan/1",
  builtFrom: {
    probeDir: PROBE_DIR,
    targets: TARGETS,
    corpusRoot: CORPUS,
    // The engine state the FROZEN bytes were rendered under. Recorded on the
    // plan so a reader can tell which arm the post-state belongs to: the five
    // GRADED_ARM_DEPLOYMENT_CONSTANTS values SET, serializerEra and
    // defaultHtmlViewNest UNSET.
    engineArm: "graded (five head/body constants SET; serializerEra and defaultHtmlViewNest UNSET)",
    engineBase: BASE,
  },
  engineCorpusPin: ENGINE_PIN,
  corpusDbSha256: ENGINE_PIN,
  targetCount: targets.length,
  targets,
};
writeFileSync(OUT, JSON.stringify(plan, null, 2) + "\n");
const shards = new Set(targets.map((t) => `${t.lane}/${t.shard}`));
console.log(`PLAN targets=${targets.length} shards=${shards.size} (${[...shards].sort().join(" ")}) -> ${OUT}`);
for (const t of targets) {
  console.log(`  ${t.name}:${t.view}  pre=${t.preSha256.slice(0, 16)}  post=${t.postSha256.slice(0, 16)}  delta=${t.deltaBytes}`);
}
