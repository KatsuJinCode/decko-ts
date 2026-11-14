// Card::Cache, measured by EXECUTING the PINNED card gem's own method
// bodies, and measured on the port by the port's own source.
//
// The completeness register's reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb
// row grades the port on card-1.110.0/lib/card/cache.rb: the cache
// module's ten defs - the read, write, fetch, delete, reset and exist
// surface, the private track helper, the tally counter, and the private
// multi-key guard.
//
// WHAT THE PINNED BYTES SAY, from the capture
// (fixtures/captured/card-cache-methods-ruby-oracle.json):
//
//   with_multiple_keys with no arguments -> raises ArgumentError at
//     cache.rb:95 ("wrong number of arguments (given 0, expected 1)"):
//     the helper takes the keys it guards.
//   with_multiple_keys with one argument -> raises LocalJumpError at
//     cache.rb:96 ("no block given (yield)"): the helper's whole content
//     is `keys.size > 1 ? yield : {}`, so with one key it does not
//     yield at all.
//
// The rig's own reachability measurement says the guard is live in the old
// system: with_multiple_keys has one caller, cache.rb:43, inside
// `read_multi`.
//
// The port carries the guard INLINE: `CardCache.readMulti` (src/card/fetch/
// cache.ts) opens with `if (keys.length <= 1) return found;`, which is
// the helper's condition. What the port did NOT do was name Ruby's helper
// in its own source; the port's own test suite names it
// (tests/card/fetch/cache.test.ts:186, "readMulti skips single-key calls
// like Ruby's with_multiple_keys (cache.rb:95-97)"), and the port's source
// now names it too, with the helper's line range.
//
// What this file checks:
//
//   1. the pinned bytes, as the capture recorded them;
//   2. the rig's own reachability number for the guard;
//   3. the port's own source names the helper and the line range;
//   4. the port's own suite pins the behaviour the helper holds.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Probe = {
  probe: string;
  method: string;
  rubyFile: string;
  rubyStartLine: number;
  rubyEndLine: number;
  outcome: string;
  calls: Array<{ call: string; args: unknown[] }>;
  raised?: string;
  raisedMessage?: string;
  raisedBacktrace?: string[];
};

type Def = {
  name: string;
  file: string;
  line: number;
  disposition: string;
  visibility: string;
  pinnedCallSites: string[];
  pinnedCallCount: number;
};

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-cache-methods-ruby-oracle.json"), "utf8"),
) as {
  row: string;
  rubyFiles: number;
  rubySources: string[];
  defCount: number;
  counts: Record<string, number>;
  probeCount: number;
  probes: Probe[];
  defs: Def[];
};

const portSource = (portFile: string): string =>
  readFileSync(path.join(REPO, portFile), "utf8");

const defOf = (name: string): Def => {
  const found = ORACLE.defs.find((d) => d.name === name);
  if (!found) throw new Error(`the capture carries no def named ${name}`);
  return found;
};

describe("Card::Cache, the row's pinned bytes", () => {
  it("the capture is the row's own capture, over the row's Ruby file set", () => {
    expect(ORACLE.row).toBe("reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb");
    expect(ORACLE.rubySources).toContain("card-1.110.0/lib/card/cache.rb");
    expect(ORACLE.defCount).toBe(10);
    expect(ORACLE.probeCount).toBe(20);
  });

  it("the pinned `with_multiple_keys` takes the keys it guards", () => {
    const noArgs = ORACLE.probes.find(
      (p) => p.method === "with_multiple_keys" && p.probe.includes("no arguments"),
    );
    expect(noArgs).toBeDefined();
    expect(noArgs!.outcome).toBe("raised");
    expect(noArgs!.raised).toBe("ArgumentError");
    expect(noArgs!.raisedMessage).toContain("wrong number of arguments");
    expect(noArgs!.rubyStartLine).toBe(95);
  });

  it("the pinned `with_multiple_keys` yields only when there is more than one key", () => {
    const oneArg = ORACLE.probes.find(
      (p) => p.method === "with_multiple_keys" && p.probe.includes("one argument"),
    );
    expect(oneArg).toBeDefined();
    expect(oneArg!.outcome).toBe("raised");
    expect(oneArg!.raised).toBe("LocalJumpError");
    expect(oneArg!.raisedMessage).toContain("no block given");
    // The raise is at the helper's yield line, so the pinned body is the
    // one-line guard `keys.size > 1 ? yield : {}`.
    expect(oneArg!.raisedBacktrace?.[0]).toContain("cache.rb:96");
  });

  it("the guard is live in the old system: the pinned deck calls it from read_multi", () => {
    const guard = defOf("with_multiple_keys");
    expect(guard.pinnedCallCount).toBe(1);
    expect(guard.pinnedCallSites).toEqual(["card-1.110.0/lib/card/cache.rb:43"]);
    expect(guard.visibility).toBe("private");
  });

  it("the row has no gap left", () => {
    expect(ORACLE.counts.GAP ?? 0).toBe(0);
  });
});

describe("Card::Cache, the port's side", () => {
  it("the port's own source names the helper with the line range that covers it", () => {
    const source = portSource("src/card/fetch/cache.ts");
    expect(source).toMatch(/with_multiple_keys \(95-99\)/);
    expect(source).toMatch(/keys\.size > 1 \? yield : \{\}/);
  });

  it("the port's guard is the helper's condition, inline", () => {
    const source = portSource("src/card/fetch/cache.ts");
    expect(source).toMatch(/if \(keys\.length <= 1\) return found;/);
  });

  it("the port's own suite pins the behaviour the helper holds", () => {
    const suite = portSource("tests/card/fetch/cache.test.ts");
    expect(suite).toMatch(/readMulti skips single-key calls like Ruby's with_multiple_keys/);
  });
});
