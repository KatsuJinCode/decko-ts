// Round R3: the permission wave. After r2fix48 (commit 16183fd) the
// remaining render mass is 91% one family:
//   capture_error_not_raised:Card  4,894
//   permission_denied_sentinel     4,155
//   capture_error_not_raised:Date  1,066
// plus small residue. Four lanes with DISJOINT file ownership; slice replays
// are serialized through a lock file (concurrent replays corrupted shared
// seed state in R2 and produced phantom Date::Error storms).

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
  "  CORPUS_SLICE_TAG=<familytag> CORPUS_RESUME=1 NODE_OPTIONS=--max-old-space-size=6144 \\",
  "  node node_modules/vitest/vitest.mjs run --root . benchmarks/corpus-v2/replay-shard.test.ts",
  "SERIALIZATION (mandatory - concurrent replays corrupt shared seed state; R2 lost a round to it):",
  "  while ! mkdir tmp/slice-replay.lock 2>/dev/null; do sleep 20; done",
  "  ...run your replay...",
  "  rm -rf tmp/slice-replay.lock",
  "Baseline: reuse the matching r2fix48 per-shard outcomes in benchmarks/results/corpus-v2/",
  "(replay-shard-outcomer2fix48-*.json) - the engine state that produced them is exactly",
  "commit 16183fd, your starting point. NEVER run all 48 shards; the lead owns that",
  "measurement. No git commits - the lead integrates. No deploys, no wrangler --remote,",
  "no process kills, no cron. Corpus data is sanitized; keep it that way.",
].join("\n");

const PERSONA =
  "You are a parity engineer on the decko-ts TypeScript port of Ruby Decko. Every claim carries a file:line cite. " +
  "You never report a check you did not run, and you escalate plainly if a gate cannot pass. " +
  "The corpus (benchmarks/corpus-v2/) is sanitized, content-free structure; keep it that way and never introduce " +
  "real deck content. The Ruby truth lives in the vendored prototype/ tree and fixtures/captured/. " +
  "If your instructions turn out to contradict each other or a check is impossible, escalate and say so rather than working around it.";

const laneAgents: Record<string, Agent> = {};
for (const name of ["searchdate-lane", "denied-universe-lane", "records-lane", "tooling-lane"]) {
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
  title: "Round R3 ledger",
  columns: [
    { field: "family", label: "Family" },
    { field: "stage", label: "Stage" },
    { field: "proof", label: "Slice proof" },
  ],
  key: "family",
});

const diagnosisAsks: Array<{ lane: string; family: string; own: string; ask: string }> = [
  {
    lane: "searchdate-lane",
    family: "Search/Date capture sentinels (Card 4,894 + Date 1,066)",
    own: "YOU OWN: src/card/render.ts (Search/Date prepare + closureWarm gate paths). Other lanes own permissions/, seeding, tests storage, tools/.",
    ask:
      "Family signature: the oracle captured CAPTURE_ERROR (Card::Error::BadQuery 'Invalid JS...' for Search cards, Date::Error for Date cards) but our engine renders real output. DISPROVEN approaches you must NOT repeat: (1) inverting the prepareSearches deny-skip - WRONG, the deny-skip is correct Ruby semantics (view/permission.rb:46-50 wraps the view BEFORE view_method dispatches; corpus:95 proves it; comment in src/card/render.ts ~line 269 cites the proof); (2) broadening the Search/Date walk over the whole prefetch reach - a 17x slice regression, reverted (it raises Date::Error for cards Ruby never dispatches a Date view on). The queued seam: validate ONLY the card whose view is actually being dispatched, mirroring Ruby's per-view dispatch (view_for_denial -> view_method on THAT card; the parse fires inside the view method, not at prefetch scope). Work out where the dispatched-view boundary lives in src/card/render.ts (the render()/dispatch path vs the prefetch closure walk), design the narrowest change that raises BadQuery/Date::Error exactly when Ruby's view method would run and not one card earlier, plan the pins. DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "denied-universe-lane",
    family: "permission_denied_sentinel (4,155)",
    own: "YOU OWN: src/card/permissions/**, tests/card/render/structure-corpus-seeding.ts, benchmarks/corpus-v2/prewarm-static-deck.ts. Other lanes own render.ts, tests storage, tools/.",
    ask:
      "Family signature: permission_denied_sentinel_replaced_with_placeholder (corpus:88:render:content representative) - the oracle's captured bytes contain the denial span where we render content (or the reverse). The bucket GREW 2633 -> 4155 across famfix48->r2fix48 as the structure fixes un-masked these views. Ground truth: 54.7% of captured views were denied to anonymous, per VIEW; the read-rules engine (src/card/permissions/read-rules.ts) is landed and rule_count checks pass since the help-popover read filter (489a22c). So the residue is the read-rule UNIVERSE: which rules did the oracle's denial decisions use that our seeded universe lacks? Diagnose with corpus:88-class entries: for failing views, determine which read rule the oracle enforced (from the captured fixture's rule metadata) and whether that rule exists in the engine's universe after seeding (STRUCTURE_UNIVERSE_DEBUG-style probes; check the 2-junction rule sets too - the records lane proved 17 type_plus_right rule sets drop from the TEST storage for junction-key reasons, and YOUR seeding may share that mechanism). Plan the seeding fix. DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "records-lane",
    family: "structure-pending records (4,151 of 47,131)",
    own: "YOU OWN: tests/card/render/render-test-storage.ts and its test files (TEST-ONLY code). Other lanes own engine files.",
    ask:
      "The prior round diagnosed precisely: the test storage's seedCard (tests/card/render/render-test-storage.ts:154-160) stores NULL name/key for junction rows, so *structure rule universes lose every 2-junction anchor (17 type_plus_right rule sets; universe 115 vs corpus 139; src/card/rules/structure.ts:84 junction branch composes sl.key which is NULL). The LEAD HAS DECIDED: option (b) - preserve the natural key column for junction rows in the test seeding (the corpus carries the full key; the engine SQL already uses it). IMPLEMENT that: junction rows keep their corpus key/name instead of forced NULL, the universe SQL needs no change, verify the universe reaches 139 with the 17 type_plus_right keys present (STRUCTURE_UNIVERSE_DEBUG probe), then slice-prove the structure-pending records drop. Watch for render-side effects of keys becoming non-NULL (pins may assert the NULL convention - update pins ONLY where the corpus shape is the arbiter). " +
      "DIAGNOSE ONLY in this step (read the storage, the corpus convention, and the dependent pins; plan the exact edit + pin updates); do not edit any file.",
  },
  {
    lane: "tooling-lane",
    family: "measurement + scoreboard tooling",
    own: "YOU OWN: tools/corpus-failure-classes/**, tools/compat-report/**. No engine files.",
    ask:
      "Two deterministic tooling deliverables. (1) The classifier's normalize() (tools/corpus-failure-classes/classify-render-realfails.mjs ~line 36) strips '-content-view' from id attributes BEFORE the wrapper rules check, so the extra_content_view_wrapper bucket (and the old corpus:6551 shape) under-collapses - fix the ordering so id-view-suffix stripping happens after the structural classification rules, re-run the classifier against benchmarks/results/corpus-v2/replay-full-resultsr2fix48.json and report the new bucket table. (2) The compat report (tools/compat-report/mod-compat-report.md) is STALE: its per-mod verdicts count only the engine's HTML_VIEWS seed registry and miss mod-loader registrations + byte-pinned tests (the mod verification round proved ~17-20 mods complete under the honest criterion). Regenerate the report's verdict table from the actual state: mod-loader manifests + test pins per mod, keeping the report's existing format, and cite the verification round's evidence. Run any suites your changes touch. " +
      "DIAGNOSE ONLY in this step (plan the exact edits; run read-only probes); do not edit any file.",
  },
];

phase("Diagnose the permission seam, the denied universe, the records key, and the tooling");

const diagnoses = await Promise.all(
  diagnosisAsks.map(async (spec) => {
    const diagnosis = await laneAgents[spec.lane].ask<Diagnosis>(
      `Your family: ${spec.family}. ${spec.own}\n\n${spec.ask}\n\n${SLICE_CONTRACT}\n\n` +
        "Choose a 3-5 shard proof slice from the r2fix48 per-shard outcomes where your family is heavily represented.",
    );
    report({ family: spec.family, stage: "diagnosed", proof: diagnosis.plan.slice(0, 200) }, "ledger");
    log(`${spec.lane}: ${diagnosis.mechanism.slice(0, 160)}...`);
    return { spec, diagnosis };
  }),
);

phase("Fix each family and prove it on its shard slice");

const laneResults: LaneResult[] = await Promise.all(
  diagnoses.map(({ spec, diagnosis }) =>
    runLane(
      spec.lane,
      `Your diagnosis (from the previous step): ${JSON.stringify(diagnosis)}\n\n` +
        `IMPLEMENT your fix plan now, then PROVE it on your proof slice (${diagnosis.proofShards}) using the SLICE REPLAY CONTRACT (serialization lock mandatory):\n${SLICE_CONTRACT}\n\n` +
        "Rules: fix the mechanism, not the symptom — no per-card special cases. Respect lane file ownership - if your fix needs another lane's files, stop and report the mechanism instead. Pin with fixture tests in tests/card/ following the existing pin style. Keep whole-tree tsc clean: node " + REPO + "/node_modules/typescript/lib/tsc.js --noEmit -p " + REPO + "/tsconfig.json. " +
        "Quote the REAL before/after numbers in proof. " +
        "If the fix does not improve the slice, do not thrash: revert your engine change, set status to 'diagnosed-only', and write the mechanism honestly in notes.",
    ).then((r) => {
      const withFamily: LaneResult = { ...r, family: spec.family };
      report({ family: spec.family, stage: withFamily.status, proof: withFamily.proof.slice(0, 200) }, "ledger");
      return withFamily;
    }),
  ),
);

phase("Write the ledger; the lead gates and runs the full-48");

const landed = laneResults.filter((r) => r.status === "landed").length;
const ledgerMd = [
  "# Round R3 ledger (the permission wave)",
  "",
  `Lanes landed: ${landed}/${laneResults.length}.`,
  "",
  ...laneResults.map(
    (r) => `## ${r.family} — ${r.status}\n\n- change: ${r.change}\n- proof: ${r.proof}\n- notes: ${r.notes}\n`,
  ),
  "",
  "The lead runs the tree gates and the single full-48 re-measure after integrating.",
].join("\n");

await artifact.markdown("r3-ledger", ledgerMd, {
  title: "Round R3 ledger",
  description: "The permission wave: Search/Date seam, denied universe, records key, tooling.",
  primary: true,
});

return {
  conclusion:
    `${landed}/${laneResults.length} lanes landed; the lead gates and measures the full-48 next.`,
  findings: laneResults,
  verified: ["each landed lane ran its lock-serialized slice replay before/after and quoted real numbers"],
  notCovered: [
    "tree gates + full-48 aggregate — deliberately the lead's post-integration steps",
    "families a lane marked diagnosed-only or blocked are not proven fixes",
  ],
};
