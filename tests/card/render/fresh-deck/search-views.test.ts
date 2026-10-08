// Search card views against the recorded Ruby renders of the synthetic-v1
// deck:
//
// - a cql with `return: "count"` makes search_with_params answer an Integer,
//   and search_result_view (card-mod-search set/abstract/search_views.rb)
//   renders :search_count, the bare digits, where the port rendered the
//   no-results block (`Count Of Notes`, and `Search Page`, which nests it);
// - a Set card's bar hides one_line_content like a Search card's
//   (card-mod-rules set/type/set.rb includes Type::SearchType);
// - the paging total is counted from the statement as Ruby's item search left
//   it: relate_multi_value shifts the leading conjunction out of the cached
//   cql hash, so `{"not": {"type": ["in", ...]}}` counts every card
//   (`Not Topics`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { statementAfterFirstQuery } from "../../../../src/cql/consumed-conjunctions.js";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("the statement a second Ruby query sees", () => {
  it("drops the leading conjunction of multi-valued relational attributes, at any depth", () => {
    const statement = {
      not: { type: ["in", "Topic", "Memo"] },
      and: [{ refer_to: ["any", "A", "B"] }],
      name: ["in", "x", "y"],
      sort: "name",
      limit: 20,
    };
    expect(statementAfterFirstQuery(statement)).toEqual({
      not: { type: ["Topic", "Memo"] },
      and: [{ refer_to: ["A", "B"] }],
      name: ["in", "x", "y"],
      sort: "name",
      limit: 20,
    });
    expect(statement.not.type).toEqual(["in", "Topic", "Memo"]);
  });
});

describe("search views against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each([
    ["core", "anonymous", "Count Of Notes"],
    ["page", "member", "Count Of Notes"],
    ["core", "admin", "Search Page"],
    ["page", "anonymous", "Search Page"],
    ["core", "anonymous", "Not Topics"],
    ["core", "member", "Not Topics"],
    ["page", "admin", "Not Topics"],
  ])("%s for %s: %s", async (kind, actor, card) => {
    const answer = await session.render(card, { actor, view: kind === "page" ? undefined : kind });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`${kind}:${actor}:${card}`));
  }, 60_000);

  it("a count search's core is the count", async () => {
    const answer = await session.render("Count Of Notes", { view: "core" });
    expect(answer.html).toBe("40");
  }, 60_000);
});
