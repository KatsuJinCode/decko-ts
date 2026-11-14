// The security response headers the STOCK Ruby Decko oracle serves on EVERY
// response — measured, not assumed: captured live from the local Ruby 3.3
// oracle (reference-harness/browser/engines/ruby33.json, decko 0.20.0 /
// card 1.110.0 over thin) on the walked pages (/, /Note_001, /*signin) AND on
// every other response class the same boot answers (the not_found 404, the
// .json record render, the /files 404) — the uniform set is Rails'
// action_dispatch.default_headers middleware behavior, not a per-route
// choice, so the port's serving hosts must add them at response-emit time,
// on every response class, exactly as the middleware does.
//
// These are the Rails 6.1-era defaults (Rails source
// actionpack/lib/action_dispatch/railtie.rb default_headers):
//   X-Frame-Options: SAMEORIGIN
//   X-XSS-Protection: 1; mode=block
//   X-Content-Type-Options: nosniff
//   X-Download-Options: noopen
//   X-Permitted-Cross-Domain-Policies: none
// plus Referrer-Policy: strict-origin-when-cross-origin (the newer default
// the oracle's Rails generation serves). The VALUES below are the oracle's
// exact bytes from the 2026-10-18 capture
// (tmp/security-header-parity-20261018/ruby.headers.json,
// ruby-ext.headers.json) — byte parity is the contract, so the set is
// pinned here rather than recomputed from any Rails version table.
//
// applyOracleSecurityResponseHeaders returns a NEW header object with each
// of these set ONLY when the response does not already carry one (header
// names compare case-insensitively): Rails' middleware also leaves an
// explicitly set header alone, and the port's attachment route
// (src/server/file-routes.ts) already sets its own X-Content-Type-Options —
// that explicit value wins, the rest of the set is added around it.

export const ORACLE_SECURITY_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Download-Options": "noopen",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "1; mode=block",
});

/** A new header record with every oracle security header that the response
 *  does not already carry. Existing headers (any casing) are never
 *  overwritten; the returned record preserves the caller's insertion order
 *  and appends the added headers after them. */
export function applyOracleSecurityResponseHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = { ...(headers ?? {}) };
  const present = new Set(Object.keys(out).map((name) => name.toLowerCase()));
  for (const [name, value] of Object.entries(ORACLE_SECURITY_RESPONSE_HEADERS)) {
    if (!present.has(name.toLowerCase())) out[name] = value;
  }
  return out;
}
