// The TypeScript engine as an isolated write target for the shadow router's
// isolated-write mode (tools/shadow/isolated-write-upstream.mjs).
//
// It serves the write grammar (handleWriteRequest) over a SQLite file the
// caller has already copied from the primary deck, so a replayed write lands
// only in that copy. External effects are off by construction:
//   - mail: the write path sends through the notify module's default
//     transport, which drops every message (notify/transport.ts NoopTransport);
//   - uploads: stored under the caller's scratch directory, never the deck's
//     files or a bucket;
//   - recaptcha: not configured, so the guard never calls out;
//   - network: the upstream process blocks fetch() while it serves (see the
//     upstream module).
// Node only: it opens the copy with the local SQLite driver.

import { LocalSqliteDriver } from "./drivers/local-sqlite.js";
import { FetchEngine } from "../card/fetch.js";
import { LocalAttachmentStore } from "../card/attachments/attachment-store.js";
import { handleWriteRequest, type WriteRouteRequest, type WriteRouteResponse } from "./write-routes.js";

export interface IsolatedWriteHandler {
  handle(req: WriteRouteRequest): Promise<WriteRouteResponse | null>;
  close(): void;
}

export async function createIsolatedWriteHandler(opts: {
  /** The copied deck. Never the primary. */
  dbPath: string;
  /** Scratch directory for uploaded files. */
  filesDir: string;
}): Promise<IsolatedWriteHandler> {
  const driver = new LocalSqliteDriver({ path: opts.dbPath });
  const fetcher = new FetchEngine(driver);
  const attachmentStore = new LocalAttachmentStore(opts.filesDir);
  return {
    handle: (req) => handleWriteRequest({ driver, fetcher, attachmentStore }, req),
    close: () => driver.close(),
  };
}
