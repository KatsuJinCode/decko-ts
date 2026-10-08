// Import/export features beyond the plain round trip, each checked against
// the Ruby oracle's result for the same input:
//
//   1. Card.ensure's conflict modes: a pod (tests/fixtures/pods/
//      conflict-modes.yml) with :defer and :override items and codenames
//      whose names belong to other cards, eaten into a fresh copy of the
//      oracle deck. Every table of the result must equal what Ruby's
//      `decko eat` left (its delta against the deck, committed as
//      conflict-modes.ruby-delta.json; tools/persistence/pod-eat.rb made it).
//
// Needs the local oracle deck; skips loudly without it (PODS_PARITY=1 makes
// the skip a failure).

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eatYaml } from "../../src/card/pods/eat.js";
import { bootDeck } from "../../src/card/pods/deck.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE =
  process.env.PODS_BASE_DECK ?? "C:/localProjects/decko-oracle-app-parity-fix/db/development.sqlite3";
const FIXTURES = path.join(REPO, "tests/fixtures/pods");
const WORK = path.join(REPO, "tmp/persist/pod-features");
const BOT = { id: 1, name: "Decko Bot" };
const RUN = existsSync(BASE) || process.env.PODS_PARITY === "1";
if (!RUN) process.stderr.write(`[pods] SKIPPED: oracle deck not found at ${BASE} (set PODS_BASE_DECK)\n`);

/** Eat a pod into a fresh copy of the oracle deck, then compare every table
 *  with Ruby's committed delta. */
async function eatAndCompare(pod: string, rubyDelta: string): Promise<{ status: number | null; stderr: string }> {
  mkdirSync(WORK, { recursive: true });
  const target = path.join(WORK, `${path.basename(pod, ".yml")}.sqlite3`);
  copyFileSync(BASE, target);
  try {
    const deck = await bootDeck(target);
    try {
      await eatYaml(deck.fetcher, (actor, now) => deck.engineFor(actor, now), readFileSync(pod, "utf8"), {
        defaultActor: BOT,
      });
    } finally {
      deck.close();
    }
    const run = spawnSync(
      process.execPath,
      [path.join(REPO, "tools/persistence/compare-decks.mjs"), BASE, rubyDelta, target, path.join(WORK, "report.json")],
      { windowsHide: true, encoding: "utf8" },
    );
    return { status: run.status, stderr: run.stderr };
  } finally {
    for (const f of [target, `${target}-shm`, `${target}-wal`]) rmSync(f, { force: true });
  }
}

describe("pod features (TS engine against the Ruby oracle)", () => {
  it.runIf(RUN)("conflict modes and codename-versus-name resolution leave Ruby's rows", async () => {
    const result = await eatAndCompare(
      path.join(FIXTURES, "conflict-modes.yml"),
      path.join(FIXTURES, "conflict-modes.ruby-delta.json"),
    );
    expect(result.status, result.stderr).toBe(0);
  }, 300000);
});
