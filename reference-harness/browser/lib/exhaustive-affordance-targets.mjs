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
//
// REQUIRED LEGS (adversarial reviews grading-integrity F1 and blindness F1,
// 2026-10-18): every entry a case pushes carries the case's id, and every
// "assert-present" entry is a REQUIRED leg. The runner (run-exhaustive.mjs
// probeAction) fails the action unless every required leg read > 0, whatever
// else its generic surface-page locates found — one incidental locate hit can
// no longer carry an action whose case contract read 0. The proven instance
// this closes: ACT-062 graded pass in 2026-10-18-regrade-slice4-proof with
// BOTH of its target-case asserts at count 0, carried entirely by the generic
// "Delete" verb-hint locate. Witness entries are diagnostics, never pass
// evidence; "write-skipped" entries stay the live-walk mode's own signal.
//
// WRITE-PATH CASES AND THE LIVE-WALK GATE: cases 7, 9, 10, 11, 12, 13, 14,
// 17, 22, 24, 25, 27, 29, 30, 31, 32, 34, 35, 36, 37, 39, 41 and 42 perform
// writes (saves, creates, a revert, rule staging, uploads, a coded-image
// replacement, feed acts, an account email change). Under a host-override
// target (engines/live.json + --base-url; see lib/live-walk-profile.mjs) the
// run's write mode gates them: read-only skips every write case;
// scratch-allowlist admits only writes on cards carrying an approved scratch
// prefix. A gated case pushes a "write-skipped" entry instead of running, and
// the runner grades its action "skipped_write" — the write IS the claim those
// actions probe, so the run neither passes nor fails them, it declines to
// grade.

import { deflateSync } from "node:zlib";
import { decideWrite } from "./live-walk-profile.mjs";

/** Gates one write-shaped case. Returns true to run it; when the profile
 *  refuses, pushes the skip into the sequence (the receipt shows exactly what
 *  was declined and why) and returns false. */
function gateWrite(sequence, writeGate, { verb, cardName, detail }) {
  if (!writeGate || writeGate.profile.mode === "full") return true;
  const decision = decideWrite(writeGate.profile, { verb, cardName, detail });
  if (decision.allowed) return true;
  sequence.push({
    interaction: "write-skipped",
    verb,
    cardName: cardName ?? null,
    mode: writeGate.profile.mode,
    reason: decision.reason,
  });
  return false;
}

/** A real minimal PNG built from the given pixels (RGBA, 8-bit), for the
 *  upload cases (F4's coded-image replacement, F9's Image card). Distinct
 *  uploads must be distinct byte streams, so a replace leg can prove the
 *  SERVED file changed. Self-verified by re-parsing the chunk structure
 *  before use (the same encoder shape
 *  tools/edge-signed-in-exercise/checks-upload-image-change.mjs:30-70
 *  runs). */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of [...Buffer.from(type, "ascii"), ...data]) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}
export function generatedPng(width, height, rgbaPixels) {
  if (rgbaPixels.length !== width * height * 4) throw new Error("png pixel buffer does not match dimensions");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    rgbaPixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const png = Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("png self-check: signature");
  if (png.readUInt32BE(8) !== 13 || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error("png self-check: IHDR");
  return png;
}

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
export async function affordanceTargetProbes({ text, base, card = AFFORDANCE_TARGET_CARD, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, writeGate = null, stepTimeout = 30_000 }) {
  const ctx = { text, base, card, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, stepTimeout };
  const sequence = [];
  const t = String(text ?? "");
  // The case currently pushing, stamped onto every entry it emits so the
  // runner's receipt attributes each required leg to the case that demanded it.
  let currentCase = null;
  const push = (entry) => {
    const tagged = { case: currentCase, ...entry };
    if (tagged.interaction === "assert-present") tagged.required = true;
    sequence.push(tagged);
  };

  // 1. Board tabs: the affordance is the tab control on a card's board view
  //    (card-mod-edit boardTabsView renders BOARD_TABS as data-tab-name
  //    links; the home layout renders no board wrapper at all).
  //    BEHAVIOR GRADING (blindness-review F7: this case was presence-graded —
  //    the tab control's existence was the whole verdict). The tab is DRIVEN:
  //    clicking it must activate ITS pane. Measured on the ts engine over
  //    synthetic-v1 (2026-10-18 probe, local): the controls are
  //    a[data-tab-name] anchors on /<card>/board and a click moves .active to
  //    the pane .tab-pane-<Label> (class "tab-pane tab-pane-History active"
  //    after clicking History; the History pane carries the act list, Engage
  //    the follow controls). Control presence stays, demoted to a witness.
  const tabs = namedBoardTabs(t);
  if (tabs.length > 0) {
    currentCase = "case 1 board tabs";
    await goto(`/${encodeURIComponent(card)}/board`);
    await settle();
    for (const label of tabs) {
      const count = await countSelector(`[data-tab-name="${label}"]`);
      push({
        interaction: "witness",
        selector: `board tab "${label}" on /${card}/board`,
        count,
      });
      let clicked = false;
      let activeAfter = 0;
      if (count > 0 && page) {
        clicked = await dispatchClick(page, `[data-tab-name="${label}"]`);
        if (clicked) {
          await page.waitForTimeout(800);
          await settle();
        }
        activeAfter = await countSelector(`.tab-pane-${label}.active`);
      }
      push({
        interaction: "assert-present",
        selector: `clicking the "${label}" tab activates its pane (.tab-pane-${label}.active) on /${card}/board`,
        count: clicked && activeAfter > 0 ? 1 : 0,
        clicked,
        activeAfter,
      });
    }
  }

  // 2. Card-name suggestions: the JSON endpoint answers an array of names.
  const nameMatch = nameMatchRequest(t);
  if (nameMatch !== null) {
    currentCase = "case 2 name-match suggestions";
    const res = await fetch(base + nameMatch.path, { headers: { connection: "close" } });
    const body = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    const isArray = Array.isArray(parsed);
    push({
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
    currentCase = "case 3 rename name field";
    // The name form is its own view: /<card>/name_form renders the rename
    // field (`card[name]`, alongside `success[name]`). The edit mode's name
    // ROW (`?view=edit_name_row`) carries no input - it is the row that
    // opens this form - so the probe drives the form itself.
    // BEHAVIOR GRADING (blindness-review F7: the case graded the name
    // field's PRESENCE, "no fill, no submit, no stored-row check"). The
    // rename is now driven on this action's own scratch card and graded by
    // the card's stored name: POST /update/<card> with card[name] through
    // the signed-in session's own request channel (cases 7/9/11/12's
    // driver), then fresh GETs of BOTH names. Measured 2026-10-18 on the ts
    // engine over synthetic-v1: POST -> 303, /<new>.json -> 200 carrying the
    // new name, /<old>.json -> 404. (The board-modal renamer click issues no
    // POST on this engine - the click re-renders the edit_name_row slot with
    // no request - so the route is the driver, the fresh GETs are the
    // contract.) The presence witness on the fixture card stays.
    await goto(`/${encodeURIComponent(card)}/name_form`);
    await settle();
    const nameField = await countSelector("input[name='card[name]'], textarea[name='card[name]']");
    push({
      interaction: "witness",
      selector: `rename name field card[name] on /${card}/name_form`,
      count: nameField,
    });
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_rename_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "rename probe's own scratch card and its rename" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") {
      throw new Error("rename probe needs the runner's pageRequest helper");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Basic", "card[content]": `rename probe ${stamp}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    const newName = `Harness_exhaustive_renamed_${stamp}`;
    const renamed = createdOk
      ? await pageRequest.post(`${base}/update/${encodeURIComponent(scratch)}`, {
          headers: { origin: base },
          form: { "card[name]": newName, "success[redirect]": "true" },
          maxRedirects: 0,
        }).catch((e) => ({ error: String(e?.message ?? e) }))
      : null;
    const renamedOk = !!renamed && !renamed.error && renamed.status() < 400;
    const newJson = await fetch(`${base}/${encodeURIComponent(newName)}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    const oldJsonStatus = await fetch(`${base}/${encodeURIComponent(scratch)}.json`, { headers: { connection: "close" } })
      .then((r) => r.status)
      .catch(() => null);
    push({
      interaction: "assert-present",
      selector: `rename moves the card: POST /update/<card> (card[name]) answered ${renamed && !renamed.error ? renamed.status() : "nothing"}, /${newName}.json answers ${newJson.status ?? "nothing"} carrying the new name, the old /${scratch}.json answers ${oldJsonStatus ?? "nothing"}`,
      count: renamedOk && newJson.status === 200 && newJson.parsed?.name === newName && oldJsonStatus === 404 ? 1 : 0,
      createStatus: created.error ? null : created.status(),
      renameStatus: renamed && !renamed.error ? renamed.status() : null,
      newNameJsonStatus: newJson.status,
      oldNameJsonStatus: oldJsonStatus,
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
    currentCase = "case 4 delete control";
    // The presence witnesses keep their aim (the edit form's own Delete
    // control) but no longer gate: as the member they read 0 because the
    // member is denied /Brief?view=edit outright (measured 2026-10-18: 403 —
    // Brief+*type+*read is [[Administrator]]), and a denied read must not
    // grade the delete BEHAVIOR graded below.
    await goto(`/${encodeURIComponent(card)}/edit`);
    await settle();
    push({
      interaction: "witness",
      selector: `confirm-guarded Delete link to /delete/<name> on /${card}/edit`,
      count: await countSelector("a.btn-outline-danger[href^='/delete/']"),
    });
    push({
      interaction: "witness",
      selector: `Delete link carries the confirm guard on /${card}/edit`,
      count: await countSelector("a.btn-outline-danger[data-confirm][href^='/delete/']"),
    });
    // BEHAVIOR GRADING (blindness-review F7: "the delete is never driven —
    // the runner's global dialog auto-accept sits unused by this path"). The
    // delete is now driven on this action's own scratch card: create it,
    // open its edit form, click its confirm-guarded Delete link (the
    // runner's dialog auto-accept answers the confirm), and grade the card's
    // absence by fresh GETs. Measured 2026-10-18 on the ts engine over
    // synthetic-v1: the link is a.btn-outline-danger[data-confirm]
    // [href^='/delete/<name>'], the click's POST answers 200, and after it
    // /<name>.json answers 404 {error:"card not found"} and /<name> 404.
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_delete_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "delete probe's own scratch card and its driven delete" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("delete probe needs the runner's page and pageRequest helpers");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Basic", "card[content]": `delete probe ${stamp}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    await goto(`/${encodeURIComponent(scratch)}/edit`);
    await settle();
    const deleteHref = await evaluate(() => document.querySelector("a.btn-outline-danger[href^='/delete/']")?.getAttribute("href") ?? null).catch(() => null);
    let deleteStatus = null;
    let clickedDelete = false;
    if (createdOk && deleteHref) {
      const responded = page.waitForResponse((r) => r.url().includes("/delete/"), { timeout: stepTimeout }).catch(() => null);
      clickedDelete = await dispatchClick(page, "a.btn-outline-danger[href^='/delete/']");
      const answered = await responded;
      deleteStatus = answered ? answered.status() : null;
      await settle();
    }
    const afterJsonStatus = await fetch(`${base}/${encodeURIComponent(scratch)}.json`, { headers: { connection: "close" } })
      .then((r) => r.status)
      .catch(() => null);
    push({
      interaction: "assert-present",
      selector: `driven delete removes the card (Delete control ${deleteHref ? "found" : "absent"}, POST /delete/ answered ${deleteStatus ?? "nothing"}, /${scratch}.json answers ${afterJsonStatus ?? "nothing"})`,
      count: createdOk && !!deleteHref && clickedDelete === true && deleteStatus !== null && deleteStatus < 400 && afterJsonStatus === 404 ? 1 : 0,
      createStatus: created.error ? null : created.status(),
      deleteHref,
      deleteStatus,
      afterJsonStatus,
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
    currentCase = "case 5 edit affordance";
    await goto(`/${encodeURIComponent(card)}`);
    await settle();
    push({
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
    currentCase = "case 6 follow control";
    // BEHAVIOR GRADING (blindness-review F7: "presence counts, either follow
    // state accepted as the affordance"; grading-integrity F4's tightening:
    // "drive the control like case 18 drives accordions - click follow,
    // assert the followed state, click again, assert unfollowed"). The drive
    // runs on this action's own scratch card, so no fixture card's follow
    // state is left flipped for later actions. Measured 2026-10-18 on the ts
    // engine over synthetic-v1: a.follow-link starts as the unfollowed
    // control (no btn-item-delete, no hover text), a click flips it to
    // "follow-link btn-item-delete ..." with data-hover-text="unfollow",
    // and a second click restores the unfollowed control. The *follow RULE
    // row is a witness, not a leg: the owned-DB read right after the click
    // shows the engine stores no <card>+*follow rule row for the click drive
    // (the rule contract belongs to the W3 battery check, which owns it).
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_follow_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "follow probe's own scratch card and its follow/unfollow drive" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("follow probe needs the runner's page and pageRequest helpers");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Basic", "card[content]": `follow probe ${stamp}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    await goto(`/${encodeURIComponent(scratch)}/follow_section`);
    await settle();
    const controlCount = await countSelector("a.follow-link");
    let followedAfterClick = 0;
    let followedAfterSecondClick = 0;
    if (createdOk && controlCount > 0) {
      await dispatchClick(page, "a.follow-link");
      await page.waitForResponse((r) => r.request().method() !== "GET", { timeout: stepTimeout }).catch(() => null);
      await settle();
      followedAfterClick = await countSelector("a.follow-link.btn-item-delete[data-hover-text='unfollow']");
      await dispatchClick(page, "a.follow-link");
      await page.waitForResponse((r) => r.request().method() !== "GET", { timeout: stepTimeout }).catch(() => null);
      await settle();
      followedAfterSecondClick = await countSelector("a.follow-link.btn-item-delete[data-hover-text='unfollow']");
    }
    const ruleJsonStatus = await fetch(`${base}/${encodeURIComponent(`${scratch}+*self+*follow`)}.json`, { headers: { connection: "close" } })
      .then((r) => r.status)
      .catch(() => null);
    push({
      interaction: "witness",
      selector: `*follow rule row after the drive (/${scratch}+*self+*follow.json answers ${ruleJsonStatus ?? "nothing"}; the ts engine stores no rule row for the click drive - measured 2026-10-18)`,
      count: ruleJsonStatus === 200 ? 1 : 0,
      ruleJsonStatus,
    });
    push({
      interaction: "assert-present",
      selector: `clicking the follow control follows the card (followed state: a.follow-link.btn-item-delete[data-hover-text='unfollow']) on /${scratch}/follow_section`,
      count: createdOk && controlCount > 0 && followedAfterClick > 0 ? 1 : 0,
      controlCount,
      followedAfterClick,
    });
    push({
      interaction: "assert-present",
      selector: `clicking the followed control unfollows (the followed state is gone, the control remains) on /${scratch}/follow_section`,
      count: createdOk && controlCount > 0 && followedAfterClick > 0 && followedAfterSecondClick === 0 ? 1 : 0,
      followedAfterSecondClick,
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
    currentCase = "case 7 second-save conflict (E18)";
    const conflictCard = "Date_1";
    if (!gateWrite(sequence, writeGate, { verb: "update", cardName: conflictCard, detail: "E18 second-save conflict staging saves" })) {
      return sequence;
    }
    if (typeof newActorRequest !== "function" || typeof pageRequest === "undefined" || typeof evaluate !== "function") {
      throw new Error("second-save conflict probe needs the runner's newActorRequest, pageRequest and evaluate helpers");
    }
    await goto(`/${conflictCard}/edit`);
    await settle();
    push({
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
      push({
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
    push({
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
    push({
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
    currentCase = "case 8 save-without-close board (E16)";
    await goto(`/${encodeURIComponent(card)}/board`);
    await settle();
    push({
      interaction: "assert-present",
      selector: `open board (.board .board-main) on /${card}/board`,
      count: await countSelector(".board .board-main"),
    });
    push({
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
  //    against the hosted deck's own card replays its actual edit form,
  //    including raw nested fields, CSRF and revision. Default JSON differs
  //    between hosts and can contain rendered content, so is not a write
  //    source. The replay must answer a redirect, not merely a non-5xx;
  //    and the row's literal mark must fail CLEAN (4xx, e.g. not-found:
  //    synthetic-v1 carries no card 1743) rather than 5xx when the deck
  //    does not carry it - the 500 the owner audit originally recorded.
  //    Posts ride pageRequest (shares the signed-in browser session's
  //    cookies; an anonymous post is permission-refused 403).
  const rowSave = /POST\s+\/update\/~(\d+)/.exec(t);
  if (rowSave !== null) {
    currentCase = "case 9 owner-save row (POST /update/~id)";
    // The named-content leg writes the affordance-target card; the ~<id> leg
    // writes an id mark whose card name is unknowable before the request, so
    // under a restricted write mode it is admitted by the named leg's gate or
    // not at all (fail-safe: a mode that refuses the named card refuses the
    // whole case rather than sending a write it cannot name).
    if (!gateWrite(sequence, writeGate, { verb: "update", cardName: card, detail: "owner-save row replay POST /update/<card>" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") {
      throw new Error("owner-save row probe needs the runner's pageRequest helper");
    }
    if (typeof evaluate !== "function") throw new Error("owner-save row probe needs the actual edit form");
    const currentResponse = await pageRequest.get(`${base}/${encodeURIComponent(card)}.json`);
    const current = currentResponse.ok() ? await currentResponse.json().catch(() => null) : null;
    const cardId = Number(current?.id);
    if (!Number.isSafeInteger(cardId) || cardId < 1) throw new Error(`owner-save row probe could not identify /${card}.json`);
    const readForm = async () => {
      await goto(`/${encodeURIComponent(card)}?view=edit_form`);
      await settle();
      const snapshot = await evaluate(({ card, cardId, base }) => {
        const main = document.querySelector("#main") ?? document.body;
        const candidates = main.matches("form.card-form") ? [main] : [...main.querySelectorAll("form.card-form")];
        const normalize = value => value.replace(/_/g, " ").toLowerCase();
        const forms = candidates.filter(form => {
          const action = new URL(form.action, base);
          if (action.origin !== new URL(base).origin || form.method.toLowerCase() !== "post" || !action.pathname.startsWith("/update/")) return false;
          const mark = decodeURIComponent(action.pathname.slice("/update/".length));
          return mark === "~" + cardId || normalize(mark) === normalize(card);
        });
        if (forms.length !== 1) return null;
        return { action: forms[0].action, entries: [...new FormData(forms[0])].filter(([, value]) => typeof value === "string") };
      }, { card, cardId, base });
      if (!snapshot) throw new Error("owner-save edit form is absent, ambiguous, or targets a different card");
      const fields = new URLSearchParams(snapshot.entries);
      fields.set("success[redirect]", "true");
      return { action: snapshot.action, data: fields.toString() };
    };
    const postForm = async (form, action = form.action) => pageRequest.post(action, {
      headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
      data: form.data, maxRedirects: 0,
    }).catch(e => ({ error: String(e?.message ?? e) }));
    const redirects = response => !response.error && [302, 303].includes(response.status()) && Boolean(response.headers().location);
    const save = await postForm(await readForm());
    push({
      interaction: "assert-present",
      selector: `owner-save replay: the actual /${card} edit form answers a redirect without replacing raw nested fields from rendered JSON`,
      count: redirects(save) ? 1 : 0,
      status: save.error ? null : save.status(),
    });
    if (!redirects(save)) return sequence;
    if (Number(rowSave[1]) === cardId) {
      const mark = await postForm(await readForm(), `${base}/update/~${cardId}`);
      push({ interaction: "assert-present", selector: "owner-save literal ID resolves to the same card and its fresh form redirects", count: redirects(mark) ? 1 : 0, status: mark.error ? null : mark.status() });
      return sequence;
    }
    if (writeGate && writeGate.profile.mode !== "full") {
      sequence.push({ interaction: "write-skipped", verb: "update", cardName: null, mode: writeGate.profile.mode, reason: "literal ID is not bound to the permitted owner's form" });
      return sequence;
    }
    const literal = await pageRequest.get(`${base}/~${rowSave[1]}.json`, { maxRedirects: 0 });
    if (literal.status() !== 404) {
      push({ interaction: "assert-present", selector: "literal ID must be proven absent before its refusal is exercised; no unrelated card is posted", count: 0, status: literal.status() });
      return sequence;
    }
    const mark = await pageRequest.post(`${base}/update/~${rowSave[1]}`, {
      headers: { origin: base },
      form: { "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const markStatus = mark.error ? null : mark.status();
    push({
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
  //     Save exists. The case stages its own scratch RichText card, changes
  //     the content in the editor, asserts the Save control, clicks it, and
  //     grades the action's own word - PERSISTS - on the stored row
  //     (/<card>.json db_content carries the new content); a POST that
  //     answers <400 while dropping the write now fails.
  if (/RichText card persists/i.test(t)) {
    currentCase = "case 10 RichText save (ACT-020)";
    // BEHAVIOR GRADING (blindness-review F7: the action says "persists" and
    // the case graded `saveStatus < 400` — "answered", not "persisted"). The
    // drive now stages its own scratch RichText card (a fixture card's edit
    // cannot prove persistence: its content does not change, so a no-op
    // write and a persisted write are indistinguishable), CHANGES the
    // content in the editor, clicks Save, and grades the action's own claim
    // on the stored row: /<card>.json db_content must carry the new content.
    // Measured 2026-10-18 on the ts engine over synthetic-v1: the
    // RichText ?view=edit_form renders the content textarea under TinyMCE,
    // editor.setContent + the Save click answers 200, and /<card>.json then
    // carries db_content exactly "<p>after <stamp></p>".
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_richtext_persist_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "ACT-020 the persistence probe's own RichText card and its saved content" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("RichText save probe needs the runner's page and pageRequest helpers");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "RichText", "card[content]": `<p>before ${stamp}</p>`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    const richPath = `/${encodeURIComponent(scratch)}?view=edit_form`;
    await goto(richPath);
    await settle();
    const saveControl = await countSelector('button[data-cy="save"]');
    push({
      interaction: "assert-present",
      selector: `RichText edit form's Save control (button[data-cy="save"]) on ${richPath}`,
      count: createdOk ? saveControl : 0,
    });
    let saveStatus = null;
    if (createdOk && saveControl > 0) {
      const newContent = `<p>after ${stamp}</p>`;
      await page.evaluate((c) => {
        if (window.tinymce?.activeEditor) window.tinymce.activeEditor.setContent(c);
        const ta = document.querySelector("textarea[name='card[content]']");
        if (ta) ta.value = c;
      }, newContent);
      const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
      await page.locator('button[data-cy="save"]').first().click().catch(() => {});
      const saveResponse = await responded;
      saveStatus = saveResponse ? saveResponse.status() : null;
      push({
        interaction: "assert-present",
        selector: `Save answers a write: the edit form's POST /update responded ${saveStatus ?? "nothing"}`,
        count: saveStatus !== null && saveStatus < 400 ? 1 : 0,
        status: saveStatus,
      });
      await settle();
      const stored = await fetch(`${base}/${encodeURIComponent(scratch)}.json`, { headers: { connection: "close" } })
        .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
        .catch(() => ({ status: null, parsed: null }));
      const storedContent = typeof stored.parsed?.db_content === "string" ? stored.parsed.db_content : null;
      push({
        interaction: "assert-present",
        selector: `Save PERSISTS: /${scratch}.json db_content carries the content the editor held (${storedContent === null ? "none read" : JSON.stringify(storedContent.slice(0, 60))})`,
        count: saveStatus !== null && saveStatus < 400 && stored.status === 200 && storedContent !== null && storedContent.includes(`<p>after ${stamp}</p>`) ? 1 : 0,
        storedJsonStatus: stored.status,
        storedContentSnippet: storedContent === null ? null : storedContent.slice(0, 120),
      });
    }
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
    currentCase = "case 11 save timing bound (ACT-064)";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_save_timing_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "ACT-064 the save-timing probe's own scratch card" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") {
      throw new Error("save-timing probe needs the runner's pageRequest helper");
    }
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
    push({
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
  //     (tools/edge-signed-in-exercise/checks-permissions.mjs): an explicit
  //     ADMIN context (newActorRequest("admin"), a separately-signed-in
  //     request context closed by the runner) creates the scratch card plus
  //     its +*self+*update rule naming Administrator - the visiting session
  //     is no longer the staging actor, because the denial surface now
  //     probes AS THE MEMBER (blindness-review F5) and the member cannot
  //     create a +*self+*update rule (measured 403); as the member (a fresh
  //     separately-signed-in request context, closed by the runner) the card
  //     reads 200 with its content, the edit view refuses 403 and renders no
  //     editor FOR THE TARGET CARD - the page-wide content-input count reads
  //     1 on a page that carries no editor, because the signed-in navbar's
  //     roles form carries its own hidden content input as session chrome -
  //     and the member's update POST is refused. The restriction is engine
  //     behavior (the update rule's party list), so a genuinely permissive
  //     engine still fails every leg.
  if (/\bP3\b/.test(t)) {
    currentCase = "case 12 P3 member-denied edit";
    const stamp = Date.now().toString(36);
    const restricted = `Harness_exhaustive_p3_update_restricted_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: restricted, detail: "P3 the probe's own restricted scratch card and its *update rule" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined" || typeof newActorRequest !== "function") {
      throw new Error("P3 member-denied-edit probe needs the runner's pageRequest and newActorRequest helpers");
    }
    // The RESTRICTION is staged through an explicit ADMIN context, no longer
    // through the visiting session's channel: the denial surface now probes
    // AS THE MEMBER (blindness-review F5 — it signed in as the default
    // admin, so the denial contracts graded as admin), and the member cannot
    // stage the rule at all (measured 2026-10-18 on the ts engine over
    // synthetic-v1: member POST /card/create of a +*self+*update rule
    // answers 403). newActorRequest("admin") is the same separately-signed-in
    // request context the second-save conflict case uses; the runner closes
    // it with the action's other created contexts.
    const admin = await newActorRequest("admin");
    const secret = `UNCHANGED_UPDATE_${stamp}`;
    const createdCard = await admin.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": restricted, "card[type]": "Basic", "card[content]": secret, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdRule = await admin.post(`${base}/card/create`, {
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
    push(
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
    currentCase = "case 13 E15 Save and Close";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_e15_save_close_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "E15 Save-and-Close probe's own scratch card" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("Save-and-Close probe needs the runner's page helper");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Phrase", "card[content]": "save close before", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await goto(`/${encodeURIComponent(scratch)}/edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: 15_000 }).catch(() => {});
    const submitCount = await countSelector(".modal button.submit-button");
    push({
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
      push({
        interaction: "assert-present",
        selector: `Save and Close answered a write (POST /update responded ${saveStatus ?? "nothing"})`,
        count: saveStatus !== null && saveStatus < 400 ? 1 : 0,
        status: saveStatus,
      });
      await settle();
      await goto(`/${encodeURIComponent(scratch)}`);
      await settle();
      const showsNew = await evaluate((c) => document.body.innerText.includes(c), newContent).catch(() => false);
      push({
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
    currentCase = "case 14 H3 history rollback";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_h3_rollback_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "H3 history-rollback probe's own scratch card" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("history rollback probe needs the runner's page and pageRequest helpers");
    }
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
    push({
      interaction: "assert-present",
      selector: "history page lists the acts (accordion-button toggles to expand them) on /<card>/history",
      count: expandCount,
    });
    for (let i = 0; i < expandCount; i++) {
      await page.locator("button.accordion-button[data-bs-target^='#act-id-']").nth(i).click().catch(() => {});
    }
    await settle();
    const revertCount = await countSelector("a._close-modal.slotter[href*='revert_actions']");
    push({
      interaction: "assert-present",
      selector: "rollback control (the history list's revert link) on a non-current act",
      count: revertCount,
    });
    if (revertCount > 0) {
      const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
      await page.locator("a._close-modal.slotter[href*='revert_actions']").first().click().catch(() => {});
      const revertResponse = await responded;
      const revertStatus = revertResponse ? revertResponse.status() : null;
      push({
        interaction: "assert-present",
        selector: `rollback answered a write (POST /update/...revert_actions responded ${revertStatus ?? "nothing"})`,
        count: revertStatus !== null && revertStatus < 400 ? 1 : 0,
        status: revertStatus,
      });
      await settle();
      await goto(`/${encodeURIComponent(scratch)}`);
      await settle();
      const restored = await evaluate((c) => document.body.innerText.includes(c), beforeContent).catch(() => false);
      push({
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
    currentCase = "case 15 RichText edit modal (ACT-018)";
    const richCard = RICHTEXT_AFFORDANCE_TARGET_CARD;
    await goto(`/${encodeURIComponent(richCard)}`);
    await settle();
    const editLinks = await countSelector("a.edit-link[href$='/edit']");
    push({
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
    push({
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
    currentCase = "case 16 File create form (ACT-059)";
    await goto("/new/File");
    await settle();
    push({
      interaction: "assert-present",
      selector: "file input on the File create form /new/File",
      count: await countSelector("input[type=file]"),
    });
    push({
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
    currentCase = "case 17 C11 autoname";
    const stamp = `F${Date.now().toString(36)}`;
    const typeName = `ScratchC11Type_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: typeName, detail: `C11 the probe's private Cardtype ${typeName}, its +*type+*autoname rule and its generated seed ${`ScratchC11Card_${stamp}`}` })) {
      return sequence;
    }
    const seedName = `ScratchC11Card_${stamp}`;
    const typeCreate = await createThroughNewCardForm(ctx, { newPath: "/new/Cardtype", name: typeName });
    const ruleCreate = typeCreate.ok
      ? await createThroughNewCardForm(ctx, { newPath: "/new/Phrase", name: `${typeName}+*type+*autoname`, content: seedName })
      : { ok: false, status: null, redirectPath: null };
    push({
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
      push({
        interaction: "assert-present",
        selector: `autonamed create form renders no name field on /new/${typeName}`,
        count: nameFields === 0 ? 1 : 0,
        nameFields,
      });
      push({
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
      push({
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
    currentCase = "case 18 accordion open/close (ACT-173)";
    await goto("/*all?view=board_rules_tab");
    await settle();
    const toggles = await countSelector("button.accordion-button[data-bs-toggle='collapse']");
    push({
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
      push({
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
      push({
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
    currentCase = "case 19 *right+*default prefill (ACT-075)";
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
    push({
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
    currentCase = "case 20 P5 structure main slot (ACT-101)";
    const structureCard = "Topic_001";
    await goto(`/${structureCard}`);
    await settle();
    push({
      interaction: "assert-present",
      selector: `structure rule (fixture Topic+*type+*structure) renders its +summary nest in the main slot on /${structureCard}`,
      count: await countSelector(".card-slot.RIGHT-summary"),
    });
    push({
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
    currentCase = "case 21 render-mode semantics (ACT-182)";
    await goto(`/${encodeURIComponent(card)}?view=modal`);
    await settle();
    push({
      interaction: "assert-present",
      selector: `modal wrapper of the card view renders on /${card}?view=modal (inline-modal mode)`,
      count: await countSelector(".modal.show"),
    });
    await goto(`/${encodeURIComponent(card)}`);
    await settle();
    const plainModal = await countSelector(".modal.show");
    push({
      interaction: "assert-present",
      selector: `the same view navigates with no modal wrapper on /${card} (navigation mode)`,
      count: plainModal === 0 ? 1 : 0,
      plainModalWrapperCount: plainModal,
    });
  }

  // 22. Cleanup removal (ACT-066, "every card the run created is removed from
  //     the local copy"): the removal the claim quantifies over is the deck's
  //     own delete, driven here on the case's own scratch card through the
  //     edit view's confirm-guarded Delete control (case 4's proven drive; the
  //     runner's dialog auto-accept answers the confirm) and graded on fresh
  //     GETs: /<name>.json must answer 404 after the delete. Measured
  //     2026-10-18 on the ts engine over synthetic-v1: the create answers
  //     200, the driven delete's POST answers <400, and the card's .json
  //     answers 404 after. Disclosed residual: the run-level sweep (the
  //     runner's own lifecycle over all its created cards) is not observable
  //     from inside a run - the staged deck is a throwaway copy discarded
  //     with the engine process (lib/engines.mjs startEngine), which is the
  //     mechanism the "local copy" clause names; what this case proves is the
  //     removal capability on that copy.
  if (/every card the run created is removed/.test(t)) {
    currentCase = "case 22 cleanup removal (ACT-066)";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_cleanup_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "ACT-066 the cleanup probe's own scratch card and its driven removal" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("cleanup removal probe needs the runner's page and pageRequest helpers");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Basic", "card[content]": `cleanup probe ${stamp}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    await goto(`/${encodeURIComponent(scratch)}/edit`);
    await settle();
    const deleteHref = await evaluate(() => document.querySelector("a.btn-outline-danger[href^='/delete/']")?.getAttribute("href") ?? null).catch(() => null);
    let deleteStatus = null;
    let clickedDelete = false;
    if (createdOk && deleteHref) {
      const responded = page.waitForResponse((r) => r.url().includes("/delete/"), { timeout: stepTimeout }).catch(() => null);
      clickedDelete = await dispatchClick(page, "a.btn-outline-danger[href^='/delete/']");
      const answered = await responded;
      deleteStatus = answered ? answered.status() : null;
      await settle();
    }
    const afterJsonStatus = await fetch(`${base}/${encodeURIComponent(scratch)}.json`, { headers: { connection: "close" } })
      .then((r) => r.status)
      .catch(() => null);
    push({
      interaction: "assert-present",
      selector: `driven removal empties the card from the local copy (delete control ${deleteHref ? "found" : "absent"}, POST /delete/ answered ${deleteStatus ?? "nothing"}, /${scratch}.json answers ${afterJsonStatus ?? "nothing"})`,
      count: createdOk && !!deleteHref && clickedDelete === true && deleteStatus !== null && deleteStatus < 400 && afterJsonStatus === 404 ? 1 : 0,
      createStatus: created.error ? null : created.status(),
      deleteStatus,
      afterJsonStatus,
    });
  }

  // 23. A1's account email surface (ACT-068, "the account settings page shows
  //     the signed-in member's email"): the navbar's Account item targets
  //     /<actor>+*account_settings (measured 2026-10-18 on the ts engine),
  //     which renders no email; the email the action names renders on the
  //     account card's own view /<actor>+*account as the labeled .RIGHT-Xemail
  //     row (the page the account surface's Email-and-Password pill fetches -
  //     the E19 battery check's proven target). The case resolves the
  //     SIGNED-IN actor from the navbar link (no fixture read), reads the
  //     expected value from the engine's own /<actor>+*account+*email.json,
  //     and grades the page bytes: the labeled row present AND the page
  //     carrying exactly the stored address. A page that drops or falsifies
  //     the email fails; an anonymous session (no navbar account link) reads
  //     0 and fails.
  if (/\bA1\b/.test(t)) {
    currentCase = "case 23 A1 account email (ACT-068)";
    // The stored-address read rides pageRequest (the signed-in session's own
    // channel): +*account+*email is not anonymous-readable (measured
    // 2026-10-18: bare fetch answers 403, the signed-in session 200).
    if (typeof pageRequest === "undefined") throw new Error("A1 account-email probe needs the runner's pageRequest helper");
    const actorHref = await evaluate(() => document.querySelector("a[href*='+*account_settings']")?.getAttribute("href") ?? null).catch(() => null);
    const actorMark = typeof actorHref === "string" && actorHref.includes("+*account_settings")
      ? decodeURIComponent(actorHref).replace(/^\//, "").replace(/\+\*account_settings$/, "")
      : null;
    if (actorMark) {
      const emailJson = await pageRequest.get(`${base}/${encodeURIComponent(`${actorMark}+*account+*email`)}.json`)
        .then(async (r) => ({ status: r.status(), parsed: await r.json().catch(() => null) }))
        .catch((e) => ({ status: null, parsed: null, error: String(e?.message ?? e) }));
      const expectedEmail = typeof emailJson.parsed?.db_content === "string" ? emailJson.parsed.db_content : null;
      await goto(`/${encodeURIComponent(`${actorMark}+*account`)}`);
      await settle();
      const emailRowCount = await countSelector(".RIGHT-Xemail");
      const pageText = await evaluate(() => document.body.innerText).catch(() => "");
      const showsEmail = expectedEmail !== null && pageText.includes(expectedEmail);
      push({
        interaction: "assert-present",
        selector: `signed-in actor ${actorMark}'s account view carries the labeled email row (.RIGHT-Xemail) on /${actorMark}+*account`,
        count: emailRowCount > 0 ? 1 : 0,
        emailRowCount,
      });
      push({
        interaction: "assert-present",
        selector: `the account view shows the stored address (/${actorMark}+*account+*email.json answers ${emailJson.status ?? "nothing"}; page shows ${showsEmail ? "the address" : "not the address"})`,
        count: emailJson.status === 200 && expectedEmail !== null && showsEmail ? 1 : 0,
        emailJsonStatus: emailJson.status,
        showsEmail,
      });
    } else {
      push({
        interaction: "assert-present",
        selector: "signed-in navbar account link (a[href*='+*account_settings']) resolved the actor",
        count: 0,
        actorHref,
      });
    }
  }

  // 24. A3's email change (ACT-069, "the account's email can be changed (the
  //     new address shows on the account page)"): the change is driven on the
  //     case's OWN scratch account - the runner's fixture actors are signed
  //     in with their recorded credentials by every later action, so changing
  //     one of their addresses would break the run's own sessions. The admin
  //     session creates the scratch User card with its +*account subcards
  //     (measured 2026-10-18 on the ts engine: POST /card/create with
  //     card[subcards][+*account][subcards][+*email][content] and
  //     [+*password][content] answers 303 and stores the address), then the
  //     account edit modal (/<user>+*account?view=edit - the
  //     account-change-email journey's own page) is opened, its email input
  //     filled with the new address, and Save-and-Close clicked. The verdict
  //     is the stored row AND the account view: /<user>+*account+*email.json
  //     must carry the new address and /<user>+*account must show it.
  if (/\bA3\b/.test(t)) {
    currentCase = "case 24 A3 email change (ACT-069)";
    const stamp = Date.now().toString(36);
    const user = `Harness_exhaustive_a3_user_${stamp}`;
    const newEmail = `harness.exhaustive.a3.${stamp}@example.test`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: user, detail: "ACT-069 the email-change probe's own scratch account and its changed address" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("email-change probe needs the runner's page and pageRequest helpers");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: {
        "card[name]": user,
        "card[type]": "User",
        "card[subcards][+*account][subcards][+*email][content]": `harness.exhaustive.a3.old.${stamp}@example.test`,
        "card[subcards][+*account][subcards][+*password][content]": `Harness a3 pass ${stamp} 6#`,
        "success[redirect]": "true",
      },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    await goto(`/${encodeURIComponent(`${user}+*account`)}?view=edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: stepTimeout }).catch(() => {});
    const emailInput = page.locator('.modal.show input[name="card[subcards][+*email][content]"]');
    const inputCount = await emailInput.count().catch(() => 0);
    let changeStatus = null;
    if (createdOk && inputCount > 0) {
      await emailInput.first().fill(newEmail).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: stepTimeout }).catch(() => null);
      await page.locator(".modal.show button.submit-button").first().click().catch(() => {});
      const answered = await responded;
      changeStatus = answered ? answered.status() : null;
      await settle();
    }
    const afterJson = await pageRequest.get(`${base}/${encodeURIComponent(`${user}+*account+*email`)}.json`)
      .then(async (r) => ({ status: r.status(), parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    await goto(`/${encodeURIComponent(`${user}+*account`)}`);
    await settle();
    const showsNew = await evaluate((e) => document.body.innerText.includes(e), newEmail).catch(() => false);
    push({
      interaction: "assert-present",
      selector: `the scratch account's email change is stored (/${user}+*account+*email.json answers ${afterJson.status ?? "nothing"} carrying ${JSON.stringify(String(afterJson.parsed?.db_content ?? "").slice(0, 40))})`,
      count: createdOk && inputCount > 0 && changeStatus !== null && changeStatus < 400 && afterJson.status === 200 && afterJson.parsed?.db_content === newEmail ? 1 : 0,
      createStatus: created.error ? null : created.status(),
      changeStatus,
      emailJsonStatus: afterJson.status,
    });
    push({
      interaction: "assert-present",
      selector: `the new address shows on the account page (/${user}+*account)`,
      count: showsNew ? 1 : 0,
      showsNew,
    });
  }

  // 25. P1's read denial (ACT-099, "a member is denied read of a card the
  //     viewer-set rule restricts (admin reads it, member does not)"): the
  //     denial is a TWO-ACTOR property, staged by the case the way case 12
  //     stages P3: an explicit ADMIN context (newActorRequest("admin"))
  //     creates the scratch card with a secret and its +*self+*read rule
  //     naming [[Administrator]], then the read is graded from BOTH sides -
  //     the admin context reads 200 carrying the secret, the member context
  //     (newActorRequest("member")) is refused 403 and its body carries no
  //     secret. Measured 2026-10-18 on the ts engine over synthetic-v1:
  //     member GET of the restricted card answers 403
  //     (permission-denied), admin 200; the member also cannot create the
  //     rule itself (403), which is why the staging rides the admin context.
  if (/\bP1\b/.test(t)) {
    currentCase = "case 25 P1 member read denial (ACT-099)";
    const stamp = Date.now().toString(36);
    const restricted = `Harness_exhaustive_p1_read_restricted_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: restricted, detail: "P1 the probe's own read-restricted scratch card and its *read rule" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined" || typeof newActorRequest !== "function") {
      throw new Error("P1 read-denial probe needs the runner's pageRequest and newActorRequest helpers");
    }
    const admin = await newActorRequest("admin");
    const secret = `P1_SECRET_${stamp}`;
    const createdCard = await admin.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": restricted, "card[type]": "Basic", "card[content]": secret, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdRule = await admin.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `${restricted}+*self+*read`, "card[type]": "Pointer", "card[content]": "[[Administrator]]", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const staged = !createdCard.error && createdCard.status() < 400 && !createdRule.error && createdRule.status() < 400;
    const adminRead = await admin.get(`${base}/${encodeURIComponent(restricted)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const adminReadStatus = adminRead.error ? null : adminRead.status();
    const adminReadBody = adminRead.error ? "" : await adminRead.text().catch(() => "");
    const member = await newActorRequest("member");
    const memberRead = await member.get(`${base}/${encodeURIComponent(restricted)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberReadStatus = memberRead.error ? null : memberRead.status();
    const memberReadBody = memberRead.error ? "" : await memberRead.text().catch(() => "");
    push({
      interaction: "assert-present",
      selector: `the administrator reads the read-restricted card (${adminReadStatus})`,
      count: staged && adminReadStatus === 200 && adminReadBody.includes(secret) ? 1 : 0,
      adminReadStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the member is denied read of the restricted card (${memberReadStatus}) and the denial carries no secret`,
      count: staged && memberReadStatus === 403 && !memberReadBody.includes(secret) ? 1 : 0,
      memberReadStatus,
      leaked: memberReadBody.includes(secret),
    });
  }

  // 26. N3's search paging (ACT-104, "paging to the next page of results
  //     shows different results (page 2 is active and lists different
  //     cards)"): the pager is the search results page's own control -
  //     .paging .page-item.active marks the active page and
  //     a.card-paging-link[aria-label="Next"] advances the result window
  //     (probe-search-paging.mjs's measured contract). The case drives
  //     /*search?query[keyword]=Topic - the fixture's 30 Topic cards give a
  //     deterministic second page - reads page 1's active marker and result
  //     ids, clicks the Next control, and grades page 2: the active marker
  //     moved to "2" AND the result ids differ. Read-only; no fixture data.
  if (/\bN3\b/.test(t)) {
    currentCase = "case 26 N3 search paging (ACT-104)";
    if (typeof page === "undefined" || page === null) throw new Error("search paging probe needs the runner's page helper");
    await goto("/*search?query[keyword]=Topic");
    await settle();
    const read = () => evaluate(() => ({
      activePage: document.querySelector(".paging .page-item.active")?.textContent.trim() ?? null,
      resultIds: [...document.querySelectorAll(".search-result-list > .search-result-item [data-card-id]")].map((e) => e.getAttribute("data-card-id")),
    })).catch(() => ({ activePage: null, resultIds: [] }));
    const first = await read();
    let second = { activePage: null, resultIds: [] };
    let clicked = false;
    const next = page.locator('a.card-paging-link[aria-label="Next"]').first();
    if ((await next.count().catch(() => 0)) > 0) {
      const pending = next.click({ timeout: stepTimeout }).catch(() => {});
      await page.waitForFunction(() => document.querySelector(".paging .page-item.active")?.textContent.trim() === "2", null, { timeout: stepTimeout }).catch(() => {});
      await pending;
      clicked = true;
      await settle();
      second = await read();
    }
    const different = first.resultIds.length > 0 && second.resultIds.length > 0 && first.resultIds[0] !== second.resultIds[0];
    push({
      interaction: "assert-present",
      selector: `page 1 of the keyword results is the active page (.paging .page-item.active = ${JSON.stringify(first.activePage)}) on /*search?query[keyword]=Topic`,
      count: first.activePage === "1" && first.resultIds.length > 0 ? 1 : 0,
      activePage: first.activePage,
      resultCount: first.resultIds.length,
    });
    push({
      interaction: "assert-present",
      selector: `paging to the next page activates page 2 and lists different results (clicked ${clicked}, page 2 active = ${JSON.stringify(second.activePage)}, first ids differ: ${different})`,
      count: clicked && second.activePage === "2" && different ? 1 : 0,
      secondActivePage: second.activePage,
      secondResultCount: second.resultIds.length,
      different,
    });
  }

  // 27. N8's self layout (ACT-105, "a card with a self layout renders through
  //     that layout (Simple Header and Simple Footer around the main)"): a
  //     layout is engine behavior over a *layout RULE - the fixture seeds no
  //     layout rules (synthetic-v1 deck.json carries none), so the case
  //     stages the whole shape on private cards: an HTML layout card whose
  //     bytes wrap {{_main}} in the case's own header/footer marks, a scratch
  //     Basic host, and the host's +*self+*layout rule naming the layout
  //     card. Measured 2026-10-18 on the ts engine: the staged rule renders -
  //     the host's page then carries the header mark, the host's body, and
  //     the footer mark. All three marks are required legs; a layout that
  //     swallows the main or renders the card unwrapped fails.
  if (/\bN8\b/.test(t)) {
    currentCase = "case 27 N8 self layout (ACT-105)";
    const stamp = Date.now().toString(36);
    const host = `Harness_exhaustive_n8_${stamp}`;
    const layoutName = `Harness_exhaustive_n8_layout_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: host, detail: `N8 the probe's scratch host ${host}, its layout card ${layoutName} and its +*self+*layout rule` })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") throw new Error("self-layout probe needs the runner's pageRequest helper");
    const headerMark = `N8_HEADER_${stamp}`;
    const footerMark = `N8_FOOTER_${stamp}`;
    const bodyMark = `N8_BODY_${stamp}`;
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": host, "card[type]": "Basic", "card[content]": bodyMark, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": layoutName, "card[type]": "HTML", "card[content]": `<div class="harness-n8-header">${headerMark}</div>{{_main}}<div class="harness-n8-footer">${footerMark}</div>`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    const rule = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `${host}+*self+*layout`, "card[type]": "Phrase", "card[content]": `[[${layoutName}]]`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await goto(`/${encodeURIComponent(host)}`);
    await settle();
    const html = await evaluate(() => document.body.innerHTML).catch(() => "");
    push({
      interaction: "assert-present",
      selector: `the self layout renders its header around the main on /${host}`,
      count: !rule.error && rule.status() < 400 && html.includes(headerMark) ? 1 : 0,
      headerMark: html.includes(headerMark),
    });
    push({
      interaction: "assert-present",
      selector: `the self layout renders the card's own body inside it on /${host}`,
      count: html.includes(bodyMark) ? 1 : 0,
      bodyMark: html.includes(bodyMark),
    });
    push({
      interaction: "assert-present",
      selector: `the self layout renders its footer around the main on /${host}`,
      count: html.includes(footerMark) ? 1 : 0,
      footerMark: html.includes(footerMark),
    });
  }

  // 28. N11's reference link (ACT-106, "a reference renders as a link to the
  //     referenced card"): the claim is the RENDERED bytes of a card whose
  //     content holds a [[wikilink]]. The case stages its own RichText card
  //     whose content links the fixture's Brief card and grades the render:
  //     an anchor to /Brief labelled "Brief" must be on the page. Measured
  //     2026-10-18 on the ts engine: the stored "[[Brief]]" renders
  //     <a href="/Brief">Brief</a>.
  if (/\bN11\b/.test(t)) {
    currentCase = "case 28 N11 reference link (ACT-106)";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_n11_link_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "N11 the reference-link probe's own wikilink card" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") throw new Error("reference-link probe needs the runner's pageRequest helper");
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "RichText", "card[content]": "<p>see [[Brief]] here</p>", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await goto(`/${encodeURIComponent(scratch)}`);
    await settle();
    const anchor = await evaluate(() => {
      const a = [...document.querySelectorAll("#main a[href]")].find((el) => (el.getAttribute("href") ?? "").endsWith("/Brief"));
      return a ? { href: a.getAttribute("href"), text: a.textContent.trim() } : null;
    }).catch(() => null);
    push({
      interaction: "assert-present",
      selector: `the stored [[Brief]] reference renders as a link to the referenced card on /${scratch}`,
      count: !created.error && created.status() < 400 && anchor !== null && anchor.href === "/Brief" && anchor.text === "Brief" ? 1 : 0,
      anchor,
    });
  }

  // 29. C7's plain-input create (ACT-128, "create a plain-input card through
  //     the editor"): the editor is the create FORM at /new/PlainText - the
  //     page the C7 battery check drives (form with editable name field,
  //     content field, create submit). The case fills the form in the page
  //     (createThroughNewCardForm, case 17's driver), waits for the POST the
  //     form issues, and grades the STORED card: /<name>.json must answer 200
  //     carrying type PlainText and the exact content the editor held.
  if (/\bC7\b/.test(t)) {
    currentCase = "case 29 C7 plain-input create (ACT-128)";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_c7_plain_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "C7 the plain-input create probe's own card" })) {
      return sequence;
    }
    const content = `plain text body ${stamp}`;
    const submitted = await createThroughNewCardForm(ctx, { newPath: "/new/PlainText", name: scratch, content });
    const stored = await fetch(`${base}/${encodeURIComponent(scratch)}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    push({
      interaction: "assert-present",
      selector: `the plain-input create form stores the card (POST answered ${submitted.status ?? "nothing"}, /${scratch}.json answers ${stored.status ?? "nothing"})`,
      count: submitted.ok && stored.status === 200 && stored.parsed?.type_name === "PlainText" && stored.parsed?.db_content === content ? 1 : 0,
      submitStatus: submitted.status,
      storedJsonStatus: stored.status,
      storedType: stored.parsed?.type_name ?? null,
    });
  }

  // 30. C9's invalid number (ACT-129, "invalid number refused in the
  //     editor"): the Number cardtype validates content, and the refusal is
  //     a WRITE answer, not a page state. The case posts the create form's
  //     fields with a non-numeric content and grades the refusal two ways -
  //     the answer is 4xx AND the card is not stored (/<name>.json 404) -
  //     then proves the refusal is content-specific with a control create of
  //     a valid number, which must store (json 200 carrying "42"). Measured
  //     2026-10-18 on the ts engine: invalid answers 422 (user-error) with
  //     the json 404 after; valid answers 303 and stores.
  if (/\bC9\b/.test(t)) {
    currentCase = "case 30 C9 invalid number (ACT-129)";
    const stamp = Date.now().toString(36);
    const bad = `Harness_exhaustive_c9_bad_${stamp}`;
    const good = `Harness_exhaustive_c9_good_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: bad, detail: "C9 the invalid-number probe's refused card and its valid control card" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") throw new Error("invalid-number probe needs the runner's pageRequest helper");
    const badPost = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": bad, "card[type]": "Number", "card[content]": `not a number ${stamp}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const badStatus = badPost.error ? null : badPost.status();
    const badJson = await fetch(`${base}/${encodeURIComponent(bad)}.json`, { headers: { connection: "close" } }).then((r) => r.status).catch(() => null);
    push({
      interaction: "assert-present",
      selector: `the invalid number is refused in the editor (POST answered ${badStatus ?? "nothing"}, /${bad}.json answers ${badJson ?? "nothing"})`,
      count: badStatus !== null && badStatus >= 400 && badJson === 404 ? 1 : 0,
      badStatus,
      badJson,
    });
    const goodPost = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": good, "card[type]": "Number", "card[content]": "42", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const goodJson = await fetch(`${base}/${encodeURIComponent(good)}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    push({
      interaction: "assert-present",
      selector: `the refusal is content-specific: a valid number stores (control answers ${goodPost.error ? "nothing" : goodPost.status()}, /${good}.json db_content ${JSON.stringify(String(goodJson.parsed?.db_content ?? ""))})`,
      count: !goodPost.error && goodPost.status() < 400 && goodJson.status === 200 && goodJson.parsed?.db_content === "42" ? 1 : 0,
      goodStatus: goodPost.error ? null : goodPost.status(),
      goodJsonStatus: goodJson.status,
    });
  }

  // 31. C15's radio input (ACT-132, "radio input in a new card"): the radio
  //     editor renders when the field's input-type rule says "radio" and an
  //     options rule supplies the choices - the pointer_inputs journey's own
  //     staging (journeys/synthetic-v1.json pointer-radio-input: tags
  //     +*right+*input_type = radio, tags+*right+*options = a Tag search),
  //     here on the case's own scratch host card and +tags Pointer field.
  //     Measured 2026-10-18 on the ts engine: with the rules staged, the
  //     field's edit modal renders input[type=radio] per Tag card
  //     (Tag 01..Tag 10), choosing Tag 03 and Save-and-Close stores "Tag 03"
  //     on /<host>+tags. Both halves are required: the radios render, and
  //     the driven choice is what the engine stores.
  if (/\bC15\b/.test(t)) {
    currentCase = "case 31 C15 radio input (ACT-132)";
    const stamp = Date.now().toString(36);
    const host = `Harness_exhaustive_c15_${stamp}`;
    const pointer = `${host}+tags`;
    // The gate names the GLOBAL rule card, not the scratch host: the rule
    // write is the one a restricted mode cannot admit (the host is scratch
    // -prefixed, the rule is not), and a mode that refuses it must refuse the
    // whole case rather than send a write it cannot name (case 9's rule).
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: "tags+*right+*input_type", detail: "C15 the probe's scratch host and +tags Pointer, plus the tags+*right input-type/options rules" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("radio-input probe needs the runner's page and pageRequest helpers");
    }
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": host, "card[type]": "Basic", "card[content]": "radio host", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": pointer, "card[type]": "Pointer", "card[content]": "[[Tag 01]]", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": "tags+*right+*input_type", "card[type]": "Phrase", "card[content]": "radio", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": "tags+*right+*options", "card[type]": "Search", "card[content]": JSON.stringify({ type: "Tag", sort: "name" }), "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await goto(`/${encodeURIComponent(pointer)}?view=edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: stepTimeout }).catch(() => {});
    const radioValues = await evaluate(() => [...document.querySelectorAll(".modal.show input[type=radio], input[type=radio]")].map((r) => r.value)).catch(() => []);
    let saveStatus = null;
    if (radioValues.includes("Tag 03")) {
      await page.locator("input[type=radio][value='Tag 03']").first().check().catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: stepTimeout }).catch(() => null);
      await page.locator(".modal.show button.submit-button").first().click().catch(() => {});
      const answered = await responded;
      saveStatus = answered ? answered.status() : null;
      await settle();
    }
    const stored = await fetch(`${base}/${encodeURIComponent(pointer)}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    push({
      interaction: "assert-present",
      selector: `the radio editor renders the option cards as radio inputs (${radioValues.length} radios) on /${pointer} edit`,
      count: radioValues.length > 0 ? 1 : 0,
      radioValues: radioValues.slice(0, 12),
    });
    push({
      interaction: "assert-present",
      selector: `the driven radio choice is stored (save answered ${saveStatus ?? "nothing"}, /${pointer}.json carries ${JSON.stringify(String(stored.parsed?.db_content ?? ""))})`,
      count: saveStatus !== null && saveStatus < 400 && stored.status === 200 && String(stored.parsed?.db_content ?? "") === "Tag 03" ? 1 : 0,
      saveStatus,
      storedContent: stored.parsed?.db_content ?? null,
    });
  }

  // 32. C17's multiselect input (ACT-133, "multiselect input in a new
  //     card"): the same staging shape as case 31 with the input-type rule
  //     set to "multiselect" (the pointer-multiselect-input journey's
  //     contract), updated via the rule card's own update route. Measured
  //     2026-10-18 on the ts engine: the field's edit modal renders
  //     select[multiple] with the Tag options, choosing Tag 04 and Tag 02
  //     stores both ("Tag 02\nTag 04"). Both halves required: the multiselect
  //     renders, and both driven choices are stored.
  if (/\bC17\b/.test(t)) {
    currentCase = "case 32 C17 multiselect input (ACT-133)";
    const stamp = Date.now().toString(36);
    const host = `Harness_exhaustive_c17_${stamp}`;
    const pointer = `${host}+tags`;
    // Case 31's gate rule: the GLOBAL rule card is the write a restricted
    // mode cannot name.
    if (!gateWrite(sequence, writeGate, { verb: "update", cardName: "tags+*right+*input_type", detail: "C17 the probe's scratch host and +tags Pointer, plus the tags+*right input-type/options rules" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("multiselect-input probe needs the runner's page and pageRequest helpers");
    }
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": host, "card[type]": "Basic", "card[content]": "multiselect host", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": pointer, "card[type]": "Pointer", "card[content]": "", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    const ruleExisting = await fetch(`${base}/${encodeURIComponent("tags+*right+*input_type")}.json`, { headers: { connection: "close" } }).then((r) => r.status).catch(() => null);
    if (ruleExisting === 200) {
      await pageRequest.post(`${base}/update/${encodeURIComponent("tags+*right+*input_type")}`, {
        headers: { origin: base },
        form: { "card[content]": "multiselect", "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch(() => null);
    } else {
      await pageRequest.post(`${base}/card/create`, {
        headers: { origin: base },
        form: { "card[name]": "tags+*right+*input_type", "card[type]": "Phrase", "card[content]": "multiselect", "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch(() => null);
    }
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": "tags+*right+*options", "card[type]": "Search", "card[content]": JSON.stringify({ type: "Tag", sort: "name" }), "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await goto(`/${encodeURIComponent(pointer)}?view=edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: stepTimeout }).catch(() => {});
    const multi = await evaluate(() => {
      const s = document.querySelector(".modal.show select[multiple], select[multiple]");
      return s ? { name: s.name, options: [...s.options].map((o) => o.value) } : null;
    }).catch(() => null);
    let saveStatus = null;
    if (multi !== null) {
      await page.locator(`select[name="${multi.name}"]`).first().selectOption(["Tag 04", "Tag 02"]).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: stepTimeout }).catch(() => null);
      await page.locator(".modal.show button.submit-button").first().click().catch(() => {});
      const answered = await responded;
      saveStatus = answered ? answered.status() : null;
      await settle();
    }
    const stored = await fetch(`${base}/${encodeURIComponent(pointer)}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    const storedContent = typeof stored.parsed?.db_content === "string" ? stored.parsed.db_content : null;
    push({
      interaction: "assert-present",
      selector: `the multiselect editor renders a multiple select of the option cards on /${pointer} edit`,
      count: multi !== null ? 1 : 0,
      options: multi ? multi.options.slice(0, 12) : [],
    });
    push({
      interaction: "assert-present",
      selector: `both driven choices are stored (save answered ${saveStatus ?? "nothing"}, /${pointer}.json carries ${JSON.stringify(storedContent)})`,
      count: saveStatus !== null && saveStatus < 400 && storedContent !== null && storedContent.includes("Tag 02") && storedContent.includes("Tag 04") ? 1 : 0,
      saveStatus,
      storedContent,
    });
  }

  // 33. E7's nest rules editor (ACT-134, "nest rules editor"): the editor is
  //     a SET card's :nest_rules view - filtered_rule_lists.rb's view renders
  //     .nest_rules-view with ._setting-list li rows carrying the rules'
  //     update forms (the E7 battery check's measured bytes). The seeded
  //     type-set Topic+*type carries the deck's rules, so the case opens its
  //     rules editor and grades the editor's structure: the view present, its
  //     setting list populated, and its rows wired to update routes. Read
  //     -only on a seeded set (a scratch self set renders no nest_rules view
  //     on this engine - measured 2026-10-18 - so the seeded set is the
  //     editor's real host).
  if (/\bE7\b/.test(t)) {
    currentCase = "case 33 E7 nest rules editor (ACT-134)";
    const setMark = "Topic+*type";
    await goto(`/${encodeURIComponent(setMark)}?view=nest_rules`);
    await settle();
    const viewCount = await countSelector(".nest_rules-view");
    const listItems = await countSelector(".nest_rules-view ._setting-list li");
    const updateForms = await countSelector(".nest_rules-view form[action^='/update/']");
    push({
      interaction: "assert-present",
      selector: `the nest rules editor view renders on /${setMark}?view=nest_rules`,
      count: viewCount > 0 ? 1 : 0,
      viewCount,
    });
    push({
      interaction: "assert-present",
      selector: `the editor's setting list carries rule rows (${listItems} li) on /${setMark}?view=nest_rules`,
      count: listItems > 0 ? 1 : 0,
      listItems,
    });
    push({
      interaction: "assert-present",
      selector: `the editor's rule rows are wired to update routes (${updateForms} forms) on /${setMark}?view=nest_rules`,
      count: updateForms > 0 ? 1 : 0,
      updateForms,
    });
  }

  // 34. E9's nest list editor (ACT-135, "nest list editor"): a Nest list
  //     card's editor renders nest rows - the _nest-form rows whose
  //     reference input (input.pointer-item-text) autocompletes card names
  //     (the E9 battery check's measured bytes). The case creates its own
  //     Nest list card, opens the editor, fills the reference row with the
  //     fixture's Brief card, saves, and grades the STORED nest: the card's
  //     content must be the {{Brief}} nest. Measured 2026-10-18 on the ts
  //     engine: the editor answers 200 and stores exactly "{{Brief}}".
  if (/\bE9\b/.test(t)) {
    currentCase = "case 34 E9 nest list editor (ACT-135)";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_e9_nestlist_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "E9 the nest-list probe's own Nest list card and its saved nest" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("nest-list probe needs the runner's page and pageRequest helpers");
    }
    const created = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": scratch, "card[type]": "Nest list", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdOk = !created.error && created.status() < 400;
    await goto(`/${encodeURIComponent(scratch)}?view=edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: stepTimeout }).catch(() => {});
    const rowCount = await countSelector(".modal.show ._nest-form, .modal.show .pointer-li");
    const refInput = page.locator(".modal.show input.pointer-item-text").first();
    let saveStatus = null;
    if (createdOk && rowCount > 0 && (await refInput.count().catch(() => 0)) > 0) {
      await refInput.fill("Brief").catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET", { timeout: stepTimeout }).catch(() => null);
      await page.locator(".modal.show button.submit-button").first().click().catch(() => {});
      const answered = await responded;
      saveStatus = answered ? answered.status() : null;
      await settle();
    }
    const stored = await fetch(`${base}/${encodeURIComponent(scratch)}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    push({
      interaction: "assert-present",
      selector: `the nest list editor renders nest rows (${rowCount}) on /${scratch} edit`,
      count: createdOk && rowCount > 0 ? 1 : 0,
      rowCount,
    });
    push({
      interaction: "assert-present",
      selector: `the filled nest row stores the {{Brief}} nest (save answered ${saveStatus ?? "nothing"}, /${scratch}.json carries ${JSON.stringify(String(stored.parsed?.db_content ?? ""))})`,
      count: saveStatus !== null && saveStatus < 400 && stored.status === 200 && stored.parsed?.db_content === "{{Brief}}" ? 1 : 0,
      saveStatus,
      storedContent: stored.parsed?.db_content ?? null,
    });
  }

  // 35. P2's type create denial (ACT-140, "member denied create of a
  //     restricted type"): staged by the case the way case 12 stages P3 -
  //     an explicit ADMIN context creates a scratch Cardtype and its
  //     +*type+*create rule naming [[Administrator]] - and the denial is
  //     graded from both sides: the member's create POST is refused 403 AND
  //     the member's /new/<type> page is refused, while the administrator's
  //     own create of the same restricted type answers <400 (the control
  //     that proves the denial is the rule's, not a broken type). Measured
  //     2026-10-18 on the ts engine: member create 403 (permission-denied),
  //     member /new 403, admin create 303.
  if (/\bP2\b/.test(t)) {
    currentCase = "case 35 P2 type create denial (ACT-140)";
    const stamp = Date.now().toString(36);
    const typeName = `Harness_exhaustive_p2_type_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: typeName, detail: `P2 the probe's private restricted Cardtype ${typeName} and its +*type+*create rule` })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined" || typeof newActorRequest !== "function") {
      throw new Error("P2 create-denial probe needs the runner's pageRequest and newActorRequest helpers");
    }
    const admin = await newActorRequest("admin");
    const createdType = await admin.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": typeName, "card[type]": "Cardtype", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const createdRule = await admin.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `${typeName}+*type+*create`, "card[type]": "Pointer", "card[content]": "[[Administrator]]", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const staged = !createdType.error && createdType.status() < 400 && !createdRule.error && createdRule.status() < 400;
    const adminCreate = await admin.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `Harness_exhaustive_p2_admin_ok_${stamp}`, "card[type]": typeName, "card[content]": "admin can create", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const adminCreateStatus = adminCreate.error ? null : adminCreate.status();
    const member = await newActorRequest("member");
    const memberCreate = await member.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `Harness_exhaustive_p2_member_denied_${stamp}`, "card[type]": typeName, "card[content]": "member must not create", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberCreateStatus = memberCreate.error ? null : memberCreate.status();
    const memberNewPage = await member.get(`${base}/new/${encodeURIComponent(typeName)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberNewStatus = memberNewPage.error ? null : memberNewPage.status();
    push({
      interaction: "assert-present",
      selector: `the administrator can still create the restricted type (control answered ${adminCreateStatus ?? "nothing"})`,
      count: staged && adminCreateStatus !== null && adminCreateStatus < 400 ? 1 : 0,
      adminCreateStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the member's create POST of the restricted type is refused (${memberCreateStatus})`,
      count: staged && memberCreateStatus === 403 ? 1 : 0,
      memberCreateStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the member's /new/${typeName} page is refused (${memberNewStatus})`,
      count: staged && memberNewStatus === 403 ? 1 : 0,
      memberNewStatus,
    });
  }

  // 36. P4's rule default plus plus-card override (ACT-141, "Rules: default
  //     setting and plus-card override"): the contract the cypress rules
  //     spec stages (decko spec/cypress/e2e/rules.spec.coffee "default
  //     setting and plus card override") is the *help setting - a broad
  //     default rule applies where nothing narrower exists, and a plus
  //     -card-scoped rule overrides it on its own scope. The case stages the
  //     two rules on private cards: <field>+*right+*help (the broad default)
  //     and <hostA>+<field>+*self+*help (the plus-card override), then reads
  //     both hosts' +field pages. Measured 2026-10-18 on the ts engine: the
  //     host with the override shows ONLY the override text, the plain host
  //     shows the default text - both legs required, so a precedence
  //     regression in either direction fails. (The *default setting's
  //     new-card prefill was also measured: runtime-created default rules do
  //     not reach the prefill on this engine - even cold, and after unrelated
  //     writes - so the prefill seam cannot stage this contract and the help
  //     setting is the seam the original spec itself uses.)
  if (/\bP4\b/.test(t)) {
    currentCase = "case 36 P4 rule default + override (ACT-141)";
    const stamp = Date.now().toString(36);
    const field = `Harness_exhaustive_p4f_${stamp}`;
    const hostA = `Harness_exhaustive_p4_override_${stamp}`;
    const hostB = `Harness_exhaustive_p4_plain_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: hostA, detail: `P4 the probe's two scratch hosts, the +${field} junctions, the broad +*right+*help default and ${hostA}'s +*self+*help override` })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") throw new Error("rule-override probe needs the runner's pageRequest helper");
    const genericText = `P4_GENERIC_HELP_${stamp}`;
    const overrideText = `P4_OVERRIDE_HELP_${stamp}`;
    for (const form of [
      { "card[name]": hostA, "card[type]": "Basic", "card[content]": "" },
      { "card[name]": `${hostA}+${field}`, "card[type]": "Phrase", "card[content]": "" },
      { "card[name]": hostB, "card[type]": "Basic", "card[content]": "" },
      { "card[name]": `${hostB}+${field}`, "card[type]": "Phrase", "card[content]": "" },
      { "card[name]": `${field}+*right+*help`, "card[type]": "Phrase", "card[content]": genericText },
      { "card[name]": `${hostA}+${field}+*self+*help`, "card[type]": "Phrase", "card[content]": overrideText },
    ]) {
      await pageRequest.post(`${base}/card/create`, { headers: { origin: base }, form: { ...form, "success[redirect]": "true" }, maxRedirects: 0 }).catch(() => null);
    }
    const readPage = async (mark) => {
      const r = await fetch(`${base}/${encodeURIComponent(mark)}`, { headers: { connection: "close" } })
        .then((r) => r.text())
        .catch(() => "");
      return { override: r.includes(overrideText), generic: r.includes(genericText) };
    };
    const onOverrideHost = await readPage(`${hostA}+${field}`);
    const onPlainHost = await readPage(`${hostB}+${field}`);
    push({
      interaction: "assert-present",
      selector: `the plus-card-scoped rule overrides the default on ${hostA}+${field} (shows the override text, not the generic text)`,
      count: onOverrideHost.override && !onOverrideHost.generic ? 1 : 0,
      ...onOverrideHost,
    });
    push({
      interaction: "assert-present",
      selector: `the broad default rule still applies where no override exists on ${hostB}+${field} (shows the generic text)`,
      count: onPlainHost.generic && !onPlainHost.override ? 1 : 0,
      ...onPlainHost,
    });
  }

  // 37. F4's coded image change (ACT-146, "change a coded image"): the
  //     deck's coded image card is *logo (codename logo, seeded with the
  //     coded file reference ":logo/carrierwave.svg" - measured in the
  //     fixture sqlite). The case reads the stored identifier and the served
  //     coded bytes FIRST (the change's before-state), drives the image
  //     card's own edit form (the modal's file input, the engine's
  //     preliminary-upload arm, then Save), and grades the change on the
  //     stored state: the identifier must move from the coded ":logo/..."
  //     reference to the upload's own action reference, and /files/<new> must
  //     serve exactly the uploaded byte stream. Measured 2026-10-18 on the
  //     ts engine: update 200, identifier ":logo/carrierwave.svg" ->
  //     "~<id>/<n>.png", served bytes 4206 -> 70 (the upload's length).
  if (/\bF4\b/.test(t)) {
    currentCase = "case 37 F4 coded image change (ACT-146)";
    if (!gateWrite(sequence, writeGate, { verb: "update", cardName: "*logo", detail: "F4 the coded *logo image's replacement upload" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("coded-image probe needs the runner's page and pageRequest helpers");
    }
    const logoJson = await fetch(`${base}/${encodeURIComponent("*logo")}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    const identifierBefore = typeof logoJson.parsed?.db_content === "string" ? logoJson.parsed.db_content : null;
    const beforeBytes = identifierBefore
      ? await fetch(`${base}/files/${identifierBefore}`, { headers: { connection: "close" } })
          .then(async (r) => ({ status: r.status, size: (await r.arrayBuffer()).byteLength }))
          .catch(() => null)
      : null;
    push({
      interaction: "assert-present",
      selector: `*logo carries a coded file reference before the change (identifier ${JSON.stringify(identifierBefore)}, /files answers ${beforeBytes?.status ?? "nothing"})`,
      count: logoJson.status === 200 && identifierBefore !== null && identifierBefore.startsWith(":") && beforeBytes?.status === 200 ? 1 : 0,
      identifierBefore,
      beforeBytesStatus: beforeBytes?.status ?? null,
    });
    const png = generatedPng(1, 1, Buffer.from([0, 0, 255, 255]));
    await goto(`/${encodeURIComponent("*logo")}?view=edit`);
    await settle();
    await page.waitForSelector(".modal.show", { timeout: stepTimeout }).catch(() => {});
    const fileForm = page.locator("form.card-form").filter({ has: page.locator('input[type="file"]') }).first();
    let updateStatus = null;
    if ((await fileForm.count().catch(() => 0)) > 0) {
      await fileForm.locator('input[type="file"]').first().setInputFiles({ name: "harness-coded-replace.png", mimeType: "image/png", buffer: png }).catch(() => {});
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: stepTimeout }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: stepTimeout }).catch(() => null);
      await fileForm.locator("button.submit-button, button[type=submit]").first().click().catch(() => {});
      const answered = await responded;
      updateStatus = answered ? answered.status() : null;
      await settle();
    }
    const logoJsonAfter = await fetch(`${base}/${encodeURIComponent("*logo")}.json`, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
      .catch(() => ({ status: null, parsed: null }));
    const identifierAfter = typeof logoJsonAfter.parsed?.db_content === "string" ? logoJsonAfter.parsed.db_content : null;
    const afterBytes = identifierAfter
      ? await fetch(`${base}/files/${identifierAfter}`, { headers: { connection: "close" } })
          .then(async (r) => ({ status: r.status, size: (await r.arrayBuffer()).byteLength }))
          .catch(() => null)
      : null;
    push({
      interaction: "assert-present",
      selector: `the coded image is changed to the upload (update answered ${updateStatus ?? "nothing"}, identifier ${JSON.stringify(identifierBefore)} -> ${JSON.stringify(identifierAfter)}, /files answers ${afterBytes?.status ?? "nothing"} with ${afterBytes?.size ?? "no"} bytes)`,
      count: updateStatus !== null && updateStatus < 400 && identifierAfter !== null && identifierAfter !== identifierBefore && afterBytes?.status === 200 && afterBytes.size === png.length ? 1 : 0,
      updateStatus,
      identifierAfter,
      afterBytesStatus: afterBytes?.status ?? null,
      afterBytesSize: afterBytes?.size ?? null,
      uploadedBytes: png.length,
    });
  }

  // 38. N4's search card paging (ACT-150, "search card paging"): the fixture
  //     carries the Search card All Topics ({"type":"Topic","sort":"name"} -
  //     synthetic-v1 deck.json) whose own page renders the same .paging
  //     pager the search results page renders (the search-card-pages
  //     journey's contract: visit /All_Topics, click the "2" link). The case
  //     drives the page-2 control and grades what page 2 shows: the active
  //     marker on "2" and a different first result id than page 1's.
  //     Read-only on a fixture card - the deck's 30 Topic cards against the
  //     20-per-page limit make the second page deterministic.
  if (/\bN4\b/.test(t)) {
    currentCase = "case 38 N4 search card paging (ACT-150)";
    if (typeof page === "undefined" || page === null) throw new Error("search-card paging probe needs the runner's page helper");
    await goto("/All_Topics");
    await settle();
    const read = () => evaluate(() => ({
      activePage: document.querySelector(".paging .page-item.active")?.textContent.trim() ?? null,
      resultIds: [...document.querySelectorAll(".search-result-list > .search-result-item [data-card-id]")].map((e) => e.getAttribute("data-card-id")),
    })).catch(() => ({ activePage: null, resultIds: [] }));
    const first = await read();
    let second = { activePage: null, resultIds: [] };
    let clicked = false;
    const next = page.locator('a.card-paging-link[aria-label="Next"]').first();
    if ((await next.count().catch(() => 0)) > 0) {
      const pending = next.click({ timeout: stepTimeout }).catch(() => {});
      await page.waitForFunction(() => document.querySelector(".paging .page-item.active")?.textContent.trim() === "2", null, { timeout: stepTimeout }).catch(() => {});
      await pending;
      clicked = true;
      await settle();
      second = await read();
    }
    const different = first.resultIds.length > 0 && second.resultIds.length > 0 && first.resultIds[0] !== second.resultIds[0];
    push({
      interaction: "assert-present",
      selector: `the search card's page renders its pager with page 1 active (.paging .page-item.active = ${JSON.stringify(first.activePage)}, ${first.resultIds.length} results) on /All_Topics`,
      count: first.activePage === "1" && first.resultIds.length > 0 ? 1 : 0,
      activePage: first.activePage,
      resultCount: first.resultIds.length,
    });
    push({
      interaction: "assert-present",
      selector: `the search card's page 2 is active and lists different cards (clicked ${clicked}, active = ${JSON.stringify(second.activePage)}, first ids differ: ${different})`,
      count: clicked && second.activePage === "2" && different ? 1 : 0,
      secondActivePage: second.activePage,
      secondResultCount: second.resultIds.length,
      different,
    });
  }

  // 39. N9's User card layout (ACT-151, "visit a User card with the user
  //     layout"): the same layout machinery case 27 proves, on a User-type
  //     card. The fixture seeds no layout rules (synthetic-v1 deck.json),
  //     so the case stages its own: a scratch User-type card, an HTML layout
  //     card wrapping {{_main}} in the case's own marks, and the User card's
  //     +*self+*layout rule. Measured 2026-10-18 on the ts engine: the User
  //     card's page then renders header mark, card body, and footer mark.
  //     Disclosed residual: the layout proven is the case's own staged
  //     layout, not a fixture-shipped "user layout" - the fixture carries
  //     none (the deck.json rule list has no *layout rule).
  if (/\bN9\b/.test(t)) {
    currentCase = "case 39 N9 User card layout (ACT-151)";
    const stamp = Date.now().toString(36);
    const host = `Harness_exhaustive_n9_user_${stamp}`;
    const layoutName = `Harness_exhaustive_n9_layout_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: host, detail: `N9 the probe's scratch User card ${host}, its layout card ${layoutName} and its +*self+*layout rule` })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") throw new Error("user-layout probe needs the runner's pageRequest helper");
    const headerMark = `N9_HEADER_${stamp}`;
    const footerMark = `N9_FOOTER_${stamp}`;
    const bodyMark = `N9_USER_BODY_${stamp}`;
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": host, "card[type]": "User", "card[content]": bodyMark, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": layoutName, "card[type]": "HTML", "card[content]": `<div class="harness-n9-header">${headerMark}</div>{{_main}}<div class="harness-n9-footer">${footerMark}</div>`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    const rule = await pageRequest.post(`${base}/card/create`, {
      headers: { origin: base },
      form: { "card[name]": `${host}+*self+*layout`, "card[type]": "Phrase", "card[content]": `[[${layoutName}]]`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await goto(`/${encodeURIComponent(host)}`);
    await settle();
    const html = await evaluate(() => document.body.innerHTML).catch(() => "");
    push({
      interaction: "assert-present",
      selector: `the User card renders through the staged layout: header mark on /${host}`,
      count: !rule.error && rule.status() < 400 && html.includes(headerMark) ? 1 : 0,
      headerMark: html.includes(headerMark),
    });
    push({
      interaction: "assert-present",
      selector: `the User card's own body renders inside the layout on /${host}`,
      count: html.includes(bodyMark) ? 1 : 0,
      bodyMark: html.includes(bodyMark),
    });
    push({
      interaction: "assert-present",
      selector: `the User card renders through the staged layout: footer mark on /${host}`,
      count: html.includes(footerMark) ? 1 : 0,
      footerMark: html.includes(footerMark),
    });
  }

  // 40. N10's reading flows (ACT-152, "read pages with nests, links, files,
  //     chains and loops"): the fixture ships a card for every shape -
  //     Report Index (transcludes the File cards Report 1/2 and holds the
  //     [[Report 3]] reference), Chain 01 (nests Chain 02 nesting Chain 03:
  //     a three-deep chain), and Loop A (nests Loop B which nests Loop A
  //     back). The case reads all three pages and grades the renders: the
  //     chain's third depth is present, the loop's page terminates (both
  //     cards' marks present, the recursion bounded - measured 2026-10-18:
  //     59/60 occurrences, 51 KB), and the files page carries its /files/
  //     download anchors and the /Report_3 reference link. Read-only on
  //     fixture cards.
  if (/\bN10\b/.test(t)) {
    currentCase = "case 40 N10 nests links files chains loops (ACT-152)";
    await goto("/Chain_01");
    await settle();
    const chainText = await evaluate(() => document.body.innerText).catch(() => "");
    push({
      interaction: "assert-present",
      selector: "the nest chain renders through its third depth (Depth 3. visible on /Chain_01)",
      count: chainText.includes("Depth 1.") && chainText.includes("Depth 3.") ? 1 : 0,
      hasDepth1: chainText.includes("Depth 1."),
      hasDepth3: chainText.includes("Depth 3."),
    });
    await goto("/Loop_A");
    await settle();
    const loop = await evaluate(() => {
      const text = document.body.innerText;
      return { hasA: text.includes("Loop A"), hasB: text.includes("Loop B"), loopBCount: (text.match(/Loop B/g) ?? []).length, length: text.length };
    }).catch(() => ({ hasA: false, hasB: false, loopBCount: 0, length: 0 }));
    push({
      interaction: "assert-present",
      selector: `the transclusion loop terminates: /Loop_A renders both cards (${loop.loopBCount} Loop B occurrences, ${loop.length} chars) instead of recursing unbounded`,
      count: loop.hasA && loop.hasB && loop.loopBCount > 0 && loop.loopBCount <= 200 ? 1 : 0,
      ...loop,
    });
    await goto("/Report_Index");
    await settle();
    const filesLinks = await countSelector("#main a[href^='/files/']");
    const report3Link = await countSelector("#main a[href='/Report_3']");
    push({
      interaction: "assert-present",
      selector: `the nests render the File cards' download anchors (${filesLinks} /files/ links) and the [[Report 3]] reference link on /Report_Index`,
      count: filesLinks >= 2 && report3Link > 0 ? 1 : 0,
      filesLinks,
      report3Link,
    });
  }

  // 41. N14's feed dedup (ACT-160, crawl-defect "the recent-changes feed
  //     shows the same act repeated 2 to 6 times"): the feed is the *recent
  //     card's core - one accordion item per act, the act id stamped in
  //     data-bs-target='#act-id-<id>' (the dedup key the
  //     recent-changes-feed-dedup instrument established: a repeated card
  //     NAME is not a repeat, several acts legitimately touch one card). The
  //     case makes its own feed first - four scratch cards, one act each -
  //     then reads the rendered feed and grades three legs: the feed is
  //     non-empty enough for a repeat to exist at all (>= 4 entries), the
  //     run's own acts are in it, and no act id appears twice. On the ts
  //     engine the measured feed carried 25 distinct acts and no duplicates,
  //     so the defect the crawl recorded is absent here and the legs hold;
  //     an engine that repeats an act fails the third leg.
  if (/\bN14\b/.test(t)) {
    currentCase = "case 41 N14 feed dedup (ACT-160)";
    const stamp = Date.now().toString(36);
    const feedPrefix = `Harness_exhaustive_n14_feed_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: `${feedPrefix}_0`, detail: "N14 the dedup probe's four feed-act scratch cards" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("feed-dedup probe needs the runner's page and pageRequest helpers");
    }
    let createdOk = true;
    for (let i = 0; i < 4; i++) {
      const create = await pageRequest.post(`${base}/card/create`, {
        headers: { origin: base },
        form: { "card[name]": `${feedPrefix}_${i}`, "card[type]": "Basic", "card[content]": "harness feed act", "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      if (create.error || create.status() >= 400) createdOk = false;
    }
    await goto("/*recent");
    await settle();
    await page.waitForSelector("#main .accordion .accordion-item", { timeout: stepTimeout }).catch(() => {});
    const feed = await evaluate((prefix) => {
      const nodes = [...document.querySelectorAll("#main .accordion .accordion-item")];
      const actIds = nodes.map((n) => n.querySelector("[data-bs-target^='#act-id-']")?.getAttribute("data-bs-target")?.replace(/^#/, "") ?? null);
      const duplicates = actIds.filter((id, i) => id !== null && actIds.indexOf(id) !== i);
      return {
        entries: nodes.length,
        distinct: new Set(actIds.filter(Boolean)).size,
        duplicates: duplicates.slice(0, 8),
        hasOurs: nodes.some((n) => (n.textContent ?? "").includes(prefix)),
      };
    }, feedPrefix).catch(() => ({ entries: 0, distinct: 0, duplicates: [], hasOurs: false }));
    push({
      interaction: "assert-present",
      selector: `the recent-changes feed is non-empty enough to certify dedup (${feed.entries} entries, this run's acts present: ${feed.hasOurs})`,
      count: createdOk && feed.entries >= 4 && feed.hasOurs ? 1 : 0,
      entries: feed.entries,
      hasOurs: feed.hasOurs,
    });
    push({
      interaction: "assert-present",
      selector: `no act repeats in the feed (${feed.distinct} distinct act ids over ${feed.entries} entries; duplicates: ${JSON.stringify(feed.duplicates)})`,
      count: feed.entries > 0 && feed.duplicates.length === 0 ? 1 : 0,
      distinct: feed.distinct,
      duplicates: feed.duplicates,
    });
  }

  // 42. F9's image standalone page (ACT-161, crawl-defect "an image card
  //     standalone page renders blank (no image)"): the crawl's blank-page
  //     shape is graded the way checks-upload-image-change grades F9 - an
  //     <img> tag alone satisfies nothing; the element must DECODE. The case
  //     creates its own Image card through the real form (name field, file
  //     choice through the engine's preliminary-upload arm, create submit),
  //     then reads the standalone page's img: complete, naturalWidth > 0,
  //     and the /files route behind its src answering 200 with the uploaded
  //     bytes. Measured 2026-10-18 on the ts engine: the created image's
  //     standalone page rendered the img decoded (naturalWidth 2, src
  //     /files/~<id>/<n>-large.png, 200, image/png), so the defect the crawl
  //     recorded is absent here; a page that renders blank fails every leg.
  if (/\bF9\b/.test(t)) {
    currentCase = "case 42 F9 image standalone decode (ACT-161)";
    const stamp = Date.now().toString(36);
    const scratch = `Harness_exhaustive_f9_image_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: scratch, detail: "F9 the standalone-image probe's own Image card" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("standalone-image probe needs the runner's page and pageRequest helpers");
    }
    const png = generatedPng(2, 1, Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]));
    await page.goto(`${base}/new/Image`, { waitUntil: "load", timeout: stepTimeout }).catch(() => {});
    const nameInput = page.locator('form.card-form input[name="card[name]"]').first();
    const fileInput = page.locator('form.card-form input[type="file"]').first();
    let createStatus = null;
    if ((await nameInput.count().catch(() => 0)) > 0 && (await fileInput.count().catch(() => 0)) > 0) {
      await nameInput.fill(scratch).catch(() => {});
      await fileInput.setInputFiles({ name: "harness-f9.png", mimeType: "image/png", buffer: png }).catch(() => {});
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: stepTimeout }).catch(() => {});
      const responded = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: stepTimeout }).catch(() => null);
      await page.locator('form.card-form button[type="submit"]').first().click().catch(() => {});
      const answered = await responded;
      createStatus = answered ? answered.status() : null;
      await page.waitForTimeout(1200);
    }
    push({
      interaction: "assert-present",
      selector: `the Image create form stores the image card (POST /card/create answered ${createStatus ?? "nothing"})`,
      count: createStatus !== null && createStatus < 400 ? 1 : 0,
      createStatus,
    });
    await goto(`/${encodeURIComponent(scratch)}`);
    await settle();
    const rendered = await evaluate(async () => {
      const img = document.querySelector("#main img");
      if (img === null) return { present: false };
      if (img.complete === false) await img.decode().catch(() => {});
      return { present: true, src: img.getAttribute("src"), complete: img.complete, naturalWidth: img.naturalWidth };
    }).catch(() => ({ present: false }));
    const served = rendered.src
      ? await fetch(new URL(rendered.src, base).href, { headers: { connection: "close" } })
          .then(async (r) => ({ status: r.status, size: (await r.arrayBuffer()).byteLength, contentType: r.headers.get("content-type") }))
          .catch(() => null)
      : null;
    push({
      interaction: "assert-present",
      selector: `the standalone image page renders an image the browser decodes (img ${rendered.present ? `present, complete ${rendered.complete}, naturalWidth ${rendered.naturalWidth}` : "absent"}; src ${JSON.stringify(rendered.src ?? null)} answers ${served?.status ?? "nothing"} with ${served?.size ?? "no"} bytes)`,
      count: rendered.present === true && rendered.complete === true && rendered.naturalWidth > 0 && served !== null && served.status === 200 && served.size > 0 ? 1 : 0,
      imgPresent: rendered.present,
      naturalWidth: rendered.naturalWidth ?? null,
      servedStatus: served?.status ?? null,
      servedBytes: served?.size ?? null,
    });
  }

  return sequence;
}
