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

/** The raw text of the `- :name:` entry naming `name`.
 *
 *  Both spellings occur in the gemset and both must resolve: a name needing
 *  YAML quoting is written `- :name: "*Ace"`, while a plain one is written
 *  bare, `- :name: HTML` (card-mod-format-0.20.0/data/real.yml). Matching
 *  only the quoted form silently hid every unquoted entry from this reader. */
function entryByName(text: string, name: string): string {
  const hit = rawEntries(text).find(
    (e) => e.split("\n", 1)[0] === `- :name: "${name}"` || e.split("\n", 1)[0] === `- :name: ${name}`,
  );
  if (!hit) throw new Error(`entry ${name} not found`);
  return hit;
}

/** A `:key: |` / `:key: |-` block scalar's content at a known key indent.
 *
 *  CHOMPING (YAML 1.2 §8.1.2). Clip — the bare `|` — keeps ONE trailing line
 *  break, and ONLY IF THE SOURCE HAS ONE. That clause is load-bearing here and
 *  was previously missed: this reader appended "\n" for clip unconditionally,
 *  so it agreed with a seed row that carried a trailing newline Ruby never
 *  stores, and the byte-parity leg passed against a wrong row.
 *  card-mod-tinymce_editor-0.20.0/data/real.yml ends mid-line (its last byte
 *  is 0x7d, not 0x0a), so its content block is ` }` with no break, and Psych
 *  stores exactly that. The fact is read off the raw split below rather than
 *  guessed from a pre-trimmed array; the other three gem real.yml files this
 *  test reads do end in 0x0a and keep their break. Strip (`|-`) drops it. */
function blockScalar(entry: string, key: string, keyIndent: number): string {
  const re = new RegExp(`^ {${keyIndent}}:${key}: (\\|-*|\\|)\\s*$`, "m");
  const m = re.exec(entry);
  if (!m) throw new Error(`block scalar :${key}: not found at indent ${keyIndent}`);
  const stripChomp = m[1]!.endsWith("-");
  const baseIndent = keyIndent + 2;
  const raw = entry.slice(m.index! + m[0]!.length + 1).split("\n");
  const lines: string[] = [];
  // Did a line break follow the last content line in the SOURCE? A next split
  // chunk existing at all is that break; its being "" is the trailing blank.
  let sourceHadBreak = false;
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!;
    if (line.trim() === "") {
      lines.push("");
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent < baseIndent) break;
    lines.push(line.slice(baseIndent));
    sourceHadBreak = i + 1 < raw.length;
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + (stripChomp || !sourceHadBreak ? "" : "\n");
}

/** The `:fields:` map keys of an entry at a known indent (each key names a
 *  subcard through Codename.name! + the joint). */
function fieldMapKeys(entry: string, keyIndent: number): string[] {
  return [...entry.matchAll(new RegExp(`^ {${keyIndent}}:([a-z_0-9]+):\\s*$`, "gm"))].map((m) => m[1]!);
}

/** The nested scalar map under a field key (`:input_type: radio` etc.). */
function nestedScalarMap(entry: string, keyIndent: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of entry.matchAll(new RegExp(`^ {${keyIndent}}:([a-z_0-9]+): (.+)$`, "gm"))) {
    out[m[1]!] = m[2]!.trim();
  }
  for (const m of entry.matchAll(new RegExp(`^ {${keyIndent}}:([a-z_0-9]+): \\|-*\\s*$`, "gm"))) {
    out[m[1]!] = blockScalar(entry, m[1]!, keyIndent);
  }
  return out;
}

// ---------------------------------------------------------------------------
// leg 1 - byte parity against the gems
// ---------------------------------------------------------------------------

describe("mod content seeds match the reference gems' real.yml bytes", { skip: !oracleAvailable }, () => {
  it("*Ace: card-mod-ace_editor real.yml's whole file - name, codename, json type, config body", () => {
    const raw = entryByName(gemReal("ace_editor"), "*Ace");
    expect(blockScalar(raw, "content", 2)).toBe(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.content);
  });

  it("*tinyMCE: card-mod-tinymce_editor real.yml's whole file", () => {
    const raw = entryByName(gemReal("tinymce_editor"), "*tinyMCE");
    expect(blockScalar(raw, "content", 2)).toBe(
      MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*tinyMCE")!.content,
    );
    // and the byte the clip-chomping clause decides, asserted on its own so a
    // future reader that appends a break again fails here rather than passing
    // by coincidence: this gem's file ends ` }` with no newline after it.
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*tinyMCE")!.content!.endsWith(" }")).toBe(true);
  });

  it("HTML's :description: field flattens to `HTML+description`, resolved from the gem, not asserted here", () => {
    // Subcards::Args#normalize_field_key turns a Symbol :fields: key into a
    // name through `Card::Codename.name!` -> `Lexicon.name(card_id)`, i.e. the
    // name of whatever card HOLDS that codename. So the flattened subcard's
    // name is decided by a DIFFERENT gem's real.yml, and reading only
    // card-mod-format's entry (`:description:`) cannot tell `description` from
    // `*description`. Read the holder: card-1.110.0/mod/core.
    const coreReal = readFileSync(
      join(gemsDir!, "card-1.110.0", "mod", "core", "data", "real.yml"),
      "utf-8",
    );
    expect(coreReal).toMatch(/^- :name: description$/m);
    expect(coreReal).toMatch(/^ {2}:codename: description$/m);
    // the row therefore carries the unstarred name - a leading `*` would mean
    // Card::Name#isSetting (name.rb:673) true, which this card is not.
    expect(MOD_CONTENT_SEED_CARDS.map((r) => r.name)).toContain("HTML+description");
    expect(MOD_CONTENT_SEED_CARDS.map((r) => r.name)).not.toContain("HTML+*description");
    // and its content is the gem's own inline quoted value: in
    // card-mod-format's HTML entry `:description:` is a plain one-line scalar,
    // not a `|` block, so it is read as the quoted string it is
    const raw = entryByName(gemReal("format"), "HTML");
    const inline = raw.match(/^ {4}:description: (".*")$/m);
    expect(inline, "card-mod-format's HTML entry has no inline :description:").not.toBeNull();
    expect(JSON.parse(inline![1]!)).toBe(
      MOD_CONTENT_SEED_CARDS.find((r) => r.name === "HTML+description")!.content,
    );
  });

  it("*getting started: card-mod-defaults real.yml entry + its :shark: field verbatim", () => {
    const raw = entryByName(gemReal("defaults"), "*getting started");
    const row = MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*getting started")!;
    const sharkRow = MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*getting started+Shark")!;
    expect(blockScalar(raw, "content", 2)).toBe(row.content);
    // the :shark: field: Codename.name! :shark -> "Shark" (the account
    // layer's Shark role card), so the subcard name is *getting started+Shark
    expect(blockScalar(raw, "content", 6)).toBe(sharkRow.content);
    expect(sharkRow.typeCodename).toBe("html");
  });

  it("*contextual class: card-mod-follow real.yml entry - setting card + +*right rule chain", () => {
    const raw = entryByName(gemReal("follow"), "*contextual class");
    // the entry's own :fields: sits at indent 2; the field KEYS sit under it at indent 4
    expect(fieldMapKeys(raw, 4)).toEqual(["right"]);
    // :right: -> Codename.name! :right -> "*right"; the subcard chain the
    // entry flattens to is *contextual class+*right{,+*input type,+*content options}
    const rightBlock = raw.slice(raw.indexOf("    :right:"));
    const inner = nestedScalarMap(rightBlock, 8);
    expect(inner["input_type"]).toBe("radio");
    expect(inner["content_options"]).toBe(
      MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*contextual class+*right+*content options")!.content,
    );
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*contextual class+*right+*input type")!.content).toBe(
      inner["input_type"],
    );
  });

  it("the row table's shape: file order, codenames, type codenames, contentless rows", () => {
    expect(MOD_CONTENT_SEED_CARDS.map((r) => r.name)).toEqual([
      "JSON",
      "HTML",
      "HTML+description",
      "*Ace",
      "*tinyMCE",
      "*getting started",
      "*getting started+Shark",
      "*contextual class",
      "*contextual class+*right",
      "*contextual class+*right+*input type",
      "*contextual class+*right+*content options",
    ]);
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "JSON")!.codename).toBe("json");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "HTML")!.codename).toBe("html");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.codename).toBe("ace");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.typeCodename).toBe("json");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*tinyMCE")!.codename).toBe("tiny_mce");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*tinyMCE")!.typeCodename).toBe("json");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*getting started")!.codename).toBe("getting_started");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*getting started")!.typeCodename).toBe("html");
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*contextual class")!.codename).toBe("contextual_class");
    // the entry itself carries no content or type (Basic at the default)
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*contextual class")!.content).toBeUndefined();
    expect(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*contextual class+*right")!.content).toBeUndefined();
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

    for (const name of [
      "*Ace",
      "*tinyMCE",
      "*getting started",
      "*getting started+Shark",
      "*contextual class",
    ]) {
      expect(outcome.modCardsCreated).toContain(name);
      const card = await fetcher.fetchByName(name);
      expect(card, name).toBeDefined();
      expect(card!.id).toBeDefined();
    }

    // the JSON cardtype dependency resolved: *Ace/*tinyMCE are NOT Basic
    const ace = await fetcher.fetchByName("*Ace");
    const jsonTypeCard = await fetcher.fetchByName("JSON");
    expect(jsonTypeCard).toBeDefined();
    expect(ace!.typeId).toBe(jsonTypeCard!.id);
    expect(ace!.dbContent).toBe(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*Ace")!.content);

    const tiny = await fetcher.fetchByName("*tinyMCE");
    expect(tiny!.typeId).toBe(jsonTypeCard!.id);
    expect(tiny!.dbContent).toBe(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*tinyMCE")!.content);

    // the HTML cardtype dependency resolved for *getting started, and the
    // shark field card carries the SVG verbatim
    const htmlTypeCard = await fetcher.fetchByName("HTML");
    const gs = await fetcher.fetchByName("*getting started");
    expect(gs!.typeId).toBe(htmlTypeCard!.id);
    expect(gs!.dbContent).toBe(MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*getting started")!.content);
    const shark = await fetcher.fetchByName("*getting started+Shark");
    expect(shark!.dbContent).toBe(
      MOD_CONTENT_SEED_CARDS.find((r) => r.name === "*getting started+Shark")!.content,
    );

    // the rule chain: +*input type = radio, +*content options = the four labels
    const inputType = await fetcher.fetchByName("*contextual class+*right+*input type");
    expect(inputType!.dbContent).toBe("radio");
    const contentOptions = await fetcher.fetchByName("*contextual class+*right+*content options");
    expect(contentOptions!.dbContent).toBe("success\ninfo\nwarning\ndanger");

    // re-run repairs, not duplicates: a second boot updates nothing here
    const second = await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    expect(second.modCardsCreated).not.toContain("*Ace");
    expect(second.modCardsCreated).not.toContain("*tinyMCE");
    expect(second.modCardsCreated).not.toContain("*getting started");
    expect(second.modCardsCreated).not.toContain("*contextual class");
  });
});
