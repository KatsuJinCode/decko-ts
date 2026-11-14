// The Changes link's page, graded on Ruby's own order clause instead of on
// "the card this run just made is somewhere near the top".
//
// THE ROW. cap-N5 ("Changes link lists recently updated cards, newest first",
// tools/edge-signed-in-exercise/capabilities.json id N5) has TWO declared
// checks and the roster records both as credited green in the baseline
// captures. The row still sits at partial, and its own finding explains the
// residue: the 2026-10-17 rewrite fixed WHICH nodes are read but not WHAT
// ORDER is asserted. The surviving assertion is positional - "the just-created
// card is at index <= 1 of the first six rows" (checks-cover-b.mjs, the N5
// attempt). A predicate like that is satisfied by a page in almost any order
// that happens to put a fresh card near the front: it never compares two acts
// to each other, so an ascending feed, an alphabetical feed and a feed that
// merely happens to start with the newest card all pass it.
//
// WHAT RUBY ORDERS BY. The Changes link is not a search. card-mod-defaults
// data/real.yml:31-36 seeds *main menu with:
//
//   [[:getting_started_links|Getting started]]
//   [[:recent|Recent Changes]]
//
// so "Changes" resolves to the *recent CARD, and that card's order clause is
// card-mod-search-0.20.0/set/self/recent.rb:14-21:
//
//   def recent_acts
//     limiting_scan do
//       Act.joins(ar_actions: :ar_card).distinct
//          .where(Query::CardQuery.viewable_sql)
//          .where("draft is not true")
//          .order id: :desc
//     end
//   end
//
// `.order id: :desc` on card_acts.id. Not updated_at, not created_at, not a
// relevance score: the ACT ID, descending. That is a total order over acts,
// and it is the order the row's own words ("newest first") name. It is also
// checkable pairwise, which is what this module grades.
//
// The feed is capped, and the cap is a contract too: recent.rb:1
// `ACTS_PER_PAGE = 25` and :28-33 sets `@acts_per_page = ACTS_PER_PAGE` before
// `acts_layout card.recent_acts, :absolute`. A page rendering more than 25
// acts is not this view. The port carries both numbers
// (src/card/mod-loader/mods/card-mod-history.ts:2349 RECENT_ACTS_PER_PAGE = 25,
// :2356-2381 recentActs' `ORDER BY card_acts.id DESC`).
//
// WHERE THE ACT ID IS IN THE RENDERED BYTES. The act id is not a thing a
// person sees, so a grader that wanted "newest first" could only ever count
// rows. But the renderer stamps it: accordion_item.haml (card-mod-bootstrap
// set/all/bootstrap) is rendered with the collapse id `act-id-<act.id>` -
// `data-bs-target='#act-id-11'` on the button and `id='act-id-11'` on the
// panel (src/card/mod-loader/mods/card-mod-history.ts:1674-1701 accordionItemBytes,
// called with `collapseId: \`act-id-${act.id}\`` at :1749 and :2419). So the
// page carries its own order key, and this module reads the key rather than
// guessing at recency from a timestamp string.
//
// ANTI-VACUITY, in three parts.
//   1. An EMPTY feed trivially has no out-of-order pair. The verdict requires
//      at least two acts, because "newest first" is a claim about a
//      RELATIONSHIP and a relation needs two endpoints.
//   2. An act with no readable id is not evidence of order, so an id that
//      does not parse fails as unreadableOrderKey rather than being skipped -
//      a page that renders acts in some other template cannot pass by having
//      its keys fail to extract.
//   3. The EXPECTED order is not asserted by this module; it is handed in
//      from the deck's own card_acts rows, read through the same table the
//      engine reads. A grader that computed the expectation from the page it
//      is grading would be grading nothing.
//
// WHAT THIS DOES NOT CLAIM. It grades the *recent feed's order. It does not
// re-grade the /*search relevance order the two existing N5 checks read - that
// surface is a different card with a different contract (the search card's own
// CQL sort), and its checks stay where they are. The follow-on question the
// order predicate cannot answer is whether the act the run just made is the
// one at the top; the driver records that as evidence next to the order grade
// rather than folding it into the predicate.

/** The act id token each rendered accordion item carries, in DOCUMENT order.
 *
 *  The id is read from the button's `data-bs-target='#act-id-<id>'` and
 *  cross-read against the panel's `id='act-id-<id>'`; the pair is what
 *  accordion_item.haml emits, so an item whose two halves disagree is a
 *  different template and is reported rather than silently half-read.
 *
 *  `id` is the RAW token, not a number. Ruby captures normalize numeric ids
 *  in some arms (fixtures/captured/history-views.json renders the collapse id
 *  as the literal `act-id-N`, with `data-card-id="N"` normalized the same
 *  way), while the mod-probe capture carries the true digits
 *  (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
 *  arm probe-view:373:history@set/all/history/views.rb, act-id-105328). Both
 *  are the same Ruby template, so the extractor reads the token and the ORDER
 *  claim is made only when the tokens are the integers Ruby orders by. A page
 *  whose ids are not all integers is reported unreadableOrderKey rather than
 *  being graded on a token comparison it never promised. */
export function recentFeedActIds(html) {
  const source = String(html ?? "");
  const items = [];
  for (const match of source.matchAll(/<div class=['"]accordion-item['"]>/gi)) {
    // The item's own extent: to the next item's open tag. These items are
    // siblings in one .accordion row and do not nest, so the next open tag
    // bounds this one.
    const nextOpens = [...source.matchAll(/<div class=['"]accordion-item['"]>/gi)]
      .map((m) => m.index)
      .filter((i) => i > match.index);
    const end = nextOpens.length === 0 ? source.length : nextOpens[0];
    const body = source.slice(match.index, end);
    const target = /data-bs-target=['"]#act-id-([A-Za-z0-9_-]+)['"]/i.exec(body);
    const panel = /<div class=['"][^'"]*accordion-collapse[^'"]*['"] id=['"]act-id-([A-Za-z0-9_-]+)['"]/i.exec(body);
    // The act header is the `<button>` block. Its inner shape DIFFERS by
    // renderer context in the committed Ruby arms, and this module does not
    // guess which: arm probe-view:366 renders the act card's label as bare
    // text with a badge, arm probe-view:373 renders it as an act sequence
    // plus a credit line. So the header is read as one block and reduced to
    // its text, and the two things BOTH shapes carry are graded: the actor's
    // known-card link (act_renderer.rb actor_and_ago) and a non-empty header.
    const header = /<button[^>]*>([\s\S]*?)<\/button>/i.exec(body)?.[1] ?? null;
    const text = header === null ? null : header.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    items.push({
      id: target === null ? null : target[1],
      buttonId: target === null ? null : target[1],
      panelId: panel === null ? null : panel[1],
      headerText: text === null || text === "" ? null : text,
      title: /<span class="card-title" title="([^"]*)"/i.exec(body)?.[1] ?? null,
      actor: /<a class="known-card" href="\/([^"]*)">[^<]*<\/a>/i.exec(body)?.[1] ?? null,
    });
  }
  return items;
}

/** Every strictly-descending claim that a pair of act ids makes: ids[i] must
 *  be greater than ids[i+1] for a newest-first feed. Ruby spells the same
 *  order `order id: :desc` (set/self/recent.rb:21). */
export function isStrictlyDescending(ids) {
  for (let i = 0; i + 1 < ids.length; i += 1) {
    if (!(ids[i] > ids[i + 1])) return false;
  }
  return true;
}

/**
 * Grade one rendered *recent page.
 *
 * `rendered`:
 *   html        the page's bytes
 *   expectedIds act ids the deck says belong on the page, newest first
 *               (read from card_acts, never from the page)
 *   perPage     the page's act cap (recent.rb:1 ACTS_PER_PAGE)
 *   expectedNewestActId the act the run just made, for evidence only
 *
 * Returns {ok, failures, order, items}.
 */
export function recentChangesNewestFirst(rendered) {
  const failures = [];
  const items = recentFeedActIds(rendered?.html);
  const tokens = items.map((item) => item.id);

  // 1. Every rendered item must carry a readable id on both halves, and the
  //    two halves must agree. An id that does not extract is not an act whose
  //    place in the order is known. Every item must also NAME the act and
  //    CREDIT the actor: an ordered list of unlabelled rows would satisfy the
  //    order clause while listing nothing a person can read.
  for (const item of items) {
    if (item.buttonId === null || item.panelId === null) failures.push("unreadableOrderKey");
    else if (item.buttonId !== item.panelId) failures.push("accordionIdMismatch");
    if (item.headerText === null) failures.push("unnamedAct");
    if (item.actor === null) failures.push("uncreditedActor");
  }

  // 2. Ruby orders card_acts.id, an INTEGER column. A page whose collapse ids
  //    are not all integers is a capture-normalized page or a different
  //    template, and cannot be graded on an order Ruby never expressed.
  const order = tokens.every((t) => t !== null && /^\d+$/.test(t)) ? tokens.map(Number) : null;
  if (order === null) failures.push("nonNumericOrderKey");

  // 3. "Newest first" is a relation, so a relation needs two endpoints. An
  //    empty or one-act page cannot satisfy it, and must not pass by having
  //    no out-of-order pair.
  if (tokens.length < 2) failures.push("tooFewActs");

  // 4. The order itself, pairwise.
  if (order !== null && order.length >= 2 && !isStrictlyDescending(order)) failures.push("notNewestFirst");

  // 5. The cap: recent.rb:1 ACTS_PER_PAGE. More than the cap is a different
  //    page, whatever order it is in.
  const perPage = rendered?.perPage;
  if (Number.isFinite(perPage) && tokens.length > Number(perPage)) failures.push("overPageCap");

  // 6. The deck's own expectation, when the driver read one: the same acts in
  //    the same descending order. A page that is internally descending but
  //    omits or reorders an act the deck recorded is not this feed. Both legs
  //    are reported when both are true - a page short one act is BOTH
  //    missing an act and carrying the wrong set.
  const expected = Array.isArray(rendered?.expectedIds) ? rendered.expectedIds.map(Number) : null;
  if (expected !== null && expected.length > 0) {
    if (!isStrictlyDescending(expected)) failures.push("deckOrderNotDescending");
    if (order === null) {
      failures.push("wrongActSet");
    } else {
      if (order.length !== expected.length) failures.push("actCountMismatch");
      const renderedSet = [...new Set(order)].sort((a, b) => b - a);
      const expectedSet = [...new Set(expected)].sort((a, b) => b - a);
      if (
        renderedSet.length !== expectedSet.length ||
        renderedSet.some((id, index) => id !== expectedSet[index])
      ) {
        failures.push("wrongActSet");
      } else if (order.some((id, index) => id !== expected[index])) {
        // Same acts, different places: internally descending, but not in the
        // deck's order.
        failures.push("wrongActOrder");
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    order,
    tokens,
    items,
    // Evidence, never a predicate: whether the act the run just made is the
    // one at the top. The order claim above does not depend on it.
    newestActFirst:
      typeof rendered?.expectedNewestActId === "number" && order !== null
        ? order[0] === rendered.expectedNewestActId
        : null,
  };
}

/** The check name each leg records, so the evidence names its own leg. */
export const RECENT_CHANGES_CHECKS = Object.freeze({
  order: "the Changes page orders its acts newest first by act id, the way Ruby's recent_acts does",
  nonEmpty: "the Changes page carries at least two acts, so the order is a measured relation",
});

/** card-mod-search-0.20.0 set/self/recent.rb:1 — `ACTS_PER_PAGE = 25`. The
 *  *recent core sets @acts_per_page to this before acts_layout
 *  (recent.rb:28-33), so it is a rendered contract and not a config default.
 *  It lives here rather than being read from the port because the PORT's copy
 *  is TypeScript and a .mjs driver cannot import it; the vendored gem file is
 *  what this number is claimed from, and the test pins that file's sha256. */
export const ACTS_PER_PAGE = 25;