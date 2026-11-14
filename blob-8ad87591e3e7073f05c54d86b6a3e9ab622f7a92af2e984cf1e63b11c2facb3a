// Role pages against the recorded Ruby renders of the synthetic-v1 deck:
//
// - the Administrator page nests *recaptcha settings, whose menu help is
//   card-mod-recaptcha's format-level raw_help_text (set/self/
//   recaptcha_settings.rb:2-8), missing from the port's help registry;
// - the Member page nests `+description` and `+Dashboard`, which do not
//   exist: the :unknown view shows its add link when the viewer may create
//   the card (`*all plus+*create = _left`, so a member who may update the
//   role may), keeps the requested view's before hook (before(:content)'s
//   d0-card-content class; voo_api.rb process_before_view runs on the
//   requested view), and titles the link with render_title, relative to the
//   page's main card.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("role pages against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each([
    ["core", "anonymous", "Administrator"],
    ["page", "member", "Administrator"],
    ["core", "admin", "Administrator"],
    ["core", "member", "Member"],
    ["page", "member", "Member"],
    ["core", "admin", "Member"],
    ["page", "admin", "Member"],
  ])("%s for %s: %s", async (kind, actor, card) => {
    const answer = await session.render(card, { actor, view: kind === "page" ? undefined : kind });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`${kind}:${actor}:${card}`));
  }, 60_000);

  it("a member sees the add link for the role's missing description", async () => {
    const answer = await session.render("Member", { actor: "member", view: "core" });
    expect(answer.html).toContain('href="/Member+description/new_in_modal"');
  }, 60_000);
});
