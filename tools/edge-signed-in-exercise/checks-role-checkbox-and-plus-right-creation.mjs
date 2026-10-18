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
// SERVED SHAPE, measured rather than assumed. Both actions' controls were read
// off the served pages of the run this module exists for (reports
// 2026-10-18T00-43-25-378Z-38872 and 00-48-40-949Z-30260 in the checkout that
// ran it), and both earlier assumptions were wrong:
//
//   A6 — the role checkbox is NOT the Ruby role_checkbox (`check_box_tag(...,
//   "_edit-item")` in set/type/role.rb:26-32, ported at
//   src/card/mod-loader/mods/card-mod-account.ts:453-509). The account's Roles
//   dropdown serves role_checkbox.haml's boxes instead
//   (rolesAccountDropdownHtml, src/card/render/navbar-views.ts:452-472): inside
//   the autosave form `action="/update/<actor>+*enabled roles"` (the slot
//   `edit_inline-view`, TYPE-session) it emits, per current role,
//   `input[name^="pointer_checkbox-"][value="<Role Name>"].pointer-checkbox-button
//   _submit-on-change`, every one checked ("one role_checkbox per current role
//   (role_checkbox.haml), every box checked (ensure_roles)"). So the A6 edit is
//   an uncheck that must drop the role from the actor's stored enabled-roles
//   selection. This deck also carries NO `disabled_roles` codename, so the
//   account mod's link_with_checkbox body would raise CodenameNotFoundError if
//   that were the control; the codename is still read out and recorded, because
//   a reader comparing this against the Ruby view needs to know which control
//   answers.
//
//   C20 — the card page does NOT render an add_box affordance for an unknown
//   nest member; it renders the nest as `<a class="wanted-card" href="...">`
//   (the wanted-card class the link_to_card view adds, mod-bootstrap.ts:498-503).
//   The user's route is therefore: card page -> wanted-card link -> the unknown
//   card's own page -> its unknown-card add_box (unknownLinkHref,
//   src/card/render/views.ts:5810-5832) -> create form -> stored junction.
//   Every leg is measured; a leg the surface never offered reads red with the
//   inventory that shows why.
//
// A +right plus card is a RULE-STORAGE artifact: in the database it exists only
// as the junction row joining the card's `+*right` set to the member card. The
// 2026-10-17 whole-harness run recorded the neighbouring shape of this defect (a
// `<Type>+*type+*create` rule card create answers 303 and stores no row;
// checks-create-permission.mjs RULE_STORAGE, report
// docs/reports/journey-harness-run-2026-10-17.md §3 and §7.3), so the storage
// legs assert the stored row, never the response code alone.
//
// Every leg restores what it changed: the actor's stored roles go back to their
// pre-click set, and the check asserts the restore rather than assuming it.
// Selected by `--only role-plus-right`.

import { createTypedFixture, fixtureCard } from "./lib/typed-fixture.mjs";

export const meta = { topic: "role-plus-right", capabilityIds: ["A6", "C20"] };

export const capabilityChecks = {
  A6: [
    "A6 an account/rules surface serves a role checkbox carrying that role's name",
    "A6 clicking that checkbox posts and removes the role from the actor's stored enabled-roles selection",
    "A6 the checkbox form's own submit posts the same edit when the click does not",
    "A6 the actor's stored roles are back at their pre-click set before the run continues",
  ],
  C20: [
    "C20 the card page renders the unknown +*right nest member as a wanted-card link",
    "C20 the wanted card's own page offers a create affordance for that +*right name",
    "C20 that affordance opens a create form pre-named for the +*right card",
    "C20 submitting it stores a row under the requested +*right name",
    "C20 the stored row is the junction joining the card's +*right set to the member",
    "C20 a fresh read of the card page renders the created +*right member as a known card",
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
 * that carries it, so a row that finds no checkbox names WHICH surface was read
 * and what that surface did carry. mainTextHead keeps the slot text the way a
 * reader sees it, which is where a quiet view rescue puts its error.
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
        // The product's own stylesheet hides some role boxes
        // (`.RIGHT-Xenabled_role.edit_inline-view .pointer-checkbox-list
        // #pointer-checkbox-anyone_signed_in { display: none }`), so a box
        // being SERVED is not the same as a box being clickable.
        display: getComputedStyle(box).display,
        boxVisibility: getComputedStyle(box).visibility,
        menuOpen: (() => { const menu = box.closest(".dropdown-menu"); return menu === null ? null : menu.classList.contains("show"); })(),
        label: (box.closest("label")?.textContent ?? box.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
        formAction: form?.getAttribute("action") ?? null,
        formId: form?.getAttribute("id") ?? null,
        formMethod: (form?.getAttribute("method") ?? "get").toLowerCase(),
        formRemote: form?.getAttribute("data-remote") ?? null,
        formClass: form?.getAttribute("class") ?? null,
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

/** The anchors that lead to creating a card, in both shapes the port serves:
 * the unknown-card add_box link and the wanted-card link the content view
 * renders for a nest that names a card which does not exist. */
const createAffordances = (page, name) => page.evaluate(wanted => [...document.querySelectorAll("a[href*='new_in_modal'], a.wanted-card")]
  .map(a => ({
    href: a.getAttribute("href"),
    classes: a.getAttribute("class"),
    icon: a.querySelector("i")?.textContent ?? null,
    text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
    namesCard: decodeURIComponent(a.getAttribute("href") ?? "").includes(wanted),
  })), name);

/** The stored content lines of a card row, as the engine reads them. */
const contentLines = row => String(row?.db_content ?? "").split("\n").map(line => line.trim()).filter(line => line.length > 0);

export const checks = [
// ------------------------------------------------------------------- A6
  {
    name: "A6 a role checkbox on an account/rules surface edits the actor's stored roles",
    only: "role-plus-right",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence } = ctx;
      if (!loopbackOnly(stack.origin)) throw Error("role-plus-right requires the disposable loopback fixture");
      const s = stamp();
      // The actor is the fixture MEMBER, not the administrator. The run's
      // earlier probe showed the administrator's own dropdown hides one of its
      // two boxes with the product's own stylesheet rule
      // (`.RIGHT-Xenabled_role.edit_inline-view .pointer-checkbox-list
      // #pointer-checkbox-anyone_signed_in { display: none }`, from
      // mod-style-assets/card-mod-layout/assets/style/modal.scss in the built
      // bundle), and the only other box is the administrator role itself -
      // editing that would change every permission boundary later in the run.
      // A member account with one benign role gives the action a real, visible,
      // low-blast-radius control to edit.
      const actor = creds.member.name;
      const actorId = creds.member.id;
      let browser;
      try {
        browser = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = browser.page;
        await signInActor(page, stack.origin, creds.member);

        const codenameRow = code => database().prepare("SELECT id,name FROM cards WHERE codename=? AND trash=0 ORDER BY id LIMIT 1").get(code) ?? null;
        const codenames = Object.fromEntries(["role", "disabled_roles", "enabled_roles", "members"].map(code => [code, codenameRow(code)]));
        const roles = codenames.role === null ? [] : database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY name").all(codenames.role.id);
        const roleNames = new Set(roles.map(r => r.name));

        // Role membership is stored as a reference from the role's `<role>+*members`
        // list card to the holder (the shape lib/seed-local-accounts.mjs writes,
        // lines 108-115). That is the stored state the checkbox edits, and it is
        // what the fingerprint below reads.
        const membersListId = roleId => database()
          .prepare("SELECT id FROM cards WHERE left_id=? AND right_id=? AND trash=0")
          .get(roleId, codenames.members?.id)?.id ?? null;
        const memberships = () => database().prepare("SELECT referer_id FROM card_references WHERE referee_id=?").all(actorId)
          .map(row => {
            const referer = database().prepare("SELECT id,name,left_id,right_id FROM cards WHERE id=?").get(row.referer_id);
            const left = referer?.left_id === null || referer === undefined ? null : database().prepare("SELECT id,name FROM cards WHERE id=?").get(referer.left_id);
            return { refererId: row.referer_id, roleId: referer?.left_id ?? null, roleName: left?.name ?? null };
          })
          .sort((a, b) => String(a.roleName).localeCompare(String(b.roleName)));
        const snapshot = () => ({ memberships: memberships(), enabledRolesCard: fixtureCard(database(), actor + "+*enabled roles") ?? null });

        // Seed ONE benign role for this actor, so the dropdown offers a box the
        // product does not hide. Fixture-only: the row is removed again by the
        // restore leg whatever the control does.
        const target = roles.find(r => !["administrator", "anyone", "anyone signed in"].includes(String(r.name).toLowerCase()));
        if (target === undefined || codenames.members === null) {
          record(capabilityChecks.A6[0], false, {
            actor, note: "the deck exposes no benign role card to seed for this actor", codenames, roles: roles.slice(0, 12),
          });
          record(capabilityChecks.A6[1], false, { actor, note: "not reached: no role checkbox could be offered" });
          record(capabilityChecks.A6[2], false, { actor, note: "not reached: no role checkbox could be offered" });
          record(capabilityChecks.A6[3], true, { actor, note: "nothing was seeded, so the fixture is unchanged" });
          return;
        }
        const listId = membersListId(target.id);
        if (listId === null) {
          record(capabilityChecks.A6[0], false, {
            actor, target, note: "the deck has no <role>+*members list to seed the role membership through", codenames,
          });
          record(capabilityChecks.A6[1], false, { actor, note: "not reached: no membership could be seeded" });
          record(capabilityChecks.A6[2], false, { actor, note: "not reached: no membership could be seeded" });
          record(capabilityChecks.A6[3], true, { actor, note: "nothing was seeded, so the fixture is unchanged" });
          return;
        }
        database().prepare("INSERT INTO card_references (referer_id, referee_id) VALUES (?, ?)").run(listId, actorId);
        const before = snapshot();
        // A fresh sign-in so the session reads the seeded membership rather
        // than whatever the earlier login cached.
        await page.goto(stack.origin + "/*signin", { waitUntil: "load" }).catch(() => undefined);
        await signInActor(page, stack.origin, creds.member);

        // The surfaces the matrix names, read as served. The account board's
        // Roles tab loads by ajax (a nav-link, not a page), so it is clicked the
        // way a person clicks it.
        const openBoardRolesTab = async () => {
          const opened = await page.goto(`${stack.origin}/${encodeURIComponent(actor)}/board`, { waitUntil: "load" });
          const tabs = await page.locator(".board .nav-link", { hasText: "Roles" }).count();
          if (tabs > 0) {
            await page.locator(".board .nav-link", { hasText: "Roles" }).first().click().catch(() => undefined);
            await page.waitForTimeout(1500);
          }
          return { opened, tabs };
        };
        const openPath = (path) => async () => { await page.goto(stack.origin + path, { waitUntil: "load" }); };
        const surfaces = [];
        const first = await openBoardRolesTab();
        surfaces.push({
          surface: "account board Roles tab", status: first.opened.status(), tabCount: first.tabs,
          inventory: await checkboxInventory(page), revisit: openBoardRolesTab,
          raw: captureEvidence(await page.content(), { check: "a6-account-board-roles-tab", actor }),
        });
        const roleList = await openPath("/type/role")();
        surfaces.push({
          surface: "the role cardtype list (/type/role)", status: roleList.status(), tabCount: null,
          inventory: await checkboxInventory(page), revisit: openPath("/type/role"),
          raw: captureEvidence(await page.content(), { check: "a6-role-cardtype-list", actor }),
        });
        const rolePage = await openPath("/" + encodeURIComponent(target.name))();
        surfaces.push({
          surface: `the role card's own page (${target.name})`, status: rolePage.status(), tabCount: null,
          inventory: await checkboxInventory(page), revisit: openPath("/" + encodeURIComponent(target.name)),
          raw: captureEvidence(await page.content(), { check: "a6-role-card-page", role: target.name }),
        });

        const served = surfaces.flatMap(s => s.inventory.boxes.map(box => ({ ...box, surface: s.surface })));
        // A role checkbox is a checkbox whose value is one of the deck's role
        // names. The Ruby `_edit-item` shape is accepted too, so a deck that
        // serves that view instead is measured, not misreported.
        const found = served.filter(box => roleNames.has(box.value) && (box.name.startsWith("pointer_checkbox-") || box.className.includes("_edit-item")));
        record(capabilityChecks.A6[0], found.length > 0, {
          actor, codenames, seededRole: target, before, roleCount: roles.length,
          surfaces: surfaces.map(s => ({
            surface: s.surface, status: s.status, tabCount: s.tabCount,
            checkboxes: s.inventory.total, codenameErrors: s.inventory.codenameErrors,
            boxes: s.inventory.boxes.slice(0, 6).map(b => ({ name: b.name, value: b.value, checked: b.checked, className: b.className, formAction: b.formAction })),
            mainTextHead: s.inventory.mainTextHead,
          })),
          matched: found,
        });

        // Which box can a person actually click? The dropdown ships closed and
        // the product's stylesheet hides some boxes, so the served inventory is
        // re-read with the menu open and each box's computed display recorded.
        // Opening the menu: a real click on the navbar toggle, and - when that
        // leaves it closed - the same `show` class Bootstrap's dropdown JS adds,
        // so the control's submit behaviour is measured apart from the menu's
        // open behaviour.
        const openRolesDropdown = async () => {
          const toggles = await page.locator(".navbar a.dropdown-toggle").count();
          if (toggles > 0) {
            await page.locator(".navbar a.dropdown-toggle").first().click({ timeout: 10000 }).catch(() => undefined);
            await page.waitForTimeout(500);
            if (await page.locator(".navbar .dropdown-menu.show").count() > 0) return { toggles, opened: true, how: "the dropdown toggle was clicked" };
          }
          const forced = await page.evaluate(() => {
            const menus = [...document.querySelectorAll(".navbar .dropdown-menu")];
            menus.forEach(menu => menu.classList.add("show"));
            return menus.length;
          });
          await page.waitForTimeout(300);
          return { toggles, opened: await page.locator(".navbar .dropdown-menu.show").count() > 0, how: "the click left it closed; the show class was added to " + forced + " navbar menu(s)" };
        };
        await surfaces[0].revisit();
        const dropdown = await openRolesDropdown();
        const menuInventory = await checkboxInventory(page);
        const clickable = menuInventory.boxes
          .filter(box => box.value === target.name)
          .map(box => ({ ...box, computedDisplay: box.display }));
        const postPath = new URL(clickable[0]?.formAction ?? stack.origin, stack.origin).pathname;
        const locatorFor = () => page.locator(`input[type="checkbox"][name="${clickable[0].name}"][value="${target.name}"]`).first();
        const driveClick = async () => {
          const box = locatorFor();
          const visible = await box.isVisible().catch(() => false);
          const checkedBefore = await box.isChecked().catch(() => null);
          if (!visible) return { status: null, error: "the box is not visible even with the menu marked open", visible, checkedBefore, checkedAfter: null };
          await box.scrollIntoViewIfNeeded().catch(() => undefined);
          const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === postPath && r.request().method() === "POST", { timeout: 15000 })
            .then(response => ({ response }), error => ({ error }));
          await box.click({ timeout: 10000 }).catch(() => undefined);
          const checkedAfter = await box.isChecked().catch(() => null);
          const observed = await pending;
          if (observed.error !== undefined) return { status: null, error: "no POST to " + postPath, visible, checkedBefore, checkedAfter };
          await observed.response.finished();
          await page.waitForTimeout(1000);
          return { status: observed.response.status(), error: null, visible, checkedBefore, checkedAfter };
        };

        const click = clickable.length === 0 ? { status: null, error: "the dropdown serves no box for the seeded role", visible: false, checkedBefore: null, checkedAfter: null } : await driveClick();
        const afterClick = snapshot();
        const moved = JSON.stringify(afterClick.memberships) !== JSON.stringify(before.memberships);
        record(capabilityChecks.A6[1],
          click.status !== null && click.status < 400 && moved,
          {
            actor, role: target.name, fieldName: clickable[0]?.name ?? null, formAction: clickable[0]?.formAction ?? null,
            dropdownOpened: dropdown.opened, dropdownHow: dropdown.how,
            servedBox: clickable, checkboxVisible: click.visible,
            checkedBeforeClick: click.checkedBefore, checkedAfterClick: click.checkedAfter,
            clickError: click.error, postStatus: click.status,
            storedBefore: before, storedAfterClick: afterClick, storedMembershipMoved: moved,
            raw: captureEvidence(await page.content(), { check: "a6-role-checkbox-after-click", actor }),
          },
        );

        // Submit fallback, reached only when the click leg did not store the
        // edit: it separates "this control does not autosave" from "the UI
        // cannot produce this edit at all".
        if (click.status !== null && click.status < 400 && moved) {
          record(capabilityChecks.A6[2], true, {
            actor, role: target.name, note: "not needed: the checkbox click itself posted and moved the stored membership",
            postStatus: click.status,
          });
        } else {
          const form = page.locator(`form[action="${clickable[0]?.formAction ?? ""}"]`).first();
          const controls = await form.evaluate(f => [...f.querySelectorAll("button,input[type=submit]")].map(b => ({
            tag: b.tagName.toLowerCase(), type: b.getAttribute("type"), cy: b.getAttribute("data-cy"),
            text: (b.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30), visible: b.offsetParent !== null,
          }))).catch(() => []);
          const again = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === postPath && r.request().method() === "POST", { timeout: 15000 })
            .then(response => ({ response }), error => ({ error }));
          const submitted = await form.evaluate(f => { f.requestSubmit(); return true; }).catch(() => false);
          const seen = await again;
          let submitStatus = null;
          if (seen.error === undefined) { await seen.response.finished(); submitStatus = seen.response.status(); }
          await page.waitForTimeout(1000);
          const afterSubmit = snapshot();
          record(capabilityChecks.A6[2],
            submitted && submitStatus !== null && submitStatus < 400 && JSON.stringify(afterSubmit.memberships) !== JSON.stringify(before.memberships),
            {
              actor, role: target.name, formAction: clickable[0]?.formAction ?? null, controls,
              route: "the served autosave form submitted through the DOM (it renders no submit control)",
              submitted, submitStatus, storedBefore: before, storedAfterSubmit: afterSubmit,
              storedMembershipMoved: JSON.stringify(afterSubmit.memberships) !== JSON.stringify(before.memberships),
            },
          );
        }

        // Restore leg: the seeded membership must be back where the check found
        // it, by whichever route actually restores it.
        let restored = snapshot();
        let restoreRoute = "the stored membership never moved, so there was nothing to restore";
        if (JSON.stringify(restored.memberships) !== JSON.stringify(before.memberships)) {
          await surfaces[0].revisit();
          await openRolesDropdown();
          const after = await checkboxInventory(page);
          const stillOffered = after.boxes.some(b => b.value === target.name);
          if (stillOffered) {
            restoreRoute = "the same checkbox, clicked again (menu re-opened first)";
            await driveClick();
            restored = snapshot();
          } else {
            restoreRoute = "the seeded membership row, re-inserted directly in the run's deck copy";
            database().prepare("INSERT OR IGNORE INTO card_references (referer_id, referee_id) VALUES (?, ?)").run(listId, actorId);
            restored = snapshot();
          }
        }
        const restoredToBefore = JSON.stringify(restored.memberships) === JSON.stringify(before.memberships);
        record(capabilityChecks.A6[3], restoredToBefore, {
          actor, role: target.name, restoreRoute, storedBefore: before, storedAfterRestore: restored, restoredToBefore,
        });
      } finally {
        await browser?.close().catch(() => {});
      }
    },
  },
  // ------------------------------------------------------------------ C20
  {
    name: "C20 the wanted-card affordance on a card page creates the +*right card and stores its junction row",
    only: "role-plus-right",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!loopbackOnly(stack.origin)) throw Error("role-plus-right requires the disposable loopback fixture");
      const s = stamp();
      // NO underscore in the fixture name. A wanted card is reached through a
      // URL path, and Decko's url key maps every space to an underscore
      // (DeckoName#urlKey, src/card/name.ts:688-698), so a name carrying a
      // literal underscore cannot round-trip: the run at 01-02-53 measured the
      // create form pre-filling "HarnessC20Card mvd4g4a8..." (space where the
      // requested name had an underscore) and resolving it to the same card
      // anyway. That ambiguity is the matrix's own unmeasured gap
      // "plurality/slug pinning: name variants round-trip to one card"
      // (ACT-185), not this action; a user-typed name is what this measures.
      const cardName = "HarnessC20Card" + s;
      const rightSetName = cardName + "+*right";
      const rightName = rightSetName + "+" + s;
      let browser;
      try {
        browser = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = browser.page;
        await signInActor(page, stack.origin, creds.admin);
        created.push(cardName, rightSetName, rightName);

        // The fixture nests a +*right member that does not exist yet, which is
        // the situation the affordances exist for. The set card is seeded too:
        // a junction row can only exist against a set.
        await createTypedFixture({ ...ctx, page }, { name: cardName, content: "[[" + rightName + "]]", type: "RichText" });
        const setSeed = await page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[name]": rightSetName, "card[type]": "List", "card[content]": "", "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });
        const rightSet = fixtureCard(database(), rightSetName);
        const fixtureRow = fixtureCard(database(), cardName);
        const before = fixtureCard(database(), rightName);

        // 1. The card page: what does it serve for the unknown nest member?
        const cardPage = await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
        const affordances = await createAffordances(page, rightName);
        const wanted = affordances.find(a => a.namesCard && (a.classes ?? "").includes("wanted-card"));
        record(capabilityChecks.C20[0], cardPage.status() < 400 && wanted !== undefined, {
          card: cardName, nested: "[[" + rightName + "]]", status: cardPage.status(),
          fixtureContent: fixtureRow?.db_content ?? null,
          setSeedStatus: setSeed.status(), rightSetStored: rightSet !== undefined,
          affordances, wanted: wanted ?? null,
          raw: captureEvidence(await page.content(), { check: "c20-plus-right-wanted-card-link", card: cardName }),
        });

        // 2. The wanted card's own page: does it offer a way to create it? The
        // surface is either an add_box link or the create form itself - the
        // port serves the form directly for an unknown card name (the
        // new_fields slot with a hidden card[name]), so both shapes count.
        let wantedPage = null, wantedAffordances = [], addBox = null, servedShape = null, servedForm = null;
        if (wanted !== undefined) {
          await page.locator(`a[href="${wanted.href}"]`).first().click().catch(() => undefined);
          await page.waitForTimeout(1000);
          wantedPage = page.url();
          wantedAffordances = await createAffordances(page, rightName);
          addBox = wantedAffordances.find(a => a.namesCard && (a.href ?? "").includes("new_in_modal"));
          servedShape = await createFormShape(page);
          if (addBox !== null && addBox !== undefined) {
            await page.locator(`a[href="${addBox.href}"]`).first().click().catch(() => undefined);
            const located = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') })
              .filter({ has: page.locator(".create-submit-button") }).first();
            await located.waitFor({ state: "attached", timeout: 20000 }).catch(() => undefined);
            servedShape = await createFormShape(page);
            servedForm = located;
          } else if (servedShape.hasForm) {
            servedForm = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") }).first();
          }
          record(capabilityChecks.C20[1], addBox !== undefined || servedShape.hasForm, {
            card: cardName, rightName, landedOn: wantedPage,
            addBox: addBox ?? null, affordances: wantedAffordances,
            servedForm: servedShape.hasForm, formShape: servedShape,
            raw: captureEvidence(await page.content(), { check: "c20-wanted-card-page", card: cardName }),
          });
        } else {
          record(capabilityChecks.C20[1], false, {
            card: cardName, rightName, note: "not reached: the card page served no wanted-card link for the unknown +*right member",
            affordances,
          });
        }

        // 3. The name the form pre-fills is the action's identity claim: the
        // user asked for one card by name, and the form must offer that name.
        const preNamed = servedShape !== null && servedShape.nameValue === rightName;
        record(capabilityChecks.C20[2], preNamed, {
          card: cardName, requestedName: rightName, servedName: servedShape?.nameValue ?? null,
          sameName: preNamed,
          note: preNamed ? "the form is pre-named for the requested +*right card" : "the served form carries a different name than the requested +*right card",
          formShape: servedShape,
        });

        // 4. The storage legs. A +right plus card exists in the database only
        // as the row joining the set card to the member card, so the response
        // code proves nothing on its own.
        if (servedForm === null || !servedShape.hasForm) {
          record(capabilityChecks.C20[3], false, {
            card: cardName, rightName, note: "no create form was served on the wanted card's page, so nothing could be submitted",
            stored: before ?? null, rightSetStored: rightSet !== undefined,
          });
          record(capabilityChecks.C20[4], false, { card: cardName, note: "not reached: nothing was created, so no junction row can exist", stored: before ?? null });
          record(capabilityChecks.C20[5], false, { card: cardName, note: "not reached: nothing was created, so a fresh read cannot render it", stored: before ?? null });
          return;
        }
        const via = addBox !== null && addBox !== undefined ? "the wanted card page's add_box affordance" : "the create form the wanted card's page served";
        const action = new URL(servedShape.action, stack.origin);
        const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30000 })
          .then(response => ({ response }), error => ({ error }));
        await servedForm.locator(".create-submit-button").first().click({ force: true, timeout: 15000 }).catch(() => undefined);
        const observed = await pending;
        let postStatus = null;
        if (observed.error === undefined) { await observed.response.finished(); postStatus = observed.response.status(); }
        await page.waitForTimeout(1000);

        const after = fixtureCard(database(), rightName);
        const anyTrash = database().prepare("SELECT id,name,trash,type_id,left_id,right_id FROM cards WHERE name=?").all(rightName);
        const familyRows = database().prepare("SELECT id,name,trash,left_id,right_id,substr(coalesce(db_content,''),1,40) AS content_head FROM cards WHERE name LIKE ?").all("%" + s + "%");
        record(capabilityChecks.C20[3],
          postStatus !== null && postStatus < 400 && after !== undefined,
          {
            card: cardName, rightName, submittedThrough: via, submittedName: servedShape.nameValue, postStatus,
            postWaitError: observed.error === undefined ? null : String(observed.error?.message ?? observed.error).slice(0, 140),
            stored: after ?? null, anyTrashRows: anyTrash, familyRows,
            rightSet: rightSet === undefined ? null : { id: rightSet.id, name: rightSet.name, type_id: rightSet.type_id },
            note: after === undefined ? "the create answered without storing a row under the requested name" : "a row exists under the requested name",
            raw: captureEvidence(await page.content(), { check: "c20-plus-right-after-create", card: cardName }),
          });
        // 5. The set membership read from the junction ids, not from the name.
        const member = after === undefined ? null : database().prepare("SELECT id,name,type_id,left_id,right_id,trash FROM cards WHERE id=?").get(after.id);
        record(capabilityChecks.C20[4],
          member !== null && rightSet !== undefined && member.left_id === rightSet.id && member.right_id !== null,
          {
            card: cardName, rightName, member,
            rightSet: rightSet === undefined ? null : { id: rightSet.id, name: rightSet.name, left_id: rightSet.left_id, right_id: rightSet.right_id },
            joinsTheSet: rightSet !== undefined && member?.left_id === rightSet.id,
          });
        // 6. The user-visible outcome: a fresh read of the card page shows the
        // member the create was supposed to add, as a known card.
        const afterRead = await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
        const afterHtml = await page.content();
        const rendered = await page.evaluate(name => {
          const link = [...document.querySelectorAll("a")].find(a => decodeURIComponent(a.getAttribute("href") ?? "") === name || decodeURIComponent(a.getAttribute("href") ?? "").includes(name));
          return link === undefined ? null : { href: link.getAttribute("href"), classes: link.getAttribute("class"), text: (link.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40) };
        }, rightName);
        record(capabilityChecks.C20[5],
          afterRead.status() < 400 && rendered !== null && (rendered.classes ?? "").includes("known-card"),
          {
            card: cardName, rightName, status: afterRead.status(), rendered,
            note: rendered === null ? "the created member does not appear on the card page" : "the nest now resolves to a card link",
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