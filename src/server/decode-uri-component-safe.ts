/** decodeURIComponent that returns the input unchanged when it is not a
 *  valid percent-encoding. Both HTTP route modules decode request-path
 *  segments with it (file-routes.ts, write-routes.ts): a malformed escape
 *  in a path segment must degrade to name-resolution failure downstream,
 *  not throw out of the route parser. */
export function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
