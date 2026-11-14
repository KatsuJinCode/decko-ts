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
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eatYaml, type EatReport } from "../../src/card/pods/eat.js";
import { bootDeck } from "../../src/card/pods/deck.js";
import { sowYaml, type SowOptions } from "../../src/card/pods/sow.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// The deck pods are eaten into. Supplied via PODS_BASE_DECK; the default is
// the repo-local persistence workspace (tmp/ is not committed), and the
// suite skips loudly when the file is absent.
const BASE =
  process.env.PODS_BASE_DECK ?? path.join(REPO, "tmp/persist/oracle-base-deck.sqlite3");
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

// 2. decko sow's other sources and outputs, from the Ruby deck the
//    persistence op list leaves (run-ruby-steps.sh KEEP_DECK): --items only
//    and --items for list cards (a missing item becomes a new card's pod),
//    --url from a local pod file, and -m merging into an existing data file
//    (tests/fixtures/pods/merge-target.yml). Each must equal Ruby's pod for
//    the same options byte for byte (tools/persistence/run-pod-features.sh
//    made tests/fixtures/pods/sow-features/*.ruby.yml).
const PROBE_DECK = process.env.PODS_PROBE_DECK ?? path.join(REPO, "tmp/persist/ruby-after-70.sqlite3");
const RUN_SOW = existsSync(PROBE_DECK) || process.env.PODS_PARITY === "1";
if (!RUN_SOW) {
  process.stderr.write(
    `[pods] SKIPPED sow features: probe deck not found at ${PROBE_DECK} (set PODS_PROBE_DECK; ` +
      "tools/persistence/run-ruby-steps.sh with KEEP_DECK makes it)\n",
  );
}
const SOW_CASES: { file: string; opts: SowOptions }[] = [
  { file: "items-only", opts: { names: ["PersistProbe List"], items: "only" } },
  {
    file: "items-and-cards",
    opts: { names: ["PersistProbe List", "PersistProbe Form2+PersistProbe Tags"], items: true },
  },
  { file: "from-url", opts: { url: path.join(FIXTURES, "conflict-modes.yml") } },
  {
    file: "merged",
    opts: { names: ["PersistProbe List"], items: "only", mergeInto: path.join(FIXTURES, "merge-target.yml") },
  },
];

/** The stored files under a deck files directory: "<card>/<file>" and the
 *  SHA-1 of every file but the image versions (their bytes come from each
 *  side's own image encoder, so they are not comparable). */
function storedFiles(root: string): { file: string; sha1: string | null }[] {
  const out: { file: string; sha1: string | null }[] = [];
  for (const dir of readdirSync(root).sort()) {
    for (const name of readdirSync(path.join(root, dir)).sort()) {
      const version = /-(icon|small|medium|large)\./.test(name);
      out.push({
        file: `${dir}/${name}`,
        sha1: version ? null : createHash("sha1").update(readFileSync(path.join(root, dir, name))).digest("hex"),
      });
    }
  }
  return out;
}

describe("pod features (TS engine against the Ruby oracle)", () => {
  // 3. Attachments: a pod whose items name files in the mod's data/files
  //    (tests/fixtures/pods/files), eaten into a fresh copy of the oracle
  //    deck: the same rows and the same stored files as Ruby's decko eat.
  it.runIf(RUN)("pod attachments store Ruby's rows and files", async () => {
    mkdirSync(WORK, { recursive: true });
    const store = path.join(WORK, "attachment-store");
    rmSync(store, { recursive: true, force: true });
    const target = path.join(WORK, "attachments.sqlite3");
    copyFileSync(BASE, target);
    try {
      const deck = await bootDeck(target, { filesDir: store });
      try {
        const report = await eatYaml(
          deck.fetcher,
          (actor, now) => deck.engineFor(actor, now),
          readFileSync(path.join(FIXTURES, "attachments.yml"), "utf8"),
          { defaultActor: BOT, filesDir: path.join(FIXTURES, "files") },
        );
        expect(report.errors).toEqual([]);
      } finally {
        deck.close();
      }
      const run = spawnSync(
        process.execPath,
        [
          path.join(REPO, "tools/persistence/compare-decks.mjs"),
          BASE,
          path.join(FIXTURES, "attachments.ruby-delta.json"),
          target,
          path.join(WORK, "report.json"),
        ],
        { windowsHide: true, encoding: "utf8" },
      );
      expect(run.status, run.stderr).toBe(0);
      const ruby = JSON.parse(readFileSync(path.join(FIXTURES, "attachments.ruby-files.json"), "utf8"));
      expect(storedFiles(store)).toEqual(ruby);
    } finally {
      for (const f of [target, `${target}-shm`, `${target}-wal`]) rmSync(f, { force: true });
      rmSync(store, { recursive: true, force: true });
    }
  }, 300000);

  // 4. Coded storage (storage_type: :coded): a coded pod eaten into a fresh
  //    copy of the oracle deck. The files are kept in the mod
  //    (<codedDir>/data/files/<codename parts>), the card's content becomes
  //    the coded identifier, and the refusals are Ruby's
  //    validate_coded_storage_type messages (tests/fixtures/pods/
  //    coded-storage.ruby-eat.json; tools/persistence/run-pod-coded.sh made
  //    the Ruby artifacts).
  it.runIf(RUN)("pod coded storage stores Ruby's rows and mod files", async () => {
    mkdirSync(WORK, { recursive: true });
    const store = path.join(WORK, "coded-store");
    const modDir = path.join(WORK, "coded-mod");
    rmSync(store, { recursive: true, force: true });
    rmSync(modDir, { recursive: true, force: true });
    const target = path.join(WORK, "coded.sqlite3");
    copyFileSync(BASE, target);
    const report: EatReport = { items: 0, created: 0, updated: 0, unchanged: 0, skippedNotPristine: [], errors: [] };
    try {
      const deck = await bootDeck(target, { filesDir: store, codedDir: modDir });
      try {
        const eaten = await eatYaml(
          deck.fetcher,
          (actor, now) => deck.engineFor(actor, now),
          readFileSync(path.join(FIXTURES, "coded-storage.yml"), "utf8"),
          {
            defaultActor: BOT,
            filesDir: path.join(FIXTURES, "files"),
            codedMod: "parity_pod_mod",
            codedDir: modDir,
          },
        );
        Object.assign(report, eaten);
      } finally {
        deck.close();
      }
      const run = spawnSync(
        process.execPath,
        [
          path.join(REPO, "tools/persistence/compare-decks.mjs"),
          BASE,
          path.join(FIXTURES, "coded-storage.ruby-delta.json"),
          target,
          path.join(WORK, "coded-report.json"),
        ],
        { windowsHide: true, encoding: "utf8" },
      );
      expect(run.status, run.stderr).toBe(0);
      // The mod files Ruby's eat stored.
      const ruby = JSON.parse(readFileSync(path.join(FIXTURES, "coded-storage.ruby-files.json"), "utf8"));
      expect(storedFiles(path.join(modDir, "data", "files"))).toEqual(ruby);
      // The eat report: the item outcomes and the exact error wordings.
      const rubyReport = JSON.parse(
        readFileSync(path.join(FIXTURES, "coded-storage.ruby-eat.json"), "utf8"),
      ) as EatReport;
      expect(report.items).toBe(rubyReport.items);
      expect(report.skippedNotPristine).toEqual(rubyReport.skippedNotPristine);
      expect(report.errors).toEqual(rubyReport.errors);
    } finally {
      for (const f of [target, `${target}-shm`, `${target}-wal`]) rmSync(f, { force: true });
      rmSync(store, { recursive: true, force: true });
      rmSync(modDir, { recursive: true, force: true });
    }
  }, 300000);

  it.runIf(RUN_SOW)("sow's --items, --url and -m pods equal Ruby's byte for byte", async () => {
    mkdirSync(WORK, { recursive: true });
    const copy = path.join(WORK, "probe-deck.sqlite3");
    copyFileSync(PROBE_DECK, copy);
    try {
      const deck = await bootDeck(copy, { readonly: true });
      try {
        for (const { file, opts } of SOW_CASES) {
          const ruby = readFileSync(path.join(FIXTURES, "sow-features", `${file}.ruby.yml`), "utf8");
          expect(await sowYaml(deck.fetcher, opts), file).toBe(ruby);
        }
      } finally {
        deck.close();
      }
    } finally {
      for (const f of [copy, `${copy}-shm`, `${copy}-wal`]) rmSync(f, { force: true });
    }
  }, 300000);

  it("--remote reads <remote>/<name url key>/pod.yml", async () => {
    const asked: string[] = [];
    const yaml = await sowYaml({} as Parameters<typeof sowYaml>[0], {
      remote: "https://deck.example.org",
      names: ["Some Card+Field"],
      readUrl: async (u) => {
        asked.push(u);
        return "---\n- :name: Some Card\n";
      },
    });
    expect(asked).toEqual(["https://deck.example.org/Some_Card+Field/pod.yml"]);
    expect(yaml).toBe("---\n- :name: Some Card\n");
  });

  // 5. `sow --remote` against the Ruby oracle: a local server serves the
  //    committed pod tree (tests/fixtures/pods/remote-tree/), and the port's
  //    remote fetch must read it to exactly the bytes Ruby's --remote
  //    produced for the same request (tools/persistence/run-pod-remote.sh
  //    made from-remote.ruby.yml and logged the path Ruby asked for). The
  //    server records what the port asks for, so the URL shape is part of
  //    the check.
  it.runIf(existsSync(path.join(FIXTURES, "remote-tree")))(
    "--remote fetches what Ruby's --remote fetches, byte for byte",
    async () => {
      const { createServer } = await import("node:http");
      const tree = path.join(FIXTURES, "remote-tree");
      const ruby = readFileSync(path.join(FIXTURES, "sow-features", "from-remote.ruby.yml"), "utf8");
      const server = createServer((req, res) => {
        const url = req.url ?? "/";
        const rest = url.replace(/^\//, "");
        if (rest.includes("..")) {
          res.writeHead(403).end();
          return;
        }
        const file = path.join(tree, rest);
        if (existsSync(file) && file.startsWith(tree)) {
          res.writeHead(200, { "content-type": "text/yaml" }).end(readFileSync(file));
        } else {
          res.writeHead(404).end("not found");
        }
      });
      const port = await new Promise<number>((resolvePort) => {
        server.listen(0, "127.0.0.1", () => {
          resolvePort((server.address() as { port: number }).port);
        });
      });
      try {
        const yaml = await sowYaml({} as Parameters<typeof sowYaml>[0], {
          remote: `http://127.0.0.1:${port}`,
          names: ["PersistProbe List"],
        });
        expect(yaml).toBe(ruby);
      } finally {
        await new Promise<void>((closeDone) => server.close(() => closeDone()));
      }
    },
  );

  it.runIf(RUN)("conflict modes and codename-versus-name resolution leave Ruby's rows", async () => {
    const result = await eatAndCompare(
      path.join(FIXTURES, "conflict-modes.yml"),
      path.join(FIXTURES, "conflict-modes.ruby-delta.json"),
    );
    expect(result.status, result.stderr).toBe(0);
  }, 300000);
});
