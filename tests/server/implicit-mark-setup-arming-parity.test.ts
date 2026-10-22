// The setup card's arming (row B10): the PINNED deck's own implicit_mark,
// EXECUTED, beside the port's own setup surface.
//
// The register's B10 row grades the port DIVERGENT on `initial_setup?` ->
// `prepare_setup_card!` (mark.rb:56-63): "setup card served automatically
// while Auth.needs_setup?". The row's blocker records the split: a
// CLOSABLE half (the read path's arming) and a CONTRACT half.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   THE PINNED SETUP SURFACE IS THE IMPLICIT MARK, NOT A PATH. The
//   pinned deck's own implicit_mark, EXECUTED over the four cells that
//   decide it, answers the EMPTY mark and puts the setup card and the
//   setup view in the params when the census is open and the request is
//   an HTML one. There is no /setup path in the pinned deck at all: the
//   PINNED router answers /setup with the mark arm, a card read of a card
//   named "setup", which no deck carries. The setup surface the pinned
//   deck has is the ROOT, because that is where the mark is implicit.
//
//   THE GATE IS THE CENSUS AND THE REQUEST KIND, NOT AN ENV FLAG. The
//   pinned method asks Card::Auth.needs_setup? and Card::Env.html?, and
//   nothing else: with the census open and a non-HTML request the mark is
//   the HOME mark, and with the census closed it is the HOME mark too.
//
//   THE PORT'S SURFACE IS A DEDICATED PATH BEHIND AN OPERATOR GATE, and
//   the port's own source says so ("Ruby has no env gate: needs_setup? is
//   purely the census", src/card/auth/first-run-setup.ts:149-152). The
//   port's census is the same predicate; the port adds the env gate on
//   top, and the port's own verdict seam documents the choice.
//
// The oracle fixture is what
// tests/server/oracle-capture-register-routes-remaining-eight-ruby.rb
// recorded.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface RouterAnswer {
  path: string;
  verb: string;
  matched: boolean;
  answer: { path: string; defaults: Record<string, string> } | null;
}

interface Cell {
  needsSetup: boolean;
  html: boolean;
  answerMark: string;
  paramsAfter: Record<string, unknown>;
}

interface Oracle {
  routerAnswers: Record<string, RouterAnswer[]>;
  pinnedMethods: {
    B10: {
      sourceFile: string;
      method: string;
      cells: Array<{ name: string; cell: Cell }>;
    };
  };
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

const cells = new Map(ORACLE.pinnedMethods.B10.cells.map((row) => [row.name, row.cell]));

function expectQuotedLines(
  file: string,
  quotes: Array<{ line: number; text: string }>,
): void {
  const source = readFileSync(path.join(REPO, file), "utf8").split("\n");
  for (const quote of quotes) {
    expect(source[quote.line - 1], `${file}:${quote.line}`).toBe(quote.text);
  }
}

describe("the PINNED deck's own implicit_mark, EXECUTED (B10)", () => {
  it("the capture ran the pinned deck's own method", () => {
    expect(ORACLE.pinnedMethods.B10.sourceFile).toBe("decko-0.20.0/lib/card_controller/mark.rb");
    expect(ORACLE.pinnedMethods.B10.method).toBe("CardController::Mark#implicit_mark");
  });

  it("the census open and an HTML request: the EMPTY mark, the setup card, the setup view", () => {
    const cell = cells.get("the census is open and the request is an HTML one");
    expect(cell?.answerMark).toBe("");
    const params = cell?.paramsAfter as { card?: { type_id?: number }; view?: string };
    expect(params.view).toBe("setup");
    expect(params.card?.type_id).toBe(99);
  });

  it("the census closed: the HOME mark, and no setup params at all", () => {
    const cell = cells.get("the census is closed");
    expect(cell?.answerMark).toBe("Home");
    expect(cell?.paramsAfter).toEqual({});
  });

  it("the census open but a non-HTML request: the HOME mark, because the gate asks html?", () => {
    const cell = cells.get("the census is open but the request is not an HTML one");
    expect(cell?.answerMark).toBe("Home");
    expect(cell?.paramsAfter).toEqual({});
  });

  it("a request that names a view still gets the setup card while the census is open", () => {
    const cell = cells.get("the census is open and the request names a view");
    expect(cell?.answerMark).toBe("");
    expect((cell?.paramsAfter as { view?: string }).view).toBe("setup");
  });
});

describe("the pinned deck has no /setup PATH (B10)", () => {
  it("the PINNED router answers /setup with the mark arm, a card read", () => {
    const answer = ORACLE.routerAnswers["B10"].find((row) => row.path === "/setup");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults["action"]).toBe("read");
  });

  it("the PINNED router answers the ROOT with the root arm", () => {
    const answer = ORACLE.routerAnswers["B10"].find((row) => row.path === "/");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/");
  });
});

describe("the port's own setup surface (B10)", () => {
  it("the port's own source names the difference: Ruby has no env gate", () => {
    for (const entry of ORACLE.portSurface["B10"]) {
      expectQuotedLines(entry.file, entry.lines);
    }
    const text = ORACLE.portSurface["B10"]
      .flatMap((entry) => entry.lines.map((line) => line.text))
      .join("\n");
    expect(text).toContain("Ruby");
    expect(text).toContain("needs_setup?");
  });

  it("the port's census is the pinned predicate, and the env gate is the port's own", () => {
    const census = readFileSync(path.join(REPO, "src/card/auth/first-run-setup.ts"), "utf8");
    expect(census).toContain("export function firstRunEnabled");
    expect(census).toContain('process.env.DECKO_FIRST_RUN === "1"');
  });

  it("the port's route gate returns null for every request while the env gate is off", async () => {
    const { handleFirstRunRequest, SETUP_PATH } = await import(
      "../../src/server/first-run-routes.js"
    );
    const previous = process.env.DECKO_FIRST_RUN;
    delete process.env.DECKO_FIRST_RUN;
    try {
      expect(SETUP_PATH).toBe("/setup");
      const answer = await handleFirstRunRequest(
        { driver: {} as never, fetcher: {} as never },
        {
          method: "GET",
          pathname: "/setup",
          host: "deck.test",
          headers: {},
          body: "",
        },
      );
      // null means "not my request": the host falls through to its own
      // surface, exactly as the port's own header says.
      expect(answer).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.DECKO_FIRST_RUN;
      } else {
        process.env.DECKO_FIRST_RUN = previous;
      }
    }
  });
});

afterEach(() => {
  delete process.env.DECKO_FIRST_RUN;
});
