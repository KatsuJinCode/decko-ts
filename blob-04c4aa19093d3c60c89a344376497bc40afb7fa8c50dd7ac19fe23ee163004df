// The multipart/form-data parser for the write surface: the parse happens
// over raw request bytes, at the layer before any card params exist.
//
// The wire format's rules this parser implements:
//   - The boundary comes off the Content-Type header as the first
//     `boundary` parameter, read through its closing quote, `;` or `,`.
//   - Each part is `--<boundary>` CRLF, a MIME head ending at CRLFCRLF,
//     then the body up to the CRLF that precedes the next delimiter.
//   - The part NAME rides Content-Disposition's `name=` token, dequoted.
//   - A FILENAME attribute makes the part a file part, and only its
//     BASENAME is kept — `filename.split(/[\/\\]/).last`, so a client that
//     sends a full path cannot smuggle one through.
//   - A part with filename == "" contributes NOTHING — that is the
//     browser's no-file-chosen file input.
//   - A part with no filename is a text part, decoded as UTF-8.
//   - Malformed bodies (no boundary, unterminated final part) throw
//     Error("bad content body"), which is a 500 class, not a card
//     validation: a body that does not parse says nothing about the card.
//
// File bodies stay BYTE-EXACT (offsets are computed in a binary string
// view where 1 char == 1 byte); text parts are decoded as UTF-8, lossy on
// invalid bytes, a difference unobservable through the blank?/save surface.
//
// The ORDERED part list is the return value. Duplicate keys are NOT
// collapsed here: last-wins belongs to the consumer walking the list, so
// the file_chooser form's hidden card[file]="" is overwritten by the file
// part that preceded it whenever a file was chosen.

/** One parsed file part: the part name, the client filename's basename, the
 *  declared content type, and the bytes. */
export interface MultipartFilePart {
  kind: "file";
  /** The Content-Disposition name (e.g. "card[file]"). */
  name: string;
  /** The client filename's basename. */
  filename: string;
  /** The part's declared Content-Type, or null when the head carries
   *  none — it is passed through untyped, for the upload-type detection
   *  chain downstream. */
  contentType: string | null;
  bytes: Uint8Array;
}

/** One parsed text part: a UTF-8 string body. */
export interface MultipartTextPart {
  kind: "text";
  name: string;
  value: string;
}

export type MultipartPart = MultipartFilePart | MultipartTextPart;

/** The fallback name a part with no name attribute gets:
 *  `filename || "#{content_type || 'text/plain'}[]"`. The deck's forms
 *  always name their parts; the fallback exists for malformed-but-parseable
 *  bodies. */
const TEXT_PLAIN = "text/plain";

/** Parse one multipart/form-data body into its ordered parts. Throws
 *  Error("bad content body") when the body does not parse — the caller
 *  surfaces that as the 500 class it is, never as a card validation. */
export function parseMultipartForm(body: Uint8Array, contentTypeHeader: string): MultipartPart[] {
  const boundary = boundaryOf(contentTypeHeader);
  if (boundary === null || boundary === "") {
    throw new Error("bad content body");
  }
  // The binary string view: latin1 maps 1 char to 1 byte, so string
  // offsets ARE byte offsets (file bytes slice exact; text parts
  // re-decode from the byte range).
  const text = Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("latin1");
  const delimiter = `--${boundary}`;
  const parts: MultipartPart[] = [];

  // Everything before the first boundary delimiter is preamble.
  let pos = text.indexOf(delimiter);
  if (pos === -1) throw new Error("bad content body");
  pos += delimiter.length;

  while (true) {
    if (text.startsWith("--", pos)) break; // the closing `--boundary--`
    if (text.startsWith("\r\n", pos)) pos += 2;
    const headEnd = text.indexOf("\r\n\r\n", pos);
    if (headEnd === -1) throw new Error("bad content body");
    const head = text.slice(pos, headEnd);
    const bodyStart = headEnd + 4;
    const nextBoundary = text.indexOf(`\r\n${delimiter}`, bodyStart);
    if (nextBoundary === -1) throw new Error("bad content body");
    const bodyEnd = nextBoundary;
    pos = nextBoundary + 2 + delimiter.length;

    const name = dispositionName(head);
    const filename = dispositionFilename(head);
    const contentType = headContentType(head);
    // The part's name falls back to its filename, then to the
    // content-type array form.
    const partName = name !== undefined && name !== "" ? name : (filename ?? `${contentType ?? TEXT_PLAIN}[]`);

    if (filename !== undefined) {
      if (filename === "") continue; // no file chosen
      parts.push({
        kind: "file",
        name: partName,
        filename: basenameOfClientPath(filename),
        contentType,
        bytes: body.slice(bodyStart, bodyEnd),
      });
    } else {
      parts.push({
        kind: "text",
        name: partName,
        value: new TextDecoder("utf-8").decode(body.slice(bodyStart, bodyEnd)),
      });
    }
  }
  return parts;
}

/** The first `boundary` parameter of the content type, read through its
 *  closing quote / `;` / `,`. */
function boundaryOf(contentTypeHeader: string): string | null {
  const match = /multipart\/.*?boundary\s*="?([^";,]+)"?/i.exec(contentTypeHeader);
  return match === null ? null : match[1];
}

/** The part's name: the `name=` token on the disposition line, or its
 *  double-quoted string form. */
function dispositionName(head: string): string | undefined {
  const match =
    /Content-Disposition:[^:]*;\s*name=("(?:\\"|[^"])*"|[^\s()<>,;:\\"/[\]?=]+)/i.exec(head);
  if (match === null) return undefined;
  return dequote(match[1]);
}

/** The part's filename: the `filename=` token or its quoted string on the
 *  disposition line. Surrounding quotes are stripped and `\"` unescaped,
 *  but only when the value carries no other backslash escape — a Windows
 *  path like C:\dir\f.txt must survive intact. */
function dispositionFilename(head: string): string | undefined {
  const match =
    /Content-Disposition:\s*[^\s()<>,;:\\"/[\]?=]+\s*.*;\s*filename=("(?:\\"|[^"])*"|[^\s()<>,;:\\"/[\]?=]+)/i.exec(
      head,
    );
  if (match === null) return undefined;
  let filename = dequote(match[1]);
  if (!/\\[^\\"]/.test(filename)) {
    filename = filename.replace(/\\(.)/g, "$1");
  }
  return filename;
}

/** Strip one pair of surrounding quotes, unescape backslash escapes
 *  inside them. */
function dequote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

/** The part head's Content-Type line, when present. */
function headContentType(head: string): string | null {
  const match = /Content-Type: (.*)\r\n/i.exec(head.endsWith("\r\n") ? head : `${head}\r\n`);
  return match === null ? null : match[1].trim();
}

/** The client path's basename — Windows backslash paths and Unix paths both
 *  reduce to the final segment. */
function basenameOfClientPath(filename: string): string {
  const segments = filename.split(/[/\\]/);
  return segments[segments.length - 1];
}
