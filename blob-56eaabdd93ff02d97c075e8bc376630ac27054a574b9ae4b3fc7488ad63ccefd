// List content standardization (src/card/actions/list-content.ts). The
// expected values are the historically recorded stored content for the same
// input.

import { describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import {
  listItemStrings,
  standardizeListContent,
  swapListItems,
} from "../../../src/card/actions/list-content.js";

const resolver = {
  nameForId: async (id: number) => (id === 1 ? "Decko Bot" : undefined),
  nameForCodename: async (code: string) => (code === "anyone" ? "Anyone" : undefined),
};

describe("list content", () => {
  it("stores items one per line, without brackets, marks resolved", async () => {
    const stored = await standardizeListContent(
      "[[PersistProbe Typed]]\n\n  [[PersistProbe Typed+PersistProbe Field]]  \n~1\n:anyone\nPersistProbe Loose",
      resolver,
    );
    expect(stored).toBe(
      "PersistProbe Typed\nPersistProbe Typed+PersistProbe Field\nDecko Bot\nAnyone\nPersistProbe Loose",
    );
  });

  it("leaves a mark that resolves to nothing as it was", async () => {
    expect(await standardizeListContent("~999\n:nope", resolver)).toBe("~999\n:nope");
  });

  it("reads the stored items back", () => {
    expect(listItemStrings("[[A]]\n\nB \n")).toEqual(["A", "B"]);
    expect(listItemStrings("")).toEqual([]);
  });

  it("swaps item names on a rename, marks untouched", () => {
    const swapped = swapListItems(
      "PersistProbe Typed\nPersistProbe Typed+PersistProbe Field\n~1",
      DeckoName.parse("PersistProbe Typed"),
      DeckoName.parse("PersistProbe Typed2"),
    );
    expect(swapped).toBe("PersistProbe Typed2\nPersistProbe Typed2+PersistProbe Field\n~1");
  });
});
