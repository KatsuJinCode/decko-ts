// checks-recent-changes-feed-dedup.mjs — instrument for the recent-changes
// feed dedup rows that docs/registry/instrument-coverage-matrix.md carries
// with NO measuring family at all:
//   ACT-160 / crawl-defect  "the recent-changes feed shows the same act
//                            repeated 2 to 6 times" (family `none`)
//   ACT-187 / test-type-gap "the same act must not repeat in a feed"
//                            (family `none`)
// The 2026-10-16 signed-in enumeration crawl SAW the repeat; nothing
// asserted it, so no green score could ever have been red. This module does.
//
// WHAT IS RENDERED, and the dedup key. The feed is the `*recent` card's own
// core, not a CQL search (set/self/recent.rb:9-12 nils cql_content; the port's
// SELF-Xrecent branch refuses dispatch without the history seat —
// src/card/render/views.ts:1073-1099). Its bytes are one accordion item per
// act, and the renderer stamps the act's own id into that item:
// accordionItemBytes writes data-bs-target='#act-id-<act.id>' on the
// collapse button and id='act-id-<act.id>' on the panel
// (src/card/mod-loader/mods/card-mod-history.ts:1674-1701, called with
// collapseId `act-id-${act.id}` at 1749). So the act ID is IN THE RENDERED
// PAGE: that is the key a person cannot see but a dedup grader must use.
// A repeated card NAME is NOT a repeat — several distinct acts legitimately
// name the same card (two edits, an edit and a follow) — so grading on title
// would red a correct page. Titles are recorded as evidence only.
//
// ANTI-VACUITY. A feed that renders zero acts trivially has no duplicates.
// The verdict therefore requires a NON-EMPTY feed, and a second record proves
// the reader carried an act this run just made — so "dedup held" can never be
// an artifact of the accordion being empty. (Same class as the CQL row's
// "no error regex is not positive verification" finding.)
//
// SELECTED BY `--only unmeasured-matrix` (with the other matrix-lane modules)
// or `--only recent-changes-feed-dedup` (this module alone).
//
// capabilityIds declares N14 for the run record. capabilities.json has no N14
// row yet, and this module deliberately does not add one: the coverage report
// credits a capability by EXACT check-name match
// (lib/local-policy.mjs:45-58 verifiedCapabilities), so the row is a
// capabilities.json edit and whoever owns that file should add it with the
// check names below verbatim. Until then the two records below still stand as
// run evidence; they are simply not credited to a capability row.

export const meta = { topic: "recent-changes-feed-dedup", capabilityIds: ["N14"] };

export const capabilityChecks = {
  N14: ["N14 the recent-changes feed lists each act exactly once"],
  N14_SEEN: ["N14 the recent-changes feed carries an act this run just made"],
};

/** The smallest feed over which "no act repeats" is worth certifying. The
 *  crawl saw one act repeated 2 to 6 times, so a verdict needs room for a
 *  repeat to exist at all: on a one-entry feed "no duplicates" is true by
 *  arithmetic, not by evidence. The first live measurement of this check read
 *  exactly one entry (the deck snapshot carries no acts of its own — its
 *  21,676 cards arrive without card_actions), so the check now makes its own
 *  feed: one act per card it creates. */
export const MIN_FEED_ENTRIES_FOR_DEDUP = 4;

/**
 * The repeat finding, over the rendered feed's own act ids.
 * @param {{actId: string}[]} entries in rendered DOM order
 * @returns {{actId: string, count: number, at: number[]}[]} each act id that
 *          appears more than once, with the row positions that repeat it
 *          (the crawl's "2 to 6 times" shape is one entry, count 2..6)
 */
export function duplicateActIds(entries) {
  const positions = new Map();
  for (const [index, entry] of entries.entries()) {
    const id = String(entry?.actId ?? "");
    if (id === "") continue; // an entry with no stamped id cannot be deduped
    if (!positions.has(id)) positions.set(id, []);
    positions.get(id).push(index);
  }
  return [...positions.entries()]
    .filter(([, at]) => at.length > 1)
    .map(([actId, at]) => ({ actId, count: at.length, at }));
}

/** The rendered order's first `limit` act ids, for a compact evidence field. */
export function actIdSequence(entries, limit = 25) {
  return entries.slice(0, limit).map(entry => String(entry?.actId ?? ""));
}

export const checks = [{
  name: capabilityChecks.N14[0],
  only: "unmeasured-matrix",
  run: async ctx => {
    const { stack, page, creds, signIn, record, created, captureEvidence, fixtureState } = ctx;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("recent-changes-feed fixture requires the disposable loopback deck");
    const signedIn = await signIn(creds.admin);
    if (signedIn?.hasSessionCookie !== true) throw Error("recent-changes-feed browser signin failed");

    // Real acts this run can be identified by: create through the app, so the
    // feed carries acts the check itself caused. MIN_FEED_ENTRIES_FOR_DEDUP
    // cards, because the local deck snapshot brings no acts of its own.
    const stamp = Date.now().toString(36);
    const created0 = "Harness_feed_" + stamp;
    for (let index = 0; index < MIN_FEED_ENTRIES_FOR_DEDUP; index += 1) {
      const name = created0 + "_" + index;
      created.push(name);
      const create = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        maxRedirects: 0,
        data: new URLSearchParams({
          "card[name]": name, "card[type]": "Basic", "card[content]": "harness recent-changes feed act",
          "success[redirect]": "true",
        }).toString(),
      });
      const stored = ctx.database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(name)?.id;
      if (create.status() >= 400 || stored === undefined) throw Error("feed act fixture was not stored: " + create.status());
    }
    const name = created0;

    const response = await page.goto(stack.origin + "/*recent", { waitUntil: "load" });
    await page.waitForSelector("#main .accordion .accordion-item", { timeout: 20000 }).catch(() => undefined);

    // Scoped to #main: an unscoped read swallowed every other card-slot under
    // the page and flipped correct pages (the N5 lesson, e184dcaa).
    const entries = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("#main .accordion .accordion-item")];
      return nodes.map(node => {
        const target = node.querySelector("[data-bs-target^='#act-id-']")?.getAttribute("data-bs-target") ?? "";
        return {
          actId: target.replace(/^#/, ""),
          collapseId: node.querySelector("[id^='act-id-']")?.getAttribute("id") ?? null,
          title: (node.querySelector(".col-8")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        };
      });
    });
    const duplicates = duplicateActIds(entries);
    const unique = new Set(actIdSequence(entries, 1e9).filter(id => id !== "")).size;
    const raw = captureEvidence(await page.content(), { check: "recent-changes-feed", name, status: response?.status?.() ?? null });

    record(capabilityChecks.N14[0],
      entries.length >= MIN_FEED_ENTRIES_FOR_DEDUP && duplicates.length === 0,
      {
        actor: "admin",
        actorId: creds.admin?.id ?? null,
        feedUrl: "/*recent",
        status: response?.status?.() ?? null,
        renderedActEntries: entries.length,
        minEntriesForDedup: MIN_FEED_ENTRIES_FOR_DEDUP,
        distinctActIds: unique,
        duplicates,
        actIdSequence: actIdSequence(entries),
        titlesSample: entries.slice(0, 12).map(entry => entry.title),
        note: entries.length < MIN_FEED_ENTRIES_FOR_DEDUP
          ? `the feed rendered ${entries.length} act entries, fewer than the ${MIN_FEED_ENTRIES_FOR_DEDUP} this verdict needs; dedup is UNVERIFIED here, not held`
          : duplicates.length === 0
            ? "each rendered act id appears once"
            : "the same act is rendered more than once in the feed",
        raw,
      });

    // Positive control: the act this run just made is in the feed. Without it a
    // reader that silently returns the wrong page (the search list that the
    // SELF-Xrecent branch exists to prevent, views.ts:1090-1099) would satisfy
    // the dedup verdict above on its own.
    const ours = entries.filter(entry => entry.title.includes(name));
    record(capabilityChecks.N14_SEEN[0],
      entries.length > 0 && ours.length > 0,
      {
        actor: "admin",
        actorId: creds.admin?.id ?? null,
        createdCard: name,
        createdCardActRows: ours.length,
        renderedActEntries: entries.length,
        firstFewTitles: entries.slice(0, 12).map(entry => entry.title),
        raw,
      });

    if (fixtureState?.fatalReason) throw Error("changes-feed fixture quarantined: " + fixtureState.fatalReason);
  },
}];