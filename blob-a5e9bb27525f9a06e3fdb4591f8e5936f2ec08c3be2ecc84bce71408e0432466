// The Secure attribute on the session cookie (docs/SECURITY.md, approved
// divergence 4): set when the client reached the host over TLS, with an
// explicit DECKO_COOKIE_SECURE override for proxies and local http.

import { afterEach, describe, expect, it } from "vitest";
import {
  clearedSessionCookieHeader,
  sessionCookieHeader,
  sessionCookieSecure,
} from "../../src/server/write-routes.js";

afterEach(() => {
  delete process.env.DECKO_COOKIE_SECURE;
});

describe("session cookie Secure attribute", () => {
  it("is set under auto for an https request and for X-Forwarded-Proto: https", () => {
    expect(sessionCookieSecure({ scheme: "https", headers: {} }, "auto")).toBe(true);
    expect(sessionCookieSecure({ headers: { "x-forwarded-proto": "https" } }, "auto")).toBe(true);
    expect(sessionCookieSecure({ headers: { "x-forwarded-proto": "HTTPS, http" } }, "auto")).toBe(true);
  });

  it("is not set under auto for plain http", () => {
    expect(sessionCookieSecure({ headers: {} }, "auto")).toBe(false);
    expect(sessionCookieSecure({ scheme: "http", headers: { "x-forwarded-proto": "http" } }, "auto")).toBe(false);
  });

  it("follows always and never regardless of the request", () => {
    expect(sessionCookieSecure({ headers: {} }, "always")).toBe(true);
    expect(sessionCookieSecure({ scheme: "https", headers: {} }, "never")).toBe(false);
  });

  it("reads DECKO_COOKIE_SECURE and refuses an unknown value", () => {
    process.env.DECKO_COOKIE_SECURE = "always";
    expect(sessionCookieSecure({ headers: {} })).toBe(true);
    process.env.DECKO_COOKIE_SECURE = "never";
    expect(sessionCookieSecure({ scheme: "https", headers: {} })).toBe(false);
    process.env.DECKO_COOKIE_SECURE = "sometimes";
    expect(() => sessionCookieSecure({ headers: {} })).toThrow(/DECKO_COOKIE_SECURE/);
  });

  it("carries Secure on both the sign-in cookie and the clearing cookie when asked", () => {
    expect(sessionCookieHeader("tok", true)).toMatch(/; Secure$/);
    expect(clearedSessionCookieHeader(true)).toMatch(/Max-Age=0; Secure$/);
    expect(sessionCookieHeader("tok")).not.toMatch(/Secure/);
    expect(clearedSessionCookieHeader()).not.toMatch(/Secure/);
  });
});
