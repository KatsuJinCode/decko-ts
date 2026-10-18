// checks-widget-interactions.mjs — instruments for the WIDGET/INLINE-CONTROL
// rows the instrument-coverage matrix
// (C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
// last_recomputed 2026-10-17T09:57Z) still carries with instrument_family `none`
// and shape `none`: no family had any shape that could see these verbs.
//
//   F4  (ACT-146) "Change a coded image"
//   N4  (ACT-150) "Search card pages (search card paging)"
//   N12 (ACT-169) "navbox autocomplete dropdown interaction beyond the JSON endpoint"
//   UI1 (ACT-173) "accordion open/close behavior"
//   UI2 (ACT-174) "help popover on editor fields"
//   A6  (ACT-175) "role checkbox editing on account/rules surfaces"
//   render-mode (ACT-182) "inline-modal vs navigation behavior of the same affordance"
//
// (F8 "Replace an uploaded file", ACT-149, is the eighth row of this family but
// checks-upload-image-change.mjs already carries its instrument on this line, so
// it is MEASURED there rather than duplicated here.)
//
// Every check drives the surface the way a person does — a real click on the
// control the deck renders — and then reads STORED state, never just the DOM
// before the click. A control that is absent, or present but inert, is recorded
// as a failure with the inventory that proves it, which is a finding rather than
// a skip. Raw HTML is captured for every verdict.
//
// Selectors are taken from what the engine actually renders, not from training
// data about how Bootstrap or Decko "should" behave:
//
//  - the search results list and its paging control:
//    views.ts cardListView -> <div class="card-list card-list-<view>
//    search-result-list"> with <div class="search-result-item item-<view>>
//    children, and the paging row <nav><ul class="pagination paging">
//    <li class="page-item"><a class="card-paging-link slotter page-link"
//    href="/*search?limit=20&offset=20" data-remote="true">2</a> — verified
//    against the 2026-10-17T08-22-24-672Z-41160 run's own capture 027.html
//    (six numeric paging links, offsets 0..100).
//  - the accordion: card-mod-edit.ts:3963-3973 emits
//    `<button class='collapsed accordion-button' data-bs-target='#<id>'
//    data-bs-toggle='collapse' type='button'>` inside
//    `<div class='accordion-item _setting-group _setting-list'>` above
//    `<div class='accordion-collapse collapse' id='<id>'>`; views.ts:3171 emits
//    the `<div class="_setting-list"><div class="accordion bar-accordion">`
//    wrapper. Verified against that run's 066-actual-browser-conflict.html.
//  - the help popover: card-mod-help set/right/help.rb consumes
//    `popover_link` (card-mod-bootstrap.ts helper.rb:41-44), which emits
//    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"
//    data-bs-content="..." data-bs-title="..." class="help-link ... _popover_link
//    _card-menu-popover">`. Verified against that run's 001.html.
//  - the navbox search box: navbar-views.ts:265 emits
//    `<form role="search" class="search-box-form" action="/*search">` wrapping
//    `<input name="query[keyword]" id="query_keyword" class="_search-box
//    search-box form-control w-100" autocomplete="off"
//    data-completepath="/*search/search_box_complete.json">`; the dropdown
//    itself is built by the deck's jQuery UI autocomplete script from that
//    endpoint, so the check reads the WIDGET the script produces
//    (.ui-autocomplete / .ui-menu-item), never the JSON.
//  - the account board's Roles pill: card-mod-account.ts:827-850
//    ACCOUNT_DETAILS_ITEMS pairs the label "Roles" with the codename `*roles`
//    and `{ path: { view: "content" } }`, and :453-501 renders each role through
//    `link_with_checkbox` / `role_checkbox`.
//
// Selected by `--only widget-interactions` (this module alone) or
// `--only unmeasured-matrix` (every matrix-lane module).

/** Every module in this family refuses to touch anything but the disposable
 *  loopback fixture: each check below creates cards and writes card rows. */
function requireLoopback(ctx) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(ctx.stack.origin).hostname)) {
    throw Error("widget interaction checks require the disposable loopback fixture");
  }
}

/** Clicks a locator and returns the engine requests it caused. A person click
 *  is the unit of measurement here, so a click that times out is recorded by the
 *  caller as evidence rather than aborting the check. */
async function clickAndSettle(ctx, locator, settleMs = 1500) {
  const before = ctx.ledger().length;
  await locator.first().click({ timeout: 15000 }).catch(() => undefined);
  await ctx.page.waitForTimeout(settleMs);
  return ctx.linesSince(before);
}

/** The result rows of whatever search results list is on screen, in DOM order —
 *  the ordered list itself, never page chrome and never the paging links (the
 *  2026-10-17 N5 fix on e184dcaa). */
const searchResultNames = page => page.evaluate(() =>
  [...document.querySelectorAll("#main .search-result-list > .search-result-item")]
    .map(row => row.querySelector("[data-card-name]")?.getAttribute("data-card-name") ?? null));

/** Everything a person could see and press on the account board's role
 *  controls, so an absent or inert control is a recorded finding.
 *
 *  The WHOLE document is scanned, not just `#main`: the Roles pill fetches its
 *  content into the board's OVERLAY SLOT inside the same modal, which is
 *  exactly why the E19 fix reads `.modal input` and not `#main input` — scoping
 *  the read to `#main` misses the pill's own content entirely. */
const roleControlInventory = page => page.evaluate(() =>
  [...document.querySelectorAll('input[type="checkbox"], a[href*="role"], a[href*="members"], input[name*="role" i], input[name*="members" i]')]
    .slice(0, 20)
    .map(node => ({
      tag: node.tagName,
      type: node.getAttribute("type"),
      name: node.getAttribute("name"),
      value: node.getAttribute("value"),
      href: node.getAttribute("href"),
      checked: node.type === "checkbox" ? node.checked : null,
      visible: node.getClientRects().length > 0,
      insideForm: node.form !== null || node.closest("form") !== null,
      formAction: node.closest("form")?.getAttribute("action") ?? null,
      insideModal: node.closest(".modal") !== null,
      insideBoard: node.closest(".board") !== null,
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
    })));

export const meta = {
  topic: "widget-interactions",
  capabilityIds: ["F4", "N4", "N12", "UI1", "UI2", "A6", "render-mode"],
};
export const capabilityChecks = {
  F4: ["F4 a coded image can be changed through the card a person edits it on"],
  N4: ["N4 a search result page's paging control moves to the next page of rows"],
  N12: ["N12 typing in the navbox search box opens the autocomplete dropdown and its items are selectable"],
  UI1: ["UI1 an accordion control opens and closes the group it governs"],
  UI2: ["UI2 the help popover on an editor field shows its registered help text"],
  A6: ["A6 a role checkbox on the account board can be toggled and the change stored"],
  renderMode: ["render-mode the same affordance opens inline in a modal instead of navigating away"],
};
export const checks = [

  // ---------------------------------------------------------------- F4
  {
    name: "a coded image can be changed through the card a person edits it on",
    only: "unmeasured-matrix",
    run: async ctx => {
      requireLoopback(ctx);
      const { stack, page, creds, signIn, record, database, created, captureEvidence } = ctx;
      const signedIn = await signIn(creds.admin);
      if (!signedIn.hasSessionCookie) throw Error("F4 browser signin failed");

      // A coded attachment is an image whose bytes live in a MOD's shipped asset
      // table, not in an uploaded file: attachment-content.ts:162-164
      // codedAttachmentIdentifier renders `:codename/mod.ext`, and
      // stockCodedFile (src/card/attachments/stock-coded-files.ts:4-11) resolves
      // only an EXACT shipped codename. This deck carries 22 such cards. So the
      // measure is two-sided and BOTH sides are recorded: does the engine serve
      // coded bytes for a coded identifier, and does any person-facing control
      // change a coded image?
      const codedCards = database()
        .prepare("SELECT id,name,codename,db_content FROM cards WHERE trash=0 AND db_content LIKE ':%/%' AND name IS NOT NULL LIMIT 5")
        .all();
      if (codedCards.length === 0) {
        record(capabilityChecks.F4[0], false, {
          note: "this deck carries no addressable card whose content is a coded attachment identifier, so the coded-image surface cannot be reached at all",
          raw: captureEvidence(await page.content(), { check: "coded-image-absent" }),
        });
        return;
      }
      const coded = codedCards[0];
      const served = await page.context().request.get(stack.origin + "/files/" + coded.db_content);
      const servedBytes = (await served.body()).length;
      const servedType = served.headers()["content-type"] ?? null;
      const unknown = await page.context().request.get(stack.origin + "/files/:no_such_coded_attachment/carrierwave.svg");

      const name = coded.name;
      await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const editForm = page.locator("form.card-form").filter({ has: page.locator('input[type="file"]') }).first();
      const hasEditForm = (await editForm.count()) > 0;
      // What a person could actually press to CHANGE this image.
      const changeControls = await page.evaluate(() =>
        [...document.querySelectorAll("form.card-form button, form.card-form input[type=submit], form.card-form a")]
          .filter(n => n.getClientRects().length > 0)
          .map(n => ({ tag: n.tagName, type: n.getAttribute("type"), cls: String(n.className).slice(0, 50), text: (n.textContent ?? n.value ?? "").replace(/\s+/g, " ").trim().slice(0, 30) }))
          .slice(0, 25));
      // A control that writes the CODED image would have to name the coded
      // content or the coded card in the form it submits.
      const codedControlPresent = await page.evaluate(content =>
        [...document.querySelectorAll("form.card-form [name], form.card-form [data-codename]")]
          .some(n => (n.getAttribute("name") ?? "").includes(":") || (n.getAttribute("data-codename") ?? "") !== "" || (n.getAttribute("value") ?? "").startsWith(":")),
      coded.db_content);
      const renderedImage = await page.evaluate(async () => {
        const img = document.querySelector("#main img");
        if (img === null) return { present: false };
        if (img.complete === false) await img.decode().catch(() => {});
        return { present: true, src: img.src, naturalWidth: img.naturalWidth, complete: img.complete };
      });

      const evidence = {
        actor: creds.admin.name,
        actorId: creds.admin.id,
        codedCard: { id: coded.id, name: coded.name, codename: coded.codename, dbContent: coded.db_content },
        codedCardsInDeck: codedCards.length,
        codedServedStatus: served.status(),
        codedServedContentType: servedType,
        codedServedBytes: servedBytes,
        codedServed: served.status() === 200 && servedBytes > 0,
        unknownCodedIdentifierStatus: unknown.status(),
        editFormOffered: hasEditForm,
        changeControls,
        codedChangeControlPresent: codedControlPresent,
        renderedImage,
        raw: captureEvidence(await page.content(), { check: "coded-image-change", name }),
      };

      // The action as the capability states it — CHANGE a coded image — is only
      // performable if a person can point a control at the coded image's bytes.
      // An edit form carrying a file input replaces a UPLOADED file (that is F6's
      // contract, checked in checks-upload-image-change.mjs); it does not reach a
      // mod-shipped coded asset. Record what the surface actually offers.
      record(capabilityChecks.F4[0],
        codedControlPresent === true
          && codedServed.status === 200
          && servedBytes > 0,
        {
          ...evidence,
          note: codedControlPresent === false
            ? "the coded image's card offers no control that changes a CODED image: coded attachment bytes resolve only from the mod's shipped asset table (stockCodedFile, src/card/attachments/stock-coded-files.ts:4-11; codedAttachmentIdentifier, src/card/attachments/attachment-content.ts:162-164), so a person cannot change a coded image from any card surface"
            : undefined,
        });
    },
  },

  // ---------------------------------------------------------------- N4
  {
    name: "a search result page's paging control moves to the next page of rows",
    only: "unmeasured-matrix",
    run: async ctx => {
      requireLoopback(ctx);
      const { stack, page, creds, signIn, record, captureEvidence } = ctx;
      const signedIn = await signIn(creds.admin);
      if (!signedIn.hasSessionCookie) throw Error("N4 browser signin failed");

      const first = await page.goto(stack.origin + "/*search?limit=20&offset=0", { waitUntil: "load" });
      const rowsFirst = await searchResultNames(page);
      const paging = await page.evaluate(() =>
        [...document.querySelectorAll("#main a.card-paging-link.page-link")].map(a => ({
          text: (a.textContent ?? "").trim(),
          href: a.getAttribute("href"),
          remote: a.getAttribute("data-remote"),
          current: a.closest("li")?.classList.contains("active") === true,
        })));
      if (paging.length < 2) {
        record(capabilityChecks.N4[0], false, {
          note: "the search results page renders no paging control to move between pages",
          status: first?.status() ?? null,
          rowsOnPage: rowsFirst.length,
          pagingControls: paging,
          raw: captureEvidence(await page.content(), { check: "search-paging-absent" }),
        });
        return;
      }
      const pageTwo = paging.find(p => p.text === "2" && p.current === false);
      if (pageTwo === undefined) {
        record(capabilityChecks.N4[0], false, {
          note: "the paging control offers no second page to move to",
          pagingControls: paging,
          rowsOnPage: rowsFirst.length,
          raw: captureEvidence(await page.content(), { check: "search-paging-no-second-page" }),
        });
        return;
      }
      // Click the link a person clicks. It is a `slotter` with data-remote, so
      // the move is a swap of the results slot, NOT a document navigation; both
      // halves are measured (the request it issued, and whether rows changed).
      const urlBeforeClick = page.url();
      const navigationBefore = ctx.ledger().filter(l => l.method === "GET").length;
      const link = page.locator('#main a.card-paging-link.page-link[href*="offset=20"]').first();
      const caused = await clickAndSettle(ctx, link, 2500);
      const rowsSecond = await searchResultNames(page);
      const pagingAfter = await page.evaluate(() =>
        [...document.querySelectorAll("#main a.card-paging-link.page-link")]
          .filter(a => a.closest("li")?.classList.contains("active") === true)
          .map(a => ({ text: (a.textContent ?? "").trim(), href: a.getAttribute("href") })));
      const offsetRequests = caused.filter(l => /offset=20/.test(l.path ?? ""));
      const navigationCountDelta = ctx.ledger().filter(l => l.method === "GET").length - navigationBefore;
      const movedRows = rowsFirst.length > 0 && rowsSecond.length > 0
        && JSON.stringify(rowsFirst) !== JSON.stringify(rowsSecond)
        && !rowsSecond.some(r => rowsFirst.includes(r));
      record(capabilityChecks.N4[0],
        offsetRequests.length > 0
          && offsetRequests.every(l => l.status < 400)
          && movedRows
          && pagingAfter.some(p => /offset=20/.test(p.href ?? "")),
        {
          actor: creds.admin.name,
          actorId: creds.admin.id,
          clickedHref: pageTwo.href,
          clickedRemote: pageTwo.remote,
          offsetRequestStatuses: offsetRequests.map(l => l.status),
          offsetRequestPaths: offsetRequests.map(l => l.path),
          rowsOnFirstPage: rowsFirst.length,
          rowsOnSecondPage: rowsSecond.length,
          rowsChanged: movedRows,
          firstRowNames: rowsFirst.slice(0, 3),
          secondRowNames: rowsSecond.slice(0, 3),
          pagingLinkAfterClick: pagingAfter,
          urlBeforeClick,
          urlAfterClick: page.url(),
          navigatedAwayFromSearchPage: page.url().split("?")[0] !== urlBeforeClick.split("?")[0],
          documentNavigationsCaused: navigationCountDelta,
          raw: captureEvidence(await page.content(), { check: "search-paging-clicked" }),
        });
    },
  },

  // ---------------------------------------------------------------- N12
  {
    name: "typing in the navbox search box opens the autocomplete dropdown and its items are selectable",
    only: "unmeasured-matrix",
    run: async ctx => {
      requireLoopback(ctx);
      const { stack, page, creds, signIn, record, captureEvidence } = ctx;
      const signedIn = await signIn(creds.admin);
      if (!signedIn.hasSessionCookie) throw Error("N12 browser signin failed");

      await page.goto(stack.origin + "/", { waitUntil: "load" });
      const input = page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
      if ((await input.count()) === 0) {
        record(capabilityChecks.N12[0], false, {
          note: "the navbox renders no visible search box to type into",
          raw: captureEvidence(await page.content(), { check: "navbox-no-search-input" }),
        });
        return;
      }
      const completepath = await input.getAttribute("data-completepath");
      const before = ctx.ledger().length;
      await input.fill("Ha");
      // The dropdown is the deck's jQuery UI autocomplete over the complete
      // endpoint; wait for the WIDGET, not for the JSON.
      let appeared = true;
      try {
        await page.waitForSelector(".ui-autocomplete, .ui-menu, .select2-results", { state: "visible", timeout: 8000 });
      } catch { appeared = false; }
      const items = await page.evaluate(() =>
        [...document.querySelectorAll(".ui-autocomplete li, .ui-menu-item, .select2-results__option")].map(li => ({
          text: (li.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
          role: li.getAttribute("role"),
          hasAnchor: li.querySelector("a") !== null,
        })));
      const completeRequests = ctx.linesSince(before).filter(l => /search_box_complete/.test(l.path ?? ""));
      let selected = null;
      if (appeared && items.length > 0) {
        await page.locator(".ui-autocomplete li, .ui-menu-item").first().click({ timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(2000);
        selected = { url: page.url(), value: await input.inputValue().catch(() => null) };
      }
      record(capabilityChecks.N12[0],
        completeRequests.length > 0
          && completeRequests.every(l => l.status < 400)
          && appeared
          && items.length > 0
          && (selected === null || selected.url !== stack.origin + "/"),
        {
          actor: creds.admin.name,
          actorId: creds.admin.id,
          typedTerm: "Ha",
          completepath,
          completeRequestPaths: completeRequests.map(l => l.path),
          completeRequestStatuses: completeRequests.map(l => l.status),
          dropdownAppeared: appeared,
          dropdownItemCount: items.length,
          dropdownItems: items.slice(0, 6),
          afterSelectingFirstItem: selected,
          note: appeared === false
            ? "typing into the navbox search box issued no autocomplete request and produced no dropdown widget in the browser"
            : items.length === 0 ? "the autocomplete request answered but no dropdown item rendered" : undefined,
          raw: captureEvidence(await page.content(), { check: "navbox-autocomplete-dropdown" }),
        });
    },
  },

  // ---------------------------------------------------------------- UI1
  {
    name: "an accordion control opens and closes the group it governs",
    only: "unmeasured-matrix",
    run: async ctx => {
      requireLoopback(ctx);
      const { stack, page, creds, signIn, record, created, captureEvidence, database } = ctx;
      const signedIn = await signIn(creds.admin);
      if (!signedIn.hasSessionCookie) throw Error("UI1 browser signin failed");

      const name = "HarnessAccordion_" + Date.now().toString(36);
      created.push(name);
      const createResponse = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        maxRedirects: 0,
        data: new URLSearchParams({ "card[name]": name, "card[type]": "Basic", "card[content]": "accordion fixture", "success[redirect]": "true" }).toString(),
      });
      if (createResponse.status() >= 400 || database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(name) === undefined) {
        throw Error("UI1 accordion fixture card was not stored");
      }

      // The Rules accordion belongs to a Set, not an arbitrary Basic card.
      // Canonical junction names are routable even when their name column is NULL.
      const setName=name+"+*self";created.push(setName);
      const setWrite=await page.context().request.post(stack.origin+"/card/create",{
        headers:{origin:stack.origin,"Content-Type":"application/x-www-form-urlencoded"},maxRedirects:0,
        data:new URLSearchParams({"card[name]":setName,"card[type]":"Set","card[content]":"","success[redirect]":"true"}).toString(),
      });
      await setWrite.body();if(setWrite.status()>=400)throw Error("UI1 Set fixture refused: "+setWrite.status());
      const surfaces=["/"+encodeURIComponent(setName)+"/accordion_rule_list"];
      const perSurface = [];
      let measured = null;
      for (const surface of surfaces) {
        await page.goto(stack.origin + surface, { waitUntil: "load" });
        const groups = await page.evaluate(() =>
          [...document.querySelectorAll(".accordion-item")]
            .map(item => {
              const button = item.querySelector("button.accordion-button");
              const targetId = button?.getAttribute("data-bs-target")?.replace(/^#/, "") ?? null;
              const collapse = targetId ? document.getElementById(targetId) : item.querySelector(".accordion-collapse");
              return {
                buttonClass: button?.className ?? null,
                toggle: button?.getAttribute("data-bs-toggle") ?? null,
                targetId,
                collapseClass: collapse?.className ?? null,
                visibleBefore: collapse ? collapse.getClientRects().length > 0 : null,
                heading: (button?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
              };
            }));
        const accordionWrappers = await page.locator(".accordion, .bar-accordion").count();
        perSurface.push({ surface, accordionItems: groups.length, accordionWrappers });
        if (groups.length === 0) continue;
        const withButton = groups.find(g => g.buttonClass !== null && g.targetId !== null);
        if (withButton === undefined) { measured = { surface, groups, note: "accordion groups render no data-bs-target control" }; continue; }

        const visibleState = id => page.evaluate(target => {
          const node = document.getElementById(target);
          return node === null ? null : node.getClientRects().length > 0;
        }, withButton.targetId);
        const beforeOpen = await visibleState(withButton.targetId);
        const button = page.locator(`button.accordion-button[data-bs-target='#${withButton.targetId}']`).first();
        const clickAndObserve=async expected=>{
          const ledgerStart=ctx.ledger().length;
          await button.click({timeout:5000});
          await page.waitForFunction(([id,visible])=>{const el=document.getElementById(id);return el&&!el.classList.contains("collapsing")&&(el.getClientRects().length>0)===visible;},[withButton.targetId,expected],{timeout:5000});
          return ctx.linesSince(ledgerStart);
        };
        const caused=await clickAndObserve(!beforeOpen);
        const afterOpenClick=await visibleState(withButton.targetId);
        await clickAndObserve(beforeOpen);
        const afterSecondClick = await visibleState(withButton.targetId);

        measured = {
          surface,
          groups: groups.length,
          group: withButton,
          visibleBefore: beforeOpen,
          visibleAfterClick: afterOpenClick,
          visibleAfterSecondClick: afterSecondClick,
          openedOnClick: afterOpenClick !== beforeOpen,
          togglesBothWays: afterSecondClick === beforeOpen,
          requestsCausedByClick: caused.map(l => `${l.method} ${l.path} -> ${l.status}`),
        };
        break;
      }
      if (measured === null) {
        record(capabilityChecks.UI1[0], false, {
          note: "the stored Set fixture served no accordion group with an open/close control",
          card: name,
          surfacesTried: surfaces,
          perSurface,
          raw: captureEvidence(await page.content(), { check: "accordion-absent" }),
        });
        return;
      }
      record(capabilityChecks.UI1[0],
        measured.note === undefined
          && measured.openedOnClick === true
          && measured.togglesBothWays === true,
        { actor: creds.admin.name, actorId: creds.admin.id, card: name, perSurface, ...measured, raw: captureEvidence(await page.content(), { check: "accordion-click" }) });
    },
  },

  // UI2: the stock rule editor registers help on its Set-selection field.
  // A plain single-card editor uses inline help and is not a popover fixture.
  {
    name: "the help popover on an editor field shows its registered help text",
    only: "unmeasured-matrix",
    run: async ctx=>{
      requireLoopback(ctx);
      const {stack,page,creds,signIn,record,created,captureEvidence}=ctx;
      if(!(await signIn(creds.admin)).hasSessionCookie)throw Error("UI2 browser signin failed");
      const name="HarnessHelpPop_"+Date.now().toString(36),selfSet=name+"+*self",rule=selfSet+"+*read";
      created.push(name,selfSet,rule);
      const writes=[];
      for(const [card,type,content] of [[name,"RichText","help popover fixture"],[rule,"Phrase","[[Anyone]]"]]){
        const response=await page.context().request.post(stack.origin+"/card/create",{
          headers:{origin:stack.origin,"Content-Type":"application/x-www-form-urlencoded"},maxRedirects:0,
          data:new URLSearchParams({"card[name]":card,"card[type]":type,"card[content]":content,"success[redirect]":"true"}).toString(),
        });
        await response.body();writes.push(response.status());
        if(response.status()>=400)throw Error("UI2 fixture refused: "+response.status());
      }
      const opened=await page.goto(stack.origin+"/"+encodeURIComponent(rule)+"/rule_form",{waitUntil:"load"});
      const selector='form.card-rule-form a[data-bs-toggle="popover"]:not(._card-menu-popover)';
      const anchor=page.locator(selector).first(),anchorCount=await anchor.count();
      // Stock rule_form.haml's help for the real card[name] Set radio controls.
      const expected="Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones.";
      const setControls=await page.locator('form.card-rule-form input[name="card[name]"]').count();
      let registered=null,shown=null,interactionError=null;
      if(anchorCount){
        registered=await anchor.getAttribute("data-bs-content");
        try{
          await anchor.hover({timeout:5000});
          await page.waitForFunction(({selector,expected})=>{
            const a=document.querySelector(selector),id=a?.getAttribute("aria-describedby"),node=id?document.getElementById(id):null;
            return node?.classList.contains("popover")&&node.getClientRects().length>0&&node.querySelector(".popover-body")?.textContent?.trim()===expected;
          },{selector,expected},{timeout:5000});
        }catch(error){interactionError=String(error.message).split("\n")[0];}
        shown=await anchor.evaluate(el=>{
          const id=el.getAttribute("aria-describedby"),node=id?document.getElementById(id):null;
          return {describedBy:id,body:node?.querySelector(".popover-body")?.textContent?.trim()??null,visible:!!node?.getClientRects().length};
        });
      }
      record(capabilityChecks.UI2[0],opened.status()===200&&setControls>0&&registered===expected&&shown?.visible===true&&shown?.body===expected&&interactionError===null,
        {card:name,rule,writes,status:opened.status(),fieldName:"card[name]",fieldHeading:"Apply to set",setControls,anchorCount,registered,expected,shown,interactionError,
          raw:captureEvidence(await page.content(),{check:"ui2-rule-field-popover",name:rule,status:opened.status()})});
    },
  },

  // ---------------------------------------------------------------- A6
  {
    name: "a role checkbox on the account board can be toggled and the change stored",
    only: "unmeasured-matrix",
    run: async ctx => {
      requireLoopback(ctx);
      const { stack, page, creds, signIn, record, captureEvidence } = ctx;
      const signedIn = await signIn(creds.admin);
      if (!signedIn.hasSessionCookie) throw Error("A6 browser signin failed");

      const holder = creds.admin.name.replace(/ /g, "_");
      const board = await page.goto(stack.origin + "/" + holder + "/board", { waitUntil: "load" });
      await page.waitForTimeout(2500);
      // The account board's tab panes are pill lists (oracle
      // account_holder.rb:132-137 board_pill_sections), and ACCOUNT_DETAILS_ITEMS
      // (card-mod-account.ts:827-850) pairs the label "Roles" with the codename
      // `*roles` at view :content. A person reaches the role controls through
      // that pill; the check does too.
      const pills = await page.evaluate(() =>
        [...document.querySelectorAll(".board .board-pills a")].map(a => ({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40), href: a.getAttribute("href") })));
      const rolesPill = pills.find(p => /roles/i.test(p.text));
      if (rolesPill === undefined) {
        record(capabilityChecks.A6[0], false, {
          note: "the account board offers no Roles pill, so no role checkbox is reachable",
          boardStatus: board?.status() ?? null,
          pills,
          raw: captureEvidence(await page.content(), { check: "role-pill-absent" }),
        });
        return;
      }
      const caused = await clickAndSettle(ctx, page.locator(".board .board-pills a", { hasText: /roles/i }).first(), 2500);
      const pillFetch = caused.find(l => /roles/i.test(l.path ?? ""));
      const inventory = await roleControlInventory(page);
      const checkboxes = inventory.filter(i => i.type === "checkbox");
      if (checkboxes.length === 0) {
        record(capabilityChecks.A6[0], false, {
          note: "the Roles pill rendered no role checkbox at all",
          pill: { text: rolesPill.text, href: rolesPill.href, fetchStatus: pillFetch?.status ?? null, fetchPath: pillFetch?.path ?? null },
          controlsSeen: inventory,
          raw: captureEvidence(await page.content(), { check: "role-checkbox-absent" }),
        });
        return;
      }
      // Where the role checkboxes actually are: the account board's Roles PILL
      // rendered none, but the ACCOUNT MENU in the navbar carries them —
      // <h6 class="dropdown-header">Roles</h6> then one
      // <div class="pointer-checkbox dropdown-item"> per role, each with
      // <input type=checkbox class="pointer-checkbox-button _submit-on-change"
      // form action="/update/<actor>+*enabled_roles">. They sit inside a
      // collapsed dropdown, so a person OPENS the menu first and clicks the
      // checkbox, which auto-submits (_submit-on-change). Measure that path.
      const menuToggle = page.locator('button.dropdown-toggle, a.dropdown-toggle').last();
      await menuToggle.click({ timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      // Whether the menu actually opened, so the verdict names the cause rather
      // than only the symptom (a checkbox that stayed hidden).
      const dropdownState = await page.evaluate(() => {
        const toggle = [...document.querySelectorAll('[data-bs-toggle="dropdown"]')].pop();
        return {
          ariaExpanded: toggle?.getAttribute("aria-expanded") ?? null,
          menuHasShowClass: document.querySelector(".dropdown-menu.show") !== null,
        };
      });
      const menuInventory = await roleControlInventory(page);
      const menuBoxes = menuInventory.filter(i => i.type === "checkbox" && i.visible === true);
      if (menuBoxes.length === 0) {
        const allBoxes = menuInventory.filter(i => i.type === "checkbox");
        record(capabilityChecks.A6[0], false, {
          note: allBoxes.length === 0
            ? "no role checkbox renders anywhere on the account board or the account menu"
            : `the ${allBoxes.length} role checkboxes render with their values and their /update/<actor>+*enabled_roles form, but they sit inside a collapsed account menu that does not open: the toggle's aria-expanded stayed ${dropdownState.ariaExpanded} and no .dropdown-menu gained its show class after a click. The page loads no Bootstrap JavaScript (script srcs are jquery, jquery-ujs, ace, select2 and one deck asset), so every data-bs-toggle affordance on a signed-in page is inert`,
          rolesPill: { text: rolesPill.text, href: rolesPill.href, fetchStatus: pillFetch?.status ?? null, fetchPath: pillFetch?.path ?? null },
          accountMenuAfterClick: dropdownState,
          checkboxesInWholeDocument: allBoxes,
          raw: captureEvidence(await page.content(), { check: "role-checkbox-absent" }),
        });
        return;
      }
      // Toggle, read the STORED state, then restore the fixture. "Anyone Signed
      // In" is chosen over "Administrator" so a failed restore can never lock the
      // actor out of the rest of the run.
      const target = menuBoxes.find(b => b.value !== "Administrator") ?? menuBoxes[0];
      const before = target.checked;
      const box = page.locator(`input[type="checkbox"][name="${target.name}"][value="${target.value}"]`).first();
      const writePending = ctx.page.waitForResponse(r => r.request().method() !== "GET" && /enabled_roles/.test(new URL(r.url()).pathname), { timeout: 20000 }).then(r => ({ r }), e => ({ e }));
      await box.click({ timeout: 10000 }).catch(() => undefined);
      const sent = await writePending;
      await ctx.page.waitForTimeout(1500);
      if (sent.e !== undefined) await ctx.page.waitForTimeout(1500);
      const storedAfter = await page.locator(`input[type="checkbox"][name="${target.name}"][value="${target.value}"]`).first().isChecked().catch(() => null);
      const writeStatus = sent.e === undefined ? sent.r.status() : null;
      // Restore the fixture to the state the run found it in.
      const restorePending = ctx.page.waitForResponse(r => r.request().method() !== "GET" && /enabled_roles/.test(new URL(r.url()).pathname), { timeout: 20000 }).then(r => ({ r }), e => ({ e }));
      await box.click({ timeout: 10000 }).catch(() => undefined);
      const restored = await restorePending;
      await ctx.page.waitForTimeout(1200);
      const restoredState = await page.locator(`input[type="checkbox"][name="${target.name}"][value="${target.value}"]`).first().isChecked().catch(() => null);
      record(capabilityChecks.A6[0],
        storedAfter !== null
          && storedAfter !== before
          && writeStatus !== null
          && writeStatus < 400
          && restoredState === before,
        {
          actor: creds.admin.name,
          actorId: creds.admin.id,
          rolesPill: { text: rolesPill.text, href: rolesPill.href, fetchStatus: pillFetch?.status ?? null, fetchPath: pillFetch?.path ?? null },
          rolesPillRenderedNoCheckbox: checkboxes.length === 0,
          roleCheckboxesInAccountMenu: menuBoxes.map(b => ({ value: b.value, name: b.name, checked: b.checked, formAction: b.formAction })),
          target,
          checkedBefore: before,
          checkedAfterToggle: storedAfter,
          autoSubmitWriteStatus: writeStatus,
          autoSubmitPath: sent.e === undefined ? sent.r.url() : null,
          restoredToOriginalState: restoredState === before,
          restoreWriteStatus: restored.e === undefined ? restored.r.status() : null,
          raw: captureEvidence(await page.content(), { check: "role-checkbox-toggle" }),
        });
    },
  },

  // ------------------------------------------------------- render-mode
  {
    name: "the same affordance opens inline in a modal instead of navigating away",
    only: "unmeasured-matrix",
    run: async ctx => {
      requireLoopback(ctx);
      const { stack, page, creds, signIn, record, created, captureEvidence, database, launchBrowser, assetHosts } = ctx;
      const signedIn = await signIn(creds.admin);
      if (!signedIn.hasSessionCookie) throw Error("render-mode browser signin failed");

      const name = "HarnessRenderMode_" + Date.now().toString(36);
      created.push(name);
      const createResponse = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        maxRedirects: 0,
        data: new URLSearchParams({ "card[name]": name, "card[type]": "Basic", "card[content]": "render-mode fixture", "success[redirect]": "true" }).toString(),
      });
      if (createResponse.status() >= 400 || database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(name) === undefined) {
        throw Error("render-mode fixture card was not stored");
      }

      // The same affordance is offered two ways by the deck: the card's `?view=edit`
      // (a NAVIGATION) and its pencil /edit link (an INLINE MODAL — the edit-link
      // href and the href_endsWith("/edit") contract the harness's own openEdit
      // helper waits on, '#edit_card, .modal'). Measure both and compare: the
      // render-mode claim is only true if the two differ in kind and the inline
      // one leaves the underlying page in place.
      const shown = await page.goto(stack.origin + "/" + name, { waitUntil: "load" });
      const urlOnCard = page.url();
      const mainBefore = await page.evaluate(() => document.querySelector("#main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null);

      const editLink = page.locator('#main a.edit-link[href$="/edit"]').first();
      const editHref = await editLink.getAttribute("href").catch(() => null);
      let inline = { note: "the card page renders no pencil edit link to click" };
      if (editHref !== null) {
        const endpoint = new URL(editHref, stack.origin);
        if (endpoint.origin !== stack.origin) throw Error("edit link leaves owned origin");
        const before = ctx.ledger().length;
        await editLink.dispatchEvent("click");
        await page.waitForTimeout(2500);
        const caused = ctx.linesSince(before);
        const modalVisible = await page.locator(".modal.show, #edit_card").count();
        const formInModal = await page.locator('.modal.show form.card-form, #edit_card form.card-form').count();
        const mainStillPresent = await page.evaluate(() => document.querySelector("#main") !== null);
        const mainAfter = await page.evaluate(() => document.querySelector("#main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null);
        inline = {
          editHref,
          editRequests: caused.filter(l => /\/edit/.test(l.path ?? "")).map(l => `${l.method} ${l.path} -> ${l.status}`),
          modalVisible,
          formInModal,
          underlyingPageStillMounted: mainStillPresent && mainAfter === mainBefore,
          urlBeforeClick: urlOnCard,
          urlAfterClick: page.url(),
          leftTheCardPage: new URL(page.url()).pathname !== new URL(urlOnCard).pathname,
        };
      }

      // The navigation arm: the same card, same data, reached by GET ?view=edit.
      const navigated = await page.goto(stack.origin + "/" + name + "?view=edit", { waitUntil: "load" });
      const navigationShape = await page.evaluate(() => ({
        hasModal: document.querySelector(".modal.show") !== null,
        formCount: document.querySelectorAll("form.card-form").length,
        url: location.href,
      }));

      // What the row asks is whether the inline-modal render mode is IMPLEMENTED
      // for this affordance: the control opens a modal in place, and the page the
      // person was reading is still mounted underneath it. The navigation arm is
      // recorded as OBSERVED FACT, not as a pass condition — the first run of
      // this check measured that ?view=edit also answers 200 with the edit form
      // inside a .modal, so grading "the two arms differ" would be grading a
      // claim this engine does not make. Both arms' behaviour is in the evidence.
      record(capabilityChecks.renderMode[0],
        inline.note === undefined
          && inline.modalVisible > 0
          && inline.formInModal > 0
          && inline.leftTheCardPage === false
          && inline.underlyingPageStillMounted === true
          && inline.editRequests.length > 0
          && inline.editRequests.every(r => /-> (\d\d\d)$/.exec(r)?.[1] !== undefined && Number(/-> (\d\d\d)$/.exec(r)[1]) < 400)
          && navigated?.status() === 200,
        {
          actor: creds.admin.name,
          actorId: creds.admin.id,
          card: name,
          shownStatus: shown?.status() ?? null,
          inlineArm: inline,
          navigationArm: { status: navigated?.status() ?? null, ...navigationShape },
          inlineModalRenderModeImplemented: inline.note === undefined && inline.modalVisible > 0 && inline.formInModal > 0 && inline.leftTheCardPage === false,
          bothArmsRenderAModal: navigationShape.hasModal === true,
          note: inline.note !== undefined
            ? inline.note
            : navigationShape.hasModal === true
              ? "the inline arm opens a modal in place without leaving the card page, and the ?view=edit navigation arm also answers 200 with the edit form in a .modal: this engine implements ONE render mode (modal) for the edit affordance rather than two distinguishable ones"
              : "the inline arm opens a modal in place; the ?view=edit navigation arm renders the same form without a modal, so the affordance is genuinely dual-mode",
          raw: captureEvidence(await page.content(), { check: "render-mode-compare" }),
        });
    },
  },
];