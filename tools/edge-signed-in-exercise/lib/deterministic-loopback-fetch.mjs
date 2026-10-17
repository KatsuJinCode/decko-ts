// deterministic-loopback-fetch.mjs — a fetch implementation whose LOOPBACK
// http requests ride a keep-alive node:http agent instead of Node's global
// fetch dispatcher, for the local edge stack's engine fetches (db pipeline
// and object storage).
//
// WHY IT EXISTS (measured 2026-10-17, save-latency investigation): the whole-
// harness "no save exceeded 3 s of server time" check failed both nights on
// POST /update/Brandon_WilliamsCraig at ~5.5 s with db;dur≈5,020;stmt=368.
// Decomposition against the shim's own ledger: the save's pipeline POSTs
// carried only ~342 ms of SQLite execution; the other ~5.3 s was per-POST
// transport wall. Benchmarks against the same local-hrana server on the same
// machine: one 1-statement pipeline POST costs ~13-15 ms through Node's
// built-in globalThis.fetch (undici global dispatcher — and the cost is
// PROCESS-STATE-DEPENDENT: identically armed bare processes measured both
// ~14 ms and ~0.4-0.9 ms for the same request), versus ~0.4-0.7 ms through an
// explicit keep-alive agent (node:http or undici Agent) in EVERY process
// measured. The engine's BunnyDbDriver binds fetch.bind(globalThis) at
// construction (src/card/drivers/bunny-db.ts:285), so the instrument's
// transport choice silently multiplied every engine db hop by a nondete-
// rministic ~14 ms — 20-40x what the same box answers the identical request
// in. The deployed engine does not run on Node's global fetch (its host
// provides the platform fetch), so the tax is an artifact of the local
// instrument, not of the engine; pinning the loopback transport makes the
// harness's db wall measure engine work plus loopback RTT deterministically.
//
// SCOPE: only http: to a loopback hostname. Anything else — https, foreign
// hosts, Request-object inputs, stream bodies — falls back to the wrapped
// (original) fetch, so behavior outside the local stack is unchanged. The
// loopback path answers exactly the endpoints the local stack serves (the
// hrana pipeline and the object-storage mock), which never redirect and
// never compress: accept-encoding is forced to identity so a Response's
// bytes always match its headers, and a 3xx would be returned un-followed
// (none exists on those endpoints).

import { Agent, request as httpRequest } from "node:http";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** One keep-alive agent per process: connections are reused across the run's
 *  ~10^5 pipeline POSTs (measured ~0.4 ms/hop with reuse vs ~13-15 ms
 *  through the global dispatcher in a tax-afflicted process). */
const keepAliveAgent = new Agent({ keepAlive: true, maxSockets: 16 });

function normalizeHeaders(input) {
  const headers = {};
  if (input === undefined || input === null) return headers;
  if (typeof input.forEach === "function" && typeof input.entries === "function" && !(Array.isArray(input))) {
    // Headers instance (or any forEach-able header map)
    for (const [key, value] of input.entries()) headers[key] = value;
    return headers;
  }
  if (Array.isArray(input)) {
    for (const [key, value] of input) headers[key] = value;
    return headers;
  }
  return { ...input };
}

function toBodyBytes(body) {
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (Buffer.isBuffer(body) || body instanceof Uint8Array || body instanceof DataView) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return undefined; // URLSearchParams, FormData, ReadableStream, Blob: not the loopback path's job
}

/** One http:request over the keep-alive agent, answered as a web Response. */
function loopbackRequest(url, init) {
  return new Promise((resolve, reject) => {
    const headers = normalizeHeaders(init?.headers);
    headers["accept-encoding"] = "identity";
    const method = init?.method ?? "GET";
    let payload;
    if (!["GET", "HEAD"].includes(method) && init?.body !== undefined) {
      payload = toBodyBytes(init.body);
      if (payload === undefined) {
        reject(new TypeError(`deterministic-loopback-fetch: unsupported body type ${init.body?.constructor?.name ?? typeof init?.body} for ${url.href}`));
        return;
      }
    }
    const req = httpRequest(
      { protocol: url.protocol, hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method, headers, agent: keepAliveAgent },
      resolve,
    );
    req.on("error", reject);
    req.end(payload);
  }).then(async (res) => {
    const chunks = [];
    for await (const chunk of res) chunks.push(chunk);
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(res.headers)) {
      if (value === undefined) continue;
      responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
    return new Response(Buffer.concat(chunks), {
      status: res.statusCode,
      statusText: res.statusMessage ?? "",
      headers: responseHeaders,
    });
  });
}

/**
 * Wraps a fetch so loopback http requests take the deterministic transport
 * and everything else takes `fallback` unchanged.
 * @param {{ fallback: typeof fetch }} options
 * @returns {typeof fetch}
 */
export function createDeterministicLoopbackFetch({ fallback }) {
  return async function deterministicLoopbackFetch(input, init) {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : undefined;
    const handled =
      url !== undefined &&
      !(input instanceof Request) &&
      url.protocol === "http:" &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      !(init?.body instanceof ReadableStream) &&
      !(init?.body instanceof FormData);
    if (!handled) return fallback(input, init);
    return loopbackRequest(url, init);
  };
}
