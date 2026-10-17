// checks-search-overmatch.mjs — the instrument the search over-match action
// has never had.
//
// What was red and unobserved:
//   ACT-190 in docs/registry/instrument-coverage-matrix.json (kind
//   findings-red): "search over-match: the port returns more results than the
//   original site for the same query (143+ vs 127; whole-count divergence open
//   in the debrief)". Its only entries were family `none` (the crawl's own
//   finding) plus a registry code-suite row, so no instrument could see it.
//   The two attributions on record are C:/localProjects/brandonDojoTech/docs/
//   reports/silent-failure-scan-2026-10-16.md:437-443 — "broader-than-
//   anonymous viewer scope + deck drift", with a "raw-HTML matching"
//   coherent-cause hypothesis — and checks-search-suggest-match.mjs:10-18,
//   which pins unique-term precision and states outright that "a PASS here does
//   NOT close the known-open whole-count row".
//
// What this module can and cannot close. The oracle's 127 needs stock Ruby on
// the same deck, which no local instrument can supply. What it CAN do is split
// the divergence into the two named candidate causes and measure each one on
// the local deck, which is exactly the step the debrief says was missing
// ("viewer scope IS rule data - the divergence is again one no instrument
// reads"). Both assertions below are driven by a fixture set this module owns
// end to end: a unique term stamp means no pre-existing deck row can match, so
// the expected result set is known, not inferred.
//
//   1. VIEWER SCOPE. An administrator-only card behind a `+*self+*read`
//      [[Administrator]] rule is created behind the same term. If the search
//      hands that row to an ordinary member, the divergence has a permission
//      cause and it is observable without the oracle. If the member's rows are
//      a subset of the administrator's, viewer scope is NOT leaking on this
//      path and the residue is matching breadth, not permissions.
//   2. MATCH ACCOUNTING. Every row the rendered search page returns for the
//      term must carry the term in its OWN name or its OWN stored content
//      (read back from the local deck). A row that carries it in neither is an
//      over-match on its own evidence - it is a result the query cannot
//      account for.
//
// A third datum rides along as EVIDENCE, never as a predicate: on a deck-wide
// broad term the module records how many rows the rendered page returns next
// to how many rows the deck independently matches on name-or-content. That is a
// port-vs-deck measurement, not an oracle measurement, and it is labelled
// `measured:false` if the broad read cannot complete, so a slow broad query can
// never turn this module red.
//
// Row selector: the scoped `.search-result-list > .search-result-item` walk
// established by commit e184dcaa (checks-cover-b.mjs:1053). An unscoped
// `[data-card-name]` read swallows every card-slot under #main and each row
// carries two slots, which is what made N5 red on two graded nights.
//
// Selected by `--only search-overmatch`.

export const meta = { topic: "search-overmatch" };
export const knownOpen = {
  bug: "search over-match: the port returns more result rows than the original site for the same query (whole-count divergence 143+/242 vs 127)",
  citations: [
    "C:/localProjects/brandonDojoTech/docs/reports/silent-failure-scan-2026-10-16.md:437-443 (attribution: broader-than-anonymous viewer scope + deck drift; raw-HTML matching hypothesis)",
    "C:/localProjects/brandonDojoTech/docs/reports/permission-system-debrief-2026-10-16.md:47,167 (whole-count divergence; the search diagnosis lane's row)",
    "docs/registry/instrument-coverage-matrix.json ACT-190 (findings-red, no observing instrument before this module)",
  ],
  closedByThisModule: "neither candidate cause, only their local measurement; the oracle's 127 still needs stock Ruby on the same deck",
};

const checksOut = {
  fixtures: "search-overmatch fixtures store two public term cards, a control, and an administrator-only card behind a self read rule",
  scope: "the term's search hands the administrator-only row to the administrator and withholds it from an ordinary member",
  accounting: "every row the term's search returns carries the term in its own name or its own stored content",
};
export const capabilityChecks = checksOut;

const ROW_SELECTOR = "#main .search-result-list > .search-result-item";
const canonical = (s) => s.replaceAll("_", " ").trim().toLowerCase();

export const checks = [{
  name: "search over-match decomposed into viewer scope and match accounting on the local deck",
  only: "search-overmatch",
  run: async ctx => {
    const { stack, creds, record, database, created, launchBrowser, captureEvidence, assetHosts, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("search-overmatch checks require the disposable loopback fixture");

    const stamp = Date.now().toString(36);
    const term = "zzovert" + stamp;
    const byName = term + "_byname";              // carries the term in its NAME
    const byContent = "zzbodyonly" + stamp;       // carries the term only in its CONTENT
    const control = "zznocarry" + stamp;          // carries the term nowhere
    const adminOnly = term + "_adminonly";        // carries the term in its name, readable by administrators only
    const readRule = adminOnly + "+*self+*read";

    let admin, member;
    try {
      admin = await launchBrowser({ origin: stack.origin, assetHosts });
      member = await launchBrowser({ origin: stack.origin, assetHosts });
      for (const actor of [admin, member]) {
        const p = actor.page;
        await p.goto(stack.origin + "/*signin", { waitUntil: "load" });
        await p.fill('input[name="card[subcards][+*email][content]"]', creds[actor === admin ? "admin" : "member"].email);
        await p.fill('input[type="password"]', creds[actor === admin ? "admin" : "member"].password);
        const pending = p.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 });
        await p.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
        const signedIn = await pending;
        await signedIn.finished();
        if (signedIn.status() >= 400) throw Error("search-overmatch actor was not signed in: " + signedIn.status());
      }

      const post = (path, fields) => admin.page.context().request.post(stack.origin + path, {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams(fields).toString(),
        maxRedirects: 0,
      });
      for (const [name, content, type] of [
        [byName, "public card, term is in its name", "Basic"],
        [byContent, "public card carrying " + term + " in its body only", "Basic"],
        [control, "public card carrying the term nowhere", "Basic"],
        [adminOnly, "restricted card, term is in its name", "Basic"],
        [readRule, "[[Administrator]]", "Phrase"],
      ]) {
        created.push(name);
        const response = await post("/card/create", { "card[name]": name, "card[type]": type, "card[content]": content, "success[redirect]": "true" });
        if (response.status() >= 400) throw Error("search-overmatch fixture create refused: " + name + " -> " + response.status());
      }

      // Fixture validity: the four cards exist, and the read rule really points
      // at the administrator. Without this the scope assertion below would pass
      // for the wrong reason (no rule = no restriction to leak).
      const stored = database().prepare("SELECT name FROM cards WHERE name IN (?,?,?,?) AND trash=0")
        .all(byName, byContent, control, adminOnly).map(r => r.name);
      const administratorId = database().prepare("SELECT id FROM cards WHERE codename='administrator' AND trash=0 ORDER BY id LIMIT 1").get()?.id;
      const ruleRow = database().prepare(
        "SELECT refs.referee_id FROM cards c JOIN cards rule_set ON rule_set.id=c.left_id JOIN cards setting ON setting.id=c.right_id " +
        "JOIN card_references refs ON refs.referer_id=c.id WHERE c.name=? AND rule_set.name=? AND rule_set.right_id=(SELECT id FROM cards WHERE codename='self' AND trash=0 ORDER BY id LIMIT 1) " +
        "AND setting.codename='read' AND c.trash=0").get(readRule, adminOnly);
      const fixturesValid = stored.length === 4 && administratorId !== undefined && ruleRow?.referee_id === administratorId;
      record(checksOut.fixtures, fixturesValid,
        { term, expected: [byName, byContent, control, adminOnly], stored, administratorId, readRule, ruleRefereeId: ruleRow?.referee_id ?? null });
      if (!fixturesValid) throw Error("search-overmatch fixtures are not the set this check reasons about");

      // One reader per actor, both through the rendered results page.
      const readRows = async (page) => {
        const response = await page.goto(stack.origin + "/*search?query[keyword]=" + encodeURIComponent(term), { waitUntil: "load" });
        const names = await page.evaluate((selector) => [...document.querySelectorAll(selector)]
          .map(row => row.querySelector("[data-card-name]")?.getAttribute("data-card-name"))
          .filter(name => name && name !== "*search"), ROW_SELECTOR);
        return { status: response?.status() ?? null, names: [...new Set(names)] };
      };
      const adminRows = await readRows(admin.page);
      const memberRows = await readRows(member.page);

      const adminNames = adminRows.names.map(canonical);
      const memberNames = memberRows.names.map(canonical);
      const memberSeesAdminOnly = memberNames.includes(canonical(adminOnly));
      const memberOutsideAdmin = memberNames.filter(n => !adminNames.includes(n));
      record(checksOut.scope,
        adminRows.status === 200 && memberRows.status === 200
          && adminNames.includes(canonical(adminOnly)) && !memberSeesAdminOnly
          && memberOutsideAdmin.length === 0
          && memberNames.includes(canonical(byName)) && memberNames.includes(canonical(byContent)),
        { term, selector: ROW_SELECTOR, adminNames: adminRows.names, memberNames: memberRows.names,
          adminSeesAdminOnly: adminNames.includes(canonical(adminOnly)), memberSeesAdminOnly,
          memberRowsOutsideAdminSet: memberOutsideAdmin,
          viewerScopeCause: memberSeesAdminOnly || memberOutsideAdmin.length > 0 ? "supported: the member's result set is not contained in the administrator's" : "not supported on this path: the member's rows are a subset of the administrator's",
          raw: captureEvidence(await member.page.content(), { check: "search-overmatch-member", term }) });

      // Match accounting: the deck is the independent read of what a row holds.
      const needle = "%" + term + "%";
      const rows = database().prepare(
        "SELECT name, db_content FROM cards WHERE trash=0 AND name IN (?,?,?,?)").all(byName, byContent, control, adminOnly);
      const holds = new Map(rows.map(r => [canonical(r.name), { name: r.name, inName: String(r.name).toLowerCase().includes(term), inContent: String(r.db_content ?? "").toLowerCase().includes(term) }]));
      const unexplained = adminRows.names.filter(n => { const row = holds.get(canonical(n)); return row ? !(row.inName || row.inContent) : true; });
      record(checksOut.accounting,
        adminRows.status === 200
          && adminNames.includes(canonical(byName)) && adminNames.includes(canonical(byContent))
          && !adminNames.includes(canonical(control))
          && unexplained.length === 0,
        { term, selector: ROW_SELECTOR, returned: adminRows.names,
          expectedPresent: [byName, byContent], controlMustBeAbsent: control,
          perRow: adminRows.names.map(n => holds.get(canonical(n)) ?? { name: n, inName: false, inContent: false }),
          unexplainedRows: unexplained, knownOpen,
          raw: captureEvidence(await admin.page.content(), { check: "search-overmatch-admin", term }) });

      // Deck-wide broad-term composition. EVIDENCE ONLY, never a predicate: this
      // is a port-vs-deck reading, not the oracle's 127, and a broad read that
      // cannot finish must not turn this module red.
      let composition = { measured: false, reason: "not attempted" };
      try {
        const broadTerm = ["card", "harness", "note", "topic", "data", "type"].find(t =>
          (database().prepare("SELECT COUNT(*) AS n FROM cards WHERE trash=0 AND (name LIKE ? OR db_content LIKE ?)").get("%" + t + "%", "%" + t + "%")?.n ?? 0) >= 50) ?? "card";
        const deckCount = database().prepare("SELECT COUNT(*) AS n FROM cards WHERE trash=0 AND (name LIKE ? OR db_content LIKE ?)").get("%" + broadTerm + "%", "%" + broadTerm + "%")?.n ?? 0;
        await admin.page.goto(stack.origin + "/*search?query[keyword]=" + encodeURIComponent(broadTerm), { waitUntil: "load", timeout: 30000 });
        const pageNames = await admin.page.evaluate((selector) => document.querySelectorAll(selector).length, ROW_SELECTOR);
        composition = { measured: true, broadTerm, deckNameOrContentMatches: deckCount, renderedRowsOnFirstPage: pageNames, caveat: "port-vs-deck on this checkout; NOT the oracle's count" };
      } catch (error) {
        composition = { measured: false, reason: String(error).slice(0, 160) };
      }
      record("search-overmatch records a deck-wide broad-term composition measurement as evidence", composition.measured === true,
        composition);
    } catch (error) {
      if (error?.name === "TimeoutError") fixtureState.fatalReason = "search-overmatch browser operation timed out";
      throw error;
    } finally {
      await member?.close().catch(() => {});
      await admin?.close().catch(() => {});
    }
  },
}];