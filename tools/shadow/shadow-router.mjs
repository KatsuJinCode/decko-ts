// shadow-router.mjs — T5 of #1282: a parallel-routing HTTP proxy that
// forwards every client request to BOTH a Ruby upstream and a TypeScript
// upstream, returns the Ruby response to the client (shadow mode never
// affects users), and writes a JSONL comparison record to a log file.
//
// Mechanism:
//   1. Read the incoming body ONCE into a Buffer (POST-replay caveat: a
//      request stream is single-pass; both upstreams must see the same
//      bytes, so the body must be buffered before any forwarding).
//   2. Always forward to RUBY_UPSTREAM (primary, awaited).
//   3. If `shouldShadow(policy, method, url)` says so, also forward to
//      TS_UPSTREAM (shadow). The shadow result feeds only the log; an
//      error from the shadow upstream must NOT poison the user response.
//   4. Compare status, content-type, and body bytes. Append one JSONL
//      record per request to SHADOW_LOG (timestamp, method, path,
//      rubyStatus, tsStatus, rubyBytes, tsBytes, verdict same/diff/
//      skipped/ts-error, firstDiffOffset, contentTypeMatch).
//   5. Write Ruby's status + headers + body back to the client. Hop-by-
//      hop headers are stripped; content-length is recomputed by Node.
//
// Library surface (for tests + tooling):
//   loadPolicy(filePath), shouldShadow(policy, method, path),
//   compareResponses(ruby, ts), forwardOnce({ baseUrl, method, ... }),
//   appendLogEntry(logPath, entry), createProxyServer({ ... }).
//
// CLI:
//   RUBY_UPSTREAM=http://ruby:3000 TS_UPSTREAM=http://ts:3000 \
//     node tools/shadow/shadow-router.mjs
//   (listens on SHADOW_PORT, default ephemeral).

import {
  createServer,
  request as httpRequest,
} from "node:http";
import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

// ===========================================================================
// Policy
// ===========================================================================

const VALID_MODES = new Set([
  "shadow-everything",
  "shadow-allowlist",
  "shadow-blocklist",
]);

/** Parse + validate a route-policy JSON file. Throws on schema errors.
 *
 *  Schema:
 *    {
 *      "mode": "shadow-everything" | "shadow-allowlist" | "shadow-blocklist",
 *      "allowlist"?: [string, ...],     // required iff mode = shadow-allowlist
 *      "blocklist"?: [string, ...],     // required iff mode = shadow-blocklist
 *      "sampleRate": number             // 0..100, integer or float
 *    }
 *
 *  Each pattern is a simple glob: * matches any run, ? matches one char,
 *  everything else literal. Patterns are anchored at both ends so they
 *  match the full URL path (no query string — strip before matching).
 */
export function loadPolicy(filePath) {
  const raw = readFileSync(filePath, "utf8");
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    throw new Error(`policy ${filePath}: invalid JSON: ${err.message}`);
  }
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    throw new Error(`policy ${filePath}: top-level must be an object`);
  }
  if (!VALID_MODES.has(cfg.mode)) {
    throw new Error(
      `policy ${filePath}: mode must be one of ` +
        `${[...VALID_MODES].join(", ")}, got ${JSON.stringify(cfg.mode)}`,
    );
  }
  if (cfg.mode === "shadow-allowlist" && !Array.isArray(cfg.allowlist)) {
    throw new Error(
      `policy ${filePath}: shadow-allowlist requires allowlist[]`,
    );
  }
  if (cfg.mode === "shadow-blocklist" && !Array.isArray(cfg.blocklist)) {
    throw new Error(
      `policy ${filePath}: shadow-blocklist requires blocklist[]`,
    );
  }
  const sampleRate = cfg.sampleRate;
  if (
    typeof sampleRate !== "number" ||
    Number.isNaN(sampleRate) ||
    sampleRate < 0 ||
    sampleRate > 100
  ) {
    throw new Error(
      `policy ${filePath}: sampleRate must be a number in [0, 100], ` +
        `got ${JSON.stringify(sampleRate)}`,
    );
  }
  return {
    mode: cfg.mode,
    allowlist: (cfg.allowlist ?? []).map(compileGlob),
    blocklist: (cfg.blocklist ?? []).map(compileGlob),
    sampleRate,
  };
}

/** Glob → anchored RegExp. * -> .*, ? -> ., everything else literal. */
function compileGlob(pattern) {
  if (typeof pattern !== "string") {
    throw new Error(`policy: pattern must be a string, got ${typeof pattern}`);
  }
  const re =
    "^" +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") +
    "$";
  return new RegExp(re);
}

/** FNV-1a 32-bit hash. Same algorithm as tools/migrate/determinism.mjs so
 *  per-row hashing stays a single convention across the migration tools. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Decide whether a given request should be shadowed. The decision is the
 *  composition of (mode filter) AND (sample-rate). At sampleRate 100 every
 *  in-scope request is shadowed; at 0 none are. At any rate in between,
 *  the shadowed set is `{ req : fnv1a(method+" "+path) % 10000 < rate*100 }`
 *  — a fixed bucket per request — which gives a monotonic subset relation
 *  across rates: a request shadowed at rate r is also shadowed at every
 *  rate r' > r, never the reverse.
 */
export function shouldShadow(policy, method, path) {
  let inScope;
  if (policy.mode === "shadow-everything") {
    inScope = true;
  } else if (policy.mode === "shadow-allowlist") {
    inScope = policy.allowlist.some((re) => re.test(path));
  } else {
    // shadow-blocklist
    inScope = !policy.blocklist.some((re) => re.test(path));
  }
  if (!inScope) return false;
  if (policy.sampleRate >= 100) return true;
  if (policy.sampleRate <= 0) return false;
  const hash = fnv1a(`${method} ${path}`);
  return (hash % 10000) < Math.round(policy.sampleRate * 100);
}

// ===========================================================================
// Upstream forwarding
// ===========================================================================

/** HTTP/1.1 hop-by-hop headers (RFC 7230 §6.1). Stripped on both the
 *  forwarded request and the returned response. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

/** Send one request to an upstream base URL. Returns
 *  `{ status, headers, body: Buffer }`. The whole body is buffered —
 *  this skeleton does not stream
 *  the production-streaming decision. */
export function forwardOnce({ baseUrl, method, urlPath, headers, body }) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(baseUrl + urlPath);
    } catch (err) {
      reject(
        new Error(
          `bad upstream URL: ${baseUrl}${urlPath}: ${err.message}`,
        ),
      );
      return;
    }
    const fwdHeaders = {};
    let sawContentLength = false;
    for (const [k, v] of Object.entries(headers)) {
      const lk = k.toLowerCase();
      if (HOP_BY_HOP.has(lk)) continue;
      if (lk === "host") continue;
      if (lk === "content-length") {
        sawContentLength = true;
        continue;
      }
      fwdHeaders[k] = v;
    }
    if (body && body.length > 0) {
      fwdHeaders["content-length"] = String(body.length);
    } else if (sawContentLength) {
      // Caller advertised a body but supplied none; drop the header
      // rather than forward a stale length.
      delete fwdHeaders["content-length"];
    }

    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: (url.pathname || "/") + (url.search || ""),
      headers: fwdHeaders,
    };

    const req = httpRequest(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

// ===========================================================================
// Response comparison
// ===========================================================================

/** Compare two upstream responses. The verdict is "same" iff status,
 *  content-type, and body bytes match. firstDiffOffset is -1 when bodies
 *  are identical, otherwise the first byte index where they diverge. If
 *  one body is a strict prefix of the other, firstDiffOffset = min
 *  length (the truncation point). */
export function compareResponses(ruby, ts) {
  const diffs = [];
  if (ruby.status !== ts.status) {
    diffs.push({ kind: "status", ruby: ruby.status, ts: ts.status });
  }
  const rCT = String(ruby.headers["content-type"] ?? "").split(";")[0].trim();
  const tCT = String(ts.headers["content-type"] ?? "").split(";")[0].trim();
  if (rCT !== tCT) {
    diffs.push({ kind: "content-type", ruby: rCT, ts: tCT });
  }
  const min = Math.min(ruby.body.length, ts.body.length);
  let firstDiff = -1;
  for (let i = 0; i < min; i++) {
    if (ruby.body[i] !== ts.body[i]) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff === -1 && ruby.body.length !== ts.body.length) {
    firstDiff = min;
  }
  const bodyEqual = ruby.body.equals(ts.body);
  return {
    same: diffs.length === 0 && bodyEqual,
    diffs,
    firstDiffOffset: firstDiff,
    rubyBytes: ruby.body.length,
    tsBytes: ts.body.length,
    bodyEqual,
  };
}

// ===========================================================================
// Logging
// ===========================================================================

/** Append one JSONL record. Creates the log directory if missing. */
export function appendLogEntry(logPath, entry) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

// ===========================================================================
// Proxy server
// ===========================================================================

/** Build the proxy http.Server. The server returns Ruby's response to
 *  the client unchanged; it does NOT block the client on the shadow
 *  upstream — both forwards are awaited in parallel, but the client
 *  only sees Ruby's bytes once both have settled (so we don't write
 *  twice to the same socket if the shadow fails). */
export function createProxyServer({ rubyUrl, tsUrl, policy, logPath }) {
  return createServer(async (req, res) => {
    let body = Buffer.alloc(0);
    try {
      // (1) Buffer the request body once — POST-replay caveat.
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);

      // (2) Always forward to Ruby (primary).
      const rubyPromise = forwardOnce({
        baseUrl: rubyUrl,
        method: req.method,
        urlPath: req.url,
        headers: req.headers,
        body,
      });

      // (3) Shadow-forward to TS only if policy says so. Failures are
      //     captured, never thrown — they show up in the log as
      //     verdict=ts-error and the client still gets Ruby's response.
      let tsResult = null;
      let tsError = null;
      if (shouldShadow(policy, req.method, req.url)) {
        try {
          tsResult = await forwardOnce({
            baseUrl: tsUrl,
            method: req.method,
            urlPath: req.url,
            headers: req.headers,
            body,
          });
        } catch (err) {
          tsError = err;
        }
      }

      const rubyResult = await rubyPromise;

      // (4) Build + append the log record.
      const entry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        rubyStatus: rubyResult.status,
        tsStatus: tsResult?.status ?? null,
        rubyBytes: rubyResult.body.length,
        tsBytes: tsResult?.body.length ?? null,
        verdict: "skipped",
        firstDiffOffset: null,
        contentTypeMatch: null,
      };
      if (tsError) {
        entry.verdict = "ts-error";
        entry.tsError = tsError.message;
      } else if (tsResult) {
        const cmp = compareResponses(rubyResult, tsResult);
        entry.verdict = cmp.same ? "same" : "diff";
        entry.firstDiffOffset = cmp.firstDiffOffset;
        entry.contentTypeMatch = cmp.diffs.every(
          (d) => d.kind !== "content-type",
        );
        if (!cmp.same) {
          const kinds = cmp.diffs.map((d) => d.kind);
          if (!cmp.bodyEqual) kinds.push("body");
          entry.diffKinds = [...new Set(kinds)];
        }
      }
      appendLogEntry(logPath, entry);

      // (5) Write Ruby's response back. Strip hop-by-hop headers; let
      //     Node recompute content-length from the Buffer.
      const outHeaders = {};
      for (const [k, v] of Object.entries(rubyResult.headers)) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue;
        if (k.toLowerCase() === "content-length") continue;
        outHeaders[k] = v;
      }
      res.writeHead(rubyResult.status, outHeaders);
      res.end(rubyResult.body);
    } catch (err) {
      try {
        appendLogEntry(logPath, {
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.url,
          rubyStatus: null,
          tsStatus: null,
          rubyBytes: 0,
          tsBytes: 0,
          verdict: "ruby-error",
          firstDiffOffset: null,
          contentTypeMatch: null,
          error: err.message,
        });
      } catch {
        // Log-write failure must not bubble to the client.
      }
      try {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("shadow-router: upstream error");
      } catch {
        // Socket already closed.
      }
    }
  });
}

// ===========================================================================
// CLI
// ===========================================================================

function envConfig() {
  return {
    rubyUrl: process.env.RUBY_UPSTREAM,
    tsUrl: process.env.TS_UPSTREAM,
    policyPath:
      process.env.SHADOW_POLICY ?? "tools/shadow/routes.shadow.json",
    logPath: process.env.SHADOW_LOG ?? "tools/shadow/shadow.log.jsonl",
    port: Number(process.env.SHADOW_PORT ?? 0),
  };
}

function main() {
  const cfg = envConfig();
  if (!cfg.rubyUrl) {
    process.stderr.write("RUBY_UPSTREAM env var required\n");
    process.exit(2);
  }
  if (!cfg.tsUrl) {
    process.stderr.write("TS_UPSTREAM env var required\n");
    process.exit(2);
  }
  const policy = loadPolicy(cfg.policyPath);
  const server = createProxyServer({
    rubyUrl: cfg.rubyUrl,
    tsUrl: cfg.tsUrl,
    policy,
    logPath: cfg.logPath,
  });
  server.listen(cfg.port, () => {
    const addr = server.address();
    process.stderr.write(
      `shadow-router: ruby=${cfg.rubyUrl} ts=${cfg.tsUrl} ` +
        `policy=${cfg.policyPath} log=${cfg.logPath} ` +
        `listening on http://${addr.address}:${addr.port}\n`,
    );
  });
}

// Cross-platform "is main": process.argv[1] is a native path; import.meta.url
// is a file:// URL. Convert argv[1] via pathToFileURL so the comparison is
// stable on win32 (drive letters, backslashes).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
