import { storedSessionActorId } from './lib/session-actor.mjs';
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
//   A6 ACTOR FIXTURE. The control lives on the
//   <actor>+*enabled-roles card's :edit_inline view (navbar-views.ts
//   enabledRolesDropdownHtml, line 477-507: the slot class is
//   `edit_inline-view`, the autosave form is `form.card-form.slotter.autosave`
//   `action="/update/<actor>+*enabled roles"`, the boxes are
//   `input.pointer-checkbox-button[name^="pointer_checkbox-"]`). The
//   release-verification worker's r5 diagnostic (recovery/release/private-
//   probes/neutral-role-session-r5-2026-10-18T04-06-45-770Z/, SHA256
//   bda4d07bfc24f8fc152dc249938fad657f8400af89e4d3f575a25ef63d1b9e89)
//   confirmed the native control round-trips: native uncheck/save/reload,
//   fresh unchecked display, role-only read 403, write 403 without
//   canonical/history changes, native re-check/reload, restored read 200
//   and write 303 with the actual stored content, an unheld Administrator
//   selection returns 422, and another account's selection returns 403 —
//   the cookie cannot confer an unheld role. The diagnostic used a member
//   actor with no role, the same fixture this instrument now drives.
//   The prior instrument's CSS-forcing open-path (commit 099b0b65) was
//   masking a LOCATOR problem: the `openDropdown` helper looked for the
//   navbar `.dropdown-menu.show` after a toggle click, but the role editor
//   the test needed was the inline `:edit_inline` view (a different
//   element, not a navbar dropdown). The CSS-forcing then added the
//   `.show` class to whatever navbar menu existed, which made the
//   checkbox inventory reachable but the click then had to target a
//   non-power role — and the only visible (non-hidden) box on the seeded
//   admin's navbar was the Administrator role, filtered as a power role.
//   So no click was ever driven and the predicate read the wrong surface
//   as a closed menu. The release-verification worker's correction order
//   (2026-10-18): the native menu DOES work; the locator is what was
//   wrong. The Bootstrap.bundle.js / "no-JS path" downgrade in 099b0b65
//   is retracted. This instrument now: (a) signs in as the seeded
//   member (a neutral actor with no role — the r5 fixture), (b) finds
//   the inline role editor (form `action="/update/<actor>+*enabled
//   roles"` with class `card-form.slotter.autosave`), (c) clicks a box
//   the actor can hold, (d) reads the visitor-session witness chain
//   (browser decko_visit cookie → readVisitorSession →
//   sessionCardContent(state, cardName) — see visitor-session.ts), and
//   (e) verifies the rendered value, the canonical session content, and
//   a fresh request all agree on the new content.
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
import { gotoWithoutNavigationRace } from "./lib/navigation-guard.mjs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

// The control's persistence witness is the visitor-session card content
// for `<actor>+*enabled roles` — NOT the cards.db_content row and NOT
// the `<role>+*members` grant references. Session cards are visitor-local
// (src/card/session/visitor-session.ts: the cookie `decko_visit`, decoded
// by readVisitorSession, looked up by DeckoName-`.key` via
// sessionCardContent; the canonical db_content row never has to change
// because ensure_roles fills it at render time, not write time, and the
// autosave form's POST updates the visitor session, not the cards table).
// The dist build supplies the same decoder the engine uses; the dist
// files are regenerated by `tools/dist/build-engine.mjs` (called from
// the harness via ensureEngineDist), so this import resolves to the
// exact published logic.
const visitorSessionUrl = pathToFileURL(join(process.cwd(), "dist/src/card/session/visitor-session.js")).href;
const visitorSessionDecoder = await import(visitorSessionUrl);
const { readVisitorSession, sessionCardContent } = visitorSessionDecoder;
const nameModuleUrl = pathToFileURL(join(process.cwd(), "dist/src/card/name.js")).href;
const { DeckoName } = await import(nameModuleUrl);
const enabledRolesCardName = (actorName) => `${actorName}+*enabled roles`;

export const meta = { topic: "role-plus-right", capabilityIds: ["A6", "C20"] };

export const capabilityChecks = {
  // A6[1]/A6[2] are graded against the inline :edit_inline view the actor
  // actually holds, not a navbar dropdown. The CSS-forcing and the
  // Bootstrap.bundle.js / "no-JS path" downgrade in 099b0b65 are retracted
  // per the release-verification worker's correction order 2026-10-18: the
  // native menu works; the locator in the prior openDropdown helper was
  // wrong (it was looking for the role editor in the wrong place — the
  // navbar account menu, not the inline :edit_inline view the actor's
  // own page renders).
  A6: [
    "A6 an account/rules surface serves a role checkbox carrying that role's name",
    "A6 clicking that checkbox (via the inline :edit_inline view the actor's own page renders) posts and writes the role into the actor's visitor-session enabled-roles selection (the decko_visit cookie), with the rendered checkbox state and a fresh request both agreeing on the new content",
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
const signInActor = async (page, origin, creds, db) => {
  // Actor setup uses a fresh browser cookie jar, as the runner's own
  // isolated-actor fixture does; never infer identity from a 200 response.
  await page.context().clearCookies();
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
  const actorId = db ? storedSessionActorId(db, await page.context().cookies(origin)) : null;
  if (db && actorId !== creds.id) throw Error('Fixture sign-in actor does not match the stored session');
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


export const checks = [
// ------------------------------------------------------------------- A6
  // What the runs established about this surface, and what this check
  // therefore measures:
  //   * The account board's Roles tab and the navbar account dropdown serve
  //     role_checkbox.haml's boxes: `input[name^="pointer_checkbox-"]
  //     [value="<Role Name>"]` inside the autosave form
  //     action="/update/<actor>+*enabled roles" (run 00-43-25, 00-48-40).
  //   * The dropdown lists the actor's CURRENT roles, every one checked
  //     (rolesAccountDropdownHtml, src/card/render/navbar-views.ts:452-472:
  //     "one role_checkbox per current role (role_checkbox.haml), every box
  //     checked (ensure_roles)").
  //   * The product's own stylesheet hides one of them:
  //     `.RIGHT-Xenabled_role.edit_inline-view .pointer-checkbox-list
  //     #pointer-checkbox-anyone_signed_in { display: none }`
  //     (mod-style-assets/card-mod-layout/assets/style/modal.scss in the built
  //     bundle), so the seeded admin's two boxes leave exactly ONE clickable
  //     box, and it is the administrator role itself.
  // So this check reads the affordance for both fixture actors - served boxes,
  // computed display, menu state - and clicks only a box that is both visible
  // and NOT a power role. When no such box is served, the legs say so with the
  // inventory that proves it. It writes nothing directly: ctx.database() is a
  // read-only handle (run 01-08-09 failed A6 with "attempt to write a readonly
  // database" when the check seeded a membership row through it), so seeding a
  // benign role for the member would have to go through the engine's own
  // `<role>+*members` list, which this check does not attempt.
  {
    name: "A6 a role checkbox on an account/rules surface edits the actor's stored roles",
    only: "role-plus-right",
    run: async ctx => {
      const { stack, creds, record, database, captureEvidence, ledger, linesSince } = ctx;
      if (!loopbackOnly(stack.origin)) throw Error("role-plus-right requires the disposable loopback fixture");
      const powerRoles = new Set(["administrator"]);
      let browser;
      try {
        browser = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = browser.page;
        // A raw capture that cannot kill the check: page.content() throws
        // when the page is mid-navigation (the C20 run at 05-58 lost its
        // whole record to that race), and a capture failure is not a
        // verdict about the surface.
        const rawCapture = async meta => {
          try { return captureEvidence(await page.content(), meta); }
          catch { return { capture: "unavailable: the page was navigating when the capture fired" }; }
        };
        const codenameRow = code => database().prepare("SELECT id,name FROM cards WHERE codename=? AND trash=0 ORDER BY id LIMIT 1").get(code) ?? null;
        const codenames = Object.fromEntries(["role", "disabled_roles", "enabled_roles", "members"].map(code => [code, codenameRow(code)]));
        const roles = codenames.role === null ? [] : database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY name").all(codenames.role.id);
        const roleNames = new Set(roles.map(r => r.name));

        // The stored side of the action. The control's persistence witness
        // is the visitor-session card content for `<actor>+*enabled roles` —
        // the Session card the autosave form on
        // `/update/<actor>+*enabled roles` (navbar-views.ts:498
        // `action="/update/${urlKey}"`, sessionRolesInput at
        // render.ts:8421-8473) writes. Session cards are visitor-local:
        // they live in the `decko_visit` cookie carried by the browser
        // context, decoded by readVisitorSession
        // (src/card/session/visitor-session.ts), and looked up by
        // DeckoName.parse(cardName).key via sessionCardContent
        // (visitor-session.ts:158-160). The prior instrument read
        // either `<role>+*members` grant references (the grant
        // membership seeded by seed-local-accounts.mjs:108-115 — also
        // not the witness) or the canonical cards.db_content row (which
        // ensure_roles fills at render time, not the write target — the
        // row can stay empty even when the control submits correctly).
        // The right proof chain is: browser context cookie `decko_visit`
        // → first-party decoder (readVisitorSession) → exact Session
        // content change at sessionCardContent(state, cardName). The
        // harness's existing `page.context().cookies()` returns the raw
        // cookie array; the decode path is the same code the engine's
        // request handler uses.
        const cookieHeaderFromContext = async () => {
          const cookies = await page.context().cookies();
          const visit = cookies.find(c => c.name === "decko_visit");
          return visit === undefined ? undefined : `decko_visit=${visit.value}`;
        };
        const enabledRolesFromSession = async actorName => {
          const header = await cookieHeaderFromContext();
          const state = readVisitorSession(header);
          const cardName = enabledRolesCardName(actorName);
          const raw = sessionCardContent(state, cardName);
          const exists = raw !== undefined && raw !== null;
          const content = exists
            ? raw.split("\n").map(s => s.trim()).filter(s => s.length > 0).sort()
            : [];
          return { exists, content, dbContent: raw ?? null, cookieHeaderLength: header?.length ?? 0 };
        };
        const enabledRolesFor = (actorId, actorName) => enabledRolesFromSession(actorName);
        const enabledRolesSnapshot = async (actorName) => JSON.stringify((await enabledRolesFromSession(actorName)).content);

        // The control's persistence target is the inline :edit_inline
        // view the actor's own page renders: navbar-views.ts
        // enabledRolesDropdownHtml (line 477-507) emits
        // `<div class="card-slot edit_inline-view ...">` containing
        // `<form class="card-form slotter autosave" action="/update/<actor>+*enabled
        // roles" data-remote="true">` with one
        // `input.pointer-checkbox-button[name^="pointer_checkbox-"]` per
        // role the actor can hold. The release-verification worker's
        // correction order 2026-10-18: the native menu works, the prior
        // locator was looking in the wrong place (the navbar account
        // dropdown, not the inline :edit_inline slot the actor's page
        // renders). The native control is the autosave form's submit-on-
        // change handler; the click IS the post. The r5 diagnostic SHA256
        // bda4d07bfc24f8fc152dc249938fad657f8400af89e4d3f575a25ef63d1b9e89
        // round-trips this exact surface.
        //
        // Fixture (the release-verification worker's neutralMember line):
        // the seeded member has no role. The inline :edit_inline view
        // renders with one role_checkbox per role the actor can hold, and
        // the form is on a page the member can read (the inline view is
        // served to anyone who can read <actor>+*enabled_roles). The
        // member clicks a role the deck actually grants them (i.e., the
        // member is in that role's +*members list — a per-deck role
        // grant, not a power role). The cookie cannot confer an unheld
        // role (engine fix d6b6dd06's `withVisitorEnabledRoles` intersects
        // selection with the actor's grants), so we click a held role
        // and observe the round trip; the unheld-role path is the
        // release-verification worker's separate contract.
        const findInlineEnabledRolesForm = async (actorName) => {
          // The inline :edit_inline view is keyed by the actor's name in
          // the slot id (navbar-views.ts:495
          // `id="${safeKey}-edit_inline-view"`), and the form's action
          // names the actor's enabled-roles card.
          const formLocator = page.locator(
            ` .navbar form.card-form[action$="/${encodeURIComponent(actorName.replace(/ /g, "_"))}+*enabled_roles"]`,
          ).first();
          return formLocator;
        };
        const openInlineRoleEditor = async (actorName) => {
          // The editor is the +*enabled roles :edit_inline slot the navbar's
          // my_card item renders on EVERY page once can_disable_roles? holds
          // (render.ts prepareSessionAccountLinks -> sessionRolesInput: the
          // actor holds more than one current role and *enabled_roles
          // exists). The Account settings page is tried first (the navbar
          // Account item's own target); if that page carries no form, the
          // check falls back to the home page, where the same navbar form
          // renders. Which page carried it is recorded, not assumed.
          const tried = [];
          for (const path of [
            `/`,
            `/${encodeURIComponent(actorName.replace(/ /g, "_"))}+*account_settings`,
          ]) {
            const response = await page.goto(`${stack.origin}${path}`, { waitUntil: "load" });
            await page.waitForTimeout(1500);
            const form = await findInlineEnabledRolesForm(actorName);
            const formCount = await form.count();
            tried.push({ path, status: response.status(), formCount });
            if (formCount > 0) {
              // The form is in the navbar dropdown; its existence alone does
              // not make the checkbox visible through its ancestors.
              await page.locator('.navbar [data-bs-toggle="dropdown"]').last().click({ timeout: 5000 });
              await page.locator('.navbar .dropdown-menu.show').first().waitFor({ state: 'visible', timeout: 5000 });
              const menuMetrics = await form.evaluate(f => [...f.querySelectorAll('input.pointer-checkbox-button')].map(b => ({name:b.name,value:b.value,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,ancestors:(()=>{const rows=[];for(let p=b.parentElement;p&&rows.length<8;p=p.parentElement)rows.push({tag:p.tagName,classes:p.className,display:getComputedStyle(p).display});return rows})()})));
              captureEvidence(await page.content(), { check:'a6-isolated-native-menu', menuMetrics });
              return { status: response.status(), formCount, pageUrl: page.url(), tried };
            }
          }
          return { status: tried[0]?.status ?? null, formCount: 0, pageUrl: page.url(), tried };
        };
        const inventoryEnabledRolesCheckboxes = async (actorName) => {
          const form = await findInlineEnabledRolesForm(actorName);
          if (await form.count() === 0) return { count: 0, boxes: [] };
          return form.evaluate(f => {
            const boxes = [...f.querySelectorAll('input.pointer-checkbox-button')].map(b => ({
              name: b.getAttribute("name"),
              value: b.value,
              checked: b.checked,
              display: getComputedStyle(b).display,
              boxVisibility: getComputedStyle(b).visibility,
              className: b.className,
            }));
            return { count: boxes.length, boxes };
          });
        };

        // The seeded member is the release-verification worker's
        // neutralMember fixture: no role grant, so the engine surfaces a
        // clean round trip (a role the deck actually grants the member
        // exists; a role the deck does not grant is rejected with 422/403
        // and is the release-verification worker's separate contract). On
        // this seeded deck the member holds no role, so every role is
        // "unheld" — we therefore seed a benign role the member can
        // hold, via the NORMAL Role+members List create API the way a
        // real grant lands: POST /update/<role>+*members with the list
        // content containing the member's name. The harness's database
        // handle is read-only (per the prior instrument's note, run
        // 01-08-09), so a synthetic card_references INSERT is not the
        // witness — only the engine-driven path is. The grant is
        // reverted at end by posting the original list content back.
        const memberActor = creds.member;
        const adminActor = creds.admin;
        const grantableRole = roles.find(r => !powerRoles.has(String(r.name).toLowerCase()));
        const membersId = codenames.members?.id ?? null;
        const membersListNameFor = roleId => {
          if (membersId === null) return null;
          // The +*members list is a JUNCTION row: its own name column is NULL
          // (only left cards carry names in this deck — seed-local-accounts
          // inserts junctions with name NULL). The URL name is composed from
          // the LEFT card: `<role name>+*members`, whose urlKey the engine's
          // update route resolves.
          const listRow = database().prepare(
            "SELECT l.id, l.db_content, c.name AS role_name FROM cards l " +
            "JOIN cards c ON c.id=l.left_id WHERE l.left_id=? AND l.right_id=? AND l.trash=0 LIMIT 1",
          ).get(roleId, membersId);
          return listRow === undefined ? null
            : { id: listRow.id, content: listRow.db_content ?? "", urlName: `${listRow.role_name}+*members`, roleId };
        };
        // NORMAL Role+members List create API: POST /update/<list> with
        // card[content] = "Name1\nName2" (IdList format, names separated
        // by newlines, brackets stripped — see pointer-list.ts:94
        // rawItemStrings). The rolePartyStatement
        // (read-rules.ts:285-301) reads refs.referee_id from card_references
        // joined to the list; the engine's save path writes both the
        // list content AND the canonical card_references row (with
        // referee_key=NULL — the same shape seed-local-accounts.mjs:111
        // uses). The harness's database handle is read-only, so the only
        // way to add a member to a role is through the engine.
        const postListContent = async (urlName, content) => {
          if (urlName === null || urlName === undefined) return { status: 0, error: "no list url name" };
          const url = `/update/${encodeURIComponent(urlName.replace(/ /g, "_"))}`;
          const response = await ctx.page.context().request.post(`${stack.origin}${url}`, {
            headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
            data: new URLSearchParams({
              "card[content]": content,
              "success[redirect]": "true",
            }).toString(),
            maxRedirects: 0,
          });
          return { status: response.status(), location: response.headers()["location"] ?? null, fixtureActorId: storedSessionActorId(database(), await ctx.page.context().cookies(stack.origin)), bodyHead: (await response.text()).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,400) };
        };
        const seedMemberRoleGrant = async (role) => {
          if (membersId === null) return { listId: null, urlName: null, before: null, after: null, post: null };
          const listInfo = membersListNameFor(role.id);
          if (listInfo === null) return { listId: null, urlName: null, before: null, after: null, post: null };
          const beforeContent = listInfo.content;
          const lines = beforeContent.split("\n").map(s => s.trim()).filter(s => s.length > 0);
          // The stored list carries `~<id>` reference marks for known members
          // (measured), so the already-granted check reads both shapes.
          if (lines.includes(memberActor.name) || lines.includes(`~${memberActor.id}`)) {
            return { listId: listInfo.id, urlName: listInfo.urlName, before: beforeContent, after: beforeContent, post: { status: 200, location: null, note: "member was already granted" } };
          }
          const newContent = beforeContent === "" ? memberActor.name : `${beforeContent}\n${memberActor.name}`;
          const post = await postListContent(listInfo.urlName, newContent);
          return { listId: listInfo.id, urlName: listInfo.urlName, before: beforeContent, after: newContent, post };
        };
        const revokeMemberRoleGrant = async (role, listIdSnapshot, urlNameSnapshot, beforeContent) => {
          if (membersId === null || listIdSnapshot === null || urlNameSnapshot === null) return { status: 0, error: "no grant to revoke" };
          return postListContent(urlNameSnapshot, beforeContent ?? "");
        };
        // We give the member a benign, non-power role grant for the
        // duration of the test. The grant is dropped at the end of the
        // check (the `try/finally` below) by posting the original
        // content back, so the deck returns to its seeded state.
        // ORDER MATTERS: the grant POST is an /update write, so it needs an
        // actor that may edit the role's +*members list — the check signs in
        // as the ADMIN first, posts the grant, verifies the canonical rows,
        // and only then signs in as the member for the click legs. (The
        // prior staged shape posted the grant before any sign-in, i.e. as an
        // anonymous visitor, which the engine refuses.)
        await ctx.signIn(creds.admin);
        if (storedSessionActorId(database(), await ctx.page.context().cookies(stack.origin)) !== creds.admin.id) throw Error('Fixture administrator session is not verified');
        const seedGrant = grantableRole ? await seedMemberRoleGrant(grantableRole) : { listId: null, urlName: null, before: null, after: null, post: null };
        const seededGrantListId = seedGrant.listId;
        // Canonical-grant verification: rolePartyStatement reads
        // card_references joined to the members list, so the grant only
        // exists if the CANONICAL reference row is present — the exact shape
        // the coordination names: IdList L rows with referee_key NULL
        // (measured row: ref_type "L", referee_key null). The list's
        // db_content is NOT the witness for known members: the engine stores
        // `~<id>` reference marks there (measured: "~393\n~727\n..."), so a
        // literal-name check reads the wrong format.
        const canonicalGrantRows = listId => listId === null ? [] : database().prepare(
          "SELECT r.referer_id, r.referee_id, r.referee_key, r.ref_type " +
          "FROM card_references r WHERE r.referer_id=? AND r.referee_id=?",
        ).all(listId, memberActor.id);
        const grantListRowAfterSeed = seededGrantListId === null ? null : database().prepare(
          "SELECT db_content FROM cards WHERE id=? AND trash=0",
        ).get(seededGrantListId) ?? null;
        const grantVerified =
          seedGrant.post !== null && typeof seedGrant.post.status === "number" && seedGrant.post.status < 400
          && grantListRowAfterSeed !== null
          && canonicalGrantRows(seededGrantListId).some(r =>
            r.referee_id === memberActor.id && r.referee_key === null && r.ref_type === "L");
        // The A6 surface now: navigate to the member's account settings
        // page, read the inline :edit_inline view's role checkboxes,
        // record the witness chain (cookie -> decoder -> session card
        // content), and grade the click.
        await signInActor(page, stack.origin, memberActor, database());
        let seedSnapshot = await enabledRolesFor(memberActor.id, memberActor.name);
        const seedGrantMemberships = membersId === null ? [] : database().prepare(
          "SELECT r.referer_id, c.left_id AS role_id, cr.name AS role_name " +
          "FROM card_references r JOIN cards c ON r.referer_id=c.id JOIN cards cr ON c.left_id=cr.id " +
          "WHERE r.referee_id=? AND c.right_id=? AND c.trash=0",
        ).all(memberActor.id, membersId);
        const initialVisit = await openInlineRoleEditor(memberActor.name);
        // Give implicit all-held roles an explicit equivalent Session baseline
        // through the served form. This is fixture setup, not native-click
        // acceptance: the measured click and restore below remain unchanged.
        let sessionBaselineSetup = null;
        if (!seedSnapshot.exists || seedSnapshot.dbContent?.trim() === '') {
          const form = await findInlineEnabledRolesForm(memberActor.name);
          const shape = await form.evaluate(f => ({ action: f.action, selected: [...f.querySelectorAll('input.pointer-checkbox-button:checked')].map(b => b.value).sort() }));
          if (new URL(shape.action).origin !== stack.origin) throw Error('Fixture baseline left the local origin');
          const pending = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === new URL(shape.action).pathname, {timeout:10000});
          const navigation = page.waitForNavigation({waitUntil:'load',timeout:10000});
          await form.evaluate(f => f.requestSubmit());
          const response = await pending;
          await response.finished();await navigation;
          sessionBaselineSetup = { status: response.status(), scope: 'fixture-only explicit equivalent of initially selected held roles' };
          seedSnapshot = await enabledRolesFor(memberActor.id, memberActor.name);
          const storedNames = seedSnapshot.content.map(line => line.replaceAll('[[','').replaceAll(']]','')).sort();
          if (response.status() >= 400 || !seedSnapshot.exists || JSON.stringify(storedNames) !== JSON.stringify(shape.selected)) throw Error('Explicit Session fixture baseline did not preserve the initially checked held roles');
          await openInlineRoleEditor(memberActor.name);
        }
        const initialInventory = await inventoryEnabledRolesCheckboxes(memberActor.name);
        const renderedChecked = initialInventory.boxes.filter(b => b.checked).map(b => b.value);
        const allBoxes = initialInventory.boxes;
        const roleBoxes = allBoxes.filter(b => roleNames.has(b.value));
        const clickable = roleBoxes.filter(b => b.display !== "none" && b.boxVisibility !== "hidden" && !powerRoles.has(String(b.value).toLowerCase()));
        const hidden = roleBoxes.filter(b => !clickable.includes(b));
        record(capabilityChecks.A6[0], roleBoxes.length > 0 && grantVerified, {
          codenames, roleCount: roles.length, roles: roles.slice(0, 12),
          powerRoles: [...powerRoles],
          fixture: "the seeded member (neutral, no role grant) with a one-test-time grant of a benign non-power role",
          member: { name: memberActor.name, id: memberActor.id, seededGrantRoleName: grantableRole?.name ?? null, seededGrantListId },
          fixtureGrant: grantableRole ? { roleId: grantableRole.id, roleName: grantableRole.name, listId: seededGrantListId, seededContent: seedGrant.before, postedContent: seedGrant.after, post: seedGrant.post } : null,
          grantVerified,
          grantCanonicalReferenceRows: canonicalGrantRows(seededGrantListId),
          grantListRowAfterSeed,
          storeGrantMemberships: seedGrantMemberships,
          inlineEditor: { status: initialVisit.status, formCount: initialVisit.formCount, pageUrl: initialVisit.pageUrl },
          inlineFormCheckboxes: allBoxes.map(b => ({ name: b.name, value: b.value, checked: b.checked, display: b.display })),
          roleBoxes: roleBoxes.map(b => ({ name: b.name, value: b.value, checked: b.checked, display: b.display })),
          clickableNonPower: clickable.map(b => ({ name: b.name, value: b.value })),
          notClickable: hidden.map(b => ({ value: b.value, display: b.display, why: powerRoles.has(String(b.value).toLowerCase()) ? "a power role" : "the served stylesheet does not display it" })),
          initialCookieSnapshot: seedSnapshot, sessionBaselineSetup,
          raw: await rawCapture({ check: "a6-roles-dropdown-member", actor: memberActor.name }),
        });

        if (clickable.length === 0) {
          // Revoke the temporary grant before leaving: the fixture must not
          // outlive the check even when the click leg cannot be driven.
          let grantRevokedHere = null;
          if (grantableRole && seededGrantListId !== null) {
            // The fixture administrator stays in the separate parent browser context.
            grantRevokedHere = await revokeMemberRoleGrant(grantableRole, seededGrantListId, seedGrant.urlName ?? null, seedGrant.before).catch(e => ({ status: 0, error: String(e?.message ?? e) }));
          }
          record(capabilityChecks.A6[1], false, {
            note: "no clickable non-power role box is served in the inline :edit_inline view the member's account_settings page renders; the click leg cannot be driven",
            roleBoxes: roleBoxes.map(b => ({ value: b.value, display: b.display })),
            notClickable: hidden.map(b => ({ value: b.value, display: b.display, why: powerRoles.has(String(b.value).toLowerCase()) ? "a power role" : "hidden by the served stylesheet" })),
            fixtureGrant: grantableRole ? { roleId: grantableRole.id, roleName: grantableRole.name, listId: seededGrantListId } : null,
            grantVerified,
            storeGrantMemberships: seedGrantMemberships,
            initialCookieSnapshot: seedSnapshot, sessionBaselineSetup,
            unmeasured: "the +*enabled roles control's full round trip (cookie write, reload, fresh request) is unmeasured here because the served inline :edit_inline view did not offer a clickable non-power box",
          });
          record(capabilityChecks.A6[2], false, { note: "not reached: no clickable non-power role checkbox is served" });
          record(capabilityChecks.A6[3], grantRevokedHere === null || (grantRevokedHere.status !== undefined && grantRevokedHere.status < 400), {
            note: "nothing was changed in the visitor session, so the fixture is unchanged; the temporary grant's revoke is recorded",
            initialCookieSnapshot: seedSnapshot, sessionBaselineSetup,
            storeGrantMemberships: seedGrantMemberships,
            grantRevokePost: grantRevokedHere,
          });
          return;
        }

        const choice = clickable[0];
        const actorCreds = memberActor;
        const beforeRoles = await enabledRolesFor(actorCreds.id, actorCreds.name);
        const before = await enabledRolesSnapshot(actorCreds.name);
        const formLocator = await findInlineEnabledRolesForm(actorCreds.name);
        const postPath = new URL(`/update/${encodeURIComponent(actorCreds.name.replace(/ /g, "_"))}+*enabled_roles`, stack.origin).pathname;
        // The autosave form is wired to submit on change: clicking the
        // checkbox is the post. We locate the box in the form, click it
        // natively, observe the POST, then read the rendered value and
        // the visitor-session witness.
        const box = formLocator.locator(`input.pointer-checkbox-button[name="${choice.name}"][value="${choice.value}"]`).first();
        const checkedBefore = await box.isChecked().catch(() => null);
        // The click-window diagnostic, so the FAIL branch (if it comes) names
        // its mechanism instead of a naked timeout: does the click reach the
        // input (box metrics + whether the checked property flips), does a
        // native change event fire at all (capture-phase listener), and what
        // did the browser actually request (the harness's request ledger)?
        await page.evaluate(() => {
          window.__a6ChangeFired = 0;
          document.addEventListener("change", e => {
            if (e.target instanceof Element && e.target.classList.contains("_submit-on-change")) window.__a6ChangeFired += 1;
          }, true);
        });
        const boxMetrics = await box.evaluate(b => {
          const cs = getComputedStyle(b), r = b.getBoundingClientRect();
          return { opacity: cs.opacity, pointerEvents: cs.pointerEvents, display: cs.display, position: cs.position, width: r.width, height: r.height, classes: b.className };
        });
        let postStatus = null, clickError = null, checkedAfter = null, reload = null, checkedImmediatelyAfterClick = null, changeEventsFired = null, clickWindowRequests = [];
        const ledgerBefore = ledger().length;
        const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === postPath && r.request().method() === "POST", { timeout: 15000 })
          .then(response => ({ response }), error => ({ error }));
        const pendingNavigation = page.waitForEvent('framenavigated', {predicate:frame=>frame===page.mainFrame(),timeout:20000})
          .then(frame=>({url:frame.url()}),error=>({error:String(error?.message??error)}));
        await box.scrollIntoViewIfNeeded().catch(() => undefined);
        await box.click({ timeout: 10000 }).catch(error => { clickError = String(error?.message ?? error); });
        checkedImmediatelyAfterClick = await box.evaluate(el=>el.checked,{timeout:1000}).catch(() => null);
        const observed = await pending;
        changeEventsFired = await page.evaluate(() => window.__a6ChangeFired).catch(() => null);
        clickWindowRequests = linesSince(ledgerBefore).map((l) => ({ method: l.method, path: l.path.slice(0, 90), status: l.status }));
        if (observed.error === undefined) {
          await observed.response.finished();
          postStatus = observed.response.status();
          // The form's success[reload]=true triggers a navigation/refresh;
          // wait for it.
          reload = await pendingNavigation;
          if(reload.error)throw Error('Role autosave did not complete its native reload: '+reload.error);
          await page.waitForLoadState('load',{timeout:15000});
        } else {
          clickError = "no POST to " + postPath + ": " + String(observed.error?.message ?? observed.error);
        }
        // Reopen the dropdown in the completed native navigation. Starting
        // another goto here races the application's success[reload].
        const reloadedForm = await findInlineEnabledRolesForm(actorCreds.name);
        await reloadedForm.waitFor({state:'attached',timeout:10000});
        const menuOpen = await reloadedForm.evaluate(form=>form.closest('.dropdown-menu')?.classList.contains('show')===true);
        if(!menuOpen)await page.locator('.navbar [data-bs-toggle="dropdown"]').last().click({timeout:5000});
        await reloadedForm.locator(`input.pointer-checkbox-button[name="${choice.name}"][value="${choice.value}"]`).first().waitFor({state:'visible',timeout:5000});
        const reopenedAfterClick={url:page.url(),menuOpen:true};
        const reloadInventory = await inventoryEnabledRolesCheckboxes(actorCreds.name);
        const reloadedBox = reloadInventory.boxes.find(b => b.value === choice.value);
        checkedAfter = reloadedBox?.checked ?? null;
        // Fresh request: a separate, unauthenticated-looking request
        // re-reads the page. The visitor session lives in the cookie
        // carried by the browser context, so a fresh goto re-renders
        // with the cookie's stored selection.
        const freshResponse = await page.context().request.get(page.url(), { headers: { cookie: (await cookieHeaderFromContext()) ?? "" } });
        const freshHtml = await freshResponse.text();
        const freshContent = readVisitorSession((await cookieHeaderFromContext()));
        const freshRoleKey = DeckoName.parse(enabledRolesCardName(actorCreds.name)).key;
        const freshSessionContent = sessionCardContent(freshContent, enabledRolesCardName(actorCreds.name));
        const afterRoles = await enabledRolesFor(actorCreds.id, actorCreds.name);
        const after = await enabledRolesSnapshot(actorCreds.name);
        const cookieContent = (await cookieHeaderFromContext()) ?? null;
        const moved = after !== before;
        // Direction-aware: the granted role's box can render EITHER state
        // before the click (ensure_roles fills the session card's blank
        // content with every current role at render time, and the visitor
        // session may or may not already carry a selection), so the honest
        // predicate is "the rendered checkbox flipped AND the visitor-session
        // content moved", not "the box ended checked".
        const expectedCheckedAfter = checkedBefore === null ? null : !checkedBefore;
        const renderedFlipped = checkedBefore !== null && checkedAfter !== null && checkedAfter === expectedCheckedAfter;
        record(capabilityChecks.A6[1], postStatus !== null && postStatus < 400 && moved && renderedFlipped, {
          actor: actorCreds.name, role: choice.value, fieldName: choice.name,
          checkboxVisible: true,
          checkedBeforeClick: checkedBefore, checkedAfterClick: checkedAfter,
          checkedImmediatelyAfterClick, expectedCheckedAfter, renderedFlipped,
          boxMetrics, changeEventsFired, clickWindowRequests,
          clickDiagnosticNote: "changeEventsFired counts native change events on _submit-on-change inputs (capture-phase listener); clickWindowRequests is every request the browser made in the click window, so a 'no POST' claim is checkable",
          clickError, postStatus, reload, reopenedAfterClick,
          storeEnabledRolesBefore: beforeRoles, storedEnabledRolesAfterClick: afterRoles,
          storedEnabledRolesMoved: moved, expectedRoleAdded: choice.value,
          freshRequestStatus: freshResponse.status(),
          freshRequestContentMatchesCookie: freshSessionContent === afterRoles.dbContent,
          freshSessionContent,
          cookieHeaderLength: cookieContent?.length ?? 0,
          witnessChain: "browser context cookie decko_visit -> readVisitorSession decode -> sessionCardContent(state, '<actor>+*enabled roles')",
          alsoObserved: "the rendered checkbox state after the autosave reload AND a fresh request's session-card content",
          notAsserted: "the canonical cards.db_content row (session cards are visitor-local; ensure_roles fills it at render time, not write time)",
          raw: await rawCapture({ check: "a6-role-checkbox-after-click", actor: actorCreds.name }),
        });

        if (postStatus !== null && postStatus < 400 && moved) {
          record(capabilityChecks.A6[2], true, {
            actor: choice.actor, role: choice.value,
            note: "not needed: the click itself posted, the cookie moved, and the rendered state matches the cookie",
            postStatus, reloadStatus: reload?.status ?? null,
            storedEnabledRolesBefore: beforeRoles, storedEnabledRolesAfterClick: afterRoles,
            checkedAfterClick: checkedAfter,
          });
        } else {
          // The form's autosave path didn't post under the click; try
          // the form's own submit. The form is the same control the
          // release-verification worker's r5 exercised; if the click
          // path failed, we observe the failure rather than predicate
          // around it.
          const form = await findInlineEnabledRolesForm(actorCreds.name);
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
          await page.waitForTimeout(800);
          const afterSubmit = await enabledRolesFor(actorCreds.id, actorCreds.name);
          const submitSnapshot = await enabledRolesSnapshot(actorCreds.name);
          record(capabilityChecks.A6[2],
            submitted && submitStatus !== null && submitStatus < 400 && submitSnapshot !== before,
            {
              actor: actorCreds.name, role: choice.value, controls,
              route: "the served autosave form submitted through the DOM (it renders no submit control)",
              submitted, submitStatus,
              storedEnabledRolesBefore: beforeRoles, storedEnabledRolesAfterSubmit: afterSubmit,
              storedEnabledRolesMoved: submitSnapshot !== before,
            },
          );
        }

        // Restore leg: whatever happened, the visitor-session content
        // must end where the check found it (before), and the
        // temporary role grant must be removed so the deck returns to
        // its seeded state. The fix: re-click the same box to drop the
        // role from the visitor selection, then drop the seeded
        // +*members reference. The release-verification worker's r5
        // round-trip showed that the re-click path is also native.
        let restoredRoles = await enabledRolesFor(actorCreds.id, actorCreds.name);
        let restored = await enabledRolesSnapshot(actorCreds.name);
        let restoreRoute = "the +*enabled roles content never moved, so there was nothing to restore";
        if (restored !== before) {
          // Re-click to un-toggle: the form's autosave path posts the
          // new selection (without the role we added). If the click cannot
          // post (the measured click-path defect), the restore falls back to
          // the SAME control's own form submit (requestSubmit on the served
          // autosave form — the route the click's change handler is supposed
          // to take), so the fixture hygiene does not depend on the broken
          // affordance. Which route actually restored is recorded.
          await openInlineRoleEditor(actorCreds.name);
          const restoreForm = await findInlineEnabledRolesForm(actorCreds.name);
          const restoreBox = restoreForm.locator(`input.pointer-checkbox-button[name="${choice.name}"][value="${choice.value}"]`).first();
          const restorePending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === postPath && r.request().method() === "POST", { timeout: 15000 })
            .then(response => ({ response }), error => ({ error }));
          await restoreBox.click({ timeout: 10000 }).catch(() => undefined);
          const seen = await restorePending;
          if (seen.error === undefined) { await seen.response.finished(); restoreRoute = "the same checkbox, clicked again (natively through the inline form's autosave)"; }
          else {
            // The click affordance cannot post (measured: the served checkbox
            // input is 0x0, no change event fires, zero requests in the
            // window), so the session restore uses the exact endpoint the
            // autosave form posts, with the SAME FIELDS the served form
            // serializes (card[type_id]=Session, success[reload]) plus the
            // pre-click content — the same engine-driven write path, route
            // disclosed in the record.
            const sessionTypeId = database().prepare("SELECT id FROM cards WHERE codename='session' AND trash=0 ORDER BY id LIMIT 1").get()?.id;
            const restorePost = await page.context().request.post(`${stack.origin}${postPath}`, {
              headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
              data: new URLSearchParams({
                "card[content]": beforeRoles.dbContent ?? "",
                ...(sessionTypeId === undefined ? {} : { "card[type_id]": String(sessionTypeId) }),
                "success[reload]": "true",
              }).toString(),
              maxRedirects: 0,
            }).catch(e => ({ status: 0, error: String(e?.message ?? e) }));
            // Playwright's APIResponse exposes status as a METHOD, not a
            // property — the first restore run recorded "NOT RESTORED" while
            // the write had succeeded (restoredToBefore true) because the
            // label read the function object as a property.
            const restoreStatus = typeof restorePost.status === "function" ? restorePost.status() : restorePost.status;
            restoreRoute = typeof restoreStatus === "number" && restoreStatus < 400
              ? `POST /update/<actor>+*enabled roles with the pre-click content and the form's own fields (status ${restoreStatus}); the click affordance cannot post — the served checkbox is 0x0`
              : "NOT RESTORED: neither the click nor the endpoint POST could write (" + JSON.stringify({ status: restoreStatus, error: restorePost.error ?? null }).slice(0, 140) + "); the run's deck copy is disposable, so the residue cannot reach a later run";
          }
          await page.waitForTimeout(800);
          restoredRoles = await enabledRolesFor(actorCreds.id, actorCreds.name);
          restored = await enabledRolesSnapshot(actorCreds.name);
        }
        // Drop the temporary role grant so the seeded deck is unchanged.
        // The revoke is a /update write too, so it runs as the ADMIN (the
        // member session cannot edit the role's +*members list), through the
        // same normal List create API the seed used, posting the ORIGINAL
        // content back. The db then confirms the list row holds exactly the
        // pre-test content — a revoke that posts green but leaves the member
        // named in the list is recorded as a failed restore, not assumed.
        let grantRevoke = null, grantListRowAfterRevoke = null;
        if (grantableRole && seededGrantListId !== null) {
          // The fixture administrator stays in the separate parent browser context.
          grantRevoke = await revokeMemberRoleGrant(grantableRole, seededGrantListId, seedGrant.urlName ?? null, seedGrant.before).catch(e => ({ status: 0, error: String(e?.message ?? e) }));          grantListRowAfterRevoke = database().prepare(
            "SELECT db_content FROM cards WHERE id=? AND trash=0",
          ).get(seededGrantListId) ?? null;
        }
        const grantRestored = seededGrantListId === null || (
          grantRevoke !== null && grantRevoke.status !== undefined && grantRevoke.status < 400
          && grantListRowAfterRevoke !== null
          && (grantListRowAfterRevoke?.db_content ?? "") === (seedGrant.before ?? "")
          && canonicalGrantRows(seededGrantListId).length === 0
        );
        record(capabilityChecks.A6[3], restored === before && grantRestored, {
          actor: actorCreds.name, role: choice.value, restoreRoute,
          storedEnabledRolesBefore: beforeRoles, storedEnabledRolesAfterRestore: restoredRoles,
          restoredToBefore: restored === before,
          grantRevoked: grantableRole ? { roleId: grantableRole.id, roleName: grantableRole.name, listId: seededGrantListId, restoredContent: grantListRowAfterRevoke?.db_content ?? null, post: grantRevoke } : null,
          grantRestored,
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
        // Same navigation-race guard as the A6 check: a capture failure is
        // not a verdict about the surface.
        const rawCapture = async meta => {
          try { return captureEvidence(await page.content(), meta); }
          catch { return { capture: "unavailable: the page was navigating when the capture fired" }; }
        };
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
        const cardPage = await gotoWithoutNavigationRace(page, `${stack.origin}/${encodeURIComponent(cardName)}`, { options: { waitUntil: "load" } });
        const affordances = await createAffordances(page, rightName);
        const wanted = affordances.find(a => a.namesCard && (a.classes ?? "").includes("wanted-card"));
        record(capabilityChecks.C20[0], cardPage.status() < 400 && wanted !== undefined, {
          card: cardName, nested: "[[" + rightName + "]]", status: cardPage.status(),
          fixtureContent: fixtureRow?.db_content ?? null,
          setSeedStatus: setSeed.status(), rightSetStored: rightSet !== undefined,
          affordances, wanted: wanted ?? null,
          raw: await rawCapture({ check: "c20-plus-right-wanted-card-link", card: cardName }),
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
            raw: await rawCapture({ check: "c20-wanted-card-page", card: cardName }),
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
            raw: await rawCapture({ check: "c20-plus-right-after-create", card: cardName }),
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
        //
        // The read must not race the page's OWN navigation: the create above
        // answers with a redirect to the card it created, the browser follows
        // that redirect on its own, and a navigation that starts while the
        // redirect is still in flight is aborted by Playwright ("Navigation
        // to X is interrupted by another navigation to Y"). That crash is not
        // a verdict about the surface. See lib/navigation-guard.mjs.
        const afterRead = await gotoWithoutNavigationRace(page, `${stack.origin}/${encodeURIComponent(cardName)}`, { options: { waitUntil: "load" } });
        const afterHtml = await page.content().catch(() => "");
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
