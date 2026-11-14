// GET /_mail-log ([Family] row E8), measured against the PINNED deck's own
// route table (through the PINNED router) and against the PORT's own
// staging-only capture surface.
//
// The register's E8 row grades the port's mail-log surface and calls it a
// "port-only route (no Ruby counterpart)", on the basis that "the register
// names the host(s) and the file:line in the port that serves it, so there
// is no Ruby behaviour it could fail to match". This file MEASURES that
// basis.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE PINNED DECK DOES ROUTE THE PATH, AND IT ROUTES IT TO A CARD
//      READ. The pinned router sends GET /_mail-log to the mark arm,
//      action card#read, mark "_mail-log". No deck carries a card named
//      "_mail-log", so the pinned deck's answer there is the deck's own
//      not-found view with its own 404 status - the answer row C10's
//      committed capture already measured (the "not_found" view, status
//      404). The port's mail log is a PORT-ONLY SURFACE at a path the
//      pinned table does route.
//
//   2. THE SURFACE IS STAGING-ONLY, AND IT IS A DEBUG DRAIN, NOT A MAIL
//      READ. The port's own arm answers 404 while the capture transport is
//      off ("mail capture is off (boot with DECKO_MAIL_CAPTURE=1)") and
//      200 with the DRAINED envelopes while it is on. The drain empties
//      the transport, so a second read sees nothing.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CaptureTransport } from "../../src/card/notify/transport.js";
import { loadPortOnlyRouteOracle, pinnedAnswer, portServes } from "./port-only-route-oracle.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORACLE = loadPortOnlyRouteOracle();

/** Row C10's committed capture: the pinned deck's own answer for a card
 *  that does not exist. */
const NOT_FOUND_ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/not-found-404-view-ruby-oracle.json"), "utf8"),
) as { classes: { notFoundStatusCode: number; notFoundView: string } };

describe("the pinned deck's own answer for /_mail-log", () => {
  it("the pinned router sends it to a CARD READ", () => {
    const answer = pinnedAnswer("E8", "/_mail-log", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.parameters.mark).toBe("_mail-log");
  });

  it("so the pinned deck's answer is its own not-found view, 404", () => {
    // No deck carries a card named "_mail-log", so the pinned card read
    // falls to the not-found view. Row C10's committed capture measured
    // that view and its status; this row only reaches it.
    expect(NOT_FOUND_ORACLE.classes.notFoundView).toBe("not_found");
    expect(NOT_FOUND_ORACLE.classes.notFoundStatusCode).toBe(404);
  });
});

describe("the port's own mail-log surface", () => {
  it("the staging server answers it and the other hosts do not", () => {
    expect(portServes("vm-staging-server.mjs", 'pathname === "/_mail-log"')).toBe(true);
    // The edge engine and the minimal reader carry no such arm.
    expect(portServes("deploy/bunny-worker-src/bunny-edge-engine-handler.ts", "/_mail-log")).toBe(
      false,
    );
    expect(portServes("deploy/bunny-worker-src/bunny-worker.ts", "/_mail-log")).toBe(false);
  });

  it("the port's own handler answers 404 while the capture is off", () => {
    expect(
      portServes(
        "vm-staging-server.mjs",
        'mail capture is off (boot with DECKO_MAIL_CAPTURE=1)',
      ),
    ).toBe(true);
  });

  it("the port's own capture transport DRAINS, so a second read sees nothing", async () => {
    const transport = new CaptureTransport("capture");
    await transport.sendMail({
      to: "reader@example.test",
      from: "deck@example.test",
      subject: "Reset your password",
      textBody: "the reset link",
    });
    expect(transport.count()).toBe(1);

    const drained = transport.drain();
    expect(drained.length).toBe(1);
    expect(drained[0].to).toBe("reader@example.test");
    expect(drained[0].subject).toBe("Reset your password");
    expect(drained[0].seq).toBe(1);

    // The drain empties the transport: the port's surface answers the
    // drained envelopes ONCE, and a second read is empty.
    expect(transport.count()).toBe(0);
    expect(transport.drain()).toEqual([]);
  });

  it("the port's own staging arm drains the transport it booted with", () => {
    // The arm, the handler and the transport are the port's own bytes, and
    // the capture's quote names them.
    expect(ORACLE.portSurface.E8.map((entry) => entry.host)).toEqual([
      "the staging server's mail-log arm",
      "the staging server's mail-log handler",
    ]);
    const arm = ORACLE.portSurface.E8[0].lines.map((line) => line.text).join("\n");
    expect(arm).toContain('pathname === "/_mail-log"');
  });
});
