// The pod YAML writer and reader against Psych's own output.
//
// Fixtures (written by Ruby, never by this code):
//   tests/fixtures/pods/psych-stress.yml / .json — tools/persistence/psych-stress.rb:
//     ~100 strings covering every quoting, escaping and wrapping rule, dumped
//     by Psych 5.1.2 as pod-shaped hashes.
//   the oracle deck pod — a Ruby-sown deck
//     pod (674 cards) produced by `decko sow -c '{}'` plus the persistence
//     op list, through
//     tools/persistence/pod-sow.rb.
// Each must survive read -> write byte for byte, and the stress strings,
// written from their JSON source, must equal Psych's bytes.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dumpYaml, loadYaml, sym, YamlMap, YamlSymbol, type YamlValue } from "../../../src/card/pods/pod-yaml.js";
import { itOrSkipLoud } from "../../support/describe-with-corpus.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/pods");
const read = (f: string): string => readFileSync(path.join(FIXTURES, f), "utf8");

describe("pod YAML: Psych's bytes", () => {
  it("writes every stress string exactly as Psych does", () => {
    const strings = JSON.parse(read("psych-stress.json")) as string[];
    const items: YamlValue[] = strings.map((s) => new YamlMap([[sym("name"), "Stress"], [sym("content"), s]]));
    items.push(
      new YamlMap([
        [sym("name"), ["Left", sym("right")]],
        [sym("type"), sym("rich_text")],
        [sym("codename"), sym("stress")],
        [sym("content"), "x"],
        [sym("fields"), new YamlMap([[sym("description"), "d"], ["plain key", "v"]])],
      ]),
    );
    const expected = read("psych-stress.yml").split("\n");
    const actual = dumpYaml(items).split("\n");
    // line-by-line first, so a failure names the first differing line
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      expect(actual[i], `line ${i + 1}`).toBe(expected[i]);
    }
  });

  it("reads every stress string back unchanged", () => {
    const strings = JSON.parse(read("psych-stress.json")) as string[];
    const loaded = loadYaml(read("psych-stress.yml")) as YamlMap[];
    expect(loaded.length).toBe(strings.length + 1);
    strings.forEach((s, i) => expect(loaded[i].get(sym("content")), JSON.stringify(s)).toBe(s));
    const last = loaded.at(-1)!;
    expect(last.get(sym("name"))).toEqual(["Left", new YamlSymbol("right")]);
    expect((last.get(sym("fields")) as YamlMap).get("plain key")).toBe("v");
  });

  // The oracle deck's pod is a private-deck artifact (it carries rows that a
  // release package withholds), excluded from a release package. Absent, the
  // test says so and skips, the repository's [corpus-gated] convention,
  // instead of failing.
  itOrSkipLoud(
    !existsSync(path.join(FIXTURES, "oracle-deck-after-probe.ruby.yml")),
    "tests/card/pods/pod-yaml.test.ts",
    "the oracle deck pod (a Ruby-sown deck pod; excluded from release packages)",
  )("round-trips the oracle deck's pod byte for byte", () => {
    const text = read("oracle-deck-after-probe.ruby.yml");
    const loaded = loadYaml(text) as YamlMap[];
    expect(loaded.length).toBe(674);
    expect(dumpYaml(loaded)).toBe(text);
  });
});
