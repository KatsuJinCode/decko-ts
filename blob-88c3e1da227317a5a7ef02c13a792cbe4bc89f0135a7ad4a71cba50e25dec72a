// Same-origin check for every request that changes state: card create,
// update and delete, sign-in and sign-out, the account password and reset
// forms, and first-run setup (docs/SECURITY.md, "Cross-site requests").
//
// SECURITY DIVERGENCE FROM RUBY. Ruby Decko 0.20.0 arms no forgery
// protection: no protect_from_forgery call exists in decko or card, so a page
// on another site can submit a form that signs a visitor in or edits a card
// with the visitor's session. The session cookie's SameSite=Lax stops a
// cross-site POST from carrying the cookie in current browsers, but not a
// same-site one (a sibling subdomain) and not a login form (no cookie is
// needed to sign someone in to an attacker's account).
//
// The rule follows the OWASP CSRF Prevention Cheat Sheet's origin
// verification, which needs no token and so changes no page bytes:
//   1. Sec-Fetch-Site, when the browser sends it: "same-origin" and "none"
//      (typed in the address bar, a bookmark) pass; "same-site" and
//      "cross-site" are refused.
//   2. Otherwise Origin: it must name this deck's own host, or one of the
//      configured trusted origins; "null" is refused.
//   3. Otherwise Referer, compared the same way.
//   4. With none of the three the request did not come from a browser page
//      (every current browser sends Origin on a cross-origin POST), so it
//      passes: API clients and scripts keep working.
//
// Hosts compare by authority (host and port), not scheme, because a
// TLS-terminating proxy can make the scheme the server sees differ from the
// browser's; the scheme is compared only for configured trusted origins.
//
// Configuration (environment, or the host's settings bag):
//   DECKO_ORIGIN_CHECK=off           disables the check (Ruby's behaviour)
//   DECKO_TRUSTED_ORIGINS=https://a.example,https://b.example
//                                    other origins allowed to post here

export interface OriginPolicy {
  enabled: boolean;
  /** Full origins (scheme://host[:port]), lower-cased. */
  trustedOrigins: string[];
}

export interface OriginEnv {
  readonly DECKO_ORIGIN_CHECK?: unknown;
  readonly DECKO_TRUSTED_ORIGINS?: unknown;
}

export interface OriginRequest {
  headers: Record<string, string | undefined>;
  /** The Host header the server received. */
  host: string | undefined;
}

export type OriginVerdict = { ok: true } | { ok: false; reason: string };

function normalizeOrigin(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function originPolicyFromEnv(env: OriginEnv | undefined): OriginPolicy {
  const check = typeof env?.DECKO_ORIGIN_CHECK === "string" ? env.DECKO_ORIGIN_CHECK.trim().toLowerCase() : "";
  if (check !== "" && check !== "on" && check !== "off") {
    throw new Error(`DECKO_ORIGIN_CHECK must be "on" or "off", got ${JSON.stringify(env?.DECKO_ORIGIN_CHECK)}`);
  }
  const listed = typeof env?.DECKO_TRUSTED_ORIGINS === "string" ? env.DECKO_TRUSTED_ORIGINS : "";
  const trustedOrigins: string[] = [];
  for (const raw of listed.split(",").map((s) => s.trim()).filter(Boolean)) {
    const origin = normalizeOrigin(raw);
    if (origin === null) throw new Error(`DECKO_TRUSTED_ORIGINS: not an http(s) origin: ${JSON.stringify(raw)}`);
    trustedOrigins.push(origin);
  }
  return { enabled: check !== "off", trustedOrigins };
}

/** The policy from process.env when the runtime has one, else the default
 *  (enabled, no extra origins). */
export function defaultOriginPolicy(): OriginPolicy {
  const proc = (globalThis as { process?: { env?: OriginEnv } }).process;
  return originPolicyFromEnv(proc?.env);
}

function authority(host: string): string {
  const h = host.trim().toLowerCase();
  // Default ports are implicit in an Origin header.
  return h.replace(/:(80|443)$/, "");
}

function sameDeck(candidate: string, req: OriginRequest, policy: OriginPolicy): boolean {
  const origin = normalizeOrigin(candidate);
  if (origin === null) return false;
  if (policy.trustedOrigins.includes(origin)) return true;
  if (req.host === undefined || req.host === "") return false;
  return authority(new URL(origin).host) === authority(req.host);
}

/** Decide whether a state-changing request may proceed. */
export function checkRequestOrigin(req: OriginRequest, policy: OriginPolicy = defaultOriginPolicy()): OriginVerdict {
  if (!policy.enabled) return { ok: true };
  const origin = req.headers["origin"];
  const site = req.headers["sec-fetch-site"]?.trim().toLowerCase();
  if (site === "same-site" || site === "cross-site") {
    // A trusted origin may legitimately be another site.
    if (origin !== undefined && origin !== "null" && sameDeck(origin, req, policy)) return { ok: true };
    return { ok: false, reason: `the browser reports a ${site} request` };
  }
  if (origin !== undefined && origin !== "") {
    if (origin.trim().toLowerCase() === "null") return { ok: false, reason: "the request has an opaque (null) origin" };
    return sameDeck(origin, req, policy) ? { ok: true } : { ok: false, reason: `the request comes from ${origin}` };
  }
  const referer = req.headers["referer"];
  if (referer !== undefined && referer !== "") {
    return sameDeck(referer, req, policy) ? { ok: true } : { ok: false, reason: "the request's referring page is on another site" };
  }
  return { ok: true };
}

export const CROSS_ORIGIN_MESSAGE =
  "This request was refused because it came from another site. If you submitted a form on this deck, reload the page and try again.";
