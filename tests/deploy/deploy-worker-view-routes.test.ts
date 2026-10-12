// The ALTERNATE GET route grammar, exercised through the REAL
// deploy/worker.ts fetch handler (the same module wrangler bundles). The
// production handler is driven in-process here, against the same schema +
// seed the deploy uses, through a D1-shaped shim over the local sqlite
// driver. Only the D1 binding differs; the routing, the render dispatch
// and the HTML shell are the shipped code. (workerd boot coverage lives
// in tests/deploy/deploy-worker-miniflare.test.ts.)
//
// Ruby truth under test (decko-0.20.0):
//   config/engine_routes.rb:24  get ":mark/view/:view(.:format)" => "card#read"
//   config/engine_routes.rb:25  get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/
//   config/engine_routes.rb:51  get ":mark/:view(.:format)" => "card#read"
//   lib/card_controller/rest.rb:84-88  def read; show; end
//   lib/card_controller/rest.rb:91-99  def show(view=nil, status=200)
//       ... render_page @format, view ... / :100-103 def view_from_params
//       -> params[:view] (or params[:v]), nil when absent
// i.e. the VIEW COMES FROM THE PATH, and every one of those three routes
// lands on the same card#read. Without the alternate grammar the worker
// answered "No route for ..." (404) for every multi-segment path, so
// /Card/closed, /Card/view/closed and /card/closed/Card were all
// unreachable.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import type {
  D1BindValue,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "../../src/server/drivers/d1.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

/** The D1 binding the worker expects, backed by the local sqlite driver.
 *  D1's prepare/bind/all/run/batch shape, nothing else. */
function d1Shim(driver: LocalSqliteDriver): D1DatabaseLike {
  const run = async (
    sql: string,
    params: D1BindValue[],
  ): Promise<D1ResultLike> => {
    const result = await driver.query(sql, params as unknown[]);
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
    batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
      return Promise.all(
        statements.map((statement) =>
          (statement as unknown as { all: () => Promise<D1ResultLike> }).all(),
        ),
      );
    },
  };
}

let driver: LocalSqliteDriver | undefined;
let worker: { fetch: (request: Request, env: unknown) => Promise<Response> };

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

function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`https://decko-ts.test${path}`), {
    DB: d1Shim(driver!),
  });
}

/** Two renders of the same card+view differ ONLY in the per-render slot
 *  nonce (slot-html.ts mints a fresh data-slot-id every render), so that is
 *  the one attribute normalized before comparing two responses byte-wise. */
function withoutSlotNonce(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="<nonce>"');
}

describe("deploy worker route grammar — the alternate GET views (R4)", () => {
  it("GET /:mark/:view renders the card in the REQUESTED view (engine_routes.rb:51)", async () => {
    const open = await get("/About");
    const closed = await get("/About/closed");
    expect(open.status).toBe(200);
    expect(closed.status).toBe(200);
    const openHtml = await open.text();
    const closedHtml = await closed.text();
    // the requested view rides the shell's data-view hook
    expect(openHtml).toContain('data-view="open"');
    expect(closedHtml).toContain('data-view="closed"');
    // same card, same shell, a different view body
    expect(closedHtml).toContain('data-card="About"');
    expect(closedHtml).not.toBe(openHtml);
    // :closed is the collapsed shape (the title, not the body)
    expect(closedHtml).not.toContain("only synthetic demo content");
  });

  it("GET /:mark/view/:view is the same render (engine_routes.rb:24)", async () => {
    const viaViewSegment = await get("/About/view/closed");
    const viaBareSegment = await get("/About/closed");
    expect(viaViewSegment.status).toBe(200);
    expect(withoutSlotNonce(await viaViewSegment.text())).toBe(
      withoutSlotNonce(await viaBareSegment.text()),
    );
  });

  it("GET /card/:view/:mark is NOT served for a non-edit view (engine_routes.rb:25 constrains that route's view to /new|edit/)", async () => {
    // Ruby: `get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/`.
    // A "closed" view does not match that route, and it is three segments
    // with no literal "view" in the middle, so neither line 24 nor line 51
    // matches either - the address is a bad_address in Ruby. The port must
    // not invent a route Ruby does not have: it 404s like the rest of the
    // unmatched grammar.
    const legacy = await get("/card/closed/About");
    expect(legacy.status).toBe(404);

    // and the shape the route DOES own stays reachable through the grammar
    // Ruby gives it for free: /About/closed is line 51.
    expect((await get("/About/closed")).status).toBe(200);
  });

  it("GET /:mark/:view keeps the compound-name rules (%20 is a space, '+' is the joint)", async () => {
    const response = await get("/Demo%20Guide+Section%20One/closed");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-card="Demo Guide+Section One"');
    expect(html).toContain('data-view="closed"');
  });

  it("GET /:mark/:view 404s a missing card, and an unregistered view is the 422 Unsupported-view page (never a 200)", async () => {
    const missing = await get("/NoSuchCard/closed");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Card not found");

    // Ruby raises Card::Error::UserError for an unregistered view
    // (render.rb#view_method; the engine's UnsupportedViewError cites it)
    // and Card::Error's BASE status_code is 422 (prototype/lib/card/
    // error.rb:21; only ServerError :46-51 overrides to 500) — the
    // mapper answers the UserError shape on BOTH worker entries. The
    // negative half matters: a silent empty 200 would be a leak of "the
    // view silently renders nothing".
    const unknown = await get("/About/no_such_view");
    expect(unknown.status).toBe(422);
    expect(await unknown.text()).toContain("no_such_view");
  });

  it("the one-segment :open route is untouched by the view grammar", async () => {
    const response = await get("/About");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("only synthetic demo content");
  });

  it("the record-JSON route still wins over the view grammar on a one-segment path", async () => {
    const response = await get("/Home.json");
    expect(response.status).toBe(200);
    const record = (await response.json()) as { name: string; type_name: string | null };
    expect(record.name).toBe("Home");
  });
});

describe("deploy worker route grammar — the ?view= query param (R4's named remainder)", () => {
  // Ruby truth: every read route lands on card#read -> show(view=nil) for
  // the two arms with no view in the path (root "card#read" line 7, and
  // get "/:mark(.:format)" line 19), and show's render_page does
  //   view ||= view_from_params
  //   def view_from_params; %i[view v].each { |k| return params[k] if
  //     params[k].present? }; nil; end
  // (decko-0.20.0 lib/card_controller/rest.rb:91-103). The two path-view
  // routes pass the action arg, so they never consult params.
  it("GET /:mark?view=X renders the X view (rest.rb:100-103 view_from_params)", async () => {
    const viaParam = await get("/About?view=closed");
    const viaPath = await get("/About/closed");
    expect(viaParam.status).toBe(200);
    const paramHtml = await viaParam.text();
    expect(paramHtml).toContain('data-view="closed"');
    expect(withoutSlotNonce(paramHtml)).toBe(withoutSlotNonce(await viaPath.text()));
  });

  it("?v= is the alias Ruby reads second (%i[view v])", async () => {
    const response = await get("/About?v=closed");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-view="closed"');
  });

  it("a BLANK view= falls through to v= (params[k].present?, rest.rb:101)", async () => {
    const response = await get("/About?view=&v=closed");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-view="closed"');
  });

  it("a PATH view wins over the query param (show(view) never consults params)", async () => {
    const response = await get("/About/closed?view=open");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-view="closed"');
    expect(html).not.toContain('data-view="open"');
  });

  it("an unregistered view param is the 422 Unsupported-view page, verbatim (never a silent 200)", async () => {
    // the same contract the path arm pins: the view name rides verbatim
    // into the engine, which raises the UserError shape (error.rb:21
    // base status_code 422) for a view no module registers
    const response = await get("/About?view=no_such_view");
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("no_such_view");
  });

  it("the root / route is card#read too (engine_routes.rb:7) and honors the param", async () => {
    const response = await get("/?view=closed");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-card="Home"');
    expect(html).toContain('data-view="closed"');
  });
});
