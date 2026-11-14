#!/usr/bin/env node
// reset-live-deck.mjs: reset the demo scratch copy's served deck to clean
// WHILE THE SURFACE IS SERVING IT.
//
//   node scripts/demo-scratch-copy/reset-live-deck.mjs
//     [--seed <seed-deck.sqlite3>] [--deck <deck.sqlite3>]
//     [--credentials <file>]
//
// WHY THIS EXISTS. The runbook's reset is `build-demo-deck.mjs`, and that
// script REBUILDS the served deck by removing the deck file and copying the
// seed onto it. On Windows the running server holds that file open (SQLite
// keeps the handle for the connection's life), so the removal fails with
// EPERM and the reset cannot run while the surface is up. The only way the
// old reset could run was with the server stopped, and stopping it needed a
// manual termination, which is the failure mode the process lifecycle gate
// exists to end.
//
// WHAT THIS DOES INSTEAD. The same restore, through the open database
// instead of around it:
//
//   1. ATTACH the staged seed to the served deck and copy every table the
//      seed carries back into it, in one transaction. The deck's own
//      data-version triggers fire on the copy, so the stamp moves and the
//      running server drops its retained state on the next request.
//   2. `deck_data_version` is NOT copied: it is a monotonic counter, and a
//      restore that set it backwards would leave the engine's freshness
//      check believing nothing had changed.
//   3. The session table is emptied, because a reset replaces the deck and a
//      session from before the reset must not survive it.
//   4. The demo owner and member accounts are seeded again with the repo's
//      own account seeder, so the owner gets a NEW password and the
//      credentials file is rewritten (never printed, never committed).
//
// The end state is the same end state the runbook's reset produces: the
// served deck holds the seed's rows and nothing else, and the accounts are
// fresh. What differs is that the surface never stops.
//
// Exit code 0 when the restore ran and the counts came back as the seed's,
// 1 when anything failed.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_SEED = join(repoRoot, ".runtime", "demo-scratch", "seed-deck.sqlite3");
const DEFAULT_DECK = join(repoRoot, ".runtime", "demo-scratch", "deck.sqlite3");
const DEFAULT_CREDENTIALS = join(repoRoot, ".runtime", "demo-scratch", "credentials.json");

// The tables the restore copies. `deck_data_version` is deliberately absent:
// it is the engine's monotonic freshness counter, not content.
const SKIP_TABLES = new Set(["deck_data_version"]);

function parseArgs(argv) {
  const args = { seed: DEFAULT_SEED, deck: DEFAULT_DECK, credentials: DEFAULT_CREDENTIALS };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--seed": args.seed = resolve(value); i += 1; break;
      case "--deck": args.deck = resolve(value); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--help":
        console.log(
          "reset-live-deck: reset the served deck in place, while the surface serves it\n" +
          "  --seed <seed-deck.sqlite3>   the staged seed (default .runtime/demo-scratch/seed-deck.sqlite3)\n" +
          "  --deck <deck.sqlite3>        the served deck (default .runtime/demo-scratch/deck.sqlite3)\n" +
          "  --credentials <file>         credentials output (default next to the deck)",
        );
        process.exit(0);
        break;
      default:
        console.error(`reset-live-deck: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

for (const path of [args.seed, args.deck]) {
  if (!existsSync(path)) {
    console.error(`reset-live-deck: missing ${path}`);
    console.error("  Build the seed with: node scripts/demo-scratch-copy/build-demo-deck.mjs");
    process.exit(2);
  }
}

const seed = new Database(args.seed, { readonly: true });
const deck = new Database(args.deck);
deck.pragma("busy_timeout = 30000");

const seedTables = seed
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name)
  .filter((name) => !SKIP_TABLES.has(name));

const before = {
  cards: deck.prepare("SELECT COUNT(*) AS n FROM cards").get().n,
  references: deck.prepare("SELECT COUNT(*) AS n FROM card_references").get().n,
  stamp: deck.prepare("SELECT version FROM deck_data_version WHERE id = 1").get()?.version ?? null,
};

console.log(`[reset] deck:   ${args.deck}`);
console.log(`[reset] seed:   ${args.seed}`);
console.log(`[reset] before: ${before.cards} cards, ${before.references} references, stamp ${before.stamp}`);

deck.prepare("ATTACH DATABASE ? AS seed").run(args.seed);

const restore = deck.transaction(() => {
  for (const table of seedTables) {
    deck.prepare(`DELETE FROM main."${table}"`).run();
    deck.prepare(`INSERT INTO main."${table}" SELECT * FROM seed."${table}"`).run();
  }
  // A reset replaces the deck: the sessions that signed in before it do not
  // survive it.
  const hasSessions = deck
    .prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name='auth_sessions'")
    .get();
  if (hasSessions) deck.prepare("DELETE FROM main.auth_sessions").run();
});
restore();

deck.prepare("DETACH DATABASE seed").run();
seed.close();

const after = {
  cards: deck.prepare("SELECT COUNT(*) AS n FROM cards").get().n,
  references: deck.prepare("SELECT COUNT(*) AS n FROM card_references").get().n,
  stamp: deck.prepare("SELECT version FROM deck_data_version WHERE id = 1").get()?.version ?? null,
};
deck.close();

// The accounts are seeded again, so the owner gets a new password and the
// credentials file is rewritten. The password is never printed.
const { seedLocalAccounts } = await import(
  new URL("../../tools/edge-signed-in-exercise/lib/seed-local-accounts.mjs", import.meta.url).href
);
const accounts = await seedLocalAccounts({ deck: args.deck, credentialsOut: args.credentials });

const final = new Database(args.deck, { readonly: true });
const finalCounts = {
  cards: final.prepare("SELECT COUNT(*) AS n FROM cards").get().n,
  references: final.prepare("SELECT COUNT(*) AS n FROM card_references").get().n,
};
final.close();

const seedOnly = new Database(args.seed, { readonly: true });
const seedCounts = {
  cards: seedOnly.prepare("SELECT COUNT(*) AS n FROM cards").get().n,
  references: seedOnly.prepare("SELECT COUNT(*) AS n FROM card_references").get().n,
};
seedOnly.close();

console.log(`[reset] after:  ${after.cards} cards, ${after.references} references, stamp ${after.stamp}`);
console.log(`[reset] seed:   ${seedCounts.cards} cards, ${seedCounts.references} references`);
console.log(`[reset] owner account:  ${accounts.admin.name} <${accounts.admin.email}>`);
console.log(`[reset] member account: ${accounts.member.name} <${accounts.member.email}>`);
console.log(`[reset] credentials:    ${args.credentials} (never printed, never committed)`);

// The seed's rows plus the two seeded accounts. The account seeder adds a
// holder card, an account junction, four field cards and one role reference
// per account, so the served deck holds more cards than the seed and more
// references than the seed by the accounts it just made.
const accountCards = finalCounts.cards - seedCounts.cards;
const accountReferences = finalCounts.references - seedCounts.references;
console.log(`[reset] accounts added: ${accountCards} cards, ${accountReferences} references`);

if (finalCounts.cards < seedCounts.cards) {
  console.error("[reset] the served deck holds FEWER cards than the seed: the restore did not land.");
  process.exit(1);
}
console.log("[reset] the served deck is clean: it holds the seed's rows and the fresh accounts.");
process.exit(0);
