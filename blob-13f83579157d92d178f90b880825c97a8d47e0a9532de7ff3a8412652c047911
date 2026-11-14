// The read dispatch: card#read IS show (rest.rb:10-12, 91-97), measured
// against the PINNED DECK's own controller.
//
// The completeness register's B1 row grades the port on the controller
// METHOD, not on a route line. This file pins both sides:
//
//   fixtures/captured/read-show-dispatch-ruby-oracle.json is what
//   oracle-capture-read-show-dispatch-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned read action END TO END over the loading rig's
//   recording doubles:
//
//     the action  rest.rb:10-12 `def read; show; end` - no body of its own.
//     the ladder  rest.rb:91-97: card.action = :read; load_format status;
//                 render_page @format, view; status =
//                 @format.error_status || status; respond @format, result,
//                 status.
//     the view    render_page's `view ||= view_from_params` (rest.rb:100):
//                 the plain read renders the query's view, nil without one.
//     step 4+5    show(nil, 302) REDIRECTS: the format's error_status wins
//                 as the respond status, and respond (response.rb:10-19)
//                 hard-redirects on 302/303 even for a read. The recorded
//                 redirect carries the render result as the redirect target -
//                 the ladder's order, measured, not paraphrased.
//     respond     the priority ladder: redirect status first, then the
//                 FileFormat-at-200 send_file arm (executed through a double
//                 answered by an instance of a subclass of the PINNED mod's
//                 own Card::Format::FileFormat), then the render arm with the
//                 format's mime type.
//     labelled    the format NAME the pinned body hands the card's format ask
//                 is recorded under formatNameRigDecision and NOT graded:
//                 the name decision is rows A2/D2's evidence. The
//                 unknown-card :not_found replacement is recorded through the
//                 rig's own FormatDouble stand-in (its transcription of
//                 card-1.110.0/lib/card/format/error.rb:18-25), also labelled,
//                 not a pinned execution.
//
//   The port's read dispatch (deploy/bunny-worker-src/
//   bunny-edge-lineage-worker-surface.ts) answers the same shape at the
//   surface this row grades: the bare single-segment arm IS show(nil) - the
//   parser's own comment names the equivalence (lines 170-172: "Ruby's
//   card#read -> show(nil) - the page path re-derives bareness for the
//   requestedView (the 'open' here is parsePath's pinned default, not a
//   requested view)"), and the query's ?view=/?v= is applied one station
//   down, by the request core's queryViewFromUrl
//   (bunny-edge-engine-request.ts:880-885, "the shared view_from_params
//   shape"). The /read/<mark> and /card/read/<mark> spellings are the same
//   show(nil) with an explicit mark (lines 104-129). The deeper ladder lives
//   below the parser: the engine's render and error-mapping suites are their
//   own pins, and the respond ladder's redirect arm is the CUD suites' (the
//   read never reaches it on the port's edge surface except through the
//   error mapping).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/read-show-dispatch-ruby-oracle.json"), "utf8"),
) as {
  readRoutes: Array<{ verb: string; patterns: string[]; action: string; order: number }>;
  beforeActionsForRead: string[];
  registeredFormats: string[];
  readDispatch: Array<{
    label: string;
    params: Record<string, unknown>;
    error: string | null;
    cardCalls: string[];
    formatNameRigDecision: string | null;
    pageCalls: Array<{ view: string; format: string }>;
    rendered: { body: string; status: number; content_type: string } | null;
    redirected: { url: string; status: number } | null;
    sentFile: unknown[] | null;
  }>;
  showStatusOverride: Array<{
    statusArg: number;
    error: string | null;
    cardCalls: string[];
    rendered: unknown;
    redirected: { url: string; status: number } | null;
    sentFile: unknown[] | null;
  }>;
  viewForUnknownStandin: Array<{
    label: string;
    known: boolean;
    answer: string;
    cardRootErrorStatus: number | null;
  }>;
  fileFormatArm: {
    error: string | null;
    cardCalls: string[];
    rendered: unknown;
    redirected: unknown;
    sentFile: string[] | null;
  };
  sources: Record<string, Array<{ line: number; text: string }>>;
};

describe("the read dispatch, against the pinned deck gem", () => {
  it("read is show: the pinned source quotes both, and the action body is one call", () => {
    const read = ORACLE.sources["read"]!.map((row) => row.text).join("\n");
    expect(read).toContain("def read");
    expect(read).toContain("show");
    const show = ORACLE.sources["show"]!.map((row) => row.text).join("\n");
    expect(show).toContain("def show view=nil, status=200");
    expect(show).toContain("card.action = :read");
    expect(show).toContain("status = @format.error_status || status");
    expect(show).toContain("respond @format, result, status");
  });

  it("every card#read route funnels into this dispatch - ten registrations", () => {
    expect(ORACLE.readRoutes).toHaveLength(10);
    expect(ORACLE.readRoutes.every((route) => route.action === "card#read")).toBe(true);
  });

  it("a read runs the read-only before_action chain: setup, authenticate, load_mark, load_card, load_action", () => {
    // The WRITE rows' chains carry refresh_card and no load_mark; the read is
    // the only action whose chain carries BOTH mark steps.
    expect(ORACLE.beforeActionsForRead).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
  });

  it("the plain read: action=:read, the page renders at 200, the query view nil", () => {
    const plain = ORACLE.readDispatch[0]!;
    expect(plain.error).toBeNull();
    expect(plain.cardCalls).toEqual(["action=", "format", "act"]);
    expect(plain.pageCalls[0]!.view).toBe("nil");
    expect(plain.rendered).toMatchObject({ status: 200, content_type: "text/html" });
    expect(plain.redirected).toBeNull();
    expect(plain.sentFile).toBeNull();
  });

  it("the query view reaches the page: ?view=related renders view related", () => {
    const withView = ORACLE.readDispatch[1]!;
    expect(withView.error).toBeNull();
    expect(withView.params["view"]).toBe("related");
    expect(withView.pageCalls[0]!.view).toBe("\"related\"");
  });

  it("show(nil, 302) REDIRECTS: the format's error status is the respond status", () => {
    // Step 4 (status = @format.error_status || status) feeding step 5's
    // redirect arm (response.rb:12-13). A read can redirect, and the recorded
    // redirect target is the render RESULT - the ladder's order, measured.
    const override = ORACLE.showStatusOverride[0]!;
    expect(override.error).toBeNull();
    expect(override.statusArg).toBe(302);
    expect(override.cardCalls).toEqual(["action=", "format", "act"]);
    expect(override.rendered).toBeNull();
    expect(override.redirected).toEqual({ url: "PAGE(file,nil)", status: 302 });
  });

  it("the FileFormat arm: a file-format read at 200 sends the file instead of rendering", () => {
    // The double is answered by an instance of a subclass of the PINNED mod's
    // own Card::Format::FileFormat, so respond's is_a? check is the pinned
    // class check.
    const file = ORACLE.fileFormatArm;
    expect(file.error).toBeNull();
    expect(file.cardCalls).toEqual(["action=", "format", "act"]);
    expect(file.rendered).toBeNull();
    expect(file.sentFile).toEqual(["FILE-PAGE"]);
  });

  it("the unknown-card stand-in: :not_found and the 404 root status (the rig's transcription, labelled)", () => {
    const known = ORACLE.viewForUnknownStandin[0]!;
    expect(known.known).toBe(true);
    expect(known.answer).toBe("unknown");
    const unknown = ORACLE.viewForUnknownStandin[1]!;
    expect(unknown.known).toBe(false);
    expect(unknown.answer).toBe("not_found");
    expect(unknown.cardRootErrorStatus).toBe(404);
    // This is the loading rig's own stand-in (its comment cites
    // card-1.110.0/lib/card/format/error.rb:18-25), recorded because the row's
    // reader needs the shape; it is NOT a pinned execution and the fixture
    // labels it as such.
    expect(unknown.label).toContain("stand-in");
  });

  it("respond's three arms are priority-ordered in the pinned source", () => {
    const respond = ORACLE.sources["respond"]!.map((row) => row.text).join("\n");
    const redirectAt = respond.indexOf("status.in? [302, 303]");
    const fileAt = respond.indexOf("Card::Format::FileFormat");
    const renderAt = respond.indexOf("render_response");
    expect(redirectAt).toBeGreaterThan(-1);
    expect(fileAt).toBeGreaterThan(redirectAt);
    expect(renderAt).toBeGreaterThan(fileAt);
  });
});

describe("the port's read dispatch, against the pinned show", () => {
  it("the bare single-segment arm IS show(nil): the 'open' is the parser's pinned default, not a requested view", () => {
    expect(parsePath("/Front")).toEqual({ name: "Front", view: "open" });
    expect(parsePath("/")).toEqual({ name: "Home", view: "open" });
  });

  it("a requested view is the query's ?view=/?v=, decided BELOW the parse, exactly view_from_params' station", () => {
    // parsePath's "open" is its pinned bare default; the page path
    // re-derives bareness and reads ?view=/?v= through queryViewFromUrl
    // (deploy/bunny-worker-src/bunny-edge-engine-request.ts:880-885:
    // `pathViewIsBareArm(url.pathname) ? queryViewFromUrl(url) : parsed.view`
    // - "the shared view_from_params shape, rest.rb:100-103"). So the parse
    // answers "open" and the REQUEST CORE applies the query view - the same
    // division row A5 pinned, and an explicit path view still wins over the
    // query there.
    const withView = new URL("http://x/Front?view=related");
    expect(parsePath(withView.pathname, withView.searchParams)).toEqual({
      name: "Front",
      view: "open",
    });
    const withAlias = new URL("http://x/?v=related");
    expect(parsePath(withAlias.pathname, withAlias.searchParams)).toEqual({
      name: "Home",
      view: "open",
    });
  });

  it("the /read/<mark> and /card/read/<mark> spellings are the same show(nil) with an explicit mark", () => {
    expect(parsePath("/read/Front")).toEqual({ kind: "actionRead", rawMark: "Front" });
    expect(parsePath("/card/read/Front")).toEqual({ kind: "actionRead", rawMark: "Front" });
    // The markless /read resolves the implicit mark -> the home-mark page
    // (row B9's evidence); the shape here is the explicit-mark one.
  });

  it("the ONE-segment .json suffix stays in the name - row A5's named divergence, not re-litigated here", () => {
    // Row A5 adjudicated this: the port's one-segment arm keeps a .json
    // suffix in the NAME (the registered-format-negotiation row's pinned
    // posture), and the suffix splits only on the two-segment arm and the
    // query-view arm. B1's subject is the read DISPATCH, and this case
    // records the measured shape so the divergence stays on the record
    // without being re-decided.
    expect(parsePath("/Front.json")).toEqual({ name: "Front.json", view: "open" });
    // The two-segment arm's split, for contrast (row A5's own pin).
    expect(parsePath("/My_Card/open.json")).toEqual({
      name: "My Card",
      view: "open",
      format: "json",
    });
  });

  it("the deeper ladder is named, not claimed: the render and error mapping live in the engine's own suites", () => {
    // This file pins the DISPATCH SHAPE (read is show(nil); the query view;
    // the explicit-mark spellings; the format ride). The engine's
    // unknown-card 404 and the format negotiation are graded by their own
    // suites; B1's verdict rests on the dispatch shape matching, which the
    // cases above measure.
    expect(ORACLE.readDispatch[0]!.rendered).toMatchObject({ status: 200 });
  });
});