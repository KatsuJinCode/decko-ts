// The three differences found between the hosted copies and the Ruby copy on 2026-11-11, each pinned here so a
// rebuild cannot bring them back: a saved page's status, name_context on an unknown card's slot, and the denial box.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { savedStatus } from "../deploy/bunny-worker-src/saved-status";
import { slotOptionsWithNameContext } from "../src/card/render/slot-html";

describe("saved page status", () => {
  it("answers the status recorded beside the content type, without the parameter", () => {
    expect(savedStatus("text/html; charset=utf-8; decko-status=403")).toEqual({ status: 403, contentType: "text/html; charset=utf-8" });
    expect(savedStatus("text/html; charset=utf-8;decko-status=404")).toEqual({ status: 404, contentType: "text/html; charset=utf-8" });
  });
  it("answers 200 for a saved page without a recorded status", () => {
    expect(savedStatus("text/html; charset=utf-8")).toEqual({ status: 200, contentType: "text/html; charset=utf-8" });
  });
});

describe("slot name_context", () => {
  const voo = { slotOptions: () => ({ view: "bar" }) };
  it("is carried for a known card", () => {
    expect(slotOptionsWithNameContext({ initialContextNames: ["aikido_2"], card: { unknown: false } }, voo)).toContain("name_context");
  });
  it("is omitted for an unknown card", () => {
    expect(slotOptionsWithNameContext({ initialContextNames: ["aikido_2"], card: { unknown: true } }, voo)).not.toContain("name_context");
  });
});

describe("signed-out denial box", () => {
  it("never takes the content classes", () => {
    const source = readFileSync(new URL("../src/card/render/format.ts", import.meta.url), "utf8");
    const denial = source.slice(source.indexOf("mainLoudDenialHtml(voo: Voo"), source.indexOf("mainLoudDenialHtml(voo: Voo") + 1500);
    expect(denial).toContain('<div class="d0-card-body card-body card-text"><h1>Sorry!</h1>');
    expect(denial).not.toContain("d0-card-content");
  });
});
