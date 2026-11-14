// The rule list of a set card shows a bar for every setting; a setting with
// no stored rule gets the card Ruby builds with `new: {}`, typed by
// ensure_type_id. The port's per-setting type table was measured on one
// production deck and carried that deck's type ids, so on a stock deck the
// bars named whatever card held those ids (`*credit+*self` for Phrase), and
// `*structure`, which the table does not cover, took the setting card's own
// type (Setting) where Ruby's template chain (`*structure+*right+*default`)
// gives Nest list. Ruby's recorded `*all` renders are the expectation.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("virtual rule card types against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each([
    ["core", "anonymous", "*all"],
    ["core", "member", "*all"],
    ["page", "admin", "*all"],
  ])("%s for %s: %s", async (kind, actor, card) => {
    const answer = await session.render(card, { actor, view: kind === "page" ? undefined : kind });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`${kind}:${actor}:${card}`));
  }, 60_000);

  it("types *all+*structure by the template chain and *all+*autoname by this deck's Phrase card", async () => {
    const answer = await session.render("*all", { view: "core" });
    expect(answer.html).toContain('data-card-name="*all+*structure" data-card-type-id="58" data-card-type-name="Nest list"');
    expect(answer.html).toContain('data-card-name="*all+*autoname" data-card-type-id="43" data-card-type-name="Phrase"');
  }, 60_000);
});
