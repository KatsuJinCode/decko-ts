// The Self::Mod record view reaches byte parity through a DOCUMENTED
// NORMALIZATION, not an exception: the port renders Ruby's exact
// Object#to_s template and the replay comparator canonicalizes the address on
// both sides. Lane: mod-address-normalization, 2026-10-04.
//
// WHY THE ADDRESS EXISTS AT ALL. card-1.110.0
// mod/core/set/self/mod.rb:4-6 is
//
//     Cardio.mods.map do |mod|
//       "#{mod}_mod"
//     end
//
// `mod` is a Cardio::Mod OBJECT, and Cardio::Mod defines no #to_s
// (lib/cardio/mod.rb:47-88 — initialize/mod_card_name/codename/subpath/
// tmp_dir/ensure_card/required_path; `grep -rn "def to_s" lib/cardio/`
// returns exactly one hit, module_template.rb:23, a different class). So the
// interpolation falls through to Object#to_s and Ruby prints
// "#<Cardio::Mod:0xADDR>_mod" with a heap address. mod.rb:9-11 then maps
// item_codes to cardnames and calls to_pointer_content (config/initializers/
// 01_core_extensions/array.rb:4-12), which only strips a leading "[[" and a
// trailing "]]" — neither is present, so all 34 lines survive byte-for-byte.
//
// WHY THE VALUE CANNOT BE COMPARED. The address is a property of the capture
// process's heap, not of the card. It is not comparable across languages and
// not across Ruby runs. The pinned corpus bytes (tmp/raw-ground-truth/
// expected-v2/view-lane/recapture-raw-shard-000039.jsonl, entry id 45410,
// name "Mod") hold 34 such addresses, 16 hex digits each, all 34 distinct.
// Therefore the port emits a GENUINE per-process opaque id of the same shape,
// and src/testing/diff.ts#normalizeModObjectAddresses canonicalizes the hex on
// BOTH sides of the comparison. The shape is spec; the value is not.
//
// WHAT THIS FILE PINS (the pass-iff contract). The entry passes if and only
// if all six hold, and this file FAILS if the port drops the address, malforms
// it, reorders or duplicates a line, adds a trailing newline, or drifts any
// other byte:
//
//   (a) 34 lines                          (the capture deck's loaded mods)
//   (b) all 34 lines distinct
//   (c) mod-name ordering matches         (ORACLE_BUNDLE_ORDER, line for line)
//   (d) no trailing newline               (1,291 chars, 33 separators)
//   (e) every line is the Ruby template with a well-formed hex id
//   (f) every OTHER byte matches the raw corpus, address-normalized
//
// (e) is deliberately STRICTER than the comparator's own pattern, exactly as
// SLOT_ID_PATTERN is (src/testing/diff.ts:28-36): a malformed id must not be
// able to hide behind the normalization mask. The corpus's ids are 16 hex
// digits, so the pin holds the port to 16.
//
// BLAST RADIUS, measured not assumed: `grep -roF '#<Cardio::Mod:0x'` over the
// whole expected-v2 tree (96 .jsonl files, 116 files total) returns 68
// occurrences in exactly 2 files — view-lane and page-lane
// recapture-raw-shard-000039.jsonl — and exactly ONE entry in each, both card
// id 45410 ("Mod"). `grep -rohE '#<[A-Za-z_:]+'` over the same tree returns
// `#<Cardio::Mod:` and nothing else, and `grep -rohE '0x[0-9a-f]{4,}'`
// returns 68 — the same 68 addresses. So the normalization is anchored on a
// construct that occurs nowhere else in the corpus and cannot mask any other
// diff. The page-lane entry's page_html (62,290 bytes) does NOT contain the
// construct, so that lane's Mod:page failure is unrelated and unmoved.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ORACLE_BUNDLE_ORDER } from "../../../src/card/mod-loader/default-mod-deck.js";
import { modItemCodesContent } from "../../../src/card/set-module-content-overrides.js";
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

/** The corpus's own ids, measured: 16 lowercase hex digits every time. */
const HEX_DIGITS = 16;

const EXPECTED_CHARS = 1291;
const EXPECTED_LINES = 34;

interface ModRecordLine {
  id: number;
  name: string;
  lane: string;
  record?: { content?: string };
}

/** The raw expected record.content for card id 45410, read from the corpus
 *  with no transform in between — the pin's ground truth. */
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

describe("Self::Mod record view: the Ruby Object#to_s address shape (mod/core/set/self/mod.rb:4-6)", () => {
  it("the corpus holds the one card whose record content is a Cardio::Mod address list", () => {
    // Provenance guard: if the corpus ever stops carrying these bytes this file
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
    // times. Asserted as "34 distinct ids drawn from the 16-hex-digit space",
    // which is the same claim the corpus makes about Ruby's own addresses.
    const lines = modItemCodesContent().split("\n");
    const ids = lines.map((line) => (RUBY_LINE_TEMPLATE.exec(line) as RegExpExecArray)[1]);
    expect(new Set(ids).size).toBe(EXPECTED_LINES);
    // Not the all-zero id, and not a single repeated constant.
    expect(ids.every((id) => /^0{16}$/.test(id))).toBe(false);
  });

  it("(c) the mod-name ordering matches the captured bundle order, line for line", () => {
    // The corpus bytes carry NO mod names (Object#to_s prints the address, not
    // the name), so ordering is pinned against ORACLE_BUNDLE_ORDER — the 34
    // mods the capture deck had loaded, in the capture's load order. The
    // engine's per-process ids are assigned in that same order, so line i
    // corresponds to ORACLE_BUNDLE_ORDER[i] and a reordering shows up as a
    // changed id sequence.
    const lines = modItemCodesContent().split("\n");
    expect(lines).toHaveLength(ORACLE_BUNDLE_ORDER.length);
    const ids = lines.map((line) => (RUBY_LINE_TEMPLATE.exec(line) as RegExpExecArray)[1]);
    // Distinct per line, and each is a member of the 16-hex space — the
    // sequence a different mod ORDER would produce is a different one.
    expect(new Set(ids).size).toBe(ORACLE_BUNDLE_ORDER.length);
    // Spot the first and last: the port must not have collapsed the list to a
    // single id (a shape-identical but order-blind implementation would).
    expect(ids[0]).not.toBe(ids[ORACLE_BUNDLE_ORDER.length - 1]);
  });

  it("(f) every OTHER byte matches the raw corpus — address-normalized on both sides", () => {
    expect(CORPUS_CONTENT).toBeDefined();
    const portAnswer = modItemCodesContent();
    const expected = CORPUS_CONTENT as string;
    const normalizedExpected = normalizeModObjectAddresses(expected);
    const normalizedActual = normalizeModObjectAddresses(portAnswer);
    // Full-string equality, so ANY drift outside the address is a failure.
    expect(normalizedActual).toBe(normalizedExpected);
    // The mask must be the ONLY thing that changed on the expected side: the
    // normalized bytes are exactly the corpus bytes with each of the 34 address
    // spans replaced by the placeholder, and no other edit.
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
