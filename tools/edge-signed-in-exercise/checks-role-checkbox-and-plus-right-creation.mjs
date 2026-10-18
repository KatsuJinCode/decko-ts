// checks-role-checkbox-and-plus-right-creation.mjs — instruments for the two
// PERMISSION / RULE-STORAGE actions the coverage matrix
// (docs/registry/instrument-coverage-matrix.json, last_recomputed
// 2026-10-17T09:57:46Z, repo C:/localProjects/brandonDojoTech) still carries
// with NO observing entry at all:
//
//   A6  "role checkbox editing on account/rules surfaces"          ACT-175
//       (kind enumeration-backlog, surface "role checkboxes",
//        instrument_family "none", shape "none", status unmeasured)
//   C20 "create a plus card (+right) from the UI"                  ACT-167
//       (kind enumeration-backlog, surface "plus-card creation",
//        instrument_family "none", shape "none", status unmeasured)
//
// The other three rows of this family (P4 ACT-141, P6 ACT-142, P7 ACT-163)
// were instrumented tonight in this same checkout by checks-permission-rules
// (11f3a90a) and are re-measured by that module, not duplicated here.
//
// Why A6 is a real surface and not a guess: the account mod registers
// link_with_checkbox on the Role cardtype (src/card/mod-loader/mods/
// card-mod-account.ts:1616-1633). Its body (same file, 453-509, porting set/
// type/role.rb:8-10 and role_checkbox at :26-32) is a card_form :update on
// `<actor>+*disabled roles` carrying check_box_tag(name, <role id>,
// !disabled, "_edit-item") — checked means the role is NOT in the actor's
// disabled list, and the field NAME is add_item when enabled / drop_item when
// disabled. So a real click on an unchecked box posts drop_item=<role id>,
// which drops that role id from the actor's disabled-roles card: a stored,
// observable state change. The same view body raises CodenameNotFoundError
// when the deck has no `disabled_roles` codename and the html format's root
// rescue renders the error text instead of the checkbox — that is exactly the
// state this instrument has to be able to distinguish from "the affordance
// was never clicked", so the codename is read out of the deck and recorded.
//
// Why C20 is a rule-storage action: a "+right plus card" is a card that joins
// a set (`<Card>+*right`) to a member (`<Right>`), i.e. the stored junction
// row a *right rule is made of. In the UI a user creates it by clicking the
// add_box affordance the unknown-card view renders where a nest names a card
// that does not exist yet (src/card/render/views.ts:5773-5832 unknownView /
// miniUnknownView: href "/<name>/new_in_modal?card[name]=…", data-remote).
// This check drives that path end to end and asserts the STORED junction,
// because the 2026-10-17 whole-harness run already recorded the neighbouring
// shape of this defect: a `<Type>+*type+*create` rule card create answers 303
// and stores no row (checks-create-permission.mjs RULE_STORAGE; report
// docs/reports/journey-harness-run-2026-10-17.md §3 and §7.3). A create that
// answers 303 without the row must read red here, not green.
//
// Every check restores the fixture state it seeds, because this deck copy is
// shared with every later check in the run. Selected by `--only role-plus-right`.

import { createTypedFixture, fixtureCard } from "./lib/typed-fixture.mjs";

export const meta = { topic: "role-plus-right", capabilityIds: ["A6", "C20"] };

export const capabilityChecks = {
  A6: [
    "A6 an account/rules surface renders the role's enable checkbox carrying its role id",
    "A6 clicking that checkbox drops the role id from the actor's stored disabled-roles list",
    "A6 the checkbox form's own submit posts the drop when the click does not",
    "A6 the disabled list the check seeded is restored before the run continues",
  ],
  C20: [
    "C20 the card page offers the add_box affordance for an unknown +*right nest member",
    "C20 that affordance opens a create form pre-named for the +*right card",
    "C20 the create surface the affordance targets opens a form pre-named for the +*right card",
    "C20 submitting that form stores a row under the requested +*right name",
    "C20 the stored row is the junction joining the card's +*right set to the member",
    "C20 a fresh read of the card page renders the created +*right member",
  ],
};

const stamp = () => Date.now().toString(36);
const loopbackOnly = origin => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);

/** Signs one isolated browser actor in through the real sign-in form. */
const signInActor = async (page, origin, creds) => {
  await page.goto(origin + "/*signin", { waitUntil: "load" });
  await page.fill('input[name="card[subcards][+*email][content]"]', creds.email);
  await page.fill('input[name="card[subcards][+*password][content]"]', creds.password);
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 })
    .then(response => ({ response }), error => ({ error }));
  await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
  const observed = await pending;
  if (observed.error) throw observed.error;
  await observed.response.finished();
  if (observed.response.status() >= 400) throw Error("role-plus-right actor was not signed in");
  return observed.response.status();
};

/**
 * The checkbox inventory of the page as served: every checkbox with the form
 * that carries it, so a row that finds no checkbox names WHICH surface was
 * read and what that surface did carry. mainTextHead keeps the slot text the
 * way a reader sees it, which is where a quiet view rescue puts its error.
 */
const checkboxInventory = page => page.evaluate(() => {
  const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
  const main = document.querySelector("#main");
  return {
    total: boxes.length,
    boxes: boxes.slice(0, 20).map(box => {
      const form = box.closest("form");
      return {
        name: box.getAttribute("name"),
        value: box.value,
        checked: box.checked,
        className: box.className,
        label: (box.closest("label")?.textContent ?? box.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
        formAction: form?.getAttribute("action") ?? null,
        formId: form?.getAttribute("id") ?? null,
        formMethod: (form?.getAttribute("method") ?? "get").toLowerCase(),
        formFields: form === null ? [] : [...form.querySelectorAll("[name]")].map(f => f.getAttribute("name")).slice(0, 8),
      };
    }),
    mainTextHead: (main?.innerText ?? document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    codenameErrors: (document.body.innerText ?? "").match(/CodenameNotFound[^\n]*/g)?.slice(0, 3) ?? [],
  };
});

/** The create form the page serves, identified by its action (the board's own
 * card edit form is also a form.card-form) rather than by DOM order. */
const createFormShape = page => page.evaluate(() => {
  const f = [...document.querySelectorAll("form.card-form")].find(el => (el.getAttribute("action") ?? "").includes("/card/create")) ?? null;
  const name = f?.querySelector('[name="card[name]"]') ?? null;
  const type = f?.querySelector('[name="card[type_id]"]') ?? null;
  return {
    hasForm: f !== null,
    action: f?.getAttribute("action") ?? null,
    nameValue: name?.value ?? null,
    nameVisible: name === null ? false : name.offsetParent !== null,
    typeId: type?.value ?? null,
    contentFields: f === null ? [] : [...f.querySelectorAll('[name="card[content]"]')].map(el => el.getAttribute("name") + (el.classList.contains("tinymce-textarea") ? " (tinymce)" : "")),
    submitButtons: f === null ? 0 : f.querySelectorAll(".create-submit-button, button[type='submit']").length,
    inModal: f !== null && f.closest(".modal") !== null,
    pageText: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
  };
});

/** The stored content lines of a card row, as the engine reads them. */
const contentLines = row => String(row?.db_content ?? "").split("\n").map(line => line.trim()).filter(line => line.length > 0);

export const checks = [

  // ------------------------------------------------------------------- A6
  {
    name: "A6 a role's enable checkbox on an account/rules surface drops the role from the actor's disabled list",
    only: "role-plus-right",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence } = ctx;
      if (!loopbackOnly(stack.origin)) throw Error("role-plus-right requires the disposable loopback fixture");
      const s = stamp();
      const actor = creds.admin.name;
      let browser;
      try {
        browser = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = browser.page;
        await signInActor(page, stack.origin, creds.admin);

        const codenameRow = code => database().prepare("SELECT id,name FROM cards WHERE codename=? AND trash=0 ORDER BY id LIMIT 1").get(code) ?? null;
        const codenames = Object.fromEntries(["role", "disabled_roles", "right", "self", "members"].map(code => [code, codenameRow(code)]));
        const roles = codenames.role === null ? [] : database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY name").all(codenames.role.id);

        // A role the actor must not be seen toggling: the administrator role
        // drives every permission boundary later in this run. Everything else
        // is a candidate.
        const target = roles.find(r => String(r.name).toLowerCase() !== "administrator") ?? roles[0];
        if (target === undefined) throw Error("A6 the deck exposes no role card to read");

        // The surfaces the matrix names, read as served, BEFORE any gate: an
        // absent affordance must be a measurement of the served page, not of a
        // check that gave up. The account board's Roles tab loads by ajax (a
        // nav-link, not a page), so it is clicked the way a person clicks it.
        const surfaces = [];
        const openBoardRolesTab = async () => {
          const opened = await page.goto(`${stack.origin}/${encodeURIComponent(actor)}/board`, { waitUntil: "load" });
          const tabs = await page.locator(".board .nav-link", { hasText: "Roles" }).count();
          if (tabs > 0) {
            await page.locator(".board .nav-link", { hasText: "Roles" }).first().click().catch(() => undefined);
            await page.waitForTimeout(1500);
          }
          return { opened, tabs };
        };
        const firstRead = await openBoardRolesTab();
        surfaces.push({
          surface: "account board Roles tab",
          status: firstRead.opened.status(), tabCount: firstRead.tabs,
          inventory: await checkboxInventory(page), revisit: openBoardRolesTab,
          raw: captureEvidence(await page.content(), { check: "a6-account-board-roles-tab", actor }),
        });
        const openRoleList = async () => page.goto(`${stack.origin}/type/role`, { waitUntil: "load" });
        const roleList = await openRoleList();
        surfaces.push({
          surface: "the role cardtype list (/type/role)",
          status: roleList.status(), tabCount: null,
          inventory: await checkboxInventory(page), revisit: openRoleList,
          raw: captureEvidence(await page.content(), { check: "a6-role-cardtype-list", actor }),
        });
        const openRolePage = async () => page.goto(`${stack.origin}/${encodeURIComponent(target.name)}`, { waitUntil: "load" });
        const rolePage = await openRolePage();
        surfaces.push({
          surface: `the role card's own page (${target.name})`,
          status: rolePage.status(), tabCount: null,
          inventory: await checkboxInventory(page), revisit: openRolePage,
          raw: captureEvidence(await page.content(), { check: "a6-role-card-page", role: target.name }),
        });

        const served = surfaces.flatMap(s => s.inventory.boxes.map(box => ({ ...box, surface: s.surface })));
        const found = served.filter(box => box.value !== "" && box.className.includes("_edit-item"));
        // Each surface can be read again after the seed writes, so the click
        // leg acts on the state the seed produced rather than on a stale DOM.
        const revisit = async surface => {
          const entry = surfaces.find(x => x.surface === surface);
          await entry.revisit();
          return checkboxInventory(page);
        };
        const surfaceSummary = surfaces.map(s => ({
          surface: s.surface, status: s.status, tabCount: s.tabCount,
          checkboxes: s.inventory.total, codenameErrors: s.inventory.codenameErrors,
          firstBoxes: s.inventory.boxes.slice(0, 4).map(b => ({ name: b.name, value: b.value, checked: b.checked, className: b.className })),
          mainTextHead: s.inventory.mainTextHead,
        }));
        record(capabilityChecks.A6[0], found.length > 0, {
          actor, codenames, roles: roles.slice(0, 12), target,
          surfaces: surfaceSummary, matched: found,
        });

        // The view body resolves Auth.current.field(:disabled_roles) through
        // the codename table; without that codename the body raises
        // CodenameNotFoundError and the html format's root rescue renders the
        // error where the checkbox belongs. The click legs need the actor's
        // disabled-roles card, which is named from that codename, so the gate
        // is recorded with the surface evidence rather than thrown.
        if (codenames.disabled_roles === null) {
          record(capabilityChecks.A6[1], false, {
            actor, disabledRolesCodename: null, codenames, target,
            note: "the deck carries no disabled_roles codename, so link_with_checkbox cannot resolve the actor's disabled-roles card; the surfaces read above carry no _edit-item checkbox either",
          });
          record(capabilityChecks.A6[2], false, { actor, note: "not reached: no role checkbox form was served, so there is nothing to submit" });
          record(capabilityChecks.A6[3], true, { actor, note: "nothing was seeded, so the fixture is unchanged" });
          return;
        }

        const rolesCardName = actor + "+" + codenames.disabled_roles.name;
        created.push(rolesCardName);
        const disabledBefore = contentLines(fixtureCard(database(), rolesCardName));
        const restore = async content => page.context().request.post(stack.origin + "/update/" + encodeURIComponent(rolesCardName), {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[content]": content, "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });

        if (found.length === 0) {
          record(capabilityChecks.A6[1], false, {
            actor, target, disabledBefore,
            note: "no served checkbox carries a role id as an _edit-item control on any account/rules surface",
            surfaceBoxes: served.slice(0, 8),
          });
          record(capabilityChecks.A6[2], false, { actor, note: "not reached: no checkbox form was served, so there is nothing to submit" });
          record(capabilityChecks.A6[3], true, { actor, note: "nothing was seeded, so the fixture is unchanged", disabledBefore });
          return;
        }

        // Seed the actor's disabled list with the role the served checkbox
        // names, so that box reads UNCHECKED (the view's `disabled` arm) and a
        // click has an observable stored effect.
        const seededRole = database().prepare("SELECT id,name FROM cards WHERE id=? AND trash=0").get(Number(found[0].value)) ?? target;
        const seedContent = [...disabledBefore.filter(id => id !== String(seededRole.id)), String(seededRole.id)].join("\n");
        const seed = await restore(seedContent);
        const seededIds = contentLines(fixtureCard(database(), rolesCardName));
        if (!seededIds.includes(String(seededRole.id))) {
          record(capabilityChecks.A6[1], false, {
            actor, rolesCardName, seededRole, seedStatus: seed.status(), storedIds: seededIds,
            note: "the actor's disabled-roles card did not store the seeded role id, so the checkbox's own arm cannot be exercised",
          });
          record(capabilityChecks.A6[2], false, { actor, note: "not reached: the disabled role id was never stored" });
          await restore(disabledBefore.join("\n"));
          record(capabilityChecks.A6[3], contentLines(fixtureCard(database(), rolesCardName)).join("\n") === disabledBefore.join("\n"), {
            actor, disabledBefore, restoredIds: contentLines(fixtureCard(database(), rolesCardName)),
          });
          return;
        }
        const target2 = seededRole;

        // A6's act: read the surface again so the box carries the state the
        // seed just produced, then click it the way a person does and read the
        // stored list afterwards. The form is an autosave card_form
        // (card-mod-account.ts:497-506), so the click itself must post.
        await revisit(found[0].surface);
        const servedBox = await checkboxInventory(page);
        const fresh = servedBox.boxes.find(b => b.name === found[0].name && b.value === String(target2.id)) ?? found[0];
        const box = page.locator(`input[type="checkbox"][name="${fresh.name}"][value="${target2.id}"]`).first();
        await box.scrollIntoViewIfNeeded().catch(() => undefined);
        const postPath = new URL(fresh.formAction ?? stack.origin, stack.origin).pathname;
        const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === postPath && r.request().method() === "POST", { timeout: 15000 })
          .then(response => ({ response }), error => ({ error }));
        await box.click({ force: true, timeout: 10000 }).catch(() => undefined);
        const observed = await pending;
        const postStatus = observed.error === undefined ? observed.response.status() : null;
        if (observed.error === undefined) await observed.response.finished();
        await page.waitForTimeout(1000);
        const afterIds = contentLines(fixtureCard(database(), rolesCardName));
        record(capabilityChecks.A6[1],
          postStatus !== null && postStatus < 400 && !afterIds.includes(String(target2.id)),
          {
            actor, role: target2.name, roleId: target2.id, fieldName: fresh.name, surface: found[0].surface,
            formAction: fresh.formAction, formMethod: fresh.formMethod, fieldWasUnchecked: !fresh.checked,
            postStatus,
            postWaitError: observed.error === undefined ? null : String(observed.error?.message ?? observed.error).slice(0, 140),
            seededIds, idsAfterClick: afterIds, roleStillDisabled: afterIds.includes(String(target2.id)),
            raw: captureEvidence(await page.content(), { check: "a6-role-checkbox-after-click", actor }),
          },
        );

        // Second leg, recorded only when the click leg did not store: the same
        // form, submitted through its own control. It separates "the UI cannot
        // produce this edit" from "this checkbox does not autosave".
        if (postStatus === null || afterIds.includes(String(target2.id))) {
          const form = page.locator(`form[action="${fresh.formAction}"]`).first();
          const controls = await form.evaluate(f => [...f.querySelectorAll("button,input[type=submit]")].map(b => ({
            tag: b.tagName.toLowerCase(), type: b.getAttribute("type"), cy: b.getAttribute("data-cy"),
            text: (b.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30), visible: b.offsetParent !== null,
          }))).catch(() => []);
          const submit = form.locator("button[data-cy='save'], button[type='submit'], input[type='submit']").first();
          let submitStatus = null, submitWaitError = null;
          if (await submit.count() > 0) {
            const again = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === postPath && r.request().method() === "POST", { timeout: 15000 })
              .then(response => ({ response }), error => ({ error }));
            await submit.scrollIntoViewIfNeeded().catch(() => undefined);
            await submit.click({ force: true, timeout: 10000 }).catch(() => undefined);
            const seen = await again;
            if (seen.error === undefined) { await seen.response.finished(); submitStatus = seen.response.status(); }
            else submitWaitError = String(seen.error?.message ?? seen.error).slice(0, 140);
            await page.waitForTimeout(1000);
          }
          const afterSubmit = contentLines(fixtureCard(database(), rolesCardName));
          record(capabilityChecks.A6[2],
            submitStatus !== null && submitStatus < 400 && !afterSubmit.includes(String(target2.id)),
            {
              actor, role: target2.name, roleId: target2.id, formAction: fresh.formAction, controls,
              submitStatus, submitWaitError, idsAfterSubmit: afterSubmit, seededIds,
              roleStillDisabled: afterSubmit.includes(String(target2.id)),
            },
          );
        } else {
          record(capabilityChecks.A6[2], true, {
            actor, note: "not needed: the checkbox click itself stored the drop, so no submit fallback was required",
          });
        }

        // Restore the seeded state so every later check in this run sees the
        // deck as it was.
        const restoreWrite = await restore(seedContent);
        const restoredIds = contentLines(fixtureCard(database(), rolesCardName));
        record(capabilityChecks.A6[3],
          restoreWrite.status() < 400 && restoredIds.join("\n") === seedContent.split("\n").join("\n"),
          { actor, restoreStatus: restoreWrite.status(), restoredIds, seededIds });
      } finally {
        await browser?.close().catch(() => {});
      }
    },
  },

  // ------------------------------------------------------------------ C20
  {
    name: "C20 the add_box affordance on a card page creates the +*right card and stores its junction row",
    only: "role-plus-right",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!loopbackOnly(stack.origin)) throw Error("role-plus-right requires the disposable loopback fixture");
      const s = stamp();
      const cardName = "HarnessC20Card_" + s;
      const rightSetName = cardName + "+*right";
      const rightName = rightSetName + "+" + s;
      let browser;
      try {
        browser = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = browser.page;
        await signInActor(page, stack.origin, creds.admin);
        created.push(cardName, rightSetName, rightName);

        // The fixture nests a +*right member that does not exist yet, which is
        // the situation the add_box affordance exists for. The set card itself
        // is seeded first: a junction row can only exist against a set.
        await createTypedFixture({ ...ctx, page }, { name: cardName, content: "[[" + rightName + "]]", type: "RichText" });
        const setSeed = await page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[name]": rightSetName, "card[type]": "List", "card[content]": "", "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });
        const rightSet = fixtureCard(database(), rightSetName);
        const fixtureRow = fixtureCard(database(), cardName);
        const before = fixtureCard(database(), rightName);

        // What the card page serves for the nest: the stored fixture content,
        // and every slot inside #main with the view that rendered it. An
        // unknown nest can come back as an :unknown slot, as nothing at all,
        // or as a link - the slot list says which.
        const cardPage = await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
        const affordances = await page.evaluate(name => [...document.querySelectorAll("a[href*='new_in_modal']")]
          .map(a => ({
            href: a.getAttribute("href"),
            text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
            icon: a.querySelector("i")?.textContent ?? null,
            namesCard: decodeURIComponent(a.getAttribute("href") ?? "").includes(name),
          })), rightName);
        const slots = await page.evaluate(name => [...document.querySelectorAll("#main .card-slot")].map(el => ({
          id: el.id,
          classes: (el.className ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
          cardName: el.getAttribute("data-card-name"),
          slotView: (() => { try { return JSON.parse(el.getAttribute("data-slot") ?? "{}").view ?? null; } catch { return null; } })(),
          nestName: (() => { try { return JSON.parse(el.getAttribute("data-slot") ?? "{}").nest_name ?? null; } catch { return null; } })(),
          mentionsNest: (el.outerHTML ?? "").includes(name),
        })), rightName);
        const target = affordances.find(a => a.namesCard);
        record(capabilityChecks.C20[0], cardPage.status() < 400 && target !== undefined, {
          card: cardName, nested: "[[" + rightName + "]]", status: cardPage.status(),
          fixtureContent: fixtureRow?.db_content ?? null,
          setSeedStatus: setSeed.status(), rightSetStored: rightSet !== undefined,
          affordances, slots,
          nestRenderedAsSlot: slots.some(s => s.nestName === rightName || s.mentionsNest),
          raw: captureEvidence(await page.content(), { check: "c20-plus-right-affordance", card: cardName }),
        });

        // The form leg: click the affordance when it is served.
        let formShape = null, formAction = null;
        if (target !== undefined) {
          await page.locator(`a[href="${target.href}"]`).first().click().catch(() => undefined);
          const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') })
            .filter({ has: page.locator(".create-submit-button") }).first();
          await form.waitFor({ state: "attached", timeout: 20000 }).catch(() => undefined);
          formShape = await createFormShape(page);
          formAction = form;
        }
        record(capabilityChecks.C20[1],
          target !== undefined && formShape?.hasForm === true && formShape.nameValue === rightName && formShape.submitButtons > 0,
          {
            card: cardName, rightName, affordance: target?.href ?? null,
            note: target === undefined ? "not reached: no add_box affordance on the card page names the unknown +*right card" : "the affordance was clicked",
            shape: formShape,
          },
        );

        // The create-surface leg, measured whether or not the affordance was
        // served: the root modal create route the unknown-card view's link
        // targets for a name with no mark (src/card/render/views.ts:5810-5814,
        // `/?view=new_in_modal`). This is what separates "the page offers no
        // way in" from "the create surface itself refuses the +*right name".
        const modalRoute = `${stack.origin}/?view=new_in_modal&card%5Bname%5D=${encodeURIComponent(rightName)}`;
        const modal = await page.goto(modalRoute, { waitUntil: "domcontentloaded" });
        const modalShape = await createFormShape(page);
        record(capabilityChecks.C20[2],
          modal.status() < 400 && modalShape.hasForm && modalShape.nameValue === rightName && modalShape.submitButtons > 0,
          {
            card: cardName, rightName, route: modalRoute, status: modal.status(), shape: modalShape,
            raw: captureEvidence(await page.content(), { check: "c20-plus-right-modal-create-form", card: cardName }),
          },
        );

        // The storage legs. They run against whichever form the surface
        // actually served, so a refusal above does not leave the rule-storage
        // question unmeasured.
        const served = modalShape.hasForm && modalShape.nameValue === rightName && modalShape.submitButtons > 0
          ? { page, locator: page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") }).first(), action: modalShape.action, via: "the root modal create route" }
          : formShape?.hasForm === true && formShape.nameValue === rightName
            ? { page, locator: formAction, action: formShape.action, via: "the add_box affordance's modal" }
            : null;
        if (served === null) {
          record(capabilityChecks.C20[3], false, {
            card: cardName, rightName, note: "no create form was served for the +*right name, so nothing could be submitted",
            stored: before ?? null, rightSetStored: rightSet !== undefined,
          });
          record(capabilityChecks.C20[4], false, {
            card: cardName, note: "not reached: nothing was created, so no junction row can exist", stored: before ?? null,
          });
          record(capabilityChecks.C20[5], false, {
            card: cardName, note: "not reached: nothing was created, so a fresh read cannot render it", stored: before ?? null,
          });
          return;
        }

        const action = new URL(served.action, stack.origin);
        const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30000 })
          .then(response => ({ response }), error => ({ error }));
        await served.locator.locator(".create-submit-button").first().click({ force: true, timeout: 15000 }).catch(() => undefined);
        const observed = await pending;
        let postStatus = null;
        if (observed.error === undefined) { await observed.response.finished(); postStatus = observed.response.status(); }
        await page.waitForTimeout(1000);

        // The stored junction IS the rule-storage claim: a +right plus card
        // exists only as the row joining the set card to the member card. A
        // 303 with no row is the defect shape already on record for the
        // neighbouring <Type>+*type+*create rule create.
        const after = fixtureCard(database(), rightName);
        const anyTrash = database().prepare("SELECT id,name,trash,type_id,left_id,right_id FROM cards WHERE name=?").all(rightName);
        const familyRows = database().prepare("SELECT id,name,trash,left_id,right_id,substr(coalesce(db_content,''),1,40) AS content_head FROM cards WHERE name LIKE ?").all("%" + s + "%");
        record(capabilityChecks.C20[3],
          postStatus !== null && postStatus < 400 && after !== undefined,
          {
            card: cardName, rightName, submittedThrough: served.via, postStatus,
            postWaitError: observed.error === undefined ? null : String(observed.error?.message ?? observed.error).slice(0, 140),
            stored: after ?? null, anyTrashRows: anyTrash, familyRows,
            rightSet: rightSet === undefined ? null : { id: rightSet.id, name: rightSet.name, type_id: rightSet.type_id },
            note: after === undefined ? "the create answered without storing a row under the requested name" : "a row exists under the requested name",
            raw: captureEvidence(await page.content(), { check: "c20-plus-right-after-create", card: cardName }),
          });
        // The set membership read from the junction ids, not from the name.
        const member = after === undefined ? null : database().prepare("SELECT id,name,type_id,left_id,right_id,trash FROM cards WHERE id=?").get(after.id);
        record(capabilityChecks.C20[4],
          member !== null && rightSet !== undefined && member.left_id === rightSet.id && member.right_id !== null,
          {
            card: cardName, rightName, member,
            rightSet: rightSet === undefined ? null : { id: rightSet.id, name: rightSet.name, left_id: rightSet.left_id, right_id: rightSet.right_id },
            joinsTheSet: rightSet !== undefined && member?.left_id === rightSet.id,
          });
        // The user-visible outcome: a fresh read of the card page shows the
        // member the create was supposed to add.
        const afterRead = await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
        const afterHtml = await page.content();
        record(capabilityChecks.C20[5],
          afterRead.status() < 400 && (afterHtml.includes(rightName) || decodeURIComponent(afterRead.url()).includes(rightName)),
          {
            card: cardName, rightName, status: afterRead.status(),
            renderedName: afterHtml.includes(rightName),
            unknownAffordances: await page.evaluate(() => [...document.querySelectorAll("a.unknown-link[href*='new_in_modal']")].map(a => a.getAttribute("href")).slice(0, 5)),
            raw: captureEvidence(afterHtml, { check: "c20-plus-right-after-read", card: cardName }),
          });
      } catch (error) {
        if (error?.name === "TimeoutError") fixtureState.fatalReason = "role-plus-right browser operation timed out";
        throw error;
      } finally {
        await browser?.close().catch(() => {});
      }
    },
  },
];