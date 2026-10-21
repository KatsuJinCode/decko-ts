// The read path's edit_draft consumption, measured against the PINNED DECK's
// own load_action.
//
// The completeness register's B11 row (register-routes) grades the port
// PARTIAL: "the port EMITS ?edit_draft=true
// (src/card/mod-loader/mods/card-mod-history.ts:1890) and never CONSUMES it
// (grep for edit_draft over src returns only that emitter)". The row's fix:
// "read params[:edit_draft] in load_action and render the acting cards last
// draft".
//
// fixtures/captured/load-action-ruby-oracle.json is what
// oracle-capture-load-action-ruby.rb (tests/server/) recorded by running
// the PINNED DECK's own method (decko-0.20.0/lib/card_controller/rest.rb:56-61)
// over the four cells that decide the behavior, and the card gem's own
// last_draft_content (card-1.110.0/lib/card/content/all.rb:42-44).
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE CONDITION is `params[:edit_draft] && card.drafts.present?`
//      (rest.rb:58). Ruby tests the PARAM'S TRUTHINESS, not its value: a
//      present ?edit_draft=false is the STRING "false", which is TRUTHY in
//      Ruby, so the content IS replaced. A port that parses the value as a
//      boolean would take the opposite branch on that cell.
//
//   2. THE REPLACEMENT is the card's last draft's content, and the card
//      side's own selection is `drafts.last.card_changes.last.value`
//      (content/all.rb:42-44): the LAST draft, and within it the LAST card
//      change.
//
//   3. THE DRAFTS GATE: with the param present but no drafts on the card,
//      the content is untouched.
//
//   4. THE ACTION SELECTION happens either way: the controller selects the
//      action from the params before it looks at the drafts.
//
// The port's own state, pinned below: the emitter exists (the history mod's
// "continue editing" link) and NOTHING consumes the param. That is the open
// divergence, pinned so it cannot be closed by accident: a lane that ports
// the consumption has to change the scan's expectation on purpose, and to
// say why in the commit.
//
// The row's fix also needs a seam the port does not have yet, and the commit
// message names it: the port's render entry takes the HISTORY params
// (src/card/render.ts:1147 render(cardName, view, params: HistoryRenderParams)),
// not the request's query string, so the URL's edit_draft flag never
// reaches the render. Consuming it needs a host-to-render content seam.
//
// DATA: the oracle's own stubs. No deck, no account, no live service.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/load-action-ruby-oracle.json"), "utf8"),
) as {
  loadAction: Array<{ label: string; outcome: string; selectedAction: number; content: string }>;
  lastDraftContent: Array<{ drafts: number; value: string }>;
};

/** Every source file under src/ whose text mentions edit_draft. */
function editDraftMentions(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      editDraftMentions(full, out);
    } else if (/\.(ts|mjs|js)$/.test(entry)) {
      if (readFileSync(full, "utf8").includes("edit_draft")) {
        out.push(path.relative(REPO, full).replace(/\\/g, "/"));
      }
    }
  }
  return out;
}

describe("the read path's edit_draft consumption, against the pinned deck gem", () => {
  it("the deck gem replaces the content only when the param is present AND the card has drafts", () => {
    const byLabel = new Map(ORACLE.loadAction.map((row) => [row.label, row]));
    // No param at all: the saved content stands.
    expect(byLabel.get("no edit_draft")!.content).toBe("SAVED CONTENT");
    // The param present but no drafts: the saved content stands.
    expect(byLabel.get("edit_draft true, no drafts")!.content).toBe("SAVED CONTENT");
    // The param present with drafts: the draft's content replaces it.
    expect(byLabel.get("edit_draft true, with drafts")!.content).toBe("DRAFT CONTENT");
    // And the cell a boolean-parsing port would get wrong: the param's
    // VALUE is the string "false", which is TRUTHY in Ruby, so the content
    // IS replaced.
    expect(byLabel.get("edit_draft false")!.content).toBe("DRAFT CONTENT");
  });

  it("the action is selected before the drafts are consulted", () => {
    for (const row of ORACLE.loadAction) {
      expect(row.selectedAction, row.label).toBe(1);
    }
  });

  it("the card side picks the LAST draft's LAST card change", () => {
    expect(ORACLE.lastDraftContent).toEqual([
      { drafts: 2, value: "SECOND DRAFT" },
      { drafts: 1, value: "NEWER CHANGE" },
    ]);
  });

  it("the port emits the flag and consumes it nowhere, and the pin holds that open", () => {
    const mentions = editDraftMentions(path.join(REPO, "src"));
    // The emitter, and nothing else: the history mod's "continue editing"
    // link (card-mod-history.ts:1890) is the only place under src/ that
    // names the flag.
    expect(mentions).toEqual(["src/card/mod-loader/mods/card-mod-history.ts"]);
    // The emitter's own URL carries the flag, which is what a reader
    // follows to reach the draft.
    const emitter = readFileSync(path.join(REPO, mentions[0]!), "utf8");
    expect(emitter).toContain("?edit_draft=true");
  });
});
