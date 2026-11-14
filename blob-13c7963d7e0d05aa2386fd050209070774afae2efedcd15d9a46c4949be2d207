// Card::Auth::Proxy, measured by EXECUTING the PINNED card gem's own method
// bodies, and measured on the port by running the port's own functions.
//
// The completeness register's reg-treewalk-c2-auth-proxy-rb-6-29-48-59 row
// grades the port on card-1.110.0/lib/card/auth/proxy.rb: the proxy
// module's six defs - `as` (assume another user's permissions), `as_bot`
// (assume the administrator's), `as_id` (the proxy user's id), `as_card`
// (the proxy user's card), `with` (run a block as another actor) and the
// private `temporarily` (the save/restore of the process-global state).
//
// WHAT THE PINNED BYTES SAY, from the capture
// (fixtures/captured/card-auth-proxy-methods-ruby-oracle.json):
//
//   with with no arguments   -> raises ArgumentError at proxy.rb:48
//                               ("wrong number of arguments (given 0,
//                               expected 1)"): the method needs its
//                               argument.
//   with with one argument   -> reaches proxy.rb:50, which is
//                               `auth_data = { current_id: Card.id(auth_data) }`:
//                               an Integer or a String is resolved through
//                               Card.id before the block runs.
//   temporarily with no args -> reads current_id twice and then raises
//                               LocalJumpError ("no block given (yield)"):
//                               it saves the current id, yields, and
//                               restores it.
//
// The port's counterpart for the whole save/restore half is its ENGINE
// SHAPE: the port has no process-global Auth singleton, so there is no
// current_id to save and restore, and a block that runs as another actor
// is written as a call that takes the actor its caller passes. The port
// says so in its own words (src/card/auth/actor.ts), and the rig measures
// `with` and `temporarily` as NAMED-COLLAPSE against that statement
// rather than against a guess.
//
// What this file checks:
//
//   1. the pinned bytes, as the capture recorded them;
//   2. the port's own source names the method and the mechanism, which is
//      the claim the rig measures;
//   3. the port's behaviour matches the mechanism: the actor is an
//      explicit value, so resolving another actor cannot disturb the one
//      a caller already holds (the property Ruby's save/restore buys).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_CODENAME,
  actorAnonymous,
  actorBot,
  DECKOBOT_CODENAME,
} from "../../src/card/auth/actor.js";
import {
  createAuthTestStorage,
  insertAccountCard,
} from "../card/auth/auth-test-storage.js";

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
  collapse: string | null;
  headerCitation: string | null;
  visibility: string;
};

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-auth-proxy-methods-ruby-oracle.json"), "utf8"),
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

describe("Card::Auth::Proxy, the row's pinned bytes", () => {
  it("the capture is the row's own capture, over the row's Ruby file set", () => {
    expect(ORACLE.row).toBe("reg-treewalk-c2-auth-proxy-rb-6-29-48-59");
    expect(ORACLE.rubySources).toContain("card-1.110.0/lib/card/auth/proxy.rb");
    expect(ORACLE.defCount).toBe(6);
    expect(ORACLE.probeCount).toBe(12);
  });

  it("the pinned `with` needs its argument and resolves it through Card.id", () => {
    const noArgs = ORACLE.probes.find((p) => p.method === "with" && p.probe.includes("no arguments"));
    expect(noArgs).toBeDefined();
    expect(noArgs!.outcome).toBe("raised");
    expect(noArgs!.raised).toBe("ArgumentError");
    expect(noArgs!.raisedMessage).toContain("wrong number of arguments");
    expect(noArgs!.rubyStartLine).toBe(48);

    const oneArg = ORACLE.probes.find((p) => p.method === "with" && p.probe.includes("one argument"));
    expect(oneArg).toBeDefined();
    expect(oneArg!.outcome).toBe("raised");
    // The one-argument arm reached proxy.rb:50, which is the Card.id
    // resolution of an Integer or a String argument.
    expect(oneArg!.raisedBacktrace?.[0]).toContain("proxy.rb:50");
  });

  it("the pinned `temporarily` reads the current_id it saves before it yields", () => {
    const temporarily = ORACLE.probes.find(
      (p) => p.method === "temporarily" && p.probe.includes("no arguments"),
    );
    expect(temporarily).toBeDefined();
    expect(temporarily!.calls.map((c) => c.call)).toEqual(["current_id", "current_id"]);
    expect(temporarily!.rubyStartLine).toBe(63);
  });
});

describe("Card::Auth::Proxy, the port's side", () => {
  it("the rig measures the two save/restore defs as collapses against the port's own statement", () => {
    const withDef = ORACLE.defs.find((d) => d.name === "with");
    const temporarily = ORACLE.defs.find((d) => d.name === "temporarily");
    expect(withDef?.disposition).toBe("NAMED-COLLAPSE");
    expect(temporarily?.disposition).toBe("NAMED-COLLAPSE");
    // The claim the rig measured is the port's own file, not a guess.
    expect(withDef?.collapse).toContain("card/auth/actor.ts");
    expect(ORACLE.counts.GAP ?? 0).toBe(0);
  });

  it("the port's own source names Ruby's `with` with its line range and the mechanism", () => {
    // The header's comment markers are stripped, so a sentence that wraps
    // across two comment lines is read as the one sentence it is.
    const source = portSource("src/card/auth/actor.ts").replace(/^\/\/ ?/gm, "");
    // The sentence names the method, the Ruby line range that covers the
    // def, and the reason there is no counterpart.
    expect(source).toMatch(/proxy\.rb:48-59\s+with\)/);
    expect(source).toMatch(/has no counterpart/);
    expect(source).toMatch(/process-global current_id/);
  });

  it("the actor is an explicit value: resolving another actor does not disturb the one a caller holds", async () => {
    const storage = createAuthTestStorage();
    insertAccountCard(storage, { id: 1, name: "Test Bot", codename: DECKOBOT_CODENAME });
    insertAccountCard(storage, { id: 2, name: "Test Anon", codename: ANONYMOUS_CODENAME });

    const bot = await actorBot(storage.driver);
    const anon = await actorAnonymous(storage.driver);
    // Ruby's `with` saves and restores a process-global so that a nested
    // block cannot see the outer actor. The port has no global to save, so
    // the property holds by construction: the second resolution does not
    // change the first value, and the first value is still the same one
    // after it.
    expect(bot).toEqual({ id: 1, name: "Test Bot" });
    expect(anon).toEqual({ id: 2, name: "Test Anon" });
    expect(await actorBot(storage.driver)).toEqual(bot);
    expect(await actorAnonymous(storage.driver)).toEqual(anon);

    storage.close();
  });
});
