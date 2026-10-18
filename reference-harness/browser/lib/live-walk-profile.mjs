// live-walk-profile.mjs — the host-override engine profile and its write
// modes, shared by the two journey runners that can be pointed at a running
// engine instead of booting one:
//
//   - reference-harness/browser/run-exhaustive.mjs (the enumeration runner)
//   - tools/edge-signed-in-exercise.mjs            (the whole harness)
//
// A LIVE-WALK PROFILE is three decisions taken once per run, from argv and
// environment:
//
//   target   --base-url <url> | env DECKO_LIVE_BASE
//             Attach the journeys to a RUNNING engine at this base URL
//             instead of booting one (engine profile
//             reference-harness/browser/engines/live.json, mode
//             "host-override"). Absent -> the runner boots its own engine
//             locally, exactly as before; every flag below then reads "full".
//   mode     --write-mode read-only|scratch-allowlist|full | env HARNESS_WRITE_MODE
//             Default: read-only when a target override is present (fail-safe:
//             pointing at a host you did not stage never writes until the
//             operator says so), full for a locally booted engine.
//   allowlist --scratch-allowlist <file> | env HARNESS_SCRATCH_ALLOWLIST
//             Required by scratch-allowlist mode. Read AT RUN TIME, one
//             operator-approved scratch-name prefix per line ("Harness_*"),
//             "#" comments. ABSENT or empty file -> no approved prefixes ->
//             every write is skipped (fail-safe), and the run record says so.
//
// Write modes (what "a write-path action" means here: the engine's own write
// route table, src/server/write-routes.ts matchRoute):
//
//   full              Local boot default. Writes run, as they always have.
//   read-only         Every write-path action is SKIPPED: card create, update
//                     (including the GET /update/<mark> first-class write
//                     route and the POST / single-segment create), delete,
//                     upload (any multipart body), and mail-sending posts.
//                     Only read journeys are graded. Session operations stay
//                     permitted in every mode (sign-in POST /update/*signin,
//                     sign-out GET /_signout, DELETE /delete/*signin): they
//                     create no card, change no card, send no mail, and are
//                     how read journeys authenticate.
//   scratch-allowlist The same write table, but a write is admitted only when
//                     the card it targets carries an approved scratch prefix
//                     ("Harness_*"). The target name comes from the route mark
//                     or the posted card[name]; the ~<id> marks carry no name
//                     and are never admitted. Anything else is skipped.
//
// The gate is TWO layers, because a browser context's request filter does not
// see every channel (measured: Playwright context.route intercepts page form
// posts and page fetch calls, but context.request — the APIRequestContext —
// bypasses routing entirely):
//
//   1. installWriteGateRoute(context, profile) — a context.route handler,
//      registered LAST so it runs FIRST, that classifies every request
//      against the write table and aborts ("blockedbyclient") any write the
//      mode does not admit. This is the backstop: no page-driven write can
//      reach the target past it, whatever the calling check forgot to gate.
//   2. guardedRequest(context.request, profile) — a wrapper for the
//      APIRequestContext channel (which routes never see), refusing before
//      the request is issued, with a WriteSkippedError the runners record as
//      a skip rather than a failure.
//
// Check-level gating uses assertCardWrite(), which throws WriteSkippedError
// for a named card the mode does not admit; the runners' attempt wrappers
// turn that error into a "skipped" receipt line, never a FAIL.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const WRITE_MODES = ["read-only", "scratch-allowlist", "full"];

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Session endpoints stay permitted in every write mode: they change no card
 *  and send no mail; they are how signed-in read journeys authenticate. */
const SESSION_MARKS = new Set(["*signin", "signin", "*account", "account"]);

export class WriteSkippedError extends Error {
  constructor(reason, detail = {}) {
    super(`write skipped by live-walk mode: ${reason}`);
    this.name = "WriteSkippedError";
    this.writeSkipped = true;
    this.reason = reason;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- allowlist

/** Reads the operator-approved scratch-prefix file at run time. ABSENT (or
 *  unreadable, or empty) means NO approved prefixes: scratch-allowlist mode
 *  then skips every write, by design. */
export function readScratchAllowlist(filePath) {
  if (!filePath) return { configured: false, present: false, path: null, sha256: null, prefixes: [], note: "no allowlist path configured; scratch-allowlist mode would skip every write" };
  if (!existsSync(filePath)) return { configured: true, present: false, path: filePath, sha256: null, prefixes: [], note: "allowlist file ABSENT at run time; fail-safe: every write skipped" };
  let bytes;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    return { configured: true, present: false, path: filePath, sha256: null, prefixes: [], note: `allowlist file unreadable (${String(error?.message ?? error)}); fail-safe: every write skipped` };
  }
  const prefixes = bytes.toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  return {
    configured: true,
    present: true,
    path: filePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    prefixes,
    note: prefixes.length === 0 ? "allowlist file present but empty; fail-safe: every write skipped" : null,
  };
}

/** Decko card names reach the gate either as the typed name ("Harness_Admin")
 *  or as a URL mark, whose underscores stand for spaces and whose space form
 *  is all markToName preserves ("Harness exhaustive save timing x"). A prefix
 *  written "Harness_*" must match both spellings, so every spelling is
 *  derived in both directions. */
function nameSpellings(name) {
  const raw = String(name ?? "");
  return [...new Set([raw, raw.replace(/_/g, " "), raw.replace(/ /g, "_")])].filter(Boolean);
}

function prefixMatches(prefix, name) {
  const p = String(prefix ?? "");
  if (!p) return false;
  for (const n of nameSpellings(name)) {
    if (p.endsWith("*")) {
      if (n.startsWith(p.slice(0, -1))) return true;
    } else if (n === p) return true;
  }
  return false;
}

/** The approved prefix a card name carries, or null when none matches. */
export function scratchPrefixFor(allowlist, name) {
  for (const prefix of allowlist?.prefixes ?? []) {
    if (prefixMatches(prefix, name)) return prefix;
  }
  return null;
}

// ------------------------------------------------------------- profile info

function isLoopback(hostname) {
  return LOCAL_HOSTS.has(hostname);
}

/**
 * Resolves the live-walk profile for one run.
 * @param {object} opts
 * @param {Record<string,string>} opts.args   parsed --flag value pairs (absent flags undefined)
 * @param {Record<string,string|undefined>} opts.env
 * @param {{mode?: string, name?: string}} opts.engine  the LOADED engine manifest
 */
export function resolveLiveWalkProfile({ args, env = process.env, engine }) {
  const baseUrlArg = args["base-url"] ?? env.DECKO_LIVE_BASE ?? null;
  const engineIsOverride = engine?.mode === "host-override";
  const engineIsBoot = typeof engine?.command !== "undefined";

  let baseUrl = baseUrlArg;
  if (!baseUrl && engineIsOverride) {
    throw new Error(
      `engine profile "${engine.name}" declares mode "host-override" and boots nothing: give --base-url <url> (or DECKO_LIVE_BASE) naming the running engine to attach to`,
    );
  }
  if (baseUrl && engineIsBoot) {
    throw new Error(
      `--base-url / DECKO_LIVE_BASE cannot ride engine profile "${engine.name}": that manifest boots its own engine. Use the host-override profile (reference-harness/browser/engines/live.json) when attaching to a running engine`,
    );
  }

  const modeArg = args["write-mode"] ?? env.HARNESS_WRITE_MODE ?? null;
  let mode = modeArg;
  let modeSource = modeArg ? (args["write-mode"] ? "--write-mode" : "env HARNESS_WRITE_MODE") : null;
  if (mode === null) {
    mode = baseUrl ? "read-only" : "full";
    modeSource = baseUrl ? "default: read-only for a host-override target (fail-safe)" : "default: full for a locally booted engine";
  }
  if (!WRITE_MODES.includes(mode)) {
    throw new Error(`--write-mode must be one of ${WRITE_MODES.join(", ")} (got: ${JSON.stringify(mode)})`);
  }
  if (mode !== "full" && !baseUrl) {
    throw new Error(`--write-mode ${mode} needs a target: pass --base-url <url> (a locally booted engine always runs full — it stages a throwaway deck copy)`);
  }

  let origin = null;
  let host = null;
  if (baseUrl) {
    let url;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error(`--base-url is not a URL: ${JSON.stringify(baseUrl)}`);
    }
    if (url.username || url.password) throw new Error("--base-url must not carry credentials in the URL");
    if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
      throw new Error(`refusing a cleartext (http) target off loopback: ${url.hostname}. Loopback may be http; any other host must be https`);
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      throw Error(`--base-url must be an origin (path "/" or empty); the journeys append absolute paths (got path: ${url.pathname})`);
    }
    baseUrl = url.origin;
    origin = url.origin;
    host = url.host;
  }

  const allowlistPath = args["scratch-allowlist"] ?? env.HARNESS_SCRATCH_ALLOWLIST ?? null;
  if (mode === "scratch-allowlist" && !allowlistPath) {
    throw new Error("scratch-allowlist mode needs --scratch-allowlist <file> (or HARNESS_SCRATCH_ALLOWLIST). Without the file the mode would skip every write; say read-only instead, or name the file");
  }
  const scratch = readScratchAllowlist(allowlistPath);

  return {
    override: Boolean(baseUrl),
    baseUrl,
    origin,
    host,
    mode,
    modeSource,
    scratch,
    engineName: engine?.name ?? null,
    /** Every mode permits session operations (sign-in/out); recorded so the
     *  run report says exactly what still authenticates. */
    sessionOpsAllowed: true,
  };
}

/** The provenance block both runners embed, so every run report names the
 *  host it drove and the write mode it ran under. */
export function targetProvenance(profile) {
  if (!profile.override) {
    return {
      host: "loopback, booted by this run (port assigned at boot; see run-meta server.base)",
      baseUrl: null,
      mode: "full",
      modeSource: profile.modeSource,
      sessionOpsAllowed: true,
      scratchAllowlist: null,
    };
  }
  return {
    host: profile.host,
    baseUrl: profile.baseUrl,
    mode: profile.mode,
    modeSource: profile.modeSource,
    sessionOpsAllowed: profile.sessionOpsAllowed,
    scratchAllowlist: profile.mode === "scratch-allowlist" ? profile.scratch : null,
  };
}

// ------------------------------------------------------------- write decide

/** The decision for one write against the profile. `cardName` null (an unnamed
 *  or ~<id> target) is admitted in full mode only. */
export function decideWrite(profile, { verb, cardName, detail }) {
  if (profile.mode === "full") return { allowed: true, reason: "full mode (locally booted engine)" };
  // Session marks stay permitted in every mode (see module header).
  for (const name of nameSpellings(cardName ?? "")) {
    if (SESSION_MARKS.has(name)) return { allowed: true, reason: `session operation on ${cardName} (permitted in every mode)` };
  }
  if (profile.mode === "read-only") {
    return { allowed: false, reason: `read-only mode skips every write-path action (${verb}${cardName ? ` on ${cardName}` : ""})` };
  }
  // scratch-allowlist: an unnamed or ~<id> target is never admitted.
  if (!cardName) {
    return { allowed: false, reason: `scratch-allowlist mode could not name the write's target card (${verb} ${detail ?? ""}); unnamed writes are never admitted` };
  }
  const prefix = scratchPrefixFor(profile.scratch, cardName);
  if (prefix === null) {
    return {
      allowed: false,
      reason: profile.scratch.present
        ? `scratch-allowlist mode: ${cardName} carries no approved scratch prefix (${(profile.scratch.prefixes ?? []).join(", ") || "none approved"})`
        : `scratch-allowlist mode: allowlist file ABSENT at run time; every write skipped (${verb} on ${cardName})`,
    };
  }
  return { allowed: true, reason: `scratch-allowlist mode: ${cardName} carries approved prefix ${prefix}` };
}

/** Check-level gate: throws WriteSkippedError when the mode does not admit a
 *  write on `cardName`. Call at the top of a write-shaped check body, inside
 *  the runner's attempt wrapper, so the skip is recorded as a skip. */
export function assertCardWrite(profile, cardName, { verb = "update", label } = {}) {
  const decision = decideWrite(profile, { verb, cardName });
  if (!decision.allowed) throw new WriteSkippedError(decision.reason, { cardName, verb, label: label ?? null });
  return decision;
}

// ------------------------------------------------- engine write-route table

/** Marks the write routes, mirroring the engine's own table
 *  (src/server/write-routes.ts matchRoute — engine_routes.rb:27-48):
 *  POST|PATCH /card/create(/mark), POST /update/<mark>, POST|PUT|PATCH
 *  /update/<mark>, PUT|PATCH /<single-segment>, DELETE /delete/<mark>,
 *  DELETE /<single-segment>, POST / (create, name in the card hash),
 *  POST /type/<type> (create), POST /<single-segment> (create) — and the one
 *  that catches every GET-based implmentation out: GET /update/<mark> is a
 *  FIRST-CLASS WRITE route (rest.rb:14-16: the save runs from query params). */
export function classifyWriteRequest(method, url, postDataString = null) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return { write: false };
  }
  const post = method === "POST";
  const put = method === "PUT" || method === "PATCH";
  const del = method === "DELETE";
  const markName = (mark) =>
    mark === undefined || mark === null
      ? null
      : decodeURIComponent(mark.replace(/\.json$/i, "")).replace(/_/g, " ");

  // GET /update/<mark> (and /card/update/<mark>): a first-class write route.
  if (method === "GET") {
    const explicit = /^\/(?:card\/)?update(?:\/([^/]+))?$/.exec(path);
    if (explicit !== null && (path.startsWith("/card/update") || explicit[1] !== undefined)) {
      return { write: true, verb: "update", cardName: markName(explicit[1]), via: `GET ${path}` };
    }
    return { write: false };
  }
  if (!post && !put && !del) return { write: false };

  if (path === "/" || path === "") {
    if (post) return { write: true, verb: "create", cardName: postedCardName(postDataString), via: "POST /" };
    if (put) return { write: true, verb: "update", cardName: postedCardName(postDataString), via: "PUT /" };
    return { write: false };
  }

  const explicit = /^\/(card\/)?(create|update|delete)(?:\/([^/]+))?$/.exec(path);
  if (explicit !== null && (explicit[1] !== undefined || explicit[3] !== undefined)) {
    const [, prefix, verb, mark] = explicit;
    if (verb === "create" && !(post || put)) return { write: false };
    if (verb === "update" && !(post || put)) return { write: false };
    if (verb === "delete" && !del) return { write: false };
    const name = markName(mark) ?? (verb === "create" ? postedCardName(postDataString) : null);
    return { write: true, verb, cardName: name, via: `${method} ${path}` };
  }
  if (post) {
    const typed = /^\/type\/(.+)$/.exec(path);
    if (typed !== null) return { write: true, verb: "create", cardName: postedCardName(postDataString), via: `POST ${path}` };
    if (!path.slice(1).includes("/")) return { write: true, verb: "create", cardName: markName(path.slice(1)) ?? postedCardName(postDataString), via: `POST ${path}` };
    return { write: false };
  }
  if (put) {
    return path.slice(1).includes("/") ? { write: false } : { write: true, verb: "update", cardName: markName(path.slice(1)), via: `${method} ${path}` };
  }
  return path.slice(1).includes("/") ? { write: false } : { write: true, verb: "delete", cardName: markName(path.slice(1)), via: `${method} ${path}` };
}

/** The card[name] a posted form names, when the body is readable here. */
function postedCardName(postDataString) {
  if (typeof postDataString !== "string" || postDataString === "") return null;
  try {
    const params = new URLSearchParams(postDataString);
    const name = params.get("card[name]");
    return name === null ? null : name;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ the two gates

/**
 * The browser backstop: registers a context.route handler (LAST registered,
 * so it runs FIRST and defers everything it admits with route.fallback() to
 * the context's ordinary request policy). Aborts any write the mode does not
 * admit, so no page-driven create/update/delete/upload reaches the target.
 * Multipart bodies (uploads) are named through request.formData().
 * Returns { blocked: [...], uninstall } for the run record.
 */
export async function installWriteGateRoute(context, profile, { onBlocked } = {}) {
  if (!profile.override) return { blocked: null, uninstall: async () => {} };
  const blocked = [];
  const handler = async (route) => {
    const request = route.request();
    let verdict = classifyWriteRequest(request.method(), request.url(), request.postData());
    if (!verdict.write) return route.fallback();
    let decision = decideWrite(profile, verdict);
    if (!decision.allowed && verdict.cardName === null) {
      // A POST body this classifier could not read (e.g. multipart) may still
      // name its card: try the structured form view before refusing.
      try {
        const form = await request.formData();
        const name = form.get("card[name]");
        if (typeof name === "string" && name !== "") {
          verdict = { ...verdict, cardName: name };
          decision = decideWrite(profile, verdict);
        }
      } catch {
        /* not a form body; the unnamed-write refusal stands */
      }
    }
    if (decision.allowed) return route.fallback();
    blocked.push({ method: request.method(), url: request.url(), verb: verdict.verb, cardName: verdict.cardName, reason: decision.reason });
    onBlocked?.(blocked[blocked.length - 1]);
    return route.abort("blockedbyclient");
  };
  await context.route("**/*", handler);
  return {
    blocked,
    uninstall: async () => {
      await context.unroute("**/*", handler).catch(() => {});
    },
  };
}

/**
 * The APIRequestContext gate: context.request BYPASSES context.route
 * (measured: a routed-out POST via context.request still reached the server),
 * so every runner-side use of the request context rides this wrapper. A
 * refused write throws WriteSkippedError BEFORE the request is issued — the
 * callers' attempt wrappers record a skip, and no bytes leave for the target.
 */
export function guardRequest(requestContext, profile, { onBlocked } = {}) {
  if (!profile.override) return requestContext;
  const call = (method) => async (url, options = {}) => {
    const bodyString = typeof options.form === "object" && options.form !== null ? new URLSearchParams(options.form).toString() : (typeof options.data === "string" ? options.data : null);
    const verdict = classifyWriteRequest(method, url, bodyString);
    if (verdict.write) {
      const decision = decideWrite(profile, verdict);
      if (!decision.allowed) {
        const record = { method, url, verb: verdict.verb, cardName: verdict.cardName, reason: decision.reason, channel: "apirequestcontext" };
        onBlocked?.(record);
        throw new WriteSkippedError(decision.reason, record);
      }
    }
    // APIRequestContext names its senders lowercase (post/get/put/patch/
    // delete/fetch); `method` is the HTTP verb. The proof's first scratch leg
    // caught the mismatch: every guarded save answered TypeError and the
    // probes recorded null statuses.
    const send = requestContext[method.toLowerCase()];
    if (typeof send !== "function") throw new Error(`guardedRequest: request context has no sender for ${method}`);
    return send.call(requestContext, url, options);
  };
  return {
    get: call("GET"),
    fetch: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
    /** Passthroughs for the members the runners read off the raw context. */
    storageState: (...a) => requestContext.storageState(...a),
  };
}
