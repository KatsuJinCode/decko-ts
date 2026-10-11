// An unknown pointer/list item's read verdict is PER NEST, not per deck.
//
// Ruby builds the item's phantom FRESH for every nest fetch
// (card-mod-collection set/all/item.rb:242-248 — `Card.fetch name, new:
// new_unknown_item_args(args)`) and the read walk runs on THAT card
// (view/permission.rb:19-23 -> ok?(:read) -> permission_rule_id, whose
// type-scoped candidate follows the card's own type, which is the HOST's
// item_type_name from item.rb:149-158). Two hosts, one shared item name,
// therefore get two independent verdicts.
//
// The engine computed the right per-nest verdict
// (RenderEngine#pointerItemVerdict, keyed `${hostKey}|${itemKey}`) and then
// let the RENDERED BODY re-decide through `isDenied`, which reads
// `deniedVerdictsByKey` — the DECK-GLOBAL map that
// RenderEngine#ensurePointerItemVerdicts fills ONCE per item key
// ("first computation wins", pointerItemGlobalVerdictDone). An item line
// that appears on many hosts therefore inherited whichever host the run
// touched FIRST.
//
// Captured exemplar (expected-v2/view-lane recapture-raw-shard-000000.jsonl,
// `Quicksilver+Core Project`, corpus card id 802, content = the single item
// line `mytho-psychology`): that name is an item line on ~30 corpus cards.
// Under `Quicksilver+Core Project` the phantom is Project-typed (corpus
// type card 398) and its own read verdict is TRUE, and the oracle renders the
// FULL bar (bar-body row / card-title / wanted-card menu). Rendered after
// another card had folded the item denied, the global map said denied and the
// port emitted the two-span denied body instead — the view lane entry was
// 1,605 bytes short (probe-view-lane-byte-divergence.mjs, region 2/2,
// `regionDeltaSum=-1605`).
//
// BOTH ORDERINGS are pinned, so the fix cannot degenerate into "just delete
// the global entry" (which would over-allow the denying host). Measured this
// lane, base = 9689bf9:
//
//   render order      denier host       reader host
//   ----------------  ----------------  -----------------
//   base              denied            denied   <- DEFECT
//   with the fix      denied            full bar
//   reader first      denied (2nd)      full bar (1st, unchanged)
//
// The two gates that re-decide through the global map are both exercised:
//   * views.ts#miniBarView — the substituted :mini_bar body. Reverting only
//     the `pointerItemReadVerdict` assignment in renderUnknownPointerListItem
//     fails the first ordering here;
//   * format.ts#renderView's view-permission gate — the mini_bar's CHILD
//     views (bar_left and bar_menu declare no `unknown:`, so they render AS
//     REQUESTED and are gated). Without that half the bar-menu renders but
//     bar_left is still a quiet denial span, which the byte probe reports as
//     the +3 residual (card-title span vs denied span).

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

const SHARED_ITEM = "shared phantom item";
const DENIED_SPAN = '<span class="denied"';

async function seedBaseDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });
  await seedCard(s, { id: 2979, name: "consideration", typeId: 5 });
  await seedCard(s, { id: 22281, name: "BasicCs", codename: "basic_c", typeId: 5 });
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 10, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 11, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
  await seedCard(s, { id: 12, name: "Anonymous", codename: "anonymous", typeId: 2 });
  // *all+*read = "Anyone": the deck's readable rule, what a consideration-typed
  // phantom falls through to.
  await seedCard(s, {
    id: 800,
    name: "*all+*read",
    leftId: 274,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  await seedReference(s, 800, 10, "anyone", "L");
  // BasicCs+*type+*read = "Anyone Signed In": the DENYING type rule — the
  // oracle deck's own shape (a BasicCs-typed phantom is read-denied for the
  // Anonymous viewer, which is the two-span denied body family).
  await seedCard(s, { id: 802, name: "BasicCs+*type", leftId: 22281, rightId: 259, typeId: 259 });
  await seedCard(s, {
    id: 801,
    name: "BasicCs+*type+*read",
    leftId: 802,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone Signed In",
  });
  await seedReference(s, 801, 11, "anyone_signed_in", "L");
}

/** A List host whose *content_options rule resolves the given item type
 *  (the corpus's cql JSON spec shape, rules 410/498/501) and whose content is
 *  the SHARED item line, so the two hosts contend for one item key. */
async function seedTypedListHost(
  s: RenderTestStorage,
  name: string,
  itemTypeName: string,
  hostId: number,
): Promise<void> {
  await seedCard(s, { id: hostId, name, typeId: 47, dbContent: SHARED_ITEM });
  await seedCard(s, { id: hostId + 1, name: `${name}+*self`, leftId: hostId, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: hostId + 2,
    name: `${name}+*self+*content options`,
    leftId: hostId + 1,
    rightId: 701,
    typeId: 30,
    dbContent: `{"type":"${itemTypeName}"}`,
  });
}

async function seedContendingPair(s: RenderTestStorage, base: number): Promise<void> {
  await seedTypedListHost(s, `denier host ${base}`, "BasicCs", base);
  await seedTypedListHost(s, `reader host ${base}`, "consideration", base + 100);
}

describe("an unknown pointer/list item's read verdict is per nest, not the deck-global first fold", () => {
  it("readable host after denying host: full bar (bar_left and bar_menu both pass the gate)", async () => {
    storage = await createRenderTestStorage();
    await seedBaseDeck(storage);
    await seedContendingPair(storage, 90000);

    // First fold wins globally: BasicCs+*type+*read denies the Anonymous
    // viewer, so deniedVerdictsByKey[shared item] is now true.
    const denier = await storage.engine.render("denier host 90000", "content");
    expect(denier).toContain(DENIED_SPAN);
    expect(denier).not.toContain("bar-body row g-0");
    expect(denier).toMatch(/<div class='bar [^']*TYPE-basic_c[^']*with-bar-menu/);

    // The reader host's OWN walk says its phantom reads (consideration has no
    // type read rule, so it falls through to *all+*read = Anyone). Ruby's
    // per-nest phantom makes this the full bar; the deck-global map made it a
    // denial.
    const reader = await storage.engine.render(`reader host ${90000}`, "content");

    expect(reader).toContain("bar-body row g-0");
    expect(reader).toMatch(/class="card-title" title="shared phantom item"/);
    expect(reader).not.toContain(DENIED_SPAN);
    expect(reader).toMatch(/class="card-slot mini_bar-view [^"]*TYPE-consideration[^"]*"/);
    expect(reader).toMatch(/<div class='bar [^']*TYPE-consideration[^']*with-bar-menu/);
  });

  it("reader host rendered FIRST leaves the denying host denied (no over-allow)", async () => {
    storage = await createRenderTestStorage();
    await seedBaseDeck(storage);
    await seedContendingPair(storage, 91000);

    const reader = await storage.engine.render(`reader host ${91000}`, "content");
    expect(reader).toContain("bar-body row g-0");
    expect(reader).not.toContain(DENIED_SPAN);

    // The global entry is now readable; the denying host's own verdict must
    // still decide its body, or the fix degenerated into dropping the entry.
    const denier = await storage.engine.render("denier host 91000", "content");
    expect(denier).toContain(DENIED_SPAN);
    expect(denier).not.toContain("bar-body row g-0");
  });
});
