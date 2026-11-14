// A card that does not exist renders as stock Ruby Decko 0.20.0 renders it
// (RenderEngine#renderAbsentCards): a view goes through view_for_unknown
// (nothing for a viewer who may not create the card, the :unknown create
// link for one who may), and a page's main card renders :not_found (404)
// or the :new create form, by ok?(:create). Ruby's recorded renders from
// the reference harness are the expectation.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("absent cards against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  const cases: Array<[string, string, string]> = [];
  for (const card of ["Nonexistent Card", "Topic 001+nonexistent"]) {
    for (const actor of ["anonymous", "member", "admin"]) {
      cases.push(["page", actor, card]);
      cases.push(["core", actor, card]);
    }
  }

  it.each(cases)("%s for %s: %s", async (kind, actor, card) => {
    const answer = await session.render(card, { actor, view: kind === "page" ? undefined : kind });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`${kind}:${actor}:${card}`));
  }, 60_000);
});
