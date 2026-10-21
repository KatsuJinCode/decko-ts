// Visiting a User card through the layout its own rule names, graded on the
// RESOLUTION CHAIN Ruby defines rather than on markers a check wrote itself.
//
// THE ROW. cap-N9 ("Visit a User card with the user layout",
// tools/edge-signed-in-exercise/capabilities.json id N9) has one declared
// check, and its finding is the honest admission this commit is built on:
//
//   "Bound with an honest weakness from recorded run
//    strengthened-full-harness-52fc9b7e ... which PASSes: the type and the
//    +*self+*layout rule are stored correctly (assignedTypeId 2693 =
//    expectedUserTypeId, ruleWriteStatus 303) and the page answers 200, but
//    rendered.markers are all false with order [-1,-1,-1] and an empty
//    layoutOrder, so the user layout's own header/body/footer markers were not
//    located. Until a probe decides whether the fixture markers are wrong or
//    the layout genuinely does not render them, the layout-render leg is
//    unproven and the row stays partial."
//
// All-false markers with order [-1,-1,-1] means the searched strings were not
// in the page at all - not that they were in the wrong order. That has exactly
// two possible causes and the check cannot tell them apart:
//
//   (a) THE FIXTURE'S MARKERS ARE WRONG. The check INJECTED a layout card and
//       searched for its own header/body/footer strings. If the layout's
//       chunks did not render, those strings are absent - and the surface may
//       be entirely correct.
//   (b) THE LAYOUT GENUINELY DID NOT RENDER. The rule was stored (write
//       status 303) and the page answered 200, but the page ignored it.
//
// Both produce identical evidence. That is the gap, and it is a MEASUREMENT
// gap, not a code gap.
//
// WHY THE MARKERS WERE THE WRONG INSTRUMENT. Ruby does not render a card's
// "user layout" because the card is typed User. It renders the layout card the
// card's OWN rule names, and only if that layout card has a MAIN NEST. The
// whole chain, from card-mod-layout-0.20.0 (all three files vendored and
// sha256-pinned):
//
//   set/all/process_layout.rb:29-31
//     def page_layout view
//       params[:layout] || layout_for_view(view) || layout_name_from_rule || :default
//     end
//
//   :34-36
//     def layout_name_from_rule
//       card.rule_card(:layout)&.try :first_name
//     end
//
//   :38-45  render_with_layout -> Layout.main_nest_opts(layout, self)
//   lib/card/layout.rb:75-79  main_nest_opts -> layout_class(layout_name)
//                                .new(layout_name, format).fetch_main_nest_opts
//   lib/card/layout/card_layout.rb:15-18
//     def fetch_main_nest_opts
//       find_main_nest_chunk&.options ||
//         raise(Card::Error, "no main nest found in layout \"#{@layout}\"")
//     end
//   :24-29  find_main_nest_chunk: content.each_chunk.find(&:main?)
//   :12-14  render: @format.process_content layout_card.content,
//                                    chunk_list: :references
//   lib/card/layout/unknown_layout.rb:7-18  a name that fetches to neither a
//     card layout nor a built-in renders h1 t(:layout_unknown_layout)
//
// So the gradeable facts are NOT "does the page contain these three strings".
// They are:
//
//   1. WHICH LAYOUT the page resolved to, and by WHICH arm of page_layout. A
//      page that answered 200 while resolving :default never ran the layout
//      at all - and that is indistinguishable from a correct page under a
//      marker check, because a correct page also contains the strings.
//   2. THAT the layout card's OWN content rendered (card_layout.rb:12-14
//      process_content over layout_card.content) - so the layout's chunks
//      appear as content, not as a string the checker chose.
//   3. THAT the card's own body rendered INSIDE the layout's main nest, at the
//      position the main nest occupies in the layout's content. A layout
//      that renders its parts but not around the main slot is not a layout,
//      and the existing check's own note says exactly that
//      ("graded on order as well as presence: a layout that renders its parts
//      but not around the main slot is not the user layout") without having
//      the means to measure it.
//   4. THE ERROR ARMS, which are how (a) and (b) are finally told apart. A
//      layout with NO main nest raises "no main nest found in layout
//      \"<name>\"" (card_layout.rb:17). A layout NAME that fetches to nothing
//      renders the UnknownLayout heading. Neither is a 200-with-the-strings;
//      both are DARK, and a marker check scores both as the same
//      "markers absent" finding it reports today.
//
// THE ORDER LEG IS THE ONE THE ROW ASKS FOR AND CAN NOW MEASURE. The main nest
// is found by `content.each_chunk.find(&:main?)` - the FIRST chunk whose
// reference is marked main - so the layout's own content renders in CONTENT
// ORDER with the card's body at the main nest's position. Measuring the main
// nest's index against the layout chunk order turns "the markers were not
// located" into "the main nest is at position N of M, and the body renders
// there", which is falsifiable in both directions.

/** The MAIN NEST NAME. card-1.110.0 lib/card/format/nesting/main.rb:26-28:
 *
 *     def main_nest? nest_name
 *       nest_name == "_main"
 *     end
 *
 *  A chunk is main because its nest is the `_main` SINK - there is no `main:`
 *  chunk option at all. That is why a fixture layout of
 *  header / {{_main|view: open}} / footer has a main nest even though nothing
 *  in its options mentions main, and it is the rule the predicate grades. */
export const MAIN_NEST_NAME = "_main";

/** The chunks of a layout card's content, in order, as Ruby's
 *  `Card::Content#each_chunk` walks them: each NEST reference is a chunk, and
 *  a chunk is `main?` when its nest name is the `_main` sink. `{{X}}` is a
 *  content nest and `{{X|view}}` carries the view the main nest is rendered
 *  with. The text AROUND a nest is layout content, not a chunk. */
export function layoutChunks(content) {
  const chunks = [];
  for (const match of String(content ?? "").matchAll(/\{\{([^}]+)\}\}/g)) {
    const body = match[1].trim();
    const pipe = body.indexOf("|");
    const name = (pipe === -1 ? body : body.slice(0, pipe)).trim();
    const options = pipe === -1 ? {} : parseChunkOptions(body.slice(pipe + 1));
    chunks.push({ name, view: options.view ?? null, main: name === MAIN_NEST_NAME, syntax: match[0] });
  }
  return chunks;
}

/** The `key: value` pairs after a nest's `|`, which is what Ruby's chunk
 *  options parser reads (`view: link`, `view: open`). */
function parseChunkOptions(text) {
  const options = {};
  for (const part of String(text).split(/[;,]/)) {
    const eq = part.indexOf(":");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    options[key] = value === "true" ? true : value;
  }
  return options;
}

/** Which arm of page_layout the page resolved by, and what it resolved to.
 *  `ruleName` is the first item of the card's *layout rule content, which is
 *  what layout_name_from_rule's `try :first_name` returns
 *  (process_layout.rb:34-36, over the first_name helper in set/all/item.rb's
 *  raw_item_strings path). `paramsLayout` and `layoutForView` are the two arms
 *  that precede it; `defaultLayout` is Ruby's `:default` fallback. */
export function resolvePageLayout({ ruleName, paramsLayout, layoutForView, defaultLayout = ":default" }) {
  if (paramsLayout !== undefined && paramsLayout !== null && paramsLayout !== "") {
    return { layoutName: paramsLayout, arm: "params" };
  }
  if (layoutForView !== undefined && layoutForView !== null && layoutForView !== "") {
    return { layoutName: layoutForView, arm: "layoutForView" };
  }
  if (ruleName !== undefined && ruleName !== null && ruleName !== "") {
    return { layoutName: ruleName, arm: "rule" };
  }
  return { layoutName: defaultLayout, arm: "default" };
}

/** Whether a resolved layout name can be a CARD layout: it must fetch to a
 *  card whose type is one the layout code recognises. The port's own
 *  classification (src/card/render/page.ts:965-983) accepts layout_type, html
 *  and basic, which is the same set card_layout.rb's `layouts[key]` lookup
 *  resolves to; a name that fetches to nothing is UnknownLayout. */
export function layoutKind(layoutName, { cardExists, typeCode } = {}) {
  if (layoutName === ":default") return "code-default";
  if (cardExists !== true) return "unknown";
  return ["layout_type", "html", "basic"].includes(typeCode) ? "card" : "unknown";
}

/**
 * One visit, graded.
 *
 * `visit`:
 *   html            the page's bytes
 *   ruleName        the first_name of the card's *layout rule, or null
 *   paramsLayout    the layout the REQUEST asked for, or null
 *   layoutForView   the view's own layout, or null
 *   layoutCardName  the layout card the resolved name fetched to, or null
 *   layoutCardType  that card's type codename, or null
 *   bodyMarker      a string only the card's OWN body can contain
 *   layoutMarkers   one string per layout chunk, in layout-content order
 *
 * Returns {ok, failures, resolution, kind, placement}.
 */
export function userCardLayout(visit) {
  const failures = [];
  const resolution = resolvePageLayout({
    ruleName: visit?.ruleName,
    paramsLayout: visit?.paramsLayout,
    layoutForView: visit?.layoutForView,
  });
  const kind = layoutKind(resolution.layoutName, {
    cardExists: visit?.layoutCardName != null && visit.layoutCardName !== "",
    typeCode: visit?.layoutCardType ?? null,
  });

  // 1. THE RESOLUTION. A page that answered 200 while resolving :default
  //    never ran the card's layout at all. That is the failure this row could
  //    not previously distinguish from a correct page.
  if (visit?.ruleName != null && visit.ruleName !== "") {
    if (resolution.arm !== "rule") failures.push("ruleNotHonoured");
    if (resolution.layoutName !== visit.ruleName) failures.push("wrongLayoutResolved");
  }

  // 2. THE KIND. A name that fetches to nothing is UnknownLayout, which
  //    renders a heading saying so - not a page with the layout's parts on it.
  if (kind === "unknown") failures.push("unknownLayout");

  // 3. THE LAYOUT'S OWN CONTENT rendered. card_layout.rb:12-14 processes
  //    layout_card.content, so each chunk's marker must appear on the page -
  //    but as CONTENT, at its own position, which is leg 4.
  const markers = Array.isArray(visit?.layoutMarkers) ? visit.layoutMarkers : [];
  const text = String(visit?.html ?? "");
  const positions = markers.map((marker) => text.indexOf(String(marker)));
  for (const [index, position] of positions.entries()) {
    if (markers[index] === null || markers[index] === "" ) continue;
    if (position < 0) failures.push("layoutChunkNotRendered");
  }

  // 4. THE ORDER, and the main nest. The main nest is the FIRST chunk marked
  //    main (card_layout.rb:27 `content.each_chunk.find(&:main?)`), and the
  //    card's own body renders THERE - so the body must fall between the chunk
  //    before it and the chunk after it. A layout that renders its parts but
  //    not around the main slot fails here, which is the row's own stated
  //    standard and the one it could not previously measure.
  const bodyMarker = visit?.bodyMarker;
  const bodyAt = bodyMarker == null || bodyMarker === "" ? -1 : text.indexOf(String(bodyMarker));
  let placement = null;
  if (bodyAt < 0) {
    // Without the body there is no layout to be "around"; this is the
    // all-false-markers finding the row reported, and it is now named.
    failures.push("cardBodyNotRendered");
  } else {
    const rendered = positions
      .map((position, index) => ({ index, marker: markers[index], position }))
      .filter((entry) => entry.position >= 0 && entry.marker !== null && entry.marker !== "")
      .sort((a, b) => a.position - b.position);
    const layoutChunksInOrder = rendered.map((entry) => entry.index);
    placement = {
      bodyAt,
      layoutChunkOrder: layoutChunksInOrder,
      bodyInsideLayout:
        rendered.length === 0
          ? null
          : bodyAt > rendered[0].position && bodyAt < rendered[rendered.length - 1].position + 1,
      // Whether the layout's chunks appear in their LAYOUT-CONTENT order, not
      // merely somewhere. A layout rendered back-to-front is not this layout.
      chunksInLayoutOrder:
        layoutChunksInOrder.length < 2 ||
        layoutChunksInOrder.every((value, index) => index === 0 || value > layoutChunksInOrder[index - 1]),
    };
    if (placement.bodyInsideLayout === false) failures.push("bodyOutsideLayout");
    if (placement.chunksInLayoutOrder === false) failures.push("layoutChunksOutOfOrder");
  }

  // 5. THE ERROR ARMS, so (a) and (b) stop looking the same. A layout whose
  //    content has NO main nest is the (a) case - the fixture's layout was
  //    wrong - and it is a RAISE in Ruby, not a quiet 200. A page that
  //    rendered a 200 with no main nest anywhere is the (b) case.
  const mainChunk = Array.isArray(visit?.layoutChunks) ? visit.layoutChunks.find((c) => c.main) : undefined;
  if (kind === "card" && visit?.layoutChunks !== undefined && mainChunk === undefined) {
    // main_nest?(name) is name == "_main" (main.rb:26-28) and
    // find_main_nest_chunk takes the FIRST such chunk
    // (card_layout.rb:27), so a layout whose nests are all named something
    // else finds none - and fetch_main_nest_opts RAISES for it
    // (card_layout.rb:15-18). That raise is the (a) case's signature.
    failures.push("layoutHasNoMainNest");
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)], resolution, kind, placement, positions };
}

/** The check names each leg records, so a red names WHICH claim failed. */
export const USER_LAYOUT_CHECKS = Object.freeze({
  resolution: "the page resolved the layout the card's own +*self+*layout rule names, not the :default fallback",
  kind: "the resolved layout fetches to a card layout, not an unknown layout",
  chunks: "the layout card's own content renders, every chunk, in content order",
  mainNest: "the card's own body renders inside the layout's main nest, between the chunks around it",
});

/** Ruby's exact raise text for a layout with no main nest, read by a driver
 *  that wants to name the (a) case without guessing. */
export const NO_MAIN_NEST_MESSAGE = 'no main nest found in layout "<name>"';