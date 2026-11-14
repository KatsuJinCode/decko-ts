import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

describe("the rules selector's query mark", () => {
  it("selects the requested set instead of Home and preserves literal percent characters", () => {
    const query = new URLSearchParams({ mark: "Test_Card+*self", view: "filtered_accordion_rule_list" });
    expect(parsePath("/", query)).toMatchObject({ name: "Test Card+*self" });
    expect(parsePath("/", new URLSearchParams({ mark: "100%+*self" }))).toMatchObject({ name: "100%+*self" });
  });
  it("keeps the home fallback and gives explicit path marks precedence", () => {
    expect(parsePath("/")).toMatchObject({ name: "Home" });
    expect(parsePath("/", new URLSearchParams({ mark: "" }))).toMatchObject({ name: "Home" });
    expect(parsePath("/Actual", new URLSearchParams({ mark: "Other" }))).toMatchObject({ name: "Actual" });
  });
});
