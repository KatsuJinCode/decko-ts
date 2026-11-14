// checks-search-anonymous-filter.mjs - the permission-filtered anonymous
// search the enumeration audit's gap 24 names
// (docs/runs/enumeration-audit-2026-10-25.md part A5;
// docs/runs/enumeration-audit-2026-10-25.gaps.json entry 24, element "the
// permission-filtered anonymous search (journey search-filtered-anonymous)").
//
// THE JOURNEY IS THE SPEC. reference-harness/browser/journeys/synthetic-v1.json,
// journey search-filtered-anonymous, covers ["searches", "permission
// filtering"], and its steps are exactly four:
//   visit "/" - fill #query_keyword "Memo" - press Enter - observe
//   "anonymous results".
// The audit's why_no_row: "no capability names it; the roster's search rows
// cover keyword and CQL search, not permission filtering of the result set."
//
// WHAT THE OBSERVATION MEANS. Ruby's Query applies the viewer's read rules
// at the relation level, before the limit closes the window - the port
// carries the same seam (the render engine's cqlPermissionOptions, the
// comment at the :search_box_complete preparation in src/card/render.ts
// names it "Ruby's Query applies the viewer's read rules at the relation
// level"). So the result set an anonymous visitor reads holds only cards
// the anonymous reader may read. This module builds the contrast the
// journey's observation needs: two cards whose names carry the searched
// term, one readable by anyone and one whose *self+*read rule names only
// [[Administrator]] and whose content carries a secret token, then runs the
// journey's own four steps in a signed-out browser, then runs the same
// search as the administrator as the control leg, so the anonymous absence
// is graded as the read rule and not as a search miss.
//
// The deck's *search cql sorts by relevance, and the port maps Ruby's
// deprecated "relevance" sort to updated_at descending (src/cql/constants.ts),
// so the fixtures - written seconds before the search - head the result set
// on both legs whatever else the term matches.
//
// Selected by `--only search-anonymous-filter`.

export const meta = { topic: "search-anonymous-filter", capabilityIds: ["N12"] };

export const capabilityChecks = {
  N12: [
    "N12 the anonymous navbox search for a term lists a card the anonymous reader may read",
    "N12 the anonymous navbox search for the same term omits the card whose read rule names only Administrator",
    "N12 the restricted card's name and secret content appear nowhere in the anonymous results page",
    "N12 the same search as administrator lists the restricted card, so the anonymous absence is the read rule and not a search miss",
  ],
};

/** The result-card names a search page lists: the first path segment of
 *  every same-origin anchor in the main slot (the read a person's eye
 *  makes; the same shape checks-search-suggest-match.mjs grades). */
async function listedCardNames(page) {
  return page.evaluate(() => {
    const main = document.querySelector("#main") ?? document.body ?? null;
    const names = new Set();
    for (const a of (main?.querySelectorAll("a[href]") ?? [])) {
      const url = new URL(a.getAttribute("href"), location.origin);
      if (url.origin !== location.origin) continue;
      const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
      const cardName = segments[0] ?? "";
      if (cardName && !cardName.startsWith("*") && !["new", "edit"].includes(cardName.toLowerCase())) names.add(cardName);
    }
    return [...names];
  });
}

/** A card row by name, or by the junction pair when the name column is
 *  null (the engine writes NULL names for compound cards, so a rule card
 *  such as "<Name>+*self+*read" resolves through left_id and right_id). */
function resolveCard(db, name) {
  const direct = db.prepare("SELECT id,name FROM cards WHERE name=? AND trash=0").get(name);
  if (direct !== undefined) return direct;
  const joint = name.lastIndexOf("+");
  if (joint < 1 || joint === name.length - 1) return undefined;
  const left = resolveCard(db, name.slice(0, joint));
  const right = resolveCard(db, name.slice(joint + 1));
  if (left === undefined || right === undefined) return undefined;
  return db.prepare("SELECT id,name FROM cards WHERE left_id=? AND right_id=? AND trash=0").get(left.id, right.id);
}

export const checks = [
  {
    name: "an anonymous visitor's keyword search returns a permission-filtered result set",
    only: "search-anonymous-filter",
    run: async ctx => {
      const { stack, creds, database, record, created, captureEvidence } = ctx;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname))
        throw Error("search-anonymous-filter requires the disposable loopback fixture");
      const stamp = Date.now().toString(36);
      const publicName = "Memo_Harness_" + stamp + "_anyone";
      const restrictedName = "Memo_Harness_" + stamp + "_admin";
      const secret = "ANON_SEARCH_SECRET_" + stamp;
      const readRule = restrictedName + "+*self+*read";
      let admin;
      let anon;
      try {
        // the administrator who builds the two fixtures and the read rule
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
        if (response.status() >= 400) throw Error("search-anonymous-filter admin was not signed in");

        const post = async (path, fields) =>
          page.context().request.post(stack.origin + path, {
            headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
            data: new URLSearchParams(fields).toString(),
            maxRedirects: 0,
          });
        for (const [name, content] of [
          [publicName, "anonymous search fixture readable by anyone " + stamp],
          [restrictedName, "anonymous search fixture restricted to administrators, secret " + secret],
          [readRule, "[[Administrator]]"],
        ]) {
          created.push(name);
          const createResponse = await post("/card/create", {
            "card[name]": name,
            "card[type]": "Phrase",
            "card[content]": content,
            "success[redirect]": "true",
          });
          if (createResponse.status() >= 400) throw Error("search-anonymous-filter fixture create refused: " + name);
        }
        const stored = () =>
          (resolveCard(database(), publicName) !== undefined ? 1 : 0) +
          (resolveCard(database(), restrictedName) !== undefined ? 1 : 0) +
          (resolveCard(database(), readRule) !== undefined ? 1 : 0);
        if (stored() !== 3) throw Error("search-anonymous-filter fixtures did not store");

        // THE JOURNEY'S STEPS, signed out: visit / - fill #query_keyword
        // "Memo" - press Enter - observe the anonymous results.
        anon = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const anonCookies = await anon.page.context().cookies(stack.origin);
        const signedOut = !anonCookies.some(c => c.name === "decko_ts_session" && c.value);
        await anon.page.goto(stack.origin + "/", { waitUntil: "load" });
        await anon.page.fill("#query_keyword", "Memo");
        const navigated = anon.page.waitForURL(/\/\*search/, { timeout: 30000 }).catch(() => null);
        await anon.page.press("#query_keyword", "Enter");
        const landing = await navigated;
        await anon.page.waitForLoadState("load").catch(() => undefined);
        await anon.page.waitForTimeout(1500);
        const anonHtml = await anon.page.content();
        const anonNames = await listedCardNames(anon.page);

        record(
          capabilityChecks.N12[0],
          signedOut && landing !== null && anonNames.includes(publicName),
          {
            actor: "anonymous",
            signedOut,
            landedOn: anon.page.url(),
            term: "Memo",
            publicFixture: publicName,
            listedPublic: anonNames.includes(publicName),
            resultCount: anonNames.length,
            results: anonNames.slice(0, 40),
          },
        );
        record(
          capabilityChecks.N12[1],
          signedOut && !anonNames.includes(restrictedName),
          {
            actor: "anonymous",
            signedOut,
            restrictedFixture: restrictedName,
            listedRestricted: anonNames.includes(restrictedName),
            resultCount: anonNames.length,
            results: anonNames.slice(0, 40),
          },
        );
        record(
          capabilityChecks.N12[2],
          !anonHtml.includes(secret) && !anonHtml.includes(restrictedName),
          {
            actor: "anonymous",
            secretVisible: anonHtml.includes(secret),
            restrictedNameVisible: anonHtml.includes(restrictedName),
            pageSha256: undefined,
            raw: captureEvidence(anonHtml, { check: "anonymous-search-results", term: "Memo" }),
          },
        );

        // the control leg: the same search as the administrator
        const adminSearch = await page.goto(stack.origin + "/*search?query[keyword]=" + encodeURIComponent("Memo"), { waitUntil: "load" });
        await page.waitForTimeout(1500);
        const adminHtml = await page.content();
        const adminNames = await listedCardNames(page);
        record(
          capabilityChecks.N12[3],
          adminSearch?.status() !== undefined && adminSearch.status() < 400 && adminNames.includes(publicName) && adminNames.includes(restrictedName),
          {
            actor: "admin",
            status: adminSearch?.status() ?? null,
            publicFixture: publicName,
            restrictedFixture: restrictedName,
            listedPublic: adminNames.includes(publicName),
            listedRestricted: adminNames.includes(restrictedName),
            resultCount: adminNames.length,
            results: adminNames.slice(0, 40),
            raw: captureEvidence(adminHtml, { check: "admin-search-results", term: "Memo" }),
          },
        );
      } finally {
        await anon?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },
];
