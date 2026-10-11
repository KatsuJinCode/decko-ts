// The asset-output WRITE seam — the port of the half of
// card-mod-assets-0.20.0's Abstract::AssetOutputter that the read-side
// engine could not do before the attachment write landed the attachment write
// path:
//
// - asset_outputter.rb:78-82 asset_output_url:
//     `asset_output_card.file&.url` — the CarrierWave URL of the
//     `+*asset output` file card. Local storage resolves through
//     FileCardUploader::Path#local_url (path.rb:9-16):
//     "%s/%s/%s" % [card_path(files_web_path), file_dir, full_filename]
//     = "/files" + "~<card_id>" + "<action_id><ext>"
//     -> /files/~<card_id>/<action_id><ext>  (the tilde mark STAYS in the
//     url — oracle: "/files/~1347/5031.png", "/files/~447/1790661047.css";
//     the /files routes' current grammar /files/:mark/:rev_id.:format
//     serves exactly this shape).
// - asset_outputter.rb:20-30 update_asset_output(_live):
//     `lock { store_output input_from_item_cards }` then
//     `card_path asset_output_url` — the LIVE WRITE the :not_found view
//     (right/asset_output.rb:24-29) triggers. store_output runs the file
//     through Tempfile -> `aoc.update file: file` as bot: the `+*asset
//     output` child is created-or-replaced with the bytes, and the card's
//     db_content becomes the new ~card/action identifier.
//
// The INPUT half (input_from_item_cards: the item cards' asset_input_content
// — each inputter's format(input_format).render(input_view) render) belongs
// to the asset-inputter machinery (Abstract::AssetInputter — the set modules
// card-mod-assets assigns to the style/script groups), which nothing implements
// ported; the seam therefore takes the ASSEMBLED CONTENT as its argument and
// the caller owns assembly. Named remainder, not a silent gap.
//
// Node-only store bytes ride the LocalAttachmentStore through
// the CardActionEngine attachment path (the same machinery the /files
// routes' POST writes with), so identifiers, action rows, and change rows
// match Ruby's save shape without this module owning any SQL.

import { parseLocalAttachmentIdentifier } from "./attachment-content.js";

/** The CarrierWave url for a file card's db_content identifier.
 *  local "~<card>/<action><ext>" -> "/files/~<card>/<action><ext>" (the
 *  oracle-pinned tilde-mark form); web content passes through raw (the
 *  uploader's `model.content` arm, file_card_uploader.rb:186-188); cloud
 *  and coded identifiers render as the raw identifier (the fog/coded
 *  surfaces have no headless byte pin — the engine's coded-file serving is
 *  the coded-attachment-files surface, not this url builder); empty/nil ->
 *  "" (Ruby: file&.url -> nil). */
export function localAttachmentUrl(identifier: string | null | undefined): string {
  if (identifier === null || identifier === undefined) return "";
  const trimmed = identifier.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("~")) {
    // FileCardUploader::Path#local_url — /files + the file_dir (tilde mark
    // included) + the stored filename. parseLocalAttachmentIdentifier
    // validates the shape; a malformed local identifier renders "" (Ruby's
    // url would raise on the path join; the headless port renders empty
    // rather than leaking a broken path).
    const parsed = parseLocalAttachmentIdentifier(trimmed);
    if (parsed === undefined) return "";
    return `/files/${trimmed}`;
  }
  // web content is its own url; cloud/coded render the raw identifier.
  return trimmed;
}

/** The write surface storeAssetOutput needs: the attachment write
 *  CardActionEngine's attachment-bearing create/update, and the fetch
 *  engine's name resolution (the record carries the id + dbContent this
 *  module reads back). Structural — a test double satisfies it. */
export interface AssetOutputWriteDeps {
  engine: {
    createCard(input: {
      name: string;
      typeCode?: string;
      attachment?: { bytes: Uint8Array; originalFilename: string };
    }): Promise<unknown>;
    updateCard(input: {
      cardId: number;
      attachment?: { bytes: Uint8Array; originalFilename: string };
    }): Promise<unknown>;
  };
  fetchByName(
    name: string,
  ): Promise<{ id: number | undefined; dbContent?: string | null } | undefined>;
}

/** The stored-output result: the /files url (update_asset_output_live's
 *  `card_path asset_output_url` return) plus the identifier it came from. */
export interface StoredAssetOutput {
  url: string;
  identifier: string;
  cardId: number;
}

/** Port of update_asset_output's write half (asset_outputter.rb:20-25 +
 *  36-59): ensure the `+*asset output` child exists (a File-typed card
 *  cannot be created without an upload — Ruby's own create validation, hit
 *  live in the oracle harness), then store the assembled output bytes as
 *  the child's attachment. The final read-back of db_content matches Ruby's
 *  correct_identifier finalize event (the identifier re-derived from the
 *  stored action).
 *
 *  @param content the ASSEMBLED output (input_from_item_cards' join — the
 *         inputter render chain is the named remainder above)
 *  @param ext the outputter's output_format extension WITH the dot
 *         (".css" per TypePlusRight::Set::Style's output_format: :css,
 *         ".js" per the script module) — handle_file's Tempfile extension. */
export async function storeAssetOutput(
  deps: AssetOutputWriteDeps,
  outputterName: string,
  content: string,
  ext: string,
): Promise<StoredAssetOutput> {
  const childName = `${outputterName}+*asset output`;
  const bytes = new TextEncoder().encode(content);
  // The upload's original filename: Ruby's handle_file stages a Tempfile
  // named "<id>.<output_format>", and the action comment carries that
  // staged name; the identifier needs only the extension, which the
  // filename below pins deterministically.
  const originalFilename = `asset_output${ext}`;

  const existing = await deps.fetchByName(childName);
  if (existing !== undefined && existing.id !== undefined) {
    await deps.engine.updateCard({
      cardId: existing.id,
      attachment: { bytes, originalFilename },
    });
  } else {
    await deps.engine.createCard({
      name: childName,
      typeCode: "file",
      attachment: { bytes, originalFilename },
    });
  }

  const stored = await deps.fetchByName(childName);
  if (stored === undefined || stored.id === undefined) {
    throw new Error(`asset output child missing after store: ${childName}`);
  }
  const identifier = stored.dbContent ?? "";
  return { url: localAttachmentUrl(identifier), identifier, cardId: stored.id };
}
