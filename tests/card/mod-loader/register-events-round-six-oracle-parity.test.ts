// register-events-round-six-oracle-parity.test.ts - the events family's
// sixth round: the next eight rows in row-id order, each pinned against
// its OWN executed Ruby oracle capture.
//
// WHAT THIS FILE IS. Rounds three, four and five closed the rows whose
// port-side prerequisite LANDED. This round takes the next eight rows in
// row-id order and closes each one on its own evidence: the pinned gem's
// own body is EXECUTED, the port's registration is pinned against that
// execution, and the row's verdict is either parity (the port's body
// produces the capture's own bytes) or a measured skip with the
// mechanism named.
//
// Each row here states two things: what Ruby's own body DID (from the
// executed capture), and what the port's registration carries.
//
// EVERY capture this file reads was produced by RUNNING the pinned gem's
// own body: the pinned file, declaration and body come out of the pinned
// gemset by line, and the body is executed by
// tests/server/oracle-capture-register-events-generic-ruby.rb over the
// recording doubles, driven by the row's own spec in
// tests/server/register-events-specs/. Nothing here was produced by
// reading the Ruby and transcribing what it looks like it would do. The
// re-run of each row's rig is byte-identical to the committed fixture.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import coreMod from "../../../src/card/mod-loader/mods/core-mod.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModLayout from "../../../src/card/mod-loader/mods/card-mod-layout.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

type Capture = {
  row: string;
  event: string;
  pinned_file: string;
  pinned_declaration: string;
  pinned_declaration_line: number;
  pinned_body: string;
  executed?: boolean;
  scenarios?: Array<Record<string, any>>;
  [key: string]: any;
};

/** One executed Ruby capture, read from the committed fixture. */
export function capture(slug: string): Capture {
  const path = new URL(`../../../fixtures/captured/${slug}-ruby-oracle.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The port's own registration of the event, out of the mod's manifest. */
export function registration(mod: DeckoModManifest, event: string): Record<string, any> {
  for (const file of mod.setModules ?? []) {
    for (const declared of file.events ?? []) {
      if ((declared as Record<string, any>).event === event) return declared as Record<string, any>;
    }
  }
  throw new Error(`no registration for ${event}`);
}

/** The stub body, as the mod files hand it out: the core mod's stub
 *  factory, the mod files' own no-op arrow, or a body that is only a
 *  comment (the no-op each mod writes with its reason). */
export function carriesStubBody(declared: Record<string, any>): boolean {
  if (typeof declared.fn !== "function") return false;
  const text = String(declared.fn);
  if (/stubEvent/.test(text)) return true;
  if (/^\s*\(\)\s*=>\s*undefined/.test(text)) return true;
  // a body that is nothing but a comment does nothing.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\([^)]*\)\s*=>/g, "")
    .replace(/[{}()=>\s;]/g, "");
  if (stripped.length === 0) return true;
  // a body that only VOIDS what it was handed does nothing.
  return /^(void[A-Za-z0-9_]*)+$/.test(stripped);
}

/** The calls one executed scenario made, by name, each qualified by the
 *  double it was made on ("each_child.include_set_modules"). */
export function callsOf(scenario: Record<string, any> | undefined): string[] {
  return ((scenario?.calls ?? []) as Array<Record<string, any>>).map((call) =>
    call.under ? `${call.under}.${call.call}` : String(call.call),
  );
}

/** The errors one executed scenario added, by message. */
export function errorsOf(scenario: Record<string, any> | undefined): unknown[] {
  return ((scenario?.errors_added ?? []) as Array<Record<string, any>>).map((e) => e.message);
}

/** The PINNED locale's own text for one key, read from the vendored
 *  gem's locale file, so a capture's words and the gem's words are one
 *  set of words and not a copy of them. */
export function localeText(key: string): string {
  const file = readFileSync(
    new URL(
      "../../../fixtures/vendor/card-mod-carrierwave-0.20.0/config/locales/en.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const match = file.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  if (match === null) throw new Error(`no locale key ${key}`);
  return match[1].trim();
}

/** One row of the mod's own committed surface capture, by view name: the
 *  bytes Ruby's own server wrote for that view. */
export function surfaceBytes(view: string): string {
  const file = readFileSync(
    new URL("../../../fixtures/oracle-surfaces/comment.jsonl", import.meta.url),
    "utf8",
  );
  for (const line of file.trim().split("\n")) {
    const row = JSON.parse(line) as { view?: string; bytes?: string };
    if (row.view === view) return String(row.bytes);
  }
  throw new Error(`no surface row ${view}`);
}

describe("the events family, round six: the next eight rows in row-id order", () => {
  it("validate_codename: the executed body's three checks, and the port's named skip with its mechanism", () => {
    const oracle = capture("validate-codename");
    const declared = registration(coreMod, "validate_codename");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-1.110.0/mod/core/set/all/codename.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :validate_codename, :validate, on: :update, changed: :codename do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body ran the card's OWN three checks (the pinned
    // helper methods, codename.rb:17-45, run from their pinned bytes). A
    // cleared codename is cleared again and no error is added; a codename
    // another card already owns is refused with the PINNED locale's own
    // text.
    const cleared = oracle.scenarios?.[0];
    const taken = oracle.scenarios?.[1];
    expect(callsOf(cleared)).toEqual([
      "validate_codename_permission",
      "Auth.always_ok?",
      "validate_codename_uniqueness",
      "codename",
      "codename=",
      "validate_codename_simplicity",
      "name",
      "simple?",
    ]);
    expect(cleared?.writes).toEqual([{ attribute: "codename", value: null }]);
    expect(errorsOf(cleared)).toEqual([]);
    expect(errorsOf(taken)).toEqual(["codename account already in use"]);

    // the port's registration is the pinned declaration (:validate, on:
    // :update, changed: :codename) with the stub body. THE ROW CLOSES on
    // the measured skip, and the mechanism is named: the port's update
    // path carries NO codename at all, so the body's own gate selects
    // nothing. The update input has no codename field
    // (src/card/actions/types.ts:276, UpdateCardInput) and the tracked
    // field state has no codename (src/card/history/change.ts), so an
    // update cannot change a codename. The create path's own guard is the
    // DATABASE's unique index (db/schema.sqlite.sql:70,
    // cards_codename_index), not Ruby's three checks, and the port's own
    // measurement of both facts is pinned by
    // tests/card/actions/port-codename-site.test.ts. The unblock
    // condition is: the port's update input carries a codename, so the
    // permission gate, the uniqueness check and the simplicity check have
    // a site to run.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["update"]);
    expect(declared.changed).toEqual(["codename"]);
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_public_link_on_create: the executed body's call into the link event, and the port's named skip with its mechanism", () => {
    const oracle = capture("update-public-link-on-create");
    const declared = registration(cardModCarrierwave, "update_public_link_on_create");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/local.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :update_public_link_on_create, :integrate, on: :create, when: :local? do",
    );
    expect(oracle.pinned_declaration_line).toBe(1);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body calls the event update_public_link, and the
    // called event's own bytes then read the content. The capture records
    // the call and what the called event did.
    const created = oracle.scenarios?.[0];
    expect(callsOf(created)).toEqual(["update_public_link", "content", "empty?"]);

    // the port's registration is the pinned declaration (:integrate, on:
    // :create, when: :local?) with the stub body. THE ROW CLOSES on the
    // measured skip, and the mechanism is named: the body has no surface
    // to work on. The called event update_public_link (local.rb:9-17) has
    // both arms filesystem symlink work, create_public_links (local.rb:20-33,
    // File.symlink of the stored file and every version's path into
    // public/) or remove_public_links (local.rb:38-44, rm_rf of the symlink
    // dir), and the port has no public/ tree at all: files serve through
    // the engine's own routes, and the route replaces the symlink
    // management by direct serving (src/server/file-routes.ts:34 names
    // "public symlink management" among the route's own named
    // remainders), and the headless and edge hosts have no filesystem to
    // symlink into. A substitute "mark it public" row write would be a
    // different mechanism, not a port of Ruby's. The unblock condition is:
    // the port carries the public symlink tree.
    expect(declared.at).toBe("integrate");
    expect(declared.on).toEqual(["create"]);
    expect(declared.when).toBe("local?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_storage: the executed body's two arms, and the port's named skip with its mechanism", () => {
    const oracle = capture("update-storage");
    const declared = registration(cardModCarrierwave, "update_storage");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/01_storage_type.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :update_storage, :store, on: :update, when: :storage_changed? do",
    );
    expect(oracle.pinned_declaration_line).toBe(3);
    expect(oracle.executed).toBe(true);

    // what Ruby did: an update that is not attaching writes the stored file
    // onto the attachment column and then writes the identifier; an update
    // that is attaching skips the write and still writes the identifier.
    const writing = oracle.scenarios?.[0];
    const attaching = oracle.scenarios?.[1];
    expect(callsOf(writing)).toEqual([
      "attachment_name",
      "current",
      "file=",
      "write_identifier",
    ]);
    expect(writing?.writes).toEqual([{ attribute: "file", value: "stored.png" }]);
    expect(callsOf(attaching)).toEqual(["write_identifier"]);

    // the port's registration is the pinned declaration (:store, on:
    // :update, when: :storage_changed?) with the stub body. THE ROW CLOSES
    // on the measured skip, and the mechanism is named: the gate is
    // expressible in the port but the body is a cross-backend file MOVE.
    // The state source derives the current and the saved storage facts
    // (src/card/mod-loader/mod-event-state-sources.ts:118-140,
    // storageType, currentStorageType, currentStorageBucket,
    // currentStorageMod, savedBucket, savedMod), so the gate selects. The
    // body is `send "#{attachment_name}=", current.attachment.file`, which
    // RE-STORES the current file through the NEW storage type's uploader,
    // and the port's attachment seam has no such operation: the
    // AttachmentStore interface (src/card/attachments/attachment-store.ts:78-92)
    // offers store, read, remove and discard, and nothing that moves an
    // existing file from one backend into another. The port has no cloud
    // bucket backend and no coded mod-directory backend to move into (it
    // renders their URLs instead: card-mod-carrierwave.ts:196-206, the
    // cloud and local/coded arms of contextualizePath), so write_identifier
    // alone without the re-store would corrupt the identifier's referent,
    // and half the body is not a port. The unblock condition is: the
    // attachment store can move an existing file from one backend into
    // another.
    expect(declared.at).toBe("store");
    expect(declared.on).toEqual(["update"]);
    expect(declared.when).toBe("storage_changed?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("validate_coded_storage_type: the executed body's two refusals in the PINNED locale's words, and the port's own place for the work", () => {
    const oracle = capture("validate-coded-storage-type");
    const declared = registration(cardModCarrierwave, "validate_coded_storage_type");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-carrierwave-0.20.0/set/abstract/attachment/coded.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :validate_coded_storage_type, :validate, on: :save, when: :coded? do",
    );
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

    // what Ruby did: a coded save with no mod argument and no codename is
    // refused with BOTH storage-type errors, in the pinned locale's own
    // words; a coded save with a mod argument and a codename passes.
    const refused = oracle.scenarios?.[0];
    const passed = oracle.scenarios?.[1];
    expect(errorsOf(refused)).toEqual([
      "mod argument needed to save card as coded",
      "codename needed for storage type coded",
    ]);
    expect(callsOf(refused)).toEqual([
      "mod",
      "storage_type_error",
      "coded_ok?",
      "storage_type_error",
    ]);
    expect(errorsOf(passed)).toEqual([]);

    // and the two refusal texts ARE the pinned locale's own texts, read
    // from the vendored gem's locale file, so the capture's words and the
    // gem's words are one set of words.
    expect(errorsOf(refused)).toEqual([
      localeText("carrierwave_mod_argument_needed_to_save"),
      localeText("carrierwave_codename_needed_for_storage"),
    ]);

    // the port's registration is the pinned declaration (:validate, on:
    // :save, when: :coded?) with the stub body. THE ROW CLOSES on the
    // port's own place for the work carrying the body, with the
    // divergence named: the body is the engine's save path
    // (card-action-engine.ts:1703-1744, validateCodedStorageType, run on
    // the create path at :3029 and the update path at :4239), which
    // refuses with the PINNED locale's own two texts, and the
    // registration stays the honest stub because the engine runs the
    // check directly, so a registered body would run it twice.
    //
    // THE DIVERGENCE, NAMED: Ruby's gate is the card's DERIVED storage
    // type (`when: :coded?`, the content's ":" marker,
    // 01_storage_type.rb:45-47), so a save of a card whose stored content
    // is coded runs the check even when the save carries no coded
    // attachment, and Ruby's `mod` falls back to mod_from_content (the
    // stored content's marker). The port's trigger is the save's own
    // coded marker (AttachmentInput.coded,
    // src/card/actions/types.ts:143-152: the port has no storage_type
    // column, the marker is an assigned attribute) and the engine's `mod`
    // comes only from that marker.
    //
    // The port's own pin for this body is
    // tests/card/actions/carrierwave-coded-storage-validation.test.ts: a
    // coded save with neither a mod nor full codename coverage refuses
    // with both PINNED locale's texts joined the way ActiveRecord's
    // RecordInvalid joins the full messages, and a coded save with a mod
    // but a bare name still refuses on the codename arm.
    expect(declared.at).toBe("validate");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("coded?");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("add_comment: the executed body's joined bytes, and the port's body that writes the same bytes", async () => {
    const oracle = capture("comment-add-comment");
    const declared = registration(cardModComment, "add_comment");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-comment-0.20.0/set/all/comment.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :add_comment, :prepare_to_store, on: :save, when: :comment do",
    );
    expect(oracle.pinned_declaration_line).toBe(5);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body joins the card's content and the comment's
    // signature with the separator, and the COMPACT arm drops a nil
    // content, so a card with NO content receives the signature alone.
    // A save with no comment touches neither the content nor the comment.
    const withContent = oracle.scenarios?.[0];
    const withoutContent = oracle.scenarios?.[1];
    const blank = oracle.scenarios?.[2];
    const contentWritten = (scenario: Record<string, any> | undefined): string =>
      ((scenario?.writes ?? []) as Array<Record<string, any>>).find(
        (write) => write.attribute === "content",
      )?.value;
    const SIGNATURE =
      '<div class="w-comment-author">Anonymous (Not signed in).....2026-09-29 12:00:00 UTC</div>';
    expect(contentWritten(withContent)).toBe(
      `body before comment\n<hr>\n<p>first comment</p>\n${SIGNATURE}`,
    );
    expect(contentWritten(withoutContent)).toBe(`<p>first comment</p>\n${SIGNATURE}`);
    expect(blank?.writes).toEqual([]);

    // and the executed bytes ARE the mod's own committed surface bytes:
    // the pinned surface capture's after_signed_in_comment row.
    expect(contentWritten(withContent)).toBe(surfaceBytes("after_signed_in_comment"));

    // the port's registration is the pinned declaration (:prepare_to_store,
    // on: :save, when: :comment) with a REAL body, not the stub factory's.
    expect(declared.at).toBe("prepare_to_store");
    expect(declared.on).toEqual(["save"]);
    expect(declared.when).toBe("comment");
    expect(carriesStubBody(declared)).toBe(false);

    // and the port's body, run against the SAME input, writes the capture's
    // own bytes, byte for byte, on both arms: the card WITH a content and
    // the card with NO content.
    const FROZEN = new Date(Date.UTC(2026, 8, 29, 12, 0, 0));
    const runPortBody = async (
      pendingContent: string | undefined,
    ): Promise<string | undefined> => {
      let written: string | undefined;
      await declared.fn(
        { name: "Joe User+File" } as never,
        undefined as never,
        {
          driver: undefined as never,
          lexicon: undefined as never,
          stage: "prepare_to_store",
          skipEvent: () => false,
          saveInput: {
            comment: "first comment",
            commentAuthor: undefined,
            signedInActorName: undefined,
            now: () => FROZEN,
            pendingContent,
            setContent: (value: string) => {
              written = value;
            },
            commentApplied: false,
          },
        } as never,
      );
      return written;
    };
    expect(await runPortBody("body before comment")).toBe(contentWritten(withContent));
    expect(await runPortBody(undefined)).toBe(contentWritten(withoutContent));
  });

  it("update_follow_rules: the executed body's bulk walk, and the port's named skip with its mechanism", () => {
    const oracle = capture("update-follow-rules");
    const declared = registration(cardModFollow, "update_follow_rules");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-follow-0.20.0/set/self/follow_defaults.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :update_follow_rules, :finalize, on: :save, trigger: :required do",
    );
    expect(oracle.pinned_declaration_line).toBe(17);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body runs as the bot, walks the deck's users,
    // walks each user's follow defaults, and asks each default's set card
    // for the follow rule's name.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual([
      "Auth.as_bot",
      "Card.search",
      "each",
      "follow_defaults",
      "follow_rule_name",
      "Card.fetch",
      "Card.follow_caches_expired",
    ]);
    expect(
      (saved?.calls ?? []).find((c: any) => c.call === "follow_rule_name")?.arguments,
    ).toEqual(["Joe User+User"]);

    // the port's registration is the pinned declaration (:finalize, on:
    // :save, trigger: :required) with the stub body. THE ROW CLOSES on the
    // measured skip, and the mechanism is named, on TWO verified facts.
    // (1) UNREACHABLE THROUGH THE SERVING PATH: `trigger: :required`
    // fires only when the act's trigger list names the event
    // (set/event/skip_and_trigger.rb:86-90), and the trigger name
    // arrives from card[trigger]. The port's write route parses SIX named
    // triggers (send_reset_password_token, reset_password,
    // verify_and_activate, approve_with_verification,
    // approve_without_verification, use_as_current_skin —
    // write-routes.ts:1525/:1899/:2136/:2143) and
    // update_follow_rules is NOT among them, so the trigger list the act
    // carries can never name this event on a served save. The port's own
    // pin re-derives that set from the route's source text:
    // tests/card/mod-loader/card-mod-follow-cache-expired-events.test.ts.
    // (2) THE BODY HAS NO DIVERGENCE-FREE PORT: it drops "*never" and
    // "*always", adds the option card, and saves EVERY user's follow rule,
    // a nested bulk write whose per-rule saves must ride the engine's own
    // write path (validations, references, act rows). The mod-event seam
    // is single-card, and the port's follow-rule walk is a READ walk
    // (src/card/follow/follow-rule-walk.ts), so a direct db_content UPDATE
    // would bypass exactly the machinery Ruby's save! runs.
    //
    // The unblock condition is: the port's serving path can carry the
    // update_follow_rules trigger, and the port has a bulk follow-rule
    // rewrite that rides the engine's own save path.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["save"]);
    expect(declared.trigger).toBe("required");
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("clear_roles_cache: the executed body's two cache drops, and the port's equivalent by absence", () => {
    const oracle = capture("clear-roles-cache");
    const declared = registration(cardModLayout, "clear_roles_cache");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe(
      "card-mod-layout-0.20.0/set/right/enabled_roles.rb",
    );
    expect(oracle.pinned_declaration).toBe(
      "event :clear_roles_cache, :prepare_to_store, before: :store_in_session do",
    );
    expect(oracle.pinned_declaration_line).toBe(28);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body clears the current user's roles and drops
    // the always-cache.
    const saved = oracle.scenarios?.[0];
    expect(callsOf(saved)).toEqual(["Auth.current", "clear_roles", "Auth.update_always_cache"]);

    // the port's registration carries the neighbour Ruby names and NO
    // stage of its own (options.rb:76 clears the stage when `before:` is
    // given), and its body is the mod files' no-op. THE ROW CLOSES on the
    // measured skip, and the mechanism is named: the body drops two
    // caches the port does not hold. There is no Auth.current.clear_roles
    // and no Auth.update_always_cache anywhere in the port, so there is
    // nothing to clear, and the next reader sees fresh by construction:
    // the read path's permission state is memoized per renderer
    // (src/card/render.ts:5683-5685) and the write path's per engine
    // (src/card/actions/card-action-engine.ts:7109-7120), both built per
    // request, and the write memo is dropped when a save rolls back
    // (card-action-engine.ts:803). The sibling event the declaration
    // names is wired, so the `before:` chain has a real target: the
    // session mod declares store_in_session engine-owned
    // (card-mod-session.ts:194) and the engine carries its body
    // (card-action-engine.ts:2767-2775). The port's own pin for the
    // declaration's shape is
    // tests/card/mod-loader/card-mod-layout-event-rows.test.ts.
    expect(declared.before).toBe("store_in_session");
    expect(declared.at).toBeUndefined();
    expect(carriesStubBody(declared)).toBe(true);
  });

  it("update_layout_registry: the executed body's two registry calls, and the port's equivalent by absence", () => {
    const oracle = capture("update-layout-registry");
    const declared = registration(cardModLayout, "update_layout_registry");

    // the pinned declaration, by the gem's own line
    expect(oracle.pinned_file).toBe("card-mod-layout-0.20.0/set/type/layout_type.rb");
    expect(oracle.pinned_declaration).toBe(
      "event :update_layout_registry, :finalize, on: :update do",
    );
    expect(oracle.pinned_declaration_line).toBe(7);
    expect(oracle.executed).toBe(true);

    // what Ruby did: the body deregisters the layout and registers it again
    // with its nest, naming the card and the card's format.
    const updated = oracle.scenarios?.[0];
    expect(callsOf(updated)).toEqual([
      "name",
      "Layout.deregister_layout",
      "name",
      "Layout.register_layout_with_nest",
    ]);

    // the port's registration is the pinned declaration (:finalize, on:
    // :update) with the stub body. THE ROW CLOSES on the measured skip,
    // and the mechanism is named: there is no registry to go stale. The
    // port resolves a page's layout fresh per render through the same
    // rule_cache walk Ruby uses (src/card/render/page.ts:984,
    // resolvePageLayout -> engine.ruleCardForSetting, which is
    // card.rule_card(:layout)), so a saved layout is visible to the very
    // next render with no registration step, and no
    // register_layout_with_nest and no deregister_layout exist anywhere in
    // the port's sources. The port's own pin asserts that equivalence and
    // fails loudly if a render source grows a registry:
    // tests/card/mod-loader/card-mod-layout-event-rows.test.ts.
    expect(declared.at).toBe("finalize");
    expect(declared.on).toEqual(["update"]);
    expect(carriesStubBody(declared)).toBe(true);
  });
});
