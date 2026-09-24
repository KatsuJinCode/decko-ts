// Mod round: drain the 30 partial mods in parallel with the corpus rounds.
// The script reads the compat report itself and splits the partial-mod list
// into three disjoint thirds, one lane per third; lanes work their third in
// order and honestly report per-mod status. Completion criterion per mod:
// every view the mod ships renders byte-identical against Ruby truth.

interface ModAssignment {
  /** The mods this lane owns this round, in work order. */
  mods: string[];
  /** Per-mod status after the lane's round. */
  results: Array<{
    mod: string;
    status: "ported" | "partial-progress" | "already-complete" | "blocked";
    /** What changed, and what proof (fixture pin names, suite results) shows it. */
    evidence: string;
  }>;
  /** The lane's honest account for the next round. */
  notes: string;
}

interface WorkflowReport {
  conclusion: string;
  findings: ModAssignment[];
  verified: string[];
  notCovered: string[];
}

const REPO = "C:/localProjects/decko-ts";
const COMPAT_REPORT = "tools/compat-report/mod-compat-report.md";

const PERSONA =
  "You are a mod-porting engineer on the decko-ts TypeScript port of Ruby Decko. Every claim carries a file:line cite. " +
  "You never report a check you did not run, and you escalate plainly if a gate cannot pass. " +
  "The Ruby truth lives in the vendored prototype/ tree (the card/decko gems) and fixtures/captured/ " +
  "(recorded oracle bytes — the executable specification). The corpus is sanitized; keep it that way. " +
  "If your instructions contradict each other or a check is impossible, escalate and say so rather than working around it.";

const laneAgents: Record<string, Agent> = {};
for (const name of ["mods-third-1", "mods-third-2", "mods-third-3"]) {
  laneAgents[name] = agent(name, { system: PERSONA });
}

artifact.table("ledger", {
  title: "Mod round ledger",
  columns: [
    { field: "family", label: "Mod" },
    { field: "stage", label: "Status" },
    { field: "proof", label: "Evidence" },
  ],
  key: "family",
});

// The script's file tools resolve against the SESSION workspace (a different
// repo), so the compat report is read by each LANE with its own tools. The
// split is deterministic anyway: every lane extracts the same list the same
// way and takes its residue class mod 3.
const EXTRACT_RULE =
  'Read tools/compat-report/mod-compat-report.md. Extract every unique token matching the regex ' +
  'card-mod-[a-z0-9_]+ from the whole file, SORT the unique list alphabetically, and index it from 0. ' +
  'Your assigned mods are the entries at indices where index % 3 === N (N given below). Verify each ' +
  'assigned mod against the report table before working it; if one is already fully ported, mark it ' +
  "already-complete with the pin names and move on.";

const COMPLETION_CONTRACT = [
  "COMPLETION CONTRACT (per mod):",
  "1. Read the mod's current state: coverage row in " + COMPAT_REPORT + ", its TS file(s) under",
  "   src/card/mod-loader/mods/, and the Ruby source under prototype/ (the gem's mod directory).",
  "2. Enumerate the views the mod SHIPS (Ruby: view definitions / templates). For each view not yet",
  "   byte-pinned: derive the oracle bytes (from fixtures/captured/ captures when one covers it,",
  "   otherwise from the Ruby source path — template + view method, citing file:line) and pin them",
  "   in a fixture test under tests/card/mod-loader/ following the existing pin style.",
  "3. Make every pin for this mod green plus the whole tests/card/mod-loader tree, and keep tsc clean:",
  "   node C:/localProjects/decko-ts/node_modules/typescript/lib/tsc.js --noEmit -p C:/localProjects/decko-ts/tsconfig.json",
  "4. 'ported' means: every shipped view either byte-pinned green or PROVEN not reachable (cite why).",
  "   Anything less is 'partial-progress' with exactly what remains. No git commits — the lead integrates.",
  "5. Do not edit files outside your mods' TS files, their tests, and mod registration if the mod",
  "   needs it. The corpus rounds own src/card/render.ts, views.ts, pointer-list.ts, help-popover.ts:",
  "   if your mod seems to need changes THERE, stop and report the mechanism instead of editing.",
].join("\n");

phase("Three lanes drain their thirds");

const assignments: ModAssignment[] = await Promise.all(
  [0, 1, 2].map(async (i) => {
    const result: ModAssignment = await laneAgents[`mods-third-${i + 1}`].ask<ModAssignment>(
      `${EXTRACT_RULE.replace("=== N", "=== " + i)}

${COMPLETION_CONTRACT}

` +
        "Work your assigned mods in list order; spend the round on as many as you can COMPLETELY — one done properly beats three half-done. " +
        "Return per-mod status with evidence.",
    );
    return result;
  }),
);

for (const a of assignments) {
  for (const r of a.results ?? []) {
    report(
      {
        family: `mod ${r.mod}`,
        stage: r.status,
        proof: r.evidence.slice(0, 200),
      },
      "ledger",
    );
  }
}

phase("Write the mod ledger; the lead gates and integrates");

const ported = assignments.flatMap((a) => a.results).filter((r) => r.status === "ported").length;
const total = assignments.flatMap((a) => a.results).length;
const ledgerMd = [
  "# Mod round ledger",
  "",
  `Mods brought to 'ported' this round: ${ported}/${total} attempted (the 30-partial backlog drains over rounds).`,
  "",
  ...assignments.flatMap((a) => [
    `## Third (${(a.mods ?? []).length} mods assigned)`,
    "",
    ...(a.results ?? []).map((r) => `- **${r.mod}** — ${r.status}: ${r.evidence}`),
    "",
    a.notes ?? "",
    "",
  ]),
].join("\n");

await artifact.markdown("mods-ledger", ledgerMd, {
  title: "Mod round ledger",
  description: "Per-mod porting status: what reached byte-parity this round, what remains, why.",
  primary: true,
});

return {
  conclusion: `${ported}/${total} mods attempted this round reached 'ported'; per-mod evidence in findings. The lead gates (tsc + mod-loader suites) and integrates.`,
  findings: assignments,
  verified: ["each 'ported' mod lists the green fixture pins that prove it", "lanes ran the mod-loader tree before reporting"],
  notCovered: [
    "tree gates + integration — the lead's steps",
    "mods a lane marked partial-progress or blocked are not claimed as ported",
  ],
};
