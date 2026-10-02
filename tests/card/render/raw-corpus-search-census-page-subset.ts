// raw-corpus-search-census-page-subset.ts -- the page-mechanism census's
// c-structural subset, pinned for the search-results replay
// (raw-corpus-search-census-page-replay.test.ts).
//
// PROVENANCE. The 47 rows are exactly the entries the 2026-09-29
// page-mechanism census (tmp/raw-ground-truth/scripts/
// page-mechanism-census.test.ts over the phase/shard windows below) classified
// c-structural in its second-pass mechanism analysis
// (tmp/census/mechanism-analysis.json, analyze-census-pages.mjs, pageMechSets
// where mechs includes "c-structural"). These are the pages the search-parity
// receipts (tmp/wrong-goal-hunt/search-parity.md, search-parity-2.md) named
// the "David Williams / John Abbe class": pages whose oracle HTML lists
// search-result-item bars where the engine rendered search-no-results -- the
// `plus: {refer_to}` CQL class whose resolution needs (1) the CQL-name
// db-fallback leg (lane-search-cache d078357) and (2) the harness's full
// card_references graph (raw-corpus-seeding.ts). The census's c-structural
// class means the page's diff carried at least one resync-failed terminal
// region; most of these pages ALSO carry other census mechanisms
// (content-divergence, double-escape, link-query-dropped, ...), so byte-exact
// parity here requires more than the search flip -- the replay classifies
// each remaining divergence into the census mechanism families.
//
// phase -> shard files is the census window mapping
// (tmp/census/run-census-windows.sh); the oracle bytes are the lane==="page"
// entry with the row's id in that phase's shards under
// tmp/raw-ground-truth/expected-v2/page-lane/.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const CENSUS_PHASE_SHARDS: Record<string, string[]> = {
  "000": ["recapture-raw-shard-000000.jsonl", "recapture-raw-shard-000001.jsonl"],
  "002": ["recapture-raw-shard-000004.jsonl", "recapture-raw-shard-000005.jsonl"],
  "003": ["recapture-raw-shard-000006.jsonl", "recapture-raw-shard-000007.jsonl"],
  "004": ["recapture-raw-shard-000008.jsonl", "recapture-raw-shard-000009.jsonl"],
  "005": ["recapture-raw-shard-000010.jsonl", "recapture-raw-shard-000011.jsonl"],
  "006": ["recapture-raw-shard-000012.jsonl", "recapture-raw-shard-000013.jsonl"],
  "007": ["recapture-raw-shard-000014.jsonl", "recapture-raw-shard-000015.jsonl"],
  "009": ["recapture-raw-shard-000018.jsonl", "recapture-raw-shard-000019.jsonl"],
  "015": ["recapture-raw-shard-000030.jsonl", "recapture-raw-shard-000031.jsonl"],
  "017": ["recapture-raw-shard-000034.jsonl", "recapture-raw-shard-000035.jsonl"],
  "018": ["recapture-raw-shard-000036.jsonl", "recapture-raw-shard-000037.jsonl"],
  "021": ["recapture-raw-shard-000042.jsonl", "recapture-raw-shard-000043.jsonl"],
};

export interface CensusSubsetEntry {
  phase: string;
  id: number;
  name: string;
}

export const CENSUS_SEARCH_PAGE_SUBSET: CensusSubsetEntry[] = [
  { phase: "000", id: 12, name: "Sign up" },
  { phase: "000", id: 22, name: "PlainText" },
  { phase: "000", id: 394, name: "John Abbe" },
  { phase: "000", id: 583, name: "David Williams" },
  { phase: "000", id: 665, name: "Paula Craig" },
  { phase: "000", id: 685, name: "mythopsychology" },
  { phase: "000", id: 702, name: "NCDD" },
  { phase: "000", id: 827, name: "VAP" },
  { phase: "000", id: 2154, name: "politics" },
  { phase: "002", id: 7530, name: "201006-07 vacation in Oregon+*self" },
  { phase: "002", id: 7686, name: "Cs button - aikido+*self" },
  { phase: "002", id: 7797, name: "Knee-jerks 20100822+*self" },
  { phase: "002", id: 8265, name: "self-destruction+*self" },
  { phase: "002", id: 8672, name: "Mitsugi Saotome - Aikido Principles+*self" },
  { phase: "002", id: 8919, name: "Joosten - Nonviolence and the Child+*self" },
  { phase: "002", id: 9285, name: "Aikido Transforming Youth - Montreaux+*self" },
  { phase: "003", id: 10597, name: "GBA+*right+*layout+*self" },
  { phase: "003", id: 11287, name: "Pacific Coast Theological Society - Call for Papers for 2012 April 13-14th+*self" },
  { phase: "004", id: 12399, name: "20120418+BW+RVW" },
  { phase: "004", id: 13264, name: "20120708+BW+Time Tracking" },
  { phase: "004", id: 13330, name: "20120711+BW+Time Tracking" },
  { phase: "004", id: 13610, name: "Jessica Ghawi aka Redfield - the final post on her personal blog" },
  { phase: "004", id: 13665, name: "David K. Weinstock - THE RESOURCES AT YOUR BACK" },
  { phase: "004", id: 13849, name: "Paul Rest - A Remarkable Afternoon with Professor John Stevens Shihan" },
  { phase: "004", id: 14007, name: "imprisonment" },
  { phase: "004", id: 14142, name: "reason" },
  { phase: "004", id: 14302, name: "20120817+BW+Time Tracking" },
  { phase: "005", id: 14553, name: "Epworth UMC Transition - Welcome, Questions, and Concerns+*self" },
  { phase: "005", id: 15141, name: "20121017+BW+Time Tracking" },
  { phase: "005", id: 15648, name: "equity" },
  { phase: "005", id: 15760, name: "20121201+BW+RVW" },
  { phase: "005", id: 15822, name: "20121206+BW+Time Tracking" },
  { phase: "005", id: 16170, name: "20130103+BW+RVW" },
  { phase: "005", id: 16178, name: "Fracking" },
  { phase: "005", id: 16493, name: "20130411+BW+RVW" },
  { phase: "006", id: 16714, name: "20130502+BW+Time Tracking" },
  { phase: "006", id: 16994, name: "Very Rosie July 4 in 2013+Gallery10vert+image07+discussion" },
  { phase: "006", id: 17404, name: "20130905+BW+Time Tracking" },
  { phase: "006", id: 18253, name: "money" },
  { phase: "007", id: 19503, name: "Roundtable+How Does Change Work" },
  { phase: "007", id: 19517, name: "Kanazawa - Why Liberals and Atheists Are More Intelligent" },
  { phase: "007", id: 19562, name: "angieup - Son Its Okay If You Dont Get Laid Tonight" },
  { phase: "009", id: 23215, name: "David L Miller at The Minnesota Seminar in Jungian Studies - Mything the Study of Myth 20150509-10" },
  { phase: "009", id: 24567, name: "Jo Marchant - How Meditation Placebos And Virtual Reality Help Power Mind Over Body" },
  { phase: "017", id: 40062, name: "ecosystem" },
  { phase: "017", id: 40381, name: "Learning Pool+Slack Channel naming conventions most in use+*self" },
  { phase: "018", id: 43485, name: "Artificial Intelligence+anon_exchange_02+*self" },
];

/** The captured page-lane oracle record for one subset entry: the lane==="page"
 *  line with the entry's id in that phase's shard files.
 *  `pageLaneDir` is tmp/raw-ground-truth/expected-v2/page-lane. */
export function loadCensusOraclePageEntry(
  entry: CensusSubsetEntry,
  pageLaneDir: string,
): { id: number; name: string; layout?: string | null; page_html?: string; error?: unknown } {
  const shards = CENSUS_PHASE_SHARDS[entry.phase];
  if (shards === undefined) throw new Error(`no shard mapping for phase ${entry.phase}`);
  for (const fname of shards) {
    const shardPath = path.join(pageLaneDir, fname);
    if (!existsSync(shardPath)) throw new Error(`shard not found: ${shardPath}`);
    for (const line of readFileSync(shardPath, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const obj = parsed as Record<string, unknown>;
      if (obj.lane !== "page") continue;
      if ((obj as { id?: unknown }).id === entry.id) {
        return obj as { id: number; name: string; layout?: string | null; page_html?: string; error?: unknown };
      }
    }
  }
  throw new Error(`no page-lane entry for id ${entry.id} in phase ${entry.phase}`);
}
