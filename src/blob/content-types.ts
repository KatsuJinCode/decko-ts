// Content type for a blob key, from the key's extension.
//
// The map is the ENGINE's extension table
// (src/card/attachments/attachment-content.ts), re-used rather than
// copied. Two rules must not drift apart:
//
// - what the upload path detects when it writes a card's db_content, and
// - what the storage layer reports when a blob is read back.
//
// If they were separate tables, a card uploaded as text/css could be
// served as something else after a round trip through a blob store —
// and rendering would change. The shared conformance suite pins the
// agreement for every extension the engine stores.

import { EXTENSION_CONTENT_TYPES } from "../card/attachments/attachment-content.js";

export { EXTENSION_CONTENT_TYPES };

/** The content type for an extension (with or without the leading
 *  dot, any case), or undefined when the engine stores no type for it.
 *  undefined is a real answer: a caller must then sniff the bytes or
 *  fall back to application/octet-stream, and must never invent one. */
export function contentTypeForExtension(extension: string): string | undefined {
  if (extension.length === 0) return undefined;
  const normalized = (extension.startsWith(".") ? extension : `.${extension}`).toLowerCase();
  return EXTENSION_CONTENT_TYPES[normalized];
}