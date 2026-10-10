// Attachment identifier + content-type detection — the zero-dependency
// port of the pieces of card-mod-carrierwave-0.20.0's uploader machinery
// that do not need the carrierwave gem itself:
//
// - FileCardUploader#filename / #url_filename / #extension
//   (lib/carrier_wave/file_card_uploader.rb:147-177): the stored filename
//   is `<action_id><extension>` (extension downcased), and the db_content
//   identifier for local storage is `~<card_id>/<action_id><extension>`
//   (the uploader doc's "Identifier" table, :88-93).
// - CarrierWave::SanitizedFile#content_type (file_card_uploader.rb:240-264):
//   the detection ORDER is guessed-safe-by-path (text-ish types only,
//   application/javascript mapped to text/javascript), then the identified
//   (magic-byte) type, then the declared type, then Marcel::MimeType::BINARY
//   (application/octet-stream).
// - CarrierWave::Uploader::Versions#full_filename (:266-283) +
//   ImageCardUploader#full_filename (image_card_uploader.rb:49-57): the
//   variant rides at the END of the basename, `<base>-<variant>.<ext>`
//   (`original` is the un-suffixed file with -original spelling).
//
// The magic-byte table replaces the Marcel identified-type call for the
// formats the deck actually serves; everything else falls through exactly
// like Marcel's miss chain. No native dependency: image BYTES are stored
// and served verbatim (the mini_magick variant RESIZE is the one
// named remainder).

/** The application/octet-stream default (Marcel::MimeType::BINARY). */
export const BINARY_CONTENT_TYPE = "application/octet-stream";

/** Magic-byte signatures -> (extension, content type). The first matching
 *  entry wins; order matters where prefixes overlap (none here). */
const MAGIC_SIGNATURES: readonly { bytes: number[]; ext: string; type: string }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ext: ".png", type: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], ext: ".jpg", type: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], ext: ".gif", type: "image/gif" }, // GIF87a
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], ext: ".gif", type: "image/gif" }, // GIF89a
  { bytes: [0x25, 0x50, 0x44, 0x46], ext: ".pdf", type: "application/pdf" }, // %PDF
  { bytes: [0x50, 0x4b, 0x03, 0x04], ext: ".zip", type: "application/zip" }, // PK\3\4
];

/** Extension -> content type for the by-path (guessed_safe / Marcel
 *  by_path) half of the detection order. Only text-ish types participate
 *  in guessed_safe (file_card_uploader.rb:252-263), but the by-extension
 *  map also feeds the identified fallback for formats without a magic
 *  signature (svg, text). */
export const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".text": "text/plain",
  ".csv": "text/csv",
  ".css": "text/css",
  ".js": "text/javascript", // the SanitizedFile override's exact mapping (:259-261)
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

/** The image-carrierwave variants (image_card_uploader.rb:16-27: icon,
 *  small, medium, large; the un-suffixed file is served as -original). */
export const IMAGE_VARIANTS = ["icon", "small", "medium", "large", "original"] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

function looksTextual(bytes: Uint8Array): boolean {
  const window = bytes.subarray(0, 1024);
  for (const byte of window) {
    if (byte === 0) return false; // NUL byte: binary
  }
  return true;
}

/** The extension of an original upload filename — FileCardUploader#extension's
 *  original_filename arm (:155-162), downcased. Empty string when the name
 *  carries no extension. */
export function extensionOfFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  const ext = base.slice(dot).toLowerCase();
  return /^[.][a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

/** The detected extension for an upload: the original filename's extension
 *  first (Ruby's first `file.extension` arm resolves to the upload's own
 *  name), then the magic-byte sniff, then "" (FileCardUploader#valid? treats
 *  an extensionless upload as invalid — :143-145 — the card still saves). */
export function detectAttachmentExtension(originalFilename: string, bytes: Uint8Array): string {
  const fromName = extensionOfFilename(originalFilename);
  if (fromName !== "") return fromName;
  for (const sig of MAGIC_SIGNATURES) {
    if (startsWith(bytes, sig.bytes)) return sig.ext;
  }
  // Text-ish bytes without a magic signature and without an extension:
  // plain text is the only safe guess (svg detection needs the markup).
  if (looksTextual(bytes) && bytes.length > 0) return ".txt";
  return "";
}

/** The content type for an upload — the Marcel detection ORDER of
 *  SanitizedFile#content_type (file_card_uploader.rb:240-250):
 *  guessed-safe-by-path (text-ish by extension, application/javascript
 *  remapped to text/javascript), then the identified (magic-byte) type,
 *  then the declared type, then Marcel::MimeType::BINARY. */
export function detectAttachmentContentType(
  originalFilename: string,
  bytes: Uint8Array,
  declaredType?: string | null,
): string {
  // guessed_safe_content_type: by-path types, text/* only (plus the js
  // remap) — everything else returns nil and falls through.
  const ext = extensionOfFilename(originalFilename);
  const byPath = ext !== "" ? EXTENSION_CONTENT_TYPES[ext] : undefined;
  if (byPath !== undefined && byPath.startsWith("text/")) return byPath;
  // identified_content_type: magic bytes.
  for (const sig of MAGIC_SIGNATURES) {
    if (startsWith(bytes, sig.bytes)) return sig.type;
  }
  if (looksTextual(bytes) && bytes.length > 0) {
    // svg (xml text without a magic signature), then plain text.
    const head = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.subarray(0, 512))
      .toLowerCase();
    if (head.includes("<svg")) return "image/svg+xml";
    if (byPath !== undefined) return byPath;
    return "text/plain";
  }
  // declared_content_type, then BINARY.
  const declared = (declaredType ?? "").trim().toLowerCase();
  if (declared !== "") return declared;
  return BINARY_CONTENT_TYPE;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

/** The db_content identifier for a LOCAL attachment — db_content
 *  (file_card_uploader.rb:164-169): `"%s/%s" % [file_dir, url_filename]`
 *  with file_dir = `~<card_id>` (paths.rb:53-55) and url_filename =
 *  `<action_id><ext>` (:171-177). */
export function localAttachmentIdentifier(cardId: number, actionId: number, ext: string): string {
  return `~${cardId}/${actionId}${ext}`;
}

/** SelectedAction#last_content_action_id (set/type/file.rb:8-13): the
 *  action id parsed OUT of a db_content identifier —
 *  `db_content.to_s.split(%r{[/.]})[-2]`, numeric or nil. */
export function lastContentActionIdFromIdentifier(
  content: string | null | undefined,
): number | null {
  if (content === null || content === undefined || content === "") return null;
  const parts = content.split(/[/.]/);
  const candidate = parts[parts.length - 2];
  if (candidate === undefined || !/^\d+$/.test(candidate)) return null;
  return Number.parseInt(candidate, 10);
}

/** A parsed LOCAL identifier: the card id, action id, and extension the
 *  storage path is built from. */
export interface ParsedLocalIdentifier {
  cardId: number;
  actionId: number;
  ext: string;
}

/** Parse a `~<card_id>/<action_id><ext>` identifier (nil-ish for anything
 *  else — web/cloud/coded content does not resolve to local bytes). */
export function parseLocalAttachmentIdentifier(
  content: string | null | undefined,
): ParsedLocalIdentifier | undefined {
  if (content === null || content === undefined) return undefined;
  const match = /^~(\d+)\/(\d+)(\.[a-z0-9]{1,10})?$/.exec(content.trim());
  if (match === null) return undefined;
  return {
    cardId: Number.parseInt(match[1], 10),
    actionId: Number.parseInt(match[2], 10),
    ext: match[3] ?? "",
  };
}

/** The storage filename for an action's file with an image variant
 *  appended — Versions#full_filename (:273-282): the version name joins
 *  the basename with a dash BEFORE the extension. `original` spells the
 *  SAME unsuffixed file with an -original suffix (image_card_uploader.rb
 *  :49-57 adds 'original' when no version is given), so both spellings
 *  resolve to the stored original's bytes in this port's pass-through. */
export function filenameWithVariant(actionId: number, ext: string, variant?: string): string {
  if (variant === undefined || variant === "") return `${actionId}${ext}`;
  return `${actionId}-${variant}${ext}`;
}
