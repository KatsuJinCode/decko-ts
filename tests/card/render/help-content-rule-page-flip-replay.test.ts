// help-content-rule-page-flip-replay.test.ts -- the help-content suite's
// fresh-process flip measurement over the escape-family population (the 35+
// `mod: X+*style|script` rule pages + *on create|delete|update + *style rule
// pages the escape-family receipt routed here). For every a work item fail-dump
// exemplar of the family (tmp/raw-ground-truth/enumeration/view-fail-dump-
// full/html/<shard>-<name slug>-closed.expected.html) this spec renders the
// page from the raw corpus DB with the same seeding the official dump protocol
// used (dump-view-lane-fails: createRawStructureSeededStorage over every live
// id + warmLexicon) and compares the menu popover's data-bs-content attribute
// bytes against the oracle's. The attribute is the unit this suite owns (whole
// pages carry other ports' pending diffs), so flip counts are attribute-level.
//
// The card name is recovered from the view-lane shard jsonl by slug-matching
// (the dump key is `${shardDigits}-${slug(name)}-${slug(view)}`, slug =
// s.replace(/[^A-Za-z0-9._-]+/g, "_") -- dump-view-lane-fails.test.ts:135,349),
// and the recovered expected html is sanity-checked byte-identical to the dump
// file so a slug collision cannot silently mislabel a page.
//
// RUN (fresh process, one at a time; needs the machine-local raw corpus):
//   HELP_CONTENT_FLIP_REPLAY=1 HELP_CONTENT_FLIP_LABEL=tip \
//   NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/help-content-rule-page-flip-replay.test.ts \
//     --no-file-parallelism
//
// Prints `[help-content-flip] TOTALS pages=<n> equal=<n> unequal=<n>
// errors=<n>` and writes tmp/help-content-lane/help-flip-<label>.jsonl (one
// line per page: key, name, helpEqual, oracleHelp, renderedHelp). Outside the
// gate the spec skips so ordinary suite runs neither slow down nor fail.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { skipLoud } from "../../support/describe-with-corpus.js";
import {
  createRawStructureSeededStorage,
  RAW_CORPUS_DB,
} from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const VIEW_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");
const DUMP_HTML_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "enumeration", "view-fail-dump-full", "html",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "help-content-lane");

const REPLAY_REQUESTED = process.env.HELP_CONTENT_FLIP_REPLAY === "1";
const RUN_LABEL = process.env.HELP_CONTENT_FLIP_LABEL ?? "run";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const DUMPS_PRESENT = existsSync(DUMP_HTML_DIR);

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

/** The escape-family population: mod style/script junctions, the event
 *  setting cards' own pages, the *style/*script setting cards + *all+*style|
 *  script rule junctions, and the Sign up+*type+*on create rule page. */
function isFamilyNameSlug(nameSlug: string): boolean {
  if (/^mod_.+_(style|script)$/.test(nameSlug)) return true;
  if (/^_(style|script|all_style|all_script|on_create|on_delete|on_update)$/.test(nameSlug)) {
    return true;
  }
  return nameSlug === "Sign_up_type_on_create";
}

interface DumpKey {
  key: string;
  shard: string;
  nameSlug: string;
  view: string;
}

function parseDumpKey(file: string): DumpKey | undefined {
  if (!file.endsWith(".expected.html")) return undefined;
  const key = file.slice(0, -".expected.html".length);
  if (!key.endsWith("-closed")) return undefined; // menu help is view-invariant; closed is the exemplar
  const firstDash = key.indexOf("-");
  const lastDash = key.lastIndexOf("-");
  if (firstDash < 0 || lastDash <= firstDash) return undefined;
  const shard = key.slice(0, firstDash);
  const view = key.slice(lastDash + 1);
  const nameSlug = key.slice(firstDash + 1, lastDash);
  return { key, shard, nameSlug, view };
}

/** First data-bs-content attribute value, attribute-escaped bytes. The value
 *  cannot contain a raw double quote (ERB::Util escapes it to &quot;), so the
 *  scan-to-next-quote is exact. */
function helpContentOf(html: string): string | undefined {
  const marker = 'data-bs-content="';
  const start = html.indexOf(marker);
  if (start < 0) return undefined;
  const rest = html.slice(start + marker.length);
  return rest.slice(0, rest.indexOf('"'));
}

interface ShardLine {
  lane?: string;
  name?: string;
  views?: Record<string, string>;
  error?: unknown;
}

/** shardDigits -> name slug -> {name, expectedHtml} from the view lane jsonl. */
function loadShardIndex(shard: string): Map<string, { name: string; expected: string }> {
  const idx = new Map<string, { name: string; expected: string }>();
  const file = path.join(VIEW_LANE_DIR, `recapture-raw-shard-${shard}.jsonl`);
  const raw = readFileSync(file, "utf8");
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = JSON.parse(line) as ShardLine;
    if (parsed.lane !== "view" || parsed.views === undefined || parsed.name === undefined) continue;
    for (const [view, html] of Object.entries(parsed.views)) {
      idx.set(`${slug(parsed.name)}-${slug(view)}`, { name: parsed.name, expected: html });
    }
  }
  return idx;
}

describe("help-content lane: escape-family flip measurement", () => {
  it(
    "renders every family fail-dump page and compares the data-bs-content bytes",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/help-content-rule-page-flip-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(DUMPS_PRESENT, `fail dump missing: ${DUMP_HTML_DIR}`).toBe(true);

      const dumps = readdirSync(DUMP_HTML_DIR)
        .map(parseDumpKey)
        .filter((k): k is DumpKey => k !== undefined && isFamilyNameSlug(k.nameSlug));

      const shardIndexes = new Map<string, Map<string, { name: string; expected: string }>>();
      interface PageResult {
        key: string;
        name: string;
        helpEqual: boolean | "error";
        oracleHelp: string | undefined;
        renderedHelp: string | undefined;
      }
      const results: PageResult[] = [];

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      for (const dump of dumps) {
        let idx = shardIndexes.get(dump.shard);
        if (idx === undefined) {
          idx = loadShardIndex(dump.shard);
          shardIndexes.set(dump.shard, idx);
        }
        const found = idx.get(`${dump.nameSlug}-${dump.view}`);
        if (found === undefined) {
          results.push({
            key: dump.key,
            name: `(slug lookup miss: ${dump.nameSlug})`,
            helpEqual: "error",
            oracleHelp: undefined,
            renderedHelp: undefined,
          });
          continue;
        }
        const dumpPath = path.join(DUMP_HTML_DIR, `${dump.key}.expected.html`);
        const dumpBytes = readFileSync(dumpPath, "utf8");
        // fixture sanity: the recovered shard entry IS the dumped page
        expect(dumpBytes, `${dump.key}: shard entry != dump file`).toBe(found.expected);

        const oracleHelp = helpContentOf(found.expected);
        let renderedHelp: string | undefined;
        let helpEqual: boolean | "error";
        try {
          const html = await storage.engine.render(found.name, dump.view);
          renderedHelp = helpContentOf(html);
          helpEqual = renderedHelp !== undefined && renderedHelp === oracleHelp;
        } catch (error) {
          helpEqual = "error";
          renderedHelp = `RAISED ${(error as Error).constructor.name}`;
        }
        results.push({ key: dump.key, name: found.name, helpEqual, oracleHelp, renderedHelp });
      }
      storage.close();

      const equal = results.filter((r) => r.helpEqual === true).length;
      const unequal = results.filter((r) => r.helpEqual === false).length;
      const errors = results.filter((r) => r.helpEqual === "error").length;
      mkdirSync(OUT_DIR, { recursive: true });
      const outPath = path.join(OUT_DIR, `help-flip-${RUN_LABEL}.jsonl`);
      writeFileSync(
        outPath,
        results.map((r) => JSON.stringify(r)).join("\n") + "\n",
        "utf8",
      );
      for (const r of results) {
        if (r.helpEqual !== true) {
          console.log(
            `[help-content-flip] UNEQUAL ${r.key} (${r.name}): ` +
              `oracle=${JSON.stringify(r.oracleHelp)} rendered=${JSON.stringify(r.renderedHelp)}`,
          );
        }
      }
      console.log(
        `[help-content-flip] TOTALS pages=${results.length} equal=${equal} ` +
          `unequal=${unequal} errors=${errors} out=${outPath}`,
      );
      expect(errors, "slug-lookup/render errors must be zero").toBe(0);
    },
  );
});
