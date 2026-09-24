// Corpus failure families batch: three lanes take the three classified
// failure families from the with-mods full-48 replay (commit 99ab875,
// tools/corpus-failure-classes/failure-buckets-withmods48.json), diagnose
// the mechanism, fix, and prove the fix on a shard slice. The lead runs
// the single full-48 measurement after all lanes land — no lane runs it.
//
// Families by size:
//   1. Permission sentinels (~5,126): capture_error_not_raised:Card 3,233,
//      :Date 966, permission_denied_sentinel 927 — read-rule cards absent
//      from the dumped corpus; known flip recipe = permission-corpus-seeding
//      enrichment + delete the denied-span skip.
//   2. Name-leak positions (~4,572): card names muted in the oracle's HTML
//      leak as visible text in ours (inside_content_after_data_attr 2,212,
//      after_home_view_data_attr 2,204, other 156).
//   3. Mini-bar bytes (~2,968): pointer_item_bar_inner_mini_bar_view 1,659
//      not emitted + outer wrapper 1,309 — the open-bar/mini-bar swap path.
//   4. PERF REGRESSION (blocks the perf gate, not a corpus family): the
//      render-perf harness went red solo after the 09-23 fix rounds —
//      warm-render-sample 127.6ms/entry vs 25 budget (median 10, p95 748ms)
//      and closureWarm-coverage 47 cold cards vs 0, with 1 erroring warm
//      entry. Receipt: benchmarks/results/perf/render-perf.json. The harness
//      boots WITHOUT the mod loader (generation stays 0), so the suspect set
//      is the 1ec2761 sentinel/rule-bar/pointer-list/carrierwave changes and
//      0974bd8's swapBarSlotToMiniBar rewrite + viewDispatchCache key change.
//      Deliverable: all four budgets green solo, warm errors 0.

interface Diagnosis {
  /** The mechanism: why the family fails, one tight paragraph with file:line cites. */
  mechanism: string;
  /** The fix plan: files to change and what the oracle actually does differently. */
  plan: string;
  /** Proof slice: 3-5 shard names, e.g. "shard-000000.jsonl,shard-000003.jsonl". */
  proofShards: string;
  /** Where those shards' family entries sit in the aggregate (shard indices). */
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
  "Outcome JSONs land in benchmarks/results/corpus-v2/replay-shard-outcome<familytag>-*.json;",
  "the aggregate prints per-shard records/renders pass + realFail. Run the slice ONCE",
  "BEFORE your fix for the baseline (or reuse the matching prewarm48/withmods48 per-shard",
  "outcomes for those shards as the baseline), then once after. NEVER run all 48 shards;",
  "the lead owns that measurement. No git commits — the lead integrates. No deploys, no",
  "wrangler --remote, no process kills, no cron. Corpus data is sanitized; keep it that way.",
].join("\n");

const PERSONA =
  "You are a parity engineer on the decko-ts TypeScript port of Ruby Decko. Every claim carries a file:line cite. " +
  "You never report a check you did not run, and you escalate plainly if a gate cannot pass. " +
  "The corpus (benchmarks/corpus-v2/) is sanitized, content-free structure; keep it that way and never introduce " +
  "real deck content. The Ruby truth lives in the vendored prototype/ tree and fixtures/captured/. " +
  "If your instructions turn out to contradict each other or a check is impossible, escalate and say so rather than working around it.";

// The three lane actors are created ONCE (names are identities; a duplicate
// agent() call with the same name fails the run) and reused across the
// diagnosis and fix phases so each lane keeps its own context.
interface LaneDef {
  name: string;
  family: string;
  brief: string;
  /** Overrides the generic shard-slice diagnosis ask (measurement lanes). */
  diagAsk?: string;
  /** Overrides the generic shard-slice proof ask (measurement lanes). */
  proofAsk?: string;
}

const laneDefs: LaneDef[] = [
  {
    name: "permission-lane",
    family: "permission sentinels (~5,126 views)",
    brief:
      "Family signature: capture_error_not_raised:Card / :Date and permission_denied_sentinel_replaced_with_placeholder. " +
      "Ground truth from the privacy work: 54.7% of captured views were denied to anonymous in the oracle, per VIEW. " +
      "The dumped corpus lacks the read-rule cards the oracle enforced, so our replay cannot reproduce the denials and " +
      "renders where the oracle emitted the CAPTURE_ERROR / permission-denied sentinel. A prior round proved that simply " +
      "skipping denied spans is wrong (the revert evidence in commit 1ec2761's message). The queued flip recipe: enrich the " +
      "replay's permission seeding (see tests/card/render/structure-corpus-seeding.ts and the prewarm driver " +
      "benchmarks/corpus-v2/prewarm-static-deck.ts) so the engine sees the read rules the oracle enforced, and remove the " +
      "denied-span skip so those views are compared honestly. Start by reading " +
      "tools/corpus-failure-classes/failure-buckets-withmods48.json representatives (corpus:77, corpus:88, corpus:1135) and " +
      "the seeding code, and work out where the read rules must be seeded from (the fixtures' captured rule metadata) before writing code.",
  },
  {
    name: "nameleak-lane",
    family: "name-leak positions (~4,572 views)",
    brief:
      "Family signature: card_name_leaked_as_text_inside_content_view_after_data_attr (corpus:79:render:content), " +
      "_after_home_view_data_attr (corpus:79:render:open), _other (corpus:1631). Our HTML contains the raw card name as " +
      "visible text where the oracle's HTML mutes or omits it (or places it differently). Pick 5-10 failing entries from the " +
      "replay aggregate's recorded excerpts (benchmarks/results/corpus-v2/replay-full-resultswithmods48.json, " +
      "aggregate.real_failures carries 2,000 with first-diff excerpts), read the exact byte context, and identify which Ruby " +
      "mechanism strips or escapes the name in those positions (suspects: the view/format layer's name handling, " +
      "show/anchor rendering, HTML-escaping differences). Fix src/card/render paths, pin with fixtures, prove on a slice.",
  },
  {
    name: "minibar-lane",
    family: "mini-bar bytes (~2,968 views)",
    brief:
      "Family signature: pointer_item_bar_inner_mini_bar_view_not_emitted (corpus:77:render:content) and " +
      "pointer_item_bar_outer_card_list_wrapper_prepended (corpus:6551:render:content). The oracle emits a nested mini_bar " +
      "view inside the open-bar structure where we emit none, and an outer wrapper we omit. This is the swapBarSlotToMiniBar " +
      "path in src/card/render/views.ts (recently rewritten to literal string ops, commit 0974bd8 — the rewrite fixed a ReDoS " +
      "and must stay O(N); do not reintroduce regex-from-name). Read the oracle fixtures' full bar structure and the Ruby " +
      "open/close view source in the vendored prototype/ tree to derive the exact nesting rule, fix, pin, prove on a slice.",
  },
  {
    name: "perf-lane",
    family: "render-perf budget regression (blocks the perf gate)",
    brief:
      "The render-perf harness (benchmarks/perf/render-perf-harness.test.ts) was all-green at commit 61906db " +
      "(warm 6.05ms/entry, 0 cold cards) and is red solo now (receipt: benchmarks/results/perf/render-perf.json): " +
      "warm-render-sample 127.6ms/entry vs 25 budget — median 10ms but p95 748ms/max 854ms (bimodal: a subset of " +
      "entries pays a full cold-price) — plus closureWarm-coverage 47 cold cards vs 0, plus 1 entry erroring in both " +
      "warm passes. Commits between green and red: 1ec2761 (sentinel gates re-keyed on typeCode, populateTypeCodes " +
      "moved before prepareSearches, rule-bar list dispatch, pointer-list wrapper, carrierwave blank-src) and 0974bd8 " +
      "(swapBarSlotToMiniBar literal rewrite, viewDispatchCache key now embeds modGeneration). The harness boots WITHOUT " +
      "the mod loader, so find which of those changes explains (a) the erroring entry — identify it, its captured view, " +
      "and the exact error — (b) the 47 cold cards, and (c) the p95 spikes. Deliverable: all four budgets green in a SOLO " +
      "run of the harness, warm errors 0, with tsc clean and the render/mod-loader suites green. " +
      "Proof protocol: run the harness file solo before and after your fix and quote the four measured numbers.",
    diagAsk:
      "DIAGNOSE ONLY in this step: identify (a) the one erroring warm entry — which card/view and the exact " +
      "error — by reproducing the harness's warm-sample selection yourself (first 60 shard-0 entries, first " +
      "available view each), (b) why 47 cards stay cold after prewarm, and (c) why the p95 spikes to ~750ms. " +
      "State the mechanism with file:line cites and a concrete fix plan. You do NOT need a shard slice; your " +
      "proof instrument is the solo harness run. Do not edit any file in this step.",
    proofAsk:
      "PROOF PROTOCOL: run the harness solo (npx vitest run benchmarks/perf/render-perf-harness.test.ts) for " +
      "the before numbers (you already have the red receipt in benchmarks/results/perf/render-perf.json), " +
      "implement your fix, make the render/mod-loader suites green and tsc clean, then re-run the harness solo " +
      "and quote ALL FOUR measured numbers in proof. If a budget cannot go green without violating byte parity " +
      "or the O(N) swapBar contract, stop at diagnosed-only and say exactly what blocks it.",
  },
];

const laneAgents: Record<string, Agent> = {};
for (const lane of laneDefs) {
  laneAgents[lane.name] = agent(lane.name, { system: PERSONA });
}
// Fixes only what the tree gates red-flag after the lanes land.
laneAgents["gate-repairer"] = agent("gate-repairer", { system: PERSONA });

// Node<T> is PromiseLike without .catch — await inside try/catch instead.
async function runLane(laneName: string, instructions: string): Promise<LaneResult | Diagnosis> {
  try {
    return await laneAgents[laneName].ask<LaneResult | Diagnosis>(instructions);
  } catch (error) {
    return {
      family: laneName,
      change: `lane failed: ${String(error).slice(0, 200)}`,
      proof: "none — lane errored before proving",
      status: "blocked",
      notes: "see lane error; the diagnosis above survives and is the round's salvage",
    };
  }
}

artifact.table("ledger", {
  title: "Failure-family round ledger",
  columns: [
    { field: "family", label: "Family" },
    { field: "stage", label: "Stage" },
    { field: "proof", label: "Slice proof" },
  ],
  key: "family",
});

phase("Diagnose the three failure families in parallel");

const diagnoses = await Promise.all(
  laneDefs.map(async (lane) => {
    const diagnosis = (await laneAgents[lane.name].ask<Diagnosis>(
      `Your family: ${lane.family}. ${lane.brief}\n\n${SLICE_CONTRACT}\n\n` +
        (lane.diagAsk ??
          "DIAGNOSE ONLY in this step: read the code and fixtures until you can state the mechanism " +
          "(why the oracle's bytes differ from ours) with file:line cites, and a concrete fix plan. " +
          "Choose a 3-5 shard proof slice that contains a healthy sample of YOUR family — the aggregate " +
          "benchmarks/results/corpus-v2/replay-full-resultswithmods48.json carries 2,000 recorded failures " +
          "and per-shard entries; find which shards your family's entries sit in and pick those. " +
          "Do not edit any file in this step."),
    )) as Diagnosis;
    report({ family: lane.family, stage: "diagnosed", proof: diagnosis.plan.slice(0, 200) }, "ledger");
    log(`${lane.name}: ${diagnosis.mechanism.slice(0, 160)}...`);
    return { lane, diagnosis };
  }),
);

phase("Fix each family and prove it on its shard slice");

const laneResults: LaneResult[] = await Promise.all(
  diagnoses.map(async ({ lane, diagnosis }) => {
    const result = (await runLane(
      lane.name,
      `Your diagnosis (from the previous step): ${JSON.stringify(diagnosis)}\n\n` +
        "IMPLEMENT your fix plan now.\n\n" +
        (lane.proofAsk ??
          `PROVE it on your proof slice (${diagnosis.proofShards}) using the SLICE REPLAY CONTRACT:\n${SLICE_CONTRACT}\n\n`) +
        "Rules: fix the mechanism, not the symptom — no per-card special cases. Pin the byte-level fix with a fixture " +
        "test in tests/card/ following the existing pin style. Run the affected vitest suites (render/mod-loader trees) " +
        "and make them green. Quote the REAL numbers in proof. " +
        "If the fix does not improve your instrument, do not thrash: revert your engine change, set status to " +
        "'diagnosed-only', and write the mechanism honestly in notes. Whole-tree tsc must stay clean: npx tsc --noEmit.",
    )) as LaneResult;
    report(
      { family: lane.family, stage: result.status, proof: result.proof.slice(0, 200) },
      "ledger",
    );
    return result;
  }),
);

phase("Gate the whole tree, repair if needed, and write the ledger");

const tscGate = await world.run("npx", ["tsc", "--noEmit"], { timeoutMs: 300000 });
const renderGate = await world.run(
  "npx",
  ["vitest", "run", "--reporter=dot", "tests/card/render/", "tests/card/mod-loader/"],
  { timeoutMs: 900000 },
);
const migrateGate = await world.run(
  "npx",
  ["vitest", "run", "--reporter=dot", "tests/migrate/", "tests/server/", "tests/deploy/"],
  { timeoutMs: 900000 },
);

let repairNotes = "gates green, no repair round needed";
if (tscGate.exitCode !== 0 || renderGate.exitCode !== 0 || migrateGate.exitCode !== 0) {
  const failing = [
    tscGate.exitCode !== 0 ? `tsc:\n${(tscGate.stderr + tscGate.stdout).slice(-4000)}` : "",
    renderGate.exitCode !== 0
      ? `render/mod-loader suites:\n${(renderGate.stderr + renderGate.stdout).slice(-4000)}`
      : "",
    migrateGate.exitCode !== 0
      ? `migrate/server/deploy suites:\n${(migrateGate.stderr + migrateGate.stdout).slice(-4000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const repair = await runLane(
    "gate-repairer",
    `The post-landing gates failed. Fix ONLY what the gate output shows, keeping every lane's proof intact:\n${failing}\n\n` +
      `Report what you changed and re-run the failing gates yourself to confirm. ${SLICE_CONTRACT}`,
  );
  repairNotes = `${(repair as LaneResult).status}: ${(repair as LaneResult).change}`;
}

const landed = laneResults.filter((r) => r.status === "landed").length;
const ledgerMd = [
  "# Corpus failure families — round ledger",
  "",
  `Lanes landed: ${landed}/${laneResults.length}. Repair: ${repairNotes}`,
  `Gates: tsc ${tscGate.exitCode}, render/mod-loader ${renderGate.exitCode}, migrate/server/deploy ${migrateGate.exitCode}.`,
  "",
  ...laneResults.map(
    (r) => `## ${r.family} — ${r.status}\n\n- change: ${r.change}\n- proof: ${r.proof}\n- notes: ${r.notes}\n`,
  ),
  "",
  "The lead runs the single full-48 with-mods measurement after integrating; per-lane slice numbers above are",
  "provisional until that aggregate lands.",
].join("\n");

await artifact.markdown("family-ledger", ledgerMd, {
  title: "Failure-family round ledger",
  description: "What each of the three corpus failure families got: diagnosis, fix, slice proof.",
  primary: true,
});

return {
  conclusion:
    `${landed}/${laneResults.length} lanes landed (three corpus failure families + the perf-budget ` +
    `regression); the tree gates ` +
    `(tsc ${tscGate.exitCode}, render ${renderGate.exitCode}, migrate/server/deploy ${migrateGate.exitCode}); repair: ${repairNotes}.`,
  findings: laneResults,
  verified: [
    "each landed lane ran its slice replay before/after and quoted real numbers",
    `whole-tree tsc exit ${tscGate.exitCode}`,
    `render+mod-loader suites exit ${renderGate.exitCode}`,
    `migrate+server+deploy suites exit ${migrateGate.exitCode}`,
  ],
  notCovered: [
    "full-48 aggregate — deliberately the lead's single post-integration measurement",
    "families a lane marked diagnosed-only or blocked are not proven fixes",
  ],
};
