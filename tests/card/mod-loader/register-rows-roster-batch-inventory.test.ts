// This lane's own end-state check.
//
// THE EIGHT ROWS. The completeness register's mods family carried eight
// working rows when this lane took them, and this lane adjudicated each
// one: a fixture that freezes the oracle reading, a block in the pin
// sheet that reads the PORT side live, a named instrument that pins the
// row's mechanism, and a receipt that names the verdict.
//
// This file checks that the set is whole: every row's four artefacts are
// on disk, every fixture's verdict is the one the receipt states, and the
// pin sheet carries a block for each row. A row that loses an artefact
// fails here rather than silently disappearing from the tree.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE_DIR = join(REPO, "tests", "card", "mod-loader", "fixtures", "roster-batch-20261025");
const RECEIPT_DIR = join(REPO, "docs", "runs", "register-rows-roster-batch-2026-10-25");
const PIN_SHEET = join(REPO, "tests", "card", "mod-loader", "register-rows-oracle-surface-roster-batch.test.ts");

type RowSpec = {
  row: number;
  mod: string;
  verdict: "DONE" | "WORKING";
  instrument: string;
};

const ROWS: RowSpec[] = [
  // Rows 1 and 12 closed on port/regfix-1-20261025: the fixtures carry the
  // DONE verdict, the receipts name it, and row 1's behavioral instrument
  // is the close's own (the old gap pin stays beside it as the inverse
  // assertion).
  { row: 1, mod: "card-mod-account", verdict: "DONE", instrument: "tests/card/mod-loader/register-row-1-card-mod-account-event-bodies.test.ts" },
  { row: 12, mod: "card-mod-defaults", verdict: "DONE", instrument: "tests/card/auth/register-row-12-boot-seed-fresh-deck-card-count.test.ts" },
  // Row 17 closed on port/regfix-2-20261025.
  { row: 17, mod: "card-mod-format", verdict: "DONE", instrument: "tests/card/mod-loader/register-row-17-card-mod-format-html-slot-modules.test.ts" },
  // Row 22 closed on port/regfix-row22-20261025: the boot cascade
  // (boot-mod-cards.ts, layer D), the card.fetch item read, and the
  // membership arm wired into the serving walk, proven by the recorded
  // run's own battery.
  { row: 22, mod: "card-mod-list", verdict: "DONE", instrument: "tests/card/mod-loader/register-row-22-card-mod-list-validate-events.test.ts" },
  // Rows 23 and 28 closed on port/regfix-3-20261025; rows 29 and 33 closed
  // on port/regfix-4-20261025.
  { row: 23, mod: "card-mod-markdown", verdict: "DONE", instrument: "tests/card/mod-loader/register-row-23-card-mod-markdown-grammar-census.test.ts" },
  { row: 28, mod: "card-mod-search", verdict: "DONE", instrument: "tests/card/mod-loader/register-row-28-card-mod-search-request-term-seat.test.ts" },
  { row: 29, mod: "card-mod-session", verdict: "DONE", instrument: "tests/server/write-routes-session-card-delete.test.ts" },
  { row: 33, mod: "card-mod-virtual", verdict: "DONE", instrument: "tests/card/mod-loader/register-row-33-card-mod-virtual-abort-marker.test.ts" },
];

describe("this lane's eight rows are whole on disk", () => {
  it("covers the eight rows the register's mods family carried open", () => {
    expect(ROWS.length).toBe(8);
    expect(ROWS.map((spec) => spec.row)).toEqual([1, 12, 17, 22, 23, 28, 29, 33]);
  });

  it.each(ROWS)("row $row carries its fixture, its pin block, its instrument and its receipt", (spec) => {
    const fixturePath = join(
      FIXTURE_DIR,
      `register-row-${spec.row}-${spec.mod}-oracle-surface.json`,
    );
    expect(existsSync(fixturePath), `${fixturePath} is on disk`).toBe(true);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      registerRow: string;
      registerRowNumber: number;
      mod: string;
      verdict: string;
      gap: string;
    };
    expect(fixture.registerRow).toBe(`reg-mods-${spec.row}`);
    expect(fixture.registerRowNumber).toBe(spec.row);
    expect(fixture.mod).toBe(spec.mod);
    expect(fixture.verdict).toBe(spec.verdict);
    // A closed row carries no gap; an open one carries the measured one.
    if (spec.verdict === "DONE") expect(fixture.gap).toBe("");
    else expect(fixture.gap.length).toBeGreaterThan(40);

    const receiptPath = join(RECEIPT_DIR, `reg-mods-${spec.row}`, "RECEIPT.md");
    expect(existsSync(receiptPath), `${receiptPath} is on disk`).toBe(true);
    const receipt = readFileSync(receiptPath, "utf8");
    expect(receipt).toContain(`reg-mods-${spec.row}`);
    expect(receipt).toContain(spec.verdict === "DONE" ? "Verdict: DONE" : "Verdict: WORKING ON IT");

    expect(existsSync(join(REPO, spec.instrument)), `${spec.instrument} is on disk`).toBe(true);

    const sheet = readFileSync(PIN_SHEET, "utf8");
    expect(sheet).toContain(`register row ${spec.row}, ${spec.mod}`);
  });
});
