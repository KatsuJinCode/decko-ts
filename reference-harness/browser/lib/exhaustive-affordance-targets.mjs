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
export async function affordanceTargetProbes({ text, base, card = AFFORDANCE_TARGET_CARD, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest }) {
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

  return sequence;
}
