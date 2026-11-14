// A card's history page, graded on the acts it lists rather than on the fact
// that it answered 200.
//
// THE ROW. cap-H1 ("View a card's history page",
// tools/edge-signed-in-exercise/capabilities.json id H1) has two declared
// checks, and its own finding names both halves of what is missing:
//
//   "Act-like node count recorded but not asserted; whole HTML act/change/
//    edit regex is insufficient."
//
// Both halves are real, and they are two different defects.
//
// DEFECT ONE, THE COUNT THAT WAS RECORDED AND NEVER ASSERTED. The check is
// tools/edge-signed-in-exercise/checks-cover-b.mjs:1335-1338:
//
//   const v = await visit(`/${name}/history`);
//   const acts = await page.evaluate(() => document.querySelectorAll(".act, .card-history, [class*=history], tr").length);
//   record("H1 View a card's history page", v.status === 200 && /act|change|edit|history/i.test(v.html),
//     { card: name, status: v.status, actLikeNodes: acts });
//
// `acts` goes into the evidence and is never compared to anything. It cannot
// be: it counts `.act, .card-history, [class*=history], tr` - four selectors,
// three of which are not what Ruby emits for an act at all, and the fourth of
// which counts rows in a table Ruby does not render here.
//
// DEFECT TWO, THE REGEX. `/act|change|edit|history/i` over the whole HTML. The
// page's own URL is /<card>/history and its own slot carries the class
// history-view, so `history` alone satisfies it. The check passes on a page
// that rendered no act at all.
//
// WHAT RUBY ACTUALLY RENDERS, FROM A COMMITTED REAL-RUBY CAPTURE. This row is
// the best-pinned of the six in this tranche, because
// fixtures/captured/history-views.json is a capture of the REAL Ruby history
// views over a seeded deck, and it carries the rendered bytes AND the seed
// state that produced them.
//
// Its `probe#history` arm renders the card's own history page, and its
// `state.actions` records what the deck held. Measured on the committed file:
//
//   state.actions          6 rows (card_action ids 4979 4980 4981 4982 4983 4985)
//   action-list <ul>       6
//   action_summary-view    12 occurrences of the class name (6 slots, each
//                          carrying the name twice: the class list and the id)
//   action_id in data-slot 6, in the order 4985 4983 4982 4981 4980 4979
//
// So the committed Ruby page renders ONE ACTION ENTRY PER STORED ACTION, in
// DESCENDING act order, and the capture proves both against the seed state it
// ships with. That is the whole predicate.
//
// Each entry's bytes, from that arm, are:
//
//   <ul class="action-list w-100">
//     <li class="create">                       <- or .update / .delete
//       <div class="card-header">
//         <div class="float-end"><ins class='diffins diff-added'>RichText</ins></div>
//         <div>+child</div></div>
//       <div class="card-body">
//         <div id="...-action_summary-view"
//              class="card-slot action_summary-view ALL TYPE-rich_text ..."
//              data-card-id="N" data-card-name="History Probe Renamed+child"
//              data-slot="{&quot;view&quot;:&quot;action_summary&quot;,&quot;action_id&quot;:4983}">
//           <ins class='diffins diff-added'>child body</ins></div>
//
// The action id is IN the bytes, in the slot's own data-slot payload, as
// `action_id`. So a grader does not have to count class names to know which
// act an entry is: the entry names itself.
//
// THE ORDER IS RUBY'S, NOT AN INFERENCE. card-mod-history-0.20.0
// set/all/history/acts.rb:2-4:
//
//   def history_acts
//     @history_acts ||= Act.all_with_actions_on(history_card_ids, true).order id: :desc
//   end
//
// `.order id: :desc` again - the same clause the *recent feed uses, for the
// same reason. Newest first, on the act id, and nothing else. Both files are
// vendored verbatim under fixtures/vendor/card-mod-history-0.20.0/ and
// sha256-pinned, so a drift in the clause fails by name.
//
// ANTI-VACUITY, IN FOUR PARTS. This is where a 200-and-a-regex check has
// nothing at all.
//
//   1. COUNT. The rendered entry count must equal the stored act count for
//      that card. Not "at least one": EQUAL. A page that renders two entries
//      for six acts, or six entries for two acts, fails - and the existing
//      check passes both.
//   2. IDENTITY. Every rendered entry must carry a readable action id, and
//      those ids must be DISTINCT. Two entries claiming one action id is a
//      page that repeated an act.
//   3. THE SET. The rendered ids must be the deck's own action ids for that
//      card - read through card_actions BEFORE the page is opened. An entry
//      for an act of some other card is not this card's history.
//   4. THE ORDER. Descending by act id, read pairwise. A history page in
//      ascending order is a history page nobody can use, and nothing else on
//      this row could see it.
//
// The expected ids and their expected order are handed in from the deck. A
// grader that derived the expectation from the page it grades would grade
// nothing, and that is the one thing this module must not do.

/** The action id each rendered action entry carries, in DOCUMENT order.
 *
 *  Read from the slot's own data-slot payload (`action_id`), which is where
 *  Ruby's action_summary view puts it - the capture's data-slot reads
 *  `{"view":"action_summary","show":["action_summary"],"action_id":4983}` with
 *  the JSON HTML-escaped by the slot emitter, so both the quoted and the
 *  &quot;-escaped form are accepted and nothing else is. */
export function historyEntryActionIds(html) {
  const source = String(html ?? "");
  const ids = [];
  for (const match of source.matchAll(/action_id(?:&quot;|"|')?\s*:\s*(?:&quot;|"|')?(\d+)/gi)) {
    ids.push(Number(match[1]));
  }
  return ids;
}

/** Every act entry block the page renders: the `action-list` row's `<li>` and
 *  the action type its header names. Ruby emits one `li` per action, classed
 *  by the action type (`.create`, `.update`, `.delete`), and each carrying a
 *  `card-header` naming the affected FIELD values and a `card-body` holding
 *  the `action_summary-view` slot. */
export function historyEntries(html) {
  const source = String(html ?? "");
  const entries = [];
  for (const match of source.matchAll(/<li class="(create|update|delete)">([\s\S]*?)<\/li>/gi)) {
    const body = match[2];
    const slot = /<div id="[^"]*action_summary-view"[^>]*data-slot="([^"]*)"/i.exec(body);
    let actionId = null;
    if (slot !== null) {
      const decoded = slot[1].replace(/&quot;/g, '"');
      const id = /"action_id"\s*:\s*(\d+)/.exec(decoded);
      if (id !== null) actionId = Number(id[1]);
    }
    entries.push({
      actionType: match[1].toLowerCase(),
      actionId,
      hasSlot: /action_summary-view/i.test(body),
      hasHeader: /<div class="card-header">/.test(body),
      hasBody: /<div class="card-body">/.test(body),
    });
  }
  return entries;
}

/** Whether the page is a history view AT ALL, as Ruby's history view names
 *  itself: the slot carries the history-view class and the card's own name. The
 *  old regex's `history` match could be satisfied by this alone, which is
 *  exactly why it is graded separately from the act entries rather than
 *  instead of them. */
export function isHistoryPage(html) {
  return /class="card-slot history-view[^"]*"/i.test(String(html ?? ""));
}

/** Whether ids run strictly descending - Ruby's `.order id: :desc`. */
export function isDescending(ids) {
  for (let i = 0; i + 1 < ids.length; i += 1) {
    if (!(ids[i] > ids[i + 1])) return false;
  }
  return true;
}

/**
 * Grade one rendered card history page.
 *
 * `rendered`:
 *   html        the page's bytes
 *   storedActs  [{actionId, actId}] the deck's own acts for THAT card, newest
 *               act first, read before the page was opened. `actId` is what
 *               the order is graded on (Ruby orders card_acts.id);
 *               `actionId` is what each entry names itself with.
 *
 * Returns {ok, failures, entries, order, counts}.
 */
export function cardHistoryPage(rendered) {
  const failures = [];
  const html = rendered?.html ?? "";

  if (!isHistoryPage(html)) failures.push("notAHistoryView");

  const entries = historyEntries(html);
  const renderedIds = entries.map((entry) => entry.actionId);

  // Every entry must be a real entry: the type class, the header, the body,
  // and the summary slot.
  for (const entry of entries) {
    if (!entry.hasSlot) failures.push("entryWithoutSummarySlot");
    if (!entry.hasHeader) failures.push("entryWithoutHeader");
    if (!entry.hasBody) failures.push("entryWithoutBody");
  }
  // An entry that names no action is an entry whose identity is unknown, so
  // it cannot be counted, matched, or ordered.
  if (entries.some((entry) => entry.actionId === null)) failures.push("entryWithoutActionId");

  // Duplicates: two entries claiming one action id is a repeated act, which
  // is the same defect class the recent-changes row grades on the feed.
  if (renderedIds.some((id) => id !== null && renderedIds.indexOf(id) !== renderedIds.lastIndexOf(id))) {
    failures.push("duplicateActionEntries");
  }

  const stored = Array.isArray(rendered?.storedActs) ? rendered.storedActs : null;
  if (stored === null || stored.length === 0) {
    // No expectation means no grade. Reported rather than defaulted to pass:
    // a driver that could not read the deck's acts has measured nothing.
    failures.push("noStoredActsToCompare");
    return { ok: false, failures: [...new Set(failures)], entries, order: renderedIds, counts: { rendered: entries.length, stored: 0 } };
  }

  // 1. COUNT, exactly. Not "at least one".
  if (entries.length !== stored.length) failures.push("actCountMismatch");

  // 2. THE SET: the rendered ids are the deck's own action ids for this card.
  const renderedSet = [...new Set(renderedIds.filter((id) => id !== null))].sort((a, b) => a - b);
  const storedSet = [...new Set(stored.map((row) => Number(row.actionId)))].sort((a, b) => a - b);
  if (
    renderedSet.length !== storedSet.length ||
    renderedSet.some((id, index) => id !== storedSet[index])
  ) {
    failures.push("wrongActSet");
  }

  // 3. THE ORDER, on the act ids - which is what Ruby orders.
  //    The rendered entries name ACTION ids and the deck knows both, so the
  //    rendered act-id sequence is the deck's act id for each rendered entry.
  const actIdFor = new Map(stored.map((act) => [Number(act.actionId), Number(act.actId)]));
  const renderedActIds = renderedIds
    .filter((id) => id !== null)
    .map((id) => actIdFor.get(id))
    .filter((id) => id !== undefined);
  if (renderedActIds.length !== entries.length) failures.push("unmappedEntries");
  else if (!isDescending(renderedActIds)) failures.push("notNewestFirst");

  // The deck's own order must itself be the descending one the module claims;
  // otherwise the comparison above would be against a wrong expectation.
  const storedActIds = stored.map((row) => Number(row.actId));
  if (!isDescending(storedActIds)) failures.push("deckOrderNotDescending");

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    entries,
    order: renderedIds,
    renderedActIds,
    counts: {
      rendered: entries.length,
      stored: stored.length,
      byType: entries.reduce((acc, entry) => ({ ...acc, [entry.actionType]: (acc[entry.actionType] ?? 0) + 1 }), {}),
    },
  };
}

/** The check names each leg records, so a red names WHICH claim failed. The
 *  four are graded apart because they fail apart: a page can list the right
 *  acts in the wrong order, list the wrong acts in the right order, list one
 *  act twice, or answer 200 and render none. */
export const CARD_HISTORY_CHECKS = Object.freeze({
  surface: "the card's history view renders as a history view, not as any 200",
  count: "the history page renders one act entry per stored act, the count asserted",
  acts: "every act entry names its own action, and the set is the card's own acts",
  order: "the history page lists its acts newest first, the way Ruby's history_acts orders them",
});