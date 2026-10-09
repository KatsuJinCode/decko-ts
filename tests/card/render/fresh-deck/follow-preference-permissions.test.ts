// A signed-in user may create, update and delete their OWN follow
// preference (`<set>+<user>+*follow`), as stock Ruby Decko 0.20.0 allows:
// card-mod-follow set/right/follow.rb overrides `permit` with
// allowed_to_change_follow_status?. Ruby's recorded answers from the
// reference harness are the expectation; another user's preference falls
// through to the ordinary rules.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openHarnessSession, type HarnessSession } from "./harness-session.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const recorded = new Map<string, unknown>(
  readFileSync(path.resolve(here, "../../../../reference-harness/fixtures/synthetic-v1/expected/semantics.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const row = JSON.parse(l) as { id: string; result: unknown };
      return [row.id, row.result];
    }),
);

describe("follow preference permissions", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each(["anonymous", "member", "admin"])("%s on *all+Mira Member+*follow matches Ruby", async (actor) => {
    const answer = await session.ask({ q: "permissions", actor, card: "*all+Mira Member+*follow" });
    expect(answer.ok).toBe(true);
    expect(answer.result).toEqual(recorded.get(`perm:${actor}:*all+Mira Member+*follow`));
  }, 60_000);

  it("the write path lets the member update their own preference and refuses Anonymous", async () => {
    const anonymous = await session.write({ action: "update", actor: "anonymous", card: "*all+Mira Member+*follow", fields: { content: "[[*never]]" } });
    expect(anonymous.saved).toBe(false);
    const member = await session.write({ action: "update", actor: "member", card: "*all+Mira Member+*follow", fields: { content: "[[*never]]" } });
    expect(member.errors).toEqual([]);
    expect(member.saved).toBe(true);
  }, 60_000);

  it("the member may not change another user's follow preference", async () => {
    const answer = await session.ask({ q: "permissions", actor: "member", card: "*all+Ada Admin+*follow" });
    expect(answer.ok).toBe(true);
    const result = answer.result as { create: boolean; update: boolean; delete: boolean };
    expect([result.create, result.update, result.delete]).toEqual([false, false, false]);
  }, 60_000);
});
