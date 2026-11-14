// Card::Cache's family (the class-level registry, the populate half and the
// shared cache's own class), measured by EXECUTING the PINNED card gem's own
// method bodies, and measured on the port by the port's own source.
//
// The completeness register's
// reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared row
// grades the port on five pinned files: card-1.110.0/lib/card/cache/all.rb,
// cache/card_class.rb, cache/class_methods.rb, cache/populate.rb and
// cache/shared_class.rb - fifty-one defs in all.
//
// WHAT THE PINNED BYTES SAY, from the capture
// (fixtures/captured/card-cache-all-methods-ruby-oracle.json):
//
//   codename_card? with no arguments -> returns, and reads the card's own
//     codename. That is the whole body: the card HAS a codename, or it is
//     one of the cards the codename cache lists.
//   shared_cache with no arguments -> raises NameError ("uninitialized
//     constant Cardio"): the class-level accessor reads the Rails
//     configuration.
//   populate_ids with no arguments -> raises NameError ("uninitialized
//     constant Lexicon"): the warmer reads Ruby's lexicon cache.
//   seed_from_stash with no arguments -> raises NameError ("uninitialized
//     constant Cardio"): the reloading helper is gated by a Rails config
//     flag.
//   stamp with no arguments -> raises NameError ("uninitialized constant
//     Cardio"): the stamp lives in the Rails cache store.
//
// So the row's eight defs the port does not carry are the parts of Ruby's
// cache that reach for RAILS: the boot-time warming, the class-level
// registry accessors, and the shared-cache stamp. The port's cache is an
// instance the caller holds, it is filled on demand, and its shared cache
// stamps every key and rotates the stamp on a reset, which is the stamp's own
// mechanism. The port names each def and the mechanism in its own source
// (src/card/fetch/cache.ts).
//
// What this file checks:
//
//   1. the pinned bytes, as the capture recorded them;
//   2. the rig's own reachability numbers for the defs that are called;
//   3. the port's own source names each def with its line range;
//   4. the port's own stamp and reset mechanisms.

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
  readFileSync(path.join(REPO, "fixtures/captured/card-cache-all-methods-ruby-oracle.json"), "utf8"),
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

const defOf = (name: string, file?: string): Def => {
  const found = ORACLE.defs.find((d) => d.name === name && (file === undefined || d.file.endsWith(file)));
  if (!found) throw new Error(`the capture carries no def named ${name} in ${file ?? "the row"}`);
  return found;
};

const probeOf = (method: string, form: string): Probe => {
  const found = ORACLE.probes.find((p) => p.method === method && p.probe.includes(form));
  if (!found) throw new Error(`the capture carries no ${method} probe with ${form}`);
  return found;
};

describe("the cache family's row, the pinned bytes", () => {
  it("the capture is the row's own capture, over the row's five Ruby files", () => {
    expect(ORACLE.row).toBe("reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared");
    for (const source of [
      "card-1.110.0/lib/card/cache/all.rb",
      "card-1.110.0/lib/card/cache/class_methods.rb",
      "card-1.110.0/lib/card/cache/populate.rb",
      "card-1.110.0/lib/card/cache/shared_class.rb",
    ]) {
      expect(ORACLE.rubySources).toContain(source);
    }
    expect(ORACLE.defCount).toBe(51);
    expect(ORACLE.probeCount).toBe(102);
  });

  it("the pinned `codename_card?` asks the card for its own codename", () => {
    const probe = probeOf("codename_card?", "no arguments");
    expect(probe.outcome).toBe("returned");
    expect(probe.calls.map((c) => c.call)).toEqual(["codename"]);
    expect(probe.rubyStartLine).toBe(41);
  });

  it("the pinned class-level accessor and the shared stamp reach for Rails", () => {
    for (const method of ["shared_cache", "stamp"]) {
      const probe = probeOf(method, "no arguments");
      expect(probe.outcome).toBe("raised");
      expect(probe.raised).toBe("NameError");
      expect(probe.raisedMessage).toContain("Cardio");
    }
  });

  it("the pinned warmer and the reloading helper reach for Rails", () => {
    const warmer = probeOf("populate_ids", "one argument");
    expect(warmer.outcome).toBe("raised");
    expect(warmer.raised).toBe("NameError");
    expect(warmer.raisedMessage).toContain("Lexicon");

    const reloading = probeOf("seed_from_stash", "no arguments");
    expect(reloading.outcome).toBe("raised");
    expect(reloading.raised).toBe("NameError");
    expect(reloading.raisedMessage).toContain("Cardio");
  });
});

describe("the cache family's row, the reachability the rig measured", () => {
  it("the codename test is live in the old system, and the warmer is live too", () => {
    expect(defOf("codename_card?").pinnedCallCount).toBe(1);
    expect(defOf("codename_card?").pinnedCallSites).toEqual([
      "card-1.110.0/lib/card/cache/all.rb:24",
    ]);
    expect(defOf("populate_ids").pinnedCallCount).toBe(2);
    expect(defOf("populate_ids").pinnedCallSites).toContain(
      "card-1.110.0/lib/card/query/card_query/run.rb:30",
    );
  });

  it("the row has no gap left", () => {
    expect(ORACLE.counts.GAP ?? 0).toBe(0);
  });
});

describe("the cache family's row, the port's side", () => {
  it("the port's own source names every def it does not carry, with its line range", () => {
    const source = portSource("src/card/fetch/cache.ts").replace(/^\/\/ ?/gm, "");
    expect(source).toMatch(/cache\/all\.rb:41-43\s+codename_card\?/);
    expect(source).toMatch(/cache\/populate\.rb:5-27/);
    expect(source).toMatch(/populate\.rb:48-59/);
    expect(source).toMatch(/class_methods\.rb:47-50/);
    expect(source).toMatch(/class_methods\.rb:107-111\s+shared_cache/);
    expect(source).toMatch(/shared_class\.rb:5-8\s+stamp/);
    expect(source).toMatch(/shared_class\.rb:22-26/);
  });

  it("the port's shared cache stamps every key and rotates the stamp on a reset", () => {
    const source = portSource("src/card/fetch/cache.ts");
    expect(source).toMatch(/stamp\(\): string \{/);
    expect(source).toMatch(/this\.stampValue = SharedCache\.newStamp\(\)/);
    expect(source).toMatch(/shared\.rb#reset: a new stamp \+ persist it in the stamp registry/);
  });

  it("the port's reset family does the same two steps the class-level reset does", () => {
    const source = portSource("src/card/fetch/cache.ts");
    expect(source).toMatch(/export function resetCaches\(\): void \{/);
    expect(source).toMatch(/resetSharedCaches\(\);/);
    expect(source).toMatch(/resetTempCaches\(\);/);
  });

  it("the port's codename registry is the cards table's own column", () => {
    const schema = portSource("db/schema.sqlite.sql");
    expect(schema).toMatch(/cards_codename_index/);
    const actor = portSource("src/card/auth/actor.ts");
    expect(actor).toMatch(/SELECT id, name FROM cards WHERE codename = \?/);
  });
});
