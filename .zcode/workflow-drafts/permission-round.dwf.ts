// Permission round: the permission family is now 58% of all remaining
// corpus render failures (rule_count_mismatch 4,521 + permission_denied
// 2,146 + Card sentinel 3,828 + Date 834 of 13,454 total after famfix48,
// commit 2b22fcd). The previous batch's permission lane DIAGNOSED the seam
// but did not prove its fix in-round (honest revert); that diagnosis is
// injected below. Second lane takes the new ~1,399-view unclassified
// structure bucket (expected "\n" got "<": an extra wrapper emitted where
// the oracle ends the element).

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

const SLICE_CONTRACT = [
  "SLICE REPLAY CONTRACT (run with your own shell tools):",
  "  CORPUS_PREWARM=1 CORPUS_SHARDS=<your 3-5 comma-separated shard files> \\",
  "  CORPUS_SLICE_TAG=<familytag> CORPUS_RESUME=1 NODE_OPTIONS=--max-old-space-size=4096 \\",
  "  node node_modules/vitest/vitest.mjs run --root . benchmarks/corpus-v2/replay-shard.test.ts",
  "Baseline: reuse the matching famfix48 per-shard outcomes in benchmarks/results/corpus-v2/",
  "(replay-shard-outcomefamfix48-*.json) for your shards - the engine state that produced",
  "them is exactly commit 2b22fcd, your starting point. NEVER run all 48 shards; the lead",
  "owns that measurement. No git commits - the lead integrates. No deploys, no wrangler",
  "--remote, no process kills, no cron. Corpus data is sanitized; keep it that way.",
].join("\n");

const PERSONA =
  "You are a parity engineer on the decko-ts TypeScript port of Ruby Decko. Every claim carries a file:line cite. " +
  "You never report a check you did not run, and you escalate plainly if a gate cannot pass. " +
  "The corpus (benchmarks/corpus-v2/) is sanitized, content-free structure; keep it that way and never introduce " +
  "real deck content. The Ruby truth lives in the vendored prototype/ tree and fixtures/captured/. " +
  "If your instructions turn out to contradict each other or a check is impossible, escalate and say so rather than working around it.";

const laneAgents: Record<string, Agent> = {};
for (const name of ["permission-lane", "structure-lane"]) {
  laneAgents[name] = agent(name, { system: PERSONA });
}

// Node<T> is PromiseLike (no .catch); the try/catch lives here around the
// await instead. The .ask call stays direct and sited.
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
  title: "Permission round ledger",
  columns: [
    { field: "family", label: "Family" },
    { field: "stage", label: "Stage" },
    { field: "proof", label: "Slice proof" },
  ],
  key: "family",
});

phase("Diagnose the permission seam and the structure bucket in parallel");

const PERMISSION_DIAGNOSIS =
  "The previous round's permission lane diagnosed (quote): 'invert the prepareSearches ordering so " +
  "Search/Date BadQuery/Date::Error raise BEFORE the deny-skip; either move ensureVerdicts AFTER ...' " +
  "(truncated in the ledger - re-derive the full statement yourself; the seam is in src/card/render.ts " +
  "prepareSearches/ensureVerdicts/ensureReadPermission ordering, compare with Ruby's " +
  "format.rb prepare/render short-circuit order in the vendored prototype/ tree). Corroborating corpus-wide " +
  "movement after famfix48 (commit 2b22fcd): rule_count_mismatch 2609 -> 4521 (engine renders 140 default " +
  "rules where oracle shows 49 - the read-rule universe the engine sees differs from the oracle's), " +
  "permission_denied_sentinel 927 -> 2146, Card sentinel 3233 -> 3828. Your job: verify that diagnosis " +
  "against the current code, complete it into a full mechanism (including WHY the default-rule count " +
  "differs: which rules the oracle's universe has that ours lacks, and where the seeding must get them), " +
  "and plan the minimal ordering + seeding fix.";

const diagnosisAsks: Array<{ lane: string; family: string; ask: string }> = [
  {
    lane: "permission-lane",
    family: "permission family (~10.3k views)",
    ask:
      `Your family: the permission family, now ~58% of remaining render failures (~10,329 of 13,454 after famfix48). ${PERMISSION_DIAGNOSIS}\n\n${SLICE_CONTRACT}\n\n` +
      "DIAGNOSE ONLY in this step: read src/card/render.ts prepare/verdict/permission ordering and the " +
      "vendored Ruby format.rb until the mechanism is stated with file:line cites and a concrete fix plan. " +
      "Choose a 3-5 shard proof slice from the famfix48 per-shard outcomes where your family's buckets " +
      "(rule_count_mismatch at corpus:87/88, permission_denied at corpus:88, Card sentinel at corpus:77) are " +
      "heavily represented. Do not edit any file in this step.",
  },
  {
    lane: "structure-lane",
    family: "unclassified structure bucket (~1.4k views)",
    ask:
      `Your family: the new unclassified structure bucket, ~1,399+ views after famfix48 (signature "unclassified:L/~/exp=\\n/act=<" - expected a newline where we emit a tag start; representative corpus:77:render:content). Working hypothesis: an extra wrapper/div is emitted where the oracle closes the element - possibly fallout or a sibling of the pointer-list module change (aea5797) or the image-content branch. Classify these failures properly (extend tools/corpus-failure-classes/classify-render-realfails.mjs with the new signature so the family is named), pick 5-10 failing entries from benchmarks/results/corpus-v2/replay-full-resultsfamfix48.json real_failures excerpts, read the exact byte context, identify the mechanism with file:line cites, and plan the fix. ${SLICE_CONTRACT}\n\n` +
      "DIAGNOSE ONLY in this step; do not edit any file except possibly the classifier's signature list.",
  },
];

const diagnoses = await Promise.all(
  diagnosisAsks.map(async (spec) => {
    const diagnosis = await laneAgents[spec.lane].ask<Diagnosis>(spec.ask);
    report({ family: spec.family, stage: "diagnosed", proof: diagnosis.plan.slice(0, 200) }, "ledger");
    log(`${spec.lane}: ${diagnosis.mechanism.slice(0, 160)}...`);
    return { lane: spec.lane, family: spec.family, diagnosis };
  }),
);

for (const d of diagnoses) {
  log(`${d.lane}: ${d.diagnosis.mechanism.slice(0, 160)}...`);
  report({ family: d.family, stage: "diagnosed", proof: d.diagnosis.plan.slice(0, 200) }, "ledger");
}

phase("Fix each family and prove it on its shard slice");

const laneResults: LaneResult[] = await Promise.all(
  diagnoses.map(({ lane, family, diagnosis }) =>
    runLane(
      lane,
      `Your diagnosis (from the previous step): ${JSON.stringify(diagnosis)}\n\n` +
        `IMPLEMENT your fix plan now, then PROVE it on your proof slice (${diagnosis.proofShards}) using the SLICE REPLAY CONTRACT:\n${SLICE_CONTRACT}\n\n` +
        "Rules: fix the mechanism, not the symptom — no per-card special cases. Pin the byte-level fix with a fixture " +
        "test in tests/card/ following the existing pin style. Run the affected vitest suites (render/mod-loader trees) " +
        "and make them green; whole-tree tsc must stay clean (node node_modules/typescript/lib/tsc.js --noEmit). " +
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

phase("Gate the whole tree with node-direct commands");

// world.run cannot spawn .cmd shims (npx ENOENT on Windows without a shell):
// invoke node entry points directly.
const tscGate = await world.run("node", ["node_modules/typescript/lib/tsc.js", "--noEmit"], {
  timeoutMs: 300000,
});
const renderGate = await world.run(
  "node",
  ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", "tests/card/render/", "tests/card/mod-loader/"],
  { timeoutMs: 900000 },
);

let repairNotes = "gates green, no repair round needed";
if (tscGate.exitCode !== 0 || renderGate.exitCode !== 0) {
  const failing = [
    tscGate.exitCode !== 0 ? `tsc:\n${(tscGate.stderr + tscGate.stdout).slice(-4000)}` : "",
    renderGate.exitCode !== 0
      ? `render/mod-loader suites:\n${(renderGate.stderr + renderGate.stdout).slice(-4000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  laneAgents["gate-repairer"] = agent("gate-repairer", { system: PERSONA });
  const repair = await runLane(
    "gate-repairer",
    `The post-landing gates failed. Fix ONLY what the gate output shows, keeping every lane's proof intact:\n${failing}\n\n` +
      `Report what you changed and re-run the failing gates yourself to confirm.`,
  );
  repairNotes = `${repair.status}: ${repair.change}`;
}

const landed = laneResults.filter((r) => r.status === "landed").length;
const ledgerMd = [
  "# Permission round ledger",
  "",
  `Lanes landed: ${landed}/${laneResults.length}. Repair: ${repairNotes}`,
  `Gates: tsc ${tscGate.exitCode}, render/mod-loader ${renderGate.exitCode}.`,
  "",
  ...laneResults.map(
    (r) => `## ${r.family} — ${r.status}\n\n- change: ${r.change}\n- proof: ${r.proof}\n- notes: ${r.notes}\n`,
  ),
  "",
  "The lead runs the single full-48 famfix-baseline re-measure after integrating; per-lane slice numbers",
  "above are provisional until that aggregate lands.",
].join("\n");

await artifact.markdown("permission-ledger", ledgerMd, {
  title: "Permission round ledger",
  description: "The permission seam and the structure bucket: diagnosis, fix, slice proof.",
  primary: true,
});

return {
  conclusion:
    `${landed}/${laneResults.length} lanes landed; the tree gates (tsc ${tscGate.exitCode}, ` +
    `render ${renderGate.exitCode}); repair: ${repairNotes}.`,
  findings: laneResults,
  verified: [
    "each landed lane ran its slice replay before/after and quoted real numbers",
    `whole-tree tsc exit ${tscGate.exitCode} (node-direct, not npx)`,
    `render+mod-loader suites exit ${renderGate.exitCode}`,
  ],
  notCovered: [
    "full-48 aggregate — deliberately the lead's single post-integration measurement",
    "families a lane marked diagnosed-only or blocked are not proven fixes",
  ],
};
