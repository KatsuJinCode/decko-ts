// The markless `PUT /` chain, measured against the PINNED DECK's own
// route, mark resolution and update dispatch.
//
// The completeness register's C7 row grades the port on the markless
// `PUT /` ("resolves the implicit mark, L29 + mark.rb"). The row's note
// named the route and the resolution but not the CHAIN: which route
// matches, what mark a markless body-less update carries, and what the
// update of a missing home answers (Ruby's new-card branch makes it a
// CREATE).
//
// fixtures/captured/markless-update-ruby-oracle.json is what
// oracle-capture-markless-update-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table, uri_fetch mark rule and
// update dispatch:
//
//   the routes  engine_routes.rb:29-31 - put|patch "/" to card#update,
//               delete "/" to card#delete - no mark segment;
//   the mark    card_class.rb:104-133 uri_fetch/standard_uri_fetch/
//               uri_fetch_opts - `mark = params[:mark] || card_opts[:name]`:
//               a body card name IS the mark; a body-less markless
//               request fetches nil and load_card raises NotFound;
//   the update  rest.rb:14-16 - `card.new_card? ? create : handle {...}`:
//               the update of a MISSING card is a CREATE (save!, and the
//               success lattice answers after it).
//
// The port's live HTTP behavior over this chain is measured in
// tests/server/write-routes-markless-implicit-mark.test.ts (the shared
// bridge over three decks); this test pins the capture's own answers.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/markless-update-ruby-oracle.json"), "utf8"),
) as {
  marklessRoutes: Array<{ verb: string; patterns: string[]; action: string; order: number }>;
  chain: Record<
    string,
    {
      params: Record<string, unknown>;
      fetchedMarks: Array<string | null>;
      cardCalls: string[];
      rendered: unknown;
      redirected: { url: string | null; status: number } | null;
      error: string | null;
    }
  >;
  sources: {
    routes: Array<{ line: number; text: string }>;
    update: Array<{ line: number; text: string }>;
    uriFetch: Array<{ line: number; text: string }>;
  };
};

describe("the markless update chain, against the pinned deck gem", () => {
  it("the markless routes are put|patch|delete on / (and post create)", () => {
    expect(ORACLE.marklessRoutes).toEqual([
      { verb: "post", patterns: ["/"], requirements: {}, action: "card#create", order: 11 },
      { verb: "put", patterns: ["/"], requirements: {}, action: "card#update", order: 12 },
      { verb: "patch", patterns: ["/"], requirements: {}, action: "card#update", order: 13 },
      { verb: "delete", patterns: ["/"], requirements: {}, action: "card#delete", order: 14 },
    ]);
  });

  it("a body card name IS the mark (mark_from_card_hash first)", () => {
    const row = ORACLE.chain.bodyName;
    expect(row.error).toBeNull();
    expect(row.fetchedMarks).toEqual(["Target"]);
    // The card exists: the ordinary update branch (rest.rb:15).
    expect(row.cardCalls).toEqual(["new_card?", "update!"]);
    expect(row.redirected).toEqual({ url: "/", status: 303 });
  });

  it("a body-less markless update fetches nil and answers NotFound", () => {
    const row = ORACLE.chain.noBody;
    expect(row.fetchedMarks).toEqual([null]);
    expect(row.error).toContain("NotFound");
    expect(row.redirected).toBeNull();
  });

  it("the update of a MISSING card is a CREATE (rest.rb:14-16's new-card branch)", () => {
    const row = ORACLE.chain.missingCardIsCreate;
    expect(row.error).toBeNull();
    expect(row.fetchedMarks).toEqual(["Target"]);
    // new_card? answers true: the branch calls create, whose handle
    // yields save! - not update!.
    expect(row.cardCalls).toEqual(["new_card?", "save!"]);
    expect(row.redirected).toEqual({ url: "/", status: 303 });
  });

  it("the pinned sources say all of it out loud", () => {
    const put = ORACLE.sources.routes.find((row) => /^\s+put\s+"/.test(row.text));
    expect(put).toBeDefined();
    expect(put!.text).toContain('"card#update"');
    const newCard = ORACLE.sources.update.find((row) => row.text.includes("new_card?"));
    expect(newCard).toBeDefined();
    expect(newCard!.text).toContain("create");
    const mark = ORACLE.sources.uriFetch.find((row) => row.text.includes("params[:mark] || card_opts[:name]"));
    expect(mark).toBeDefined();
  });
});
