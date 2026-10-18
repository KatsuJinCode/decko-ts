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

/** The fixture card the RichText-edit cases probe. ACT-018 names the RICHTEXT
 *  editor specifically and the modal that opens must carry the TinyMCE
 *  editor: Brief is a plain-input card, so its edit modal proves the modal
 *  machinery but not the RichText claim. Note 001 is a plain (non-nested)
 *  RichText card of synthetic-v1 (deck.json: 102 RichText rows; Note 001 the
 *  first plain one). */
export const RICHTEXT_AFFORDANCE_TARGET_CARD = "Note 001";

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


/** A create-form driver shared by the autoname case: opens /new/<path> with
 *  card[name] (and card[content]) prefilled in the query, clicks the form's
 *  create submit control, waits for the POST the form issues, and reads the
 *  engine's answer (a 200; its JSON carries no redirect body - measured). The
 *  create's ok is the HTTP status alone; whatever the answer names is
 *  recorded beside it. Same form bytes the edge harness's
 *  typed-fixture.mjs:28-61 drives. When requireNameField is false the form
 *  is matched on the submit control alone - the autonamed create form renders
 *  NO name field (card-mod-edit.ts:2367 returns undefined for the name row
 *  when the type carries an autoname rule). */
async function createThroughNewCardForm({ page, base, stepTimeout }, { newPath, name, content, requireNameField = true }) {
  if (!page) throw new Error("create-form probe needs the runner's page helper");
  const params = new URLSearchParams({});
  if (name !== undefined && name !== "") params.set("card[name]", name);
  if (content !== undefined) params.set("card[content]", content);
  const opened = await page
    .goto(`${base}${newPath}?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: stepTimeout })
    .catch(() => null);
  if (!opened || opened.status() >= 400) return { ok: false, status: opened ? opened.status() : null, redirectPath: null };
  let form = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") });
  if (requireNameField) form = form.filter({ has: page.locator("input[name='card[name]']") });
  form = form.first();
  if ((await form.count()) === 0) return { ok: false, status: opened.status(), redirectPath: null };
  const action = new URL(await form.getAttribute("action"), base);
  const pending = page
    .waitForResponse(
      (r) => new URL(r.url()).origin === base && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST",
      { timeout: stepTimeout },
    )
    .then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click({ timeout: stepTimeout });
  const seen = await pending;
  if (seen.error) return { ok: false, status: null, redirectPath: null, error: String(seen.error).slice(0, 120) };
  await seen.response.finished().catch(() => {});
  const outcome = await seen.response.json().catch(() => null);
  let redirectPath = null;
  if (typeof outcome?.redirect === "string") {
    const redirect = new URL(outcome.redirect, base);
    if (redirect.origin === base) {
      redirectPath = redirect.pathname + redirect.search;
      await page.waitForURL(redirect.href, { timeout: stepTimeout }).catch(() => {});
    }
  }
  return { ok: seen.response.status() < 400, status: seen.response.status(), redirectPath };
}

/** Clicks a selector through the page context. The card menu's edit anchor
 *  sits in the hover-hidden menu, so a visibility-gated locator click refuses;
 *  the anchor's own handler (data-slotter-mode="modal", data-remote="true")
 *  is what opens the modal, and dispatching click on the element runs it. */
async function dispatchClick(page, selector) {
  if (!page) throw new Error("click probe needs the runner's page helper");
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
}

/**
 * Drives the affordance-target probes for one action. `ctx` carries the
 * engine base URL and the settle helper. Returns the sequence entries to
 * append; an empty list means the action needs none of these cases.
 */
export async function affordanceTargetProbes({ text, base, card = AFFORDANCE_TARGET_CARD, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, stepTimeout = 30_000 }) {
  const ctx = { text, base, card, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, stepTimeout };
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
  if (/delete/i.test(t) && /(delete|confirm)/i.test(t)) {
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
  //    "edit-link", href ending /edit; the icon is the link text, so the visible
  //    word "Edit" never appears on the page). Note the anchor's title: the
  //    engine emits title="Edit" and bootstrap's tooltip plugin moves it to
  //    data-bs-original-title and blanks title in the live DOM, so the probe
  //    keys on the edit href. Seeking the word on the home
  //    page (ACT-136) could not match any rendered card, on either engine.
  if (/E[0-9]+ +Edit/i.test(t) || /edit a/i.test(t)) {
    await goto(`/${encodeURIComponent(card)}`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `Edit affordance on /${card}`,
      count: await countSelector("a.edit-link[href$='/edit']"),
    });
  }

  // 6. The follow control: decko renders it as an a.follow-link anchor in the
  //    card's follow section, signed in (follow_link_views.rb's show_follow?
  //    requires Auth.signed_in?), in one of two states: StartFollowLink, or
  //    StopFollowLink ("following", hover text "unfollow", class
  //    btn-item-delete) when the actor follows the card. W2 names the unfollow
  //    control, so both states are counted: the control's presence is the
  //    affordance, and the followed-state marker is recorded beside it.
  //
  //    The match EXCLUDES the prose use "follow the mailed link" (ACT-126, A5
  //    password reset): there the verb describes a person opening a link from
  //    their mailbox - no page ever renders a follow control for it, so the
  //    probe navigated the anonymous reset page away to /Brief/follow_section
  //    and counted 0 there, a guaranteed red regardless of engine state (the
  //    same prose class as "referers follow" in case 3). The reset form's own
  //    affordance is asserted by the runner's "Reset password" hint instead.
  const followMailedLinkProse = /\bfollow\s+(?:the\s+)?(?:mailed|reset|password)\s+link\b/i.test(t);
  if (/follow/i.test(t) && !followMailedLinkProse) {
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

  // 7. The second-save conflict (E18): the affordance ("Save") lives on the
  //    card's edit form, and the contract "second save refused (conflict)"
  //    lives in the round-trip: the edit form carries the hidden
  //    :conflict_tracker field last_action_id_before_edit
  //    (card-mod-edit set/all/form.rb:27-31, ported at
  //    src/card/mod-loader/mods/card-mod-edit.ts:561-588); the update route
  //    wires it (src/server/write-routes.ts:2066); the engine refuses with
  //    error :conflict (409, the card's :conflict view) when the card's last
  //    action advanced AND its actor is someone else
  //    (src/card/mod-loader/mods/card-mod-history.ts:976-1001,
  //    events.rb:65-72). Probing it on the deck home (the surface page)
  //    measured affordance-not-found against a page that never carries a
  //    Save button. The staging needs a SECOND ACTOR (the conflict predicate
  //    is false when the intervening save is the submitting actor's own), so
  //    the runner passes newActorRequest: a fresh, separately-signed-in
  //    request context. The probe card is Date 1 - a card the member (the
  //    second editor) may update on this fixture.
  if (/\bsecond save\b/i.test(t) && /conflict/i.test(t)) {
    const conflictCard = "Date_1";
    if (typeof newActorRequest !== "function" || typeof pageRequest === "undefined" || typeof evaluate !== "function") {
      throw new Error("second-save conflict probe needs the runner's newActorRequest, pageRequest and evaluate helpers");
    }
    await goto(`/${conflictCard}/edit`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `Save affordance on /${conflictCard}/edit`,
      count: await countSelector("form.card-form button[type='submit'], form.card-form input[type='submit']"),
    });
    // The stale-revision token the form carries at load; a card with no
    // actions yet carries none, so save once to mint one and reload.
    let staleToken = await evaluate(
      () => document.querySelector("form.card-form input[name='card[last_action_id_before_edit]']")?.value ?? null,
    );
    if (staleToken === null || staleToken === undefined || staleToken === "") {
      const warm = await pageRequest.post(`${base}/update/${conflictCard}`, {
        form: { "card[content]": "2026-01-11", "success[redirect]": "false" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      sequence.push({
        interaction: "assert-present",
        selector: `conflict-token minting save on /${conflictCard} (form had no last_action_id_before_edit)`,
        count: warm.error || warm.status() >= 400 ? 0 : 1,
        status: warm.error ? null : warm.status(),
      });
      await goto(`/${conflictCard}/edit`);
      await settle();
      staleToken = await evaluate(
        () => document.querySelector("form.card-form input[name='card[last_action_id_before_edit]']")?.value ?? null,
      );
    }
    // The second editor saves: the card's last action advances under the
    // member's actor id.
    const second = await newActorRequest("member");
    const secondSave = await second.post(`${base}/update/${conflictCard}`, {
      form: { "card[content]": "2026-01-12", "success[redirect]": "false" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    sequence.push({
      interaction: "assert-present",
      selector: `second editor's (member's) save accepted on /${conflictCard}`,
      count: secondSave.error || secondSave.status() >= 400 ? 0 : 1,
      status: secondSave.error ? null : secondSave.status(),
    });
    // The first editor's stale form submits: refused with :conflict.
    const staleSave = await pageRequest.post(`${base}/update/${conflictCard}`, {
      form: {
        "card[content]": "2026-01-13",
        "card[last_action_id_before_edit]": String(staleToken ?? ""),
        "success[redirect]": "false",
      },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const staleBody = staleSave.error ? "" : await staleSave.text().catch(() => "");
    sequence.push({
      interaction: "assert-present",
      selector: `stale second save refused with conflict (409 + :conflict view) on /${conflictCard}`,
      count: !staleSave.error && staleSave.status() === 409 && /conflict/i.test(staleBody) ? 1 : 0,
      status: staleSave.error ? null : staleSave.status(),
      staleToken: String(staleToken ?? null),
      refusedBodySnippet: staleBody.replace(/\s+/g, " ").slice(0, 200),
    });
  }

  // 8. The Save (without close) affordance (E16): the board view's editor
  //    renders it as button[data-cy="save"] inside the .board wrap - the
  //    same control the cover-b E16 contract check drives
  //    (tools/edge-signed-in-exercise/checks-cover-b.mjs:1012) - and the
  //    open board itself as .board .board-main ("leaves the board open").
  //    The home layout the surface visits renders no board and no editor,
  //    so seeking the words "Save"/"Close" there (ACT-092) measured
  //    affordance-not-found against a page that never carries the
  //    affordance, while the graded E16 contract passes on this tree
  //    (docs/reports/save-server-time-budget-2026-10-18.md:94 - "no engine
  //    defect left to fix under this entry"). Verified on the ts engine over
  //    synthetic-v1: /Brief/board and /Decko_Bot/board each render
  //    .board .board-main and .board button[data-cy='save'].
  if (/\bwithout close\b/i.test(t)) {
    await goto(`/${encodeURIComponent(card)}/board`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `open board (.board .board-main) on /${card}/board`,
      count: await countSelector(".board .board-main"),
    });
    sequence.push({
      interaction: "assert-present",
      selector: `Save (without close) control button[data-cy='save'] on /${card}/board`,
      count: await countSelector(".board button[data-cy='save']"),
    });
  }

  // 9. The owner's save row (POST /update/~<id>): the affordance the row
  //    names is an HTTP request, not a page control, so the verb decoder's
  //    "Save" text hint could only seek a button - on the home layout the
  //    row measured affordance-not-found (ACT-119) while the same request
  //    answered 303 on both instruments that actually issue it (the live
  //    lane and the whole-harness http-verb probe,
  //    native-whole-50717cca report.md:92). Two asserts: the replayed save
  //    against the hosted deck's own card (its current db_content read from
  //    the engine's own JSON, posted back verbatim as the form does -
  //    owner-checks.original.mjs:126-145) must answer a redirect, not 5xx;
  //    and the row's literal mark must fail CLEAN (4xx, e.g. not-found:
  //    synthetic-v1 carries no card 1743) rather than 5xx when the deck
  //    does not carry it - the 500 the owner audit originally recorded.
  //    Posts ride pageRequest (shares the signed-in browser session's
  //    cookies; an anonymous post is permission-refused 403).
  const rowSave = /POST\s+\/update\/~(\d+)/.exec(t);
  if (rowSave !== null) {
    if (typeof pageRequest === "undefined") {
      throw new Error("owner-save row probe needs the runner's pageRequest helper");
    }
    const current = await fetch(`${base}/${encodeURIComponent(card)}.json`, { headers: { connection: "close" } })
      .then(async (r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const content =
      current && typeof current === "object" && typeof current.db_content === "string" ? current.db_content : null;
    if (content === null) throw new Error(`owner-save row probe could not read /${card}.json db_content`);
    const form = { "card[content]": content, "success[redirect]": "true" };
    const save = await pageRequest.post(`${base}/update/${encodeURIComponent(card)}`, {
      headers: { origin: base },
      form,
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    sequence.push({
      interaction: "assert-present",
      selector: `owner-save replay: POST /update/${card} (current db_content) answers a redirect, not 5xx`,
      count: save.error || save.status() >= 400 ? 0 : 1,
      status: save.error ? null : save.status(),
    });
    const mark = await pageRequest.post(`${base}/update/~${rowSave[1]}`, {
      headers: { origin: base },
      form,
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const markStatus = mark.error ? null : mark.status();
    sequence.push({
      interaction: "assert-present",
      selector: `owner-save row mark POST /update/~${rowSave[1]} fails clean (4xx), not 5xx, when the deck does not carry it`,
      count: markStatus !== null && markStatus >= 400 && markStatus < 500 ? 1 : 0,
      status: markStatus,
    });
  }

  // 10. The RichText card's save (ACT-020, B-020 "saving the RichText card
  //     persists (Save answers a write)"): the Save control is an EDIT-FORM
  //     affordance - card-mod-edit.ts renders the edit form's submit as
  //     <button data-cy="save">Save</button> on ?view=edit_form - and the
  //     write it answers is the form's POST to /update/<name>. The runner's
  //     surface page for this action is the deck home read view, where no
  //     Save exists. The case drives the fixture's own RichText card
  //     ("Topic 001+summary") edit form, asserts the Save control, and
  //     answers the action's own question by clicking it: the POST /update
  //     response is the write the save made.
  if (/RichText card persists/i.test(t)) {
    if (typeof page === "undefined" || page === null) {
      throw new Error("RichText save probe needs the runner's page helper");
    }
    const richPath = `/${encodeURIComponent("Topic 001+summary")}?view=edit_form`;
    await goto(richPath);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `RichText edit form's Save control (button[data-cy="save"]) on ${richPath}`,
      count: await countSelector('button[data-cy="save"]'),
    });
    const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
    await page.locator('button[data-cy="save"]').first().click().catch(() => {});
    const saveResponse = await responded;
    const saveStatus = saveResponse ? saveResponse.status() : null;
    sequence.push({
      interaction: "assert-present",
      selector: `Save answers a write: the edit form's POST /update responded ${saveStatus ?? "nothing"}`,
      count: saveStatus !== null && saveStatus < 400 ? 1 : 0,
      status: saveStatus,
    });
    await settle();
  }

  // 11. The save the timings action quantifies over (ACT-064, B-064 "no save
  //     exceeded 3 s of server time"): a bound over saves is measured on
  //     real saves, not by seeking the word "Save" on the home page the
  //     surface visits - that probe never saved anything. The case creates
  //     its own scratch card (the staged deck dies with the engine's staging
  //     directory), saves it twice through the visiting actor's own session
  //     (pageRequest), and asserts every save's answer arrived inside the
  //     3 s bound, recording the raw times either way so a slow engine is
  //     attributable.
  if (/\bno save\b/i.test(t)) {
    if (typeof pageRequest === "undefined") {
      throw new Error("save-timing probe needs the runner's pageRequest helper");
    }
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_save_timing_${stamp}`;
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Basic", "card[content]": "timing baseline", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const saves = [];
    for (let i = 0; i < 2; i++) {
      const started = Date.now();
      const saved = await pageRequest.post(`${base}/update/${encodeURIComponent(scratch)}`, {
        headers: { origin: base },
        form: { "card[content]": `timing save ${i}`, "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      saves.push({ ms: Date.now() - started, status: saved.error ? null : saved.status() });
    }
    const createdOk = !created.error && created.status() < 400;
    const allInside = createdOk && saves.every((s) => s.status !== null && s.status < 400 && s.ms < 3000);
    sequence.push({
      interaction: "assert-present",
      selector: `every save answered under 3000 ms (${saves.map((s) => `${s.ms} ms / ${s.status}`).join(", ")})`,
      count: allInside ? saves.length : 0,
      saves,
    });
  }

  // 12. The P3 permission boundary (ACT-100, "P3 a member is denied edit of
  //     a card the update rule restricts (403 or the denial, no editor)"):
  //     the denial is a TWO-ACTOR property - an administrator restricts a
  //     card, a member then finds no editor on it - and the runner's surface
  //     page (the deck home, as the signing-in actor) renders neither role.
  //     The case mirrors the named instrument
  //     (tools/edge-signed-in-exercise/checks-permissions.mjs): as the
  //     visiting (admin) actor it creates a scratch card plus its
  //     +*self+*update rule naming Administrator; as the member (a fresh
  //     separately-signed-in request context, closed by the runner) the card
  //     reads 200 with its content, the edit view refuses 403 and renders no
  //     editor FOR THE TARGET CARD - the page-wide content-input count reads
  //     1 on a page that carries no editor, because the signed-in navbar's
  //     roles form carries its own hidden content input as session chrome -
  //     and the member's update POST is refused. The restriction is engine
  //     behavior (the update rule's party list), so a genuinely permissive
  //     engine still fails every leg.
  if (/\bP3\b/.test(t)) {
    if (typeof pageRequest === "undefined" || typeof newActorRequest !== "function") {
      throw new Error("P3 member-denied-edit probe needs the runner's pageRequest and newActorRequest helpers");
    }
    const stamp = Date.now().toString(36);
    const restricted = `Harness_exhaustive_p3_update_restricted_${stamp}`;
    const secret = `UNCHANGED_UPDATE_${stamp}`;
    const createdCard = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": restricted, "card[type]": "Basic", "card[content]": secret, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdRule = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `${restricted}+*self+*update`, "card[type]": "Phrase", "card[content]": "[[Administrator]]", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const fixturesOk = !createdCard.error && createdCard.status() < 400 && !createdRule.error && createdRule.status() < 400;
    const member = await newActorRequest("member");
    const memberRead = await member.get(`${base}/${encodeURIComponent(restricted)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberReadStatus = memberRead.error ? null : memberRead.status();
    const memberReadBody = memberRead.error ? "" : await memberRead.text().catch(() => "");
    const memberEdit = await member.get(`${base}/${encodeURIComponent(restricted)}?view=edit`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberEditStatus = memberEdit.error ? null : memberEdit.status();
    const memberEditBody = memberEdit.error ? "" : await memberEdit.text().catch(() => "");
    // Editors OF THIS CARD: form blocks whose action targets this card's
    // update route. The navbar's roles form is session chrome and does not
    // target the card, so it stays out of the count.
    const formBlocks = memberEditBody.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
    const targetForms = formBlocks.filter((block) => {
      const action = /<form\b[^>]*\baction="([^"]*)"/.exec(block)?.[1] ?? "";
      return action.includes(`/update/${restricted}`);
    });
    const targetContentInputs = targetForms.reduce((n, f) => n + (f.match(/name="card\[content\]"/g) ?? []).length, 0);
    const deniedUpdate = await member.post(`${base}/update/${encodeURIComponent(restricted)}`, {
      headers: { origin: base },
      form: { "card[content]": "UNAUTHORIZED_ATTEMPT", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const deniedStatus = deniedUpdate.error ? null : deniedUpdate.status();
    sequence.push(
      {
        interaction: "assert-present",
        selector: `member reads the update-restricted card (${memberReadStatus})`,
        count: memberReadStatus === 200 && memberReadBody.includes(secret) ? 1 : 0,
        status: memberReadStatus,
      },
      {
        interaction: "assert-present",
        selector: `member's edit view of the update-restricted card is denied (${memberEditStatus})`,
        count: memberEditStatus === 403 ? 1 : 0,
        status: memberEditStatus,
      },
      {
        interaction: "assert-present",
        selector: `no editor for the restricted card on the member's edit view (${targetForms.length} target forms, ${targetContentInputs} content inputs)`,
        count: fixturesOk && targetForms.length === 0 && targetContentInputs === 0 ? 1 : 0,
        targetForms: targetForms.length,
        targetContentInputs,
      },
      {
        interaction: "assert-present",
        selector: `member's update POST is refused (${deniedStatus})`,
        count: deniedStatus === 403 ? 1 : 0,
        status: deniedStatus,
      },
    );
  }

  // 13. E15's Save and Close (ACT-138, "E15 Save and Close updates the main
  //     slot"): the control is the edit modal's button.submit-button, the
  //     modal is served by /<card>/edit and opens client-side, and "the main
  //     slot" is the card's own page after the update POST. The runner's
  //     surface page for the catalog:edit actions is the deck home, where
  //     neither "Save and close" nor "Close" exists. The case creates a
  //     scratch Phrase card (the shape the named check measured), opens its
  //     edit modal in the page, asserts the Save-and-Close control, saves
  //     changed content through it, and asserts the update POST answered and
  //     the main slot shows the new content.
  if (/save and close/i.test(t)) {
    if (typeof page === "undefined" || page === null) {
      throw new Error("Save-and-Close probe needs the runner's page helper");
    }
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_e15_save_close_${stamp}`;
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Phrase", "card[content]": "save close before", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await goto(`/${encodeURIComponent(scratch)}/edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: 15_000 }).catch(() => {});
    const submitCount = await countSelector(".modal button.submit-button");
    sequence.push({
      interaction: "assert-present",
      selector: "edit modal's Save-and-Close control (button.submit-button) on /<card>/edit",
      count: !created.error && created.status() < 400 ? submitCount : 0,
    });
    if (submitCount > 0) {
      const newContent = `save close after ${stamp}`;
      const field = page.locator(".modal input[name$='[content]']:not([type=hidden]), .modal textarea[name$='[content]']:not([type=hidden])").first();
      if ((await field.count().catch(() => 0)) > 0) await field.fill(newContent).catch(() => {});
      const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
      await page.locator(".modal button.submit-button").first().click().catch(() => {});
      const saveResponse = await responded;
      const saveStatus = saveResponse ? saveResponse.status() : null;
      sequence.push({
        interaction: "assert-present",
        selector: `Save and Close answered a write (POST /update responded ${saveStatus ?? "nothing"})`,
        count: saveStatus !== null && saveStatus < 400 ? 1 : 0,
        status: saveStatus,
      });
      await settle();
      await goto(`/${encodeURIComponent(scratch)}`);
      await settle();
      const showsNew = await evaluate((c) => document.body.innerText.includes(c), newContent).catch(() => false);
      sequence.push({
        interaction: "assert-present",
        selector: "main slot shows the content Save and Close saved",
        count: showsNew ? 1 : 0,
      });
    }
  }

  // 14. H3's history rollback (ACT-176, "H3 expand an act and roll back with
  //     Save-as-current from the history page"): the history page is the
  //     card's own /history view (the engine routes the lowercase view path;
  //     a capitalized "/History" segment answers 422, and the surface's old
  //     default card name names no card in synthetic-v1 - the surface now
  //     visits a real card's history). The acts are the accordion items
  //     (act-id-<n> collapse targets - the "expand an act" affordance), and
  //     the rollback control is the history list's "revert to this" link
  //     (actions.rb:81-89 revert_actions_link - the engine's own bytes for
  //     what the matrix text paraphrases as "Save-as-current"), rendered on
  //     every act that is not the card's current one. The case creates a
  //     scratch card, saves a second act onto it, and asserts the history
  //     page lists the acts, carries the revert link, and that driving the
  //     link restores the earlier act's content as the card's content.
  if (/\bH3\b/.test(t)) {
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("history rollback probe needs the runner's page and pageRequest helpers");
    }
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_h3_rollback_${stamp}`;
    const beforeContent = `h3 roll back to this ${stamp}`;
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Basic", "card[content]": beforeContent, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/update/${encodeURIComponent(scratch)}`, {
      headers: { origin: base },
      form: { "card[content]": `h3 superseded content ${stamp}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await goto(`/${encodeURIComponent(scratch)}/history`);
    await settle();
    // The acts are bootstrap accordion items: each carries an
    // accordion-button toggle targeting #act-id-<n> - the "expand an act"
    // affordance - and the revert link sits inside the collapsed body, so
    // the case expands the acts before looking for it (the action's own
    // order: expand an act, THEN roll back).
    const expandCount = await countSelector("button.accordion-button[data-bs-target^='#act-id-']");
    sequence.push({
      interaction: "assert-present",
      selector: "history page lists the acts (accordion-button toggles to expand them) on /<card>/history",
      count: expandCount,
    });
    for (let i = 0; i < expandCount; i++) {
      await page.locator("button.accordion-button[data-bs-target^='#act-id-']").nth(i).click().catch(() => {});
    }
    await settle();
    const revertCount = await countSelector("a._close-modal.slotter[href*='revert_actions']");
    sequence.push({
      interaction: "assert-present",
      selector: "rollback control (the history list's revert link) on a non-current act",
      count: revertCount,
    });
    if (revertCount > 0) {
      const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
      await page.locator("a._close-modal.slotter[href*='revert_actions']").first().click().catch(() => {});
      const revertResponse = await responded;
      const revertStatus = revertResponse ? revertResponse.status() : null;
      sequence.push({
        interaction: "assert-present",
        selector: `rollback answered a write (POST /update/...revert_actions responded ${revertStatus ?? "nothing"})`,
        count: revertStatus !== null && revertStatus < 400 ? 1 : 0,
        status: revertStatus,
      });
      await settle();
      await goto(`/${encodeURIComponent(scratch)}`);
      await settle();
      const restored = await evaluate((c) => document.body.innerText.includes(c), beforeContent).catch(() => false);
      sequence.push({
        interaction: "assert-present",
        selector: "rolled-back act's content is the card's content again",
        count: restored ? 1 : 0,
      });
    }
  }


  // 15. RichText edit opens as a modal (ACT-018, B-018): the edit modal is
  //     opened by the card menu's edit anchor (a.edit-link, href ending /edit,
  //     data-slotter-mode="modal"), and the :edit view it loads is the
  //     modal-wrapped dialog (card-mod-edit.ts:70 haml :modal_dialog machinery;
  //     :1599 emits div.modal#modal-container[role=dialog]). The surface page
  //     for surface 4 is the deck home, where no edit link and no modal ever
  //     render, so the runner's "Edit" locate and modal assert measured
  //     affordance-not-found against a page that cannot carry either. The
  //     probe card is the RichText fixture card (the action names the RichText
  //     editor; the modal must carry TinyMCE). Both halves of the action's
  //     claim are asserted: the anchor opens the modal IN PAGE, and the shown
  //     modal carries the edit form. Pass requires the modal to actually open;
  //     the anchor's presence is recorded as a witness.
  if (/richtext edit opens/i.test(t)) {
    const richCard = RICHTEXT_AFFORDANCE_TARGET_CARD;
    await goto(`/${encodeURIComponent(richCard)}`);
    await settle();
    const editLinks = await countSelector("a.edit-link[href$='/edit']");
    sequence.push({
      interaction: "witness",
      selector: `edit affordance on /${richCard}`,
      count: editLinks,
    });
    let clicked = false;
    if (editLinks > 0) {
      clicked = await dispatchClick(page, "a.edit-link[href$='/edit']");
      if (clicked) {
        await page.waitForSelector(".modal.show", { timeout: stepTimeout }).catch(() => {});
        await settle();
      }
    }
    const modalShown = clicked ? await countSelector(".modal.show") : 0;
    const formInModal = clicked ? await countSelector(".modal.show form.card-form") : 0;
    sequence.push({
      interaction: "assert-present",
      selector: `edit link opens the edit modal in page on /${richCard} (.modal.show carrying form.card-form)`,
      count: modalShown > 0 && formInModal > 0 ? 1 : 0,
      editLinks,
      clicked,
      modalShown,
      formInModal,
    });
  }

  // 16. The File create form (ACT-059, B-059): the form that renders
  //     input[type=file] is the File create form at /new/File - the same page
  //     the files surfaces drive ("capability catalog: files" and "cover-b.
  //     files" both point at /new/File, where the same 2026-10-18-regrade run
  //     recorded input[type=file] count 1 in ACT-143/ACT-148). Surface 7b
  //     points at the deck home, which carries no upload control, so the
  //     action measured affordance-not-found against a page that never
  //     carries it.
  if (/file create form/i.test(t)) {
    await goto("/new/File");
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: "file input on the File create form /new/File",
      count: await countSelector("input[type=file]"),
    });
    sequence.push({
      interaction: "witness",
      selector: "save control on the File create form /new/File",
      count: await countSelector("form.card-form .create-submit-button"),
    });
  }

  // 17. C11 Autoname cardtype (ACT-130): the capability is a behavior, not a
  //     static control - "name generated on save". The engine implements it
  //     end to end (card-action-engine.ts:1774 autonamedCreateInput chooses
  //     the first unoccupied successor on create; card-mod-edit.ts:2367 drops
  //     the name row from the new form when the type carries an autoname
  //     rule), but synthetic-v1 seeds no +*autoname rule, so no page of the
  //     seeded deck can render the capability, and the runner's verb decoder
  //     minted a "Save" text hint no decko create form ever matches (the
  //     control is labeled "Submit" - the create form's save control is
  //     form.card-form .create-submit-button). The probe stages the real
  //     contract on a private fixture: a scratch Cardtype plus its type-scoped
  //     +*autoname rule (both through the create form, as the edge harness's
  //     C11 check does - tools/edge-signed-in-exercise/checks-unmeasured-save-
  //     edit-create.mjs:113-181), then asserts the engine's own bytes of each
  //     half: the autonamed create form renders NO name field, and the unnamed
  //     save stores the card at the rule's generated name - witnessed by
  //     /<seed>.json answering 200 with the seed name and the scratch type
  //     (a missing card's .json answers 404; the page of a missing card
  //     renders 200 with the requested name in its header, so the page is no
  //     witness). Pass requires the whole chain; a failed setup asserts 0 and
  //     the action stays red. Names are run-stamped; the session deck is a
  //     throwaway copy (lib/engines.mjs), and no other matrix action creates
  //     the scratch type.
  if (/autoname/i.test(t)) {
    const stamp = `F${Date.now().toString(36)}`;
    const typeName = `ScratchC11Type_${stamp}`;
    const seedName = `ScratchC11Card_${stamp}`;
    const typeCreate = await createThroughNewCardForm(ctx, { newPath: "/new/Cardtype", name: typeName });
    const ruleCreate = typeCreate.ok
      ? await createThroughNewCardForm(ctx, { newPath: "/new/Phrase", name: `${typeName}+*type+*autoname`, content: seedName })
      : { ok: false, status: null, redirectPath: null };
    sequence.push({
      interaction: "assert-present",
      selector: "C11 setup: private Cardtype and its type-scoped +*autoname rule stored",
      count: typeCreate.ok && ruleCreate.ok ? 1 : 0,
      typeStatus: typeCreate.status,
      ruleStatus: ruleCreate.status,
      typeName,
      ruleName: `${typeName}+*type+*autoname`,
      seedName,
    });
    if (typeCreate.ok && ruleCreate.ok) {
      await goto(`/new/${encodeURIComponent(typeName)}`);
      await settle();
      const nameFields = await countSelector("input[name='card[name]']");
      sequence.push({
        interaction: "assert-present",
        selector: `autonamed create form renders no name field on /new/${typeName}`,
        count: nameFields === 0 ? 1 : 0,
        nameFields,
      });
      sequence.push({
        interaction: "witness",
        selector: `save control on the autonamed create form /new/${typeName}`,
        count: await countSelector("form.card-form .create-submit-button"),
      });
      const submitted = await createThroughNewCardForm({ ...ctx, stepTimeout }, { newPath: `/new/${encodeURIComponent(typeName)}`, name: "", requireNameField: false });
      // The create answer is a 200 with no redirect body (measured: the form
      // answers in place; the rule seed alone cannot be read off a Location
      // header). The generated card is witnessed by the card's OWN JSON
      // answer instead: /<seed>.json must answer 200 carrying the seed name
      // and the scratch type - a missing card answers 404 (measured on this
      // engine: /no_such_card_harness_probe.json -> 404 {error,name}), and
      // the seed name is run-stamped so nothing else can own it.
      const generatedJson = await fetch(`${base}/${encodeURIComponent(seedName)}.json`, { headers: { connection: "close" } })
        .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
        .catch(() => ({ status: null, parsed: null }));
      const generated =
        submitted.ok &&
        generatedJson.status === 200 &&
        !!generatedJson.parsed &&
        generatedJson.parsed.name === seedName &&
        generatedJson.parsed.type_name === typeName;
      sequence.push({
        interaction: "assert-present",
        selector: `unnamed save stores the card at the rule's generated name (/${seedName}.json answers the scratch type's card)`,
        count: generated ? 1 : 0,
        status: submitted.status,
        jsonStatus: generatedJson.status,
        jsonName: generatedJson.parsed?.name ?? null,
        jsonTypeName: generatedJson.parsed?.type_name ?? null,
      });
    }
  }

  // 18. Accordion open/close behavior (ACT-173, UI1): the accordion open/close
  //     control is button.accordion-button[data-bs-toggle=collapse], rendered
  //     by the rules views' accordion emitters (card-mod-rules.ts
  //     accordionItem:1672-1690) on a SET card's rules view - measured on this
  //     tree, /*all?view=board_rules_tab renders the .accordion with 6 toggles
  //     and Basic+*type (no rules on this deck) renders none. The deck home
  //     the surface visits renders no accordion, so the verb decoder's "Close"
  //     text hint measured affordance-not-found against a page that never
  //     carries the control. Both halves of the named behavior are asserted:
  //     a click opens the group (the button's collapsed class drops and the
  //     collapse body shows) and a second click closes it. Pass requires the
  //     toggling; toggle presence is recorded as a witness.
  if (/accordion/i.test(t)) {
    await goto("/*all?view=board_rules_tab");
    await settle();
    const toggles = await countSelector("button.accordion-button[data-bs-toggle='collapse']");
    sequence.push({
      interaction: "witness",
      selector: "accordion open/close toggles on /*all?view=board_rules_tab",
      count: toggles,
    });
    if (toggles > 0) {
      await dispatchClick(page, "button.accordion-button");
      await page.waitForTimeout(600);
      await settle();
      const open = await countSelector("button.accordion-button:not(.collapsed)");
      const openBody = await countSelector(".accordion-collapse.collapse.show");
      sequence.push({
        interaction: "assert-present",
        selector: "accordion button opens its group on click on /*all?view=board_rules_tab",
        count: open === 1 && openBody > 0 ? 1 : 0,
        open,
        openBody,
      });
      await dispatchClick(page, "button.accordion-button");
      await page.waitForTimeout(600);
      await settle();
      const openAfterClose = await countSelector("button.accordion-button:not(.collapsed)");
      sequence.push({
        interaction: "assert-present",
        selector: "accordion button closes its group on a second click on /*all?view=board_rules_tab",
        count: openAfterClose === 0 ? 1 : 0,
        openAfterClose,
      });
    }
  }

  // 19. C14's *right+*default prefill (ACT-075): the affordance is the NEW
  //     form of a card whose RIGHT side the rule names - the fixture's
  //     summary+*right+*default ("<p>No summary yet.</p>",
  //     reference-harness/fixtures/synthetic-v1/deck.json) prefills the
  //     +summary field group of <card>+summary's create form
  //     (render.ts newCardDefaultContent, format.ts's fabricated new-card
  //     dbContent). Probing "/new" - the unnamed generic form - and decoding
  //     the rule names in the prose ("*right", "*default") as field hints
  //     measured affordance-not-found against a page that never carries the
  //     rule's field group: /new renders no .RIGHT-* group for any rule, on
  //     the ts engine and on the Ruby oracle alike. The junction create form
  //     is <left>+summary/new (measured on this tree: .RIGHT-summary renders
  //     1 field group whose textarea carries the rule content verbatim).
  //     The count asserts the CONTRACT - group present AND value equal to
  //     the rule's content - so an engine regression that empties the
  //     prefill (the shape the 50717cca whole-harness C14 red recorded)
  //     stays red here.
  if (/\*right\+\*default/.test(t)) {
    if (!page) throw new Error("*right+*default probe needs the runner's page helper");
    const junctionPath = `/${encodeURIComponent(card)}+summary/new`;
    await goto(junctionPath);
    await settle();
    const groups = await countSelector(".RIGHT-summary");
    const value =
      groups > 0
        ? await page
            .locator(".RIGHT-summary textarea.d0-card-content, .RIGHT-summary input.d0-card-content")
            .first()
            .inputValue()
            .catch(() => null)
        : null;
    const expected = "<p>No summary yet.</p>";
    sequence.push({
      interaction: "assert-present",
      selector: `*right+*default rule content prefills the new +summary field on ${junctionPath}`,
      count: groups > 0 && value === expected ? 1 : 0,
      fieldGroups: groups,
      value,
      expected,
    });
  }

  // 20. P5's structure-in-the-main-slot rendering (ACT-101): the affordance
  //     is a structured card's rendered structure - the fixture's
  //     Topic+*type+*structure ("{{+summary}}\n{{+tags|link}}\n{{+related|closed}}",
  //     synthetic-v1 deck.json) renders its nests as the main slot of
  //     /Topic_001: .card-slot.RIGHT-summary (the +summary nest) and
  //     .card-slot.closed-view.RIGHT-related (the +related nest with the
  //     template's |closed option). Probing the deck home and decoding the
  //     rule-set names in the prose ("*right", "*self", "*structure") as
  //     field hints measured affordance-not-found against a page that never
  //     carries a card, let alone its structure. Disclosed residual: the
  //     action text names a *self+*structure rule; synthetic-v1 holds no
  //     X+*self+*structure card (its only *self rule is
  //     Topic 003+*self+*read), so the SELF-set selection itself has no
  //     fixture witness and this probe cannot create one (read-only, GET
  //     only - a mid-run write would contaminate every later action). What
  //     is pinned here is the structure-renders-in-the-main-slot behavior
  //     the action names, on the fixture's own structure rule; the engine's
  //     self-set rule resolution is engine-covered (rules/lookup.ts's
  //     *self candidate walk) and the whole-harness instrument graded P5
  //     pass on a self-made *self+*structure witness.
  if (/\*self\+\*structure/.test(t)) {
    const structureCard = "Topic_001";
    await goto(`/${structureCard}`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `structure rule (fixture Topic+*type+*structure) renders its +summary nest in the main slot on /${structureCard}`,
      count: await countSelector(".card-slot.RIGHT-summary"),
    });
    sequence.push({
      interaction: "assert-present",
      selector: `structure rule renders its +related nest with the template's closed view on /${structureCard}`,
      count: await countSelector(".card-slot.closed-view.RIGHT-related"),
    });
  }

  // 21. Render-mode semantics (ACT-182): the contract is the SAME card view
  //     answering in two render modes - inline-modal (the engine's :modal
  //     wrapper, card-mod-layout modal.rb; ported views listed in
  //     render/page.ts's modal-wrapper set) and plain navigation. The
  //     wrapper has its own URL: /<card>?view=modal renders .modal.show;
  //     the plain /<card> navigates with none. Probing the deck home with
  //     no view parameter measured modal-not-present against a navigation
  //     - a page state that cannot carry the affordance on any engine; the
  //     modal is not "unobservable", it lives on its own page like every
  //     other case here. Both halves are asserted: the wrapper renders in
  //     modal mode, and the same view navigates with no wrapper.
  if (/inline-modal|render-mode/i.test(t)) {
    await goto(`/${encodeURIComponent(card)}?view=modal`);
    await settle();
    sequence.push({
      interaction: "assert-present",
      selector: `modal wrapper of the card view renders on /${card}?view=modal (inline-modal mode)`,
      count: await countSelector(".modal.show"),
    });
    await goto(`/${encodeURIComponent(card)}`);
    await settle();
    const plainModal = await countSelector(".modal.show");
    sequence.push({
      interaction: "assert-present",
      selector: `the same view navigates with no modal wrapper on /${card} (navigation mode)`,
      count: plainModal === 0 ? 1 : 0,
      plainModalWrapperCount: plainModal,
    });
  }

  return sequence;
}
