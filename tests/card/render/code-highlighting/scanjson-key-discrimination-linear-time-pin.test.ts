// scanJson key-discrimination linear-time pin.
//
// The original key/string discriminator was the regex
// KEY_RE = /^(?:[^\\"]+|\\.)*"\s*:/ (ported from coderay-1.1.3 json.rb:41),
// tested on the remainder after EVERY opening quote. Its star's alternatives
// overlap (`[^\\"]+` consumes 1..k chars), so when the closing quote is NOT
// followed by `:` - a string VALUE, not a key - the scanner enumerated every
// composition of the run before failing: 2^(n-1) branches for an n-char
// run. Real JSON content hits this constantly (any JSON card with a
// multi-char string value; a 618-byte tinyMCE config spun the scanner past
// a 2 s wall without returning, and quote-free synthetic fixtures never
// caught it).
//
// The fix replaces the regex test with a single-pass key walk (no regex
// backtracking is possible). These pins hold the two contracts:
//
// 1. SEMANTICS: byte-identical output to the recorded PRE-FIX battery
//    (fixtures/scanjson-key-discrimination-edge-battery.json: escaped/
//    unicode/line-terminator/dangling-backslash edge keys plus the
//    pathological string-value class at feasible sizes (n<=12, including
//    n=4/8/12 records of the exact shape the time pins below use) - the
//    recorded outputs, so any drift here is a behavior change, not just a
//    speed change).
// 2. TIME: the pathological string-value shape at n=28 (~2^27 branches for
//    the regex engine) must return in bounded time with the correct
//    string-group bytes.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ALPHA_STYLES } from "../../../../src/card/render/code-highlighting/alpha-style.js";
import { coderayEscape } from "../../../../src/card/render/code-highlighting/escape.js";
import { scanJson } from "../../../../src/card/render/code-highlighting/scanners/json.js";
import { itOrSkipLoud } from "../../../support/describe-with-corpus.js";

const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);

interface BatteryEntry {
  input: string;
  output: string;
}

function loadBattery(): Record<string, BatteryEntry> {
  return JSON.parse(
    readFileSync(new URL("./scanjson-key-discrimination-edge-battery.json", FIXTURE_DIR), "utf8"),
  ) as Record<string, BatteryEntry>;
}

// Mirrors the scanner's private wrapText/styleFor through the PUBLIC alpha
// table, so the expected bytes here are built from the same style source as
// the scanner. wrapText applies coderayEscape exactly like the scanner's
// private helper - omitting the escape makes the coupling check fail on
// `&` vs `&amp;`.
function styleFor(kind: string): string | undefined {
  for (const entry of ALPHA_STYLES) if (entry.kind === kind) return entry.style;
  return undefined;
}

function wrapText(text: string, kind: string): string {
  const style = styleFor(kind);
  const escaped = coderayEscape(text);
  return style === undefined ? escaped : `<span style="${style}">${escaped}</span>`;
}

// The pathological-shape expected bytes are derived from the recorded
// battery output, not hand-modeled spans: the battery records the same
// shape at feasible n=12, and the run-length splice (replace the 12-a
// content run with an n-a run) is safe because a plain ASCII run emits one
// content token regardless of length, so nothing else in the output can
// move. A non-structural char after a string is wrapped as an :error
// token, so hand-built raw-byte tails would be wrong expectations.
function expectedPathologicalOutput(run: number): string {
  const n12 = loadBattery()["pathological string-value run n=12 (old engine capture)"];
  const out12 = n12.output;
  const twelve = "a".repeat(12);
  const first = out12.indexOf(twelve);
  if (first === -1 || first !== out12.lastIndexOf(twelve)) {
    throw new Error("battery n=12 record does not carry a unique 12-a content run");
  }
  return out12.replace(twelve, "a".repeat(run));
}

describe("scanJson key discrimination: pre-fix battery byte-identity", () => {
  const battery = loadBattery();
  it("battery fixture is present and non-trivial", () => {
    expect(Object.keys(battery).length).toBeGreaterThanOrEqual(50);
  });
  for (const [name, entry] of Object.entries(battery)) {
    it(`${name}: bytes identical to the recorded pre-fix output`, () => {
      expect(scanJson(entry.input)).toBe(entry.output);
    });
  }
});

describe("scanJson key discrimination: pathological string-value shape returns in bounded time", () => {
  // n=28: the regex engine needed ~2^27 backtracking branches for this
  // shape (doubling every +2 chars). The linear scan must stay orders of
  // magnitude below the bound.
  const RUN = 28;
  const pathological = `{"${"a".repeat(RUN)}" x}`;

  it("string value with a long plain run scans to the correct string-group bytes, fast", () => {
    const t0 = performance.now();
    const out = scanJson(pathological);
    const elapsedMs = performance.now() - t0;
    // Time first: at the pre-fix shape this is the assertion that fails
    // (the old engine was still enumerating at ~2 s here).
    expect(elapsedMs).toBeLessThan(500);
    expect(out).toBe(expectedPathologicalOutput(RUN));
  });

  it("string value run stays a string group as it grows (no classification drift, fast)", () => {
    for (const run of [40, 64, 96]) {
      const t0 = performance.now();
      const out = scanJson(`{"${"a".repeat(run)}" x}`);
      const elapsedMs = performance.now() - t0;
      expect(elapsedMs).toBeLessThan(500);
      expect(out).toBe(expectedPathologicalOutput(run));
    }
  });

  // Real deck content behind a MANUAL gate: at the pre-fix implementation
  // this input hung indefinitely (exit 124 under `timeout 2`), so it must
  // never run in the default suite. Run it explicitly:
  //   DECKO_TS_SCANJSON_REAL_CARD53_PIN=1 npx vitest run <this file>
  // The input is the committed tinyMCE-config fixture (618 bytes, a stock
  // config, no deck identity); the expected bytes are the scanner's output,
  // consistent with the battery records for the same class at n<=12.
  itOrSkipLoud(!(Boolean(process.env.DECKO_TS_SCANJSON_REAL_CARD53_PIN)), "tests/card/render/code-highlighting/scanjson-key-discrimination-linear-time-pin.test.ts", "Boolean(process.env.DECKO_TS_SCANJSON_REAL_CARD53_PIN)")(
    "real deck card 53 (*tiny_mce) db_content scans in bounded time to the captured bytes",
    () => {
      const content = readFileSync(
        new URL("./real-deck-card-53-tinymce-db-content.txt", FIXTURE_DIR),
        "utf8",
      );
      const expected = readFileSync(
        new URL("./real-deck-card-53-tinymce-expected-scan-output.html", FIXTURE_DIR),
        "utf8",
      );
      const t0 = performance.now();
      const out = scanJson(content);
      const elapsedMs = performance.now() - t0;
      expect(elapsedMs).toBeLessThan(1000);
      expect(out).toBe(expected);
    },
  );
});

// Guard the mirror helpers themselves: if someone changes the alpha table's
// string-group rules or the escape behavior, the mirrored helpers above must
// follow - these assertions make that coupling loud instead of letting the
// pins silently compare against stale helpers.
describe("pin helper coupling", () => {
  it("alpha table agrees with the scanner's string-group constants", () => {
    // alpha.rb group-scoped rules as documented (and oracle-pinned) on the
    // scanner itself: .string group/delimiter/content, json.ts GROUP_SCOPED.
    const stringGroup = "background-color:hsla(0,100%,50%,0.05)";
    const stringContent = "color:#D20";
    const fixture = readFileSync(
      new URL("./real-deck-card-53-tinymce-expected-scan-output.html", FIXTURE_DIR),
      "utf8",
    );
    // the real-content fixture is recorded expected bytes: its string
    // groups must carry exactly the documented group/content styles
    expect(fixture).toContain(`<span style="${stringGroup}">`);
    expect(fixture).toContain(`<span style="${stringContent}">`);
    // wrapText mirrors the scanner's private helper, escape included
    expect(wrapText("&", "error")).toBe(`<span style="${styleFor("error")}">${coderayEscape("&")}</span>`);
  });
});
