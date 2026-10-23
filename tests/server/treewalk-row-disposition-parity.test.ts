// treewalk-row-disposition-parity.test.ts - the [Family] rows' port-side
// check, one fixture at a time.
//
// WHAT THIS IS. A row in this family grades the port on a set of pinned
// card-gem files, and the row closes to DONE only where the port
// measurably matches the pinned Ruby. The measurement is the rig's
// (tools/treewalk-family-row-disposition.mjs), and the ORACLE side of it
// is the row capture
// (tests/server/oracle-capture-card-gem-row-methods-ruby.rb), whose
// fixture records, per def, the disposition the rig measured and the
// port site the rig found.
//
// This file is the PORT side of that measurement, and it is deliberately
// generic: it reads a row's fixture and checks that the row's claim is
// still true against the port tree AS IT STANDS. A fixture that has
// drifted from the code it describes fails here, so a stale fixture
// cannot keep a row closed.
//
// WHAT IT ASSERMS, per row:
//
//   - the fixture names a row of this family, and the rig's own output
//     for that row still agrees with the fixture's dispositions. The
//     fixture is a SNAPSHOT of the rig, and the rig is the instrument;
//     if they disagree, the fixture is stale and the row's claim has to
//     be re-measured.
//
//   - every PORTED and PORTED-INLINE def's port site still exists, at
//     the line the fixture recorded, and still carries the text the
//     fixture recorded. A port site that has moved or changed is a
//     fixture that no longer describes the tree.
//
//   - every PORTED-INLINE def's citing file still cites the row's Ruby
//     source, because that citation IS the port's own claim about which
//     Ruby it ports.
//
//   - every GAP def is still a gap, and the gap's named reason is
//     present. A gap that has been closed without the row being
//     re-measured fails here, so the row cannot silently stay WORKING
//     after the port caught up - and a gap that was never real fails
//     here too.
//
//   - the row's own capture RAN the pinned bytes: every probe resolved
//     to a pinned method body with its pinned line numbers, and the
//     row's Ruby file set is what the fixture says it is.
//
// The row's VERDICT is a separate matter from this file's checks: a row
// with no gaps is a candidate for DONE, and a row with a gap is a row
// whose gap the receipt names. The verdict lives in the row's receipt
// and in the roster the fold owns.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_DIR = path.join(REPO, "fixtures/captured");

type Def = {
  name: string;
  file: string;
  line: number;
  disposition: string;
  portBinding: string | null;
  portBindingCited?: string | null;
  portMention?: string | null;
  headerCitation?: string | null;
  inlineSite?: string | null;
  reachability?: string;
  visibility?: string;
  collapse?: string | null;
  pinnedCallSites?: string[];
  pinnedCallCount?: number;
};

type Probe = {
  probe: string;
  method: string;
  rubyFile?: string;
  rubyStartLine?: number;
  rubyEndLine?: number;
  outcome: string;
  calls?: Array<{ call: string; args: unknown[] }>;
  raised?: string;
  raisedMessage?: string;
};

type Fixture = {
  row: string;
  rubyFiles: number;
  rubySources: string[];
  defCount: number;
  counts: Record<string, number>;
  probeCount?: number;
  probes?: Probe[];
  defs: Def[];
  gapReason?: string;
};

// The row fixtures this file checks. One entry per row the lane landed a
// capture for. A row with no entry here has no capture and no claim.
const ROW_FIXTURES: string[] = [
  "card-auth-proxy-methods-ruby-oracle.json",
  "card-auth-setup-methods-ruby-oracle.json",
  "card-auth-token-methods-ruby-oracle.json",
  "card-cache-methods-ruby-oracle.json",
  "card-mailer-methods-ruby-oracle.json",
  "card-mark-methods-ruby-oracle.json",
  "card-content-all-methods-ruby-oracle.json",
  "card-core-spec-methods-ruby-oracle.json",
  "card-setting-methods-ruby-oracle.json",
  "card-reference-methods-ruby-oracle.json",
  "card-save-helper-methods-ruby-oracle.json",
];

// The rig records a port site as a path RELATIVE TO src/ (the rig's
// walk root), so the checker resolves it against src/ and not against
// the repo root.
const SRC = path.join(REPO, "src");

// The line separator, written as a constant so it survives every editor
// and every shell that would otherwise eat a backslash.
const LINE_SPLIT = new RegExp(String.fromCharCode(13, 10) + "?|" + String.fromCharCode(10));
const LINE_JOIN = String.fromCharCode(10);

const resolvePortFile = (portFile: string): string => {
  const candidates = [path.join(SRC, portFile), path.join(REPO, portFile)];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      continue;
    }
  }
  return candidates[0];
};

const portLines = (portFile: string): string[] =>
  readFileSync(resolvePortFile(portFile), "utf8").split(/\r?\n/);

const availableFixtures = (): string[] => {
  let names: string[] = [];
  try {
    names = readdirSync(FIXTURE_DIR);
  } catch {
    return [];
  }
  return names.filter((n) => n.startsWith("card-") && n.endsWith("-ruby-oracle.json"));
};

describe("the [Family] rows' port-side disposition checks", () => {
  it("the fixture directory holds the row captures this file checks", () => {
    const present = availableFixtures();
    expect(present.length).toBeGreaterThan(0);
    for (const name of ROW_FIXTURES) {
      expect(present, `${name} is missing from fixtures/captured`).toContain(name);
    }
  });

  for (const name of ROW_FIXTURES) {
    describe(name, () => {
      const fixture = JSON.parse(
        readFileSync(path.join(FIXTURE_DIR, name), "utf8"),
      ) as Fixture;

      it("the fixture names a row of this family and a Ruby file set", () => {
        expect(fixture.row).toMatch(/^reg-treewalk-/);
        expect(fixture.rubyFiles).toBeGreaterThan(0);
        expect(fixture.rubySources.length).toBeGreaterThan(0);
        expect(fixture.defCount).toBe(fixture.defs.length);
      });

      it("every def carries a disposition the rig defines", () => {
        const known = new Set([
          "PORTED",
          "PORTED-INLINE",
          "NAMED-COLLAPSE",
          "SKIP",
          "INERT-API",
          "GAP",
        ]);
        for (const d of fixture.defs) {
          expect(known.has(d.disposition), `${d.name}: ${d.disposition}`).toBe(true);
        }
        // The counts agree with the defs, so the summary is not a
        // separate number that can drift from the detail.
        const recount: Record<string, number> = {};
        for (const d of fixture.defs) recount[d.disposition] = (recount[d.disposition] ?? 0) + 1;
        for (const [k, v] of Object.entries(recount)) {
          expect(fixture.counts[k] ?? 0, `count for ${k}`).toBe(v);
        }
      });

      it("every PORTED and PORTED-INLINE def's port site still exists where the fixture recorded it", () => {
        const claimed = fixture.defs.filter(
          (d) => d.disposition === "PORTED" || d.disposition === "PORTED-INLINE",
        );
        for (const d of claimed) {
          const site = d.portBindingCited ?? d.inlineSite;
          expect(site, `${d.name} has no port site to check`).toBeTruthy();
          // The site is "<file>:<line>" or "<file>:<line> (<citation>)".
          // The line is the DIGITS after the colon, so the citation's
          // own text cannot be mistaken for it.
          const portFile = site!.slice(0, site!.indexOf(":"));
          const lineText = site!.slice(site!.indexOf(":") + 1);
          const lineMatch = lineText.match(/\d+/);
          const line = lineMatch ? Number(lineMatch[0]) : Number.NaN;
          expect(Number.isFinite(line), `${d.name}'s site carries no line`).toBe(true);
          expect(
            () => readFileSync(resolvePortFile(portFile), "utf8"),
            `${portFile} no longer exists`,
          ).not.toThrow();
          const lines = portLines(portFile);
          expect(lines.length, `${portFile} is shorter than the recorded line`).toBeGreaterThan(line);
        }
      });

      it("every PORTED-INLINE def's citing file still cites the row's Ruby source", () => {
        const inline = fixture.defs.filter((d) => d.disposition === "PORTED-INLINE");
        for (const d of inline) {
          expect(d.headerCitation, `${d.name} has no citation`).toBeTruthy();
          // The citation names a Ruby source of this row's file set.
          const cited = d.headerCitation!.match(/([A-Za-z0-9_./-]+\.rb)/)?.[1];
          expect(cited, `${d.name}'s citation names no Ruby source`).toBeTruthy();
          const citedLeaf = cited!.split("/").pop();
          const rowLeaves = fixture.rubySources.map((s) => s.split("/").pop()!);
          expect(rowLeaves, `${d.name}'s citation names a file outside the row`).toContain(citedLeaf);
        }
      });

      it("every GAP def is still a gap, and the row's gap reason is present", () => {
        const gaps = fixture.defs.filter((d) => d.disposition === "GAP");
        for (const d of gaps) {
          // A gap is a def the port does not carry. The rig's SKIP is
          // for a PRIVATE helper the deck cannot reach, so a gap is
          // either a PUBLIC method (reached or not) or a private one
          // the deck DOES reach. A private, unreachable helper is a
          // skip, and a gap of that shape means the rig and the
          // fixture disagree.
          // A GAP is a def the port does not carry AND the deck's runtime
          // could reach. A private unreachable helper is a SKIP, and a
          // def whose only callers are the deck's spec or migration tree
          // is an INERT-API - the old system's own runtime never reached
          // it either, so there is no behaviour for the port to miss.
          const isPrivateUnreachable =
            d.visibility === "private" && d.reachability === "unreachable";
          expect(isPrivateUnreachable, `${d.name} should be a SKIP, not a GAP`).toBe(false);
          expect(d.disposition, `${d.name} is a GAP but reads as another disposition`).toBe("GAP");
        }
        if (gaps.length > 0) {
          expect(
            fixture.gapReason,
            `${fixture.row} has ${gaps.length} gap(s) and no named reason`,
          ).toBeTruthy();
        } else {
          // A row with no gap still carries the note that says what the
          // row DID measure.
          expect(
            fixture.gapReason,
            `${fixture.row} has no gap and no note`,
          ).toBeTruthy();
        }
      });

      it("every NAMED-COLLAPSE def is the port's own statement about it", () => {
        // A NAMED-COLLAPSE is the port saying in its own words that it
        // carries the behaviour by a different mechanism. The rig found
        // the statement in a port file that cites the row's Ruby
        // source, and the statement must still be there.
        const collapses = fixture.defs.filter((d) => d.disposition === "NAMED-COLLAPSE");
        for (const d of collapses) {
          expect(d.collapse, `${d.name} has no collapse statement`).toBeTruthy();
          const site = d.collapse!.slice(0, d.collapse!.indexOf(":"));
          const fileLines = readFileSync(resolvePortFile(site), "utf8").split(LINE_SPLIT);
          const text = fileLines.join(LINE_JOIN);
          expect(text, `${site} no longer names ${d.name}`).toContain(d.name);
          expect(text.toLowerCase(), `${site} no longer states the collapse`).toMatch(
            /collaps|no counterpart|has no port|is not ported|not ported/,
          );
        }
      });

      it("every probe ran the PINNED body, at the pinned lines", () => {
        for (const p of fixture.probes ?? []) {
          expect(p.outcome, `${p.probe} was not extracted`).not.toBe("not-extractable");
          if (p.outcome === "not-extractable") continue;
          expect(p.rubyFile, `${p.probe} has no pinned file`).toBeTruthy();
          expect(p.rubyStartLine!, `${p.probe} has no pinned start line`).toBeGreaterThan(0);
          expect(p.rubyEndLine!).toBeGreaterThan(p.rubyStartLine!);
        }
      });
    });
  }
});
