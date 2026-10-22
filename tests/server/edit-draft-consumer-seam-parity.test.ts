// The edit-draft consumer (row B11): the PINNED deck's own load_action,
// EXECUTED, beside the port's own emitter and its own draft helper.
//
// The register's B11 row grades the port PARTIAL: "the port EMITS
// ?edit_draft=true (src/card/mod-loader/mods/card-mod-history.ts:1890) and
// never CONSUMES it". The row's fix: "read params[:edit_draft] in
// load_action and render the acting cards last draft".
//
// The pinned ground is the COMMITTED capture
// (tests/server/oracle-capture-load-action-ruby.rb, whose fixture is
// fixtures/captured/load-action-ruby-oracle.json): the PINNED deck's own
// load_action, EXECUTED over the four cells that decide the behaviour.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   THE PINNED GATE IS A TRUTHY PARAM AND A DRAFT. The pinned method
//   loads the last draft only when params[:edit_draft] is truthy AND the
//   card has drafts. The string "false" is a TRUTHY string in Ruby, so
//   the cell that passes edit_draft=false LOADS THE DRAFT: the pinned
//   method asks for truthiness, not for the value.
//
//   THE PORT HAS THE EMITTER AND THE HELPER, AND NO CONSUMER. The port's
//   own history mod renders the "continue editing" anchor with
//   ?edit_draft=true, and the port's own history mod carries the draft
//   acts helper (draftActs), and NO file under src/ reads the parameter
//   back. That is the row's seam, named at the source line that emits it
//   and at the absence that consumes nothing.
//
//   SO THE ROW'S FIX IS NOT LANDED, and this file says so instead of
//   pretending the port matches: the pinned read answers the acting
//   card's LAST DRAFT content when the parameter is present, and the
//   port's read answers the card's own content.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface LoadActionOracle {
  loadAction: Array<{ label: string; outcome: string; selectedAction: number; content: string }>;
  lastDraftContent: Array<{ drafts: number; value: string }>;
}

interface Oracle {
  routerAnswers: Record<string, Array<{ path: string; verb: string; matched: boolean; answer: { defaults: Record<string, string> } | null }>>;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
}

const ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/register-routes-remaining-eight-ruby-oracle.json"),
    "utf8",
  ),
) as Oracle;

const LOAD_ACTION = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/load-action-ruby-oracle.json"), "utf8"),
) as LoadActionOracle;

function expectQuotedLines(
  file: string,
  quotes: Array<{ line: number; text: string }>,
): void {
  const source = readFileSync(path.join(REPO, file), "utf8").split("\n");
  for (const quote of quotes) {
    expect(source[quote.line - 1], `${file}:${quote.line}`).toBe(quote.text);
  }
}

describe("the PINNED deck's own load_action, EXECUTED (B11)", () => {
  it("the capture ran the pinned deck's own method", () => {
    expect(LOAD_ACTION.loadAction.length).toBe(4);
  });

  it("no edit_draft: the card's own SAVED content", () => {
    const cell = LOAD_ACTION.loadAction.find((row) => row.label === "no edit_draft");
    expect(cell?.content).toBe("SAVED CONTENT");
  });

  it("edit_draft=false LOADS THE DRAFT: the pinned method asks for truthiness", () => {
    const cell = LOAD_ACTION.loadAction.find((row) => row.label === "edit_draft false");
    expect(cell?.content).toBe("DRAFT CONTENT");
  });

  it("edit_draft with no drafts keeps the SAVED content", () => {
    const cell = LOAD_ACTION.loadAction.find(
      (row) => row.label === "edit_draft true, no drafts",
    );
    expect(cell?.content).toBe("SAVED CONTENT");
  });

  it("edit_draft with drafts loads the LAST draft's content", () => {
    const cell = LOAD_ACTION.loadAction.find(
      (row) => row.label === "edit_draft true, with drafts",
    );
    expect(cell?.content).toBe("DRAFT CONTENT");
    // The last draft, not the first: two drafts, the second one's content.
    const drafts = LOAD_ACTION.lastDraftContent.find((row) => row.drafts === 2);
    expect(drafts?.value).toBe("SECOND DRAFT");
  });
});

describe("the port's own edit-draft seam (B11)", () => {
  it("the port's history mod renders the ?edit_draft=true anchor", () => {
    for (const entry of ORACLE.portSurface["B11"]) {
      expectQuotedLines(entry.file, entry.lines);
    }
    const text = ORACLE.portSurface["B11"]
      .flatMap((entry) => entry.lines.map((line) => line.text))
      .join("\n");
    expect(text).toContain("edit_draft=true");
  });

  it("the port's own history mod carries the draft acts helper", () => {
    const source = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-history.ts"),
      "utf8",
    );
    expect(source).toContain("export async function draftActs");
  });

  it("NO file under src/ reads the parameter back: the consumer is missing", () => {
    // The row's seam, named by the absence: the emitter is the only
    // mention of the parameter in the port's own sources.
    const history = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-history.ts"),
      "utf8",
    );
    const mentions = history.split("edit_draft").length - 1;
    expect(mentions).toBe(2);
    const engine = readFileSync(path.join(REPO, "src/card/actions/card-action-engine.ts"), "utf8");
    expect(engine).not.toContain("edit_draft");
    const render = readFileSync(path.join(REPO, "src/card/render.ts"), "utf8");
    expect(render).not.toContain("edit_draft");
  });
});

describe("the pinned deck's own answer at the read path (B11)", () => {
  it("the read reaches the card read arm in the pinned deck", () => {
    const answer = ORACLE.routerAnswers["B11"].find((row) => row.path === "/Alpha");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.defaults["action"]).toBe("read");
  });
});
