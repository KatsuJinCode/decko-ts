/** The stock Rails defaults measured on the canonical Ruby HTTP host.
 * Explicit route policy wins; cache, cookie and transport headers are not
 * part of this repair. No platform or Node APIs are required. */
import { ORACLE_SECURITY_RESPONSE_HEADERS } from './oracle-security-response-headers.js';
export const STOCK_RESPONSE_SECURITY_HEADERS = ORACLE_SECURITY_RESPONSE_HEADERS;

export function withStockResponseSecurity(response: Response): Response {
  // Opaque/error responses and platform upgrade responses are not ordinary
  // HTTP responses that can be reconstructed by the standard constructor.
  if (response.status < 200) return response;
  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of Object.entries(STOCK_RESPONSE_SECURITY_HEADERS)) {
    if (headers.has(name)) continue;
    headers.set(name, value);
    changed = true;
  }
  return changed ? new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  }) : response;
}
