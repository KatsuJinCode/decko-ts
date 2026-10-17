// checks-system-delete-refusal.mjs — instrument for R4, an UNMEASURED row in
// docs/registry/instrument-coverage-matrix.md:
//   R4 "Refuse to delete a system card" (no instrument of any kind).
// The pinned supplemental contract (capabilities.json R4 check text):
// "system-card deletion returns protected-card 422 without product writes".
// An administrator — the actor for whom delete normally works — first drives
// the real card page to record what delete surface the UI offers for a system
// card, then walks the delete endpoint the way the UI's own link does and
// asserts the protected-card refusal and that the stored card is untouched:
// trash still 0, content unchanged, no new history.
// Matrix rows retired when green: delete R4.
//
// Selected by `--only unmeasured-matrix` or `--only system-delete-refusal`.

export const meta = { topic: "system-delete-refusal", capabilityIds: ["R4"] };

export const checks = [{
  name: "an administrator's delete of a system card is refused as protected (422) without product writes",
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, creds, database, record, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("system-delete-refusal requires the disposable loopback fixture");
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
      if (signedIn.status() >= 400) throw Error("system-delete actor was not signed in: " + signedIn.status());

      // A low-impact system card, present in the deck, that no other check reads.
      const candidates = ["*credit", "*thanks", "*favicon", "*logo", "*sidebar"];
      const target = candidates.find(name => database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(name) !== undefined);
      if (!target) throw Error("no known system card from the safe list exists in this deck: " + candidates.join(", "));
      const row = () => database().prepare("SELECT id,db_content,trash FROM cards WHERE name=? AND trash=0").get(target);
      const start = row();
      if (!start) throw Error("system card vanished before the refusal could be exercised: " + target);
      const actionCount = () => database().prepare("SELECT COUNT(*) AS n FROM card_actions WHERE card_id=?").get(start.id)?.n ?? -1;
      const actionsBefore = actionCount();

      // What the real UI offers: does the system card's page expose any Delete control at all?
      await page.goto(stack.origin + "/" + encodeURIComponent(target), { waitUntil: "load" });
      const uiSurface = await page.evaluate(() => ({
        deleteLinks: [...document.querySelectorAll('a[href^="/delete/"]')].map(a => a.getAttribute("href")),
        editLinks: [...document.querySelectorAll("a.edit-link[href$='/edit']")].length,
      }));
      record("the system card's own page surface is recorded before the refusal is exercised",
        uiSurface.deleteLinks.every(href => href.startsWith("/delete/")),
        { actorId: creds.admin.id, target, uiSurface, raw: captureEvidence(await page.content(), { check: "system-delete-surface", target }) });

      // The contract: the delete endpoint refuses a system card as protected, without product writes.
      const response = await page.context().request.get(stack.origin + "/delete/" + encodeURIComponent(target), { maxRedirects: 0, headers: { origin: stack.origin } });
      const body = await response.text();
      const after = row();
      const untouched = after !== undefined && after.trash === 0 && after.db_content === start.db_content && actionCount() === actionsBefore;
      record(capabilityRecordName(target), response.status() === 422 && untouched,
        { actorId: creds.admin.id, target, status: response.status(), trash: after?.trash, contentUnchanged: after?.db_content === start.db_content, actionCountUnchanged: actionCount() === actionsBefore, actionsBefore, actionsAfter: actionCount(), bodyHead: body.slice(0, 200), raw: captureEvidence(body, { check: "system-delete-refusal", target }) });
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "system-delete-refusal browser operation timed out";
      throw error;
    } finally {
      await admin?.close().catch(() => {});
    }
  },
}];
function capabilityRecordName(target) {
  return `R4 deleting the system card ${target} returns protected-card 422 and stores no product write`;
}
