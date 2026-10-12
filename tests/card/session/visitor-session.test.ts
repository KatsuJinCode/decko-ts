// The visitor session (location history and Session-card content), pinned
// to Ruby Decko's card-1.110.0 lib/card/env/location_history.rb and
// card-mod-session set/type/session.rb.
import { describe, expect, it } from "vitest";
import {
  discardLocationsFor,
  pageViewCookie,
  previousLocation,
  readVisitorSession,
  saveLocation,
  sessionCardContent,
  storeSessionCardContent,
  visitorSessionCookie,
} from "../../../src/card/session/visitor-session.js";

const cookieOf = (setCookie: string): string => setCookie.split(";")[0];

describe("location history", () => {
  it("starts at the deck root", () => {
    expect(previousLocation(readVisitorSession(undefined))).toBe("/");
  });

  it("keeps the first occurrence of a page already in the history (uniq!)", () => {
    const s = readVisitorSession(undefined);
    saveLocation(s, "http://h/A");
    saveLocation(s, "http://h/B");
    saveLocation(s, "http://h/A");
    expect(s.history).toEqual(["/", "http://h/A", "http://h/B"]);
    expect(previousLocation(s)).toBe("http://h/B");
  });

  it("sheds the oldest entry once past five", () => {
    const s = readVisitorSession(undefined);
    for (const p of ["A", "B", "C", "D", "E", "F"]) saveLocation(s, `http://h/${p}`);
    expect(s.history?.[0]).toBe("http://h/A");
    expect(s.history?.length).toBe(6);
    saveLocation(s, "http://h/G");
    expect(s.history?.[0]).toBe("http://h/B");
  });

  it("discards every entry naming a deleted card, by key", () => {
    const s = readVisitorSession(undefined);
    saveLocation(s, "http://h/Parity_Probe_Card");
    saveLocation(s, "http://h/Parity_Image?view=edit");
    discardLocationsFor(s, "parity image");
    expect(previousLocation(s)).toBe("http://h/Parity_Probe_Card");
  });

  it("round-trips through its cookie and ignores entries that are not paths or URLs", () => {
    const s = readVisitorSession(undefined);
    saveLocation(s, "http://h/A");
    saveLocation(s, "javascript:alert(1)");
    const back = readVisitorSession(cookieOf(visitorSessionCookie(s)));
    expect(back.history).toEqual(["/", "http://h/A"]);
  });

  it("records page views of known HTML pages only, never the sign-in card", () => {
    expect(pageViewCookie(undefined, "http://h/A", { known: false, html: true, ajax: false })).toBeUndefined();
    expect(pageViewCookie(undefined, "http://h/A.json", { known: true, html: false, ajax: false })).toBeUndefined();
    expect(pageViewCookie(undefined, "http://h/*signin", { known: true, html: true, ajax: false, codename: "signin" }))
      .toBeUndefined();
    const set = pageViewCookie(undefined, "http://h/A", { known: true, html: true, ajax: false });
    expect(set).toBeDefined();
    expect(previousLocation(readVisitorSession(cookieOf(set!)))).toBe("http://h/A");
  });
});

describe("Session card content", () => {
  it("is kept by card key and cleared on delete", () => {
    const s = readVisitorSession(undefined);
    storeSessionCardContent(s, "Parity Session Probe", "x");
    expect(sessionCardContent(readVisitorSession(cookieOf(visitorSessionCookie(s))), "parity_session_probe")).toBe("x");
    storeSessionCardContent(s, "Parity Session Probe", undefined);
    expect(visitorSessionCookie(s)).toMatch(/Max-Age=0/);
  });
});
