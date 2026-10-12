// The Self::Mod record view reaches byte parity through a DOCUMENTED
// NORMALIZATION, not an exception: the renderer emits the reference
// implementation's exact Object#to_s template and the replay comparator
// canonicalizes the address on both sides.
//
// WHY THE ADDRESS EXISTS AT ALL. The mod view renders its loaded mods as
//
//     Cardio.mods.map do |mod|
//       "#{mod}_mod"
//     end
//
// `mod` is an OBJECT whose class defines no #to_s, so the interpolation falls
// through to Object#to_s and prints "#<Cardio::Mod:0xADDR>_mod" with a heap
// address. The item codes are then mapped to cardnames and passed through
// to_pointer_content, which only strips a leading "[[" and a trailing "]]" —
// neither is present, so every line survives byte for byte.
//
// WHY THE VALUE CANNOT BE COMPARED. The address is a property of the
// rendering process's heap, not of the card. It is not comparable across
// languages and not across runs. The expected bytes hold 34 such addresses,
// 16 hex digits each, all 34 distinct. So the renderer emits a GENUINE
// per-process opaque id of the same shape, and
// src/testing/diff.ts#normalizeModObjectAddresses canonicalizes the hex on
// BOTH sides of the comparison. The shape is spec; the value is not.
//
// WHAT THIS FILE PINS (the pass-iff contract). The entry passes if and only
// if all six hold, and this file FAILS if the renderer drops the address,
// malforms it, reorders or duplicates a line, adds a trailing newline, or
// drifts any other byte:
//
//   (a) 34 lines                          (the deck's loaded mods)
//   (b) all 34 lines distinct
//   (c) mod-name ordering matches         (ORACLE_BUNDLE_ORDER, line for line)
//   (d) no trailing newline               (1,291 chars, 33 separators)
//   (e) every line is the reference template with a well-formed hex id
//   (f) every OTHER byte matches, address-normalized
//
// (e) is deliberately STRICTER than the comparator's own pattern, exactly as
// SLOT_ID_PATTERN is (src/testing/diff.ts:28-36): a malformed id must not be
// able to hide behind the normalization mask. The expected ids are 16 hex
// digits, so the pin holds the renderer to 16.
//
// The normalization is anchored on a construct that appears nowhere else in
// the rendered bytes, so it cannot mask any other diff; the anchored form is
// pinned by the "normalization is anchored" case below.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { itOrSkipLoud } from "../../support/describe-with-corpus.js";

import { ORACLE_BUNDLE_ORDER } from "../../../src/card/mod-loader/default-mod-deck.js";
import {
  capturedModObjects,
  modItemCodesContent,
  modItemCodesContentForMods,
  modObjectToS,
} from "../../../src/card/set-module-content-overrides.js";
import {
  NORMALIZED_MOD_OBJECT_ADDRESS,
  normalizeModObjectAddresses,
} from "../../../src/testing/diff.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const VIEW_LANE_SHARD = path.join(
  REPO_ROOT,
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "view-lane",
  "recapture-raw-shard-000039.jsonl",
);

/** The one line template Ruby prints: "#<Cardio::Mod:0x" + hex + ">" + "_mod". */
const RUBY_LINE_TEMPLATE = /^#<Cardio::Mod:0x([0-9a-f]{16})>_mod$/;

/** 16 lowercase hex digits — the shape every rendered id carries. */
const HEX_DIGITS = 16;

const EXPECTED_CHARS = 1291;
const EXPECTED_LINES = 34;

interface ModRecordLine {
  id: number;
  name: string;
  lane: string;
  record?: { content?: string };
}

/** The raw expected record.content, read from the pinned shard with no
 *  transform in between — the comparison's ground truth. */
function loadCorpusModRecordContent(): string | undefined {
  if (!existsSync(VIEW_LANE_SHARD)) return undefined;
  for (const line of readFileSync(VIEW_LANE_SHARD, "utf8").split("\n")) {
    if (line.trim() === "" || !line.includes("#<Cardio::Mod:0x")) continue;
    const entry = JSON.parse(line) as ModRecordLine;
    if (entry.id === 45410 && entry.name === "Mod") return entry.record?.content;
  }
  return undefined;
}

const CORPUS_CONTENT = loadCorpusModRecordContent();

/** The gate, named. The expected bytes live under `tmp/`, which is
 *  gitignored, so on
 *  a clean clone the shard is absent and CORPUS_CONTENT is undefined.
 *
 *  Only TWO of this file's nine tests need those bytes — the provenance guard
 *  and the byte comparison (f). The other seven evaluate the renderer's own
 *  output
 *  against constants declared above, and they guard real engine behaviour with
 *  no shard present. So the gate skips the two that cannot be evaluated and
 *  leaves the seven running: skipping the whole describe would have turned a
 *  clean clone's 7 passes into 7 skips and thrown away coverage for nothing.
 *  See docs/TESTING.md. */
const CORPUS_GATE =
  "tmp/raw-ground-truth/expected-v2/view-lane/recapture-raw-shard-000039.jsonl — the captured corpus, absent on a clean clone (tmp/ is gitignored)";
const corpusIt = itOrSkipLoud(
  CORPUS_CONTENT === undefined,
  "tests/card/content/mod-object-address-shape-parity.test.ts",
  CORPUS_GATE,
);

describe("Self::Mod record view: the Ruby Object#to_s address shape (mod/core/set/self/mod.rb:4-6)", () => {
  corpusIt("the corpus holds the one card whose record content is a Cardio::Mod address list", () => {
    // Provenance guard: if the shard ever stops carrying these bytes this file
    // has nothing to pin and must fail loudly rather than pass vacuously.
    expect(CORPUS_CONTENT, "corpus shard-000039 must carry the Mod record content").toBeDefined();
    const lines = (CORPUS_CONTENT as string).split("\n");
    expect(lines).toHaveLength(EXPECTED_LINES);
    expect((CORPUS_CONTENT as string).length).toBe(EXPECTED_CHARS);
    expect((CORPUS_CONTENT as string).endsWith("\n")).toBe(false);
  });

  it("(a)+(d) the port answers 34 lines with no trailing newline, 1,291 chars", () => {
    const answer = modItemCodesContent();
    const lines = answer.split("\n");
    expect(lines).toHaveLength(EXPECTED_LINES);
    expect(answer.endsWith("\n")).toBe(false);
    expect(answer.length).toBe(EXPECTED_CHARS);
  });

  it("(b) all 34 lines are distinct — no address repeats", () => {
    const lines = modItemCodesContent().split("\n");
    expect(new Set(lines).size).toBe(EXPECTED_LINES);
  });

  it("(e) every line is the Ruby Object#to_s template with a well-formed hex id", () => {
    const lines = modItemCodesContent().split("\n");
    for (const [index, line] of lines.entries()) {
      const match = RUBY_LINE_TEMPLATE.exec(line);
      expect(match, `line ${index} is not the Ruby template: ${JSON.stringify(line)}`).not.toBeNull();
      expect((match as RegExpExecArray)[1]).toMatch(new RegExp(`^[0-9a-f]{${HEX_DIGITS}}$`));
    }
  });

  it("the address is a genuine per-process opaque id, not a constant", () => {
    // The value is NOT spec and must not be pretended to be: it just has to be
    // a real per-object identity that is not a fixed placeholder repeated 34
    // times. Asserted as "34 distinct ids drawn from the 16-hex-digit space" —
    // the same shape the rendered bytes carry.
    const lines = modItemCodesContent().split("\n");
    const ids = lines.map((line) => (RUBY_LINE_TEMPLATE.exec(line) as RegExpExecArray)[1]);
    expect(new Set(ids).size).toBe(EXPECTED_LINES);
    // Not the all-zero id, and not a single repeated constant.
    expect(ids.every((id) => /^0{16}$/.test(id))).toBe(false);
  });

  it("(c) the mod-name ordering matches the captured bundle order, line for line", () => {
    // The rendered bytes carry NO mod names — Object#to_s prints the address, not
    // the name — so ordering cannot be read off the rendered content at all.
    // The renderer therefore reports which mod produced which object
    // (capturedModObjects), and THIS is the assertion that makes order
    // load-bearing: it binds emitted line i to ORACLE_BUNDLE_ORDER[i]. A
    // mutation that reverses ORACLE_BUNDLE_ORDER, or swaps two adjacent mods,
    // is caught here and nowhere else.
    const mods = capturedModObjects();
    expect(mods).toHaveLength(ORACLE_BUNDLE_ORDER.length);
    expect(mods.map((m) => m.name)).toEqual([...ORACLE_BUNDLE_ORDER]);

    // And the rendered lines are those same objects, in that same order: the
    // address on line i is the identity of the mod named at position i. The
    // renderer is exercised through the same pure function the record path
    // calls, so this binds order to the bytes that get compared.
    const lines = modItemCodesContentForMods(mods).split("\n");
    expect(lines).toHaveLength(mods.length);
    for (const [index, mod] of mods.entries()) {
      expect(lines[index], `line ${index} must be the Object#to_s of ${mod.name}`).toBe(
        `${modObjectToS(mod)}_mod`,
      );
    }
    // The record path's own answer is the same renderer over the same list.
    expect(modItemCodesContent().split("\n")).toHaveLength(mods.length);
  });

  corpusIt("(f) every OTHER byte matches the raw corpus — address-normalized on both sides", () => {
    expect(CORPUS_CONTENT).toBeDefined();
    const portAnswer = modItemCodesContent();
    const expected = CORPUS_CONTENT as string;
    const normalizedExpected = normalizeModObjectAddresses(expected);
    const normalizedActual = normalizeModObjectAddresses(portAnswer);
    // Full-string equality, so ANY drift outside the address is a failure.
    expect(normalizedActual).toBe(normalizedExpected);
    // The mask must be the ONLY thing that changed on the expected side: the
    // normalized bytes are exactly the original bytes with each of the 34
    // address spans replaced by the placeholder, and no other edit.
    const addresses = expected.match(/#<Cardio::Mod:0x[0-9a-f]+>/g) ?? [];
    expect(addresses).toHaveLength(EXPECTED_LINES);
    expect(normalizedExpected).toBe(
      expected.replace(
        /#<Cardio::Mod:0x[0-9a-f]+>/g,
        `#<Cardio::Mod:${NORMALIZED_MOD_OBJECT_ADDRESS}>`,
      ),
    );
  });

  it("the normalization is anchored: it rewrites the address span and nothing else", () => {
    const untouched = [
      "#<Cardio::Mod> no address here",
      "#<Cardio::Mod:0xZZZ> non-hex id survives",
      "0x00000174845e02a0 bare hex with no class anchor survives",
      "card-mod_format-files-collapse-id accordion group survives",
      'data-slot-id="0123456789abcdef0123" slot ids survive',
      "#<Other::Class:0x00000174845e02a0> another class survives",
    ];
    for (const text of untouched) {
      expect(normalizeModObjectAddresses(text), `must not mask: ${text}`).toBe(text);
    }
    // And it does rewrite the one construct it owns.
    expect(normalizeModObjectAddresses("#<Cardio::Mod:0x00000174845e02a0>_mod")).toBe(
      `#<Cardio::Mod:${NORMALIZED_MOD_OBJECT_ADDRESS}>_mod`,
    );
  });

  it("the normalization is idempotent, like the recording-layer rules it joins", () => {
    const once = normalizeModObjectAddresses("#<Cardio::Mod:0x00000174845e02a0>_mod");
    expect(normalizeModObjectAddresses(once)).toBe(once);
  });
});
