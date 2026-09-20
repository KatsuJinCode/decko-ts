// cleanup.mjs — remove everything the one-click deploy created in your
// Cloudflare account. Zero leftovers is the contract: this deploy owns
// exactly ONE Worker and ONE D1 database, listed below, and nothing else.
//
//   Worker:        decko-ts-demo
//   D1 database:   decko-ts-demo-db
//
// WITHOUT --yes (default): print the plan and the exact commands, touch
// nothing. WITH --yes: execute them via npx wrangler, in this order
// (worker first, then the database; each deletion is independent).
//
//   npx wrangler delete --name decko-ts-demo
//       (wrangler asks for confirmation interactively — answer y)
//   npx wrangler d1 delete decko-ts-demo-db --skip-confirmation
//       (verified flag; deletes the database AND its automatic backup)
//
// Requires wrangler auth (check with: npx wrangler whoami). Cleanup is the
// one script in deploy/ that talks to the real account, and only with --yes.
//
// Run: node deploy/cleanup.mjs [--yes]

import { spawnSync } from "node:child_process";

const WORKER_NAME = "decko-ts-demo";
const DATABASE_NAME = "decko-ts-demo-db";

const PLAN = [
  {
    resource: `Worker "${WORKER_NAME}"`,
    command: "npx",
    args: ["wrangler", "delete", "--name", WORKER_NAME],
    note: "interactive confirmation expected (documented flag-free path)",
  },
  {
    resource: `D1 database "${DATABASE_NAME}" (and its automatic backup)`,
    command: "npx",
    args: ["wrangler", "d1", "delete", DATABASE_NAME, "--skip-confirmation"],
    note: "--skip-confirmation is the documented d1 delete flag",
  },
];

const execute = process.argv.includes("--yes");

console.log("decko-ts deploy cleanup");
console.log(`  worker:   ${WORKER_NAME}`);
console.log(`  database: ${DATABASE_NAME}`);
console.log("");

if (!execute) {
  console.log("DRY RUN (no --yes): nothing is touched. The exact commands:");
  for (const step of PLAN) {
    console.log(`  $ ${[step.command, ...step.args].join(" ")}`);
    console.log(`      removes: ${step.resource} (${step.note})`);
  }
  console.log("");
  console.log("Run `node deploy/cleanup.mjs --yes` to execute.");
  process.exit(0);
}

let failed = false;
for (const step of PLAN) {
  console.log(`==> Removing ${step.resource}`);
  const result = spawnSync(step.command, step.args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    failed = true;
    console.error(`    FAILED (exit ${result.status}) — wrangler printed the reason above.`);
  } else {
    console.log(`    removed.`);
  }
  console.log("");
}

if (failed) {
  console.error("One or more deletions failed — check the wrangler output above and re-run.");
  process.exit(1);
}

console.log("Cleanup complete: worker and D1 database removed. Nothing else was created by this deploy.");
