// deploy/bunny-worker-src/bunny-edge-files.ts — the Bunny edge's file storage
// and its periodic sweep: the counterparts of the Cloudflare deploy's R2
// bucket (FILES) and its cron-plus-queue delayed work (worker.ts).
//
// FILES. A Bunny Storage zone, reached over its HTTP API through
// BunnyStorageBlobDriver (src/blob/bunny-storage.ts), under the same
// BlobAttachmentStore the Cloudflare and Node hosts use. Uploads, image
// renditions and the stylesheet a saved style card compiles all land there;
// GET/HEAD /files/... is served back from it through the shared route module
// (src/server/file-routes.ts), gated per request by the card's read rule.
// The script reads the zone from three variables:
//
//   DECKO_STORAGE_ZONE      the storage zone name
//   DECKO_STORAGE_PASSWORD  the zone's password (sent as AccessKey; a secret)
//   DECKO_STORAGE_HOST      the zone's region endpoint host
//                           (default storage.bunnycdn.com, the Falkenstein one)
//
// Zone and password are a pair: both set arms storage, neither leaves it off
// (uploads then fail with the engine's named rejection, as on a Cloudflare
// deploy with no bucket bound), and exactly one set is a configuration error.
//
// SWEEP. Bunny Edge Scripting has no cron trigger and no queue, so the sweep
// the Cloudflare deploy enqueues daily (src/server/edge-delayed-work.ts) runs
// here on a request instead: the first write-surface request (any non-GET/HEAD)
// an isolate serves runs it, and the isolate then waits a day before the next.
// Reads never run it, so an anonymous page view's path is unchanged. The work
// is the same message and the same function the Cloudflare queue consumer
// runs, and it is idempotent, so two isolates sweeping the same day cost one
// redundant DELETE and one listing, not a wrong result.

import { BunnyStorageBlobDriver, type FetchLike } from "../../src/blob/bunny-storage.js";
import type { BlobDriver } from "../../src/blob/driver.js";
import { BlobAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import {
  runDelayedWork,
  sweepMessage,
  type SweepOutcome,
} from "../../src/server/edge-delayed-work.js";

export const BUNNY_STORAGE_ZONE_VAR = "DECKO_STORAGE_ZONE";
export const BUNNY_STORAGE_PASSWORD_VAR = "DECKO_STORAGE_PASSWORD";
export const BUNNY_STORAGE_HOST_VAR = "DECKO_STORAGE_HOST";
export const DEFAULT_BUNNY_STORAGE_HOST = "storage.bunnycdn.com";

/** How long an isolate waits between sweeps. */
export const BUNNY_EDGE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

type EdgeEnvBag = Record<string, string | undefined>;

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** The storage zone's blob driver, or undefined when no zone is configured.
 *  Throws on a half-configured pair rather than silently running without
 *  files. */
export function bunnyEdgeFilesDriver(env: EdgeEnvBag, fetchImpl?: FetchLike): BlobDriver | undefined {
  const zone = env[BUNNY_STORAGE_ZONE_VAR];
  const password = env[BUNNY_STORAGE_PASSWORD_VAR];
  if (!present(zone) && !present(password)) return undefined;
  if (!present(zone) || !present(password)) {
    throw new Error(
      `bunny edge: file storage needs both ${BUNNY_STORAGE_ZONE_VAR} and ${BUNNY_STORAGE_PASSWORD_VAR}; ` +
        `only ${present(zone) ? BUNNY_STORAGE_ZONE_VAR : BUNNY_STORAGE_PASSWORD_VAR} is set`,
    );
  }
  const host = env[BUNNY_STORAGE_HOST_VAR];
  const endpoint = present(host) ? host : DEFAULT_BUNNY_STORAGE_HOST;
  const driver = new BunnyStorageBlobDriver({
    endpoint,
    storageZone: zone,
    accessKey: password,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
  return withDraftListing(driver, { endpoint, zone, password, fetchImpl: fetchImpl ?? ((u, i) => fetch(u, i as RequestInit) as ReturnType<FetchLike>) });
}

/** Bunny Storage lists one directory level and the driver reports files only,
 *  while upload drafts sit one level down (tmp/<card id>/<name>). The sweep
 *  lists "tmp/", so for that prefix alone this reads the directory entries off
 *  the Storage API and lists each one; every other call is the driver's. */
function withDraftListing(
  driver: BlobDriver,
  api: { endpoint: string; zone: string; password: string; fetchImpl: FetchLike },
): BlobDriver {
  const list: BlobDriver["list"] = async (prefix, options) => {
    if (prefix !== "tmp/") return driver.list(prefix, options);
    const base = /^https?:\/\//.test(api.endpoint) ? api.endpoint : `https://${api.endpoint}`;
    const res = await api.fetchImpl(`${base.replace(/\/+$/, "")}/${encodeURIComponent(api.zone)}/tmp/`, {
      method: "GET",
      headers: { AccessKey: api.password, Accept: "application/json" },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`bunny storage: listing tmp/ answered HTTP ${res.status}`);
    const rows = (await res.json()) as Array<{ ObjectName?: string; IsDirectory?: boolean }>;
    const out = await driver.list("tmp/", options);
    for (const row of rows) {
      if (row.IsDirectory === true && row.ObjectName) out.push(...(await driver.list(`tmp/${row.ObjectName}/`)));
    }
    return out;
  };
  return new Proxy(driver, {
    get(target, prop, receiver) {
      if (prop === "list") return list;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** The deck's attachment store over the storage zone, or undefined when no
 *  zone is configured. The store holds no state beyond the driver. */
export function bunnyEdgeAttachmentStore(env: EdgeEnvBag, fetchImpl?: FetchLike): BlobAttachmentStore | undefined {
  const files = bunnyEdgeFilesDriver(env, fetchImpl);
  return files === undefined ? undefined : new BlobAttachmentStore(files);
}

/** The per-isolate sweep clock: when this isolate last started a sweep. */
export class EdgeSweepClock {
  private lastStartedAt: number | undefined;

  constructor(private readonly intervalMs: number = BUNNY_EDGE_SWEEP_INTERVAL_MS) {}

  /** True (and the clock advances) when a sweep is due at `now`. */
  claim(now: Date): boolean {
    const t = now.getTime();
    if (this.lastStartedAt !== undefined && t - this.lastStartedAt < this.intervalMs) return false;
    this.lastStartedAt = t;
    return true;
  }
}

/** Run the periodic sweep when this isolate's clock says it is due. Returns
 *  the outcome, or null when no sweep ran. A failed sweep is reported and
 *  swallowed: it must never fail the request that happened to carry it, and
 *  the clock has already advanced, so it is retried a day later rather than
 *  on every request. */
export async function maybeRunEdgeSweep(
  clock: EdgeSweepClock,
  deps: { readonly driver: SQLDatabaseDriver; readonly files?: BlobDriver },
  now: Date = new Date(),
  report: (message: string) => void = (message) => console.warn(message),
): Promise<SweepOutcome | null> {
  if (!clock.claim(now)) return null;
  try {
    return await runDelayedWork(sweepMessage(now), deps);
  } catch (error) {
    report(`bunny edge: periodic sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
