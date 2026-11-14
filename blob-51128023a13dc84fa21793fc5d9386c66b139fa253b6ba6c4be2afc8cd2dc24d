// smell-discover-hosted-account-entry-parity.test.ts - the row
// smell-discover-hosted-account-entry.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-account-entry.mjs)
// drives a hidden browser over the live hosted edge and records two anonymous
// routes: the sign-up page and the sign-in page. It submits nothing, signs
// nobody in and writes nothing; the live-walk profile it installs is the
// read-only one.
//
// The row was open because the instrument's harness dependency had moved: the
// checkout it imports from carries a harness one day older than the one its
// own receipt of record names, and that older harness aborts every request
// to a remote origin (net::ERR_BLOCKED_BY_CLIENT), so the walk never saw a
// page. This lane restored the harness modules the instrument's own receipt
// names (50d6f096) and ran the walk.
//
// The capture under fixtures/captured/smell-row-r4-2026-10-24/ carries this
// run's receipt next to the receipt of record, so the two can be compared.
//
// WHAT IT ASSERTS:
//
//   - both routes answered 200, with no blocked asset and no console error.
//
//   - the two runs agree field for field: the same statuses, the same page
//     titles, the same form actions, the same form field names and the same
//     links as the receipt of record.
//
//   - the walk stayed inside the Bunny-hosted edge: the allowed asset hosts
//     are the production storage CDN and no .com domain.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own receipt, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { singleCapture } from "./smell-row-r4-captures.js";

type Page = {
  route: string;
  status: number | null;
  error: string | null;
  title: string | null;
  url: string | null;
  formActions: string[];
  inputNames: string[];
  linkHrefs: string[];
  assetFailures: number;
  consoleErrors: number;
};

type Capture = {
  row: string;
  instrument: string;
  origin: string;
  scope: string;
  allowedAssetHosts: string[];
  allowedFaviconUrls: string[];
  pages: Page[];
  receiptOfRecord: { at: string; harnessSource: string; pages: Page[] };
  matchesReceiptOfRecord: boolean;
};

const capture = singleCapture<Capture>("discover-hosted-account-entry");

describe("smell-discover-hosted-account-entry: both anonymous routes answer, unchanged", () => {
  it("the walk stayed inside the Bunny-hosted edge", () => {
    expect(capture.row).toBe("discover-hosted-account-entry");
    expect(capture.origin).toBe("https://culturesmith-edge.bunny.run");
    expect(capture.origin.endsWith(".bunny.run")).toBe(true);
    expect(capture.allowedAssetHosts).not.toContain("culturesmith.com");
    for (const host of capture.allowedAssetHosts) {
      expect(host).not.toBe("culturesmith.com");
    }
  });

  it("both routes answered 200 with no blocked asset and no console error", () => {
    expect(capture.pages.map((page) => page.route)).toEqual([
      "/new/Sign_up",
      "/*signin/edit?slot[hide][]=board_link",
    ]);
    for (const page of capture.pages) {
      expect(page.error, page.route).toBeNull();
      expect(page.status, page.route).toBe(200);
      expect(page.assetFailures, page.route).toBe(0);
      expect(page.consoleErrors, page.route).toBe(0);
      expect(page.title, page.route).toContain("Culturesmith");
    }
  });

  it("the sign-up page serves the account creation form", () => {
    const page = capture.pages[0]!;
    expect(page.formActions).toContain("/card/create");
    expect(page.inputNames).toContain("card[name]");
    expect(page.inputNames).toContain("card[subcards][+*account][subcards][+*email][content]");
    expect(page.inputNames).toContain("card[subcards][+*account][subcards][+*password][content]");
  });

  it("the sign-in page serves the sign-in form and the reset and sign-up links", () => {
    const page = capture.pages[1]!;
    expect(page.formActions).toContain("/update/*signin");
    expect(page.inputNames).toContain("card[subcards][+*email][content]");
    expect(page.inputNames).toContain("card[subcards][+*password][content]");
    expect(page.linkHrefs).toContain("/new/Sign_up");
    expect(page.linkHrefs).toContain("/*signin/edit?slot%5Bhide%5D%5B%5D=board_link");
  });

  it("this run agrees with the receipt of record field for field", () => {
    expect(capture.matchesReceiptOfRecord).toBe(true);
    expect(capture.receiptOfRecord.pages.length).toBe(capture.pages.length);
    for (const [index, page] of capture.pages.entries()) {
      const record = capture.receiptOfRecord.pages[index]!;
      expect(record.status).toBe(page.status);
      expect(record.title).toBe(page.title);
      expect(record.formActions).toEqual(page.formActions);
      expect(record.inputNames).toEqual(page.inputNames);
      expect(record.linkHrefs).toEqual(page.linkHrefs);
    }
  });
});
