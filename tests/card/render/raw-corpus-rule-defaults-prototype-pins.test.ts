// raw-corpus-rule-defaults-prototype-pins.test.ts -- the rule-defaults
// mechanism lane's byte pins. Eleven view-lane signatures the lane closed
// (viewsig census roots R2 + R3 + R4, shards 000000-000007), each asserted
// BYTE-EXACT against the captured Ruby oracle in the view-lane shards after
// normalizeSlotIds:
//
//   R2 (virtual rule rows resolve through set_prototype's PROTOTYPE walk,
//       editor.rb:119-130 + set.rb:90-93, not the set card's own patterns):
//     Recommendations+*right                     shard 000007  content+open
//     RichText+Recommendations+*type plus right  shard 000007  content+open
//     RichText+Gallery10+*type plus right        shard 000006  content+open
//       - Recommendations rows: prototype *dummy+Recommendations types News
//         Item via Recommendations+*right+*default (rule 11377) -> the
//         *create walk hits News Item+*type+*create (rule 14192,
//         [Administrator, Team]); the Gallery10 rows ride the dup_structure
//         leg (templating.rb:61-65): RichText+Gallery10+*type plus
//         right+*structure (rule 10525, HTML-typed) becomes the template ->
//         prototype types HTML -> HTML+*type+*create (rule 6553, [Shark]).
//   R3 (*star set page read row):
//     *star                                      shard 000003  content+open
//       - prototype *dummy (simple) skips compound-only *all plus in the
//         *default walk (02_all_plus.rb:1) -> *all+*default (rule 28,
//         BasicCs-typed) -> BasicCs+*type+*read (rule 22283,
//         "Anyone Signed In") — not *all+*read ("Anyone").
//   R4 (*rstar set page default row + the Metashamanic phantom verdict):
//     *rstar                                     shard 000003  content+open
//       - prototype *dummy+*dummy (compound) lands on *all plus+*default
//         (rule 17827, RichText) -> the *default walk hits
//         RichText+*type+*default (rule 21450) — "RichText : <em>empty</em>"
//         renders where the over-denied engine emitted the quiet span.
//     Metashamanic+Core Project                 shard 000000  open
//       - the unknown list item mytho-psychology's verdict is PER-HOST
//         (Ruby's phantom is a fresh Card per Nest::Fetch#new_card): this
//         host's Project-typed fold reads allowed via *all+*read; a foreign
//         host's earlier fold of the same name must not poison it.
//
// RUN (explicitly; needs the machine-local raw corpus via
// tmp/raw-ground-truth and the view-lane shards -- one corpus boot, eleven
// renders):
//   RULE_DEFAULTS_PINS=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-rule-defaults-prototype-pins.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec
// skips, so ordinary suite runs neither slow down nor fail on absent data.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const VIEW_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane",
);

const PINS_REQUESTED = process.env.RULE_DEFAULTS_PINS === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(VIEW_LANE_DIR);

/** The eleven closed signatures: (card name, view, view-lane shard). */
const PINS: Array<{ name: string; view: string; shard: string }> = [
  { name: "Recommendations+*right", view: "content", shard: "recapture-raw-shard-000007.jsonl" },
  { name: "Recommendations+*right", view: "open", shard: "recapture-raw-shard-000007.jsonl" },
  { name: "RichText+Recommendations+*type plus right", view: "content", shard: "recapture-raw-shard-000007.jsonl" },
  { name: "RichText+Recommendations+*type plus right", view: "open", shard: "recapture-raw-shard-000007.jsonl" },
  { name: "RichText+Gallery10+*type plus right", view: "content", shard: "recapture-raw-shard-000006.jsonl" },
  { name: "RichText+Gallery10+*type plus right", view: "open", shard: "recapture-raw-shard-000006.jsonl" },
  { name: "*star", view: "content", shard: "recapture-raw-shard-000003.jsonl" },
  { name: "*star", view: "open", shard: "recapture-raw-shard-000003.jsonl" },
  { name: "*rstar", view: "content", shard: "recapture-raw-shard-000003.jsonl" },
  { name: "*rstar", view: "open", shard: "recapture-raw-shard-000003.jsonl" },
  { name: "Metashamanic+Core Project", view: "open", shard: "recapture-raw-shard-000000.jsonl" },
];

interface ShardLine {
  name: string;
  views?: Record<string, string>;
}

function readShard(shard: string): ShardLine[] {
  return (readFileSync(path.join(VIEW_LANE_DIR, shard), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ShardLine));
}

describeOrSkipLoud(!(PINS_REQUESTED && CORPUS_PRESENT && SHARDS_PRESENT), "tests/card/render/raw-corpus-rule-defaults-prototype-pins.test.ts", "PINS_REQUESTED && CORPUS_PRESENT && SHARDS_PRESENT")(
  "rule-defaults prototype pins (view-lane R2/R3/R4 oracle bytes)",
  () => {
    it("renders all eleven closed signatures byte-exact against the oracle", async () => {
      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      try {
        storage.fetcher.installNameEnvironment();
        await storage.fetcher.warmLexicon(everyLiveId);
        const shardCache = new Map<string, ShardLine[]>();
        const failures: string[] = [];
        for (const pin of PINS) {
          let shard = shardCache.get(pin.shard);
          if (shard === undefined) {
            shard = readShard(pin.shard);
            shardCache.set(pin.shard, shard);
          }
          const line = shard.find((l) => l.name === pin.name);
          const expected = line?.views?.[pin.view];
          if (expected === undefined) {
            failures.push(`${pin.name}::${pin.view}: MISSING ORACLE (shard ${pin.shard})`);
            continue;
          }
          const actual = await storage.engine.render(pin.name, pin.view);
          const expN = normalizeSlotIds(expected);
          const actN = normalizeSlotIds(actual);
          const d = byteDiff(expN, actN);
          if (d.equal !== true) {
            failures.push(
              `${pin.name}::${pin.view}: byte diff (expected ${d.expectedBytes}, actual ${d.actualBytes}` +
                `${d.firstDifference != null ? `, first diff @${d.firstDifference.codeUnitOffset}` : ""})`,
            );
          }
          expect(d.equal, `${pin.name}::${pin.view}`).toBe(true);
        }
        expect(failures).toEqual([]);
      } finally {
        storage.close();
      }
    }, 900_000);
  },
);
