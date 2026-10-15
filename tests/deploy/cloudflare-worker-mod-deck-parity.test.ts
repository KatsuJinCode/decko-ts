// The Cloudflare Worker entries render through the composed mod deck, the
// same way the Node host does. Ruby boots every mod before it serves a
// request (card-1.110.0 lib/cardio/mod/dirs.rb:54-62, loader.rb:16-21), and
// the Node host mirrors that by calling defaultDeckLoader() before it
// constructs its RenderEngine (vm-staging-server.mjs, the deck boot). A
// Worker that builds its engine with no loader bound resolves every view from
// the compiled base table alone, so a page whose bytes come from a mod's view
// renders differently on Cloudflare than on Node.
//
// What this file drives:
//   - deploy/worker.ts and worker.ts, the REAL fetch handlers, in-process
//     over a D1-shaped shim on the local sqlite driver (the same shim the
//     view-routes suite uses), against deploy/migrations/0001-schema.sql and
//     deploy/seed/seed.sql;
//   - the Node host's engine composition: the inflection table, the
//     FetchEngine, defaultDeckLoader(), then the RenderEngine, then the name
//     environment and the virtual-card hook — the order vm-staging-server.mjs
//     boots in. The host script itself starts an HTTP server at import, so
//     its composition is restated here rather than imported.
//
// Order matters, because loading a deck is process-wide (it binds the
// default loader and registers mod views into the shared base view record):
//   0. a control engine renders every page before any deck is loaded;
//   1. the two workers render next, still with no deck loaded, so a worker
//      that does not load the deck itself renders the control's bytes;
//   2. the Node host composition loads the deck and renders last.
// vitest runs each file in its own module graph, so no other suite's loader
// leaks in (asserted below).
//
// The pages compared are ones whose bytes depend on a mod (card-mod-history's
// :history, the :one_line_content and :count views): the control's render of
// each must differ from the Node host's. Without that check a page that never
// reaches a mod view would pass the comparison vacuously.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// data-slot-id is SecureRandom.hex(10) per slot in Ruby (wrap.rb) and in the
// port (slot-html.ts newSlotId), so two renders of one page never share it.
// The source is replaced with a counter restarted before every page render on
// every host: the comparison stays byte-exact with no normalisation, and it
// also checks that each host opens the same slots in the same order.
let slotSequence = 0;
vi.mock("../../src/card/render/slot-html.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/card/render/slot-html.js")>();
  return {
    ...original,
    newSlotId: () => `slot${String(++slotSequence).padStart(16, "0")}`,
  };
});

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

/** The pages compared: card name and view. Each must depend on a mod (the
 *  unbound-engine check below). */
const PAGES: ReadonlyArray<{ name: string; view: string }> = [
  { name: "Home", view: "history" },
  { name: "History", view: "history" },
  { name: "Home", view: "one_line_content" },
  { name: "*all+*read", view: "one_line_content" },
  { name: "Demo Bot", view: "count" },
];

function d1Shim(driver: LocalSqliteDriver): D1DatabaseLike {
  const run = async (sql: string, params: D1BindValue[]): Promise<D1ResultLike> => {
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

type FetchHandler = { fetch: (request: Request, env: unknown) => Promise<Response> };

function urlPath(name: string, view: string): string {
  const mark = name
    .split("+")
    .map((part) => encodeURIComponent(part.replace(/ /g, "_")))
    .join("+");
  return `/${mark}/${view}`;
}

/** The engine render inside deploy/worker.ts's page shell:
 *  `<div class="card-view" ... data-view="V">BODY</div><p><a href="/...json">`. */
function deployWorkerBody(page: string, view: string): string {
  const open = `data-view="${view}">`;
  const start = page.indexOf(open);
  const end = page.lastIndexOf(`</div><p><a href="/`);
  if (start < 0 || end < start) return `no card-view shell: ${page}`;
  return page.slice(start + open.length, end);
}

/** The engine render inside worker.ts's layoutPage shell:
 *  `...<a href="/api/status">Status</a></div>BODY</body></html>`. */
function rootWorkerBody(page: string): string {
  const open = `<a href="/api/status">Status</a></div>`;
  const start = page.indexOf(open);
  const end = page.lastIndexOf(`</body></html>`);
  if (start < 0 || end < start) return `no layout shell: ${page}`;
  return page.slice(start + open.length, end);
}

let driver: LocalSqliteDriver | undefined;
const deployRendered = new Map<string, string>();
const rootRendered = new Map<string, string>();
const nodeRendered = new Map<string, string>();
const unboundRendered = new Map<string, string>();
let loaderBoundBeforeWorkers = true;
let noLoaderBeforeControl = false;

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    for (const statement of splitSqlStatements(readFileSync(file, "utf8"))) {
      await driver.query(statement, []);
    }
  }
  const { getDefaultModLoader } = await import("../../src/card/mod-loader.js");
  const { applyDeckInflections } = await import("../../src/card/name/inflect.js");
  const { CARD_GEM_INITIALIZER_INFLECTIONS } = await import("../../src/card/name/oracle-deck-inflections.js");
  const { FetchEngine } = await import("../../src/card/fetch.js");
  const { RenderEngine } = await import("../../src/card/render.js");
  const { defaultDeckLoader } = await import("../../src/card/mod-loader/default-mod-deck.js");
  const { installDeckNameEnvironment } = await import("../../src/server/worker-shared-surface.js");
  const { createVirtualCardLookup } = await import("../../src/card/fetch/virtual-cards.js");
  const { structureRuleUniverseStatement, structureUniverseFromResults, structureRuleTypesFromResults } =
    await import("../../src/card/rules/structure.js");
  const compose = async (bindDeck: boolean) => {
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    const fetcher = new FetchEngine(driver!);
    if (bindDeck) defaultDeckLoader();
    const render = new RenderEngine(fetcher);
    await installDeckNameEnvironment(driver!, fetcher);
    const [universe] = await driver!.batch([structureRuleUniverseStatement()]);
    fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
      contents: structureUniverseFromResults(universe),
      ruleTypeIds: structureRuleTypesFromResults(universe),
    });
    return render;
  };
  const renderAll = async (render: InstanceType<typeof RenderEngine>, into: Map<string, string>) => {
    for (const { name, view } of PAGES) {
      let out: string;
      slotSequence = 0;
      try {
        out = `200 ${await render.render(name, view, {})}`;
      } catch (error) {
        out = `error ${error instanceof Error ? error.message : String(error)}`;
      }
      into.set(`${name}/${view}`, out);
    }
  };

  // 0. The control: an engine composed before any mod deck is loaded in
  //    this process. Loading a deck also registers mod views into the shared
  //    base view record, so this render must come first to show what a host
  //    without the deck serves.
  noLoaderBeforeControl = getDefaultModLoader() === undefined;
  await renderAll(await compose(false), unboundRendered);

  // 1. The two Cloudflare entries, still before anything in this process
  //    loads a deck: each must load it itself.
  loaderBoundBeforeWorkers = getDefaultModLoader() !== undefined;
  const deployModule = await import("../../deploy/worker.js");
  const deployWorker = (deployModule.default ?? deployModule) as unknown as FetchHandler;
  const rootModule = await import("../../worker.js");
  const rootWorker = (rootModule.default ?? rootModule) as unknown as FetchHandler;
  for (const { name, view } of PAGES) {
    const key = `${name}/${view}`;
    slotSequence = 0;
    const deployRes = await deployWorker.fetch(
      new Request(`https://deploy.test${urlPath(name, view)}`),
      { DB: d1Shim(driver) },
    );
    deployRendered.set(key, `${deployRes.status} ${deployWorkerBody(await deployRes.text(), view)}`);
    slotSequence = 0;
    const rootRes = await rootWorker.fetch(
      new Request(`https://root.test${urlPath(name, view)}`),
      { DB: d1Shim(driver) },
    );
    rootRendered.set(key, `${rootRes.status} ${rootWorkerBody(await rootRes.text())}`);
  }

  // 2. The Node host's composition, in its boot order.
  await renderAll(await compose(true), nodeRendered);
}, 120_000);

afterAll(() => {
  driver?.close();
});

describe("Cloudflare Worker entries render through the composed mod deck", () => {
  it("no loader was bound in this process before the control or the workers rendered", () => {
    expect(noLoaderBeforeControl).toBe(true);
    expect(loaderBoundBeforeWorkers).toBe(false);
  });

  for (const { name, view } of PAGES) {
    const key = `${name}/${view}`;
    it(`${key} depends on a mod, and both Workers render the Node host's bytes`, () => {
      const node = nodeRendered.get(key)!;
      expect(node.startsWith("200 ")).toBe(true);
      // The page's bytes come from a mod: an engine with no loader renders
      // something else.
      expect(unboundRendered.get(key)).not.toBe(node);
      expect(deployRendered.get(key)).toBe(node);
      expect(rootRendered.get(key)).toBe(node);
    });
  }
});
