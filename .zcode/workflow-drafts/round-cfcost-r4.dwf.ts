// Round CF-COST + R4: two trigger families from the live D1 insights (2026-09-24
// 00:04-00:30 UTC window, 2,279-row targeted deck) plus the standing permission
// wave. Live numbers, per query, rows READ on D1:
//   name lookup  SELECT id FROM cards WHERE key=? AND trash=0   2,279 rows x42  (NO INDEX - full scan)
//   name lookup  SELECT *  FROM cards WHERE key=? AND trash=0   2,054 rows x23  (NO INDEX - full scan)
//   compound-key CTE  WITH RECURSIVE resolved(...)             18,585 rows/render x32
//   compound-key CTE (heavy variant, probe home page)         127,734 rows/render x10
//   structure list  SELECT id,name,left_id,right_id ...      ~2,279 rows x9 (full scan)
// Cost scales with DECK size, not page size. At Brandon's real scale (~47k cards,
// ~1.1M rows) one page view could read millions of rows - the free read tier
// (5M/day) would die after a handful of page views. The fixes are LOCAL-FIRST;
// remote re-test happens in one lead-owned window after this round lands.

interface Diagnosis {
  /** The mechanism: why the cost/failure exists, one tight paragraph with file:line cites. */
  mechanism: string;
  /** The fix plan: files to change and what changes at each. */
  plan: string;
  /** Proof method: the local harness/slice that will show before/after. */
  proofMethod: string;
}

interface LaneResult {
  /** Which family this lane took. */
  family: string;
  /** One sentence: what changed in the tree (or why nothing changed). */
  change: string;
  /** Real before/after numbers, quoted from the harness/slice output. */
  proof: string;
  /** "landed" = proven locally; "diagnosed-only" = mechanism found, fix not proven; "blocked" = could not diagnose. */
  status: "landed" | "diagnosed-only" | "blocked";
  /** Honest notes: what is unproven, what the next step needs. */
  notes: string;
}

interface WorkflowReport {
  conclusion: string;
  findings: LaneResult[];
  verified: string[];
  notCovered: string[];
}

const REPO = "C:/localProjects/decko-ts";

const COMMON_CONTRACT = [
  "SHARED CONTRACT:",
  "  - Work FROM " + REPO + " on the current working tree. No git commits - the lead integrates.",
  "  - ABSOLUTELY NO Cloudflare contact: no wrangler commands of any kind, no --remote, no deploys.",
  "    The lead owns the single remote re-test window after this round.",
  "  - No process kills, no cron, no background jobs left running.",
  "  - SLICE REPLAY lock (if you run a corpus slice; concurrent replays corrupt shared seed state):",
  "      while ! mkdir tmp/slice-replay.lock 2>/dev/null; do sleep 20; done ; ...replay... ; rm -rf tmp/slice-replay.lock",
  "      Slice env: CORPUS_PREWARM=1 CORPUS_SHARDS=<3-5 shards> CORPUS_SLICE_TAG=<tag> CORPUS_RESUME=1 \\",
  "        NODE_OPTIONS=--max-old-space-size=6144 node node_modules/vitest/vitest.mjs run --root . benchmarks/corpus-v2/replay-shard.test.ts",
  "      NEVER run all 48 shards; the lead owns the full-48.",
  "  - Corpus data (benchmarks/corpus-v2/) is sanitized structure; keep it that way.",
].join("\n");

const PERSONA =
  "You are an engineer on the decko-ts TypeScript port of Ruby Decko. Every claim carries a file:line cite. " +
  "You never report a check you did not run, and you escalate plainly if a gate cannot pass. " +
  "The Ruby truth lives in the vendored prototype/ tree and fixtures/captured/. " +
  "If your instructions turn out to contradict each other or a check is impossible, escalate and say so rather than working around it.";

const laneAgents: Record<string, Agent> = {};
for (const name of ["index-lane", "keymap-lane", "permission-lane", "probe-lane"]) {
  laneAgents[name] = agent(name, { system: PERSONA });
}

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
  title: "Round CF-COST + R4 ledger",
  columns: [
    { field: "family", label: "Family" },
    { field: "stage", label: "Stage" },
    { field: "proof", label: "Proof" },
  ],
  key: "family",
});

const specs: Array<{ lane: string; family: string; own: string; ask: string }> = [
  {
    lane: "index-lane",
    family: "D1 read cost #1 — missing indexes (name lookups full-scan cards)",
    own:
      "YOU OWN: db/*.sql (schema), deploy/** schema/seed files, tools/cf-cost/** (new), benchmarks/cf-scale/*. " +
      "Do NOT touch src/ query logic (keymap-lane owns it).",
    ask:
      "Live D1 insights prove point lookups scan the whole cards table: WHERE key=? read 2,279 rows on a 2,279-row deck " +
      "(x42) and 2,054 rows (x23). The schema shipped to D1 has NO index serving key/trash (and likely none on " +
      "left_id/right_id/type_id). TASKS: (1) Inventory the engine's hot query shapes (grep the query builder for WHERE " +
      "clauses on cards/card_references) and map each to a required index. (2) Add the missing CREATE INDEX statements " +
      "to BOTH the local schema (db/schema.sqlite.sql) and whatever schema file the D1 deploy path uses (find it under " +
      "deploy/ or benchmarks/migrate); follow existing naming conventions. (3) Build tools/cf-cost/measure-render-reads.mjs: " +
      "boot the REAL engine over the targeted deck (reuse the boot chain in benchmarks/cf-scale/verify-targeted-deck.test.ts: " +
      "LocalSqliteDriver -> splitSqlStatements(SCHEMA) -> seed -> FetchEngine -> RenderEngine), run a fixed battery (home, one " +
      "point read, the depth-32 chain, the 500-item pointer, the CQL list card, one denied card), and report rows-read per " +
      "render BEFORE and AFTER your indexes. Measure rows-read honestly: if the driver cannot expose rows-examined, gate on " +
      "EXPLAIN QUERY PLAN (zero SCAN-of-cards on point paths) PLUS a documented upper-bound accounting (statements x table " +
      "sizes), and say which you did. Deliver the before/after table in your result. " +
      "DIAGNOSE ONLY in this step (inventory + baseline numbers + exact index DDL planned); do not edit any file.",
  },
  {
    lane: "keymap-lane",
    family: "D1 read cost #2 — per-render compound-key resolution (O(deck) per page view)",
    own:
      "YOU OWN: src/** query-engine files (the recursive CTE and its callers), and test pins that encode its shape. " +
      "Do NOT touch db/*.sql or deploy/ (index-lane owns them); if your fix wants an index, note it in your result instead.",
    ask:
      "A recursive CTE (grep 'WITH RECURSIVE resolved') resolves the FULL compound-key universe and runs once per request: " +
      "18,585 rows read per render on a 2,279-row deck (x32), and a heavier variant hit 127,734 rows per render (x10). " +
      "Cost scales with deck size, not page size - at ~47k cards a single render could read millions of rows. TASKS: " +
      "(1) Trace the exact call path (which engine entry runs it per render, which caches exist already). (2) Fix to O(page): " +
      "preferred = resolve only the names the page actually touches via indexed per-key lookups; fallback or complement = " +
      "memoize the resolved keymap on the engine instance so a warm instance never re-pays it. (3) Prove: rows-read per render " +
      "before/after with the same battery as index-lane's harness concept (you may build a minimal local probe of your own; " +
      "do not edit tools/cf-cost or the schema). (4) Parity guard: run a lock-serialized corpus slice replay (3-5 shards " +
      "covering compound/junction-heavy names) to confirm render output is byte-identical - the CTE feeds name resolution, " +
      "so a wrong fix shows up as realFail growth. DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "permission-lane",
    family: "R4 — the permission wave continuation (11,109 views: Card sentinel 4,894, permission_denied 4,155, Date 1,066)",
    own:
      "YOU OWN: src/card/render.ts (Search/Date prepare + dispatch seam), src/card/permissions/**, " +
      "tests/card/render/structure-corpus-seeding.ts, tests/card/render/render-test-storage.ts (test-only).",
    ask:
      "Continue the R3 coupling map - but FIRST read the R3 ledger and the last ~10 commit subjects so you do not repeat " +
      "landed or disproven work. R3's DISPROVEN list (do NOT retry): (a) inverting the prepareSearches deny-skip - it IS " +
      "correct Ruby semantics (view/permission.rb:46-50 wraps the view BEFORE view_method dispatches; corpus:95; comment " +
      "in src/card/render.ts ~line 269); (b) broadening the Search/Date walk over the whole prefetch reach - 17x slice " +
      "regression, reverted. R3's queued seams: (1) Search/Date lazy seam - validate ONLY the card whose view is actually " +
      "dispatched (Ruby's parse fires inside the view method on THAT card), designed JOINTLY with the walk-completion " +
      "invariant, because the eager BadQuery throw's walk-termination side effect is load-bearing for verdict enrichment; " +
      "(2) actorId threading gap - some permission paths see parties [8] where the oracle used [8,15]; find which call " +
      "sites drop the actor and thread it; (3) permission_denied universe - the bucket grew 2633 -> 4155 across " +
      "famfix48->r2fix48; determine which read rules the oracle enforced that the seeded universe lacks (54.7% of captured " +
      "views were denied to anonymous per VIEW; check the 2-junction rule sets the records lane proved drop from test " +
      "storage - 17 type_plus_right sets - and whether your seeding shares that mechanism); (4) records 4,151 - the lead " +
      "decided option (b): junction rows keep their corpus key/name in TEST seeding; if not yet landed, implement and " +
      "verify the structure universe reaches 139 (STRUCTURE_UNIVERSE_DEBUG probe). Prove every fix on a 3-5 shard slice " +
      "where your family is heavy (lock contract). DIAGNOSE ONLY in this step; do not edit any file.",
  },
  {
    lane: "probe-lane",
    family: "Adversarial differential battery — design + local-expected side (remote window is the lead's)",
    own:
      "YOU OWN: benchmarks/cf-scale/adversarial-probes.mjs (new), benchmarks/cf-scale/probe-expectations.json (new), and " +
      "any scratch local deck you build under tmp/. Do NOT edit src/ or db/ - bugs you find get REPORTED, not fixed.",
    ask:
      "The operator authorized up to HALF the daily free limits for adversarial probing in the next remote window; your " +
      "job is everything short of touching Cloudflare. (1) Enumerate the probe classes a card-shaping URL surface can " +
      "receive: '+' vs %20 vs %2B in multi-word names, unicode/percent-encoding edge cases, empty and 500-char names, " +
      "trailing dots/dashes, SELF-INCLUSION and inclusion CYCLES (A includes A; A includes B includes A) - check what the " +
      "Ruby prototype does (prototype/ has cycle guards? cite them) and what ours does, pointer-to-self, denied-parent with " +
      "readable-child nesting, nonexistent view names, malformed CQL inside search cards, nesting deeper than 32, junction " +
      "chains, name collisions across types, huge single-card content. (2) For EACH probe: run it against the LOCAL engine " +
      "booted over the targeted deck (add crafted cards in a scratch deck under tmp/ where the class needs them) and record " +
      "actual behavior; where Ruby semantics are determinable from prototype/, record the expected oracle behavior too. " +
      "(3) Write benchmarks/cf-scale/adversarial-probes.mjs: given a base URL, fires every probe, diffs remote behavior " +
      "against probe-expectations.json (the local-expected you measured), and prints per-batch arithmetic - rows-read " +
      "estimate and request count - with 20% headroom against the 5M reads / 100k requests daily limits, so the lead can " +
      "decide the window from one output block. (4) Any LOCAL divergence from Ruby semantics = a finding for the ledger " +
      "with its repro; report it, do not fix it. DIAGNOSE ONLY in this step (build the harness, run locals, write files is " +
      "ALLOWED for your owned files); do not edit any engine file.",
  },
];

phase("Diagnose the read-cost families, the permission seam, and the probe classes");

const diagnoses = await Promise.all(
  specs.map(async (spec) => {
    const diagnosis = await laneAgents[spec.lane].ask<Diagnosis>(
      `Your family: ${spec.family}. ${spec.own}\n\n${spec.ask}\n\n${COMMON_CONTRACT}`,
    );
    report({ family: spec.family, stage: "diagnosed", proof: diagnosis.plan.slice(0, 200) }, "ledger");
    log(`${spec.lane}: ${diagnosis.mechanism.slice(0, 160)}...`);
    return { spec, diagnosis };
  }),
);

phase("Implement each fix and prove it locally");

// LEAD ADDENDA — from the contract-critic pass on this round's contract (2026-09-24).
// Binding corrections to lane scope and proof obligations; diagnose phase replays
// from cache, only implementation re-runs.
const implementAddendum: Record<string, string> = {
  "index-lane":
    "LEAD ADDENDUM (from the contract critic, binding): (1) Your proof MUST include a byte-parity check — render a " +
    "junction/compound-heavy page set before and after your index DDL and assert byte-identical output (indexes can " +
    "change row visitation order; this repo has an index-induced planner incident on record in prefetch.ts). " +
    "(2) Add WRITE-side accounting: what the AFTER schema costs in rows-written per import (the d1-chunker path), and " +
    "what the live backfill costs — CREATE INDEX over the full ~47k-row deck is itself a bulk write against the " +
    "100k/day cap; measure how many rows it touches at corpus scale. (3) Run PRAGMA analyze in your harness and state " +
    "whether query plans were chosen with or without stats. (4) LocalSqliteDriver does not expose rows-examined — say " +
    "plainly in your result that your numbers are plan-shape (EXPLAIN QUERY PLAN) plus upper-bound accounting, and that " +
    "the lead's remote window is what validates them.",
  "keymap-lane":
    "LEAD ADDENDUM (from the contract critic, binding): (1) OWNERSHIP OVERRIDE — the recursive CTE family has FOUR " +
    "sites: src/card/permissions/read-rules.ts:435, src/card/permissions/view-task-rules.ts:313, " +
    "src/card/permissions/set-read-rule.ts:616, and src/card/render/prefetch.ts:157. You own ALL FOUR regardless of " +
    "directory; permission-lane owns the rest of permissions/. Fixing one copy while three remain is not landed. " +
    "(2) If you memoize anything on the engine instance: a warm isolate serves renders AFTER a mutation " +
    "(rename/create/trash), and a stale key->id map there feeds PERMISSION decisions. Memoization requires an " +
    "invalidation story plus a proof case that renders, mutates, and re-renders on ONE instance and stays correct. " +
    "If you cannot prove that, use per-key resolution instead. (3) Prove at BOTH scales: the 2,279-row targeted deck " +
    "AND benchmarks/corpus-v2/bench-corpus-v2.sqlite3 (~47k cards) — the decision this round feeds is a 47k-row " +
    "decision. (4) State your fix's memory cost per isolate at 47k cards (the deployed worker already warns the full " +
    "keymap is megabytes there).",
  "permission-lane":
    "LEAD ADDENDUM (from the contract critic, binding): OWNERSHIP CARVE-OUT — keymap-lane owns the recursive CTE " +
    "sites inside YOUR directory: src/card/permissions/read-rules.ts:435, src/card/permissions/view-task-rules.ts:313, " +
    "src/card/permissions/set-read-rule.ts:616. Do not edit those CTE blocks; everything else in permissions/** is " +
    "yours. If your fix requires touching a CTE site, stop and report the mechanism instead.",
  "probe-lane":
    "LEAD ADDENDUM (from the contract critic, binding): your per-batch budget block MUST include rows_written — the " +
    "100k/day write cap is what burned the account yesterday; a budget of reads and requests alone is incomplete. " +
    "Every batch prints write-side arithmetic with 20% headroom.",
};

const laneResults: LaneResult[] = await Promise.all(
  diagnoses.map(({ spec, diagnosis }) =>
    runLane(
      spec.lane,
      `Your diagnosis (from the previous step): ${JSON.stringify(diagnosis)}\n\n` +
        `IMPLEMENT your fix plan now, then PROVE it per your own diagnosis proofMethod (${diagnosis.proofMethod}).\n` +
        `${implementAddendum[spec.lane] ?? ""}\n${COMMON_CONTRACT}\n\n` +
        "Rules: fix the mechanism, not the symptom — no per-card special cases. Respect lane file ownership — if your fix " +
        "needs another lane's files, stop and report the mechanism instead. Keep whole-tree tsc clean: node " +
        REPO + "/node_modules/typescript/lib/tsc.js --noEmit -p " + REPO + "/tsconfig.json. Run the suites your change touches. " +
        "Quote the REAL before/after numbers in proof. If the fix does not improve its measure, do not thrash: revert your " +
        "change, set status to 'diagnosed-only', and write the mechanism honestly in notes.",
    ).then((r) => {
      const withFamily: LaneResult = { ...r, family: spec.family };
      report({ family: spec.family, stage: withFamily.status, proof: withFamily.proof.slice(0, 200) }, "ledger");
      return withFamily;
    }),
  ),
);

phase("Write the ledger; the lead gates, integrates, and owns the one remote window");

const landed = laneResults.filter((r) => r.status === "landed").length;
const ledgerMd = [
  "# Round CF-COST + R4 ledger",
  "",
  `Lanes landed: ${landed}/${laneResults.length}.`,
  "",
  ...laneResults.map(
    (r) => `## ${r.family} — ${r.status}\n\n- change: ${r.change}\n- proof: ${r.proof}\n- notes: ${r.notes}\n`,
  ),
  "",
  "The lead runs the tree gates, integrates, and owns the single remote re-test window (budget-checked, 20% headroom).",
].join("\n");

await artifact.markdown("cfcost-r4-ledger", ledgerMd, {
  title: "Round CF-COST + R4 ledger",
  description: "D1 read-cost fixes (indexes, keymap), the permission wave, and the adversarial battery design.",
  primary: true,
});

return {
  conclusion:
    `${landed}/${laneResults.length} lanes landed locally; the lead gates, integrates, and then owns the one budget-checked remote window.`,
  findings: laneResults,
  verified: [
    "each landed lane proved its change with real local before/after numbers (read-cost harness, corpus slice, or local-expected probes)",
    "lane file ownership kept index/query/permission/probe changes disjoint",
  ],
  notCovered: [
    "no Cloudflare contact from any lane — the remote re-test and probe window is the lead's, after the lead's gates",
    "full-48 corpus aggregate — deliberately the lead's post-integration step",
    "families a lane marked diagnosed-only or blocked are not proven fixes",
  ],
};
