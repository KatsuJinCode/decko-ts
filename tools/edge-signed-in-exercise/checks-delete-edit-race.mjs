// checks-delete-edit-race.mjs — instrument for the delete verb's UNMEASURED
// multi-actor residue (docs/registry/instrument-coverage-matrix.md: delete
// is covered only as a single actor; nothing measures a held edit form
// submitted after another actor deleted the card).
// Two isolated browser actors, the way the conflict module is shaped:
// a member opens the edit form and holds it; an administrator deletes the
// card through the page's own confirm-guarded Delete link; the member then
// submits the stale form. The engine must refuse the stale write, keep the
// card trashed, never resurrect it under the same name, and mint no new
// history for it after the delete. Matrix rows retired when green:
// delete x multi-actor delete-vs-edit (conflict-family caveat row).
//
// Selected by `--only unmeasured-matrix` or `--only delete-edit-race`.

export const meta = { topic: "delete-edit-race" };

export const checks = [{
  name: "a stale edit form submitted after another actor deletes the card is refused without resurrecting it",
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, creds, database, record, created, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("delete-edit-race requires the disposable loopback fixture");
    const name = "HarnessDelRace_" + Date.now().toString(36);
    const before = "BEFORE_DELETE_" + name, memberEdit = "MEMBER_RACE_EDIT_" + name;
    let admin, member;
    try {
      admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      member = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      const pages = { admin: admin.page, member: member.page };
      let bothSignedIn = true;
      for (const actor of ["admin", "member"]) {
        const p = pages[actor];
        await p.goto(stack.origin + "/*signin", { waitUntil: "load" });
        const form = p.locator("form.card-form").filter({ has: p.locator('input[type="password"]') }).first();
        await form.locator('input[name="card[subcards][+*email][content]"]').fill(creds[actor].email);
        await form.locator('input[type="password"]').fill(creds[actor].password);
        const pending = p.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 });
        await form.locator('button[type="submit"]').first().click();
        const response = await pending;
        await response.finished();
        bothSignedIn &&= response.status() < 400 && (await p.context().cookies(stack.origin)).some(c => c.name === "decko_ts_session" && c.value);
      }
      record("delete-edit-race signs in both isolated browser actors", bothSignedIn, { adminId: creds.admin.id, memberId: creds.member.id });
      if (!bothSignedIn) throw Error("delete-edit-race actors were not signed in");

      created.push(name);
      const seeded = await admin.page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[name]": name, "card[type]": "Phrase", "card[content]": before, "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      });
      if (seeded.status() >= 400) throw Error("delete-edit-race fixture create refused: " + seeded.status());
      const row = () => database().prepare("SELECT id,db_content,trash FROM cards WHERE name=?").get(name);
      const cardId = row()?.id;
      if (!cardId) throw Error("delete-edit-race fixture is absent");
      const actionCount = () => database().prepare("SELECT COUNT(*) AS n FROM card_actions WHERE card_id=?").get(cardId)?.n ?? -1;

      // The member holds an open, loaded edit form.
      await member.page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const field = member.page.locator('form.card-form [name="card[content]"]:visible').first();
      await field.waitFor({ state: "visible", timeout: 20000 });
      const form = member.page.locator("form.card-form").filter({ has: member.page.locator('[name="card[content]"]:visible') }).first();
      const action = new URL(await form.getAttribute("action"), stack.origin);
      if (action.origin !== stack.origin) throw Error("member race form action leaves owned origin");
      await field.fill(memberEdit);
      record("member holds a loaded edit form with typed content", (await field.inputValue()) === memberEdit, { actorId: creds.member.id, formAction: action.pathname });

      // The administrator deletes through the card page's own confirm-guarded link.
      await admin.page.goto(stack.origin + "/" + name, { waitUntil: "load" });
      const deleteLink = admin.page.locator(`a[href^="/delete/${name}"]`).first();
      if ((await deleteLink.count()) === 0) {
        // Some renders keep the Delete control inside the edit modal; open it as the UI offers.
        await admin.page.locator("a.edit-link[href$='/edit']").first().dispatchEvent("click").catch(() => {});
        await admin.page.waitForTimeout(2000);
      }
      const deletePending = admin.page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === `/delete/${name}`, { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
      const clicked = await admin.page.evaluate(target => {
        const a = [...document.querySelectorAll('a[href^="/delete/"]')].find(x => (x.getAttribute("href") ?? "").startsWith(target));
        if (!a) return false;
        window.confirm = () => true;
        a.click();
        return true;
      }, `/delete/${name}`);
      if (!clicked) throw Error("no Delete control was reachable on the admin page for the fixture card");
      const deleted = await deletePending;
      if (deleted.e) throw deleted.e;
      await deleted.r.finished();
      await admin.page.waitForTimeout(1500);
      const afterDelete = row();
      record("admin deletes the card through the page's Delete control (card trashed)",
        deleted.r.status() < 400 && afterDelete?.trash === 1,
        { actorId: creds.admin.id, deleteStatus: deleted.r.status(), trash: afterDelete?.trash, actionsAtDelete: actionCount(), raw: captureEvidence(await admin.page.content(), { check: "race-delete", name }) });

      // The member submits the held stale form against the now-deleted card.
      const submitPending = member.page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() !== "GET", { timeout: 30000 }).then(r => ({ r }), e => ({ e }));
      await form.locator('button[type="submit"], input[type="submit"]').first().click();
      const stale = await submitPending;
      if (stale.e) throw stale.e;
      await stale.r.finished();
      await member.page.waitForTimeout(1500);
      const afterSubmit = row();
      const actionsAfterSubmit = actionCount();
      const resurrected = Number(database().prepare("SELECT COUNT(*) AS n FROM cards WHERE name=? AND trash=0").get(name)?.n ?? -1);
      record("member's stale submit is refused after the delete", stale.r.status() >= 400, { actorId: creds.member.id, submitStatus: stale.r.status(), raw: captureEvidence(await member.page.content(), { check: "race-stale-submit", name }) });
      record("the refused stale write leaves the card trashed, unchanged, and unhistorical (no resurrection, no new action)",
        afterSubmit?.trash === 1 && afterSubmit?.db_content === before && actionsAfterSubmit === actionCount() && resurrected === 0,
        { trash: afterSubmit?.trash, storedContentUnchanged: afterSubmit?.db_content === before, actionCountAfterSubmit: actionsAfterSubmit, nonTrashedRowsWithName: resurrected, submitStatus: stale.r.status(), raw: captureEvidence(await member.page.content(), { check: "race-stored-state", name }) });
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "delete-edit-race browser operation timed out";
      throw error;
    } finally {
      await member?.close().catch(() => {});
      await admin?.close().catch(() => {});
    }
  },
}];
