import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const fileDigest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Native coded-to-configured-storage replacement, with restored original fixture. */
export async function runCodedImageChange(ctx, checkName) {
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(ctx.stack.origin).hostname)) throw Error('Coded image check requires an owned disposable loopback deck');
      const { stack, page, creds, signIn, record, database, captureEvidence } = ctx;
      if (!(await signIn(creds.admin)).hasSessionCookie) throw Error("F4 browser signin failed");
      const coded = database().prepare(
        "SELECT c.id,c.name,c.codename,c.db_content FROM cards c JOIN cards t ON t.id=c.type_id " +
        "WHERE c.trash=0 AND t.codename='image' AND c.db_content LIKE ':%/%' AND c.name IS NOT NULL ORDER BY c.id LIMIT 1"
      ).get();
      if (!coded) {
        record(checkName, false, { note: "No existing coded Image card is available", raw: captureEvidence(await page.content(), { check: "coded-image-absent" }) });
        return;
      }
      // Stock attachment/coded.rb uncode_attachment_storage switches an ordinary
      // update from shipped coded storage to the configured upload store. A
      // colon-bearing form field is not required; prove the actual replacement.
      const png = readFileSync(new URL('../../../reference-harness/browser/files/gradient.png', import.meta.url));
      const shippedPath = new URL('../../../vendor/decko-coded-attachments/assets.js', import.meta.url);
      const shippedBefore = fileDigest(readFileSync(shippedPath));
      const row = () => database().prepare('SELECT codename,db_content FROM cards WHERE id=? AND trash=0').get(coded.id);
      const observed = { codedCard: coded, replacementSha256: fileDigest(png) };
      try {
        const original = await page.request.get(stack.origin + '/files/' + coded.db_content);
        const originalBytes = await original.body();
        observed.original = { status: original.status(), bytes: originalBytes.length, sha256: fileDigest(originalBytes) };
        const edit = await page.goto(stack.origin + '/' + encodeURIComponent(coded.name) + '?view=edit', { waitUntil: 'load' });
        observed.editStatus = edit.status();
        const input = page.locator('form.card-form input[type="file"]').first();
        observed.fileInputOffered = await input.count() > 0;
        if (!observed.fileInputOffered) throw Error('Coded Image editor has no upload input');
        const form = input.locator('xpath=ancestor::form');
        const actionPath = new URL(await form.getAttribute('action'), stack.origin).pathname;
        await input.setInputFiles({ name: 'gradient.png', mimeType: 'image/png', buffer: png });
        const draft = form.locator('input[name="card[action_id_of_cached_upload]"]');
        await draft.waitFor({ state: 'attached', timeout: 15000 });
        await page.waitForFunction(() => /^\d+$/.test(document.querySelector('input[name="card[action_id_of_cached_upload]"]')?.value ?? ''), undefined, { timeout: 15000 });
        observed.draftActionId = await draft.inputValue();
        const pending = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === actionPath, { timeout: 15000 });
        await form.locator('.submit-button,button[type="submit"]').first().click({ timeout: 5000 });
        const saved = await pending; await saved.finished();
        observed.saveStatus = saved.status(); observed.stored = row();
        const fresh = await page.goto(stack.origin + '/' + encodeURIComponent(coded.name), { waitUntil: 'load' });
        observed.pageStatus = fresh.status();
        observed.image = await page.locator('#main img').first().evaluate(async image => {
          await image.decode().catch(() => {});
          return { src: image.src, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight };
        });
        const served = await page.request.get(observed.image.src); const servedBytes = await served.body();
        observed.served = { status: served.status(), sha256: fileDigest(servedBytes), bytes: servedBytes.length };
        const stored = await page.request.get(stack.origin + '/files/' + observed.stored.db_content);
        observed.uploadedOriginal = { status: stored.status(), matchesUpload: fileDigest(await stored.body()) === fileDigest(png) };
        const unknown = await page.request.get(stack.origin + '/files/:no_such_coded_attachment/carrierwave.svg'); await unknown.body();
        observed.unknownCodedIdentifierStatus = unknown.status();
        observed.shippedAssetSourceUnchanged = fileDigest(readFileSync(shippedPath)) === shippedBefore;
        observed.raw = captureEvidence(await page.content(), { check: 'coded-image-native-replacement', name: coded.name });
      } catch (error) {
        observed.error = error.message.split('\n')[0];
        observed.raw = captureEvidence(await page.content(), { check: 'coded-image-native-error', name: coded.name });
      } finally {
        // Existing fixture content must be restored before any later check.
        // This API request is cleanup, not credited as a native UI action.
        if (row()?.db_content !== coded.db_content) {
          const restore = await page.request.post(stack.origin + '/update/' + encodeURIComponent(coded.name), {
            headers: { origin: stack.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams({ 'card[content]': coded.db_content, 'success[redirect]': 'true' }).toString(), maxRedirects: 0,
          }); await restore.body();
          observed.restoreStatus = restore.status();
        }
        const restored = await page.request.get(stack.origin + '/files/' + coded.db_content);
        observed.restore = { stored: row(), servedStatus: restored.status(), bytesMatch: fileDigest(await restored.body()) === observed.original?.sha256 };
      }
      record(checkName,
        !observed.error && observed.original?.status === 200 && observed.saveStatus < 400
        && observed.stored?.codename === coded.codename && /^~/.test(observed.stored?.db_content ?? '')
        && observed.image?.complete && observed.image.width === png.readUInt32BE(16) && observed.image.height === png.readUInt32BE(20)
        && observed.served?.status === 200 && observed.served.sha256 !== observed.original.sha256
        && observed.uploadedOriginal?.status === 200 && observed.uploadedOriginal.matchesUpload
        && observed.shippedAssetSourceUnchanged && observed.unknownCodedIdentifierStatus === 404
        && observed.restore.stored?.db_content === coded.db_content && observed.restore.stored.codename === coded.codename
        && observed.restore.servedStatus === 200 && observed.restore.bytesMatch,
        observed);
}
