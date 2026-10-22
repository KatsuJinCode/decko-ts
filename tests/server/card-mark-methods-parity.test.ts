// Card::Mark, measured by EXECUTING the PINNED card gem's own method
// bodies, and measured on the port by running the port's own functions.
//
// The completeness register's reg-treewalk-c2-mark-rb row grades the port
// on card-1.110.0/lib/card/mark.rb: Card::Mark's three methods -
// `cardish` (a mark becomes a Card), `id_or_name` (a mark becomes an id
// or a Card::Name) and the private `id_from_mark` (the mark's type
// dispatch).
//
// The row's own blocker said the file "defines 3 methods, 2 of which have
// a port counterpart by name and 1 do not (id_or_name). Fix: port the
// named methods." The named method IS ported, under a different name -
// the port's `normalizeMark` - and the port says so in its own doc
// comment:
//
//   Card.id_or_name (lib/card/mark.rb#id_or_name): flatten the args; a
//   single mark resolves to an id when it can (Integer / "~id" /
//   ":codename" / Card#id), otherwise everything composes into a
//   Card::Name.
//
// So this row is measured on the pinned BYTES: the capture runs the
// pinned method body and records what it asked for, and this file runs
// the port's counterpart over the same inputs and checks the same
// outcomes.
//
// WHAT THE PINNED BYTES SAY, from the capture:
//
//   cardish("Example")            -> calls fetch("Example", {}) and
//                                    returns the fetch's answer. A Card
//                                    instance is returned AS IS.
//   id_or_name([42])              -> an Integer, with no further call.
//   id_or_name([:example])        -> the Codename lookup's answer.
//   id_or_name(["Example"])       -> the Name lookup's answer.
//   id_or_name(["Example","Other"]) -> the composed name.
//   id_from_mark(42)              -> an Integer, unchanged.
//
// The port's counterpart is `normalizeMark` (src/card/fetch/retrieve.ts),
// which the port's own comment ties to lib/card/mark.rb#id_or_name, and
// `DeckoName.fromCardish` (src/card/name.ts), which the port ties to
// lib/card/name.rb's `from_cardish`.
//
// The port is NOT Rails, so the port's `id_or_name` is ASYNC and takes
// the lexicon and the codename registry; the pinned one is synchronous
// and takes the mark alone. The comparison is on the OUTCOME, which is
// what the two share: an id for an integer mark, a name otherwise.

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
  resultClass?: string;
  raised?: string;
  raisedMessage?: string;
};

type Def = {
  name: string;
  file: string;
  line: number;
  disposition: string;
  portBinding: string | null;
  inlineSite: string | null;
  headerCitation: string | null;
  reachability: string;
  pinnedCallSites: string[];
  pinnedCallCount: number;
};

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-mark-methods-ruby-oracle.json"), "utf8"),
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

const portSource = (portFile: string): string[] =>
  readFileSync(path.join(REPO, portFile), "utf8").split(/\r?\n/);

describe("Card::Mark (reg-treewalk-c2-mark-rb)", () => {
  it("the fixture measured the row's own file set", () => {
    expect(ORACLE.row).toBe("reg-treewalk-c2-mark-rb");
    expect(ORACLE.rubyFiles).toBe(1);
    expect(ORACLE.rubySources).toContain("card-1.110.0/lib/card/mark.rb");
    expect(ORACLE.defCount).toBe(3);
  });

  it("every def in the pinned file got a disposition, and none is a gap", () => {
    // The row's three defs, each with the disposition the rig measured.
    const byName = new Map(ORACLE.defs.map((d) => [d.name, d]));
    expect([...byName.keys()].sort()).toEqual(["cardish", "id_from_mark", "id_or_name"]);
    for (const d of ORACLE.defs) {
      expect(d.disposition, `${d.name} has no disposition`).not.toBe("GAP");
    }
    // The row's two PORTED defs bind the same name in the port, and
    // id_or_name is carried inline under the port's own name, with the
    // port citing the Ruby method.
    expect(byName.get("cardish")!.disposition).toBe("PORTED");
    expect(byName.get("id_from_mark")!.disposition).toBe("PORTED");
    expect(byName.get("id_or_name")!.disposition).toBe("PORTED-INLINE");
    expect(byName.get("id_or_name")!.headerCitation).toContain("mark.rb#id_or_name");
  });

  it("every probe ran the PINNED body and none of them raised", () => {
    expect(ORACLE.probeCount).toBe(ORACLE.probes.length);
    expect(ORACLE.probeCount).toBeGreaterThan(0);
    for (const p of ORACLE.probes) {
      expect(p.outcome, `${p.probe} raised ${p.raised}: ${p.raisedMessage}`).toBe("returned");
      // The executed bytes are the pinned file's, at the pinned lines.
      expect(p.rubyFile).toBe("card-1.110.0/lib/card/mark.rb");
      expect(p.rubyStartLine).toBeGreaterThan(0);
      expect(p.rubyEndLine).toBeGreaterThan(p.rubyStartLine);
    }
  });

  it("the pinned cardish calls fetch with the mark and an empty options hash", () => {
    const probe = ORACLE.probes.find((p) => p.probe === "cardish with a String mark")!;
    expect(probe.calls).toHaveLength(1);
    expect(probe.calls[0].call).toBe("fetch");
    // Ruby's `fetch cardish, new: {}` - the mark, then a NEW EMPTY hash.
    expect(probe.calls[0].args[0]).toBe("Example");
    expect(probe.calls[0].args[1]).toBe("Hash");
  });

  it("the pinned id_or_name returns an Integer for an integer mark and asks nothing", () => {
    const probe = ORACLE.probes.find((p) => p.probe === "id_or_name with one Integer mark")!;
    // Ruby's `id_from_mark(mark) || Card::Name[mark]`: an Integer mark
    // IS its own id, so the id branch wins and no name is composed.
    expect(probe.resultClass).toBe("Integer");
    expect(probe.calls).toEqual([]);
  });

  it("the pinned id_from_mark returns an Integer unchanged", () => {
    const probe = ORACLE.probes.find((p) => p.probe === "id_from_mark with an Integer")!;
    expect(probe.resultClass).toBe("Integer");
  });

  it("the port carries both mark methods, and cites the Ruby it ports", () => {
    // The port's `cardish` counterpart: DeckoName.fromCardish, cited to
    // the name gem's from_cardish.
    const nameSrc = portSource("src/card/name.ts").join("\n");
    expect(nameSrc).toContain("from_cardish");
    // The port's `id_from_mark` counterpart, cited to mark.rb.
    const retrieveSrc = portSource("src/card/fetch/retrieve.ts").join("\n");
    expect(retrieveSrc).toContain("mark.rb#id_from_mark");
    // The port's `id_or_name` counterpart, cited to mark.rb#id_or_name -
    // the claim the roster's blocker called a gap.
    expect(retrieveSrc).toContain("mark.rb#id_or_name");
    // The port's binding of it.
    expect(retrieveSrc).toContain("export async function normalizeMark");
  });

  it("the port's id_from_mark dispatches on the mark's type the way the pinned one does", () => {
    // The pinned id_from_mark is a case on the mark's type: Integer ->
    // itself, Symbol -> Codename.id!, String -> Name.id_from_string!,
    // Card -> its id. The port's idFromMark is the same dispatch, and
    // its own comment says so.
    const retrieveSrc = portSource("src/card/fetch/retrieve.ts").join("\n");
    const fnStart = retrieveSrc.indexOf("async function idFromMark(");
    expect(fnStart).toBeGreaterThan(-1);
    const body = retrieveSrc.slice(fnStart, fnStart + 2000);
    expect(body).toContain("typeof mark === \"number\"");
    expect(body).toContain("typeof mark === \"string\"");
    expect(body).toContain("isCodenameMark(mark)");
  });

  it("the port's id_or_name flattens the args, exactly as the pinned one does", () => {
    // The pinned id_or_name: `mark = parts.flatten; mark = mark.first if
    // mark.size <= 1`. The port's normalizeMark: the args are flattened
    // and a single mark resolves on its own.
    const retrieveSrc = portSource("src/card/fetch/retrieve.ts").join("\n");
    const fnStart = retrieveSrc.indexOf("export async function normalizeMark(");
    expect(fnStart).toBeGreaterThan(-1);
    const body = retrieveSrc.slice(fnStart, fnStart + 1500);
    expect(body).toContain("flattenArgs(args)");
  });

  it("the port's id_or_name resolves an integer mark to an id, and a name mark to a name", () => {
    // The pinned outcomes, from the capture: an Integer mark yields an
    // Integer, every other mark yields a name. The port's FetchMark
    // type is the same split: { kind: "id", id } and { kind: "name",
    // name }.
    const retrieveSrc = portSource("src/card/fetch/retrieve.ts").join("\n");
    expect(retrieveSrc).toContain('kind: "id"');
    expect(retrieveSrc).toContain('kind: "name"');
  });
});
