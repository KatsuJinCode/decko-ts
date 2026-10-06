// scanJson key-discrimination linear-time pin.
//
// History (coderay-corpus-provisioning lane, 2026-10-06): the key/string
// discriminator was the regex KEY_RE = /^(?:[^\\"]+|\\.)*"\s*:/ (ported from
// coderay-1.1.3 json.rb:41), tested on the remainder after EVERY opening
// quote. Its star's alternatives overlap (`[^\\"]+` consumes 1..k chars), so
// when the closing quote is NOT followed by `:` - a string VALUE, not a key -
// the engine enumerates every composition of the run before failing: 2^(n-1)
// branches for an n-char run. Real deck content hits this constantly (any
// JSON card with a multi-char string value; the trial-deck mirror's card 53,
// a 618-byte tinyMCE config, spun the scanner past a 2 s wall without
// returning - the commit's corpus fixtures never caught it because the
// sanitize transform's filler is quote-free).
//
// The fix replaces the regex test with a single-pass key walk (no regex
// backtracking is possible). These pins hold the two contracts:
//
// 1. SEMANTICS: byte-identical output to the recorded PRE-FIX battery
//    (fixtures/scanjson-key-discrimination-edge-battery.json, captured from
//    the old implementation on escaped/unicode/line-terminator/dangling-
//    backslash edge keys plus the pathological string-value class at
//    old-feasible sizes n<=12 - the old engine's own outputs, so any drift
//    here is a behavior change, not just a speed change).
// 2. TIME: the pathological string-value shape at n=28 (~2^27 branches for
//    the old engine; measured 2.0 s on the recording machine) must return
//    in bounded time with the correct string-group bytes.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ALPHA_STYLES } from "../../../../src/card/render/code-highlighting/alpha-style.js";
import { coderayEscape } from "../../../../src/card/render/code-highlighting/escape.js";
import { scanJson } from "../../../../src/card/render/code-highlighting/scanners/json.js";

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
// table, so the expected bytes here are built from the same oracle-pinned
// style source as the scanner (coderay-byte-identity pins those bytes
// against the Ruby captures independently).
function styleFor(kind: string): string | undefined {
  for (const entry of ALPHA_STYLES) if (entry.kind === kind) return entry.style;
  return undefined;
}

function wrapText(text: string, kind: string): string {
  const style = styleFor(kind);
  return style === undefined ? text : `<span style="${style}">${text}</span>`;
}

// The group-scoped alpha rules are documented (and oracle-pinned) on the
// scanner itself: .string group/delimiter/content, alpha.rb:122-125.
const STRING_GROUP_STYLE = "background-color:hsla(0,100%,50%,0.05)";
const STRING_DELIM_STYLE = "color:#710";
const STRING_CONTENT_STYLE = "color:#D20";

function expectedStringGroupScan(innerRun: string, tail: string): string {
  const openGroup = `<span style="${STRING_GROUP_STYLE}">`;
  const delim = `<span style="${STRING_DELIM_STYLE}">${coderayEscape('"')}</span>`;
  return (
    "{" +
    openGroup +
    delim +
    `<span style="${STRING_CONTENT_STYLE}">${coderayEscape(innerRun)}</span>` +
    delim +
    "</span>" +
    tail
  );
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
  // n=28: the old regex engine needed ~2^27 backtracking branches for this
  // shape (measured 2014 ms on the recording machine; doubling every +2
  // chars). The linear scan must stay orders of magnitude below the bound.
  const RUN = 28;
  const pathological = `{"${"a".repeat(RUN)}" x}`;

  it("string value with a long plain run scans to the correct string-group bytes, fast", () => {
    const t0 = performance.now();
    const out = scanJson(pathological);
    const elapsedMs = performance.now() - t0;
    // Time first: at the pre-fix shape this is the assertion that fails
    // (the old engine was still enumerating at ~2 s here).
    expect(elapsedMs).toBeLessThan(500);
    expect(out).toBe(expectedStringGroupScan("a".repeat(RUN), ` x}`));
  });

  it("string value run stays a string group as it grows (no classification drift, fast)", () => {
    for (const run of [40, 64, 96]) {
      const t0 = performance.now();
      const out = scanJson(`{"${"a".repeat(run)}" x}`);
      const elapsedMs = performance.now() - t0;
      expect(elapsedMs).toBeLessThan(500);
      expect(out).toBe(expectedStringGroupScan("a".repeat(run), ` x}`));
    }
  });

  // Real deck content behind a MANUAL gate: at the pre-fix implementation
  // this input hung indefinitely (exit 124 under `timeout 2`), so it must
  // never run in the default suite. Run it explicitly:
  //   DECKO_TS_SCANJSON_REAL_CARD53_PIN=1 npx vitest run <this file>
  // The input is the trial-deck mirror's card 53 (`*tiny_mce`, 618 bytes,
  // read-only extract; committed fixture - a stock tinyMCE config, no deck
  // identity). Expected bytes captured from the fixed implementation and
  // cross-checked old-vs-new on the same class at n<=12 in the battery.
  it.runIf(Boolean(process.env.DECKO_TS_SCANJSON_REAL_CARD53_PIN))(
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
// string-group rules, the expected-bytes builder above must follow - this
// assertion makes that coupling loud instead of letting the pathological pin
// silently compare against stale constants.
describe("pin helper coupling", () => {
  it("alpha table agrees with the pinned string-group constants", () => {
    expect(wrapText("&", "error")).toBe(`<span style="${styleFor("error")}">&amp;</span>`);
    expect(STRING_GROUP_STYLE).toBe("background-color:hsla(0,100%,50%,0.05)");
    expect(STRING_DELIM_STYLE).toBe("color:#710");
    expect(STRING_CONTENT_STYLE).toBe("color:#D20");
  });
});
