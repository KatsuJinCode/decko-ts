// The database gateway compresses with brotli unless asked otherwise, at
// about 2 s per decoded MB. The driver asks for gzip (or no encoding), and
// inflates a gzip body itself if the runtime hands it over compressed.
import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";

const answer = {
  results: [
    { type: "ok", response: { type: "execute", result: { cols: [{ name: "n" }], rows: [[{ type: "integer", value: "7" }]], affected_row_count: 0 } } },
    { type: "ok", response: { type: "close" } },
  ],
};

function driverAnswering(body: Uint8Array | string, seen: Headers[]): BunnyDbDriver {
  return new BunnyDbDriver({
    url: "https://db.test/v2/pipeline",
    authToken: "t",
    retries: 0,
    fetchImpl: (async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return new Response(body as BodyInit, { status: 200 });
    }) as typeof fetch,
  });
}

describe("bunny-db driver: response encoding", () => {
  it("asks for gzip or no encoding, never brotli", async () => {
    const seen: Headers[] = [];
    await driverAnswering(JSON.stringify(answer), seen).query("SELECT 7 AS n", []);
    expect(seen[0]!.get("accept-encoding")).toBe("gzip, identity");
  });

  it("reads a plain body and a still-compressed gzip body alike", async () => {
    const seen: Headers[] = [];
    const plain = await driverAnswering(JSON.stringify(answer), seen).query("SELECT 7 AS n", []);
    const gz = await driverAnswering(gzipSync(Buffer.from(JSON.stringify(answer))), seen).query("SELECT 7 AS n", []);
    expect(plain.rows).toEqual([{ n: 7 }]);
    expect(gz.rows).toEqual(plain.rows);
  });
});
