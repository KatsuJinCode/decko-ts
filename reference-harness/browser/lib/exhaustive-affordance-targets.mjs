// Affordance-target cases for the enumeration runner: the actions whose
// affordance does not live on the surface page the matrix names.
//
// The runner's surface table points a surface at ONE page, and its hint
// decoder reads affordance labels out of the English action text. For a
// family of actions neither holds: the board tabs render on a CARD's board
// view (not the home layout), the rename affordance is a form field (not the
// verb "follow" the text mentions in "referers follow"), and the card-name
// suggestions are a JSON endpoint (not a rendered element). Each of those
// actions measured affordance-not-found against a page that never carries
// the affordance - an aim artifact of the probe, not an engine verdict.
//
// Every case here drives the affordance's OWN page and asserts the engine's
// own rendered bytes, so the run measures the capability rather than the
// runner's guess at where it lives. Nothing here weakens a probe: each case
// ADDS an assert, and an action whose affordance is genuinely absent still
// fails.

/** The fixture card these target cases probe. Resolved from the surface's
 *  own card name when that card exists in the deck; the enumeration's
 *  default names (`Harness_richtext`, `Home+board`) name no card in
 *  synthetic-v1, so a board view of an absent card renders as an id-less
 *  card and visibleBoardTabs drops every real-card tab (Engage, History,
 *  Related) - the artifact this module exists to remove. */
export const AFFORDANCE_TARGET_CARD = "Brief";

/** The board tabs and the tab views they open, keyed by the label the
 *  matrix's action text names (board.rb:2-7 BOARD_TABS). */
const BOARD_TAB_VIEWS = {
  Account: "account_tab",
  Guide: "guide_tab",
  Engage: "engage_tab",
  History: "history_tab",
  Related: "related_tab",
  Rules: "rules_tab",
};

/** The tab labels an action text names, in board order. */
export function namedBoardTabs(text) {
  return Object.keys(BOARD_TAB_VIEWS).filter((label) =>
    new RegExp(`\\b${label}\\s+tab\\b`, "i").test(String(text ?? "")) ||
    new RegExp(`\\b${label}\\b`, "i").test(String(text ?? "")) && /board|tab/i.test(String(text ?? "")),
  );
}

/** The card-name suggestions endpoint an action text names
 *  (`...json?view=name_match`, `name_complete`). The route is the engine's
 *  (the editors' autocomplete; card-mod-search set/abstract/0_search/views.rb
 *  name_match/name_complete), so the probe asks the engine for it and reads
 *  the array it answers. */
export function nameMatchRequest(text) {
  const t = String(text ?? "");
  if (!/name_match|name_complete/.test(t)) return null;
  const view = /name_complete/.test(t) ? "name_complete" : "name_match";
  const term = /term=([^&)\s]*)/.exec(t)?.[1] ?? "";
  return { view, path: `/*all+by name.json?view=${view}&term=${encodeURIComponent(term)}` };
}

/**
 * Drives the affordance-target probes for one action. `ctx` carries the
 * engine base URL and the settle helper. Returns the sequence entries to
 * append; an empty list means the action needs none of these cases.
 */
export async function affordanceTargetProbes({ text, base, card = AFFORDANCE_TARGET_CARD, goto, settle, countSelector }) {
  const sequence = [];
  const t = String(text ?? "");

  // 1. Board tabs: the affordance is the tab control on a card's board view
  //    (card-mod-edit boardTabsView renders BOARD_TABS as data-tab-name
  //    links; the home layout renders no board wrapper at all).
  const tabs = namedBoardTabs(t);
  if (tabs.length > 0) {
    await goto(`/${encodeURIComponent(card)}/board`);
    await settle();
    for (const label of tabs) {
      const count = await countSelector(`[data-tab-name="${label}"]`);
      sequence.push({
        interaction: "assert-present",
        selector: `board tab "${label}" on /${card}/board`,
        count,
      });
    }
  }

  // 2. Card-name suggestions: the JSON endpoint answers an array of names.
  const nameMatch = nameMatchRequest(t);
  if (nameMatch !== null) {
    const res = await fetch(base + nameMatch.path, { headers: { connection: "close" } });
    const body = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    const isArray = Array.isArray(parsed);
    sequence.push({
      interaction: "assert-present",
      selector: `${nameMatch.path} answers a JSON name array`,
      count: res.status === 200 && isArray ? parsed.length + 1 : 0,
      status: res.status,
      isArray,
      names: isArray ? parsed.slice(0, 8) : [],
    });
  }

  // 3. Rename: the affordance is the card's own name form (the name field in
  //    the edit mode's name row), never a "follow" control - "referers
  //    follow" is the referers' behaviour, not a label on the page.
  //    The match is the STEM ("rename" in "a card can be renamed"): a
  //    trailing word boundary misses the inflected form, which is the form
  //    the action text actually uses.
  if (/rename/i.test(t)) {
    // The name form is its own view: /<card>/name_form renders the rename
    // field (`card[name]`, alongside `success[name]`). The edit mode's name
    // ROW (`?view=edit_name_row`) carries no input - it is the row that
    // opens this form - so the probe drives the form itself.
    await goto(`/${encodeURIComponent(card)}/name_form`);
    await settle();
    const nameField = await countSelector("input[name='card[name]'], textarea[name='card[name]']");
    sequence.push({
      interaction: "assert-present",
      selector: `rename name field card[name] on /${card}/name_form`,
      count: nameField,
    });
  }

  // 4. The Delete affordance of the edit form: decko renders it in
  //    card-mod-edit's view :edit_buttons as link_to "Delete",
  //    delete_button_opts - class "slotter btn btn-outline-danger ms-auto", a
  //    data-confirm guard, and a path { action: :delete } href, i.e.
  //    /delete/<name>. It is NOT on a card's content view, so seeking the word
  //    "Delete" on the surface page (ACT-034) measured affordance-not-found
  //    against a page that never carries it, on the ts engine and on the Ruby
  //    oracle alike.
  if (/delete/i.test(t) && /delete/|confirm/i.test(t)) {
    await goto(`/${encodeURIComponent(card)}/edit`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `confirm-guarded Delete link to /delete/<name> on /${card}/edit`,
      count: await countSelector("a.btn-outline-danger[href^='/delete/']"),
    });
    sequence.push({
      interaction: "assert-present",
      selector: `Delete link carries the confirm guard on /${card}/edit`,
      count: await countSelector("a.btn-outline-danger[data-confirm][href^='/delete/']"),
    });
  }

  // 5. The Edit affordance of a real card: the card menu's edit anchor,
  //    a.edit-link[title="Edit"] (card-mod-format's edit_link_opts: class
  //    "edit-link", title "Edit"; the icon is the link text, so the visible
  //    word "Edit" never appears on the page). Seeking that word on the home
  //    page (ACT-136) could not match any rendered card, on either engine.
  if (/Ed+s+Edit/i.test(t) || /edit a/i.test(t)) {
    await goto(`/${encodeURIComponent(card)}`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `Edit affordance on /${card}`,
      count: await countSelector("a.edit-link[title='Edit'], a.btn-outline-primary"),
    });
  }

  // 6. The follow control: decko renders it as an a.follow-link anchor in the
  //    card's follow section, signed in (follow_link_views.rb's show_follow?
  //    requires Auth.signed_in?), in one of two states: StartFollowLink, or
  //    StopFollowLink ("following", hover text "unfollow", class
  //    btn-item-delete) when the actor follows the card. W2 names the unfollow
  //    control, so both states are counted: the control's presence is the
  //    affordance, and the followed-state marker is recorded beside it.
  if (/follow/i.test(t)) {
    await goto(`/${encodeURIComponent(card)}/follow_section`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `follow control on /${card}/follow_section`,
      count: await countSelector("a.follow-link"),
    });
    sequence.push({
      interaction: "assert-present",
      selector: `unfollow (followed) state of the follow control on /${card}/follow_section`,
      count: await countSelector("a.follow-link.btn-item-delete[data-hover-text='unfollow']"),
    });
  }

  return sequence;
}
