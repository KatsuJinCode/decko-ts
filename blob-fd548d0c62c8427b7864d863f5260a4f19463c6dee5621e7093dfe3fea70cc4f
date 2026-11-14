// The attachment (file/image upload) module — E4.4.a, the file-operations
// side-effect statement. Public surface:
//
// - attachment-content.ts: identifier + content-type/extension detection
//   (pure; the carrierwave uploader's naming/detection halves)
// - attachment-store.ts: the AttachmentStore seam + the local
//   files-dir backend (CarrierWave::Storage::File port)
// - the save path lives on CardActionEngine (`attachment` input +
//   `attachmentStore` option) — one save = one act, the action rows the
//   conformance battery pins, plus the attachment file bytes and the
//   db_content identifier rewrite (Ruby's write_identifier +
//   correct_identifier event pair)
// - src/server/file-routes.ts: the HTTP surface (POST upload + the
//   current/deprecated /files GET routes)

export {
  BINARY_CONTENT_TYPE,
  IMAGE_VARIANTS,
  detectAttachmentContentType,
  detectAttachmentExtension,
  extensionOfFilename,
  filenameWithVariant,
  lastContentActionIdFromIdentifier,
  localAttachmentIdentifier,
  parseLocalAttachmentIdentifier,
  type ImageVariant,
  type ParsedLocalIdentifier,
} from "./attachment-content.js";
export {
  AttachmentStore,
  BlobAttachmentStore,
  LocalAttachmentStore,
  type AttachmentStoreInput,
  type StoredAttachment,
} from "./attachment-store.js";
