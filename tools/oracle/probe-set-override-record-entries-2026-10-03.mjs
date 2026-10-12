// probe-set-override-record-entries-2026-10-03.mjs
//
// Targeted record-leg probe for set-module override fidelity. Boots the
// committed corpus seeding (the same boot the graded direct runner
// performs), replicates the graded card-engine record handler FIELD-FOR-FIELD
// (tools/oracle/dual-lane-direct-runner-core.ts:723-830, including the
// set-module content override), and computes for every enumerated
// override-hit card's record expectation:
//
//   pre  = structuredCardContent(ctx, dbContent, universe, undefined)
//   post = structuredCardContent(ctx, dbContent, universe, resolveSetModuleContent(ctx))
//
// compared against the staging expectation's record.content bytes. Verdicts:
//
//   RED->GREEN   expected != pre AND expected == post  (the port flips a
//                baseline-failing entry to byte parity -- the probe's proof)
//   UNMOVED-PASS expected == pre (and post == pre)     (blast-radius guard: a
//                previously-passing entry the port must not move)
//   LOUD-DIVERGENCE expected != pre AND expected != post BUT the post bytes
//                match the documented loud shape (Self::Mod: same line count,
//                every expected line "#<Cardio::Mod:0xADDR>_mod", port lines
//                "<mod>_mod", same mod-name sequence)
//   REMAINDER    expected != pre AND expected != post AND the card matches an
//                unregistered module (Type::BootswatchSkin) — stays failing
//                exactly as baseline, derivation-recorded
//   OTHER-FAIL   anything else — must be adjudicated from Ruby, never silent
//
// Usage: node tools/oracle/probe-set-override-record-entries-2026-10-03.mjs
// Zero network; read-only on the mirror and staging; writes only its own
// tmp/set-override-fidelity/ probe JSON.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");

// The loader supplies `.js` -> `.ts` resolution + the TypeScript transform —
// the same registration dual-lane-direct-runner.mjs performs.
const { register } = await import("node:module");
register("./typescript-source-loader.mjs", pathToFileURL(path.join(TOOL_DIR, "typescript-source-loader.mjs")).href);

const seeding = await import(
  pathToFileURL(path.join(REPO_ROOT, "tests", "card", "render", "raw-corpus-seeding.js")).href
);
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;
const { structureRuleUniverseStatement, structureUniverseFromResults, structuredCardContent } =
  await import(pathToFileURL(path.join(REPO_ROOT, "src", "card", "rules", "structure.js")).href);
const {
  RECORDED_NOW_INSTANT,
  resolveSetModuleContent,
  setCaptureWallClock,
  ORACLE_BUNDLE_ORDER,
} = await import(
  pathToFileURL(path.join(REPO_ROOT, "src", "card", "set-module-content-overrides.js")).href
);
const Database = (await import("better-sqlite3")).default;

// The oracle deck's pinned wall clock — the runner pins it at module scope;
// the probe replicates that so post bytes equal the graded handler's bytes.
setCaptureWallClock(RECORDED_NOW_INSTANT);

// The enumerated override-hit card set (derived by
// census-set-module-content-overrides-2026-10-03.mjs). id -> { module, wired }.
const CENSUS = [
  { id: 4032, module: "Self::alerts", wired: true },
  { id: 33852, module: "Self::bootstrap_core", wired: true },
  { id: 33848, module: "Self::bootstrap_functions", wired: true },
  { id: 11745, module: "Self::input_type+right+content_options", wired: true },
  { id: 45410, module: "Self::mod", wired: true },
  { id: 4036, module: "Self::now", wired: true },
  { id: 4037, module: "Self::version", wired: true },
  { id: 22736, module: "Type::bootswatch_skin", wired: false },
  { id: 22774, module: "Type::bootswatch_skin", wired: false },
  { id: 22778, module: "Type::bootswatch_skin", wired: false },
  { id: 22782, module: "Type::bootswatch_skin", wired: false },
  { id: 22786, module: "Type::bootswatch_skin", wired: false },
  { id: 22790, module: "Type::bootswatch_skin", wired: false },
  { id: 22794, module: "Type::bootswatch_skin", wired: false },
  { id: 22798, module: "Type::bootswatch_skin", wired: false },
  { id: 22810, module: "Type::bootswatch_skin", wired: false },
  { id: 22814, module: "Type::bootswatch_skin", wired: false },
  { id: 22818, module: "Type::bootswatch_skin", wired: false },
  { id: 22822, module: "Type::bootswatch_skin", wired: false },
  { id: 22826, module: "Type::bootswatch_skin", wired: false },
  { id: 22830, module: "Type::bootswatch_skin", wired: false },
  { id: 22834, module: "Type::bootswatch_skin", wired: false },
  { id: 33872, module: "Type::bootswatch_skin", wired: false },
  { id: 33877, module: "Type::bootswatch_skin", wired: false },
  { id: 33880, module: "Type::bootswatch_skin", wired: false },
  { id: 33883, module: "Type::bootswatch_skin", wired: false },
  { id: 33886, module: "Type::bootswatch_skin", wired: false },
  { id: 33893, module: "Type::bootswatch_skin", wired: false },
  { id: 33898, module: "Type::bootswatch_skin", wired: false },
  { id: 34179, module: "Type::bootswatch_skin", wired: false },
  { id: 34530, module: "Type::bootswatch_skin", wired: false },
  { id: 38274, module: "Type::bootswatch_skin", wired: false },
  { id: 23468, module: "Type::session", wired: true },
  { id: 23817, module: "Type::session", wired: true },
];

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// --- boot (same shape as the graded runner) ---
const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister
  .prepare("SELECT id FROM cards WHERE trash = 0")
  .all()
  .map((r) => r.id);
idLister.close();
console.log(`probe: booting seeded storage ids=${everyLiveId.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
const universeBatch = await storage.fetcher.driver.batch([structureRuleUniverseStatement()]);
const structureUniverse = structureUniverseFromResults(universeBatch[0]);
console.log("probe: boot complete");

// --- replicate the graded record handler's content resolution, per card ---
async function resolveContents(cardId) {
  const engine = storage.fetcher;
  const card = await engine.fetchById(cardId);
  if (card === undefined) return { error: "card not in seeded deck" };
  const typeCard =
    card.typeId === undefined ? undefined : await engine.fetchById(card.typeId);
  const typeCode =
    card.typeId === undefined
      ? undefined
      : (await engine.codenames.nameForId(card.typeId)) ?? "";
  const typeName = typeCard?.name;
  let leftCard;
  let leftTypeName;
  if (card.leftId !== undefined) {
    leftCard = await engine.fetchById(card.leftId);
    if (leftCard?.typeId !== undefined) {
      const leftTypeCard = await engine.fetchById(leftCard.typeId);
      leftTypeName = leftTypeCard?.name;
    }
  }
  const isSimple = card.name === undefined || card.name.isSimple;
  const partCodenames = [];
  {
    let cur = card;
    const spineGuard = new Set();
    while (cur.leftId !== undefined) {
      if (spineGuard.has(cur.id)) break;
      spineGuard.add(cur.id);
      const right =
        cur.rightId === undefined ? undefined : await engine.fetchById(cur.rightId);
      partCodenames.unshift(right?.codename ?? null);
      const next = await engine.fetchById(cur.leftId);
      if (next === undefined) break;
      cur = next;
    }
    if (!spineGuard.has(cur.id)) partCodenames.unshift(cur.codename ?? null);
  }
  const overrideCtx = {
    key: card.key ?? "",
    name: card.name?.s ?? "",
    codename: card.codename ?? null,
    typeCode: typeCode ?? null,
    dbContent: card.dbContent,
    partCodenames,
    leftIsReal: leftCard !== undefined && !leftCard.isNew && !leftCard.trash,
    leftCreatedAt: leftCard?.createdAt,
    leftUpdatedAt: leftCard?.updatedAt,
  };
  const setModuleOverride = resolveSetModuleContent(overrideCtx);
  const baseArgs = {
    name: card.name ?? "",
    id: card.id,
    typeId: card.typeId,
    typeName,
    leftTypeName,
    isNew: card.isNew,
  };
  const pre = structuredCardContent(baseArgs, card.dbContent, structureUniverse, undefined);
  const post = structuredCardContent(baseArgs, card.dbContent, structureUniverse, setModuleOverride);
  return {
    name: card.name?.s ?? "",
    pre,
    post,
    overrideMatched: setModuleOverride !== undefined,
    partCodenames,
  };
}

// --- collect the record expectations for the census names from staging ---
const EXPECTED_V2 = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2");
const LANES = [
  { lane: "view", dir: path.join(EXPECTED_V2, "view-lane") },
  { lane: "page", dir: path.join(EXPECTED_V2, "page-lane") },
];

// First resolve every census card's seeded name (record lines carry names).
const targets = [];
for (const c of CENSUS) {
  const resolved = await resolveContents(c.id);
  if (resolved.error) {
    targets.push({ ...c, error: resolved.error });
    continue;
  }
  targets.push({ ...c, ...resolved });
}
const nameToTarget = new Map(targets.filter((t) => t.name).map((t) => [t.name, t]));
console.log(`probe: census names resolved=${nameToTarget.size}/${CENSUS.length}`);

const recordEntries = [];
for (const { lane, dir } of LANES) {
  for (const shard of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    const lines = readFileSync(path.join(dir, shard), "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const rec = entry.record;
      if (rec === undefined || rec === null || typeof rec !== "object") continue;
      const t = nameToTarget.get(rec.name);
      if (t === undefined) continue;
      recordEntries.push({ lane, shard, expected: rec });
    }
  }
}
console.log(`probe: record expectations found=${recordEntries.length}`);

// --- verdicts ---
const LOUD_MOD_LINE = /^#<Cardio::Mod:0x[0-9a-f]+>_mod$/;

function modLoudShapeMatch(expected, port) {
  const eLines = expected.split("\n");
  const pLines = port.split("\n");
  if (eLines.length !== pLines.length) return { match: false, why: "line-count" };
  // The oracle's expected bytes carry NO mod names: Ruby's "#{mod}_mod"
  // interpolation stringified the Cardio::Mod OBJECT (no #to_s), so every
  // expected line is Object#to_s = "#<Cardio::Mod:0xADDR>_mod". The
  // derivable invariants are the line count and the inspect shape; the
  // port's "<mod>_mod" name lines are the documented loud divergence.
  if (!eLines.every((l) => LOUD_MOD_LINE.test(l))) return { match: false, why: "expected-shape" };
  if (!pLines.every((l) => l.endsWith("_mod"))) return { match: false, why: "port-shape" };
  return { match: true, lineCount: eLines.length };
}

const results = [];
const counts = {
  "RED->GREEN": 0,
  "UNMOVED-PASS": 0,
  "LOUD-DIVERGENCE": 0,
  REMAINDER: 0,
  "OTHER-FAIL": 0,
  "NO-ENTRY": 0,
};
for (const t of targets) {
  if (t.error) {
    results.push({ id: t.id, module: t.module, verdict: "OTHER-FAIL", error: t.error });
    counts["OTHER-FAIL"] += 1;
    continue;
  }
  const entries = recordEntries.filter((r) => r.expected.name === t.name);
  if (entries.length === 0) {
    results.push({
      id: t.id,
      module: t.module,
      name: t.name,
      verdict: "NO-ENTRY",
      preLen: t.pre.length,
      postLen: t.post.length,
      overrideMatched: t.overrideMatched,
    });
    counts["NO-ENTRY"] += 1;
    continue;
  }
  for (const e of entries) {
    const expected = e.expected.content ?? "";
    let verdict;
    const shape =
      t.module === "Self::mod" ? modLoudShapeMatch(expected, t.post) : undefined;
    if (expected === t.post) {
      verdict = expected === t.pre ? "UNMOVED-PASS" : "RED->GREEN";
    } else if (shape?.match) {
      verdict = "LOUD-DIVERGENCE";
    } else if (!t.wired) {
      verdict = "REMAINDER";
    } else {
      verdict = "OTHER-FAIL";
    }
    counts[verdict] += 1;
    results.push({
      id: t.id,
      module: t.module,
      wired: t.wired,
      name: t.name,
      lane: e.lane,
      shard: e.shard,
      verdict,
      expectedLen: expected.length,
      preEqExpected: expected === t.pre,
      postEqExpected: expected === t.post,
      preEqPost: t.pre === t.post,
      overrideMatched: t.overrideMatched,
      expectedSha256: sha256(expected),
      postSha256: sha256(t.post),
      modShape: shape ?? undefined,
    });
  }
}

mkdirSync(path.join(REPO_ROOT, "tmp", "set-override-fidelity"), { recursive: true });
const outPath = path.join(
  REPO_ROOT,
  "tmp",
  "set-override-fidelity",
  "record-probe-2026-10-03.json",
);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      what: "set-override-fidelity targeted record probe (RELAUNCH #4): per-entry byte verdicts",
      mirror: RAW_CORPUS_DB,
      censusCards: CENSUS.length,
      recordEntries: recordEntries.length,
      counts,
      results,
      bundleOrder: ORACLE_BUNDLE_ORDER,
    },
    null,
    2,
  ),
);

console.log("probe: VERDICT COUNTS " + JSON.stringify(counts));
console.log(`probe: JSON written ${outPath}`);
for (const r of results) {
  if (r.verdict === "OTHER-FAIL" || r.verdict === "NO-ENTRY") {
    console.log(`probe: NEEDS-ADJUDICATION id=${r.id} module=${r.module} verdict=${r.verdict}`);
  }
}
