// The status a saved page in the edge render cache answers with.

/** The status a saved page answers with, read from a `decko-status=NNN` parameter on
 *  its stored content type, and the content type without that parameter. A stored
 *  content type without the parameter answers 200, as every saved page did before. */
export function savedStatus(storedContentType: string): { status: number; contentType: string } {
  const match = /;\s*decko-status=(\d{3})/.exec(storedContentType);
  if (match === null) return { status: 200, contentType: storedContentType };
  return { status: Number(match[1]), contentType: storedContentType.replace(match[0], "") };
}
