// The EXPLICIT FILE route, measured against the PINNED DECK's own route
// table and its own dispatch methods.
//
// The completeness register's A2 row ([Family]) graded the port
// PARTIAL on a STALE claim: "Not ported: variant resize bytes (the original
// serves for every variant, file-routes.ts header 28-33)". The tree outgrew
// that claim - the save path stores ImageCardUploader version files
// (src/card/attachments/image-renditions.ts), the route threads the parsed
// -size segment into the store (src/server/file-routes.ts handleFileGet ->
// attachmentStore.read(..., parsed.size, ...)), and the store resolves the
// variant spelling <action_id>-<variant><ext> first with the original as
// the fallback (src/card/attachments/attachment-store.ts read).
//
// What was still missing was EVIDENCE on the PINNED side, so the row's own
// verification kept pointing at the stale sentence and the row could not
// close. This test supplies that evidence.
//
// fixtures/captured/explicit-file-route-ruby-oracle.json is what
// oracle-capture-explicit-file-route-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table (29 routes, in the deck's own
// registration order) and the PINNED DECK's own dispatch methods:
//
//   the route   decko-0.20.0/config/engine_routes.rb:9-13
//                 get({ "#{files}/:mark/:rev_id(-:size).:format" => "card#read" }
//                     .merge(mark: /[^-]+/, explicit_file: true, rev_id: /[^-]+/))
//   the dispatch decko-0.20.0/lib/card_controller/response.rb:102-109
//                 explicit_file_format?(rf) ? :file : rf.to_sym
//   the sender  decko-0.20.0/lib/card_controller/response.rb:10-19
//                 format.is_a?(Card::Format::FileFormat) && status == 200
//                   -> send_file(*result)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  handleAttachmentRoute,
  parseFileRouteSegments,
  type FileRouteDeps,
} from "../../src/server/file-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/explicit-file-route-ruby-oracle.json"), "utf8"),
) as {
  filesWebPath: string;
  routeTableSize: number;
  filesRoutes: Array<{
    verb: string;
    patterns: string[];
    requirements: Record<string, string>;
    action: string;
    order: number;
  }>;
  dispatch: Array<{ label: string; formatName: string | null }>;
  respond: Array<{ label: string; branch: string }>;
};

const byDispatchLabel = new Map(ORACLE.dispatch.map((row) => [row.label, row]));
const byRespondLabel = new Map(ORACLE.respond.map((row) => [row.label, row]));

/** The recording store: the port's own call into the attachment store is
 *  what carries the variant selector, so the store records its arguments. */
function recordingDeps(record: { size?: string; area?: string; actionId?: number }): FileRouteDeps {
  const driver = {
    query: async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM cards")) {
        return {
          rows: [
            {
              id: 7,
              name: "Banner",
              key: null,
              type_id: 1,
              db_content: "~7/12.png",
              codename: null,
            },
          ],
        };
      }
      if (sql.includes("FROM card_actions")) return { rows: [{ id: Number(args[0]), comment: "banner.png" }] };
      return { rows: [] };
    },
  };
  const store = {
    read: async (
      _cardId: number,
      actionId: number,
      _ext: string,
      size: string | undefined,
      area: string | undefined,
    ) => {
      record.size = size;
      record.area = area;
      record.actionId = actionId;
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    },
  };
  return {
    driver,
    fetchEngine: { fetchByName: async () => undefined },
    attachmentStore: store,
    createEngine: () => {
      throw new Error("the read path must not create an engine");
    },
  } as unknown as FileRouteDeps;
}

describe("the explicit file route, against the pinned deck gem", () => {
  it("the pinned deck registers the files route with the explicit_file requirement", () => {
    const current = ORACLE.filesRoutes.find((route) => route.patterns[0]?.includes("(-:size)"))!;
    expect(current.patterns[0]).toBe("/:mark/:rev_id(-:size).:format");
    expect(current.requirements.explicit_file).toBe("true");
    expect(current.requirements.mark).toBe("[^-]+");
    expect(current.requirements.rev_id).toBe("[^-]+");
    expect(current.action).toBe("card#read");
    // The files route is the deck's SECOND route: the root route is first,
    // and the registration ORDER is the matching precedence.
    expect(current.order).toBe(1);
    expect(ORACLE.routeTableSize).toBe(29);
    expect(ORACLE.filesWebPath).toBe("files");
  });

  it("the pinned deck's own dispatch sends an explicit file request to the file sender", () => {
    expect(byDispatchLabel.get("the explicit file request (png)")!.formatName).toBe("file");
    // Even a REGISTERED format name is sent to the file sender when the
    // route set the explicit_file requirement.
    expect(
      byDispatchLabel.get("the explicit file request with a registered format (html)")!.formatName,
    ).toBe("file");
    // And the control: without the requirement, a registered format answers
    // its own name.
    expect(byDispatchLabel.get("no explicit file, a registered format (html)")!.formatName).toBe("html");
  });

  it("the pinned deck's own sender arms the file format at 200 only", () => {
    expect(byRespondLabel.get("the file format at 200 is the file sender")!.branch).toBe("send_file");
    expect(byRespondLabel.get("the file format at 404 renders the page")!.branch).toBe("render_response");
    expect(byRespondLabel.get("a page format at 200 renders the page")!.branch).toBe("render_response");
    expect(byRespondLabel.get("a page format at 302 hard-redirects")!.branch).toBe("hard_redirect");
  });

  it("the port parses the current route's segments into mark, rev id, size and format", () => {
    // The pinned pattern: /:mark/:rev_id(-:size).:format
    expect(parseFileRouteSegments(["~7", "12-medium.png"])).toEqual({
      mark: "~7",
      revId: "12",
      size: "medium",
      format: "png",
    });
    // The size segment is OPTIONAL: the same route without it.
    expect(parseFileRouteSegments(["~7", "12.png"])).toEqual({
      mark: "~7",
      revId: "12",
      format: "png",
    });
  });

  it("and the deprecated route's single segment into mark, size, rev id and format", () => {
    // The pinned pattern: /:mark(-:size)-:rev_id.:format
    const deprecated = ORACLE.filesRoutes.find((route) => route.patterns[0]?.includes("-:rev_id"))!;
    expect(deprecated.patterns[0]).toBe("/:mark(-:size)-:rev_id.:format");
    expect(parseFileRouteSegments(["~7-medium-12.png"])).toEqual({
      mark: "~7",
      size: "medium",
      revId: "12",
      format: "png",
    });
  });

  it("the port threads the size segment into the attachment store", async () => {
    const record: { size?: string; area?: string; actionId?: number } = {};
    const response = (await handleAttachmentRoute(
      new Request("http://test.test/files/~7/12-medium.png"),
      recordingDeps(record),
    )) as Response;
    expect(response.status).toBe(200);
    // The store received the VARIANT selector the route parsed, and the
    // owning card's area - the row's subject, measured on the port side.
    expect(record.size).toBe("medium");
    expect(record.actionId).toBe(12);
    expect(record.area).toBe("files");
  });

  it("NAMED DIVERGENCE: the port's mark may contain a dash, the pinned route's may not", () => {
    // The pinned requirement is mark: /[^-]+/ - a mark with a dash does NOT
    // match the files route, so the request falls through to the deck's
    // wildcard (engine_routes.rb:54) and answers bad_address. The port's
    // parser keeps the dash in the mark and serves the file.
    //
    // This is the port being MORE PERMISSIVE than the pinned route, and it
    // is left that way on purpose: a card whose name carries a dash is a
    // real card, and the pinned route's own requirement would send its
    // attachment URL to the bad_address view. The divergence is named here
    // rather than closed, because closing it would break the port's own
    // working attachment URLs.
    expect(ORACLE.filesRoutes[0]!.requirements.mark).toBe("[^-]+");
    expect(parseFileRouteSegments(["~My-Card", "12.png"])).toEqual({
      mark: "~My-Card",
      revId: "12",
      format: "png",
    });
  });
});
