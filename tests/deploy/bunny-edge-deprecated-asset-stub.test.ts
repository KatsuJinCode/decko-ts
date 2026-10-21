// The DEPRECATED asset routes (register-routes A4 + B5): engine_routes.rb
// :14-16 `%w[assets javascripts jasmine].each { |prefix| get
// "#{prefix}/*mark" => "card#asset" }` and card#asset itself
// (decko-0.20.0/lib/card_controller/rest.rb:22-27, @deprecated):
//
//   body = "Decko installation error: missing public directory symlinks"
//   Rails.logger.info "#{body}.\n  >>> Try `rake card:mod:symlink`"
//   render body: body, status: 404
//
// — a fixed installation-error answer, NOT a card render and NOT the
// router's no-route stub (the body is the oracle). Before this port the
// edge answered the bare "No route for <path>" stub and staging parsed
// /assets/<mark> as the card "assets" in view <mark> (a 422).
//
// The glob needs a segment after the prefix: /assets alone is NOT this
// route (it falls to the standard /:mark arm — the card "assets"), pinned
// here at the parsePath grammar level.
//
// Driven through the REAL serving code on three hosts: the edge request
// core (handleEngineRequest — the stub answers before any deck access, so
// the deck seam is a throw-on-touch stub), the CF shell (deploy/worker.ts
// fetch handler over the schema+seed sqlite), and the minimal Bunny reader
// (bunny-worker.ts handleRequest). The staging host's boot-level pin is
// tests/deploy/staging-deprecated-asset-stub-endpoint.test.ts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import { handleRequest as minimalWorkerHandleRequest } from "../../deploy/bunny-worker-src/bunny-worker.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import type {
  D1BindValue,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "../../src/server/drivers/d1.js";

const ASSET_STUB_BODY = "Decko installation error: missing public directory symlinks";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

/** The deck seam must never be touched by the asset stub (the answer is
 *  fixed Ruby source text, engine-independent). */
const deckThatMustNotBeTouched = (): never => {
  throw new Error("the deprecated asset stub must not read the deck");
};

async function stubAssertions(response: Response): Promise<void> {
  expect(response.status).toBe(404);
  expect(await response.text()).toBe(ASSET_STUB_BODY);
  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
}

// --- CF shell harness (the deploy-worker-view-routes.test.ts shape) -------

let driver: LocalSqliteDriver | undefined;
let worker: { fetch: (request: Request, env: unknown) => Promise<Response> };

function d1Shim(d: LocalSqliteDriver): D1DatabaseLike {
  const run = async (sql: string, params: D1BindValue[]): Promise<D1ResultLike> => {
    const result = await d.query(sql, params as unknown[]);
    return {
      success: true,
      results: result.rows as Record<string, unknown>[],
      meta: { changes: 0, rows_read: result.rowsRead, rows_written: 0 },
    };
  };
  return {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: D1BindValue[] = [];
      const statement = {
        bind(...values: D1BindValue[]) {
          bound = values;
          return statement;
        },
        all: () => run(sql, bound),
        run: () => run(sql, bound),
      };
      return statement as unknown as D1PreparedStatementLike;
    },
    batch: async (statements) => {
      const out: D1ResultLike[] = [];
      for (const statement of statements) out.push(await statement.run());
      return out;
    },
  };
}

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    const sql = readFileSync(file, "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await driver.query(statement, []);
    }
  }
  const module = await import("../../deploy/worker.js");
  worker = (module.default ?? module) as unknown as {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  };
}, 60_000);

afterAll(() => {
  driver?.close();
});

// ---------------------------------------------------------------------

describe("the deprecated asset routes (A4/B5) — the edge request core", () => {
  it("answers assets/*mark with card#asset's fixed installation-error 404 (deep glob)", async () => {
    const res = await handleEngineRequest(
      edgeGet("/assets/whatever/this/is"),
      { driver: undefined, deck: deckThatMustNotBeTouched } as never,
    );
    await stubAssertions(res);
  });

  it("answers javascripts/*mark and jasmine/*mark the same way", async () => {
    for (const path of ["/javascripts/mod.js", "/jasmine/suite"]) {
      const res = await handleEngineRequest(
        edgeGet(path),
        { driver: undefined, deck: deckThatMustNotBeTouched } as never,
      );
      await stubAssertions(res);
    }
  });

  it("does NOT stub /assets alone — the single segment stays the standard /:mark card arm", () => {
    // Grammar-level pin: the Ruby glob `assets/*mark` needs a segment after
    // the prefix; the bare /assets falls to engine_routes.rb:19 (the card
    // "assets"). The card render itself is the page path's business (pinned
    // by the page-shell suite); what is pinned here is that parsePath does
    // not classify it as the asset stub.
    const bare = parsePath("/assets");
    expect("kind" in bare ? bare.kind : undefined).not.toBe("assetStub");
    const stubbed = parsePath("/assets/x");
    expect("kind" in stubbed && stubbed.kind).toBe("assetStub");
  });
});

describe("the deprecated asset routes (A4/B5) — the CF shell (deploy/worker.ts)", () => {
  it("answers the three prefixes with the fixed installation-error 404", async () => {
    for (const path of ["/assets/logo.png", "/javascripts/decko.js", "/jasmine/all"]) {
      const res = await worker.fetch(new Request(`https://decko-ts.test${path}`), {
        DB: d1Shim(driver!),
      });
      await stubAssertions(res);
    }
  });
});

describe("the deprecated asset routes (A4/B5) — the minimal Bunny reader", () => {
  it("answers the three prefixes with the fixed installation-error 404", async () => {
    for (const path of ["/assets/logo.png", "/javascripts/decko.js", "/jasmine/all"]) {
      const res = await minimalWorkerHandleRequest(
        new Request(`https://minimal.bunny.test${path}`),
        { BUNNY_DB_URL: "http://unused.test", BUNNY_DB_TOKEN: "unused" } as never,
        () => {
          throw new Error("the stub must not open the database");
        },
      );
      await stubAssertions(res);
    }
  });
});
