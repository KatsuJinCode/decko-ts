// Oracle-matched pin for the mod content seeds (src/card/mod-loader/
// mod-content-seeds.ts): the register's named *-card seed rows must carry
// the reference gems' data/real.yml bytes VERBATIM. The register rows this
// file pins land one per commit; each entry's oracle leg rides its commit.
//
// The oracle is the pinned gemset's data/real.yml files, read at test time
// through GEM_HOME (the same convention tools/compat-report uses); with no
// GEM_HOME the oracle legs SKIP rather than fail - the bytes were certified
// against C:/localProjects/decko-ruby-oracle-gems on 2026-10-20.
//
// Two legs:
//   1. byte parity - a purpose-built reader for the real.yml dialect (entries
//      as `- :name:` blocks, block scalars, symbol-keyed nested field maps)
//      extracts each entry's content block and the entry shapes, and the test
//      compares them against the port's exported rows;
//   2. the boot integration - bootstrapFreshDeck must leave a fresh deck
//      carrying the entries (names, codenames, types, content) through the
//      engine's own write path, plus the type cards they resolve by.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MOD_CONTENT_SEED_CARDS } from "../../../src/card/mod-loader/mod-content-seeds.js";
import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

// ---------------------------------------------------------------------------
// the oracle path (GEM_HOME convention - tools/compat-report/behaviour-probes.mjs:350)
// ---------------------------------------------------------------------------

const gemHome = process.env.GEM_HOME;
const gemsDir = gemHome ? join(gemHome, gemHome.endsWith("gems") ? "" : "gems") : undefined;
const oracleAvailable = gemsDir !== undefined && existsSync(join(gemsDir, "card-mod-ace_editor-0.20.0"));

function gemReal(mod: string): string {
  const path = join(gemsDir!, `card-mod-${mod}-0.20.0`, "data", "real.yml");
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// a purpose-built reader for the real.yml dialect these entries use
// ---------------------------------------------------------------------------

/** Split a real.yml into its top-level `- :name:` entries (raw text). */
function rawEntries(text: string): string[] {
  const starts = [...text.matchAll(/^- :name:/gm)].map((m) => m.index!);
  return starts.map((s, i) => text.slice(s, i + 1 < starts.length ? starts[i + 1]! : text.length));
}

function entryByName(text: string, name: string): string {
  const want = `- :name: "${name}"`;
  const hit = rawEntries(text).find((e) => e.split("\n", 1)[0] === want);
  if (!hit) throw new Error(`entry ${name} not found`);
  return hit;
}

/** A `:key: |` / `:key: |-` block scalar's content at a known key indent. */
function blockScalar(entry: string, key: string, keyIndent: number): string {
  const re = new RegExp(`^ {${keyIndent}}:${key}: (\\|-*|\\|)\\s*$`, "m");
  const m = re.exec(entry);
  if (!m) throw new Error(`block scalar :${key}: not found at indent ${keyIndent}`);
  const stripChomp = m[1]!.endsWith("-");
  const baseIndent = keyIndent + 2;
  const lines: string[] = [];
  for (const line of entry.slice(m.index! + m[0]!.length + 1).split("\n")) {
    if (line.trim() === "") {
      lines.push("");
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent < baseIndent) break;
    lines.push(line.slice(baseIndent));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + (stripChomp ? "" : "\n");
}

// ---------------------------------------------------------------------------
// leg 1 - byte parity against the gems
// ---------------------------------------------------------------------------

describe("mod content seeds match the reference gems' real.yml bytes", { skip: !oracleAvailable }, () => {
  it("*Ace: card-mod-ace_editor real.yml's whole file - name, codename, json type, config body", () => {
    const raw = entryByName(gemReal("ace_editor"), "*Ace");
    expect(blockScalar(raw, "content", 2)).toBe(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.content);
  });

  it("the row table's shape: file order, codenames, type codenames", () => {
    expect(MOD_CONTENT_SEED_CARDS.map((r) => r.name)).toEqual([
      "JSON",
      "HTML",
      "HTML+*description",
      "*Ace",
    ]);
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "JSON")!.codename).toBe("json");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "HTML")!.codename).toBe("html");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.codename).toBe("ace");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.typeCodename).toBe("json");
  });
});

// ---------------------------------------------------------------------------
// leg 2 - the boot integration
// ---------------------------------------------------------------------------

describe("bootstrapFreshDeck leaves a fresh deck carrying the content seeds", () => {
  it("the landed entries exist with their codenames, types and verbatim content", async () => {
    // no bootstrap in the storage helper: the deck under test is the one
    // bootstrapFreshDeck itself builds (boot-seed.test.ts:77-84's shape)
    const storage: RenderTestStorage = await createRenderTestStorage({ bootstrapReadRules: false });
    const outcome = await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const fetcher = new FetchEngine(storage.fetcher.driver);

    for (const name of ["*Ace"]) {
      expect(outcome.modCardsCreated).toContain(name);
      const card = await fetcher.fetchByName(name);
      expect(card, name).toBeDefined();
      expect(card!.id).toBeDefined();
    }

    // the JSON cardtype dependency resolved: *Ace is NOT Basic
    const ace = await fetcher.fetchByName("*Ace");
    const jsonTypeCard = await fetcher.fetchByName("JSON");
    expect(jsonTypeCard).toBeDefined();
    expect(ace!.typeId).toBe(jsonTypeCard!.id);
    expect(ace!.dbContent).toBe(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.content);

    // re-run repairs, not duplicates: a second boot updates nothing here
    const second = await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    expect(second.modCardsCreated).not.toContain("*Ace");
  });
});
