// Type declarations for tools/shadow/isolated-write-upstream.mjs.

import type { WriteRouteRequest, WriteRouteResponse } from "../../src/server/write-routes.js";

export declare const ISOLATION_PATH: string;

export declare function snapshotDeck(primaryDbPath: string, copyPath: string): void;

export interface IsolatedWriteUpstream {
  url: string;
  /** The deck copy writes land in; removed by close(). */
  copyPath: string;
  close(): Promise<void>;
}

export declare function startIsolatedWriteUpstream(opts: {
  primaryDbPath: string;
  createHandler: (paths: { dbPath: string; filesDir: string }) => Promise<{
    handle(req: WriteRouteRequest): Promise<WriteRouteResponse | null>;
    close(): void;
  }>;
  port?: number;
  host?: string;
}): Promise<IsolatedWriteUpstream>;
