// checks-anonymous-denials.mjs - the four anonymous-denial checks the
// enumeration audit's gap 7 names (docs/runs/enumeration-audit-2026-10-25.md,
// A5): the capability contracts carry the four MEMBER denials (P1 read, P2
// create, P3 edit, R5 delete) and no row carried the anonymous ones. The
// check suite's own journeys record the behaviors this module grades:
// synthetic-v1.json's denied-anonymous-read (an anonymous visitor visits
// two read-restricted cards and is refused) and denied-anonymous-create
// (an anonymous visitor opens the create surface of a restricted type and
// is refused).
//
// The refusal's shape is not a guess: error.rb's loud denial is the
// oracle-pinned contract the anonymous-edit-denial row closed: the
// "Sorry!" heading and, for a signed-out visitor, the sign-in-or-up
// sentence (fixtures/captured/anonymous-edit-denial-signin.json;
// fixtures/captured/permission-denied-403-view-ruby-oracle.json pins the
// 403 status and the :denial view). The create legs mirror P2's shapes:
// the /new/<Type> denial must not be a create form, and the create POST
// must be refused with nothing stored.
//
// An administrator builds the restricted fixtures (two read-restricted
// cards; one cardtype whose *type+*create rule names only Administrator);
// an anonymous browser (a throwaway context that never signs in) then
// attempts both reads and both creates.
//
// Selected by `--only anonymous-denials`.

export const meta = { topic: "anonymous-denials", capabilityIds: ["P7"] };
export const capabilityChecks = {
  P7: [
    "P7 anonymous read of a read-restricted card is refused with the loud denial and no content",
    "P7 anonymous read of a second read-restricted card is refused the same way",
    "P7 anonymous /new/<Type> denial is not rendered as a create form",
    "P7 anonymous create POST is refused and stores nothing",
  ],
};

export const checks = [
  {
    name: "an anonymous visitor is denied reading restricted cards and creating restricted-type cards",
    only: "anonymous-denials",
    run: async ctx => {
      const { stack, creds, database, record, created, captureEvidence } = ctx;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname))
        throw Error("anonymous-denials requires the disposable loopback fixture");
      const stamp = Date.now().toString(36);
      const readName1 = "HarnessAnonRead1_" + stamp;
      const readName2 = "HarnessAnonRead2_" + stamp;
      const typeName = "HarnessAnonType_" + stamp;
      const createAttemptName = "HarnessAnonCard_" + stamp;
      const secret1 = "ANON_SECRET_ONE_" + stamp;
      const secret2 = "ANON_SECRET_TWO_" + stamp;
      const rules = [readName1 + "+*self+*read", readName2 + "+*self+*read", typeName + "+*type+*create"];
      let admin;
      let anon;
      try {
        // the administrator who builds the restricted fixtures
        admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = admin.page;
        await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
        await page.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
        await page.fill('input[type="password"]', creds.admin.password);
        const pending = page.waitForResponse(
          r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST",
          { timeout: 20000 },
        );
        await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
        const response = await pending;
        await response.finished();
        if (response.status() >= 400) throw Error("anonymous-denials admin was not signed in");

        const post = async (path, fields) =>
          page.context().request.post(stack.origin + path, {
            headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
            data: new URLSearchParams(fields).toString(),
            maxRedirects: 0,
          });
        for (const [name, content, type] of [
          [readName1, secret1, "Basic"],
          [readName2, secret2, "Basic"],
          [readName1 + "+*self+*read", "[[Administrator]]", "Phrase"],
          [readName2 + "+*self+*read", "[[Administrator]]", "Phrase"],
          [typeName, "harness anonymous-denial restricted type " + stamp, "CardType"],
          [typeName + "+*type+*create", "[[Administrator]]", "Phrase"],
        ]) {
          created.push(name);
          const response = await post("/card/create", {
            "card[name]": name,
            "card[type]": type,
            "card[content]": content,
            "success[redirect]": "true",
          });
          if (response.status() >= 400) throw Error("anonymous-denials fixture create refused: " + name);
        }

        // the signed-out visitor: a fresh throwaway context that never signs in
        anon = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const anonCookies = await anon.page.context().cookies(stack.origin);
        const signedOut = !anonCookies.some(c => c.name === "decko_ts_session" && c.value);

        // leg 1 and leg 2: the two reads (the journey's two restricted cards)
        for (const [check, name, secret] of [
          [capabilityChecks.P7[0], readName1, secret1],
          [capabilityChecks.P7[1], readName2, secret2],
        ]) {
          const response = await anon.page.goto(stack.origin + "/" + name, { waitUntil: "load" });
          const html = await anon.page.content();
          const secretVisible = html.includes(secret);
          const loudDenial = html.includes("<h1>Sorry!</h1>");
          const signInOffered = html.includes("signin-link");
          record(
            check,
            signedOut && response.status() === 403 && !secretVisible && loudDenial && signInOffered,
            {
              actor: "anonymous",
              signedOut,
              status: response.status(),
              secretVisible,
              loudDenial,
              signInOffered,
              raw: captureEvidence(html, { check: "anonymous-read-denial", name }),
            },
          );
        }

        // leg 3: the create surface must not answer its denial with a form
        const newResponse = await anon.page.goto(stack.origin + "/new/" + encodeURIComponent(typeName), {
          waitUntil: "load",
        });
        const newHtml = await anon.page.content();
        const createFormOffered = await anon.page.evaluate(() => {
          const form = [...document.querySelectorAll("form.card-form")].find(
            f => (f.getAttribute("action") ?? "").includes("/card/create") || f.querySelector('input[name="card[name]"]'),
          );
          return form ? { action: form.getAttribute("action"), hasNameField: form.querySelector('input[name="card[name]"]') !== null } : null;
        });
        record(
          capabilityChecks.P7[2],
          !(newResponse.status() < 400 && createFormOffered !== null),
          {
            actor: "anonymous",
            status: newResponse.status(),
            createFormOffered,
            denialIsFormFree: !(newResponse.status() < 400 && createFormOffered !== null),
            raw: captureEvidence(newHtml, { check: "anonymous-new-type-denial", typeName }),
          },
        );

        // leg 4: the create POST is refused and nothing is stored
        const attempt = await anon.page.evaluate(async ({ origin, cardName, typeName }) => {
          const r = await fetch(origin + "/card/create", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "card[name]": cardName,
              "card[type]": typeName,
              "card[content]": "an anonymous visitor must not create this",
              "success[redirect]": "true",
            }).toString(),
          });
          return { status: r.status, url: r.url };
        }, { origin: stack.origin, cardName: createAttemptName, typeName });
        const storedRow = () => database().prepare("SELECT id,type_id,trash FROM cards WHERE name=?").get(createAttemptName);
        record(
          capabilityChecks.P7[3],
          attempt.status >= 400 && storedRow() === undefined,
          {
            actor: "anonymous",
            attemptStatus: attempt.status,
            landedOn: attempt.url,
            storedRow: storedRow() ?? null,
            nothingStored: storedRow() === undefined,
          },
        );
      } finally {
        await anon?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },
];
