// checks-create-permission.mjs — instrument for the permission-gated UNMEASURED
// rows in docs/registry/instrument-coverage-matrix.md:
//   P2 "Member denied create of a restricted type" (no instrument of any kind)
//   P7-shaped denial surface (crawl-found live defect "denial rendered as a
//   create form" — no instrument measured it; this module does).
// An administrator creates a dedicated cardtype whose *type+*create rule is
// [[Administrator]] only; a member then attempts the create twice — through
// the real /new/<Type> form surface and through a browser-side create POST —
// and the module verifies the refusal, that no card row is stored, and that
// the denial is NOT rendered as a create form. An administrator positive
// control through the same form proves the restriction is rule-driven.
// Matrix rows retired when green: permission-gated views P2 (+P7 affordance
// class for create denial).
//
// Selected by `--only unmeasured-matrix` or `--only create-permission`.

export const meta = { topic: "create-permission", capabilityIds: ["P2"] };
export const capabilityChecks = {
  P2: [
    "P2 the create-only rule card stores an actual Administrator reference",
    "P2 member's create POST for the restricted type is refused and stores nothing",
    "P2 member's /new/<Type> denial is not rendered as a create form",
    "P2 admin positive control: the same form creates for the administrator",
  ],
};

export const checks = [{
  name: "a member is denied creating a card of an administrator-only type, without a create-form denial surface",
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, creds, database, record, created, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("create-permission requires the disposable loopback fixture");
    const stamp = Date.now().toString(36);
    const typeName = "HarnessP2Type_" + stamp, cardName = "HarnessP2Card_" + stamp;
    const ruleName = typeName + "+*type+*create";
    let admin, member;
    try {
      admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      member = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      const pages = { admin: admin.page, member: member.page };
      for (const actor of ["admin", "member"]) {
        const p = pages[actor];
        await p.goto(stack.origin + "/*signin", { waitUntil: "load" });
        await p.fill('input[name="card[subcards][+*email][content]"]', creds[actor].email);
        await p.fill('input[type="password"]', creds[actor].password);
        const pending = p.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 });
        await p.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
        const response = await pending;
        await response.finished();
        if (response.status() >= 400) throw Error("create-permission actor was not signed in: " + actor);
      }
      const post = async (page, path, fields) => page.context().request.post(stack.origin + path, {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams(fields).toString(), maxRedirects: 0,
      });

      created.push(typeName, ruleName);
      const typeCreate = await post(admin.page, "/card/create", { "card[name]": typeName, "card[type]": "CardType", "card[content]": "harness restricted type " + stamp, "success[redirect]": "true" });
      if (typeCreate.status() >= 400) throw Error("restricted cardtype fixture refused: " + typeCreate.status());
      const ruleCreate = await post(admin.page, "/card/create", { "card[name]": ruleName, "card[type]": "Phrase", "card[content]": "[[Administrator]]", "success[redirect]": "true" });
      if (ruleCreate.status() >= 400) throw Error("create-rule fixture refused: " + ruleCreate.status());
      const typeId = database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(typeName)?.id;
      const ruleRow = database().prepare("SELECT db_content FROM cards WHERE name=? AND trash=0").get(ruleName);
      const adminRoleId = database().prepare("SELECT id FROM cards WHERE codename='administrator' AND trash=0 ORDER BY id LIMIT 1").get()?.id;
      const reference = database().prepare("SELECT referee_id FROM card_references WHERE referer_id=(SELECT id FROM cards WHERE name=? AND trash=0)").get(ruleName);
      record(capabilityChecks.P2[0], typeId !== undefined && ruleRow?.db_content === "[[Administrator]]" && adminRoleId !== undefined && reference?.referee_id === adminRoleId,
        { actorId: creds.admin.id, typeId, storedRule: ruleRow?.db_content, refereeMatchesAdministrator: reference?.referee_id === adminRoleId });

      // The member's create POST through the browser session is refused; nothing is stored.
      const memberCardRow = () => database().prepare("SELECT id,type_id,trash FROM cards WHERE name=?").get(cardName);
      const memberAttempt = await member.page.evaluate(async ({ origin, cardName, typeName }) => {
        const r = await fetch(origin + "/card/create", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ "card[name]": cardName, "card[type]": typeName, "card[content]": "member must not create this", "success[redirect]": "true" }).toString(),
        });
        return { status: r.status, url: r.url };
      }, { origin: stack.origin, cardName, typeName });
      const storedRow = memberCardRow();
      record(capabilityChecks.P2[1], memberAttempt.status >= 400 && storedRow === undefined,
        { actorId: creds.member.id, attemptStatus: memberAttempt.status, landedOn: memberAttempt.url, storedRow: storedRow ?? null, nothingStored: storedRow === undefined });

      // The member's /new/<Type> surface must not answer a denial with a create form (P7 shape).
      const newPageResponse = await member.page.goto(stack.origin + "/new/" + encodeURIComponent(typeName), { waitUntil: "load" });
      const newHtml = await member.page.content();
      const createFormOffered = await member.page.evaluate(() => {
        const form = [...document.querySelectorAll("form.card-form")].find(f => (f.getAttribute("action") ?? "").includes("/card/create") || f.querySelector('input[name="card[name]"]'));
        return form ? { action: form.getAttribute("action"), hasNameField: form.querySelector('input[name="card[name]"]') !== null } : null;
      });
      record(capabilityChecks.P2[2], !(newPageResponse.status() < 400 && createFormOffered !== null),
        { actorId: creds.member.id, status: newPageResponse.status(), createFormOffered, denialIsFormFree: !(newPageResponse.status() < 400 && createFormOffered !== null), raw: captureEvidence(newHtml, { check: "p2-new-type-denial", typeName }) });

      // Administrator positive control through the same restricted type.
      const adminAttempt = await admin.page.evaluate(async ({ origin, cardName, typeName }) => {
        const r = await fetch(origin + "/card/create", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ "card[name]": cardName, "card[type]": typeName, "card[content]": "administrator control", "success[redirect]": "true" }).toString(),
        });
        return { status: r.status, url: r.url };
      }, { origin: stack.origin, cardName, typeName });
      created.push(cardName);
      const adminRow = memberCardRow();
      record(capabilityChecks.P2[3], adminAttempt.status < 400 && adminRow !== undefined && adminRow.type_id === typeId && adminRow.trash === 0,
        { actorId: creds.admin.id, attemptStatus: adminAttempt.status, storedRow: adminRow ?? null, typeHonored: adminRow?.type_id === typeId });
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "create-permission browser operation timed out";
      throw error;
    } finally {
      await member?.close().catch(() => {});
      await admin?.close().catch(() => {});
    }
  },
}];
