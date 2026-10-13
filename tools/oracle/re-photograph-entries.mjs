// tools/oracle/re-photograph-entries.mjs — the re-photography instrument
// driver: restore the capture-time deck state, re-render the disputed
// entries through the engine, and compare three ways (old oracle bytes vs
// re-rendered bytes vs the restore-identity proof).
//
// WHAT THIS IS: the entry-scoped instrument that adjudicates disputed
// capture-state findings by RESTORING the capture-time deck state,
// RE-RENDERING the disputed entries through the engine, and COMPARING THREE
// WAYS: old oracle bytes (expected-v2 shards) vs re-rendered bytes (engine on
// the restored state) vs the restore-identity proof itself.
//
// THE RESTORE MECHANISM (what "capture deck state" is, measured by this
// instrument's identity stage):
//   - The capture manifest (expected-v2/capture-manifest.json) binds the
//     expected-v2 photograph to the capture-time corpus copy on disk, with
//     the sqlite change-counter unchanged — the file the capture left in
//     place.
//   - That copy is a SCRUBBED REBUILD: names and bodies are randomized in
//     place, so its content fields are NOT ground truth (and the scrub was
//     not a sqlite transaction, so the change counter does not reveal it).
//   - This instrument MEASURED the scrub's blast radius: across every card
//     row the capture deck is EXACTLY equal to bench-corpus-raw.sqlite3
//     (the raw dump) on every structural column (id, type_id, trash,
//     left_id, right_id, codename) and on the full card_references graph;
//     it differs on names, contents (randomized) and timestamps (rebuild
//     clocks). The dump is therefore the ONLY real-name/real-content
//     witness of capture-time row state, and the capture deck
//     independently witnesses capture-time STRUCTURE. RESTORE = dump rows
//     (real names/content), cross-witnessed by the capture deck on
//     structure+graph.
//
// STAGES
//   identity  provenance hash gate (capture deck MUST match the manifest;
//             refusal class of tools/capture-and-grade.mjs:124), full
//             structure+graph identity proof, finding-family row census,
//             entry resolution, oracle shard location + unmeasured-absence
//             check. Writes tmp/re-photograph/rephoto-identity.json and
//             tmp/re-photograph/rephoto-entries.json (the render arm's input).
//   verdict   three-way decision per entry from the render arm's artifact
//             (tmp/re-photograph/re-rendered.jsonl). Writes
//             tmp/re-photograph/rephoto-verdict.json.
//
// ENTRY SCOPING / OPERATOR GATE: --limit N (default 3) runs the first N
// entries of the proof order; --limit 0 means ALL entries — the bulk
// re-photograph is OPERATOR-GATED and must be fired through the machine test
// queue only (the command is printed, never auto-run by this driver).
//
// USAGE (everything through the test-queue runner; copies only — the driver
// never opens any file under another checkout):
//   node tools/test-queue/submit-test-job.mjs \
//     --name rephoto-identity --cwd <your-checkout> \
//     --cmd "node tools/oracle/re-photograph-entries.mjs identity --limit 3" \
//     --timeout-min 1

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const GT = path.join(REPO_ROOT, "tmp", "raw-ground-truth");
const DUMP_DB = path.join(GT, "bench-corpus-raw.sqlite3");
const CAPTURE_DECK_DB = path.join(GT, "deck-recapture", "corpus-v2.sqlite3");
const MANIFEST_JSON = path.join(GT, "expected-v2", "capture-manifest.json");
const VIEW_LANE_DIR = path.join(GT, "expected-v2", "view-lane");
const PAGE_LANE_DIR = path.join(GT, "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "re-photograph");

/** The capture deck sha the manifest freezes (corpusSha256.before/after). */
const RECORDED_DUMP_SHA256 =
  "6a44dfdc20ca941e66da6ba08add7f1a5cf35ec1a3ba75cc43a70920e609440e";

/** The unmeasured falsification rows — rows that appear in NO capture
 *  shard — as corrected by this instrument's verification: one row first
 *  listed here turned out to BE a captured entry with its own oracle
 *  bytes and moved to the measured entry table below. */
const UNMEASURED_TPR_SET_IDS = [
  22007, 37916, 37919, 37922, 37925, 37928, 37931, 37934, 37937, 37940, 37943,
];

/** *type plus right set-pattern tag card id (resolved from dump). */
const TPR_TAG_ID = 262;

/** Rows this instrument reports in the family census, grouped by finding. */
const FAMILY_IDS = {
  "message-tpr": [21886, 22012, 22018, 22019, 22020, 17735, 17741, 17742, 17744, 21884, 21885, 21906, 21907],
  "attachment-key": [14542, 14547],
  "role-configs": [10, 34816, 34817, 34791, 6556, 34796, 34794, 45418, 45422],
  "tpr-unmeasured": [22005, 22006, 37895, ...UNMEASURED_TPR_SET_IDS],
};

/** The instrument's entry table, in proof order. The first 3 are the
 *  entry-scoped proof set (both lanes, two findings); --limit 0 = all 18. */
const ENTRIES = [
  {
    key: "message-tpr-content",
    finding: "message-tpr",
    name: "Message+Conversation+*type plus right",
    id: 22019,
    lane: "view",
    view: "content",
    oracleShard: "recapture-raw-shard-000017.jsonl",
    signatureNeedles: ["content_options"],
  },
  {
    key: "exhibit-tpr-control-content",
    finding: "message-tpr",
    name: "Exhibit+Item+*type plus right",
    id: 17742,
    lane: "view",
    view: "content",
    oracleShard: "recapture-raw-shard-000013.jsonl",
  },
  {
    key: "attachment-key-page-entry",
    finding: "attachment-key",
    // name is composed from the dump's junction rows in the identity stage,
    // so the shipped source never hard-codes a corpus card label here.
    name: null,
    id: 14542,
    lane: "page",
    view: "page_html",
    oracleShard: "recapture-raw-shard-000010.jsonl",
    // The oracle href is /14547/1.doc while the
    // dump's stored key (row 14547) is 61887.abr.1.doc — the instrument
    // measures which form each side's bytes carry.
    signatureNeedles: ["/14547/1.doc", "61887.abr.1.doc"],
  },
  {
    // Once listed among the falsification rows that appear in NO capture
    // shard; this instrument verified it IS a measured entry with its own
    // oracle bytes, so it belongs in the entry table.
    key: "task-log-entry-tpr-content",
    finding: "message-tpr",
    name: "Task+Log Entry+*type plus right",
    id: 21907,
    lane: "view",
    view: "content",
    oracleShard: "recapture-raw-shard-000016.jsonl",
    signatureNeedles: ["content_options"],
  },
  {
    key: "administrator-page",
    finding: "role-configs",
    name: "Administrator",
    id: 10,
    lane: "page",
    view: "page_html",
    oracleShard: "recapture-raw-shard-000000.jsonl",
  },
  {
    key: "administrator-dashboard-page",
    finding: "role-configs",
    name: "Administrator+Dashboard",
    id: 34817,
    lane: "page",
    view: "page_html",
    oracleShard: "recapture-raw-shard-000029.jsonl",
  },
  {
    key: "help-desk-page",
    finding: "role-configs",
    name: "Help Desk",
    id: 34791,
    lane: "page",
    view: "page_html",
    oracleShard: "recapture-raw-shard-000029.jsonl",
  },
  ...UNMEASURED_TPR_SET_IDS.map((id) => ({
    key: `unmeasured-tpr-${id}-content`,
    finding: "tpr-unmeasured",
    name: null, // composed from the dump's junction rows in the identity stage
    id,
    lane: "view",
    view: "content",
    oracleShard: null,
    signatureNeedles: ["content_options"],
  })),
];

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** Junction-aware name composition from the dump (junction rows store
 *  left_id/right_id; the name column is filled for simple cards only). */
function composeName(db, id, seen = new Set()) {
  if (seen.has(id)) return null;
  seen.add(id);
  const row = db
    .prepare("SELECT name, left_id, right_id FROM cards WHERE id = ?")
    .get(id);
  if (!row) return null;
  if (row.name !== null && row.name !== undefined) return row.name;
  const left = row.left_id !== null ? composeName(db, row.left_id, seen) : null;
  const right =
    row.right_id !== null ? composeName(db, row.right_id, seen) : null;
  if (left === null || right === null) return null;
  return `${left}+${right}`;
}

/** Stream one shard, return the entry with the wanted id (lane checked). */
async function readShardEntry(shardPath, id, lane) {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: createReadStream(shardPath) });
  try {
    for await (const line of rl) {
      if (line.trim() === "") continue;
      if (!line.includes(`"id":${id},`)) continue;
      const obj = JSON.parse(line);
      if (obj.id === id && (lane === undefined || obj.lane === lane)) return obj;
    }
  } finally {
    rl.close();
  }
  return undefined;
}

async function main() {
  const stage = process.argv[2] ?? "identity";
  const limitArg = process.argv.includes("--limit")
    ? Number(process.argv[process.argv.indexOf("--limit") + 1])
    : 3;
  const limit = Number.isFinite(limitArg) ? limitArg : 3;

  mkdirSync(OUT_DIR, { recursive: true });

  for (const f of [DUMP_DB, CAPTURE_DECK_DB, MANIFEST_JSON, VIEW_LANE_DIR]) {
    if (!existsSync(f)) {
      console.error(`REFUSAL: ground-truth copy missing: ${f}`);
      console.error("The instrument runs on COPIES staged in this worktree only.");
      process.exit(2);
    }
  }

  if (stage === "identity") return identityStage(limit);
  if (stage === "verdict") return verdictStage();
  console.error(`unknown stage: ${stage} (use identity | verdict)`);
  process.exit(2);
}

async function identityStage(limit) {
  const report = { stage: "identity", generatedAt: new Date().toISOString(), limit };

  // ---- 1. PROVENANCE GATE ------------------------------------------------
  const manifest = JSON.parse(readFileSync(MANIFEST_JSON, "utf8"));
  const captureSha = await sha256File(CAPTURE_DECK_DB);
  const manifestSha = manifest.corpusSha256.after;
  if (captureSha !== manifestSha) {
    console.error(
      `PROVENANCE REFUSAL: capture deck sha ${captureSha} differs from the ` +
        `manifest-frozen corpus ${manifestSha} — refusing to re-photograph ` +
        `against a different deck (refusal class of tools/capture-and-grade.mjs:124).`,
    );
    process.exit(4);
  }
  const dumpSha = await sha256File(DUMP_DB);
  report.provenance = {
    captureDeckSha256: captureSha,
    manifestCorpusSha256: manifestSha,
    captureDeckMatchesManifest: true,
    manifestChangeCounter: manifest.sqliteHeaderChangeCounter,
    dumpSha256: dumpSha,
    dumpMatchesRecordedTriageSha: dumpSha === RECORDED_DUMP_SHA256,
    note:
      "dump mismatch vs the recorded triage sha is a warning (a different dump " +
      "generation), never silently accepted as capture-time state",
  };
  console.log(
    `provenance: OK — capture deck matches manifest ${captureSha.slice(0, 12)}…; ` +
      `dump ${dumpSha.slice(0, 12)}… (${report.provenance.dumpMatchesRecordedTriageSha ? "matches" : "DIFFERS from"} recorded triage sha)`,
  );

  // ---- 2. RESTORE-IDENTITY PROOF ----------------------------------------
  // Both sides are this worktree's COPIES. The dump copy is opened readonly;
  // the capture-deck copy is ATTACHed so SQLite does the set algebra.
  const dump = new Database(DUMP_DB, { readonly: true });
  dump.exec(`ATTACH DATABASE '${CAPTURE_DECK_DB.replace(/\\/g, "/")}' AS cap`);
  const identity = { structuralDiffRows: [], structuralDiffCount: 0, referenceDiffCount: 0, referenceKeyOnlyDiffCount: 0, familyCensus: {} };

  // full structural equality: EXCEPT both directions over the common columns.
  // (created_at/updated_at are rebuild clocks on both sides — excluded.)
  const structuralExcept = dump
    .prepare(
      `SELECT id, type_id, trash, left_id, right_id, codename FROM cards
       EXCEPT
       SELECT id, type_id, trash, left_id, right_id, codename FROM cap.cards`,
    )
    .all();
  const structuralExceptReverse = dump
    .prepare(
      `SELECT id, type_id, trash, left_id, right_id, codename FROM cap.cards
       EXCEPT
       SELECT id, type_id, trash, left_id, right_id, codename FROM cards`,
    )
    .all();
  identity.structuralDiffCount = structuralExcept.length + structuralExceptReverse.length;
  identity.structuralDiffRows = [...structuralExcept, ...structuralExceptReverse].slice(0, 20);
  const dumpCount = dump.prepare("SELECT count(*) n FROM cards").get().n;
  const capCount = dump.prepare("SELECT count(*) n FROM cap.cards").get().n;
  identity.rowCounts = { dump: dumpCount, captureDeck: capCount };

  // full reference-graph equality on ids+type+presence, and separately on the
  // referee_key strings (a scrubbed name field would differ there alone).
  identity.referenceDiffCount = dump
    .prepare(
      `SELECT count(*) n FROM (
         SELECT referer_id, referee_id, ref_type, is_present FROM card_references
         EXCEPT
         SELECT referer_id, referee_id, ref_type, is_present FROM cap.card_references
       )`,
    )
    .get().n +
    dump
      .prepare(
        `SELECT count(*) n FROM (
           SELECT referer_id, referee_id, ref_type, is_present FROM cap.card_references
           EXCEPT
           SELECT referer_id, referee_id, ref_type, is_present FROM card_references
         )`,
      )
      .get().n;
  identity.referenceKeyOnlyDiffCount = dump
    .prepare(
      `SELECT count(*) n FROM (
         SELECT referer_id, referee_id, referee_key, ref_type, is_present FROM card_references
         EXCEPT
         SELECT referer_id, referee_id, referee_key, ref_type, is_present FROM cap.card_references
       )`,
    )
    .get().n;

  // family census: per finding, dump vs capture deck side by side.
  for (const [family, ids] of Object.entries(FAMILY_IDS)) {
    identity.familyCensus[family] = ids.map((id) => ({
      id,
      dump: dump
        .prepare(
          "SELECT name, type_id, trash, left_id, right_id, codename, length(content) content_len FROM cards WHERE id = ?",
        )
        .get(id) ?? null,
      captureDeck: dump
        .prepare(
          "SELECT name, type_id, trash, left_id, right_id, codename, length(content) content_len FROM cap.cards WHERE id = ?",
        )
        .get(id) ?? null,
    }));
  }

  identity.verdict =
    identity.structuralDiffCount === 0 && identity.referenceDiffCount === 0
      ? "EXACT — capture-time STRUCTURE (rows + reference graph) is provably the dump's structure; the dump is the only real-name/real-content capture-row witness; the capture deck is scrubbed (names/contents randomized, timestamps are rebuild clocks)"
      : "DIVERGED — the capture deck carries structural rows the dump lacks (or vice versa): the divergent rows are the capture-state fingerprint and any entry touching them is re-photographable (flip-oracle class)";
  console.log(`restore-identity: ${identity.verdict}`);
  console.log(
    `  rows dump/cap ${dumpCount}/${capCount}; structural diff ${identity.structuralDiffCount}; ` +
      `reference-graph diff (ids) ${identity.referenceDiffCount}; referee_key-string-only diff ${identity.referenceKeyOnlyDiffCount}`,
  );
  report.identity = identity;

  // ---- 3. ENTRY RESOLUTION ----------------------------------------------
  const entries = ENTRIES.map((e) => {
    const out = { ...e };
    if (out.name === null) out.name = composeName(dump, out.id);
    return out;
  });
  const unresolved = entries.filter((e) => e.name === null);
  if (unresolved.length > 0) {
    console.error(
      `REFUSAL: could not compose names for entries: ${unresolved.map((u) => u.id).join(", ")}`,
    );
    process.exit(3);
  }

  // oracle shard location + per-shard sha verification against the manifest
  for (const e of entries) {
    if (e.oracleShard === null) continue;
    const dir = e.lane === "page" ? PAGE_LANE_DIR : VIEW_LANE_DIR;
    const shardPath = path.join(dir, e.oracleShard);
    if (!existsSync(shardPath)) {
      console.error(`REFUSAL: oracle shard copy missing: ${shardPath}`);
      process.exit(2);
    }
    const shardSha = await sha256File(shardPath);
    const manifestShaForShard = manifest.shards[e.lane]?.[e.oracleShard];
    e.oracleShardShaVerified =
      manifestShaForShard === undefined ? "not-in-manifest" : shardSha === manifestShaForShard;
    const entry0 = await readShardEntry(shardPath, e.id, e.lane);
    e.oraclePresent = entry0 !== undefined;
    e.oracleByteLength =
      entry0 === undefined
        ? 0
        : e.view === "page_html"
          ? (entry0.page_html ?? "").length
          : (entry0.views?.[e.view] ?? "").length;
  }

  // unmeasured-absence re-check: the 11 remaining unmeasured TPR rows must
  // appear as ENTRIES (id+lane match after JSON parse) in NO view-lane shard.
  const shardFiles = readdirSync(VIEW_LANE_DIR).filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f));
  const unmeasuredSet = new Set(UNMEASURED_TPR_SET_IDS);
  const absence = Object.fromEntries(UNMEASURED_TPR_SET_IDS.map((id) => [id, 0]));
  const idMarkers = UNMEASURED_TPR_SET_IDS.map((id) => `"id":${id},`);
  for (const f of shardFiles) {
    const text = readFileSync(path.join(VIEW_LANE_DIR, f), "utf8");
    for (const line of text.split("\n")) {
      if (!idMarkers.some((m) => line.includes(m))) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.lane === "view" && unmeasuredSet.has(obj.id)) absence[obj.id] += 1;
    }
  }
  report.unmeasuredAbsence = absence;
  const absentAll = Object.values(absence).every((n) => n === 0);
  console.log(
    `unmeasured-absence: ${absentAll ? `CONFIRMED — none of the ${UNMEASURED_TPR_SET_IDS.length} remaining unmeasured rows appears as a view-lane entry` : "BROKEN — some rows DO appear as entries: " + JSON.stringify(absence)}`,
  );

  // ---- 4. ENTRIES ARTIFACT + RENDER-STAGE COMMAND ------------------------
  const selected = limit === 0 ? entries : entries.slice(0, limit);
  writeFileSync(
    path.join(OUT_DIR, "rephoto-entries.json"),
    JSON.stringify({ generatedAt: report.generatedAt, limit, identityVerdict: identity.verdict, entries: selected }, null, 2),
  );
  writeFileSync(path.join(OUT_DIR, "rephoto-identity.json"), JSON.stringify(report, null, 2));
  console.log(`entries artifact: ${path.join(OUT_DIR, "rephoto-entries.json")} (${selected.length} of ${entries.length} entries)`);
  console.log("");
  console.log("RENDER STAGE (sub-minute, through the machine test queue only):");
  console.log(
    `  node tools/test-queue/submit-test-job.mjs --name rephoto-render --cwd ${REPO_ROOT} --cmd "set REPHOTO_ENTRIES_RENDER=1&& npx vitest run tests/card/render/re-photograph-entry-replay.test.ts" --timeout-min 3`,
  );
  if (limit !== 0) {
    console.log("");
    console.log(
      "BULK RUN (all 18 entries) IS OPERATOR-GATED — do not fire without the operator's yes:",
    );
    console.log("  step 1 (rewrite the entries artifact at full scope):");
    console.log(
      `    node tools/test-queue/submit-test-job.mjs --name rephoto-identity-bulk --cwd ${REPO_ROOT} --cmd "node tools/oracle/re-photograph-entries.mjs identity --limit 0" --timeout-min 1`,
    );
    console.log("  step 2 (render all entries):");
    console.log(
      `    node tools/test-queue/submit-test-job.mjs --name rephoto-render-bulk --cwd ${REPO_ROOT} --cmd "set REPHOTO_ENTRIES_RENDER=1&& npx vitest run tests/card/render/re-photograph-entry-replay.test.ts" --timeout-min 3`,
    );
    console.log("  step 3 (verdicts):");
    console.log(
      `    node tools/test-queue/submit-test-job.mjs --name rephoto-verdict-bulk --cwd ${REPO_ROOT} --cmd "node tools/oracle/re-photograph-entries.mjs verdict" --timeout-min 1`,
    );
  }
  dump.close();
}

async function verdictStage() {
  const identityPath = path.join(OUT_DIR, "rephoto-identity.json");
  const renderedPath = path.join(OUT_DIR, "re-rendered.jsonl");
  if (!existsSync(identityPath) || !existsSync(renderedPath)) {
    console.error("REFUSAL: run the identity stage and the render stage first.");
    process.exit(2);
  }
  const identityReport = JSON.parse(readFileSync(identityPath, "utf8"));
  const entriesArtifact = JSON.parse(readFileSync(path.join(OUT_DIR, "rephoto-entries.json"), "utf8"));
  const rendered = readFileSync(renderedPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));

  const identityExact = identityReport.identity.verdict.startsWith("EXACT");
  const dump = new Database(DUMP_DB, { readonly: true });

  const verdicts = rendered.map((r) => {
    const entry = entriesArtifact.entries.find((e) => e.key === r.key);
    let verdict;
    if (entry.finding === "tpr-unmeasured") {
      verdict = "FIRST-MEASUREMENT — no oracle bytes exist for this row in any capture shard (re-verified by the identity stage); the render is the first measurement of what gem-as-written on capture-time rows produces";
    } else if (r.equal) {
      verdict = "ENGINE-RIGHT-ALREADY — re-rendered bytes equal the oracle bytes; close";
    } else if (identityExact) {
      verdict =
        "CAPTURE-RUNTIME-BOUND — restore-identity is EXACT (capture-time rows provably equal the dump's rows; the scrubbed capture deck cannot witness content state), so the divergence cannot be produced or fixed from any deck state on this machine: it lives in the capture runtime (env/mods/file state). Flipping the oracle bytes without new runtime evidence would be yardstick-fitting";
    } else {
      const familyIds = Object.values(FAMILY_IDS).flat();
      const touchesEntry = identityReport.identity.structuralDiffRows.some(
        (row) => Array.isArray(row) && familyIds.includes(row[0]),
      );
      verdict = touchesEntry
        ? "CAPTURE-DECK-DIVERGENCE — the identity proof found structural rows the dump lacks and this entry's family touches them: the oracle bytes may be faithful to a deck state the dump does not carry; the re-photograph flip (regenerate oracle from the restored state) is the resolution path"
        : "CAPTURE-RUNTIME-BOUND (identity diverged, but not on this entry's family)";
    }
    return { key: r.key, finding: entry.finding, name: r.name, id: r.id, lane: r.lane, equal: r.equal, oracleByteLength: entry.oracleByteLength, renderedByteLength: r.renderedByteLength, firstDiffOffset: r.firstDiffOffset ?? null, renderError: r.renderError ?? null, census: r.census ?? null, verdict };
  });

  dump.close();
  const out = {
    stage: "verdict",
    generatedAt: new Date().toISOString(),
    identityVerdict: identityReport.identity.verdict,
    verdicts,
    decisionRule: {
      "equal": "ENGINE-RIGHT-ALREADY (close)",
      "unequal + identity EXACT": "CAPTURE-RUNTIME-BOUND (no oracle flip from deck state; capture runtime owns the divergence)",
      "unequal + identity DIVERGED on entry's family": "CAPTURE-DECK-DIVERGENCE (re-photograph flip path opens)",
      "no oracle bytes": "FIRST-MEASUREMENT (unmeasured p22 rows)",
    },
  };
  writeFileSync(path.join(OUT_DIR, "rephoto-verdict.json"), JSON.stringify(out, null, 2));
  for (const v of verdicts) {
    console.log(`${v.key} [${v.lane}] equal=${v.equal} -> ${v.verdict.split(" — ")[0]}`);
  }
  console.log(`verdict artifact: ${path.join(OUT_DIR, "rephoto-verdict.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
