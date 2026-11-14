// The content/all.rb row's two query surfaces, pinned against the pinned
// Ruby's own answers.
//
// The oracle runs: the pinned blank_content? body (content/all.rb:46-48) was
// extracted by line and executed under Ruby 3.4.11 with the gemset's
// activesupport-7.2.4 String#blank?, over the probe contents below, and the
// answers the port asserts here are those answers (the workbatch-c lane's
// oracle probe, tmp/oracle-blank-content-probe.rb at the row's commit):
//
//   empty ""            -> true
//   one space " "       -> true
//   tab newline "\t\n"  -> true
//   NUL "\0"            -> true   (blank? half false, strip half true)
//   "hello"             -> false
//   " hello "           -> false
//   "\0x"               -> false
//
// refresh_content (content/all.rb:30-32) is `self.content =
// Card.find(id)&.db_content`: the find is injected here, and the pin is the
// assignment shape - the found row's db_content replaces the card's, a
// missing row blanks it, and a card without an id never finds.

import { describe, expect, it } from "vitest";
import {
  isBlankContent,
  refreshContent,
  type CardRecord,
} from "../../../src/card/fetch/card-record.js";

const record = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: 7,
  codename: undefined,
  leftId: undefined,
  rightId: undefined,
  typeId: 1,
  dbContent: "stored",
  trash: false,
  creatorId: undefined,
  updaterId: undefined,
  createdAt: undefined,
  updatedAt: undefined,
  currentRevisionId: undefined,
  readRuleClass: undefined,
  readRuleId: undefined,
  referencesExpired: undefined,
  name: undefined,
  key: undefined,
  isNew: false,
  fromTrash: false,
  uncacheable: false,
  ...overrides,
});

describe("content/all.rb#blank_content? (all.rb:46-48) against the pinned Ruby's answers", () => {
  it("answers true for the contents Ruby answers true to", () => {
    for (const content of ["", " ", "\t\n", "\0"]) {
      expect(isBlankContent(record({ dbContent: content })), JSON.stringify(content)).toBe(true);
    }
  });

  it("answers false for the contents Ruby answers false to", () => {
    for (const content of ["hello", " hello ", "\0x"]) {
      expect(isBlankContent(record({ dbContent: content })), JSON.stringify(content)).toBe(false);
    }
  });

  it("keeps the two Ruby halves apart on NUL-only content", () => {
    // "\0".blank? is false (NUL is not [[:space:]]) and "\0".strip.blank? is
    // true, so the OR is load-bearing; a single-regex port would miss it.
    expect(isBlankContent(record({ dbContent: "\0" }))).toBe(true);
    expect(isBlankContent(record({ dbContent: "\u0085" }))).toBe(true);
    expect(isBlankContent(record({ dbContent: "\uFEFFx" }))).toBe(false);
  });

  it("reads no content of an undefined db_content as blank", () => {
    expect(isBlankContent(record({ dbContent: undefined }))).toBe(true);
  });
});

describe("content/all.rb#refresh_content (all.rb:30-32)", () => {
  it("stores the found row's db_content through content=", async () => {
    const card = record({ dbContent: "stale" });
    await refreshContent(card, async (id) => {
      expect(id).toBe(7);
      return record({ id: 7, dbContent: "fresh from the row" });
    });
    expect(card.dbContent).toBe("fresh from the row");
  });

  it("blanks the content when the find answers nil (the Ruby `&.` guard)", async () => {
    const card = record({ dbContent: "stale" });
    await refreshContent(card, async () => undefined);
    expect(card.dbContent).toBeUndefined();
  });

  it("never finds for a card without an id", async () => {
    const card = record({ id: undefined, dbContent: "kept" });
    await refreshContent(card, async () => {
      throw new Error("Card.find ran without an id");
    });
    expect(card.dbContent).toBeUndefined();
  });
});
