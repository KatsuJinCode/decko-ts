// benchmarks/speed/port-handler.ts — the one request path both port targets
// of the speed benchmark serve: the edge deck boot (bootEdgeServingEngines)
// and the edge request handler (handleEngineRequest, anonymous live render),
// the pair tests/deploy/no-caching-synthetic.test.ts drives on the same deck.
// The Node host and the workerd Worker differ only in the driver they pass.
//
// HopDriver wraps that driver: every round trip (one query() or one batch(),
// a batch being one trip as on D1 and libSQL) is held `hopMs` before it is
// sent, the simulated network between an edge host and its database. Each
// response carries X-Decko-Db-Trips, the round trips that request made.

import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { handleEngineRequest, type Deck } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";

export class HopDriver implements SQLDatabaseDriver {
  trips = 0;
  constructor(
    private readonly inner: SQLDatabaseDriver,
    private readonly hopMs: number,
  ) {}
  private hop(): Promise<void> {
    this.trips += 1;
    return this.hopMs > 0 ? new Promise((r) => setTimeout(r, this.hopMs)) : Promise.resolve();
  }
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    await this.hop();
    return this.inner.query<T>(sql, params);
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    await this.hop();
    return this.inner.batch(statements);
  }
}

/** A fetch handler over `driver`. The deck boots on the first request (its
 *  round trips are that request's), as an isolate or process boots on the
 *  first visitor; later requests reuse the booted engines. */
export function portHandler(driver: HopDriver): (request: Request) => Promise<Response> {
  let deck: Promise<Deck> | undefined;
  return async (request) => {
    const before = driver.trips;
    deck ??= (async () => {
      applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
      return (await bootEdgeServingEngines(driver)) as Deck;
    })();
    const response = await handleEngineRequest(request, await deck, { anonymous: true });
    const marked = new Response(response.body, response);
    marked.headers.set("X-Decko-Db-Trips", String(driver.trips - before));
    return marked;
  };
}
