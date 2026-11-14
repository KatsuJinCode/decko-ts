// smell-prove-host-override-read-admission-parity.test.ts - the row
// smell-prove-host-override-read-admission.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/prove-host-override-read-admission.mjs)
// launches the real installed headless browser against two exclusively owned
// 127.0.0.2 TLS listeners and proves that a host override to a
// noncanonical-loopback address is admitted for reads, that the write
// backstop refuses page-driven card writes, and that an isolated child
// context inherits both.
//
// This lane ran it twice and it refused both times, each time for a reason it
// measured itself. The capture under fixtures/captured/smell-row-r5b-2026-10-24/
// is the instrument's own receipt, copied verbatim.
//
// WHAT IT ASSERTS:
//
//   - the first run refused at the navigation, with the harness's own
//     ERR_BLOCKED_BY_CLIENT, and no check had passed.
//
//   - the second run, after the admit route's registration order was fixed in
//     tools/edge-signed-in-exercise/lib/harness-browser.mjs, admitted the
//     target document and the same-origin fetch, and refused at the write
//     backstop with three of the six probes admitted.
//
//   - the port's own harness still registers the admit route AFTER both
//     policy routes and BEFORE the write gate, so the fix that moved the row
//     forward cannot silently regress.
//
//   - the three probes that reached the server are the ones the write gate's
//     session-mark carve-out admits, and the receipt carries no credential.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture, portSource } from "./smell-row-r5b-captures.js";

const HARNESS = "tools/edge-signed-in-exercise/lib/harness-browser.mjs";

type Detail = {
  instrumentReceipt: {
    pass: boolean;
    checks: string[];
    seen: { method: string; url: string }[];
    otherSeen: { method: string; url: string }[];
  };
  firstRun: { pass: boolean; checks: string[]; error: string };
  writeBackstop: { expected: boolean[]; actual: boolean[]; probeOrder: string[]; reachedTheServer: string[] };
  portFix: { file: string; what: string; guard: string };
};

const row = capture("smell-prove-host-override-read-admission");
const detail = row.detail as Detail;

describe("smell-prove-host-override-read-admission: the override target is admitted, the write backstop still is not", () => {
  it("the first run refused at the navigation with the harness's own block", () => {
    expect(row.row).toBe("smell-prove-host-override-read-admission");
    expect(row.outcome).toBe("ran");
    expect(row.exit).toBe(1);
    expect(detail.firstRun.pass).toBe(false);
    expect(detail.firstRun.checks).toEqual([]);
    expect(detail.firstRun.error).toMatch(/ERR_BLOCKED_BY_CLIENT/);
  });

  it("after the admit route's order was fixed, the target document and the same-origin fetch are admitted", () => {
    expect(detail.instrumentReceipt.pass).toBe(false);
    expect(detail.instrumentReceipt.checks).toEqual([
      "exact target document admitted",
      "same-origin JSON fetch admitted",
    ]);
    const seen = detail.instrumentReceipt.seen.map((entry) => `${entry.method} ${entry.url}`);
    expect(seen).toContain("GET /");
    expect(seen).toContain("GET /read.json");
    // The other owned listener was never reached.
    expect(detail.instrumentReceipt.otherSeen).toEqual([]);
  });

  it("the write backstop refuses three of the six probes, and the three it admits are the session-mark ones", () => {
    expect(detail.writeBackstop.expected).toEqual([true, true, true, true, true, true]);
    expect(detail.writeBackstop.actual).toEqual([true, true, true, false, false, false]);
    expect(detail.writeBackstop.reachedTheServer).toEqual([
      "GET /delete/OwnedCard",
      "POST /update/account",
      "POST /card/create",
    ]);
  });

  it("the harness still registers the admit route after both policy routes and before the write gate", () => {
    const source = portSource(detail.portFix.file);
    const admitRoute = source.indexOf("await context.route((url) => url.origin === origin, (route) => route.continue());");
    const hostnamePolicy = source.indexOf('route.abort("blockedbyclient")');
    const catchAllPolicy = source.indexOf("await context.route('**/*'");
    const writeGate = source.indexOf("await installWriteGateRoute(context, writeGate)");
    expect(admitRoute).toBeGreaterThan(-1);
    expect(hostnamePolicy).toBeGreaterThan(-1);
    expect(catchAllPolicy).toBeGreaterThan(-1);
    expect(writeGate).toBeGreaterThan(-1);
    // Playwright evaluates route handlers in the reverse order they were
    // registered, so the admit route must be registered after the two policy
    // routes to be evaluated first, and before the write gate, which must
    // stay last so it runs first.
    expect(admitRoute).toBeGreaterThan(catchAllPolicy);
    expect(admitRoute).toBeGreaterThan(hostnamePolicy);
    expect(admitRoute).toBeLessThan(writeGate);
  });

  it("the receipt carries no credential", () => {
    const raw = JSON.stringify(row);
    expect(raw).not.toMatch(/BUNNY_ACCOUNT_API_KEY/);
    expect(raw).not.toMatch(/AccessKey/);
    expect(raw).not.toMatch(/-----BEGIN/);
  });
});
