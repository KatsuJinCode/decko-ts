// Oracle-matched pins for the mod real.yml seed cards (src/card/mod-loader/
// mod-realyml-seed-cards.ts).
//
// The register's *-card rows grade a seeded card UNPORTED or DIVERGENT when
// the port carries none of the gem's real.yml bytes. This file is the check
// that closes such a row: the port's row content must equal, byte for byte,
// what the reference gem's data/real.yml actually says.
//
// Three legs, and they run in the order the trust depends on:
//
//   1. THE ORACLE ITSELF. tests/card/mod-loader/real-yaml-oracle.ts is a
//      hand-rolled reader for the real.yml dialect. It is only worth trusting
//      if it agrees with the parser Ruby itself uses, so this leg shells to
//      `ruby -ryaml -rjson` and compares every scalar of every card-mod gem's
//      real.yml against the reader's parse. SKIPS when no ruby is on PATH -
//      a skip, never a pass.
//   2. BYTE PARITY. Each row under test equals the reader's extraction of its
//      gem entry. GEM_HOME picks the gemset (the convention
//      tools/compat-report uses); with no GEM_HOME these SKIP rather than fail.
//   3. THE BOOT INTEGRATION. bootstrapFreshDeck must leave a real deck
//      carrying the entry - through the engine's own write path, with the
//      type card its `:type:` resolves by, byte-identical content, and a
//      re-run that repairs instead of duplicating.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MOD_REAL_YAML_SEED_CARDS } from "../../../src/card/mod-loader/mod-realyml-seed-cards.js";
import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { entryNamed, fieldKeys, parseRealYaml, type RealYamlValue } from "./real-yaml-oracle.js";
import { createRenderTestStorage, type RenderTestStorage } from "../render/render-test-storage.js";

// ---------------------------------------------------------------------------
// the oracle path (GEM_HOME convention - tools/compat-report/behaviour-probes.mjs:350)
// ---------------------------------------------------------------------------

const gemHome = process.env.GEM_HOME;
const gemsDir = gemHome ? join(gemHome, gemHome.endsWith("gems") ? "" : "gems") : undefined;
const oracleAvailable = gemsDir !== undefined && existsSync(join(gemsDir, "card-mod-ace_editor-0.20.0"));

function gemReal(mod: string): string {
  return readFileSync(join(gemsDir!, `card-mod-${mod}-0.20.0`, "data", "real.yml"), "utf-8");
}

/** The row for `name`, failing loudly when the table stops carrying it. */
function row(name: string): (typeof MOD_REAL_YAML_SEED_CARDS)[number] {
  const hit = MOD_REAL_YAML_SEED_CARDS.find((r) => r.name === name);
  if (hit === undefined) throw new Error(`no MOD_REAL_YAML_SEED_CARDS row named ${JSON.stringify(name)}`);
  return hit;
}

// ---------------------------------------------------------------------------
// leg 1 - the oracle reader against Ruby's own parser
// ---------------------------------------------------------------------------

/** Every scalar in a real.yml, keyed by its path - the shape both sides of
 *  this leg speak, so the comparison is one deep equality per gem. */
function flatten(value: RealYamlValue, path: string[], out: Record<string, string>): void {
  if (typeof value === "string") {
    out[path.join(".")] = value;
  } else if (Array.isArray(value)) {
    out[path.join(".")] = `[${value.join(",")}]`;
  } else if (value instanceof Map) {
    for (const [key, nested] of value) flatten(nested, [...path, key], out);
  }
}

function readerScalars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  parseRealYaml(text).forEach((entry, i) => {
    out[`e${i}|keys`] = [...entry.keys()].join(",");
    flatten(entry, [`e${i}`], out);
  });
  return out;
}

/** Ruby, not the reader, decides the shape of this comparison: this is the
 *  canonical path -> scalar map Psych produces for each gem's real.yml. Every
 *  gem goes through ONE interpreter invocation - spawning ruby per file costs
 *  seconds of startup for a leg that exists to be run often. */
const PSY_SCALARS = String.raw`
require "yaml"
require "json"

def flatten(value, path, out)
  case value
  when Symbol then out[path.join(".")] = ":" + value.to_s
  when String then out[path.join(".")] = value
  when Array  then out[path.join(".")] = "[" + value.map { |x| x.is_a?(Symbol) ? ":" + x.to_s : x.to_s }.join(",") + "]"
  when Hash   then value.each { |k, v| flatten(v, path + [":" + k.to_s + ":"], out) }
  when nil    then out[path.join(".")] = "nil"
  else out[path.join(".")] = value.inspect
  end
end

all = {}
ARGV.each do |path|
  out = {}
  YAML.unsafe_load_file(path).each_with_index do |entry, i|
    out["e#{i}|keys"] = entry.keys.map { |k| ":" + k.to_s + ":" }.join(",")
    entry.each { |k, v| flatten(v, ["e#{i}", ":" + k.to_s + ":"], out) }
  end
  all[File.basename(File.dirname(File.dirname(path)))] = out
end
print JSON.generate(all)
`;

function rubyAvailable(): boolean {
  try {
    execFileSync("ruby", ["-e", "print 1"], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

describe("the real.yml oracle reader agrees with Ruby's YAML parser", { skip: !oracleAvailable || !rubyAvailable() }, () => {
  const gemNames = readdirSync(gemsDir!)
    .filter((d) => d.startsWith("card-mod-") && existsSync(join(gemsDir!, d, "data", "real.yml")))
    .sort();

  it("every scalar of every card-mod gem's real.yml, byte for byte", () => {
    expect(gemNames.length).toBeGreaterThan(20);
    const paths = gemNames.map((g) => join(gemsDir!, g, "data", "real.yml"));
    const psychByGem = JSON.parse(
      execFileSync("ruby", ["-e", PSY_SCALARS, ...paths], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }),
    ) as Record<string, Record<string, string>>;

    for (const gem of gemNames) {
      const reader = readerScalars(readFileSync(join(gemsDir!, gem, "data", "real.yml"), "utf-8"));
      const psych = psychByGem[gem]!;
      expect(Object.keys(reader).sort(), gem).toEqual(Object.keys(psych).sort());
      expect(reader, gem).toEqual(psych);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// leg 2 - byte parity against the gems
// ---------------------------------------------------------------------------

describe("the seeded *-cards carry the reference gems' real.yml bytes", { skip: !oracleAvailable }, () => {
  it("*Ace: card-mod-ace_editor real.yml's whole file - name, codename, json type, config body", () => {
    const [entry] = parseRealYaml(gemReal("ace_editor"));
    const ace = row("*Ace");
    expect(entry!.get(":name:")).toBe("*Ace");
    expect(entry!.get(":codename:")).toBe("ace");
    expect(entry!.get(":type:")).toBe("json");
    expect(ace.name).toBe("*Ace");
    expect(ace.codename).toBe("ace");
    expect(ace.typeCodename).toBe("json");
    expect(ace.content).toBe(entry!.get(":content:"));
    expect(ace.content!.length).toBe(156);
  });

  it("the JSON cardtype *Ace types by, and *Ace's row precedes it in load order", () => {
    const json = row("JSON");
    expect(json.codename).toBe("json");
    expect(json.typeCodename).toBe("cardtype");
    // the type card must be seeded before anything typed by it
    const order = MOD_REAL_YAML_SEED_CARDS.map((r) => r.name);
    expect(order.indexOf("JSON")).toBeLessThan(order.indexOf("*Ace"));
  });

  it("*tinyMCE: card-mod-tinymce_editor real.yml's whole file", () => {
    const [entry] = parseRealYaml(gemReal("tinymce_editor"));
    const tiny = row("*tinyMCE");
    expect(entry!.get(":name:")).toBe("*tinyMCE");
    expect(entry!.get(":codename:")).toBe("tiny_mce");
    expect(entry!.get(":type:")).toBe(":json");
    expect(tiny.name).toBe("*tinyMCE");
    expect(tiny.codename).toBe("tiny_mce");
    expect(tiny.typeCodename).toBe("json");
    expect(tiny.content).toBe(entry!.get(":content:"));
    // 617 bytes, ending ` }` with NO trailing newline. The gem's file ends
    // mid-line, so YAML clip chomping has no line break to keep; a reader
    // that appends one anyway lands a 618th byte Ruby never stores, and that
    // is the whole content of this row's difference from a passing port.
    expect(tiny.content!.length).toBe(617);
    expect(tiny.content!.endsWith("\n")).toBe(false);
    expect(tiny.content!.endsWith("\n }")).toBe(true);
  });

  it("*getting started: card-mod-defaults real.yml's entry, its :shark: field, and the HTML cardtype they type by", () => {
    const entry = entryNamed(gemReal("defaults"), "*getting started");
    const gs = row("*getting started");
    const shark = row("*getting started+Shark");
    expect(entry.get(":name:")).toBe("*getting started");
    expect(entry.get(":codename:")).toBe("getting_started");
    expect(entry.get(":type:")).toBe(":html");
    expect(gs.name).toBe("*getting started");
    expect(gs.codename).toBe("getting_started");
    expect(gs.typeCodename).toBe("html");
    expect(gs.content).toBe(entry.get(":content:"));
    expect(gs.content!.length).toBe(735);

    // the :shark: field key goes through Codename.name!, which resolves to
    // the account layer's Shark card; the field carries its own :type: :html,
    // so the subcard is html-typed too rather than left at Basic
    const fields = entry.get(":fields:")!;
    expect(fields).toBeInstanceOf(Map);
    const sharkField = (fields as Map<string, RealYamlValue>).get(":shark:") as Map<string, RealYamlValue>;
    expect(fieldKeys(entry)).toEqual(["shark"]);
    expect(sharkField.get(":type:")).toBe(":html");
    expect(shark.name).toBe("*getting started+Shark");
    expect(shark.typeCodename).toBe("html");
    expect(shark.content).toBe(sharkField.get(":content:"));
    expect(shark.content!.length).toBe(11_207);

    // the HTML cardtype the entry types by, and the +description field its own
    // real.yml entry seeds alongside it (core's `description` card, not a
    // setting - so the flattened name carries no asterisk)
    const htmlEntry = entryNamed(gemReal("format"), "HTML");
    expect(row("HTML").typeCodename).toBe("cardtype");
    expect(row("HTML+description").content).toBe(
      (htmlEntry.get(":fields:") as Map<string, RealYamlValue>).get(":description:"),
    );
  });

  it("rows are in load order: a type card before what it types, a parent before its fields", () => {
    const order = MOD_REAL_YAML_SEED_CARDS.map((r) => r.name);
    const before = (parent: string, child: string) => {
      expect(order.indexOf(parent), `${parent} before ${child}`).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(parent), `${parent} before ${child}`).toBeLessThan(order.indexOf(child));
    };
    before("JSON", "*Ace");
    before("JSON", "*tinyMCE");
    before("HTML", "*getting started");
    before("*getting started", "*getting started+Shark");
    before("HTML", "HTML+description");
  });
});

// ---------------------------------------------------------------------------
// leg 3 - the boot integration
// ---------------------------------------------------------------------------

describe("bootstrapFreshDeck leaves a fresh deck carrying the seeded *-cards", () => {
  it("*Ace and *tinyMCE land json-typed with the gems' exact bytes, and a re-run repairs rather than duplicating", async () => {
    // no bootstrap in the storage helper: the deck under test is the one
    // bootstrapFreshDeck itself builds (boot-seed.test.ts's shape)
    const storage: RenderTestStorage = await createRenderTestStorage({ bootstrapReadRules: false });
    const outcome = await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const fetcher = new FetchEngine(storage.fetcher.driver);

    expect(outcome.modCardsCreated).toContain("JSON");
    expect(outcome.modCardsCreated).toContain("*Ace");
    expect(outcome.modCardsCreated).toContain("*tinyMCE");
    expect(outcome.modCardsCreated).toContain("HTML");
    expect(outcome.modCardsCreated).toContain("*getting started");
    expect(outcome.modCardsCreated).toContain("*getting started+Shark");

    const jsonType = await fetcher.fetchByName("JSON");
    const ace = await fetcher.fetchByName("*Ace");
    expect(jsonType).toBeDefined();
    expect(ace).toBeDefined();
    // NOT the Basic default: the `:type: json` symbol resolved through the
    // JSON cardtype the same entry table seeds
    expect(ace!.typeId).toBe(jsonType!.id);
    expect(ace!.dbContent).toBe(row("*Ace").content);

    // *tinyMCE types by `:type: :json` - the gem writes the symbol, not the
    // bare string *Ace uses - and carries its own 617-byte config verbatim
    const tiny = await fetcher.fetchByName("*tinyMCE");
    expect(tiny!.typeId).toBe(jsonType!.id);
    expect(tiny!.dbContent).toBe(row("*tinyMCE").content);
    expect(tiny!.dbContent!.length).toBe(617);

    // *getting started types by `:type: :html`, so it resolves through the
    // HTML cardtype this commit's rows seed - not through Basic
    const htmlType = await fetcher.fetchByName("HTML");
    const gs = await fetcher.fetchByName("*getting started");
    expect(htmlType).toBeDefined();
    expect(gs!.typeId).toBe(htmlType!.id);
    expect(gs!.dbContent).toBe(row("*getting started").content);
    // the :shark: field's subcard, html-typed and carrying the SVG verbatim
    const shark = await fetcher.fetchByName("*getting started+Shark");
    expect(shark!.dbContent).toBe(row("*getting started+Shark").content);
    expect(shark!.dbContent!.length).toBe(11_207);
    // the +description field the HTML cardtype's own real.yml entry seeds
    expect((await fetcher.fetchByName("HTML+description"))!.dbContent).toBe(
      row("HTML+description").content,
    );

    // re-run repairs, not duplicates
    const second = await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    for (const name of ["JSON", "*Ace", "*tinyMCE", "HTML", "*getting started", "*getting started+Shark"]) {
      expect(second.modCardsCreated, name).not.toContain(name);
      expect(second.modCardsUpdated, name).not.toContain(name);
    }
  });
});