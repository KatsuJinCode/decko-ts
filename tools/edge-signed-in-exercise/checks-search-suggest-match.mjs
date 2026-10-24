// checks-search-suggest-match.mjs — precision instrument for the search
// as-you-type surfaces, related to the KNOWN-OPEN over-match:
//   - C:/localProjects/brandonDojoTech/docs/reports/silent-failure-scan-2026-10-16.md,
//     "Known class members" item 1: "Search over-match (port >=143/242 vs
//     original 127) ... case-fold fixed in bundle 0d5624c4, over-match
//     explicitly not claimed."
//   - C:/localProjects/brandonDojoTech/docs/reports/permission-system-debrief-2026-10-16.md
//     section 5: "Whole-count search divergence ... viewer scope IS rule
//     data — the divergence is again one no instrument reads."
// Scope note (honest): the known-open divergence is a WHOLE-COUNT effect on
// broad terms attributed to viewer scope and deck drift; no local oracle
// exists for broad-term counts (that is the search diagnosis lane's line).
// This instrument pins what CAN be judged locally: at a unique-term
// granularity, BOTH surfaces — the name_match JSON the nest editor fetches
// and the visible /*search results page — must return only names that
// contain the term, must contain both term fixtures, and must not return a
// non-matching control. A PASS here does NOT close the known-open
// whole-count row; a FAIL is a precision defect on its own evidence.
//
// Selected by `--only unmeasured-matrix` or `--only search-suggest-match`.

export const meta = { topic: "search-suggest-match" };
export const knownOpen = {
  bug: "search over-match: suggestion and keyword result sets include names that do not contain the term (whole-count divergence)",
  citations: [
    "C:/localProjects/brandonDojoTech/docs/reports/silent-failure-scan-2026-10-16.md (Known class members item 1)",
    "C:/localProjects/brandonDojoTech/docs/reports/permission-system-debrief-2026-10-16.md section 5 (whole-count row, search diagnosis lane)",
  ],
};

export const checks = [{
  name: "suggestions (name_match) and the visible search page return only names that contain the typed term",
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, creds, database, record, created, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("search-suggest checks require the disposable loopback fixture");
    const stamp = Date.now().toString(36);
    const term = "zzsmatch" + stamp;
    const alpha = term + "_alpha", beta = term + "_beta", control = "zzctl" + stamp + "_control";
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
      if (signedIn.status() >= 400) throw Error("search-suggest actor was not signed in: " + signedIn.status());

      // The control's content and name must not contain the term anywhere —
      // a keyword search legitimately matches content, so a term-bearing
      // control would be matched CORRECTLY and read as a false over-match.
      for (const [cardName, content] of [[alpha, "match fixture alpha"], [beta, "match fixture beta"], [control, "unrelated control body text"]]) {
        created.push(cardName);
        const response = await page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[name]": cardName, "card[type]": "Phrase", "card[content]": content, "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });
        if (response.status() >= 400) throw Error("search-suggest fixture create refused: " + cardName + " -> " + response.status());
      }
      const stored = () => database().prepare("SELECT COUNT(*) AS n FROM cards WHERE name IN (?,?,?) AND trash=0").get(alpha, beta, control)?.n ?? 0;
      record("search-suggest fixtures store two term cards and one control", stored() === 3, { term, stored: stored(), actorId: creds.admin.id });

      // Surface 1 — the name_match JSON the nest editor's autocomplete fetches.
      const suggestions = await page.evaluate(async url => {
        const r = await fetch(url, { credentials: "include", headers: { "x-requested-with": "XMLHttpRequest" } });
        return { status: r.status, body: await r.text() };
      }, stack.origin + "/*all+by name.json?view=name_match&term=" + encodeURIComponent(term));
      let suggestionNames = [];
      try {
        const parsed = JSON.parse(suggestions.body);
        suggestionNames = Array.isArray(parsed) ? parsed.map(item => typeof item === "string" ? item : String(item?.name ?? "")).filter(Boolean) : [];
      } catch { /* a non-JSON body fails the check below through the raw capture */ }
      const containsTerm = name => name.toLowerCase().includes(term.toLowerCase());
      const extraSuggestions = suggestionNames.filter(name => !containsTerm(name));
      record("name_match suggestions for a unique term return only that term's cards",
        suggestions.status === 200 && suggestionNames.includes(alpha) && suggestionNames.includes(beta) && !suggestionNames.includes(control) && extraSuggestions.length === 0,
        { term, status: suggestions.status, returned: suggestionNames, expectedFixtures: [alpha, beta], controlShouldBeAbsent: !suggestionNames.includes(control), overMatchedNames: extraSuggestions, knownOpen, raw: captureEvidence(suggestions.body, { check: "suggest-name-match", term }) });

      // Surface 2 — the visible search page a person reads after typing + Enter.
      const searchResponse = await page.goto(stack.origin + "/*search?query[keyword]=" + encodeURIComponent(term), { waitUntil: "load" });
      const html = await page.content();
      const resultNames = await page.evaluate(() => {
        const main = document.querySelector("#main") ?? document.body ?? null;
        const names = new Set();
        for (const a of (main?.querySelectorAll("a[href]") ?? [])) {
          const url = new URL(a.getAttribute("href"), location.origin);
          if (url.origin !== location.origin) continue;
          // A decko card URL's FIRST path segment is the card name, whatever
          // view follows it (/Name, /Name/board, /Name/edit).
          const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
          const cardName = segments[0] ?? "";
          if (cardName && !cardName.startsWith("*") && !["new", "edit"].includes(cardName.toLowerCase())) names.add(cardName);
        }
        return [...names];
      });
      const extraResults = resultNames.filter(name => !containsTerm(name));
      record("the visible search page for a unique term lists only that term's cards",
        resultNames.includes(alpha) && resultNames.includes(beta) && !resultNames.includes(control) && extraResults.length === 0,
        { term, pageStatus: searchResponse?.status() ?? null, returned: resultNames, expectedFixtures: [alpha, beta], controlShouldBeAbsent: !resultNames.includes(control), overMatchedNames: extraResults, knownOpen, raw: captureEvidence(html, { check: "suggest-search-page", term }) });
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "search-suggest-match browser operation timed out";
      throw error;
    } finally {
      await admin?.close().catch(() => {});
    }
  },
}];
