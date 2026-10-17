// checks-upload-image-change.mjs — instruments for the upload pipeline's
// UNMEASURED rows in docs/registry/instrument-coverage-matrix.md:
//   F6 "Upload a file as a field in a form; update it; submit without updating"
//   F2 "Remove an upload from the preview"
// The check drives the real signed-in Image form the way a person does
// (create with a file, edit with a replacement file, resubmit unchanged),
// verifies stored state after every step (cards row, action count, the
// served image URL), and keeps raw captures. It must FAIL when the engine
// loses or swaps an upload, and FAIL when the preview offers no remove
// control — both are findings, not skips.
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

export const meta = { topic: "upload-image-change", capabilityIds: ["F6", "F2"] };
export const capabilityChecks = {
  F6: [
    "F6 an image uploaded in the create form is stored and served",
    "F6 replacing the upload through the edit form stores a different image",
    "F6 resubmitting the edit form without touching the file keeps the stored image",
  ],
  F2: ["F2 the image edit form offers a remove-the-upload control and removing stores the removal"],
};

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

      // F6 leg 1 — create through the real form with a file chosen in the form.
      await page.goto(stack.origin + "/new/Image", { waitUntil: "load" });
      const fileInput = page.locator('form.card-form input[type="file"]').first();
      if ((await fileInput.count()) === 0) throw Error("the Image create form offers no file input; the in-form upload action cannot be exercised at all");
      await page.locator('form.card-form input[name="card[name]"]').first().fill(name);
      await fileInput.setInputFiles({ name: "harness-red.png", mimeType: "image/png", buffer: RED_1X1() });
      const createPending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
      await page.locator('form.card-form button[type="submit"]').first().click();
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
      const editForm = page.locator("form.card-form").filter({ has: page.locator('input[type="file"], [name="card[content]"]') }).first();
      const editFileInput = page.locator('form.card-form input[type="file"]').first();
      const hasEditFileInput = (await editFileInput.count()) > 0;
      if (!hasEditFileInput) {
        record(capabilityChecks.F6[1], false, { note: "the image edit form offers no file input; a user cannot replace an upload through the form", raw: captureEvidence(await page.content(), { check: "upload-edit-no-file-input", name }) });
      } else {
        const actionsBeforeUpdate = actionCount();
        await editFileInput.setInputFiles({ name: "harness-blue-green.png", mimeType: "image/png", buffer: BLUE_GREEN_2X1() });
        const updatePending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname.startsWith("/update/") && r.request().method() !== "GET", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
        await editForm.locator('button[type="submit"], input[type="submit"]').first().click();
        const updated = await updatePending;
        if (updated.e) throw updated.e;
        await updated.r.finished();
        await page.waitForTimeout(1500);
        await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
        const srcB = await servedImageSrc();
        record(capabilityChecks.F6[1], updated.r.status() < 400 && srcB !== null && srcB !== srcA && actionCount() > actionsBeforeUpdate,
          { actor: creds.admin.name, actorId: creds.admin.id, updateStatus: updated.r.status(), srcBefore: srcA, srcAfter: srcB, storedActionsGrew: actionCount() > actionsBeforeUpdate, raw: captureEvidence(await page.content(), { check: "upload-update", name }) });
        var srcCurrent = srcB;
      }

      // F6 leg 3 — submit without updating: resaving the untouched form must keep the stored image.
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const untouchedForm = page.locator("form.card-form").first();
      const actionsBeforeResubmit = actionCount();
      const resubmitPending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname.startsWith("/update/") && r.request().method() !== "GET", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
      await untouchedForm.locator('button[type="submit"], input[type="submit"]').first().click();
      const resubmitted = await resubmitPending;
      if (resubmitted.e) throw resubmitted.e;
      await resubmitted.r.finished();
      await page.waitForTimeout(1500);
      await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
      const srcC = await servedImageSrc();
      record(capabilityChecks.F6[2], resubmitted.r.status() < 400 && srcCurrent !== undefined && srcC === srcCurrent,
        { actor: creds.admin.name, actorId: creds.admin.id, resubmitStatus: resubmitted.r.status(), srcBefore: srcCurrent ?? null, srcAfter: srcC, preserved: srcCurrent !== undefined && srcC === srcCurrent, raw: captureEvidence(await page.content(), { check: "upload-resubmit-unchanged", name }) });

      // F2 — the preview offers a remove-the-upload control; using it stores the removal.
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const formHtml = await page.evaluate(() => [...document.querySelectorAll("form.card-form")].map(f => f.outerHTML).join("\n").slice(0, 4000));
      const removeControl = page.locator('form.card-form input[type="checkbox"][name*="remove" i], form.card-form button:has-text("Remove"), form.card-form a:has-text("Remove"), form.card-form [title*="remove" i]').first();
      if ((await removeControl.count()) === 0) {
        record(capabilityChecks.F2[0], false, { note: "the image edit form offers no remove-the-upload control in its preview; the remove action cannot be performed as a user", formHtmlHead: formHtml, raw: captureEvidence(await page.content(), { check: "upload-remove-absent", name }) });
      } else {
        await removeControl.click();
        const removePending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname.startsWith("/update/") && r.request().method() !== "GET", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
        await untouchedForm.locator('button[type="submit"], input[type="submit"]').first().click();
        const removed = await removePending;
        if (removed.e) throw removed.e;
        await removed.r.finished();
        await page.waitForTimeout(1500);
        await page.goto(stack.origin + "/" + name + "?harness_verify=" + Date.now(), { waitUntil: "load" });
        const srcD = await servedImageSrc();
        record(capabilityChecks.F2[0], removed.r.status() < 400 && srcD === null,
          { actor: creds.admin.name, actorId: creds.admin.id, removeStatus: removed.r.status(), servedImageSrcAfterRemove: srcD, removed: srcD === null, raw: captureEvidence(await page.content(), { check: "upload-removed", name }) });
      }
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "upload-image-change browser operation timed out";
      throw error;
    } finally {
      await admin?.close().catch(() => {});
    }
  },
}];
