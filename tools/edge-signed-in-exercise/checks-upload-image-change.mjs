// checks-upload-image-change.mjs — instruments for the upload pipeline's
// UNMEASURED rows in docs/registry/instrument-coverage-matrix.md:
//   F6 "Upload a file as a field in a form; update it; submit without updating"
//   F2 "Remove an upload from the preview"
//   F8 "Replace an uploaded file"
//   F9 "an image card standalone page renders blank (no image)"
// The check drives the real signed-in Image form the way a person does
// (create with a file, edit with a replacement file, resubmit unchanged),
// verifies stored state after every step (cards row, action count, the
// served image URL), and keeps raw captures. It must FAIL when the engine
// loses or swaps an upload, and FAIL when the preview offers no remove
// control — both are findings, not skips.
//
// F8 and F9 joined on 2026-10-17 as the two media rows NO instrument family
// had any shape for (matrix ACT-149 / ACT-161, both `none`): F8 because every
// replacement leg here ran on an IMAGE card and the oracle's own journey
// upload-replace-file-admin replaces a FILE card; F9 because the 2026-10-16
// enumeration crawl saw a blank standalone Image page and nothing here
// asserted that the rendered <img> decodes — F6's leg-1 predicate is only
// `servedImageSrc !== null`, which a <img> carrying a 404 src satisfies.
//
// Selected by `--only unmeasured-matrix` (all five matrix-lane modules) or
// `--only upload-image-change` (this module alone).

import { deflateSync } from "node:zlib";

/** A real minimal PNG built from given pixels (RGBA, 8-bit): distinct uploads
 *  must be distinct byte streams, so the update leg can prove the stored file
 *  changed. Self-verified by re-parsing the chunk structure before use. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of [...Buffer.from(type, "ascii"), ...data]) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}
function encodePng(width, height, rgbaPixels) {
  if (rgbaPixels.length !== width * height * 4) throw Error("png pixel buffer does not match dimensions");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    rgbaPixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}
function verifiedPng(width, height, rgbaPixels) {
  const png = encodePng(width, height, rgbaPixels);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw Error("png self-check: signature");
  if (png.readUInt32BE(8) !== 13 || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw Error("png self-check: IHDR");
  return png;
}

export const meta = { topic: "upload-image-change", capabilityIds: ["F6", "F2", "F8", "F9"] };
export const capabilityChecks = {
  F6: [
    "F6 an image uploaded in the create form is stored and served",
    "F6 replacing the upload through the edit form stores a different image",
    "F6 resubmitting the edit form without touching the file keeps the stored image",
  ],
  F2: ["F2 removing a pending upload from its preview preserves the previously stored image"],
  F8: ["F8 an uploaded file can be replaced through the File card's own edit form"],
  F9: ["F9 the Image card's standalone page renders an image the browser decodes"],
};

/** A person's file/text upload, as the oracle's own journeys hand it:
 *  upload-replace-file-admin ships `minutes.txt`. Distinct bodies, so the
 *  replace leg can prove the SERVED bytes changed and not merely the row. */
const textUpload = (body) => ({
  name: "minutes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from(body, "utf8"),
});

const RED_1X1 = () => verifiedPng(1, 1, Buffer.from([255, 0, 0, 255]));
const BLUE_GREEN_2X1 = () => verifiedPng(2, 1, Buffer.from([0, 0, 255, 255, 0, 255, 0, 255]));

export const checks = [{
  name: "an uploaded image can be updated in its form and is preserved on an unchanged resubmit; the preview offers a remove",
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, creds, database, record, created, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("upload checks require the disposable loopback fixture");
    const name = "HarnessUploadImg_" + Date.now().toString(36);
    let admin;
    try {
      admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      const page = admin.page;
      await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
      await page.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
      await page.fill('input[type="password"]', creds.admin.password);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 });
      await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
      const signedIn = await pending;
      await signedIn.finished();
      if (signedIn.status() >= 400) throw Error("upload actor was not signed in: " + signedIn.status());

      created.push(name);
      const row = () => database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(name);
      const actionCount = () => database().prepare("SELECT COUNT(*) AS n FROM card_actions WHERE card_id=?").get(row()?.id ?? -1)?.n ?? -1;
      const servedImageSrc = async () => page.evaluate(() => document.querySelector("#main img")?.src ?? null);
      /** What the edit page actually renders, so a structural miss is a
       *  recorded finding with evidence instead of a locator timeout. */
      const formInventory = () => page.evaluate(() => [...document.querySelectorAll("form.card-form")].map(f => ({
        action: f.getAttribute("action"),
        hasFileInput: f.querySelector('input[type="file"]') !== null,
        hasContentInput: f.querySelector('[name="card[content]"]') !== null,
        buttons: [...f.querySelectorAll("button, input[type=submit]")].map(b => ({ tag: b.tagName, type: b.getAttribute("type"), cls: b.className.slice(0, 60), text: (b.textContent ?? b.value ?? "").trim().slice(0, 30), visible: b.getClientRects().length > 0 })),
      })));
      /** The update form is the card-form that carries the file input; its
       *  submit is the engine's own .submit-button (card-mod-edit.ts). */
      const updateForm = () => page.locator("form.card-form").filter({ has: page.locator('input[type="file"]') }).first();
      const submitUpdateForm = async form => {
        const action = new URL(await form.getAttribute("action"), stack.origin);
        if (action.origin !== stack.origin) throw Error("upload edit form action leaves owned origin");
        const submit = form.locator("button.submit-button, button[type=submit], input[type=submit]").first();
        const submitPending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() !== "GET", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
        await submit.click({ timeout: 15000 });
        const sent = await submitPending;
        if (sent.e) throw sent.e;
        await sent.r.finished();
        return sent.r;
      };

      // F6 leg 1 — create through the real form with a file chosen in the form.
      await page.goto(stack.origin + "/new/Image", { waitUntil: "load" });
      const fileInput = page.locator('form.card-form input[type="file"]').first();
      if ((await fileInput.count()) === 0) throw Error("the Image create form offers no file input; the in-form upload action cannot be exercised at all");
      await page.locator('form.card-form input[name="card[name]"]').first().fill(name);
      await fileInput.setInputFiles({ name: "harness-red.png", mimeType: "image/png", buffer: RED_1X1() });
      // Choosing the file does not upload it by itself: the engine's own
      // decko.js posts it to the preliminary-upload arm and swaps the
      // preview_editor html into .chosen-file, carrying the draft action id
      // back in the hidden card[action_id_of_cached_upload] input the save
      // posts (write-routes.ts cachedUploadActionParam). Submitting before
      // that input holds a numeric id races the round trip, so wait for the
      // id exactly as this harness's own File leg does
      // (edge-signed-in-exercise.mjs the File create group).
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: 30000 });
      const createPending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
      await page.locator('form.card-form button[type="submit"]').first().click({ timeout: 15000 });
      const createdResponse = await createPending;
      if (createdResponse.e) throw createdResponse.e;
      await createdResponse.r.finished();
      await page.waitForTimeout(1500);
      const afterCreate = await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
      const srcA = await servedImageSrc();
      record(capabilityChecks.F6[0], createdResponse.r.status() < 400 && row()?.id !== undefined && afterCreate.status() === 200 && srcA !== null,
        { actor: creds.admin.name, actorId: creds.admin.id, createStatus: createdResponse.r.status(), storedRow: row()?.id !== undefined, pageStatus: afterCreate.status(), servedImageSrc: srcA, raw: captureEvidence(await page.content(), { check: "upload-create", name }) });

      // F6 leg 2 — update: the edit form carries a file input; replacing it must store a different image.
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const editInventory = await formInventory();
      if ((await updateForm().count()) === 0) {
        record(capabilityChecks.F6[1], false, { note: "the image edit form offers no file input; a user cannot replace an upload through the form", editInventory, raw: captureEvidence(await page.content(), { check: "upload-edit-no-file-input", name }) });
        record(capabilityChecks.F6[2], false, { note: "not exercised: no file-input form to resubmit", editInventory });
        record(capabilityChecks.F2[0], false, { note: "not exercised: no file-input form whose preview could offer a remove control", editInventory });
        return;
      }
      const actionsBeforeUpdate = actionCount();
      await updateForm().locator('input[type="file"]').first().setInputFiles({ name: "harness-blue-green.png", mimeType: "image/png", buffer: BLUE_GREEN_2X1() });
      const updated = await submitUpdateForm(updateForm());
      await page.waitForTimeout(1500);
      await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
      const srcB = await servedImageSrc();
      record(capabilityChecks.F6[1], updated.status() < 400 && srcB !== null && srcB !== srcA && actionCount() > actionsBeforeUpdate,
        { actor: creds.admin.name, actorId: creds.admin.id, updateStatus: updated.status(), srcBefore: srcA, srcAfter: srcB, storedActionsGrew: actionCount() > actionsBeforeUpdate, raw: captureEvidence(await page.content(), { check: "upload-update", name }) });
      const srcCurrent = srcB;

      // F6 leg 3 — submit without updating: resaving the untouched form must keep the stored image.
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const actionsBeforeResubmit = actionCount();
      const resubmitted = await submitUpdateForm(updateForm());
      await page.waitForTimeout(1500);
      await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
      const srcC = await servedImageSrc();
      record(capabilityChecks.F6[2], resubmitted.status() < 400 && srcC === srcCurrent,
        { actor: creds.admin.name, actorId: creds.admin.id, resubmitStatus: resubmitted.status(), srcBefore: srcCurrent, srcAfter: srcC, preserved: srcC === srcCurrent, raw: captureEvidence(await page.content(), { check: "upload-resubmit-unchanged", name }) });

      // F9 — the standalone page must RENDER the image, not merely carry the
      // element. F6's leg-1 predicate is `servedImageSrc !== null`, and an
      // <img> whose src 404s or fails to decode satisfies it: a tag is
      // present, a picture is not. That is the shape the 2026-10-16 signed-in
      // enumeration crawl found — an Image card's own page rendering blank
      // (matrix ACT-161, instrument family `none`). Grade the element the
      // browser actually decoded AND the bytes it decoded them from, over
      // the engine's own /files route, and keep the page as evidence.
      const renderedImage = await page.evaluate(async () => {
        const img = document.querySelector("#main img");
        if (img === null) return { present: false };
        if (img.complete === false) await img.decode().catch(() => {});
        return {
          present: true,
          src: img.src,
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          alt: img.getAttribute("alt"),
        };
      });
      const imageRequest = renderedImage.present === true && renderedImage.src.startsWith(new URL(stack.origin).origin + "/")
        ? await page.request.get(renderedImage.src)
        : undefined;
      const imageBytes = imageRequest === undefined ? null : (await imageRequest.body()).length;
      record(capabilityChecks.F9[0],
        renderedImage.present === true
          && renderedImage.complete === true
          && renderedImage.naturalWidth > 0
          && imageRequest !== undefined
          && imageRequest.status() === 200
          && imageBytes !== null
          && imageBytes > 0,
        {
          actor: creds.admin.name,
          actorId: creds.admin.id,
          standaloneUrl: "/" + name,
          imgPresent: renderedImage.present,
          imgSrc: renderedImage.src ?? null,
          imgAlt: renderedImage.alt ?? null,
          imgComplete: renderedImage.complete ?? null,
          imgNaturalWidth: renderedImage.naturalWidth ?? null,
          imgNaturalHeight: renderedImage.naturalHeight ?? null,
          decoded: (renderedImage.naturalWidth ?? 0) > 0,
          imageRequestStatus: imageRequest?.status() ?? null,
          imageContentType: imageRequest?.headers()["content-type"] ?? null,
          imageBytes,
          raw: captureEvidence(await page.content(), { check: "image-standalone-render", name }),
        });

      // F2 is cancellation of a pending upload, not deletion of a saved
      // attachment. Ruby's preview_editor.haml renders .cancel-upload after
      // file selection; upload.js.coffee empties .chosen-file on that click.
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const contentBeforeCancel = row()?.db_content;
      await updateForm().locator('input[type="file"]').first().setInputFiles({ name: "harness-cancel-red.png", mimeType: "image/png", buffer: RED_1X1() });
      await updateForm().locator('.cancel-upload').waitFor({state:"visible",timeout:15000});
      const removeInventory = await formInventory();
      const removeControl = updateForm().locator('.cancel-upload').first();
      if ((await removeControl.count()) === 0) {
        record(capabilityChecks.F2[0], false, { note: "the image edit form offers no remove-the-upload control in its preview; the remove action cannot be performed as a user", removeInventory, raw: captureEvidence(await page.content(), { check: "upload-remove-absent", name }) });
      } else {
        await removeControl.click({ timeout: 15000 });
        const previewCleared = await updateForm().locator('.chosen-file input').count() === 0;
        const removed = await submitUpdateForm(updateForm());
        await page.waitForTimeout(1500);
        await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
        const srcD = await servedImageSrc();
        record(capabilityChecks.F2[0], removed.status() < 400 && previewCleared && srcD === srcC && row()?.db_content === contentBeforeCancel,
          { actor: creds.admin.name, actorId: creds.admin.id, removeStatus: removed.status(), previewCleared, servedImageSrcBeforeCancel:srcC, servedImageSrcAfterCancel:srcD, storedContentUnchanged:row()?.db_content === contentBeforeCancel, raw: captureEvidence(await page.content(), { check: "upload-preview-cancelled", name }) });
      }
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "upload-image-change browser operation timed out";
      throw error;
    } finally {
      await admin?.close().catch(() => {});
    }
  },
}, {
  // F8 — replacing an uploaded FILE. Its own check entry so a File-card
  // failure reports as itself instead of cascading into the image legs
  // above. The oracle journey is upload-replace-file-admin: sign in, visit
  // the card's ?view=edit, upload minutes.txt, wait for the filename in the
  // preview, click Save and Close, observe "replaced file". This module's
  // replacement leg ran on an IMAGE card only, so before this check the
  // action a person performs most — swap the PDF on a File card — had no
  // instrument in any family (matrix ACT-149, `none`/`none`).
  name: "an uploaded file can be replaced through the File card's own edit form",
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, creds, record, created, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("upload checks require the disposable loopback fixture");
    const name = "HarnessUploadFile_" + Date.now().toString(36);
    const FIRST = "Harness upload body, first version.\n";
    const SECOND = "Harness upload body, replaced version.\n";
    let admin;
    try {
      admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      const page = admin.page;
      await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
      await page.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
      await page.fill('input[type="password"]', creds.admin.password);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 });
      await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
      const signedIn = await pending;
      await signedIn.finished();
      if (signedIn.status() >= 400) throw Error("upload actor was not signed in: " + signedIn.status());

      created.push(name);
      const row = () => ctx.database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(name);
      const updateForm = () => page.locator("form.card-form").filter({ has: page.locator('input[type="file"]') }).first();
      const submitUpdateForm = async form => {
        const action = new URL(await form.getAttribute("action"), stack.origin);
        if (action.origin !== stack.origin) throw Error("upload edit form action leaves owned origin");
        const submit = form.locator("button.submit-button, button[type=submit], input[type=submit]").first();
        const sent = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() !== "GET", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
        await submit.click({ timeout: 15000 });
        const observed = await sent;
        if (observed.e) throw observed.e;
        await observed.r.finished();
        return observed.r;
      };
      /** The File card's own download anchor. set/type/file.rb renders :core
       *  as `<a href='SOURCE'>Download <title></a>` (formatFileCore,
       *  src/card/render/views.ts:2746-2761) — a File card has no <img>. */
      const downloadAnchor = () => page.evaluate(() => {
        const anchor = [...document.querySelectorAll("#main a[href]")].find(a => /^\/files\//.test(new URL(a.href, location.href).pathname));
        return anchor === undefined ? null : { href: anchor.href, text: (anchor.textContent ?? "").trim() };
      });
      /** The bytes the engine actually serves for the stored identifier. */
      const servedBytes = async identifier => {
        if (identifier === undefined || identifier === null || identifier === "") return null;
        const response = await page.request.get(stack.origin + "/files/" + identifier);
        return { status: response.status(), body: (await response.body()).toString("utf8") };
      };

      // create the File card through its own form with the first body
      await page.goto(stack.origin + "/new/File", { waitUntil: "load" });
      const fileInput = page.locator('form.card-form input[type="file"]').first();
      if ((await fileInput.count()) === 0) throw Error("the File create form offers no file input; the in-form upload action cannot be exercised at all");
      await page.locator('form.card-form input[name="card[name]"]').first().fill(name);
      await fileInput.setInputFiles(textUpload(FIRST));
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: 30000 });
      const createPending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
      await page.locator('form.card-form button[type="submit"]').first().click({ timeout: 15000 });
      const createdResponse = await createPending;
      if (createdResponse.e) throw createdResponse.e;
      await createdResponse.r.finished();
      await page.waitForTimeout(1500);
      await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
      const anchorA = await downloadAnchor();
      const storedA = row()?.db_content;
      const bytesA = await servedBytes(storedA);

      // replace it through the edit form with the second body
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      if ((await updateForm().count()) === 0) {
        record(capabilityChecks.F8[0], false, { note: "the File card's edit form offers no file input; a user cannot replace an upload through the form", raw: captureEvidence(await page.content(), { check: "file-edit-no-file-input", name }) });
        return;
      }
      await updateForm().locator('input[type="file"]').first().setInputFiles(textUpload(SECOND));
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: 30000 });
      // the preview must NAME the new file before the save, exactly as the
      // oracle journey's `wait: {text: "minutes.txt"}` step does
      const previewText = await updateForm().locator('.chosen-file').innerText({ timeout: 15000 });
      const replaced = await submitUpdateForm(updateForm());
      await page.waitForTimeout(1500);
      await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
      const anchorB = await downloadAnchor();
      const storedB = row()?.db_content;
      const bytesB = await servedBytes(storedB);
      record(capabilityChecks.F8[0],
        createdResponse.r.status() < 400
          && storedA !== undefined
          && bytesA !== null
          && bytesA.status === 200
          && bytesA.body === FIRST
          && previewText.includes("minutes.txt")
          && replaced.status() < 400
          && storedB !== undefined
          && storedB !== storedA
          && bytesB !== null
          && bytesB.status === 200
          && bytesB.body === SECOND,
        {
          actor: creds.admin.name,
          actorId: creds.admin.id,
          createStatus: createdResponse.r.status(),
          storedIdentifierBefore: storedA ?? null,
          storedIdentifierAfter: storedB ?? null,
          storedIdentifierChanged: storedB !== storedA,
          downloadHrefBefore: anchorA?.href ?? null,
          downloadHrefAfter: anchorB?.href ?? null,
          downloadAnchorText: anchorB?.text ?? null,
          downloadHrefChanged: anchorB?.href !== anchorA?.href,
          downloadStatusBefore: bytesA?.status ?? null,
          downloadStatusAfter: bytesB?.status ?? null,
          servedBytesBefore: bytesA?.body ?? null,
          servedBytesAfter: bytesB?.body ?? null,
          servedBytesAreTheUploadedOnes: bytesA?.body === FIRST && bytesB?.body === SECOND,
          previewNamedTheNewFile: previewText.includes("minutes.txt"),
          previewText: previewText.trim().slice(0, 120),
          raw: captureEvidence(await page.content(), { check: "file-replaced", name }),
        });
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "upload-image-change browser operation timed out";
      throw error;
    } finally {
      await admin?.close().catch(() => {});
    }
  },
}];
