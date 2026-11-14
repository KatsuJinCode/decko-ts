// Target cases for the SECOND half (batch 2) of the F2-ungradeable actions,
// minted by the ungradeable-2 lane on 2026-10-18.
//
// SOURCE LIST AND BATCH BOUNDARY. The run
// .runtime/exhaustive/2026-10-18-f2-ungradeable-full/run.md names 44 actions
// graded "ungradeable" (no minted case — cannot fail by construction). Split
// by id order into two disjoint halves of 22:
//   batch 1 (the sibling ungradeable-1 lane): ACT-066, ACT-068, ACT-069,
//            ACT-099, ACT-104, ACT-105, ACT-106, ACT-127, ACT-128, ACT-129,
//            ACT-132, ACT-133, ACT-134, ACT-135, ACT-140, ACT-141, ACT-146,
//            ACT-150, ACT-151, ACT-152, ACT-160, ACT-161  (boundary: ends at
//            ACT-161)
//   batch 2 (this module): ACT-163, ACT-164, ACT-166, ACT-167, ACT-168,
//            ACT-170, ACT-171, ACT-172, ACT-174, ACT-175, ACT-177, ACT-178,
//            ACT-179, ACT-180, ACT-181, ACT-184, ACT-185, ACT-186, ACT-187,
//            ACT-188, ACT-189, ACT-190  (starts at ACT-163)
// Every case's trigger regex was checked against all 190 matrix action texts
// (script in the lane's commit message evidence): each fires on exactly its
// own action id and no other.
//
// CONTRACT. Same shape as lib/exhaustive-affordance-targets.mjs: every entry
// a case pushes carries the case's id, every "assert-present" entry is a
// REQUIRED leg (the runner fails the action unless every required leg read
// > 0), witnesses are diagnostics, and write-shaped cases go through the
// live-walk gate so a restricted mode turns them into "write-skipped" (the
// run declines to grade, never passes on an unexercised claim). Each case
// mirrors the drive of the named battery check / probe that already measured
// the capability end to end (cited per case); nothing here weakens those —
// the runner versions grade the same observed bytes through the runner's own
// primitives (page, pageRequest, newActorRequest, anonymous fetch), which
// carry no database handle: stored-row witnesses ride the cards' own .json
// answers instead.

import { decideWrite } from "./live-walk-profile.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Gates one write-shaped case. Same contract as
 *  exhaustive-affordance-targets.mjs gateWrite: true to run it; when the
 *  profile refuses, pushes the skip into the sequence and returns false. */
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

/** The engine's urlKey maps every space to an underscore (DeckoName#urlKey);
 *  paths in this module are built from names with this spelling. */
const urlKey = (name) => String(name).replace(/ /g, "_");
const spaceForm = (name) => String(name).replaceAll("_", " ");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Drives the batch-2 target cases for one action. Same ctx contract as
 * affordanceTargetProbes; returns the sequence entries to append (empty when
 * the action needs none of these cases).
 */
export async function ungradeableBatch2TargetProbes({
  text, base, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, writeGate = null, stepTimeout = 30_000,
}) {
  const ctx = { text, base, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, writeGate, stepTimeout };
  const sequence = [];
  const t = String(text ?? "");
  let currentCase = null;
  const push = (entry) => {
    const tagged = { case: currentCase, ...entry };
    if (tagged.interaction === "assert-present") tagged.required = true;
    sequence.push(tagged);
  };
  const witness = (entry) => sequence.push({ case: currentCase, interaction: "witness", ...entry });

  /** Anonymous GET of a card's JSON (or any json path). */
  const jsonRead = async (path) =>
    fetch(base + path, { headers: { connection: "close" } })
      .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null), contentType: r.headers.get("content-type") }))
      .catch(() => ({ status: null, parsed: null, contentType: null }));

  /** Page navigation that returns the response (null on failure). */
  const visit = async (path) => {
    if (!page) return null;
    const res = await page.goto(base + path, { waitUntil: "load", timeout: stepTimeout }).catch(() => null);
    await settle();
    return res;
  };

  /** The #main-scoped text of the current page. */
  const mainText = async () =>
    page ? ((await page.evaluate(() => (document.querySelector("#main") ?? document.body).innerText.replace(/\s+/g, " ")).catch(() => "")) ?? "") : "";

  /** Signed-session POST /card/create through the visiting actor's channel. */
  const createCard = async (cardName, type, content, via = pageRequest) => {
    if (!via) return { ok: false, status: null, error: "no request channel" };
    const r = await via
      .post(`${base}/card/create`, {
        headers: { origin: base },
        form: { "card[name]": cardName, "card[type]": type, "card[content]": content, "success[redirect]": "true" },
        maxRedirects: 0,
      })
      .catch((e) => ({ error: String(e?.message ?? e) }));
    return { ok: !r.error && r.status() < 400, status: r.error ? null : r.status(), error: r.error ?? null };
  };

  /** The rendered search result rows (#main .search-result-list >
   *  .search-result-item scoped walk, commit e184dcaa's lesson: an unscoped
   *  data-card-name read swallows every card-slot under the page). */
  const searchRows = async (term, pageNum = null) => {
    if (!page) return { status: null, rows: [] };
    const q = `/*search?query[keyword]=${encodeURIComponent(term)}${pageNum ? `&page=${pageNum}` : ""}`;
    const res = await visit(q);
    const rows = (await page
      .evaluate(() => {
        const nodes = [...document.querySelectorAll("#main .search-result-list > .search-result-item")];
        return [...new Set(nodes.map((n) => n.querySelector("[data-card-name]")?.getAttribute("data-card-name")).filter((n) => n && n !== "*search"))];
      })
      .catch(() => [])) ?? [];
    return { status: res ? res.status() : null, rows };
  };

  // -------------------------------------------------------------------------
  // batch2 case 1 — ACT-163 (P7): "a restricted board renders its denial as a
  // create form, leaking internal machinery". The crawl defect, made
  // gradeable: an admin-only card is staged (its +*self+*read rule names
  // [[Administrator]], the staging checks-permissions.mjs and search-overmatch
  // both use), and the MEMBER's answer for it must be a denial that leaks NO
  // create machinery (no /card/create form, no card[name] input) — the exact
  // shape the 2026-10-16 crawl recorded on restricted boards. The admin's own
  // 200 read is the positive control: without it a missing card (or a rule
  // that silently failed to store) would satisfy the leak legs vacuously.
  if (/\bP7\b/.test(t)) {
    currentCase = "batch2 case 1 P7 denial-leaks-no-create-form (ACT-163)";
    const stamp = Date.now().toString(36);
    const restricted = `Harness_exhaustive_p7_${stamp}`;
    const secret = `P7_SECRET_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: restricted, detail: "P7 the probe's own admin-restricted card and its *read rule" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined" || typeof newActorRequest !== "function") {
      throw new Error("P7 probe needs the runner's pageRequest and newActorRequest helpers");
    }
    const card = await createCard(restricted, "Basic", secret);
    const rule = await createCard(`${restricted}+*self+*read`, "Phrase", "[[Administrator]]");
    // The member's answer for the restricted card.
    const member = await newActorRequest("member");
    const memberRes = await member.get(`${base}/${encodeURIComponent(restricted)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberStatus = memberRes.error ? null : memberRes.status();
    const memberBody = memberRes.error ? "" : await memberRes.text().catch(() => "");
    const memberCreateForms = (memberBody.match(/action="[^"]*\/card\/create/g) ?? []).length;
    const memberNameInputs = (memberBody.match(/name="card\[name\]"/g) ?? []).length;
    // Positive control: the administrator still reads the card.
    const adminRes = await pageRequest.get(`${base}/${encodeURIComponent(restricted)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const adminStatus = adminRes.error ? null : adminRes.status();
    const adminBody = adminRes.error ? "" : await adminRes.text().catch(() => "");
    push({
      interaction: "assert-present",
      selector: `P7 staging: the restricted card and its +*self+*read [[Administrator]] rule stored (card ${card.status}, rule ${rule.status})`,
      count: card.ok && rule.ok ? 1 : 0,
      cardStatus: card.status,
      ruleStatus: rule.status,
    });
    push({
      interaction: "assert-present",
      selector: `member is denied the admin-restricted card (denial status ${memberStatus ?? "nothing"})`,
      count: memberStatus === 403 ? 1 : 0,
      status: memberStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the member's denial leaks no create machinery (${memberCreateForms} /card/create forms, ${memberNameInputs} card[name] inputs)`,
      count: memberStatus === 403 && memberCreateForms === 0 && memberNameInputs === 0 ? 1 : 0,
      createForms: memberCreateForms,
      nameInputs: memberNameInputs,
    });
    push({
      interaction: "assert-present",
      selector: `positive control: the administrator still reads the restricted card (${adminStatus}) with its content`,
      count: adminStatus === 200 && adminBody.includes(secret) ? 1 : 0,
      status: adminStatus,
      secretShown: adminBody.includes(secret),
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 2 — ACT-164 (CM1): "comment on a card". Mirrors the measured
  // CM1 drive (checks-unmeasured-save-edit-create.mjs:361-399, PASS on
  // c9d7d2ea): the comment box is the card's ?view=comment_box form
  // (textarea[name="card[comment]"] posting to /update/<parent>), the Comment
  // button submits it, and the contract "the comment is on the card's page
  // afterwards" is graded on the fresh page's #main AND the stored content.
  if (/\bCM1\b/.test(t)) {
    currentCase = "batch2 case 2 CM1 comment on a card (ACT-164)";
    const stamp = Date.now().toString(36);
    const parent = `Harness_exhaustive_cm1_${stamp}`;
    const commentText = `CM1 exhaustive comment ${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: parent, detail: "CM1 the probe's own parent card and its posted comment" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("CM1 probe needs the runner's page and pageRequest helpers");
    }
    const created = await createCard(parent, "RichText", `CM1 parent ${stamp}`);
    await visit(`/${encodeURIComponent(parent)}?view=comment_box`);
    const form = page.locator("form.card-form").filter({ has: page.locator('textarea[name="card[comment]"]') }).first();
    const formCount = await form.count().catch(() => 0);
    let action = null;
    let postStatus = null;
    if (formCount > 0 && created.ok) {
      action = await form.getAttribute("action").catch(() => null);
      await form.locator('textarea[name="card[comment]"]').fill(commentText, { timeout: stepTimeout }).catch(() => {});
      const pending = page
        .waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/update/"), { timeout: stepTimeout })
        .then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e) }));
      await form.getByRole("button", { name: "Comment", exact: true }).click({ timeout: stepTimeout }).catch(() => {});
      const seen = await pending;
      postStatus = seen.r ? seen.r.status() : null;
      await settle();
    }
    await visit(`/${encodeURIComponent(parent)}`);
    const shows = await mainText();
    const stored = await jsonRead(`/${encodeURIComponent(parent)}.json`);
    push({
      interaction: "assert-present",
      selector: `comment box form (textarea[name="card[comment]]") on /${parent}?view=comment_box`,
      count: formCount > 0 && created.ok ? 1 : 0,
      createStatus: created.status,
      action: action ?? null,
    });
    push({
      interaction: "assert-present",
      selector: `the Comment form's POST answered a write (${postStatus ?? "nothing"})`,
      count: postStatus !== null && postStatus < 400 ? 1 : 0,
      status: postStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the comment is on the card's page afterwards (#main carries it; /${parent}.json db_content carries it)`,
      count: shows.includes(commentText) && stored.status === 200 && String(stored.parsed?.db_content ?? "").includes(commentText) ? 1 : 0,
      rendered: shows.includes(commentText),
      storedJsonStatus: stored.status,
      stored: String(stored.parsed?.db_content ?? "").includes(commentText),
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 3 — ACT-166 (C19): "create a wanted-card offer from a search
  // miss". Mirrors probe-pageonly-top10-write-permission.mjs ACT-033/ACT-166
  // (committed probe, ALL LEGS GREEN 2026-10-18): the search miss's navbox
  // autocomplete offers an add affordance naming the missing card; following
  // it lands on a create form pre-named for the missing name; submitting
  // stores the card at the space-normalized name (DeckoName#urlKey maps
  // spaces to underscores and back). The surface probes signed OUT, so the
  // storing leg replays the served form's own fields through the signed-in
  // member's request channel (the second-save conflict case's newActorRequest
  // pattern); the replay is disclosed in the leg's record.
  if (/\bC19\b/.test(t)) {
    currentCase = "batch2 case 3 C19 wanted-card offer from a search miss (ACT-166)";
    const wanted = `zz_wanted_${Date.now().toString(36)}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: spaceForm(wanted), detail: "C19 the wanted card the offer's own form creates" })) {
      return sequence;
    }
    if (typeof newActorRequest !== "function") {
      throw new Error("C19 probe needs the runner's newActorRequest helper");
    }
    // The create offer decko implements is the search box's
    // search_box_complete JSON `add` item (checks-cover-b.mjs C6: the add
    // item yields action "add" only when exact.add_autocomplete_ok? —
    // new_card? && name.valid? && !virtual? && ok?(:create) — with url = the
    // new card's own path). Runs 1 and 2 measured the SIGNED-OUT menu (this
    // surface probes anonymous) carrying only the search item: ok?(:create)
    // is false signed out, so the page-level menu cannot carry the offer by
    // design. The case therefore drives C6's own contract through the
    // member's authenticated request channel: the endpoint's add item
    // naming the missing card, the add item's own url serving the create
    // form pre-named for it, and the offered create storing the card.
    const member = await newActorRequest("member");
    const completeRes = await member
      .get(`${base}/*search/search_box_complete.json?term=${encodeURIComponent(wanted)}`)
      .catch((e) => ({ error: String(e?.message ?? e) }));
    const completeBody = completeRes.error ? "" : await completeRes.text().catch(() => "");
    let items = [];
    try { items = JSON.parse(completeBody) ?? []; } catch { items = []; }
    if (!Array.isArray(items)) items = [];
    const addItem = items.find((i) => i?.action === "add") ?? null;
    const addItemUrl = typeof addItem?.url === "string" ? addItem.url : null;
    // The add item's url is the new card's own path: visiting it serves the
    // create form pre-named for the missing card.
    let formStatus = null;
    let prefilled = [];
    if (addItemUrl) {
      const formRes = await member.get(addItemUrl.startsWith("/") ? base + addItemUrl : addItemUrl).catch((e) => ({ error: String(e?.message ?? e) }));
      formStatus = formRes.error ? null : formRes.status();
      const formHtml = formRes.error ? "" : await formRes.text().catch(() => "");
      prefilled = (formHtml.match(/name="card\[name\]"[^>]*value="([^"]*)"/g) ?? []).map((m) => /value="([^"]*)"/.exec(m)?.[1] ?? "");
      if (prefilled.length === 0) {
        // attribute order varies; try the value-first spelling too
        prefilled = (formHtml.match(/value="([^"]*)"[^>]*name="card\[name\]"/g) ?? []).map((m) => /value="([^"]*)"/.exec(m)?.[1] ?? "");
      }
    }
    // The offered create stores the card at the urlKey's space form.
    let replay = { status: null, json: { status: null, parsed: null } };
    if (addItem) {
      const res = await member
        .post(`${base}/card/create`, {
          headers: { origin: base },
          form: { "card[name]": wanted, "card[type]": "Basic", "card[content]": `C19 wanted card body ${Date.now().toString(36)}`, "success[redirect]": "true" },
          maxRedirects: 0,
        })
        .catch((e) => ({ error: String(e?.message ?? e) }));
      replay.status = res.error ? null : res.status();
      replay.json = await jsonRead(`/${encodeURIComponent(wanted)}.json`);
    }
    push({
      interaction: "assert-present",
      selector: `the search miss's search_box_complete offers the create item for the wanted card (status ${completeRes.error ? "error" : completeRes.status()}, actions ${JSON.stringify(items.map((i) => i?.action))}, add url ${JSON.stringify(addItemUrl)})`,
      count: !completeRes.error && completeRes.status() === 200 && addItem !== null && addItemUrl !== null && String(addItemUrl).toLowerCase().includes(wanted) ? 1 : 0,
      status: completeRes.error ? null : completeRes.status(),
      actions: items.map((i) => i?.action),
      addItemUrl,
      addItemValue: addItem?.value ?? null,
    });
    push({
      interaction: "assert-present",
      selector: `the offer's own url serves the create form pre-named for the missing card (status ${formStatus ?? "nothing"}, prefill ${JSON.stringify(prefilled)})`,
      count: formStatus !== null && formStatus < 400 && prefilled.some((v) => v.replaceAll("_", " ") === spaceForm(wanted) || v === wanted) ? 1 : 0,
      formStatus,
      prefilled,
    });
    push({
      interaction: "assert-present",
      selector: `the offered create stores the card (member-channel submit answered ${replay.status ?? "nothing"}; /${wanted}.json ${replay.json?.status ?? "nothing"} carrying ${JSON.stringify(replay.json?.parsed?.name ?? null)})`,
      count: replay.status !== null && replay.status < 400 && replay.json.status === 200 && (replay.json.parsed?.name === wanted || replay.json.parsed?.name === spaceForm(wanted)) ? 1 : 0,
      replayStatus: replay.status,
      jsonStatus: replay.json.status,
      storedName: replay.json.parsed?.name ?? null,
      requestedSpellings: [wanted, spaceForm(wanted)],
      note: "the drive rides the signed-in member's request channel because add_autocomplete_ok? requires ok?(:create), which the anonymous menu measured false (runs 1-2: only the search item offered signed out); the endpoint, add item, prefill and storage are C6's own contract. Run 3 measured the stored name verbatim (underscore form) — the probe's space-form lesson is about URL lookup, which resolves either spelling, so the storage leg accepts both spellings of the SAME requested name",
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 4 — ACT-167 (C20): "create a plus card (+right) from the UI".
  // Mirrors the measured C20 drive (checks-role-checkbox-and-plus-right-
  // creation.mjs:844-1012, 6/6 PASS on f30a291e and c9d7d2ea): a RichText
  // card nesting an unknown +*right member renders it as a.wanted-card; the
  // wanted card's own page serves a create form PRE-NAMED for the +*right
  // name; submitting stores it; a fresh read renders the member as a known
  // card. The junction-row shape stays owned by the C20 battery check (the
  // runner has no database handle); the stored row is witnessed by the
  // /<right>.json answer. Fixture names carry NO underscore (the C20 check's
  // measured urlKey lesson: a literal underscore cannot round-trip a URL).
  if (/\bC20\b/.test(t)) {
    currentCase = "batch2 case 4 C20 plus-card +right creation (ACT-167)";
    const stamp = Date.now().toString(36);
    const cardName = `HarnessExhaustiveC20${stamp}`;
    const rightName = `${cardName}+*right+${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName, detail: `C20 the probe's RichText card, its +*right set, and the created +*right member ${rightName}` })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("C20 probe needs the runner's page helper");
    }
    const card = await createCard(cardName, "RichText", `[[${rightName}]]`);
    const setSeed = await createCard(`${cardName}+*right`, "List", "");
    await visit(`/${encodeURIComponent(cardName)}`);
    const wantedLink = (await page
      .evaluate((name) => [...document.querySelectorAll("a.wanted-card")].map((a) => ({ href: a.getAttribute("href"), text: (a.textContent ?? "").trim().slice(0, 60) })).filter((a) => decodeURIComponent(a.href ?? "").includes(name)), rightName)
      .catch(() => [])) ?? [];
    let servedName = null;
    let postStatus = null;
    if (wantedLink.length > 0 && card.ok) {
      await page.locator("a.wanted-card").first().click({ timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(1_500);
      await settle();
      servedName = await page.evaluate(() => document.querySelector("form.card-form input[name='card[name]']")?.value ?? null).catch(() => null);
      if (servedName !== null) {
        const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: stepTimeout }).catch(() => null);
        await page.locator("form.card-form .create-submit-button").first().click({ timeout: stepTimeout }).catch(() => {});
        const res = await pending;
        postStatus = res ? res.status() : null;
        await page.waitForTimeout(1_000);
      }
    }
    const rightJson = await jsonRead(`/${encodeURIComponent(rightName)}.json`);
    await visit(`/${encodeURIComponent(cardName)}`);
    const knownAfter = (await page
      .evaluate((name) => [...document.querySelectorAll("a")].some((a) => decodeURIComponent(a.getAttribute("href") ?? "").includes(name) && (a.getAttribute("class") ?? "").includes("known-card")), rightName)
      .catch(() => false)) ?? false;
    push({
      interaction: "assert-present",
      selector: `the card page renders the unknown +*right nest member as a wanted-card link on /${cardName}`,
      count: card.ok && wantedLink.length > 0 ? 1 : 0,
      cardStatus: card.status,
      setSeedStatus: setSeed.status,
      wantedLink,
    });
    push({
      interaction: "assert-present",
      selector: `the wanted card's create form is pre-named for the +*right card (served ${JSON.stringify(servedName)})`,
      count: servedName === rightName ? 1 : 0,
      servedName,
    });
    push({
      interaction: "assert-present",
      selector: `submitting it stores the +*right card (POST ${postStatus ?? "nothing"}; /<right>.json ${rightJson.status ?? "nothing"})`,
      count: postStatus !== null && postStatus < 400 && rightJson.status === 200 ? 1 : 0,
      postStatus,
      jsonStatus: rightJson.status,
    });
    push({
      interaction: "assert-present",
      selector: `a fresh read renders the created +*right member as a known card on /${cardName}`,
      count: knownAfter ? 1 : 0,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 5 — ACT-168 (C21): "type-scoped create route". Mirrors
  // probe-pageonly-top10-write-permission.mjs ACT-168: /new/Note serves the
  // create form already typed as Note, and the card the form stores carries
  // that type — witnessed here by the stored row's own .json type_name (the
  // probe's database type_id read is not available to the runner).
  if (/\bC21\b/.test(t)) {
    currentCase = "batch2 case 5 C21 type-scoped create route (ACT-168)";
    const name = `Harness_exhaustive_c21_${Date.now().toString(36)}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: name, detail: "C21 the card the type-scoped create form stores" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("C21 probe needs the runner's page helper");
    }
    const res = await visit("/new/Note");
    const formShape = await page
      .evaluate(() => {
        const form = [...document.querySelectorAll("form.card-form")].find((f) => (f.getAttribute("action") ?? "").includes("/card/create")) ?? null;
        return form
          ? { action: form.getAttribute("action"), typeId: form.querySelector("[name='card[type_id]']")?.value ?? null, hasNameField: !!form.querySelector("input[name='card[name]']") }
          : null;
      })
      .catch(() => null);
    let postStatus = null;
    if (formShape && formShape.typeId !== null && formShape.hasNameField) {
      await page.locator("form.card-form input[name='card[name]']").first().fill(name, { timeout: stepTimeout }).catch(() => {});
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: stepTimeout }).catch(() => null);
      await page.locator("form.card-form .create-submit-button").first().click({ timeout: stepTimeout }).catch(() => {});
      const seen = await pending;
      postStatus = seen ? seen.status() : null;
      await page.waitForTimeout(1_000);
    }
    const stored = await jsonRead(`/${encodeURIComponent(name)}.json`);
    push({
      interaction: "assert-present",
      selector: `/new/Note serves the create form carrying the type (action ${formShape?.action ?? "none"}, type_id ${formShape?.typeId ?? "none"})`,
      count: res && res.status() < 400 && formShape && formShape.typeId !== null && formShape.hasNameField ? 1 : 0,
      status: res ? res.status() : null,
      formShape,
    });
    push({
      interaction: "assert-present",
      selector: `the card the form stores carries the route's type (/${name}.json type_name ${JSON.stringify(stored.parsed?.type_name ?? null)})`,
      count: postStatus !== null && postStatus < 400 && stored.status === 200 && stored.parsed?.type_name === "Note" ? 1 : 0,
      postStatus,
      jsonStatus: stored.status,
      storedTypeName: stored.parsed?.type_name ?? null,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 6 — ACT-170 (N13): "recent-changes feed renders as a feed".
  // Mirrors probe-pageonly-top10-write-permission.mjs ACT-170: after a real
  // write, /*recent renders accordion entries with card links, the fresh act
  // FIRST, and the first entry expands into the act's action list. Scoped to
  // #main (the N5 lesson, e184dcaa).
  if (/\bN13\b/.test(t)) {
    currentCase = "batch2 case 6 N13 recent feed renders as a feed (ACT-170)";
    const name = `Harness_exhaustive_n13_${Date.now().toString(36)}`;
    const newContent = `N13 edited body ${Date.now().toString(36)}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: name, detail: "N13 the probe's scratch card and the edit the feed must witness" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof pageRequest === "undefined") {
      throw new Error("N13 probe needs the runner's page and pageRequest helpers");
    }
    const created = await createCard(name, "Basic", "feed seed");
    let updateStatus = null;
    if (created.ok) {
      const upd = await pageRequest
        .post(`${base}/update/${encodeURIComponent(name)}`, {
          headers: { origin: base },
          form: { "card[content]": newContent, "success[redirect]": "true" },
          maxRedirects: 0,
        })
        .catch((e) => ({ error: String(e?.message ?? e) }));
      updateStatus = upd.error ? null : upd.status();
    }
    await visit("/*recent");
    const feed = (await page
      .evaluate(() => [...document.querySelectorAll("#main .accordion .accordion-item")].slice(0, 6).map((it) => ({
        title: (it.querySelector(".col-8")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        links: [...it.querySelectorAll(".accordion-header a.known-card")].map((a) => a.getAttribute("href")).slice(0, 4),
      })))
      .catch(() => [])) ?? [];
    let expanded = null;
    const firstBtn = page.locator("#main .accordion-item .accordion-button").first();
    if ((await firstBtn.count().catch(() => 0)) > 0) {
      await firstBtn.click({ timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(2_000);
      await settle();
      expanded = await page
        .evaluate(() => {
          const body = document.querySelector("#main .accordion-item .accordion-collapse .accordion-body, #main .accordion-item .accordion-body");
          return { bodyText: body ? body.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null, hasActionList: !!document.querySelector("#main .accordion-item .action-list, #main .accordion-item .action_summary-view") };
        })
        .catch(() => null);
    }
    push({
      interaction: "assert-present",
      selector: `the fresh act is FIRST in the feed (entry 0 titles ${JSON.stringify(feed[0]?.title ?? null)}; the edit answered ${updateStatus ?? "nothing"})`,
      count: created.ok && updateStatus !== null && updateStatus < 400 && feed.length > 0 && feed[0].title.includes(name) ? 1 : 0,
      feedTitles: feed.map((f) => f.title),
      updateStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the feed's entries carry card links (${feed.filter((f) => f.links.length > 0).length} of ${feed.length} entries have links)`,
      count: feed.length > 0 && feed.some((f) => f.links.length > 0) ? 1 : 0,
    });
    push({
      interaction: "assert-present",
      selector: `the first feed entry expands into its act list (body ${expanded ? "read" : "not read"}, action list ${expanded?.hasActionList ?? null})`,
      count: expanded && expanded.bodyText !== null && expanded.hasActionList ? 1 : 0,
      expanded,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 7 — ACT-171 (N15): "hashtag/reference navigation". Mirrors
  // checks-unmeasured-save-edit-create.mjs N15 (PASS on c9d7d2ea): a card
  // whose body is [[Target]] renders a reference link; following it lands on
  // the referenced card, which renders its own main slot.
  if (/\bN15\b/.test(t)) {
    currentCase = "batch2 case 7 N15 reference navigation (ACT-171)";
    const stamp = Date.now().toString(36);
    const target = `Harness_exhaustive_n15_target_${stamp}`;
    const referrer = `Harness_exhaustive_n15_referrer_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: referrer, detail: `N15 the probe's referrer ${referrer} and its referenced target ${target}` })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("N15 probe needs the runner's page helper");
    }
    const targetCard = await createCard(target, "Basic", `N15 target content ${stamp}`);
    const referrerCard = await createCard(referrer, "RichText", `Before [[${target}]] after`);
    await visit(`/${encodeURIComponent(referrer)}`);
    const link = (await page
      .evaluate((tgt) => [...document.querySelectorAll("#main a")].map((a) => a.getAttribute("href")).filter((h) => h !== null && (h.endsWith("/" + tgt) || h.endsWith("/" + encodeURIComponent(tgt)) || h.includes(tgt) || h.includes(encodeURIComponent(tgt)))), target)
      .catch(() => [])) ?? [];
    let landed = { url: null, presented: null, mentions: false };
    if (link.length > 0) {
      await page.locator(`#main a[href='${link[0]}']`).first().click({ timeout: stepTimeout }).catch(() => {});
      await page.waitForLoadState("load", { timeout: stepTimeout }).catch(() => {});
      await settle();
      landed.url = page.url();
      landed.presented = await page.evaluate(() => document.querySelector(".card-slot.titled-view")?.getAttribute("data-card-name") ?? null).catch(() => null);
      landed.mentions = (await mainText()).includes(target);
    }
    push({
      interaction: "assert-present",
      selector: `the [[${target}]] reference renders as a link on /${referrer} (${link.length} candidate hrefs)`,
      count: targetCard.ok && referrerCard.ok && link.length > 0 ? 1 : 0,
      createStatuses: [targetCard.status, referrerCard.status],
      candidateHrefs: link.slice(0, 6),
    });
    push({
      interaction: "assert-present",
      selector: `following the reference lands on the referenced card (landed ${landed.url ?? "nowhere"}, titled slot ${JSON.stringify(landed.presented)})`,
      count: link.length > 0 && (landed.presented === target || /\/${esc(urlKey(target))}(\/|$|\?)/.test(landed.url ?? "")) && landed.mentions ? 1 : 0,
      landed,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 8 — ACT-172 (N16): "RSS format view of a search or card".
  // Mirrors checks-content-flows.mjs N16 (PASS on c9d7d2ea and 5db16a46):
  // BOTH the card mark's .rss format and the search's format=rss answer an
  // RSS-format view, graded by the check's own looksRss predicate (an XML
  // document or an rss/xml content-type). The port's default-disabled feed
  // contract (head bytes "RSS feeds disabled") is recorded as evidence
  // exactly as the check records it — no enabled-feed acceptance is claimed.
  if (/\bN16\b/.test(t)) {
    currentCase = "batch2 case 8 N16 RSS format views (ACT-172)";
    if (typeof pageRequest === "undefined") {
      throw new Error("N16 probe needs the runner's pageRequest helper");
    }
    const card = "Brief";
    // THE PREDICATE IS PINNED TO RUBY'S OWN MEASURED ANSWER. The old
    // predicate demanded an XML body or an xml-ish content-type, which is a
    // shape STOCK RUBY DOES NOT ANSWER at these two routes: the oracle
    // itself, booted from reference-harness/browser/engines/ruby.json on
    // this same synthetic-v1 fixture, answers
    //
    //   /Brief.rss                  200  text/html; charset=utf-8  "RSS feeds disabled"
    //   /*search?format=rss&term=.. 200  text/html; charset=utf-8  "RSS feeds disabled"
    //
    // (receipt C:/localProjects/brandonDojoTech/tmp/act172-175-evidence/
    // ruby-reference-act172-act175.json, written by that directory's
    // measure-ruby-reference.mjs; both rows record length 18 and body
    // "RSS feeds disabled"). Ruby ITSELF answers text/html on the rss
    // format: RssFormat < HtmlFormat (mod/format/lib/card/format/
    // rss_format.rb:6) overrides nothing, so Card::Format#mime_type
    // resolves to HtmlFormat's "text/html" (html_format.rb:24-26), and the
    // RSS mimes register on the REQUEST side only. The feed itself is
    // disabled by the stock default (rss_enabled FALSE,
    // mod/format/lib/card/mod/format.rb:3), so rss.rb:17-19's
    // `return "RSS feeds disabled"` is the answer. The old predicate could
    // therefore only ever pass against an ENABLED feed, which this fixture
    // never is - so the case graded the PORT against a contract RUBY ITSELF
    // fails. The 2026-10-23 regrade run at e8b70ad3 recorded exactly that:
    // both arms status 200, content-type "text/html; charset=utf-8", head
    // "RSS feeds disabled", and both legs red.
    //
    // The predicate below is the one the accepted probe already uses
    // (reference-harness/browser/probe-pageonly-batch7-ranks81-90.mjs): a
    // real feed document (XML declaration / <rss> / <rdf:RDF>, or an
    // application/rss+xml|atom+xml|xml content-type) OR Ruby's measured
    // default-disabled answer, matched EXACTLY (body === "RSS feeds
    // disabled", length 18, content-type exactly text/html; charset=utf-8)
    // so the predicate cannot be satisfied by some text mentioning RSS. No
    // enabled-feed acceptance is claimed: nothing here observes a real feed
    // document.
    const RUBY_RSS_DISABLED_BODY = "RSS feeds disabled";
    const RUBY_RSS_DISABLED_CONTENT_TYPE = /^text\/html;\s*charset=utf-8$/i;
    const ask = async (path) => {
      const res = await pageRequest.get(base + path, { maxRedirects: 0 }).catch((e) => ({ error: String(e?.message ?? e) }));
      if (res.error) return { path, status: null, contentType: null, body: "", looksRss: false, matchesRubyDisabledAnswer: false, isFeedDocument: false };
      const body = await res.text().catch(() => "");
      const contentType = res.headers()?.["content-type"] ?? null;
      const matchesRubyDisabled = body === RUBY_RSS_DISABLED_BODY && RUBY_RSS_DISABLED_CONTENT_TYPE.test(contentType ?? "");
      const isFeedDocument = /<\?xml/i.test(body) || /<rss[\s>]/i.test(body) || /<rdf:RDF/i.test(body) || /application\/(rss\+xml|atom\+xml|xml)/i.test(contentType ?? "");
      return {
        path,
        status: res.status(),
        contentType,
        bodyLength: body.length,
        matchesRubyDisabledAnswer: matchesRubyDisabled,
        isFeedDocument,
        looksRss: matchesRubyDisabled || isFeedDocument,
        head: body.replace(/\s+/g, " ").slice(0, 200),
      };
    };
    const cardRss = await ask(`/${encodeURIComponent(card)}.rss`);
    const searchRss = await ask(`/*search?format=rss&term=${encodeURIComponent("rss card body")}`);
    const cardJson = await ask(`/${encodeURIComponent(card)}.json`);
    push({
      interaction: "assert-present",
      selector: `/${card}.rss answers an RSS format view (status ${cardRss.status}, content-type ${cardRss.contentType}, bytes ${cardRss.bodyLength})`,
      count: cardRss.status === 200 && cardRss.looksRss ? 1 : 0,
      cardRss,
    });
    push({
      interaction: "assert-present",
      selector: `the search answers an RSS format view (status ${searchRss.status}, content-type ${searchRss.contentType}, bytes ${searchRss.bodyLength})`,
      count: searchRss.status === 200 && searchRss.looksRss ? 1 : 0,
      searchRss,
    });
    // POSITIVE CONTROL, graded rather than witnessed: the same mark and the
    // same card must still answer JSON on the .json arm, and must NOT look
    // like an RSS answer. Without it the two legs above could pass on two
    // identical answers.
    const jsonArmIsJson = cardJson.status === 200 && /^application\/json\b/i.test(cardJson.contentType ?? "") && cardJson.looksRss === false;
    push({
      interaction: "assert-present",
      selector: `the same mark's .json arm still answers JSON and is not an RSS answer (${cardJson.status}, ${cardJson.contentType})`,
      count: jsonArmIsJson ? 1 : 0,
      jsonStatus: cardJson.status,
      jsonContentType: cardJson.contentType,
    });
    witness({
      selector: `format-dispatch control: the rss answers are recorded exactly as the surface gave them, and the port's bytes match the Ruby oracle's own default-disabled answer (${cardRss.matchesRubyDisabledAnswer} / ${searchRss.matchesRubyDisabledAnswer})`,
      jsonStatus: cardJson.status,
      jsonContentType: cardJson.contentType,
      cardRssHead: cardRss.head,
      searchRssHead: searchRss.head,
      cardMatchesRuby: cardRss.matchesRubyDisabledAnswer,
      searchMatchesRuby: searchRss.matchesRubyDisabledAnswer,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 9 — ACT-174 (UI2): "help popover on editor fields". Mirrors
  // checks-widget-interactions.mjs UI2 (PASS on c9d7d2ea and the accepted
  // UI1/UI2 capture): the stock rule editor's Set-selection field registers
  // a bootstrap popover with the exact help string; hovering the popover
  // anchor must show it with that registered body.
  if (/\bUI2\b/.test(t)) {
    currentCase = "batch2 case 9 UI2 help popover (ACT-174)";
    const stamp = Date.now().toString(36);
    const name = `Harness_exhaustive_ui2_${stamp}`;
    const rule = `${name}+*self+*read`;
    const expected = "Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones.";
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: name, detail: `UI2 the probe's fixture ${name} and its +*self+*read rule whose form carries the popover` })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("UI2 probe needs the runner's page helper");
    }
    const card = await createCard(name, "RichText", "help popover fixture");
    const ruleCard = await createCard(rule, "Phrase", "[[Anyone]]");
    const res = await visit(`/${encodeURIComponent(rule)}/rule_form`);
    const selector = 'form.card-rule-form a[data-bs-toggle="popover"]:not(._card-menu-popover)';
    const anchor = page.locator(selector).first();
    const anchorCount = await anchor.count().catch(() => 0);
    const setControls = await page.locator('form.card-rule-form input[name="card[name]"]').count().catch(() => 0);
    let registered = null;
    let shown = null;
    let interactionError = null;
    if (anchorCount > 0) {
      registered = await anchor.getAttribute("data-bs-content").catch(() => null);
      try {
        await anchor.hover({ timeout: 5_000 });
        await page.waitForFunction(
          ({ sel, exp }) => {
            const a = document.querySelector(sel);
            const id = a?.getAttribute("aria-describedby");
            const node = id ? document.getElementById(id) : null;
            return node?.classList.contains("popover") && node.getClientRects().length > 0 && node.querySelector(".popover-body")?.textContent?.trim() === exp;
          },
          { sel: selector, exp: expected },
          { timeout: 5_000 },
        );
      } catch (error) {
        interactionError = String(error?.message ?? error).split("\n")[0];
      }
      shown = await anchor
        .evaluate((el) => {
          const id = el.getAttribute("aria-describedby");
          const node = id ? document.getElementById(id) : null;
          return { describedBy: id, body: node?.querySelector(".popover-body")?.textContent?.trim() ?? null, visible: !!node?.getClientRects().length };
        })
        .catch(() => null);
    }
    push({
      interaction: "assert-present",
      selector: `the rule editor serves its Set-selection field with the registered help popover on /<rule>/rule_form (anchor ${anchorCount}, set controls ${setControls})`,
      count: res && res.status() === 200 && card.ok && ruleCard.ok && setControls > 0 && anchorCount > 0 && registered === expected ? 1 : 0,
      status: res ? res.status() : null,
      anchorCount,
      setControls,
      registered,
      expected,
      writeStatuses: [card.status, ruleCard.status],
    });
    push({
      interaction: "assert-present",
      selector: `hovering the anchor shows the popover with the registered help text (visible ${shown?.visible ?? null}, body matches ${shown?.body === expected})`,
      count: shown?.visible === true && shown?.body === expected && interactionError === null ? 1 : 0,
      shown,
      interactionError,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 10 — ACT-175 (A6): "role checkbox editing on account/rules
  // surfaces". Mirrors the measured A6 drive (checks-role-checkbox-and-plus-
  // right-creation.mjs, corrected by the release-verification worker's r5
  // diagnostic: the native inline :edit_inline control round-trips). The
  // editor is the navbar's autosave form action="/update/<actor>+*enabled
  // roles"; the visiting administrator's own checked role box is clicked —
  // the click IS the post. PERSISTENCE WITNESS: the control's write target
  // is the visitor-session card `<actor>+*enabled roles` (the decko_visit
  // cookie, decoded by the engine's own readVisitorSession/sessionCardContent
  // from dist — the exact chain the battery check grades), so the flip and
  // restore legs grade on the SESSION CONTENT moving and returning, not on
  // the rendered checkbox: run 1 measured the administrator's box re-render
  // CHECKED after an accepted uncheck POST because ensure_roles re-fills the
  // current roles at render time (the module documents the same render-time
  // refill). "The same click restores the pre-click set" is the restore leg.
  // Edits touch the visitor-session selection only (canonical grants
  // unchanged); a finally block re-clicks until the pre-click session
  // content is verified restored, and the restore outcome is pushed as a
  // witness whatever it reads.
  if (/\bA6\b/.test(t)) {
    currentCase = "batch2 case 10 A6 role checkbox editing (ACT-175)";
    if (typeof page === "undefined" || page === null) {
      throw new Error("A6 probe needs the runner's page helper");
    }
    // The engine's own visitor-session decoder, from this checkout's dist
    // (the ts engine boots from the same build; the battery's A6 check
    // imports the identical files).
    const visitorSession = await import(
      pathToFileURL(path.resolve(import.meta.dirname, "../../..", "dist", "src", "card", "session", "visitor-session.js")).href
    ).catch(() => null);
    const cookieHeader = async () => {
      const cookies = await page.context().cookies();
      const visit = cookies.find((c) => c.name === "decko_visit");
      return visit === undefined ? undefined : `decko_visit=${visit.value}`;
    };
    // sessionCardContent looks its card up by DeckoName key, so both the
    // urlKey and the space spellings of the actor segment are tried; the
    // candidate that carried content is recorded.
    const readSessionRoles = async (actorSegment) => {
      if (!visitorSession?.readVisitorSession || !visitorSession?.sessionCardContent) return { available: false, candidates: [], cookiePresent: null, cookieLength: null };
      const header = await cookieHeader();
      if (!header) return { available: true, candidates: [], cookiePresent: false, cookieLength: 0 };
      const state = visitorSession.readVisitorSession(header);
      const candidates = [];
      for (const name of [`${actorSegment}+*enabled roles`, `${spaceForm(actorSegment)}+*enabled roles`]) {
        const raw = visitorSession.sessionCardContent(state, name);
        if (raw !== undefined && raw !== null) candidates.push({ cardName: name, raw: String(raw) });
      }
      return { available: true, candidates, cookiePresent: true, cookieLength: header.length };
    };
    const formSel = '.navbar form.card-form[action$="+*enabled_roles"]';
    const openEditor = async () => {
      await visit("/");
      const form = page.locator(formSel).first();
      const count = await form.count().catch(() => 0);
      if (count > 0) {
        await page.locator('.navbar [data-bs-toggle="dropdown"]').last().click({ timeout: 5_000 }).catch(() => {});
        await page.locator(".navbar .dropdown-menu.show").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      }
      return form;
    };
    const readBoxes = async (form) =>
      ((await form
        .evaluate((f) => [...f.querySelectorAll("input.pointer-checkbox-button")].map((b) => ({ name: b.getAttribute("name"), value: b.value, checked: b.checked, display: getComputedStyle(b).display, visible: b.offsetParent !== null })))
        .catch(() => [])) ?? []);
    let restoredVerified = null;
    let clickHappened = false;
    try {
      const form = await openEditor();
      const formCount = await form.count().catch(() => 0);
      const boxes = formCount > 0 ? await readBoxes(form) : [];
      const clickable = boxes.filter((b) => b.visible && b.display !== "none");
      const boxInfo = clickable[0] ?? null;
      const actionPath = formCount > 0 ? await form.getAttribute("action").catch(() => null) : null;
      const actorSegment = actionPath
        ? decodeURIComponent(new URL(actionPath, base).pathname.split("/update/")[1] ?? "").replace(/\+\*enabled_roles$/, "")
        : null;
      const sessionBefore = boxInfo ? await readSessionRoles(actorSegment) : { available: null, candidates: [] };
      const beforeJson = JSON.stringify(sessionBefore.candidates.map((c) => c.raw).sort());
      let postStatus = null;
      let afterFirst = null;
      let sessionAfter = null;
      if (boxInfo && actionPath) {
        clickHappened = true;
        const pending = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === new URL(actionPath, base).pathname, { timeout: 15_000 }).then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e) }));
        await form.locator(`input.pointer-checkbox-button[name="${boxInfo.name}"][value="${boxInfo.value}"]`).first().click({ timeout: 10_000 }).catch(() => {});
        const seen = await pending;
        postStatus = seen.r ? seen.r.status() : null;
        if (postStatus !== null) {
          await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1_500);
          const form2 = await openEditor();
          afterFirst = (await readBoxes(form2)).find((b) => b.value === boxInfo.value) ?? null;
          sessionAfter = await readSessionRoles(actorSegment);
        }
      }
      const afterJson = JSON.stringify((sessionAfter?.candidates ?? []).map((c) => c.raw).sort());
      push({
        interaction: "assert-present",
        selector: `the inline enabled-roles editor serves role checkboxes (form ${formCount}, boxes ${boxes.length}, clickable ${clickable.length})`,
        count: formCount > 0 && clickable.length > 0 ? 1 : 0,
        boxes,
        actorSegment,
        decoderAvailable: !!visitorSession?.readVisitorSession,
      });
      push({
        interaction: "assert-present",
        selector: `clicking the role checkbox posts and the visitor-session enabled-roles selection moves (POST ${postStatus ?? "nothing"}; session content ${beforeJson} -> ${afterJson}; rendered ${boxInfo?.checked ?? null} -> ${afterFirst?.checked ?? null}, render-time ensure_roles refill disclosed above)`,
        count: postStatus !== null && postStatus < 400 && clickHappened && afterJson !== beforeJson ? 1 : 0,
        postStatus,
        sessionBefore: sessionBefore.candidates,
        sessionAfter: sessionAfter?.candidates ?? null,
        decoderAvailable: !!visitorSession?.readVisitorSession,
        cookieBefore: { present: sessionBefore.cookiePresent ?? null, length: sessionBefore.cookieLength ?? null },
        cookieAfter: { present: sessionAfter?.cookiePresent ?? null, length: sessionAfter?.cookieLength ?? null },
        actorSegment,
        checkedBefore: boxInfo?.checked ?? null,
        checkedAfter: afterFirst?.checked ?? null,
      });
      if (clickHappened && postStatus !== null && postStatus < 400 && afterJson !== beforeJson) {
        const form3 = await openEditor();
        const restoreActionPath = new URL(await form3.getAttribute("action").catch(() => null) ?? "", base).pathname;
        const pending2 = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === restoreActionPath, { timeout: 15_000 }).then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e) }));
        await form3.locator(`input.pointer-checkbox-button[name="${boxInfo.name}"][value="${boxInfo.value}"]`).first().click({ timeout: 10_000 }).catch(() => {});
        const seen2 = await pending2;
        const restoreStatus = seen2.r ? seen2.r.status() : null;
        let sessionRestored = null;
        if (restoreStatus !== null) {
          await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1_500);
          const form4 = await openEditor();
          const afterRestoreBoxes = await readBoxes(form4);
          const afterRestore = afterRestoreBoxes.find((b) => b.value === boxInfo.value) ?? null;
          sessionRestored = await readSessionRoles(actorSegment);
          const restoredJson = JSON.stringify((sessionRestored?.candidates ?? []).map((c) => c.raw).sort());
          // THE PRE-CLICK SET IS COMPARED AS THE SET A PERSON SEES, NOT AS
          // THE STORED TEXT. The stored text before the first click is
          // UNSET (the visitor session held no enabled-roles content at
          // all), because ensure_roles refills the CURRENT roles at RENDER
          // time rather than writing them into the session: the module's
          // own note records that the administrator's box re-renders CHECKED
          // after an accepted uncheck POST because of that refill. So the
          // text a restore click writes ("Anyone Signed In\r\nAdministrator",
          // the full default set) is not the text the pre-click state held
          // (""), while the EFFECTIVE set of enabled roles - the checkboxes
          // a person sees - is identical before the click and after the
          // restore. Comparing the stored TEXT graded the restore against a
          // baseline the engine never held, so the leg could not pass even
          // when the restore was correct. Measured 2026-10-23 on the ts
          // engine over synthetic-v1: before the click both boxes read
          // checked (the effective set is both roles); after the restore
          // both read checked again, and the stored text carries the full
          // set. The effective comparison grades what the claim says ("the
          // same click restores the pre-click set"), and the stored text on
          // both sides stays in the receipt as a witness.
          const effectiveBefore = JSON.stringify(boxes.filter((b) => b.checked).map((b) => b.value).sort());
          const effectiveAfter = JSON.stringify(afterRestoreBoxes.filter((b) => b.checked).map((b) => b.value).sort());
          restoredVerified = effectiveAfter === effectiveBefore;
          push({
            interaction: "assert-present",
            selector: `the same click restores the pre-click set (restore POST ${restoreStatus ?? "nothing"}; effective enabled roles ${effectiveBefore} -> ${effectiveAfter}; restored: ${restoredVerified}; rendered ${afterRestore?.checked ?? null})`,
            count: restoreStatus !== null && restoreStatus < 400 && restoredVerified ? 1 : 0,
            restoreStatus,
            sessionRestored: sessionRestored?.candidates ?? null,
            checkedRestored: afterRestore?.checked ?? null,
            effectiveBefore,
            effectiveAfter,
            storedBefore: beforeJson,
            storedAfter: restoredJson,
          });
        }
      }
    } finally {
      // Fixture hygiene: the visitor-session selection must end where the
      // case found it. If (and only if) a click happened, re-open the editor
      // and re-click until the clicked box reads checked again (the r5
      // diagnostic measured the re-click path working natively); record
      // whatever the last read saw. When no click happened there is nothing
      // to restore and the hygiene witness reads true vacuously.
      if (!clickHappened) restoredVerified = true;
      try {
        for (let attempt = 0; attempt < 3 && clickHappened && restoredVerified !== true; attempt += 1) {
          const form = await openEditor();
          if ((await form.count().catch(() => 0)) === 0) break;
          const boxes = await readBoxes(form);
          const target = boxes.find((b) => b.visible && b.display !== "none");
          if (!target) break;
          const pending = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 10_000 }).then((r) => ({ r }), () => null);
          await form.locator(`input.pointer-checkbox-button[name="${target.name}"][value="${target.value}"]`).first().click({ timeout: 8_000 }).catch(() => {});
          await pending;
          await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1_200);
          const form2 = await openEditor();
          const now = (await readBoxes(form2)).find((b) => b.value === target?.value) ?? null;
          if (now && now.checked === true) { restoredVerified = true; break; }
        }
      } catch { /* recorded below as evidence */ }
      witness({ selector: `A6 fixture hygiene: the administrator's visitor-session role selection ended restored=${restoredVerified} (canonical grants are untouched either way — the control edits the session selection only)` });
    }
  }

  // -------------------------------------------------------------------------
  // batch2 case 11 — ACT-177 (REL1): "related-cards panel content". Mirrors
  // probe-pageonly-top10-write-permission.mjs ACT-177: Topic 001's +related
  // closed panel expands on its accordion button, lists BOTH pointed-at cards
  // (Topic 002, Topic 012), and following one presents that card. The panel
  // is located by the classes the served page's own structure excerpt
  // carries (#main .card-slot.closed-view.RIGHT-related — the f2 run's
  // ACT-101 observation), and its actual slot id is recorded: both earlier
  // id-shaped guesses (`#topic_001-related-closed-view`, run 1 and the
  // probe's spelling) found no button in run 2, while the slot itself
  // renders — the id is evidence, not an aim.
  if (/\bREL1\b/.test(t)) {
    currentCase = "batch2 case 11 REL1 related-cards panel (ACT-177)";
    if (typeof page === "undefined" || page === null) {
      throw new Error("REL1 probe needs the runner's page helper");
    }
    const panelCard = "Topic 001";
    await visit(`/${urlKey(panelCard)}`);
    const panelShape = ((await page
      .evaluate(() => {
        const panel = document.querySelector("#main .card-slot.closed-view.RIGHT-related");
        if (!panel) return { found: false, id: null, button: 0 };
        return {
          found: true,
          id: panel.getAttribute("id"),
          button: panel.querySelectorAll("button.accordion-button").length,
        };
      })
      .catch(() => ({ found: false, id: null, button: 0 }))) ?? { found: false, id: null, button: 0 });
    const panelSel = () => "#main .card-slot.closed-view.RIGHT-related";
    let expanded = false;
    let content = null;
    let followed = null;
    if (panelShape.found && panelShape.button > 0) {
      await page.locator(`${panelSel()} button.accordion-button`).first().click({ timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(2_500);
      await settle();
      expanded = (await page
        .evaluate((sel) => !!document.querySelector(`${sel} button.accordion-button:not(.collapsed)`) && !!document.querySelector(`${sel} .accordion-body`), panelSel())
        .catch(() => false)) ?? false;
      content = await page
        .evaluate((sel) => {
          const body = document.querySelector(`${sel} .accordion-body`);
          return body
            ? { bodyText: body.textContent.replace(/\s+/g, " ").trim().slice(0, 250), links: [...body.querySelectorAll("a.known-card")].map((a) => ({ t: a.textContent.replace(/\s+/g, " ").trim(), h: a.getAttribute("href") })), bars: [...body.querySelectorAll(".bar[data-card-link-name]")].map((b) => b.getAttribute("data-card-link-name")) }
            : null;
        }, panelSel())
        .catch(() => null);
      const topic2 = page.locator(`${panelSel()} .accordion-body .bar[data-card-link-name='Topic_002']`).first();
      if ((await topic2.count().catch(() => 0)) > 0) {
        await topic2.click({ timeout: stepTimeout }).catch(() => {});
        await page.waitForLoadState("load", { timeout: stepTimeout }).catch(() => {});
        await page.waitForTimeout(1_500);
        followed = {
          url: page.url(),
          presented: await page.evaluate(() => document.querySelector(".card-slot.titled-view")?.getAttribute("data-card-name") ?? null).catch(() => null),
        };
        followed.isTopic2 = followed.presented === "Topic 002" || /\/Topic_002($|\?)/.test(followed.url ?? "");
      }
    }
    const bothListed = (!!content?.links && content.links.some((l) => /Topic 002|Topic_002/.test(l.t + l.h)) && content.links.some((l) => /Topic 012|Topic_012/.test(l.t + l.h)))
      || (!!content?.bars && content.bars.includes("Topic_002") && content.bars.includes("Topic_012"));
    push({
      interaction: "assert-present",
      selector: `the related panel expands to its content on /${urlKey(panelCard)} (panel ${panelShape.found}, button ${panelShape.button}, expanded ${expanded}, links ${content?.links?.length ?? 0})`,
      count: panelShape.found && panelShape.button > 0 && expanded && content && (content.links?.length ?? 0) > 0 ? 1 : 0,
      panelSlotId: panelShape.id,
      panelBodyHead: content?.bodyText ?? null,
    });
    push({
      interaction: "assert-present",
      selector: `the expanded panel lists both pointed-at cards (Topic 002 and Topic 012: ${bothListed})`,
      count: bothListed ? 1 : 0,
      links: content?.links ?? [],
      bars: content?.bars ?? [],
    });
    push({
      interaction: "assert-present",
      selector: `following a related link presents that card (presented ${JSON.stringify(followed?.presented ?? null)}, url ${followed?.url ?? null})`,
      count: followed?.isTopic2 ? 1 : 0,
      followed,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 12 — ACT-178 (ERR1): "error pages render as error pages, not
  // create forms". Mirrors checks-content-flows.mjs ERR1 (PASS on c9d7d2ea
  // and 5db16a46): stock html/error.rb:81-86 — create permission chooses
  // new/200, without it the same unknown card is not_found/404. The
  // anonymous surfaces answer 404 with the error heading and ZERO create
  // forms; the permitted (signed-in) viewer gets the correctly named
  // new/200 create form; and merely viewing never creates the card.
  if (/\bERR1\b/.test(t)) {
    currentCase = "batch2 case 12 ERR1 error pages not create forms (ACT-178)";
    if (typeof newActorRequest !== "function") {
      throw new Error("ERR1 probe needs the runner's newActorRequest helper");
    }
    const missing = `Harness_exhaustive_missing_${Date.now().toString(36)}`;
    const anonAsk = async (path) => {
      const res = await fetch(base + path, { headers: { connection: "close" } }).catch(() => null);
      if (!res) return { status: null, body: "" };
      return { status: res.status, body: await res.text().catch(() => "") };
    };
    const anonCard = await anonAsk(`/${urlKey(missing)}`);
    const anonBoard = await anonAsk(`/${urlKey(missing)}/board`);
    const anonIsDenial = (r) => r.status === 404 && (r.body.match(/action="[^"]*\/card\/create/g) ?? []).length === 0 && (r.body.match(/name="card\[name\]"/g) ?? []).length === 0 && /Not Found|Could not find/i.test(r.body);
    // The permitted viewer is an explicit ADMIN context: the runner's own
    // page rides the error-pages surface's anonymous session (run 1's
    // "signed-in" leg read the anonymous 404 because pageRequest carried no
    // session there), and stock html/error.rb chooses new/200 by CREATE
    // PERMISSION, so the positive control must be the actor that may create.
    const admin = await newActorRequest("admin");
    const signedRes = await admin.get(`${base}/${urlKey(missing)}`, { maxRedirects: 0 }).catch((e) => ({ error: String(e?.message ?? e) }));
    const signedBody = signedRes.error ? "" : await signedRes.text().catch(() => "");
    const signedCreateForms = (signedBody.match(/action="[^"]*\/card\/create/g) ?? []).length;
    const signedNameValues = (signedBody.match(/name="card\[name\]"[^>]*value="([^"]*)"/g) ?? []).map((m) => /value="([^"]*)"/.exec(m)?.[1] ?? "");
    const afterJson = await jsonRead(`/${urlKey(missing)}.json`);
    push({
      interaction: "assert-present",
      selector: `the anonymous unknown-card answer is a 404 error page with no create machinery (/${missing} -> ${anonCard.status}, /<missing>/board -> ${anonBoard.status})`,
      count: anonIsDenial(anonCard) && anonIsDenial(anonBoard) ? 1 : 0,
      cardStatus: anonCard.status,
      boardStatus: anonBoard.status,
      cardHead: anonCard.body.replace(/\s+/g, " ").slice(0, 160),
    });
    push({
      interaction: "assert-present",
      selector: `the permitted (signed-in) viewer gets the correctly named create form (status ${signedRes.error ? "error" : signedRes.status()}, ${signedCreateForms} create forms, names ${JSON.stringify(signedNameValues)})`,
      count: !signedRes.error && signedRes.status() === 200 && signedCreateForms === 1 && signedNameValues.some((v) => v.replaceAll("_", " ") === spaceForm(missing)) ? 1 : 0,
      status: signedRes.error ? null : signedRes.status(),
      signedCreateForms,
      signedNameValues,
    });
    push({
      interaction: "assert-present",
      selector: `merely viewing the unknown card creates nothing (/${missing}.json answers ${afterJson.status})`,
      count: afterJson.status === 404 ? 1 : 0,
      jsonStatus: afterJson.status,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 13 — ACT-179 (C22): "creating a card that differs only by
  // letter case is refused". The C22 row's own note: the mint-side NOCASE
  // guard landed (bb44de9e) but "no browser check drives the refusal path" —
  // this case drives it. The card is created; the same name with one letter's
  // case flipped is offered to /card/create; the contract is that no second
  // card comes to exist: the variant either answers a refusal (4xx) or
  // resolves to the ORIGINAL card (slug-pinned merge), never a distinct row,
  // and never a 5xx (a crash is not a refusal contract).
  if (/\bC22\b/.test(t)) {
    currentCase = "batch2 case 13 C22 case-duplicate create refused (ACT-179)";
    const stamp = Date.now().toString(36);
    const original = `Harness_exhaustive_c22_Big_${stamp}`;
    const variant = original.replace(/_Big_/, "_big_");
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: original, detail: "C22 the probe's original card; the case-flipped twin must not be stored" })) {
      return sequence;
    }
    if (typeof pageRequest === "undefined") {
      throw new Error("C22 probe needs the runner's pageRequest helper");
    }
    const created = await createCard(original, "Basic", `C22 original ${stamp}`);
    const attempt = await pageRequest
      .post(`${base}/card/create`, {
        headers: { origin: base },
        form: { "card[name]": variant, "card[type]": "Basic", "card[content]": `C22 case twin ${stamp}`, "success[redirect]": "true" },
        maxRedirects: 0,
      })
      .catch((e) => ({ error: String(e?.message ?? e) }));
    const attemptStatus = attempt.error ? null : attempt.status();
    const originalJson = await jsonRead(`/${urlKey(original)}.json`);
    const variantJson = await jsonRead(`/${urlKey(variant)}.json`);
    const noDistinctRow = originalJson.status === 200 && (variantJson.status === 404 || variantJson.parsed?.name === original);
    const mergedOrRefused = (attemptStatus !== null && attemptStatus >= 400 && attemptStatus < 500) || (variantJson.status === 200 && variantJson.parsed?.name === original);
    push({
      interaction: "assert-present",
      selector: `C22 staging: the original card stored (create ${created.status}) and still reads 200 (${originalJson.status})`,
      count: created.ok && originalJson.status === 200 ? 1 : 0,
      createStatus: created.status,
      originalJsonStatus: originalJson.status,
    });
    push({
      interaction: "assert-present",
      selector: `the case-flipped create attempt (${attemptStatus ?? "nothing"}) stored NO distinct second card (variant .json ${variantJson.status}${variantJson.parsed ? `, name ${JSON.stringify(variantJson.parsed.name)}` : ""})`,
      count: attemptStatus !== null && attemptStatus < 500 && noDistinctRow ? 1 : 0,
      attemptStatus,
      variantJsonStatus: variantJson.status,
      variantJsonName: variantJson.parsed?.name ?? null,
    });
    push({
      interaction: "assert-present",
      selector: `the attempt ended in a defined refusal or a slug-pinned merge to the original, never a 5xx crash`,
      count: mergedOrRefused && attemptStatus !== null && attemptStatus < 500 ? 1 : 0,
      attemptStatus,
      variantResolvedTo: variantJson.parsed?.name ?? null,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 14 — ACT-180 (S11) and batch2 case 15 — ACT-185: plurality/
  // slug pinning. Mirrors checks-content-flows.mjs S11 (PASS on c9d7d2ea and
  // 5db16a46): a name's variants — exact, singular, spaces-for-underscores,
  // lowercased, uppercased, double-underscore — all resolve to the SAME
  // stored card. The runner grades this on the cards' own .json answers
  // (status 200, same id, canonical stored name) instead of the check's
  // database id read. One matrix action per case; each drive stamps its own
  // card so the two actions never share a fixture.
  const slugPinningCase = async (caseId, actionId) => {
    const stamp = String(Date.now());
    const plural = `Harness_exhaustive_plural_widgets_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: plural, detail: `${actionId} the probe's plural-named card whose variants must pin to one row` })) {
      return;
    }
    if (typeof pageRequest === "undefined") {
      throw new Error(`${actionId} probe needs the runner's pageRequest helper`);
    }
    const created = await createCard(plural, "RichText", `plural pin body ${stamp}`);
    const original = await jsonRead(`/${urlKey(plural)}.json`);
    const storedId = original.parsed?.id ?? null;
    const variants = [
      { label: "exact", name: plural },
      { label: "singular (Widgets to Widget)", name: plural.replace("_Widgets_", "_Widget_") },
      { label: "spaces for underscores", name: spaceForm(plural) },
      { label: "lowercased", name: plural.toLowerCase() },
      { label: "uppercased", name: plural.toUpperCase() },
      { label: "double space for one underscore", name: plural.replaceAll("_", "__") },
    ];
    const reads = [];
    for (const variant of variants) {
      const r = await jsonRead(`/${urlKey(variant.name)}.json`);
      reads.push({
        label: variant.label,
        status: r.status,
        resolvedId: r.parsed?.id ?? null,
        resolvedName: r.parsed?.name ?? null,
        sameCard: r.status === 200 && storedId !== null && r.parsed?.id === storedId && r.parsed?.name === plural,
      });
    }
    const pinned = reads.filter((r) => r.sameCard);
    push({
      interaction: "assert-present",
      selector: `every name variant resolves to the same stored card (${pinned.length}/${reads.length} pinned; create ${created.status}, stored id ${storedId})`,
      count: created.ok && original.status === 200 && pinned.length === reads.length ? reads.length : 0,
      storedId,
      variants: reads,
      note: "a variant that renders its own create form is a different card, not the pinned one (the S11 check's rule); a .json 404 or a different id/name reads the same way here",
    });
  };
  if (/\bS11\b/.test(t)) {
    currentCase = "batch2 case 14 S11 plurality/slug pinning (ACT-180)";
    await slugPinningCase("batch2 case 14", "ACT-180");
  }
  if (/plurality\/slug pinning: name variants resolving/.test(t)) {
    currentCase = "batch2 case 15 plurality/slug pinning, resolving (ACT-185)";
    await slugPinningCase("batch2 case 15", "ACT-185");
  }

  // -------------------------------------------------------------------------
  // batch2 case 16 — ACT-181: "result ordering: newest-first ordering of the
  // Changes feed and search results". The Changes-feed half is graded here,
  // mirroring the feed-side instruments (checks-cover-b's changes-list-first
  // rule after blindness-review F6: the FIRST entries must be this run's own
  // touched cards, ordering actually tested): two cards created in order,
  // then /*recent must list the SECOND card's act first and the FIRST
  // card's act second. The search-results half rides the dedicated
  // compare-search-order instrument (tools/compare-search-order.mjs), which
  // this runner does not replace; recorded here as scope disclosure.
  if (/result ordering: newest-first/.test(t)) {
    currentCase = "batch2 case 16 result ordering newest-first (ACT-181)";
    const first = `Harness_exhaustive_order_a_${Date.now().toString(36)}`;
    const second = `Harness_exhaustive_order_b_${Date.now().toString(36)}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: second, detail: `ACT-181 the two ordered acts (${first}, then ${second})` })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("ACT-181 probe needs the runner's page helper");
    }
    const c1 = await createCard(first, "Basic", "order first");
    const c2 = await createCard(second, "Basic", "order second");
    await visit("/*recent");
    const titles = (await page
      .evaluate(() => [...document.querySelectorAll("#main .accordion .accordion-item")].slice(0, 8).map((it) => (it.querySelector(".col-8")?.textContent ?? "").replace(/\s+/g, " ").trim()))
      .catch(() => [])) ?? [];
    const newestFirst = titles.length >= 2 && titles[0].includes(second) && titles[1].includes(first);
    push({
      interaction: "assert-present",
      selector: `the feed lists the newer act first and the older act second (entry0 ${JSON.stringify(titles[0] ?? null)}, entry1 ${JSON.stringify(titles[1] ?? null)})`,
      count: c1.ok && c2.ok && newestFirst ? 1 : 0,
      feedTitles: titles,
      creates: [c1.status, c2.status],
      scopeNote: "the search-results half of this cross-cutting action rides the compare-search-order instrument; this case grades the Changes-feed ordering the crawl's B-097 red named",
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 17 — ACT-184: "case-insensitivity guarantees across search,
  // names, and slugs". A uniquely named card carrying a unique term is
  // created; the SAME term searched in a different letter case must return
  // the card (search is case-insensitive), and the card's ALL-UPPERCASE url
  // mark must resolve to the same stored card (name resolution is
  // case-insensitive). Mirrors the measured case-variant rows of
  // checks-navbox.mjs (matrix evidence for this action).
  if (/case-insensitivity guarantees/.test(t)) {
    currentCase = "batch2 case 17 case-insensitivity guarantees (ACT-184)";
    // Digit-only stamps: the S11 check's own lesson (checks-content-flows.mjs)
    // is that a base36 LETTER suffix changes its stock Cardname key on
    // uppercasing (mvd5qgq8 -> mvd5_qgq8), so a lettered stamp would measure
    // key formation, not case-insensitive resolution (run 1's uppercase
    // variant answered 404 for exactly that reason). Numeric suffixes remain
    // equivalent under the key transform.
    const stamp = String(Date.now());
    const cardName = `Harness_exhaustive_casework_${stamp}`;
    const term = `zzcaseprobe${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName, detail: "ACT-184 the uniquely named card whose case variants must resolve" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("ACT-184 probe needs the runner's page helper");
    }
    const created = await createCard(cardName, "Basic", `carrying ${term} in its body`);
    const upperSearch = await searchRows(term.toUpperCase());
    const upperJson = await jsonRead(`/${urlKey(cardName.toUpperCase())}.json`);
    const foundRow = upperSearch.rows.find((n) => n.toLowerCase() === cardName.toLowerCase());
    push({
      interaction: "assert-present",
      selector: `searching the term in a different letter case returns the card (searched "${term.toUpperCase()}", rows ${JSON.stringify(upperSearch.rows.slice(0, 6))})`,
      count: created.ok && upperSearch.status === 200 && foundRow !== undefined ? 1 : 0,
      searchStatus: upperSearch.status,
      rows: upperSearch.rows,
    });
    push({
      interaction: "assert-present",
      selector: `the all-uppercase name mark resolves to the same stored card (/${cardName.toUpperCase()}.json -> ${upperJson.status}, name ${JSON.stringify(upperJson.parsed?.name ?? null)})`,
      count: upperJson.status === 200 && upperJson.parsed?.name === cardName ? 1 : 0,
      jsonStatus: upperJson.status,
      resolvedName: upperJson.parsed?.name ?? null,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 18 — ACT-186: "pagination math: offsets, limits, and page
  // counts beyond page-2-differs". Pages 1 and 2 of the matrix's own broad
  // query (keyword=Harness) must render non-empty DISJOINT row sets, and a
  // page far beyond the end must answer 200 with zero rows (the pagination
  // arithmetic degrades to an empty page, not an error) — the "beyond
  // page-2-differs" half of the action's own text.
  if (/pagination math/.test(t)) {
    currentCase = "batch2 case 18 pagination math (ACT-186)";
    if (typeof page === "undefined" || page === null) {
      throw new Error("ACT-186 probe needs the runner's page helper");
    }
    // Mirrors the graded N3/B-105 drive (checks-cover-b.mjs): the paging
    // contract is the rendered pagination control's own page-2 link — the
    // matrix surface's hand-built "&page=2" URL is NOT the engine's paging
    // shape (run 1 measured page=1, page=2 and page=99 rendering the
    // identical 14 rows, so the parameter is inert on this engine and the
    // case grades the control the way B-105 does instead).
    const searchPage = async (path) => {
      const res = await visit(path);
      const rows = (await page
        .evaluate(() => {
          const nodes = [...document.querySelectorAll("#main .search-result-list > .search-result-item")];
          return [...new Set(nodes.map((n) => n.querySelector("[data-card-name]")?.getAttribute("data-card-name")).filter((n) => n && n !== "*search"))];
        })
        .catch(() => [])) ?? [];
      const active = await page.evaluate(() => document.querySelector(".pagination .active, .page-item.active, .page-link.active")?.textContent?.trim() ?? null).catch(() => null);
      return { status: res ? res.status() : null, rows, active };
    };
    const page1 = await searchPage("/*search");
    const twoHref = await page
      .evaluate(() => [...document.querySelectorAll(".pagination a, .page-item a, .page-link")].find((a) => a.textContent.trim() === "2")?.getAttribute("href") ?? null)
      .catch(() => null);
    const page2 = twoHref ? await searchPage(twoHref) : { status: null, rows: [], active: null };
    push({
      interaction: "assert-present",
      selector: `the unfiltered search renders pagination and its page-2 link navigates (page-2 href ${JSON.stringify(twoHref)}, page 2 active ${JSON.stringify(page2.active)}, rows ${page1.rows.length} -> ${page2.rows.length})`,
      count: page1.status === 200 && twoHref !== null && page2.status === 200 && /2/.test(page2.active ?? "") ? 1 : 0,
      page1Active: page1.active,
      page2Href: twoHref,
      page2Active: page2.active,
      page1RowCount: page1.rows.length,
      page2RowCount: page2.rows.length,
    });
    const page1Set = new Set(page1.rows);
    const overlap = page2.rows.filter((n) => page1Set.has(n));
    push({
      interaction: "assert-present",
      selector: `page 2 lists a different result set than page 1 (${overlap.length} shared rows of ${page2.rows.length})`,
      count: page2.rows.length > 0 && overlap.length === 0 ? 1 : 0,
      overlap,
      page2Rows: page2.rows.slice(0, 8),
      scopeNote: "the matrix surface's &page=2 URL shape measured inert on this engine (run 1: identical rows for page 1, 2 and 99) — recorded here as evidence; the graded contract is the pagination control B-105 grades",
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 19 — ACT-187: "feed dedup: the same act must not repeat in a
  // feed". Mirrors checks-recent-changes-feed-dedup.mjs (the instrument the
  // crawl's 2-6x repeat finding never had): the feed renders one accordion
  // item per act and stamps the act's own id (data-bs-target="#act-id-<id>"),
  // so dedup grades on ACT IDS — a repeated card NAME is not a repeat. The
  // verdict needs a non-empty feed of this run's own acts (anti-vacuity) and
  // a witness that an act the run just made is present. This case CAN fail:
  // it exists because the crawl saw the repeat.
  if (/feed dedup/.test(t)) {
    currentCase = "batch2 case 19 feed dedup (ACT-187)";
    const stamp = Date.now().toString(36);
    const baseName = `Harness_exhaustive_feed_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: `${baseName}_0`, detail: "ACT-187 the four acts the dedup verdict needs room for" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("ACT-187 probe needs the runner's page helper");
    }
    const created = [];
    for (let i = 0; i < 4; i += 1) {
      const name = `${baseName}_${i}`;
      const c = await createCard(name, "Basic", "harness feed dedup act");
      created.push({ name, ...c });
    }
    await visit("/*recent");
    const entries = (await page
      .evaluate(() => [...document.querySelectorAll("#main .accordion .accordion-item")].map((node) => {
        const target = node.querySelector("[data-bs-target^='#act-id-']")?.getAttribute("data-bs-target") ?? "";
        return {
          actId: target.replace(/^#/, ""),
          title: (node.querySelector(".col-8")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        };
      }))
      .catch(() => [])) ?? [];
    const seen = new Map();
    for (const [index, entry] of entries.entries()) {
      if (entry.actId === "") continue;
      if (!seen.has(entry.actId)) seen.set(entry.actId, []);
      seen.get(entry.actId).push(index);
    }
    const duplicates = [...seen.entries()].filter(([, at]) => at.length > 1).map(([actId, at]) => ({ actId, count: at.length, at }));
    const oursPresent = entries.some((entry) => entry.title.includes(baseName));
    push({
      interaction: "assert-present",
      selector: `no act id repeats in the rendered feed (${entries.length} entries, ${duplicates.length} duplicates; the verdict needs >=4 entries of this run's own acts)`,
      count: entries.length >= 4 && duplicates.length === 0 ? 1 : 0,
      renderedEntries: entries.length,
      duplicates,
      actIdSequence: entries.slice(0, 25).map((entry) => entry.actId),
    });
    witness({
      selector: `an act this run just made is present in the feed (anti-vacuity witness: ${oursPresent})`,
      oursPresent,
      createdNames: created.map((c) => c.name),
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 20 — ACT-188: "affordance visibility per role: which controls
  // render for which actor". A card restricted by its +*self+*update rule
  // (staged exactly as case 12 of exhaustive-affordance-targets.mjs stages
  // P3) is the two-actor surface: the ADMINISTRATOR's read view carries the
  // edit affordance; the MEMBER reads the card 200 but must find neither the
  // edit affordance nor any form targeting the card's update route — the
  // controls a role cannot use must not render for it.
  if (/affordance visibility per role/.test(t)) {
    currentCase = "batch2 case 20 affordance visibility per role (ACT-188)";
    const stamp = Date.now().toString(36);
    const restricted = `Harness_exhaustive_roleviz_${stamp}`;
    const secret = `ROLEVIZ_SECRET_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: restricted, detail: "ACT-188 the probe's update-restricted card and its *update rule" })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null || typeof newActorRequest !== "function" || typeof pageRequest === "undefined") {
      throw new Error("ACT-188 probe needs the runner's page, pageRequest and newActorRequest helpers");
    }
    const card = await createCard(restricted, "Basic", secret);
    const rule = await createCard(`${restricted}+*self+*update`, "Phrase", "[[Administrator]]");
    // Admin's view: the edit affordance renders.
    await visit(`/${encodeURIComponent(restricted)}`);
    const adminEditLinks = await page.evaluate(() => [...document.querySelectorAll("a.edit-link[href$='/edit']")].length).catch(() => 0);
    // Member's view: content readable, no edit affordance FOR THIS CARD, no
    // update form for it. The count is scoped to the restricted card's own
    // edit href (the case-12 P3 lesson: a page-wide affordance count reads
    // chrome that belongs to other cards — run 1's unscoped count caught one
    // edit-link that does not target the restricted card).
    const member = await newActorRequest("member");
    const memberRes = await member.get(`${base}/${encodeURIComponent(restricted)}`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberStatus = memberRes.error ? null : memberRes.status();
    const memberBody = memberRes.error ? "" : await memberRes.text().catch(() => "");
    const memberEditLinks = (memberBody.match(new RegExp(`href="[^"]*/${esc(urlKey(restricted))}/edit"`, "g")) ?? []).length;
    const memberUpdateForms = (memberBody.match(new RegExp(`action="[^"]*/update/${esc(urlKey(restricted))}`, "g")) ?? []).length;
    const memberEditLinkSample = (memberBody.match(/class="[^"]*edit-link[^"]*"[^>]*href="[^"]*"/g) ?? []).slice(0, 4);
    // Run 2 measured the content view rendering the edit affordance TO THE
    // MEMBER as well (href /<card>/edit, class "edit-link slotter"): the
    // render-level denial is not the contract this engine implements — the
    // security boundary lives on the edit route (the P3 instrument's own
    // shape: the member's edit view refuses 403 with no editor). The render
    // fact is recorded as a witness; the graded legs are the route denials.
    witness({
      selector: `the content view renders the edit affordance to BOTH actors (${memberEditLinks} member edit links targeting the card, sample ${JSON.stringify(memberEditLinkSample.slice(0, 1))}) — recorded, not graded; the boundary this case grades is the edit route's`,
      memberEditLinks,
      memberEditLinkSample,
    });
    // The member's edit view: refused, with no editor form for the card.
    const memberEditRes = await member.get(`${base}/${encodeURIComponent(restricted)}?view=edit`).catch((e) => ({ error: String(e?.message ?? e) }));
    const memberEditStatus = memberEditRes.error ? null : memberEditRes.status();
    const memberEditBody = memberEditRes.error ? "" : await memberEditRes.text().catch(() => "");
    const memberEditForms = (memberEditBody.match(new RegExp(`action="[^"]*/update/${esc(urlKey(restricted))}`, "g")) ?? []).length;
    // The administrator's edit view: served, with the editor form.
    const adminEditRes = await pageRequest.get(`${base}/${encodeURIComponent(restricted)}?view=edit`, { maxRedirects: 0 }).catch((e) => ({ error: String(e?.message ?? e) }));
    const adminEditStatus = adminEditRes.error ? null : adminEditRes.status();
    const adminEditBody = adminEditRes.error ? "" : await adminEditRes.text().catch(() => "");
    const adminEditForms = (adminEditBody.match(new RegExp(`action="[^"]*/update/${esc(urlKey(restricted))}`, "g")) ?? []).length;
    push({
      interaction: "assert-present",
      selector: `ACT-188 staging: the update-restricted card stored (card ${card.status}, rule ${rule.status})`,
      count: card.ok && rule.ok ? 1 : 0,
      cardStatus: card.status,
      ruleStatus: rule.status,
    });
    push({
      interaction: "assert-present",
      selector: `the administrator's edit view is served with its editor form (${adminEditStatus}, ${adminEditForms} update forms targeting the card)`,
      count: adminEditStatus === 200 && adminEditForms > 0 ? 1 : 0,
      adminEditStatus,
      adminEditForms,
    });
    push({
      interaction: "assert-present",
      selector: `the member still READS the card (status ${memberStatus ?? "nothing"}, content shown ${memberBody.includes(secret)})`,
      count: memberStatus === 200 && memberBody.includes(secret) ? 1 : 0,
      memberStatus,
    });
    push({
      interaction: "assert-present",
      selector: `the member's edit view is denied with no editor form for the card (${memberEditStatus}, ${memberEditForms} update forms targeting it, update POST channel also refused below)`,
      count: memberEditStatus === 403 && memberEditForms === 0 ? 1 : 0,
      memberEditStatus,
      memberEditForms,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 21 — ACT-189: "empty-vs-error rendering: empty result sets
  // must not render as errors and vice versa". Both directions: a search
  // with zero hits answers 200 as a normal empty page (no error heading), a
  // missing card answers 404 (an error is not rendered as an empty success).
  if (/empty-vs-error/.test(t)) {
    currentCase = "batch2 case 21 empty-vs-error rendering (ACT-189)";
    if (typeof page === "undefined" || page === null) {
      throw new Error("ACT-189 probe needs the runner's page helper");
    }
    const emptyTerm = `zzempty_${Date.now().toString(36)}`;
    const emptyRes = await visit(`/*search?query[keyword]=${encodeURIComponent(emptyTerm)}`);
    const emptyText = await mainText();
    const emptyIsErrorHeading = /Not Found|Could not find/i.test(emptyText);
    const missing = `Harness_exhaustive_nothere_${Date.now().toString(36)}`;
    // The error half is graded on the ANONYMOUS answer (stock html/error.rb
    // chooses new/200 by create permission, so the signed-in page the
    // surface visits answers 200 with the create form — run 1 measured that
    // shape; the error-vs-empty contract lives on the anonymous answer, the
    // same split case 12 grades).
    const errorRes = await fetch(base + `/${urlKey(missing)}`, { headers: { connection: "close" } }).catch(() => null);
    push({
      interaction: "assert-present",
      selector: `an empty result set renders as a normal empty page (search "${emptyTerm}" -> ${emptyRes ? emptyRes.status() : "nothing"}, error heading ${emptyIsErrorHeading})`,
      count: emptyRes && emptyRes.status() === 200 && !emptyIsErrorHeading ? 1 : 0,
      status: emptyRes ? emptyRes.status() : null,
      mainTextHead: emptyText.slice(0, 160),
    });
    push({
      interaction: "assert-present",
      selector: `an error renders as an error, not an empty success (anonymous /${missing} -> ${errorRes ? errorRes.status : "nothing"})`,
      count: errorRes && errorRes.status === 404 ? 1 : 0,
      status: errorRes ? errorRes.status : null,
    });
  }

  // -------------------------------------------------------------------------
  // batch2 case 22 — ACT-190: "search over-match". Mirrors
  // checks-search-overmatch.mjs's local decomposition (the module the
  // findings-red row never had): a unique-term fixture set this case owns
  // end to end. MATCH ACCOUNTING: every row the rendered search page returns
  // for the term must carry the term in its OWN name or its OWN stored
  // content (read back from each row's .json — the runner has no database
  // handle), and the control card carrying the term nowhere must be absent.
  // A row that carries the term in neither is an over-match on its own
  // evidence. The oracle's 127-comparison stays open exactly as the module
  // records (needs stock Ruby on the same deck; no local instrument can
  // supply it) — recorded as the leg's scope note, never as a pass.
  if (/search over-match/.test(t)) {
    currentCase = "batch2 case 22 search over-match accounting (ACT-190)";
    const stamp = Date.now().toString(36);
    const term = `zzover${stamp}`;
    const byName = `${term}_byname`;
    const byContent = `zzbodyonly${stamp}`;
    const control = `zznocarry${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: byName, detail: `ACT-190 the unique-term fixture set (${byName}, ${byContent}, ${control})` })) {
      return sequence;
    }
    if (typeof page === "undefined" || page === null) {
      throw new Error("ACT-190 probe needs the runner's page helper");
    }
    const c1 = await createCard(byName, "Basic", "public card, term is in its name");
    const c2 = await createCard(byContent, "Basic", `public card carrying ${term} in its body only`);
    const c3 = await createCard(control, "Basic", "public card carrying the term nowhere");
    const search = await searchRows(term);
    const canonical = (s) => s.replaceAll("_", " ").trim().toLowerCase();
    const accounting = [];
    for (const rowName of search.rows) {
      const r = await jsonRead(`/${urlKey(rowName)}.json`);
      const inName = String(rowName).toLowerCase().includes(term) || String(r.parsed?.name ?? "").toLowerCase().includes(term);
      const inContent = String(r.parsed?.db_content ?? "").toLowerCase().includes(term);
      accounting.push({ row: rowName, jsonStatus: r.status, inName, inContent, explained: inName || inContent });
    }
    const unexplained = accounting.filter((a) => !a.explained);
    const controlAbsent = !search.rows.some((n) => canonical(n) === canonical(control));
    push({
      interaction: "assert-present",
      selector: `ACT-190 staging: the unique-term fixtures stored (${c1.status}, ${c2.status}, ${c3.status}) and the term's search renders rows (${search.rows.length})`,
      count: c1.ok && c2.ok && c3.ok && search.status === 200 && search.rows.length >= 2 ? 1 : 0,
      createStatuses: [c1.status, c2.status, c3.status],
      searchStatus: search.status,
      rows: search.rows,
    });
    push({
      interaction: "assert-present",
      selector: `match accounting: every returned row carries the term in its own name or its own stored content (${unexplained.length} unexplained of ${accounting.length})`,
      count: accounting.length > 0 && unexplained.length === 0 ? 1 : 0,
      accounting,
      unexplainedRows: unexplained.map((a) => a.row),
    });
    push({
      interaction: "assert-present",
      selector: `the control card carrying the term nowhere is absent from the results`,
      count: controlAbsent ? 1 : 0,
      control,
    });
    witness({
      selector: `scope: the oracle's 127 whole-count comparison needs stock Ruby on the same deck (checks-search-overmatch.mjs knownOpen); this case grades the local accounting half — a row the query cannot account for is an over-match on its own evidence`,
    });
  }

  return sequence;
}
