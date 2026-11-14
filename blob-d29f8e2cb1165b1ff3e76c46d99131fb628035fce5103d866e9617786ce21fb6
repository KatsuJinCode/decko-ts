import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import follow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
const oracle = JSON.parse(readFileSync(new URL("fixtures/follow-link-remainder.json", import.meta.url), "utf8"));
describe("follow register entry 16: measured remainder", () => {
  it("both Ruby follow_status branches raise on the class call; neither returns link options", () => {
    expect(oracle.failures).toEqual([
      { class: "StartFollowLink", error: "NoMethodError", method: "link_opts", instance_method: true },
      { class: "StopFollowLink", error: "NoMethodError", method: "link_opts", instance_method: true },
    ]);
    const file = follow.setModules!.find(s => s.setPath === "all/follow/follow_link_views")!;
    expect(file.formats?.json).toBeUndefined();
    expect(file.formats?.html?.views).toEqual([expect.objectContaining({view: "follow_button", viewFn: expect.any(Function), config: {cache: "never"}})]);
  });
  it("the pinned gemset declares follow_modal_link but never calls it", () => {
    expect(oracle.modal_mentions).toEqual(["def follow_modal_link"]);
  });
});
