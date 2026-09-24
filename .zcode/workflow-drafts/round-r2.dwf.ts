// Round R2: four lanes at the remaining 12,507 render failures (permfix48,
// commit 0439e7d) + the 4,151 structure-pending records. Two named structure
// buckets, the deep permission family (diagnosis-first — two shallow attacks
// have already been disproven, the deny-skip is CORRECT Ruby semantics), and
// the records side. Lead gates + full-48 after integration.

interface Diagnosis {
  /** The mechanism: why the family fails, one tight paragraph with file:line cites. */
  mechanism: string;
  /** The fix plan: files to change and what the oracle actually does differently. */
  plan: string;
  /** Proof slice: 3-5 shard names, e.g. "shard-000000.jsonl,shard-000003.jsonl". */
  proofShards: string;
  /** Why these shards are a healthy sample of the family. */
  expectedOnSlice: string;
}

interface LaneResult {
  /** Which family this lane took. */
  family: string;
  /** One sentence: what changed in the engine (or why nothing changed). */
  change: string;
  /** Real before/after numbers on the proof slice, quoted from replay output. */
  proof: string;
  /** "landed" = fix proven on the slice; "diagnosed-only" = mechanism found, fix not proven; "blocked" = could not diagnose. */
  status: "landed" | "diagnosed-only" | "blocked";
  /** Honest notes: what is unproven, what the next round needs. */
  notes: string;
}

interface WorkflowReport {
  conclusion: string;
  findings: LaneResult[];
  verified: string[];
  notCovered: string[];
}

const REPO = "C:/localProjects/decko-ts";

const SLICE_CONTRACT = [
  "SLICE REPLAY CONTRACT (run with your own shell tools, FROM " + REPO + "):",
  "  CORPUS_PREWARM=1 CORPUS_SHARDS=<your 3-5 comma-separated shard files> \\",
  "  CORPUS_SLICE_TAG=<familytag> CORPUS_RESUME=1 NODE_OPTIONS=--max-old-space-size=4096 \\",
  "  node node_modules/vitest/vitest.mjs run --root . benchmarks/corpus-v2/replay-shard.test.ts",
  "Baseline: reuse the matching permfix48 per-shard outcomes in benchmarks/results/corpus-v2/",
  "(replay-shard-outcomepermfix48-*.json) — the engine state that produced them is exactly",
  "commit 0439e7d, your starting point. NEVER run all 48 shards; the lead owns that",
  "measurement. No git commits — the lead integrates. No deploys, no wrangler --remote,",
  "no process kills, no cron. Corpus data is sanitized; keep it that way.",
].join("\n");

const PERSONA =
  "You are a parity engineer on the decko-ts TypeScript port of Ruby Decko. Every claim carries a file:line cite. " +
  "You never report a check you did not run, and you escalate plainly if a gate cannot pass. " +
  "The corpus (benchmarks/corpus-v2/) is sanitized, content-free structure; keep it that way and never introduce " +
  "real deck content. The Ruby truth lives in the vendored prototype/ tree and fixtures/captured/. " +
  "If your instructions turn out to contradict each other or a check is impossible, escalate and say so rather than working around it.";

const laneAgents: Record<string, Agent> = {};
for (const name of ["corpus755-lane", "corpus6551-lane", "permission-deep-lane", "records-lane"]) {
  laneAgents[name] = agent(name, { system: PERSONA });
}

// Node<T> is PromiseLike (no .catch); the try/catch lives here around the
// await. The .ask call stays direct and sited.
async function runLane(laneName: string, instructions: string): Promise<LaneResult> {
  try {
    return await laneAgents[laneName].ask<LaneResult>(instructions);
  } catch (error) {
    return {
      family: laneName,
      change: `lane failed: ${String(error).slice(0, 200)}`,
      proof: "none — lane errored before proving",
      status: "blocked",
      notes: "see lane error",
    };
  }
}

artifact.table("ledger", {
  title: "Round R2 ledger",
  columns: [
    { field: "family", label: "Family" },
    { field: "stage", label: "Stage" },
    { field: "proof", label: "Slice proof" },
  ],
  key: "family",
});

const diagnosisAsks: Array<{ lane: string; family: string; ask: string }> = [
  {
    lane: "corpus755-lane",
    family: "structure bucket corpus:755 (~2,308 views)",
    ask:
      "Your family: the unclassified bucket 'unclassified:L/~/exp=</act=\\n' (~2,308 views in " +
      "tools/corpus-failure-classes/failure-buckets-permfix48.json, representative corpus:755:render:content). " +
      "Signature direction: the ORACLE has a '<' (tag start) where WE emit a newline — the opposite direction " +
      "of the pointer-list trailing-newline fix (489a22c), so suspect a sibling template where Ruby emits an " +
      "element our port replaces with whitespace (or vice versa: our newline sits where Ruby opens a tag). " +
      "Pick 5-10 failing entries from benchmarks/results/corpus-v2/replay-full-resultspermfix48.json " +
      "real_failures with this signature, read the exact byte context on both sides, identify the Ruby element " +
      "and our divergent template with file:line cites, plan the minimal fix. " +
      "DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "corpus6551-lane",
    family: "structure bucket corpus:6551 (~2,270 views)",
    ask:
      "Your family: the unclassified bucket 'unclassified:L/~/exp=c/act=i' (~2,270 views in " +
      "tools/corpus-failure-classes/failure-buckets-permfix48.json, representative corpus:6551:render:open). " +
      "Single-character first-difference (expected 'c', got 'i'). Working question from the previous round: is " +
      "this a REAL divergence or the predicted first-difference repositioning after the 489a22c byte shift " +
      "(i.e. these views were already failing for a deeper reason and their first diff moved)? Settle that " +
      "question FIRST: if re-signatured, name the underlying mechanism (which may be shared with the " +
      "permission family); if real, identify the exact character-level divergence. " +
      "Pick 5-10 entries from benchmarks/results/corpus-v2/replay-full-resultspermfix48.json real_failures. " +
      "DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "permission-deep-lane",
    family: "permission family (~7,232 views: Card sentinel 3,765, permission_denied 2,633, Date 834)",
    ask:
      "Your family is the deep one, and TWO shallow attacks are already DISPROVEN — read their record before " +
      "planning: (1) 'invert prepareSearches ordering' was WRONG — the deny-skip in prepareSearches is correct " +
      "Ruby semantics: view/permission.rb:46-50 #denial wraps the rendered view BEFORE view_method " +
      "(render.rb:87-89) dispatches to cql_search.rb; corpus:95 (a denied Search card with read_rule_id=NULL) " +
      "proves it. The corrected comment citing this lives in src/card/render.ts (~line 269). (2) The " +
      "help-popover read_rules_hash filter (489a22c) killed rule_count_mismatch corpus-wide but permission_denied " +
      "GREW +487 (help-rules re-prepare cycle on partial seeds produces different setKeys through the deny " +
      "verdict walk). Your job: (a) diagnose the permission_denied +487 growth mechanism (the re-prepare cycle), " +
      "(b) diagnose the REAL mechanism behind the capture_error_not_raised:Card/Date sentinels — the engine " +
      "renders output where the oracle captured CAPTURE_ERROR — suspect the closureWarm typeCode gate " +
      "(src/card/render.ts ~line 1131) or the Search prepare-walk path, using corpus:77/101/268 representatives. " +
      "Ground every step in the vendored Ruby (prototype/) before proposing code changes. " +
      "DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "records-lane",
    family: "structure-pending records (4,151 of 47,131)",
    ask:
      "Your family is the RECORDS side: 4,151 of 47,131 card records end 'structurePending' instead of " +
      "pass/realFail in every full-48 run (see the aggregates in benchmarks/results/corpus-v2/). These are " +
      "records where the replay could not yet compare structure — find out exactly why: read the replay driver " +
      "(benchmarks/corpus-v2/replay-shard.test.ts + its record path) and the prior 'structure-pending' " +
      "classification notes, enumerate the pending classes with counts (a small classification script under " +
      "benchmarks/ or tools/ is fine to write), and identify the largest class's mechanism. If the largest " +
      "class is a quick unblock (e.g. a missing seeded structure the driver can compute), plan that fix; if it " +
      "is deep, the deliverable is the named-class breakdown with mechanisms and a recommended attack order. " +
      "DIAGNOSE ONLY in this step; do not edit engine files.",
  },
];

phase("Diagnose the two structure buckets, the deep permission family, and the records pile");

const diagnoses = await Promise.all(
  diagnosisAsks.map(async (spec) => {
    const diagnosis = await laneAgents[spec.lane].ask<Diagnosis>(spec.ask);
    report({ family: spec.family, stage: "diagnosed", proof: diagnosis.plan.slice(0, 200) }, "ledger");
    log(`${spec.lane}: ${diagnosis.mechanism.slice(0, 160)}...`);
    return { lane: spec.lane, family: spec.family, diagnosis };
  }),
);

phase("Fix each family and prove it on its shard slice");

const laneResults: LaneResult[] = await Promise.all(
  diagnoses.map(({ lane, family, diagnosis }) =>
    runLane(
      lane,
      `Your diagnosis (from the previous step): ${JSON.stringify(diagnosis)}\n\n` +
        `IMPLEMENT your fix plan now, then PROVE it on your proof slice (${diagnosis.proofShards}) using the SLICE REPLAY CONTRACT:\n${SLICE_CONTRACT}\n\n` +
        "Rules: fix the mechanism, not the symptom — no per-card special cases. Pin the byte-level fix with a fixture " +
        "test in tests/card/ following the existing pin style. Run the affected vitest suites (render/mod-loader trees) " +
        "and make them green; whole-tree tsc must stay clean: node C:/localProjects/decko-ts/node_modules/typescript/lib/tsc.js --noEmit -p C:/localProjects/decko-ts/tsconfig.json. " +
        "Quote the REAL before/after numbers in proof. " +
        "If the fix does not improve the slice, do not thrash: revert your engine change, set status to " +
        "'diagnosed-only', and write the mechanism honestly in notes.",
    ).then((r) => {
      const withFamily: LaneResult = { ...r, family };
      report({ family, stage: withFamily.status, proof: withFamily.proof.slice(0, 200) }, "ledger");
      return withFamily;
    }),
  ),
);

phase("Write the ledger; the lead gates and runs the full-48");

const landed = laneResults.filter((r) => r.status === "landed").length;
const ledgerMd = [
  "# Round R2 ledger",
  "",
  `Lanes landed: ${landed}/${laneResults.length}.`,
  "",
  ...laneResults.map(
    (r) => `## ${r.family} — ${r.status}\n\n- change: ${r.change}\n- proof: ${r.proof}\n- notes: ${r.notes}\n`,
  ),
  "",
  "The lead runs the tree gates and the single full-48 re-measure after integrating.",
].join("\n");

await artifact.markdown("r2-ledger", ledgerMd, {
  title: "Round R2 ledger",
  description: "Two structure buckets, the deep permission family, and the records pile: diagnosis, fix, slice proof.",
  primary: true,
});

return {
  conclusion:
    `${landed}/${laneResults.length} lanes landed; the lead gates and measures the full-48 next. ` +
    `Diagnosis quality bar: every mechanism carries file:line cites; every refusal is honest.`,
  findings: laneResults,
  verified: [
    "each landed lane ran its slice replay before/after and quoted real numbers",
  ],
  notCovered: [
    "tree gates + full-48 aggregate — deliberately the lead's post-integration steps",
    "families a lane marked diagnosed-only or blocked are not proven fixes",
  ],
};
