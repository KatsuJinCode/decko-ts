import { describe, expect, it } from "vitest";
import { rssFeed, rubyTimestamp } from "../../../src/card/render/format-families.js";

// card-mod-format rss.rb calls TimeWithZone#to_s(:rfc822). Rails 7.2's
// implementation accepts zero arguments; its ordinary conversion still works.
const updatedAt = new Date("2026-10-15T12:34:56Z");
const card: Parameters<typeof rssFeed>[0] = {
  id: 42, name: "Feed Card", typeName: "Basic", typeCode: "basic",
  codename: undefined, dbContent: "body", createdAt: undefined, updatedAt,
  unknown: false,
};

describe("RSS uses the TimeWithZone string-conversion API", () => {
  it("converts timestamps normally with no formatting argument", () => {
    expect(rubyTimestamp(updatedAt)).toBe("2026-10-15 12:34:56 UTC");
  });

  it("rejects the actual supplied argument count with an ArgumentError", () => {
    // A runtime caller can supply any arity, as Ruby's method dispatch can.
    const toString = rubyTimestamp as (date: Date, ...args: unknown[]) => string;
    for (const args of [["rfc822"], ["rfc822", "other"]]) {
      let raised: unknown;
      try { toString(updatedAt, ...args); } catch (error) { raised = error; }
      expect(raised).toBeInstanceOf(Error);
      expect((raised as Error).name).toBe("ArgumentError");
      expect((raised as Error).message).toBe(`wrong number of arguments (given ${args.length}, expected 0)`);
    }
  });

  it("uses the stored timestamp, and reports the real conversion stack", async () => {
    let clockReads = 0;
    const out = await rssFeed(card, [card], "Site", async () => "body", {
      now: () => { clockReads++; return updatedAt; },
    });
    expect(clockReads).toBe(0);
    expect(out).toContain("ERROR rendering RSS: #&lt;ArgumentError: wrong number of arguments (given 1, expected 0)&gt;");
    expect(out).toMatch(/at rubyTimestamp\b/);
    expect(out).not.toContain("TypeScript port; the Ruby capture");
  });

  it("reads the clock only when the item has no stored timestamp", async () => {
    let clockReads = 0;
    await rssFeed(card, [{ ...card, updatedAt: undefined }], "Site", async () => "body", {
      now: () => { clockReads++; return updatedAt; },
    });
    expect(clockReads).toBe(1);
  });

  it("never invokes date conversion for an empty feed", async () => {
    const out = await rssFeed(card, [], "Site", async () => { throw new Error("unused"); }, {
      now: () => { throw new Error("unused clock"); },
    });
    expect(out).toContain("</channel></rss>");
    expect(out).not.toContain("<item>");
    expect(out).not.toContain("<error>");
  });

  it("rescues the error that actually arose while rendering a description", async () => {
    const renderDescription = async () => { throw new Error("description failed"); };
    const out = await rssFeed(card, [card], "Site", renderDescription, {});
    expect(out).toContain("<item><title>Feed Card</title></item></channel></rss>");
    expect(out).toContain("ERROR rendering RSS: #&lt;Error: description failed&gt;");
    expect(out).toContain("renderDescription");
    expect(out).not.toContain("ArgumentError");
  });
});
