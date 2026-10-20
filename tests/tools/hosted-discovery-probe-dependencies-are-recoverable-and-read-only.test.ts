import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideWrite, resolveLiveWalkProfile } from "../../reference-harness/browser/lib/live-walk-profile.mjs";

// Rows: smell-discover-hosted-account-entry and smell-discover-hosted-navigation.
//
// Both probes drive a browser at the live hosted edge under an anonymous,
// read-only profile, and both import their browser launcher and write-gate
// resolver by absolute file:// URL from a checkout that has since been deleted.
// Neither can run. What they depended on, and what they depended on it FOR, are
// both checkable here without a browser and without touching the live edge.
//
// The dependency: the two modules those probes import are tracked in this
// repository, so what is missing is a checkout, not code. This is worth
// asserting because the roster's remedy - restore the pinned checkout - is not
// sufficient for one of them. live-walk-profile.mjs was added by 8a9f802d and
// is absent from b00a4503 entirely, so no version of b00a4503 could ever have
// satisfied those imports.
//
// The safety: a probe that calls itself read-only means it only because
// decideWrite refuses every write-path action. If that gate loosened, a
// "discovery" run against production would start writing, and nothing in the
// probe would notice.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The harnessSource both discovery receipts record for their run.
const RECEIPT_HARNESS_SOURCE = "50d6f0964de07ab183a3d6a445d1bad3d6cb870d";

const overrideEngine = { name: "hosted-discovery", mode: "host-override" } as const;
const hostedOrigin = "https://culturesmith-edge.bunny.run";

describe("row smell-discover-hosted-account-entry: what the probe depends on is here, and the gate it asks for holds", () => {
  it("carries the browser launcher and the write-gate resolver", () => {
    // Deleting either from tracking would turn a recoverable checkout problem
    // into a lost-code problem, and nothing else in the tree would notice.
    expect(existsSync(path.join(repo, "tools", "edge-signed-in-exercise", "lib", "harness-browser.mjs"))).toBe(true);
    expect(existsSync(path.join(repo, "reference-harness", "browser", "lib", "live-walk-profile.mjs"))).toBe(true);
  });

  it("names the harness source the discovery receipts recorded, as provenance rather than as a pin", () => {
    // Both receipts name this commit as the harness they ran against. It is
    // recorded here so that the difference between it and the absolute path
    // those probes carry is a stated fact rather than something to rediscover:
    // a checkout at b00a4503 would not have contained live-walk-profile.mjs at
    // all, so the path is stale independently of the checkout being gone.
    expect(RECEIPT_HARNESS_SOURCE).toMatch(/^[0-9a-f]{40}$/);
    expect(RECEIPT_HARNESS_SOURCE).not.toBe("b00a4503");
  });
});

describe("a host-override discovery profile fails safe to read-only", () => {
  it("defaults to read-only when the write mode is not stated", () => {
    // The probes do pass --write-mode read-only. This is the case where it is
    // left out, and the default is the one that makes a forgotten flag safe
    // rather than destructive.
    const profile = resolveLiveWalkProfile({ args: { "base-url": hostedOrigin }, env: {}, engine: overrideEngine });
    expect(profile.mode).toBe("read-only");
    expect(profile.override).toBe(true);
    expect(profile.origin).toBe(hostedOrigin);
    expect(profile.modeSource).toMatch(/read-only/);
  });

  it("keeps the mode the probes ask for", () => {
    const profile = resolveLiveWalkProfile({
      args: { "base-url": hostedOrigin, "write-mode": "read-only" },
      env: {},
      engine: overrideEngine,
    });
    expect(profile.mode).toBe("read-only");
    expect(profile.modeSource).toBe("--write-mode");
    // The probes' receipts describe themselves as doing no sign-in. The profile
    // they request does permit session operations in every mode, which is why
    // that claim lives in a scope string rather than in anything enforced.
    expect(profile.sessionOpsAllowed).toBe(true);
  });

  it("refuses to attach to a host-override profile with no target", () => {
    expect(() => resolveLiveWalkProfile({ args: {}, env: {}, engine: overrideEngine })).toThrow(/--base-url/);
  });

  it("refuses a cleartext target off loopback", () => {
    expect(() =>
      resolveLiveWalkProfile({
        args: { "base-url": "http://culturesmith-edge.bunny.run" },
        env: {},
        engine: overrideEngine,
      }),
    ).toThrow(/cleartext/);
  });
});

describe("read-only mode refuses every write-path action", () => {
  const profile = resolveLiveWalkProfile({
    args: { "base-url": hostedOrigin, "write-mode": "read-only" },
    env: {},
    engine: overrideEngine,
  });

  it("refuses creates, edits and deletes alike", () => {
    for (const verb of ["create", "edit", "delete", "move", "follow", "comment"]) {
      expect(
        decideWrite(profile, { verb, cardName: "Aikido Oak Cliff", detail: "a probe" }).allowed,
        `${verb} must be refused in read-only mode`,
      ).toBe(false);
    }
    // An unnamed target is refused everywhere, including full mode.
    expect(decideWrite(profile, { verb: "create", cardName: null, detail: "unnamed" }).allowed).toBe(false);
  });

  it("permits session marks, which is the one thing read-only does not stop", () => {
    // Pinned because a discovery probe's scope string says it performs no
    // sign-in while the profile it requests allows session operations in every
    // mode. The gate is doing what it is written to do; the claim in the scope
    // string is the thing that is stronger than the mechanism.
    // SESSION_MARKS is exactly {"*signin", "signin", "*account", "account"}.
    for (const cardName of ["*signin", "signin", "*account", "account"]) {
      expect(decideWrite(profile, { verb: "sign-in", cardName, detail: null }).allowed, cardName).toBe(true);
    }
    // The spellings are the only thing that admits them: a card merely NAMED
    // "signin" by a route is not a session mark.
    expect(decideWrite(profile, { verb: "create", cardName: "signin card draft", detail: null }).allowed).toBe(false);
  });
});
