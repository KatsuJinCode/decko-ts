// defineMod (src/card/mod-loader/mod-dsl.ts) compiles the set-module DSL to
// the DeckoModManifest the loader consumes. These tests pin the compiled
// shape for each DSL call against the manifest a hand transcription writes,
// and drive one DSL-defined mod through the ModLoader to show its
// registrations land where the hand-written form's do.

import { afterEach, describe, expect, it } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import { defineMod } from "../../../src/card/mod-loader/mod-dsl.js";
import type { ModEventFn } from "../../../src/card/mod-loader/mod-manifest.js";
import type { ViewFn } from "../../../src/card/render/format.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import { guideView, helpTextView, helpView, leadView } from "../../../src/card/mod-loader/mods/card-mod-help.js";

const core: ViewFn = () => "core bytes";
const body: ModEventFn = () => undefined;

describe("defineMod: the mod", () => {
  it("normalizes a card-mod gem name and keeps the gem name (class_methods.rb:26-28)", () => {
    const mod = defineMod("card-mod-example", { group: "gem" }, () => {});
    expect(mod).toStrictEqual({ name: "example", gemName: "card-mod-example", group: "gem" });
  });

  it("a deck-local mod name is its own normalized name and carries no gemName", () => {
    expect(defineMod("local_tweaks", () => {})).toStrictEqual({ name: "local_tweaks" });
  });

  it("set() calls become set-module files in call order; a repeated path reopens its file", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("type/basic", ({ view }) => view("a", core));
      set("all/x", ({ assignType }) => assignType("phrase"));
      set("type/basic", ({ view }) => view("b", core));
    });
    expect(mod.setModules!.map((f) => f.setPath)).toEqual(["type/basic", "all/x"]);
    expect(mod.setModules![0]!.formats!["base"]!.views!.map((v) => v.view)).toEqual(["a", "b"]);
    expect(mod.setModules![1]).toStrictEqual({ setPath: "all/x", assignsType: "phrase" });
  });

  it("setPattern and prepareEngine fill the mod-level manifest fields", async () => {
    const spec = { code: "tab" } as never;
    const prepare = async (): Promise<void> => {};
    const mod = defineMod("card-mod-tabs", ({ setPattern, prepareEngine }) => {
      setPattern("tab", spec);
      setPattern("tab_index", spec, { index: 2 });
      prepareEngine(prepare);
    });
    expect(mod.setPatterns).toStrictEqual([
      { code: "tab", spec },
      { code: "tab_index", spec, index: 2 },
    ]);
    expect(mod.prepareEngine).toBe(prepare);
  });
});

describe("defineMod: views and formats", () => {
  it("a top-level view lands on the base format, as Ruby's set-level `view` does", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("type/basic", ({ view }) => view("core", core));
    });
    expect(mod.setModules![0]).toStrictEqual({
      setPath: "type/basic",
      formats: { base: { views: [{ view: "core", viewFn: core }] } },
    });
  });

  it("view options compile to the view's config; a view without options carries none", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("all/x", ({ format }) => {
        format("html", ({ view }) => {
          view("bar", { cache: "never", perms: "none", wrap: ["slot", "bar"], template: "haml" }, core);
          view("plain", core);
        });
      });
    });
    expect(mod.setModules![0]!.formats!["html"]!.views).toStrictEqual([
      {
        view: "bar",
        viewFn: core,
        config: { cache: "never", perms: "none", wrap: ["slot", "bar"], template: "haml" },
      },
      { view: "plain", viewFn: core },
    ]);
  });

  it("an empty format block still declares the format (a block defining only methods)", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("all/x", ({ format }) => format("html", () => {}));
    });
    expect(mod.setModules![0]!.formats).toStrictEqual({ html: { views: [] } });
  });

  it("`format :json, :csv do` defines the block on each format; a bare format() is base", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("all/x", ({ format }) => {
        format(["json", "csv"], ({ view }) => view("export", core));
        format(({ view }) => view("raw", core));
      });
    });
    const formats = mod.setModules![0]!.formats!;
    expect(Object.keys(formats)).toEqual(["json", "csv", "base"]);
    expect(formats["csv"]!.views).toStrictEqual([{ view: "export", viewFn: core }]);
    expect(formats["base"]!.views).toStrictEqual([{ view: "raw", viewFn: core }]);
  });

  it("a view without a body is an error at definition time", () => {
    expect(() =>
      defineMod("card-mod-x", ({ set }) => {
        set("all/x", ({ view }) => (view as (n: string, o: object) => void)("broken", {}));
      }),
    ).toThrow(/view :broken has no body/);
  });
});

describe("defineMod: events (lib/card/set/event.rb)", () => {
  it("stage, on:, before:/after:, when:, changed: compile to the registration fields", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("type/basic", ({ event }) => {
        event("observer_create", "integrate", { on: "create" }, body);
        event("my_event", { on: ["create", "update"], after: "store_in_session", when: "codename?" }, body);
        event("gate", "validate", { on: "save", changed: ["type_id", "name"], skip: "allowed" }, body);
        event("rename_check", { before: "check_permissions", changing: "name", trigger: "required" }, body);
      });
    });
    expect(mod.setModules![0]!.events).toStrictEqual([
      { event: "observer_create", at: "integrate", on: ["create"], fn: body },
      { event: "my_event", on: ["create", "update"], when: "codename?", after: "store_in_session", fn: body },
      { event: "gate", at: "validate", on: ["save"], changed: ["type_id", "name"], skip: "allowed", fn: body },
      { event: "rename_check", changing: ["name"], trigger: "required", before: "check_permissions", fn: body },
    ]);
  });

  it("an event without a body records an empty-bodied declaration; engineOwned is the same shape", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("type/session", ({ event }) => {
        event("delete_in_session", "prepare_to_store", { on: "delete" });
        event("store_in_session", "prepare_to_store", { on: "save", engineOwned: true });
      });
    });
    const [stub, owned] = mod.setModules![0]!.events!;
    expect(Object.keys(stub!)).toEqual(["event", "at", "on", "fn"]);
    expect(stub!.fn({ name: "x" }, undefined as never, undefined as never)).toBeUndefined();
    expect(owned).toMatchObject({ event: "store_in_session", at: "prepare_to_store", on: ["save"] });
    expect(Object.keys(owned!)).not.toContain("engineOwned");
  });

  it("an engine-owned event with a body is an error (its behaviour lives in the engine)", () => {
    expect(() =>
      defineMod("card-mod-x", ({ set }) => {
        set("all/x", ({ event }) => event("x", "store", { engineOwned: true }, body));
      }),
    ).toThrow(/engine-owned event :x takes no body/);
  });
});

describe("defineMod: settings, accessors and the rest of the set file", () => {
  it("setting() is setting_opts; a second call on the same file is an error", () => {
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("self/x", ({ setting }) => setting({ group: "editing", position: 2 }));
    });
    expect(mod.setModules![0]).toStrictEqual({ setPath: "self/x", settingOpts: { group: "editing", position: 2 } });
    expect(() =>
      defineMod("card-mod-x", ({ set }) => {
        set("self/x", ({ setting }) => {
          setting({});
          setting({});
        });
      }),
    ).toThrow(/already has setting_opts/);
  });

  it("card_accessor / card_reader / card_writer compile to cardAccessors (lib/card/set/trait.rb)", () => {
    const mod = defineMod("card-mod-account", ({ set }) => {
      set("right/account", ({ accessor, reader, writer }) => {
        accessor("email", { type: "phrase" });
        reader("status");
        writer("salt");
      });
    });
    expect(mod.setModules![0]!.cardAccessors).toStrictEqual([
      { name: "email", reader: true, writer: true, type: "phrase" },
      { name: "status", reader: true, writer: false },
      { name: "salt", reader: false, writer: true },
    ]);
  });

  it("content overrides, rule seeds and basket entries append in call order", () => {
    const content = (): string => "now";
    const mod = defineMod("card-mod-x", ({ set }) => {
      set("self/admin", ({ content: def, ruleSeed, basketTask, basketWarning }) => {
        def(content);
        ruleSeed({ name: "*all+*captcha", content: "1" });
        basketTask({ task: "refresh", mod: "x", linkText: "Refresh", description: "Refresh it" });
        basketWarning("no_email_delivery");
      });
    });
    expect(mod.setModules![0]).toStrictEqual({
      setPath: "self/admin",
      contentOverrides: [content],
      ruleSeeds: [{ name: "*all+*captcha", content: "1" }],
      basketTasks: [{ task: "refresh", mod: "x", linkText: "Refresh", description: "Refresh it" }],
      basketWarnings: ["no_email_delivery"],
    });
  });
});

describe("defineMod through the ModLoader", () => {
  let loader: ModLoader | undefined;
  afterEach(() => loader?.reset());

  it("card-mod-help, defined with the DSL, compiles to its transcription of the gem's set/ tree", () => {
    expect(cardModHelp.name).toBe("help");
    expect(cardModHelp.gemName).toBe("card-mod-help");
    expect(cardModHelp.group).toBe("gem-defaults");
    expect(cardModHelp.setModules!.map((f) => f.setPath)).toEqual([
      "all/help",
      "all/guide",
      "self/help",
      "self/guide",
      "right/help",
    ]);
    expect(cardModHelp.setModules![0]!.formats!["html"]!.views).toStrictEqual([
      { view: "help", viewFn: helpView, config: { unknown: true, cache: "never", wrap: "slot" } },
      { view: "help_text", viewFn: helpTextView, config: { unknown: true, cache: "never" } },
      { view: "lead", viewFn: leadView },
    ]);
    expect(cardModHelp.setModules![1]!.formats!["html"]!.views).toStrictEqual([
      { view: "guide", viewFn: guideView, config: { unknown: true, cache: "never", wrap: "slot" } },
    ]);
    expect(typeof cardModHelp.prepareEngine).toBe("function");
  });

  it("a DSL-defined mod registers its views, view options, events and accessors at load", () => {
    const fn: ViewFn = () => "<div>dsl</div>";
    const mod = defineMod("card-mod-dsl_probe", { group: "custom" }, ({ set }) => {
      set("type/basic", ({ format, event, accessor }) => {
        format("html", ({ view }) => view("dsl_probe_view", { unknown: true, cache: "never" }, fn));
        event("dsl_probe_event", "integrate", { on: "update" }, body);
        accessor("probe_note", { type: "plain_text" });
      });
    });
    const views: Record<string, ViewFn> = {};
    loader = new ModLoader([{ manifest: mod }], views);
    const report = loader.load();
    expect(report.registeredViews).toContain("dsl_probe_view");
    expect(loader.setModules().nonbase.get("Type::Basic")?.map((m) => m.modName)).toEqual(["dsl_probe"]);
    expect(loader.eventRegistry().forEvent("dsl_probe_event")).toStrictEqual({
      event: "dsl_probe_event",
      at: "integrate",
      on: ["update"],
      fn: body,
      setPath: "type/basic",
      modName: "dsl_probe",
    });
    expect(loader.viewConfigFor("dsl_probe_view")).toMatchObject({ unknown: true, cache: "never" });
    expect(loader.cardAccessorDeclarations()).toStrictEqual([
      { name: "probe_note", reader: true, writer: true, type: "plain_text", setPath: "type/basic", modName: "dsl_probe" },
    ]);
    loader.reset();
    expect(loader.cardAccessorDeclarations()).toEqual([]);
  });
});
