// Shared HTTP test bridge for the write-routes suites
// (tests/server/write-routes*.test.ts): the one implementation of the
// localhost HTTP server that feeds requests to handleWriteRequest, plus
// the siteverify stub and the card_acts counter the recaptcha suites
// share. A route-contract change (the handleWriteRequest request/response
// shape) lands here instead of in six copies.
//
// Read-surface variants, per suite (opts.get):
//   "render-open"  GET .json -> record; GET else -> render(:open); else write
//   "record-404"   GET .json -> record; GET else -> 404; else write
//   "not-found"    GET -> bare 404; else write (opts.bodyBytes forwards the
//                  byte-preserving body alongside the utf8 string)
//   With opts.get omitted there is no read surface: every request, whatever
//   the method, goes to handleWriteRequest.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { DeckoName } from "../../src/card/name.js";
import {
  handleWriteRequest,
  type WriteRouteContext,
} from "../../src/server/write-routes.js";
import type { RenderTestStorage } from "../card/render/render-test-storage.js";

export interface BridgeServer {
  server: http.Server;
  url: string;
}

export type BridgeReadSurface = "render-open" | "record-404" | "not-found";

export async function makeWriteRouteServer(
  s: RenderTestStorage,
  context: WriteRouteContext,
  opts: { get?: BridgeReadSurface; bodyBytes?: boolean } = {},
): Promise<BridgeServer> {
  const readSurface = opts.get;
  const bridge = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const body = raw.toString("utf8");
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    let response: { status: number; headers: Record<string, string>; body: string };
    if (req.method === "GET" && readSurface !== undefined) {
      if (readSurface === "not-found") {
        response = { status: 404, headers: {}, body: "not found" };
      } else if (pathname.endsWith(".json")) {
        const name = decodeURIComponent(pathname.slice(1, -".json".length)).replace(/_/g, " ");
        const record = await s.fetcher.fetchByKey(DeckoName.parse(name).key);
        response = {
          status: record === undefined ? 404 : 200,
          headers: { "Content-Type": "application/json" },
          body:
            record === undefined
              ? JSON.stringify({ error: "not found" })
              : JSON.stringify({ name, dbContent: record.dbContent ?? null }),
        };
      } else if (readSurface === "render-open") {
        const name = decodeURIComponent(pathname.slice(1)).replace(/_/g, " ");
        try {
          const html = await s.engine.render(name, "open");
          response = { status: 200, headers: { "Content-Type": "text/html" }, body: html };
        } catch {
          response = { status: 404, headers: { "Content-Type": "text/html" }, body: "not found" };
        }
      } else {
        response = { status: 404, headers: { "Content-Type": "text/html" }, body: "not found" };
      }
    } else {
      const writeResponse = await handleWriteRequest(context, {
        method: req.method ?? "GET",
        pathname,
        host: req.headers.host,
        headers: req.headers as Record<string, string | undefined>,
        body,
        // The byte-preserving body (the staging server's transport):
        // multipart bodies carry binary payloads a utf8 string corrupts.
        ...(opts.bodyBytes ? { bodyBytes: new Uint8Array(raw) } : {}),
      });
      response = writeResponse ?? { status: 405, headers: {}, body: "method not allowed" };
    }
    res.writeHead(response.status, response.headers).end(response.body);
  });
  await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  const address = bridge.address() as AddressInfo;
  return { server: bridge, url: `http://127.0.0.1:${address.port}` };
}

export interface SiteverifyStub {
  verify: (url: string, query: { secret: string; response: string }) => Promise<string>;
  calls: Array<{ url: string; query: { secret: string; response: string } }>;
}

/** The siteverify stub: records each siteverify query and returns the
 *  canned body. */
export function stubVerify(body: unknown): SiteverifyStub {
  const calls: Array<{ url: string; query: { secret: string; response: string } }> = [];
  return {
    calls,
    verify: async (url, query) => {
      calls.push({ url, query });
      return JSON.stringify(body);
    },
  };
}

/** card_acts rows touching one card key. */
export async function actCount(storage: RenderTestStorage, key: string): Promise<number> {
  const acts = await storage.counting.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card_acts a
     JOIN card_actions act ON act.card_act_id = a.id
     JOIN cards c ON c.id = act.card_id WHERE c.key = ?`,
    [key],
  );
  return Number(acts.rows[0]?.n ?? 0);
}
