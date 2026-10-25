// This lane's own end-state check.
//
// THE EIGHT ROWS. The completeness roster carried eight working rows in the
// register-routes and register-dsl families for this lane, and this lane
// adjudicated each one: seven closed (five on verification that is now
// checkable at the canonical tree, two on the dsl lane's landed work), and
// one named (the edge host's asset-input refresh seam). This file checks
// that the set is whole on disk: every row's receipt exists, names its row
// id, and carries the named instrument the receipt states, so a receipt
// that loses its row or an instrument that disappears fails here rather
// than silently.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECEIPT_DIR = join(REPO, "docs", "runs", "workbatch-a-20261025");

type Disposition = "closed" | "named";

type RowSpec = {
  id: string;
  disposition: Disposition;
  /** Files on disk the receipt's verification stands on. */
  instruments: string[];
};

const ROWS: RowSpec[] = [
  // The routes family: the family's own ledger closed these rows at the
  // round-eight tip; the roster held them for the canonical-tree condition,
  // which this lane's base (deploy/full-candidate-20261101) satisfies.
  {
    id: "reg-routes-A17",
    disposition: "closed",
    instruments: [
      "tests/server/get-action-routes-parity.test.ts",
      "tests/deploy/bunny-edge-action-read-route.test.ts",
      "tests/deploy/staging-action-read-asset-endpoint.test.ts",
      "tests/server/deprecated-asset-routes-parity.test.ts",
    ],
  },
  {
    id: "reg-routes-A22",
    disposition: "closed",
    instruments: [
      "tests/server/wildcard-bad-address-parity.test.ts",
      "tests/deploy/bunny-edge-bad-address-wildcard.test.ts",
      "tests/deploy/staging-bad-address-wildcard-endpoint.test.ts",
    ],
  },
  {
    id: "reg-routes-A23",
    disposition: "closed",
    instruments: ["tests/deploy/jasmine-mount-inertness.test.ts"],
  },
  {
    id: "reg-routes-B6",
    disposition: "named",
    instruments: ["tests/server/setup-before-action-parity.test.ts"],
  },
  // The dsl family: A10 closes on the dsl lane's landed integration; A22
  // closes on the safe-surface byte parity with the safety exception named;
  // B21 closes on the declared and pinned parity surface; B22 closed on the
  // reproduced quirk (this lane's own landing).
  {
    id: "reg-dsl-A10",
    disposition: "closed",
    instruments: ["tests/card/render/nest-option-bridge-voo-parity.test.ts"],
  },
  {
    id: "reg-dsl-A22",
    disposition: "closed",
    instruments: [
      "src/card/actions/content-clean.ts",
      "tests/withheld/content-clean-reference.ts",
    ],
  },
  {
    id: "reg-dsl-B21",
    disposition: "closed",
    instruments: [
      "docs/decisions/0010-cql-sql-text-parity-surface.md",
      "tests/cql/sql-text-parity-surface.test.ts",
    ],
  },
  {
    id: "reg-dsl-B22",
    disposition: "closed",
    instruments: ["src/cql/parser.ts", "tests/cql/sql-generation.test.ts"],
  },
];

describe("this lane's eight rows are whole on disk", () => {
  it("covers the eight rows the roster carried open for this lane", () => {
    expect(ROWS.map((spec) => spec.id)).toEqual([
      "reg-routes-A17",
      "reg-routes-A22",
      "reg-routes-A23",
      "reg-routes-B6",
      "reg-dsl-A10",
      "reg-dsl-A22",
      "reg-dsl-B21",
      "reg-dsl-B22",
    ]);
    expect(ROWS.filter((spec) => spec.disposition === "named").map((spec) => spec.id)).toEqual([
      "reg-routes-B6",
    ]);
  });

  it.each(ROWS)("$id carries its receipt, and the receipt names the row and its instruments", (spec) => {
    const receiptPath = join(RECEIPT_DIR, spec.id, "RECEIPT.md");
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = readFileSync(receiptPath, "utf8");
    expect(receipt).toContain(spec.id);
    for (const instrument of spec.instruments) {
      expect(receipt).toContain(instrument);
      expect(existsSync(join(REPO, instrument))).toBe(true);
    }
    if (spec.disposition === "named") {
      // The one named row names the exact mechanism, the price and the flip
      // signal: the row's own test that fails once the seam is wired.
      // Whitespace-normalized, so a receipt's line wrapping cannot hide the
      // marker.
      const flat = receipt.replace(/\s+/g, " ");
      expect(flat).toContain("asset-input refresh seam");
      expect(flat).toContain("setup-before-action-parity.test.ts");
    }
  });

  it("the named edge-seam gap is still real at this tree", () => {
    // The row's own pin, restated so this file fails alongside it when the
    // seam is wired: no file under deploy/ reaches the seam.
    const deployDir = join(REPO, "deploy");
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          // The pin judges the tracked deploy sources, not build output:
          // dist/ is the repo's own build-output rule (.gitignore), and the
          // minified engine bundle legitimately carries engine identifiers
          // this pattern names. A tree that has merely been built must not
          // read as one whose edge seam is wired.
          if (entry === "dist") continue;
          walk(full);
        } else if (/\.(ts|mjs|js)$/.test(entry)) {
          if (/createReadAssetRefresh|asset-read-refresh|beforeRead/.test(readFileSync(full, "utf8"))) {
            hits.push(full);
          }
        }
      }
    };
    walk(deployDir);
    expect(hits).toEqual([]);
  });
});
