// Gherkin step helpers for the attach feature ("File Upload"). The upstream
// scenarios are
// Capybara browser flows over the upload form; this harness drives the same
// business behaviour against the attachment write path the engine owns
// (CardActionEngine's attachment events + LocalAttachmentStore — the same
// machinery the /files POST route drives).
//
// Boundary (named, consistent with the other slices): the editor's live
// form states ("I should see file 'file.txt 9 Bytes'", "Add File...",
// "Save and Close") are browser surfaces; the engine-observable facts those
// steps assert are the stored identifier, the on-disk bytes, and the
// rendered core view.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { givenStandardDeck, freshWorld, closeWorld, whenGoToCard, thenSee, type GherkinWorld } from "./gherkin-steps.js";
import { installGherkinNameEnvironment, seedCard, TYPE_IDS } from "./gherkin-storage.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

/** The attachment cardtype codename cards (`attachment :file` codename
 *  `file`; `attachment :image` codename `image`). File seeds
 *  at id 30; Image rides the same convention. */
export const ATTACH_IDS = { file: 30, image: 31 } as const;

/** The attachment world: the gherkin world plus an action engine wired to
 *  a throwaway LocalAttachmentStore (the deck's files directory). */
export interface AttachmentWorld {
  world: GherkinWorld;
  /** The engine with the attachment store — the one uploads must run
   *  through (freshWorld's default engine has no store). */
  engine: CardActionEngine;
  filesDir: string;
}

export async function freshAttachmentWorld(): Promise<AttachmentWorld> {
  const world = await freshWorld();
  await givenStandardDeck(world);
  await seedCard(world.storage, {
    id: ATTACH_IDS.file,
    name: "File",
    codename: "file",
    typeId: TYPE_IDS.cardtype,
  });
  await seedCard(world.storage, {
    id: ATTACH_IDS.image,
    name: "Image",
    codename: "image",
    typeId: TYPE_IDS.cardtype,
  });
  await installGherkinNameEnvironment(world.storage);
  const filesDir = scratchDir("decko-ts-gherkin-attach-");
  const engine = new CardActionEngine(world.storage.fetcher, {
    actor: world.actor,
    ipAddress: "127.0.0.1",
    attachmentStore: new LocalAttachmentStore(filesDir),
  });
  world.engine = engine;
  return { world, engine, filesDir };
}

export async function closeAttachmentWorld(aw: AttachmentWorld): Promise<void> {
  await closeWorld(aw.world);
  rmSync(aw.filesDir, { recursive: true, force: true });
}

/** "When I upload the file <name>" — the upload form's submit: one save
 *  carrying the attachment (Card.create name:, type: :file, file: ...).
 *  Returns the stored identifier the
 *  content column carries ("~<card_id>/<action_id><ext>",
 *  file_card_uploader.rb:164-177). */
export async function whenUploadFile(
  aw: AttachmentWorld,
  form: { name: string; bytes: Uint8Array; originalFilename: string; typeCode?: string },
): Promise<string> {
  const result = await aw.engine.createCard({
    name: form.name,
    typeCode: form.typeCode ?? "file",
    attachment: { bytes: form.bytes, originalFilename: form.originalFilename },
  });
  const row = await aw.world.storage.selectOne<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [result.cardId],
  );
  return row?.db_content ?? "";
}

/** The on-disk bytes of a stored identifier ("~<cid>/<aid>.ext" ->
 *  <filesDir>/<cid>/<aid>.ext). An IMAGE card's original stores
 *  under the -original spelling (image_card_uploader.rb:44-57 —
 *  carrierwave's store_path applies full_filename), so the bare spelling
 *  falls back to <aid>-original<ext> when the bare file is absent. */
export async function storedFileBytes(aw: AttachmentWorld, identifier: string): Promise<Buffer> {
  const rel = identifier.replace(/^~/, "");
  try {
    return readFileSync(join(aw.filesDir, rel));
  } catch (err) {
    const dot = rel.lastIndexOf(".");
    const originalSpelling =
      dot === -1 ? `${rel}-original` : `${rel.slice(0, dot)}-original${rel.slice(dot)}`;
    return readFileSync(join(aw.filesDir, originalSpelling)); // throws if truly absent
  }
}

/** The on-disk bytes of one action's stored VARIANT file — the rendition
 *  spelling "<aid>-<variant><ext>" (the version joins the basename with a
 *  dash before the extension). */
export async function storedVariantBytes(
  aw: AttachmentWorld,
  identifier: string,
  variant: string,
): Promise<Buffer> {
  const rel = identifier.replace(/^~/, "");
  const dot = rel.lastIndexOf(".");
  const variantSpelling =
    dot === -1 ? `${rel}-${variant}` : `${rel.slice(0, dot)}-${variant}${rel.slice(dot)}`;
  return readFileSync(join(aw.filesDir, variantSpelling));
}

/** "Then I should see 'Download <name>'" — the file card's :core view
 *  (the download anchor).
 *  Renders through the gherkin world's renderer. */
export async function thenFileCardShowsDownload(aw: AttachmentWorld, name: string): Promise<void> {
  await whenGoToCard(aw.world, name, "core");
  thenSee(aw.world, `Download ${name}`);
}

/** Every file path in the deck's files directory (recursive). */
export async function walkStoredTree(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  const { readdirSync } = await import("node:fs");
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walkStoredTree(full, base, out);
    else out.push(full.slice(base.length + 1).split("\\").join("/"));
  }
  return out;
}
