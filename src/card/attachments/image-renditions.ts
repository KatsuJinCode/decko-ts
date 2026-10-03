// The ImageCardUploader port — the image rendition/version machinery the
// attachment save path needs (gherkin-capabilities lane; the capability the
// attach.feature "Uploading and changing an image" scenario pins).
//
// Ruby sources (card-mod-carrierwave-0.20.0 unless noted):
// - set/type/image.rb:1     `attachment :image, uploader:
//                             CarrierWave::ImageCardUploader` — the uploader
//                             class rides the IMAGE mount (File cards use
//                             the plain FileCardUploader: no versions).
// - set/type/image.rb:4-7   create_versions? = `new_file.extension != "svg"`
//                           — SVGs get NO version files.
// - lib/carrier_wave/image_card_uploader.rb:16-27
//     version :icon,   if: :create_versions?, from_version: :small
//     version :small,  if: :create_versions?, from_version: :medium
//     version :medium, if: :create_versions?
//     version :large,  if: :create_versions?
//   (the resize_to_fit/resize_to_limit geometries ride the versions; see
//   the versionBytes seam below).
// - lib/carrier_wave/image_card_uploader.rb:44-57 full_filename adds
//   `-original` to the version-less filename, and carrierwave 3.1.4's
//   uploader/store.rb:80-82 store_path APPLIES full_filename — the stored
//   original of an image card is <action_id>-original<ext>.
// - lib/carrier_wave/file_card_uploader.rb:266-283 decko's
//   CarrierWave::Uploader::Versions override: the version name joins the
//   basename dash-separated BEFORE the extension.
//
// The db_content identifier stays variant-less for both mounts
// (file_card_uploader.rb:164-177 db_content/url_filename — "~<card>/
// <action><ext>"); the VIEW appends the variant when it emits the src
// (render/views.ts formatImageCore appendSizeVariant, the port of
// set/type/image.rb selected_version).
//
// NAMED SEAM (the resize): Ruby's versions are mini_magick RESIZES
// (resize_and_pad 16x16, resize_to_fit 75x75, resize_to_limit 200/500).
// This engine carries no image processor: every version file is a
// byte-identical copy of the original (versionBytes). The scenario (and
// every view) asserts the rendition file NAMES and their resolution, never
// pixel dimensions; a processor lands behind this seam without touching
// the callers.

/** The image version names, in ImageCardUploader declaration order
 *  (image_card_uploader.rb:16-27). `original` is not a version — it is
 *  the version-less file's stored spelling (:44-57). */
export const IMAGE_VERSION_NAMES = ["icon", "small", "medium", "large"] as const;

export type ImageVersionName = (typeof IMAGE_VERSION_NAMES)[number];

/** The uploader class selection, ported as the mount check: the image
 *  mount runs ImageCardUploader (set/type/image.rb:1), the file mount
 *  runs FileCardUploader (set/type/file.rb:1 — no versions). */
export function mountUsesImageUploader(mountCodename: string): boolean {
  return mountCodename === "image";
}

/** create_versions? (set/type/image.rb:4-7): `new_file.extension != "svg"`.
 *  The extension arrives lowercased with the leading dot
 *  (detectAttachmentExtension). */
export function createVersionsFor(ext: string): boolean {
  return ext !== ".svg";
}

/** The stored filenames one image upload produces, relative to the card's
 *  files dir: the -original file (image_card_uploader.rb:44-57) plus one
 *  file per version (file_card_uploader.rb:266-283). Empty when
 *  create_versions? is false (SVGs — only the plain original stores,
 *  exactly like a File card's). */
export function renditionFileNames(actionId: number, ext: string): string[] {
  if (!createVersionsFor(ext)) return [`${actionId}${ext}`];
  return [
    `${actionId}-original${ext}`,
    ...IMAGE_VERSION_NAMES.map((v) => `${actionId}-${v}${ext}`),
  ];
}

/** The bytes stored for one rendition. THE NAMED SEAM: identity copy of
 *  the original until an image processor is ported (see the module
 *  header) — Ruby's mini_magick resize is the remainder. */
export function versionBytes(original: Uint8Array): Uint8Array {
  return original;
}
