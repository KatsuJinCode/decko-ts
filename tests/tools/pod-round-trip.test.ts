// Import/export parity: `decko sow` / `decko eat` against the TS port.
//
// Inputs (local artifacts; the test skips loudly without them, and
// PODS_PARITY=1 turns the skip into a failure):
//   PODS_SRC_DECK   the deck the pods are sown from — the Ruby oracle deck as
//                   the persistence op list left it (run-ruby-steps.sh KEEP_DECK)
//   PODS_BASE_DECK  the deck pods are eaten into — the untouched oracle deck
//   PODS_DIR        where the Ruby side's pods live and the TS pods are written
//                   (tools/persistence/run-pod-round-trips.sh fills it)
//
// Measured here (TS engine):
//   1. TS sow of the source deck is byte-identical to Ruby's sow of it.
//   2. Ruby -> TS: Ruby's pod eaten by TS into a fresh copy of the base deck;
//      sowing that deck gives Ruby's pod back, byte for byte.
//   3. TS -> TS: the same with TS's own pod.
// The Ruby-eats directions (TS -> Ruby, Ruby -> Ruby) run in Ruby
// (run-pod-round-trips.sh) on the TS pod written here.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sowYaml } from "../../src/card/pods/sow.js";
import { eatYaml, type EatReport } from "../../src/card/pods/eat.js";
import { dumpYaml, loadYaml } from "../../src/card/pods/pod-yaml.js";
import { bootDeck } from "../../src/card/pods/deck.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = process.env.PODS_SRC_DECK ?? path.join(REPO, "tmp/persist/pods/src.sqlite3");
const BASE =
  process.env.PODS_BASE_DECK ?? "C:/localProjects/decko-oracle-app-parity-fix/db/development.sqlite3";
const DIR = process.env.PODS_DIR ?? path.join(REPO, "tmp/persist/pods");
const RUBY_POD = path.join(DIR, "ruby-src.yml");
const HAVE = existsSync(SRC) && existsSync(BASE) && existsSync(RUBY_POD);
const RUN = HAVE || process.env.PODS_PARITY === "1";
if (!RUN) {
  process.stderr.write(
    `[pods] SKIPPED: need ${SRC}, ${BASE} and ${RUBY_POD} (tools/persistence/run-pod-round-trips.sh)\n`,
  );
}
const ALL = { cql: {} };
const BOT = { id: 1, name: "Decko Bot" };

async function sowDeck(dbPath: string): Promise<string> {
  const deck = await bootDeck(dbPath, { readonly: true });
  try {
    return await sowYaml(deck.fetcher, ALL);
  } finally {
    deck.close();
  }
}

async function eatInto(podYaml: string, target: string): Promise<EatReport> {
  copyFileSync(BASE, target);
  const deck = await bootDeck(target);
  try {
    return await eatYaml(deck.fetcher, (actor) => deck.engineFor(actor), podYaml, { defaultActor: BOT });
  } finally {
    deck.close();
  }
}

/** Item-level comparison of two pods: items lost (in `from`, not in `back`)
 *  and items gained, each by its exact YAML. */
function itemDiff(from: string, back: string): { lost: string[]; gained: string[] } {
  const items = (text: string): string[] => {
    const loaded = loadYaml(text);
    return (Array.isArray(loaded) ? loaded : []).map((item) => dumpYaml([item]).replace(/^---\n/, ""));
  };
  const a = items(from);
  const b = items(back);
  const count = (list: string[]): Map<string, number> =>
    list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(a);
  const cb = count(b);
  const lost: string[] = [];
  const gained: string[] = [];
  for (const [k, n] of ca) for (let i = 0; i < n - (cb.get(k) ?? 0); i++) lost.push(k);
  for (const [k, n] of cb) for (let i = 0; i < n - (ca.get(k) ?? 0); i++) gained.push(k);
  return { lost, gained };
}

// The one item a round trip adds: the source deck holds a live junction,
// "PersistProbe Parent+PersistProbe Child", under a TRASHED left part (what
// Ruby's Card#update!(trash: false) leaves, probe step 19). The pod lists the
// junction but not the trashed parent, so eating it creates the parent, live
// and empty, exactly as creating that junction does in either engine.
const EXPECTED_GAINED = ["- :name: PersistProbe Parent\n"];

// The one outcome that differs, with no stored difference: Card.ensure! runs
// `validate` on every pristine card before deciding whether to save
// (director/all.rb save_if_needed!), so Ruby runs *signin's sign-in
// validation on its no-op ensure and reports "email can't be blank". The port
// decides "nothing changes" without running the validate stage and counts it
// unchanged. Neither engine writes anything for it.
const SIGNIN_ITEM = "*signin";

function firstDifference(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}: ruby=${JSON.stringify(la[i])} ts=${JSON.stringify(lb[i])}`;
  }
  return "identical";
}

describe("pods (decko sow / decko eat)", () => {
  it.runIf(RUN)("TS sow equals Ruby sow, and both eat directions into TS lose nothing", async () => {
    mkdirSync(DIR, { recursive: true });
    const rubyPod = readFileSync(RUBY_POD, "utf8");
    const tsPod = await sowDeck(SRC);
    writeFileSync(path.join(DIR, "ts-src.yml"), tsPod);
    expect(firstDifference(rubyPod, tsPod)).toBe("identical");

    const results: Record<string, unknown> = {};
    for (const [label, pod] of [
      ["ruby-to-ts", rubyPod],
      ["ts-to-ts", tsPod],
    ] as const) {
      const target = path.join(DIR, `${label}.sqlite3`);
      try {
        const report = await eatInto(pod, target);
        const back = await sowDeck(target);
        writeFileSync(path.join(DIR, `${label}.yml`), back);
        const diff = itemDiff(pod, back);
        results[label] = { ...report, ...diff };
        writeFileSync(path.join(DIR, "ts-eat-report.json"), JSON.stringify(results, null, 2));
        // What a trip loses or gains equals what Ruby's own trip (Ruby eating
        // Ruby's pod, run-pod-round-trips.sh eat) loses or gains, when that
        // pod is present; otherwise nothing is lost and only the expected card
        // is gained.
        const rubyTrip = path.join(DIR, "ruby-to-ruby.yml");
        const expected = existsSync(rubyTrip)
          ? itemDiff(rubyPod, readFileSync(rubyTrip, "utf8"))
          : { lost: [], gained: EXPECTED_GAINED };
        expect(diff.lost, `${label}: items lost`).toEqual(expected.lost);
        expect(diff.gained, `${label}: items gained`).toEqual(expected.gained);
        // Each item's outcome equals Ruby's eating the same pod into the same
        // deck (run-pod-round-trips.sh eat), when that report is present.
        const rubyReport = path.join(DIR, `${label.replace(/-to-ts$/, "-to-ruby")}.eat.json`);
        if (existsSync(rubyReport)) {
          const ruby = JSON.parse(readFileSync(rubyReport, "utf8")) as EatReport;
          // The created / updated / unchanged tallies are not compared: the
          // Ruby harness infers them (a card existing before, the act count
          // growing), the port reports each save's outcome, and the two
          // classify a save that runs an account's events differently while
          // storing the same rows. The stored rows are compared table by
          // table by compare-decks.mjs.
          const outcomes = (r: EatReport, signinUnchanged: boolean) => ({
            items: r.items,
            skippedNotPristine: r.skippedNotPristine,
            // the items that failed (each engine's validation message
            // wording is out of scope here)
            errorItems: r.errors.map((e) => e.item).filter((i) => !(signinUnchanged && i === SIGNIN_ITEM)),
          });
          expect(outcomes(report, false), `${label} vs Ruby's eat`).toEqual(outcomes(ruby, true));
        } else {
          process.stderr.write(`[pods] no Ruby eat report at ${rubyReport}; outcomes not compared\n`);
        }
      } finally {
        // PODS_KEEP_DECKS=1 keeps the eaten deck for compare-decks.mjs.
        if (process.env.PODS_KEEP_DECKS !== "1") {
          for (const f of [target, `${target}-shm`, `${target}-wal`]) rmSync(f, { force: true });
        }
      }
    }
    writeFileSync(path.join(DIR, "ts-eat-report.json"), JSON.stringify(results, null, 2));
  }, 900000);
});
