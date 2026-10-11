// Signed-in rendering parity: the shapes a signed-in, non-admin actor sees
// that the anonymous corpus never exercised (recovery/parity-team/
// signed-in.md). Each case pins Ruby's bytes for the signed-in actor and the
// anonymous counterpart where both exist.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { DECKOBOT_CODENAME } from "../../../src/card/auth/actor.js";
import { enabledRolesDropdownHtml, fillUniqueIds, signedInAccountLinksInnerHtml } from "../../../src/card/render/navbar-views.js";

const normalizeSlotIds = (html: string): string =>
  html.replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');

describe("the createable gate of an unknown nest target (card-mod-format html/error.rb view :unknown)", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 3, name: "Cardtype", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 4, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedCard(s, { id: 5, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*read", codename: "read", typeId: 14 });
    await seedCard(s, { id: 12, name: "*create", codename: "create", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    // *all+*read -> Anyone; *all+*create -> Anyone Signed In
    await seedCard(s, { id: 30, leftId: 10, rightId: 11, dbContent: "[[Anyone]]" });
    await seedReference(s, 30, 4, "anyone");
    await seedCard(s, { id: 31, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 31, 5, "anyone_signed_in");
    await seedCard(s, { id: 50, name: "Member", typeId: 2 });
    await seedCard(s, { id: 60, name: "Host", typeId: 2, dbContent: "{{Missing Card|titled}}" });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
  });

  afterAll(() => {
    storage?.close?.();
  });

  it("renders the create link for an actor who may create the card", async () => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    engine.viewer = { signedIn: true, actorId: 50 };
    const html = normalizeSlotIds(await engine.render("Host", "core"));
    expect(html).toContain(
      '<a rel="nofollow" class="unknown-link slotter" href="/Missing_Card/new_in_modal" data-remote="true">' +
        '<i class="notranslate material-icons">add_box</i> <span class="card-title" title="Missing Card">Missing Card</span></a>',
    );
    expect(html).toContain('id="missing_card-unknown-view"');
  });

  it("renders nothing for an actor who may not create it", async () => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    const html = await engine.render("Host", "core");
    expect(html).not.toContain("unknown-link");
    expect(html).not.toContain("unknown-view");
  });
});

describe("unknown_link keeps a name its url key would lose (Card::Path#handle_unknown)", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 3, name: "Cardtype", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 4, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedCard(s, { id: 5, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*read", codename: "read", typeId: 14 });
    await seedCard(s, { id: 12, name: "*create", codename: "create", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 30, leftId: 10, rightId: 11, dbContent: "[[Anyone]]" });
    await seedReference(s, 30, 4, "anyone");
    await seedCard(s, { id: 31, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 31, 5, "anyone_signed_in");
    await seedCard(s, { id: 50, name: "Member", typeId: 2 });
    await seedCard(s, { id: 60, name: "Host", typeId: 2, dbContent: "{{https://example.com/card/new|titled}}" });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
  });

  afterAll(() => {
    storage?.close?.();
  });

  it("adds card[name] to the new_in_modal path", async () => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    engine.viewer = { signedIn: true, actorId: 50 };
    const html = await engine.render("Host", "core");
    expect(html).toContain(
      'href="/https_example_com_card_new/new_in_modal?card%5Bname%5D=https%3A%2F%2Fexample.com%2Fcard%2Fnew"',
    );
  });
});

describe("the interactive roles dropdown (account_links.rb :my_card, can_disable_roles?)", () => {
  const KNOWN = { actor: true, accountSettings: true, signin: true };
  // Ruby's bytes for an Advisory member (capture deck, actor 2303), with the
  // actor's name generalised.
  const EXPECTED =
    `<div id="pat_member-Xenabled_role-edit_inline-view" class="card-slot edit_inline-view ALL ALL_PLUS TYPE-session RSTAR RIGHT-Xenabled_role TYPE_PLUS_RIGHT-person-Xenabled_role" ` +
    `data-card-name="Pat_Member+*enabled_roles" data-card-type-id="23465" data-card-type-name="Session" data-card-link-name="Pat_Member+*enabled_roles" ` +
    `data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;edit_inline&quot;,&quot;nest_name&quot;:&quot;Pat Member+*enabled roles&quot;,&quot;show&quot;:[&quot;edit_inline&quot;],&quot;hide&quot;:[&quot;edit_inline_buttons&quot;,&quot;name_formgroup&quot;,&quot;type_formgroup&quot;],&quot;home_view&quot;:&quot;edit_inline&quot;}">` +
    `<form class="card-form slotter autosave" id="new_card" action="/update/Pat_Member+*enabled_roles" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="hidden" name="success[reload]" id="success_reload" value="true" autocomplete="off" /> ` +
    `<input type="hidden" name="card[type_id]" id="card_type_id" value="23465" autocomplete="off" /><fieldset class="card-editor editor"><div class="editor content-editor">` +
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden" value="Anyone Signed In\nAdvisory" name="card[content]" id="card_content" /><div class="pointer-checkbox-list">` +
    `<div class="btn-group"><a id="my-card-link" class="nav-link my-card known-card" href="/Pat_Member">Pat Member</a>\n` +
    `<a href="#" class="dropdown-toggle dropdown-toggle-split nav-link" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><span class="visually-hidden">Toggle Dropdown</span></a>\n` +
    `<ul class="dropdown-menu dropdown-menu-right" role="menu"><li><a class="dropdown-item known-card" href="/Pat_Member+*account_settings">Account</a></li>\n` +
    `<li><a class="dropdown-item known-card" href="/delete/*signin">Sign out</a></li>\n` +
    `<li><h6 class="dropdown-header">Roles</h6></li>\n` +
    `<li><div class='pointer-checkbox dropdown-item'>\n` +
    `<input type="checkbox" name="pointer_checkbox-pat_member-Xenabled_role-1" id="pointer-checkbox-anyone_signed_in" value="Anyone Signed In" class="pointer-checkbox-button _submit-on-change me-2" checked="checked" />\n` +
    `<a class="known-card" href="/Anyone_Signed_In">Anyone Signed In</a>\n</div>\n</li>\n` +
    `<li><div class='pointer-checkbox dropdown-item'>\n` +
    `<input type="checkbox" name="pointer_checkbox-pat_member-Xenabled_role-2" id="pointer-checkbox-advisory" value="Advisory" class="pointer-checkbox-button _submit-on-change me-2" checked="checked" />\n` +
    `<a class="known-card" href="/Advisory">Advisory</a>\n</div>\n</li></ul></div></div></div></fieldset></form></div>`;

  const counter = () => {
    let n = 0;
    return { uniqueId: () => `x-${++n}` } as unknown as Parameters<typeof fillUniqueIds>[1];
  };

  const input = {
    actorName: "Pat Member",
    actorTypeKey: "person",
    sessionTypeId: 23465,
    sessionTypeName: "Session",
    roles: ["Anyone Signed In", "Advisory"],
  };

  it("nests +*enabled_roles in :edit_inline with one checked box per current role", () => {
    expect(normalizeSlotIds(fillUniqueIds(enabledRolesDropdownHtml(input, KNOWN), counter()))).toBe(EXPECTED);
  });

  it("draws the checkbox ids from the page counter, after ids the body used", () => {
    const fmt = counter();
    fmt.uniqueId();
    fmt.uniqueId();
    const html = fillUniqueIds(enabledRolesDropdownHtml(input, KNOWN), fmt);
    expect(html).toContain('name="pointer_checkbox-pat_member-Xenabled_role-3"');
    expect(html).toContain('name="pointer_checkbox-pat_member-Xenabled_role-4"');
  });

  it("leaves the content blank on the first render of a cache lifetime", () => {
    expect(enabledRolesDropdownHtml(input, KNOWN, false)).toContain('type="hidden" name="card[content]"');
  });

  it("the navbar's my_card item carries it", () => {
    const links = signedInAccountLinksInnerHtml("Pat Member", KNOWN, enabledRolesDropdownHtml(input, KNOWN));
    expect(normalizeSlotIds(fillUniqueIds(links, counter()))).toBe(
      `<li class="nav-item">${EXPECTED}</li>\n` +
        `<li class="nav-item"><a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a></li>`,
    );
  });
});

describe("a row-less *structure rule takes its template's type (type.rb ensure_type_id)", () => {
  it("types the virtual rule from the new-card type walk, not as a Setting", async () => {
    const { buildVirtualRuleCard } = await import("../../../src/card/render/virtual-rule-card.js");
    const { DeckoName } = await import("../../../src/card/name.js");
    const card = (name: string, id: number, typeId: number, typeName: string) =>
      ({
        name: DeckoName.parse(name),
        key: DeckoName.parse(name).key,
        id,
        typeId,
        typeName,
        dbContent: "",
        record: { codename: undefined },
      }) as unknown as Parameters<typeof buildVirtualRuleCard>[0]["setCard"];
    const virtual = buildVirtualRuleCard({
      setCard: card("*all", 274, 259, "Set"),
      settingCard: card("*structure", 280, 278, "Setting"),
      settingCodename: "structure",
      newCardDefaultType: (n) =>
        n.key === DeckoName.parse("*all+*structure").key ? { typeId: 38267, typeName: "Nest list" } : undefined,
    });
    expect(virtual.typeId).toBe(38267);
    expect(virtual.typeName).toBe("Nest list");
    expect(virtual.setKeys).toContain("TYPE-nest_list");
  });
});

describe("a Sign up card's approval links (card-mod-account signup/views.rb verification_links)", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 3, name: "Cardtype", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 4, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedCard(s, { id: 5, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
    await seedCard(s, { id: 6, name: "Anonymous", codename: "anonymous", typeId: 2 });
    await seedCard(s, { id: 8, name: "Sign up", codename: "signup", typeId: 3 });
    await seedCard(s, { id: 9, name: "Person", codename: "user", typeId: 3 });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*read", codename: "read", typeId: 14 });
    await seedCard(s, { id: 12, name: "*create", codename: "create", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 16, name: "*account", codename: "account", typeId: 2 });
    await seedCard(s, { id: 30, leftId: 10, rightId: 11, dbContent: "[[Anyone]]" });
    await seedReference(s, 30, 4, "anyone");
    await seedCard(s, { id: 31, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 31, 5, "anyone_signed_in");
    await seedCard(s, { id: 50, name: "Member", typeId: 9 });
    await seedCard(s, {
      id: 70,
      name: "Pat Applicant",
      typeId: 8,
      creatorId: 6,
      createdAt: "2015-07-07 07:16:02",
      dbContent: "",
    });
    await seedCard(s, { id: 71, name: "Pat Applicant+*account", leftId: 70, rightId: 16, typeId: 2 });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
  });

  afterAll(() => {
    storage?.close?.();
  });

  it("offers approval to a member who may create accounted cards", async () => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    engine.viewer = { signedIn: true, actorId: 50 };
    engine.pageSession = { signedIn: true, actorId: 50 };
    const html = await engine.render("Pat Applicant", "core");
    expect(html).toContain(
      '<div><strong>Pat Applicant</strong> signed up on July  7, 2015 07:16:02</div>\n' +
        '<div><a class="known-card" href="/update/Pat_Applicant?card%5Btrigger%5D=approve_with_verification">Send verification email</a> ' +
        '<a class="known-card" href="/update/Pat_Applicant?card%5Btrigger%5D=approve_without_verification">Approve without verification</a></div>',
    );
  });

  it("offers nothing to an anonymous reader", async () => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    const html = await engine.render("Pat Applicant", "core");
    expect(html).toContain("signed up on July  7, 2015 07:16:02</div>");
    expect(html).not.toContain("approve_with_verification");
  });
});

describe("a modal-wrapped view renders outside the layout (process_layout.rb render_outside_of_layout)", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
    await seedCard(s, { id: 900, name: "*all", typeId: 2 });
    await seedCard(s, { id: 901, name: "*layout", typeId: 2 });
    await seedCard(s, { id: 910, leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
    await seedCard(s, {
      id: 911,
      name: "Probe Layout",
      typeId: 2,
      dbContent: "<body>{{_main|titled}}</body>",
    });
    await seedCard(s, { id: 914, name: "Probe Page", typeId: 2, dbContent: "<p>the body</p>" });
    await s.fetcher.codenames.ensureLoaded();
    s.fetcher.installNameEnvironment();
  });

  afterAll(() => {
    storage?.close?.();
  });

  it("renders the readable card's page, then the denied board before </body>, and answers 403", async () => {
    const { renderPageWithStatus } = await import("../../../src/card/render/page.js");
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    const { html, status } = await renderPageWithStatus(engine, "Probe Page", "board");
    expect(status).toBe(403);
    const main = html.indexOf('id="probe_page-titled-view"');
    const denial = html.indexOf('id="probe_page-denial-view"');
    expect(main).toBeGreaterThan(-1);
    expect(denial).toBeGreaterThan(main);
    expect(html.indexOf("</body>")).toBeGreaterThan(denial);
    expect(html).toContain("<p>the body</p>");
    expect(html).toContain("to update this.</div>");
    // the body's main slot was rendered without main_render_args
    expect(html).not.toMatch(/probe_page-titled-view"[^>]*main_view/);
    expect(html).toContain('<div class="d0-card-body d0-card-content ');
  });
});

describe("a virtual +*when created field dates its left card (card-mod-date right/when_created.rb)", () => {
  it("reads the left by name when the field has no stored left id", async () => {
    const { whenCreatedContentFn } = await import("../../../src/card/mod-loader/mods/card-mod-date.js");
    const { DeckoName } = await import("../../../src/card/name.js");
    const left = { record: { id: 5, isNew: false, trash: false, createdAt: "2012-05-09 18:25:00" } };
    const fmt = {
      card: { name: DeckoName.parse("Some Task+*when created"), record: { leftId: undefined, isNew: true } },
      engine: { fetchRenderCard: (n: string) => (n === "Some Task" ? left : undefined) },
    } as unknown as Parameters<typeof whenCreatedContentFn>[0];
    expect(whenCreatedContentFn(fmt)).toBe("Wednesday, May 09, 2012 06:25 PM UTC");
  });
});

describe("an always-ok actor's rule counts include every rule (Card.search for an admin)", () => {
  it("drops the read filter", async () => {
    const { settingRuleCountsStatement } = await import("../../../src/card/render/help-popover.js");
    const all = settingRuleCountsStatement(259, 278, "all");
    expect(all.sql).not.toContain("read_rule_id");
    expect(all.params).toEqual([259, 278]);
    const anon = settingRuleCountsStatement(259, 278, new Set<number>());
    expect(anon.sql).toContain("rules.read_rule_id IS NULL");
  });
});

describe("the page head's edit link uses the card's url key (head.rb universal_edit_button)", () => {
  it("drops punctuation the key drops", async () => {
    const { universalEditButtonTag } = await import("../../../src/card/render/page.js");
    const { DeckoName } = await import("../../../src/card/name.js");
    const card = (name: string) =>
      ({ name: DeckoName.parse(name), key: DeckoName.parse(name).key, id: 7 }) as unknown as Parameters<
        typeof universalEditButtonTag
      >[1];
    const engine = { updateVerdictForCard: async () => true } as unknown as Parameters<
      typeof universalEditButtonTag
    >[0];
    expect(await universalEditButtonTag(engine, card("ZQRglobal+Organizer(s)"))).toBe(
      '<link rel="alternate" type="application/x-wiki" title="Edit this page!" href="/ZQRglobal+Organizer_s/edit" />',
    );
    expect(await universalEditButtonTag(engine, card("Kirsten Cadwell - Joseph Campbell"))).toBe(
      '<link rel="alternate" type="application/x-wiki" title="Edit this page!" href="/Kirsten_Cadwell_Joseph_Campbell/edit" />',
    );
  });
});

describe("a *structure rule's one-line content links its cardtype (set/right/structure.rb)", () => {
  it("renders the type as a cardtype link", async () => {
    const { ruleBarRightHtml } = await import("../../../src/card/render/rule-bar-right.js");
    const { DeckoName } = await import("../../../src/card/name.js");
    const name = DeckoName.parse("Person+*type+*structure");
    const card = {
      name,
      key: name.key,
      id: 416,
      typeId: 3,
      typeName: "RichText",
      dbContent: "{{+bio}}",
      setKeys: "ALL ALL_PLUS TYPE-rich_text RSTAR RULE RIGHT-Xstructure",
      record: { codename: undefined },
    } as unknown as Parameters<typeof ruleBarRightHtml>[0];
    expect(ruleBarRightHtml(card)).toContain(
      '<a class="cardtype known-card" href="/RichText">RichText</a> : {{+bio}}',
    );
  });
});

describe("signed-in shapes rendered through the engine", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 3, name: "Cardtype", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 4, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedCard(s, { id: 5, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
    await seedCard(s, { id: 6, name: "Anonymous", codename: "anonymous", typeId: 2 });
    await seedCard(s, { id: 7, name: "discussion", codename: "discussion", typeId: 2 });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*read", codename: "read", typeId: 14 });
    await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 15, name: "*alerts", codename: "alerts", typeId: 2 });
    await seedCard(s, { id: 17, name: "*create", codename: "create", typeId: 14 });
    await seedCard(s, { id: 32, leftId: 10, rightId: 17, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 32, 5, "anyone_signed_in");
    await seedCard(s, { id: 30, leftId: 10, rightId: 11, dbContent: "[[Anyone]]" });
    await seedReference(s, 30, 4, "anyone");
    await seedCard(s, { id: 31, leftId: 10, rightId: 12, dbContent: "[[Anyone]]" });
    await seedReference(s, 31, 4, "anyone");
    await seedCard(s, { id: 50, name: "Member", typeId: 2 });
    await seedCard(s, { id: 51, name: "Member+Menu", leftId: 50, rightId: 52, typeId: 2, dbContent: "member menu" });
    await seedCard(s, { id: 52, name: "Menu", typeId: 2 });
    await seedCard(s, { id: 60, name: "Topic", typeId: 2 });
    await seedCard(s, { id: 61, name: "Topic+discussion", leftId: 60, rightId: 7, typeId: 2, dbContent: "" });
    await seedCard(s, { id: 62, name: "Template Host", typeId: 2, dbContent: "{{_user+Menu|core}}" });
    await seedCard(s, { id: 63, name: "Alerts Host", typeId: 2, dbContent: "{{*alerts|core}}" });
    await seedCard(s, { id: 64, name: "Menu Host", typeId: 2, dbContent: "[{{Topic+Absent Part|menu}}]" });
    await seedCard(s, { id: 65, name: "Project", typeId: 3 });
    await seedCard(s, { id: 66, name: "Typed Link Host", typeId: 2, dbContent: "{{Absent Thing|link;type:Project}}" });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
  });

  afterAll(() => {
    storage?.close?.();
  });

  const signedIn = (): RenderEngine => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    engine.viewer = { signedIn: true, actorId: 50 };
    engine.pageSession = { signedIn: true, actorId: 50 };
    return engine;
  };

  it("a signed-in comment box carries neither the reCAPTCHA nor the author field (comment.rb)", async () => {
    const member = await signedIn().render("Topic+discussion", "core");
    expect(member).toContain('<form class="card-form slotter autosave" id="edit_card_61" action="/update/Topic+discussion"');
    expect(member).not.toContain("data-recaptcha");
    expect(member).not.toContain("recaptcha_token");
    expect(member).not.toContain("My Name is:");
    expect(member).toContain(
      '</textarea>\n<div class="comment-buttons"><button name="button" type="submit" data-disable-with="Commenting" class="btn btn-outline-primary">Comment</button></div>',
    );
    const anonymous = await new RenderEngine(new FetchEngine(storage!.counting)).render("Topic+discussion", "core");
    expect(anonymous).toContain('id="edit_card_61" data-recaptcha="on"');
    expect(anonymous).toContain("My Name is:");
  });

  it("_user names the signed-in session's account (Card::Name.session)", async () => {
    const html = await signedIn().render("Template Host", "core");
    expect(html).toContain("member menu");
  });

  it("a wanted :link names the nest's type in its path (base.rb specify_type_in_link!)", async () => {
    const html = await signedIn().render("Typed Link Host", "core");
    expect(html).toContain('<a class="wanted-card" href="/Absent_Thing?card%5Btype%5D=Project">');
  });

  it("an absent card's bar menu renders nothing (menu.rb: return \"\" unless card.known?)", async () => {
    const engine = signedIn();
    const html = await engine.render("Menu Host", "core");
    expect(html).toContain("[]");
    expect(html).not.toContain("unknown-link");
    expect(html).not.toContain("card-menu");
  });

  it("*alerts renders its deprecation comment (set/self/alerts.rb)", async () => {
    const html = await signedIn().render("Alerts Host", "core");
    expect(html).toContain("<!-- *alerts is deprecated. please remove from layout -->");
  });
});
