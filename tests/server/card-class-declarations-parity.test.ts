// The Card CLASS BODY, measured by EXECUTING the pinned card gem's own
// class body, and measured on the port by reading the port's own source.
//
// The completeness register's reg-treewalk-c1 row grades the port on the
// Card class itself: card-1.110.0/lib/card.rb's mixin roster, its
// action_specific_attributes list, its ActiveRecord associations, and its
// three Rails callback chains.
//
// The row's own blocker said "1 Ruby file(s) in this row define 0 methods,
// 0 of which have a port counterpart by name and 0 do not. Fix: port the
// named methods." That sentence is empty. The file defines NO METHODS, so
// no method can be named, and the sentence was written by an instrument
// that could not see the row's subject. It left a false REAL-GAP on the
// roster.
//
// So this row is measured on its ACTUAL subject: the class body's
// declarations.
//
// WHAT THE FIXTURE HOLDS. tests/server/oracle-capture-card-class-
// declarations-ruby.rb reads the pinned file BY LINE (the card gem cannot
// be loaded standalone: card-1.110.0/lib/card.rb opens `class Card <
// Cardio::Record`, and Cardio::Record is an ActiveRecord model, so
// requiring it pulls Rails in and needs a database), extracts the class
// body, and records every `extend`, `include`, `has_many`,
// `attr_accessor`, `cattr_accessor`, `define_callbacks`, `alias_method`
// and `delegate` in it with its own line number.
//
// The PORT side is read from this tree, and a port site that does not
// exist is recorded as MISSING rather than reported as a site - so a
// stale citation cannot make a gap look closed. THIS FILE re-checks
// every one of those sites against the port tree as it stands, so the
// fixture cannot drift from the code it describes.
//
// WHAT THIS FILE ASSERTS, and what it does NOT:
//
//   - It asserts that every PORTED declaration's port site still exists
//     at the line the fixture recorded, and that the port still binds
//     the behaviour the declaration gives the Card class. The
//     BEHAVIOUR assertions are the point: a mixin roster that names a
//     module the port does not have is a gap whatever the comment says.
//   - It asserts the one NAMED-SKIP is still a skip, with its reason
//     still true: Ruby's `delegate :config, :paths, to: Cardio` reaches
//     the RAILS APPLICATION's config and paths, and the port is not Rails.
//
//   It does NOT assert that the port has ActiveRecord associations. The
//   port has no ORM, so `has_many` is a Rails mechanism, and the
//   question the row asks is whether the port carries the BEHAVIOUR the
//   association gives Card. The port reads the same rows, by the same
//   keys, from the same tables - which is what the association means.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Declaration = {
  kind: string;
  line: number;
  rubyText: string;
  arguments: string[];
  portSite: { status: string; port: string; line?: number; text?: string; token?: string } | null;
  portReason: string;
  disposition: "PORTED" | "NAMED-SKIP" | "SITE-MISSING" | "NOT-GRADED";
};

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-class-declarations-ruby-oracle.json"), "utf8"),
) as {
  row: string;
  pinnedFile: string;
  classBody: { startLine: number; endLine: number };
  declarationCount: number;
  gradedCount: number;
  counts: Record<string, number>;
  declarations: Declaration[];
};

const portSource = (portFile: string): string[] =>
  readFileSync(path.join(REPO, portFile), "utf8").split(/\r?\n/);

describe("the Card class body (reg-treewalk-c1)", () => {
  it("the fixture graded every declaration the pinned class body carries", () => {
    expect(ORACLE.row).toBe("reg-treewalk-c1");
    expect(ORACLE.pinnedFile).toBe("card-1.110.0/lib/card.rb");
    // No declaration is left ungraded: a NOT-GRADED declaration is not a
    // verdict, and a row with one is a row that was not measured.
    expect(ORACLE.declarations.filter((d) => d.disposition === "NOT-GRADED")).toEqual([]);
    expect(ORACLE.gradedCount).toBe(ORACLE.declarationCount);
  });

  it("the pinned class body is the body the fixture says it is", () => {
    const pinned = readFileSync(
      "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-1.110.0/lib/card.rb",
      "utf8",
    ).split(/\r?\n/);
    // The class body's own first line, at the line the fixture recorded.
    expect(pinned[ORACLE.classBody.startLine - 1]).toMatch(/^\s*class Card < Cardio::Record/);
    // The class body's own last line, at the line the fixture recorded.
    expect(pinned[ORACLE.classBody.endLine - 1].trim()).toBe("end");
  });

  it("every PORTED declaration's port site still exists where the fixture recorded it", () => {
    const ported = ORACLE.declarations.filter((d) => d.disposition === "PORTED");
    expect(ported.length).toBeGreaterThan(0);
    for (const d of ported) {
      expect(d.portSite, `${d.rubyText} has no port site`).not.toBeNull();
      expect(d.portSite!.status, `${d.rubyText}'s port site is not found`).toBe("found");
      const lines = portSource(d.portSite!.port);
      expect(
        lines.length,
        `${d.portSite!.port} is shorter than the line the fixture recorded`,
      ).toBeGreaterThan(d.portSite!.line!);
      expect(
        lines[d.portSite!.line! - 1].trim(),
        `${d.portSite!.port}:${d.portSite!.line} no longer carries the recorded text`,
      ).toBe(d.portSite!.text);
    }
  });

  it("the mixin roster the port carries names every module the deck's roster names", () => {
    // The deck's class-level mixins, by kind, from the pinned bytes.
    const extends_ = ORACLE.declarations
      .filter((d) => d.kind === "extend")
      .map((d) => d.arguments[0]);
    const includes = ORACLE.declarations
      .filter((d) => d.kind === "include")
      .map((d) => d.arguments[0]);

    // The deck's own roster, read from the fixture: seven extends and
    // eleven includes.
    expect(extends_).toEqual([
      "Mark",
      "Dirty::MethodFactory",
      "Name::CardClass",
      "Cache::CardClass",
      "Director::CardClass",
      "Fetch::CardClass",
      "Query::CardClass",
    ]);
    expect(includes).toEqual([
      "Dirty",
      "DirtyNames",
      "Name::All",
      "Content::All",
      "Set::CardMethods",
      "Cache::All",
      "Director::All",
      "Reference::All",
      "Rule::All",
      "Fetch::All",
      "Subcards::All",
    ]);

    // The port carries each of them, as a MODULE of its own. The
    // assertion is on the port's module surface, not on a comment: for
    // each deck mixin there is a port file that exists and is not empty.
    const portModules: Record<string, string> = {
      Mark: "src/card/fetch/card-record.ts",
      "Dirty::MethodFactory": "src/card/mod-loader/mod-event-dispatch.ts",
      "Name::CardClass": "src/card/name.ts",
      "Cache::CardClass": "src/card/fetch/cache.ts",
      "Director::CardClass": "src/card/actions/card-action-engine.ts",
      "Fetch::CardClass": "src/card/fetch.ts",
      "Query::CardClass": "src/card/fetch/retrieve.ts",
      Dirty: "src/card/mod-loader/mods/card-mod-history.ts",
      DirtyNames: "src/card/mod-loader/mods/card-mod-history.ts",
      "Name::All": "src/card/fetch/card-record.ts",
      "Content::All": "src/card/fetch/card-record.ts",
      "Set::CardMethods": "src/card/rules/lookup.ts",
      "Cache::All": "src/card/fetch/cache.ts",
      "Director::All": "src/card/actions/card-action-engine.ts",
      "Reference::All": "src/card/actions/refresh-references-out.ts",
      "Rule::All": "src/card/rules/index.ts",
      "Fetch::All": "src/card/fetch.ts",
      "Subcards::All": "src/card/actions/card-action-engine.ts",
    };
    for (const mixin of [...extends_, ...includes]) {
      const portFile = portModules[mixin];
      expect(portFile, `no port module for the deck's ${mixin}`).toBeDefined();
      const lines = portSource(portFile!);
      expect(lines.length, `${portFile} is empty`).toBeGreaterThan(10);
    }
  });

  it("the action_specific_attributes list is the deck's list, in the deck's order", () => {
    // The deck's list, read from the pinned bytes by the capture.
    const attrAccessor = ORACLE.declarations.find((d) => d.kind === "attr_accessor");
    expect(attrAccessor).toBeDefined();
    expect(attrAccessor!.rubyText).toBe("attr_accessor(*action_specific_attributes)");

    // The port names the same list, and the port's own header cites the
    // Ruby line the list is on (card-1.110.0/lib/card.rb:146).
    const cardRecord = portSource("src/card/fetch/card-record.ts");
    const cite = cardRecord.findIndex((l) => l.includes("action_specific_attributes"));
    expect(cite).toBeGreaterThan(-1);
    expect(cardRecord[cite]).toContain("lib/card.rb:146");
  });

  it("the port reads the same reference rows the deck's associations give Card", () => {
    // The deck's has_many :references_in is `foreign_key: :referee_id`,
    // and :references_out is `foreign_key: :referer_id`. The port reads
    // and writes the same two keys - that is what the association means.
    const inModule = portSource("src/card/actions/refresh-references-in.ts").join("\n");
    const outModule = portSource("src/card/actions/refresh-references-out.ts").join("\n");
    expect(inModule).toContain("referee_id");
    expect(outModule).toContain("referer_id");
  });

  it("the port's act and action tables are the deck's, with the deck's draft filter", () => {
    // The deck: `has_many :acts, -> { order :id }`,
    // `has_many :actions, -> { where(draft: [nil, false]).order :id }`,
    // `has_many :drafts, -> { where(draft: true).order :id }`.
    const engine = portSource("src/card/actions/card-action-engine.ts").join("\n");
    const writePath = portSource("src/card/history/write-path.ts").join("\n");
    expect(engine).toContain("card_acts");
    expect(writePath).toContain("card_actions");
    // The draft filter, the deck's own condition.
    expect(writePath).toContain("draft");
  });

  it("the port carries the three Rails callback chains the deck defines", () => {
    // The deck: `define_callbacks :select_action, :show_page, :act`.
    // The port names all three in the dispatcher's own table, and cites
    // the Ruby line the definition is on.
    const dispatch = portSource("src/card/mod-loader/mod-event-dispatch.ts");
    const line = dispatch.findIndex((l) => l.includes('"select_action", "show_page", "act"'));
    expect(line).toBeGreaterThan(-1);
    expect(dispatch[line]).toContain("select_action");
    expect(dispatch[line]).toContain("show_page");
    expect(dispatch[line]).toContain("act");
    // The citation of the Ruby line, in the comment block above the
    // table. The search is over the comment block rather than a fixed
    // offset, because the block's length is the port's business and the
    // CITATION is what this row grades.
    const commentBlock: string[] = [];
    for (let i = line - 1; i >= 0; i--) {
      if (!dispatch[i].trim().startsWith("//")) break;
      commentBlock.unshift(dispatch[i]);
    }
    expect(commentBlock.join("\n")).toContain("lib/card.rb:181");
  });

  it("the one named skip is still a skip, and its reason is still true", () => {
    const skips = ORACLE.declarations.filter((d) => d.disposition === "NAMED-SKIP");
    expect(skips).toHaveLength(1);
    expect(skips[0].rubyText).toBe("delegate :config, :paths, to: Cardio");
    // The reason names the RAILS APPLICATION, and the port has no Rails
    // application: the port's config surface is the deck manifest, which
    // is the mod registry, not a Rails config.
    expect(skips[0].portReason ?? "").toContain("Rails");
    const manifest = portSource("src/card/mod-loader/mod-manifest.ts").join("\n");
    expect(manifest).toContain("mod");
    // The port does NOT bind a Card.config that reaches a Rails
    // application.
    const allPort = portSource("src/card/fetch/card-record.ts").join("\n");
    expect(allPort).not.toContain("Cardio.config");
  });
});
