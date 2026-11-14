// Preload (`node --import`) that refuses every outbound connection to a host
// other than this machine. The deploy-button rehearsal loads it into every
// Node process wrangler starts, so a rehearsal cannot reach Cloudflare, npm
// or anything else even if a tool tries to.
//
// Each refused attempt is appended, one host per line, to the file named by
// DECKO_NETWORK_BLOCK_LOG (when set), so the rehearsal can report what was
// attempted.

import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
const blockLog = process.env.DECKO_NETWORK_BLOCK_LOG;

function isLocal(host) {
  if (host === undefined || host === null || host === "") return true;
  const h = String(host).toLowerCase();
  return LOCAL.has(h) || h.endsWith(".localhost");
}

function refuse(kind, host) {
  if (blockLog) {
    try {
      appendFileSync(blockLog, `${kind} ${host}\n`);
    } catch {
      // the log is evidence only; a failed append must not let the call through
    }
  }
  const error = new Error(`external network refused by the rehearsal guard: ${kind} ${host}`);
  error.code = "ECONNREFUSED";
  return error;
}

function hostOf(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === "object") return first.path ? "localhost" : first.host;
  if (typeof first === "string" && !/^\d+$/.test(first)) return "localhost"; // a pipe path
  return typeof args[1] === "string" ? args[1] : undefined;
}

const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const host = hostOf(args);
  if (!isLocal(host)) {
    const error = refuse("tcp", host);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return socketConnect.apply(this, args);
};

const tlsConnect = tls.connect;
tls.connect = function connect(...args) {
  const host = hostOf(args) ?? (args[0] && typeof args[0] === "object" ? args[0].servername : undefined);
  if (!isLocal(host)) throw refuse("tls", host);
  return tlsConnect.apply(this, args);
};

if (typeof globalThis.fetch === "function") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (!isLocal(url.hostname)) return Promise.reject(refuse("fetch", url.hostname));
    return realFetch(input, init);
  };
}

syncBuiltinESMExports();
