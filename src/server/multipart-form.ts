// The multipart/form-data parser for the write surface — Rack 2.2.24's
// Rack::Multipart parse semantics over the raw request bytes (the port of
// the layer Ruby runs before card params exist: Rack::Request#POST ->
// Rack::Multipart.extract_multipart).
//
// Ruby truth (rack-2.2.24, installed gem, file:line checked):
//   - The boundary comes off the Content-Type header: MULTIPART =
//     %r{\Amultipart/.*?boundary(\s*)="?([^";,]+)"}ni (rack/multipart.rb:24).
//   - Each part is `--<boundary>` CRLF, a MIME head ending at CRLFCRLF
//     (parser.rb @head_regex /(.*?\r\n)\r\n/m), then the body up to the
//     CRLF that precedes the next boundary delimiter.
//   - The part NAME rides Content-Disposition's name= token
//     (MULTIPART_CONTENT_DISPOSITION, rack/multipart.rb:31), dequoted
//     through Rack::Auth::Digest::Params::dequote (parser.rb:316-318).
//   - A FILENAME attribute makes the part a file part
//     (parser.rb:157-159 TempfilePart); the data params carry the client
//     filename's BASENAME — `fn = filename.split(/[\/\\]/).last`
//     (parser.rb:141-145, the IE full-path defense).
//   - A part with filename == "" contributes NOTHING:
//     `if filename == "" ... return` (parser.rb:131-135) — the browser's
//     no-file-chosen file input.
//   - A part with no filename is a text part; its body is a UTF-8 string
//     (tag_multipart_encoding, parser.rb:433+).
//   - Params assemble IN ORDER through Rack::Utils.normalize_params, and
//     a repeated scalar key is LAST-WINS (`params[k] = v`,
//     rack/query_parser.rb:142) — the file_chooser form's hidden
//     card[file]="" is overwritten by the file part that preceded it
//     whenever a file was chosen.
//   - Malformed bodies raise EOFError("bad content body")
//     (parser.rb:300,311) — a 500 class in Ruby, not a card validation.
//
// The port keeps the body BYTE-EXACT for file parts (offsets computed in
// a binary string view where 1 char == 1 byte) and decodes text parts as
// UTF-8 (lossy on invalid bytes — Ruby keeps invalid bytes in the string;
// the difference is unobservable through the blank?/save surface). The
// ORDERED part list is the return value: last-wins belongs to the
// consumer walking the list (the same order Rack's normalize_params
// applies).

/** One parsed file part (a Rack UploadedFile's shape: basename, declared
 *  content type, bytes). */
export interface MultipartFilePart {
  kind: "file";
  /** The Content-Disposition name (e.g. "card[file]"). */
  name: string;
  /** The client filename's basename (parser.rb:141-145). */
  filename: string;
  /** The part's declared Content-Type, or null when the head carries
   *  none (Rack passes it through untyped; CarrierWave's SanitizedFile
   *  detection chain consumes it downstream). */
  contentType: string | null;
  bytes: Uint8Array;
}

/** One parsed text part (Rack's BufferPart — a UTF-8 string body). */
export interface MultipartTextPart {
  kind: "text";
  name: string;
  value: string;
}

export type MultipartPart = MultipartFilePart | MultipartTextPart;

/** The fallback name Rack gives a part with no name attribute:
 *  `filename || "#{content_type || 'text/plain'}[]"` (parser.rb:320-322).
 *  The deck's forms always name their parts; the fallback exists for
 *  parity with malformed-but-parseable bodies. */
const TEXT_PLAIN = "text/plain";

/** Parse one multipart/form-data body into its ordered parts.
 *  Throws Error("bad content body") on the Rack EOFError paths (missing
 *  boundary / unterminated final part) — the caller surfaces it as the
 *  500 class Ruby's EOFError takes, never as a card validation. */
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

  // FAST_FORWARD: everything before the first boundary delimiter is
  // preamble (parser.rb:284-299).
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
    // parser.rb:320-322: name falls back to filename or the content-type
    // array form.
    const partName = name !== undefined && name !== "" ? name : (filename ?? `${contentType ?? TEXT_PLAIN}[]`);

    if (filename !== undefined) {
      if (filename === "") continue; // parser.rb:131-135 — no file chosen
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

/** MULTIPART (rack/multipart.rb:24): the first boundary parameter of the
 *  content type, through its closing quote / `;` / `,`. */
function boundaryOf(contentTypeHeader: string): string | null {
  const match = /multipart\/.*?boundary\s*="?([^";,]+)"?/i.exec(contentTypeHeader);
  return match === null ? null : match[1];
}

/** MULTIPART_CONTENT_DISPOSITION (rack/multipart.rb:31) + dequote
 *  (parser.rb:316-318): the name= token or double-quoted string. */
function dispositionName(head: string): string | undefined {
  const match =
    /Content-Disposition:[^:]*;\s*name=("(?:\\"|[^"])*"|[^\s()<>,;:\\"/[\]?=]+)/i.exec(head);
  if (match === null) return undefined;
  return dequote(match[1]);
}

/** get_filename (parser.rb:402-432): the BROKEN fallback arm
 *  (rack/multipart.rb:26) — a filename= token or quoted string on the
 *  disposition line; surrounding quotes stripped, `\"` unescaped
 *  (parser.rb:426-428's `filename !~ /\\[^\\"]/` guard). */
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

/** Rack::Auth::Digest::Params::dequote: strip one pair of surrounding
 *  quotes, unescape backslash escapes inside them. */
function dequote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

/** MULTIPART_CONTENT_TYPE (rack/multipart.rb:30): the part head's
 *  Content-Type line, when present. */
function headContentType(head: string): string | null {
  const match = /Content-Type: (.*)\r\n/i.exec(head.endsWith("\r\n") ? head : `${head}\r\n`);
  return match === null ? null : match[1].trim();
}

/** parser.rb:141-145: the client path's basename — Windows backslash
 *  paths and Unix paths both reduce to the final segment. */
function basenameOfClientPath(filename: string): string {
  const segments = filename.split(/[/\\]/);
  return segments[segments.length - 1];
}
