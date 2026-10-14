// The shared transaction conformance suite against the hosted database the
// environment names (tests/hosted/hosted-backend.ts). Run by
// tools/hosted-conformance/run.mjs; with no target set it reports itself
// as not run.

import { describe, it } from "vitest";
import { hostedDeck } from "./hosted-backend.js";
import { runTransactionConformance } from "../server/drivers/transaction-conformance.js";

const hosted = hostedDeck();

if (hosted === undefined) {
  describe("hosted transactions", () => {
    it.skip("[hosted] NOT RUN: DECKO_HOSTED_TARGET is not set (run tools/hosted-conformance/run.mjs)", () => undefined);
  });
} else {
  runTransactionConformance(`transactions: ${hosted.label}`, async () => ({ driver: await hosted.open() }));
}
