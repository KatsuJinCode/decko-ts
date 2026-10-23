// POST /:mark/asset ([Family] row E9), measured against the PINNED deck's
// own route table (through the PINNED router) and against the PORT's own
// upload grammar.
//
// The register's E9 row grades the port's dedicated multipart upload
// grammar and calls it a "port-only route (no Ruby counterpart)", on the
// basis that "the register names the host(s) and the file:line in the port
// that serves it, so there is no Ruby behaviour it could fail to match".
// The register's own note says "Ruby uploads ride the standard POST/PUT
// create/update body instead". This file MEASURES that basis.
//
// WHAT THE MEASUREMENT SETTLES, and it is three separate answers:
//
//   1. THE PINNED DECK HAS NO ROUTE FOR THE PORT'S UPLOAD PATH. The pinned
//      router does not match POST /Alpha/asset at all: no pinned route
//      admits a POST for a two-segment path except "/type/:type", whose
//      first segment is the literal "type". So the pinned deck's answer
//      there is the ROUTER'S OWN 404 (ActionController::RoutingError).
//
//   2. THE PINNED DECK'S OWN ASSET SURFACE IS A GET, AND ITS PATH SHAPE IS
//      THE OTHER WAY ROUND. GET /asset/Alpha is the pinned deck's own asset
//      arm ("(card)/asset(/:mark(.:format))"), action card#asset. The
//      pinned asset METHOD is the deprecated one (decko-0.20.0/lib/
//      card_controller/rest.rb:23-27), and row B5's committed capture
//      measured it: it renders the 404 body "Decko installation error:
//      missing public directory symlinks". So the pinned deck's asset
//      surface answers 404 and the port's answers 201.
//
//   3. THE PORT'S PATH IS NOT THE PINNED DECK'S PATH. The port's grammar is
//      POST /<mark>/asset; the pinned deck's is GET /asset/<mark>. A GET
//      of the port's own path is a card read of the mark "Alpha" with the
//      view "asset" in the pinned deck.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  handleAttachmentRoute,
  type FileRouteDeps,
} from "../../src/server/file-routes.js";
import type { Actor } from "../../src/card/actions/types.js";
import { loadPortOnlyRouteOracle, pinnedAnswer, portServes } from "./port-only-route-oracle.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORACLE = loadPortOnlyRouteOracle();

/** Row B5's committed capture: the pinned deck's own asset METHOD, executed. */
const ASSET_ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-asset-action-ruby-oracle.json"), "utf8"),
) as {
  assetMethod: { rendered: { body: string; status: number } };
  assetActionRoute: { verb: string; patterns: string[]; action: string };
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x41, 0x42]);

const ACTOR = { id: 90, name: "Joe User" } as unknown as Actor;

/** The port's own deps, with the engine and the card read stubbed: the
 *  upload arm's own answers (the permission posture, the multipart
 *  grammar, the create) are reached before any storage is touched. */
function deps(overrides: Partial<FileRouteDeps> = {}): FileRouteDeps {
  return {
    driver: {} as FileRouteDeps["driver"],
    fetchEngine: {
      fetchByName: async () => undefined,
    } as unknown as FileRouteDeps["fetchEngine"],
    attachmentStore: {} as FileRouteDeps["attachmentStore"],
    resolveActor: async () => ACTOR,
    createEngine: () =>
      ({
        createCard: async () => ({ cardId: 7, name: { s: "Alpha" }, actionId: 9 }),
        updateCard: async () => ({ cardId: 7, actionId: 9 }),
      }) as unknown as ReturnType<FileRouteDeps["createEngine"]>,
    ...overrides,
  } as FileRouteDeps;
}

function uploadRequest(pathname: string, withFile: boolean): Request {
  const form = new FormData();
  if (withFile) form.append("file", new File([PNG_BYTES as BlobPart], "note.png"));
  return new Request(`http://test.test${pathname}`, { method: "POST", body: form });
}

describe("the pinned deck's own answer for the upload path", () => {
  it("the pinned router does NOT route POST /<mark>/asset at all", () => {
    const answer = pinnedAnswer("E9", "/Alpha/asset", "post");
    expect(answer?.matched).toBe(false);
    expect(answer?.matches).toEqual([]);
    // The pinned deck's answer there is the router's own 404
    // (ActionController::RoutingError), not a card surface.
  });

  it("a GET of the port's own path is a card read with the view 'asset'", () => {
    const answer = pinnedAnswer("E9", "/Alpha/asset", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark/:view(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.parameters.mark).toBe("Alpha");
    expect(answer?.answer?.parameters.view).toBe("asset");
  });

  it("the pinned deck's own asset path is the other way round, and its method 404s", () => {
    const answer = pinnedAnswer("E9", "/asset/Alpha", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("(/card)/asset(/:mark(.:format))");
    expect(answer?.answer?.defaults.action).toBe("asset");
    expect(answer?.answer?.parameters.mark).toBe("Alpha");

    // Row B5's committed capture executed the pinned asset method: it is
    // the deprecated one, and it renders a 404.
    expect(ASSET_ORACLE.assetMethod.rendered.status).toBe(404);
    expect(ASSET_ORACLE.assetMethod.rendered.body).toBe(
      "Decko installation error: missing public directory symlinks",
    );
    expect(ASSET_ORACLE.assetActionRoute.action).toBe("card");
  });
});

describe("the port's own upload grammar", () => {
  it("the port claims POST /<mark>/asset and answers it", async () => {
    const response = await handleAttachmentRoute(
      uploadRequest("/Alpha/asset", true),
      deps(),
    );
    expect(response).not.toBeNull();
    expect(response?.status).toBe(201);
    const body = (await response?.json()) as Record<string, unknown>;
    expect(body["name"]).toBe("Alpha");
    expect(body["id"]).toBe(7);
    expect(body["action_id"]).toBe(9);
    expect(body["size"]).toBe(PNG_BYTES.length);
    expect(body["storage"]).toBe("local");
    expect(body["url"]).toBe("/files/~7/9.png");
  });

  it("the port's grammar is a MULTIPART one, and it names its own parts", async () => {
    const response = await handleAttachmentRoute(
      uploadRequest("/Alpha/asset", false),
      deps(),
    );
    expect(response?.status).toBe(400);
    const body = (await response?.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("missing upload part (file | image | card[file] | card[image])");
  });

  it("the port's own permission posture answers before the engine", async () => {
    const response = await handleAttachmentRoute(
      uploadRequest("/Alpha/asset", true),
      deps({ resolveActor: async () => null }),
    );
    expect(response?.status).toBe(403);
    const body = (await response?.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("permission denied");
    expect(body["code"]).toBe("anonymous-actor");
  });

  it("the port claims that path and no other", async () => {
    // Not the upload grammar.
    expect(
      await handleAttachmentRoute(uploadRequest("/Alpha/other", true), deps()),
    ).toBeNull();
    // The files prefix is the serving side's, not the upload side's.
    expect(
      await handleAttachmentRoute(uploadRequest("/files/Alpha/asset", true), deps()),
    ).toBeNull();
    // A GET is not the upload grammar either.
    expect(
      await handleAttachmentRoute(
        new Request("http://test.test/Alpha/asset", { method: "GET" }),
        deps(),
      ),
    ).toBeNull();
  });

  it("the port's own module header states the grammar it owns", () => {
    expect(
      portServes("src/server/file-routes.ts", "POST /:mark/asset"),
    ).toBe(true);
    expect(
      portServes(
        "src/server/file-routes.ts",
        "The POST /:mark create",
      ),
    ).toBe(true);
    expect(ORACLE.portSurface.E9.map((entry) => entry.host)).toEqual([
      "the port's upload grammar, in the module header",
      "the port's upload arm",
    ]);
  });
});
