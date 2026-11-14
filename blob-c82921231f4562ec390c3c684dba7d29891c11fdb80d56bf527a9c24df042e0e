// The FIRST-RUN SETUP OF THE FIRST ADMIN ACCOUNT pin (registry row cap-S9,
// "First-run setup of the first admin account").
//
// ORACLE-PINNED: fixtures/captured/first-run-setup.json, captured from the
// pinned gemset (card-1.110.0 and card-mod-account-0.20.0) by
// tests/card/mod-loader/oracle-capture-first-run-setup.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-1.110.0 lib/card/auth/setup.rb - THE CENSUS: `needs_setup?` is
//      true until the deck carries a user account,
//      `needs_setup_if_no_accounts` is `user_account_count.zero?`,
//      `user_account_cql` selects the accounts that are NOT the shipped ones
//      (`creator_id <> Card::DeckoBotID`), and `user_account_count` counts
//      them.
//   2. card-mod-account-0.20.0 set/type/user.rb - THE SETUP SURFACE: the
//      `:setup` view is gated on `perms: :needs_setup?`, the title is "Your
//      deck is ready to go!", the button is "Set up", the form posts the
//      `check_setup` trigger, `check_setup` aborts unless
//      `Auth.needs_setup?`, `setup_first_user` grants the three first-user
//      roles, and `signin_after_setup` signs that user in.
//
// THE ROW'S VERDICT IS OUT OF SCOPE AND NAMED, and this pin is what makes
// that name honest: the port DOES carry the contract (the census, the
// surface and the first-user roles are in the port's own bytes), so the row
// is out of scope because of the DECK this family exercises, not because of
// a gap in the port. The signed-in exercise's deck is already set up: the
// harness seeds two accounts of its own (tools/edge-signed-in-exercise/lib/
// seed-local-accounts.mjs), so the census over that deck is not zero and
// Ruby's own gate closes the setup surface there. No signed-in run can
// reach it, and the roster's grader returns an out_of_scope row unchanged,
// so no result can credit this row either.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/first-run-setup.json", import.meta.url),
    "utf8",
  ),
);
const portSetup = readFileSync(
  new URL("./../../../src/card/auth/first-run-setup.ts", import.meta.url),
  "utf8",
);
const portRoutes = readFileSync(
  new URL("./../../../src/server/first-run-routes.ts", import.meta.url),
  "utf8",
);
const seed = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/seed-local-accounts.mjs",
    import.meta.url,
  ),
  "utf8",
);
const roster = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("the pinned Ruby's own bytes for the first-run setup", () => {
  it("the census is the count of the accounts that are not the shipped ones", () => {
    expect(capture.facts.needs_setup_method).toBe("def needs_setup?");
    expect(capture.facts.needs_setup_cache_marker).toBe(
      "Card.cache.read(NEEDS_SETUP)",
    );
    expect(capture.facts.needs_setup_if_no_accounts).toBe(
      "user_account_count.zero?",
    );
    expect(capture.facts.user_account_cql).toBe(
      '{ right: :account, creator_id: ["ne", Card::DeckoBotID] }',
    );
    expect(capture.facts.user_account_count_query).toBe(
      "Card.count_by_cql cql",
    );
  });

  it("the setup surface is gated on that census", () => {
    expect(capture.facts.setup_view).toBe(
      "view :setup, unknown: true, perms: :needs_setup?, cache: :never do",
    );
    expect(capture.facts.setup_title).toBe(
      'voo.title = "Your deck is ready to go!" # LOCALIZE',
    );
    expect(capture.facts.setup_button).toBe(
      'submit_button text: "Set up", disable_with: "Setting up"',
    );
  });

  it("the form posts the check_setup trigger and redirects to the deck", () => {
    expect(capture.facts.setup_hidden_trigger).toBe(
      "trigger: %w[check_setup]",
    );
    expect(capture.facts.setup_hidden_success).toBe(
      'success: { redirect: true, mark: path(mark: "") }',
    );
  });

  it("the events refuse the create unless the census says so", () => {
    expect(capture.facts.check_setup_event).toBe(
      "event :check_setup, before: :check_permissions, on: :create, trigger: :required do",
    );
    expect(capture.facts.check_setup_abort).toBe(
      "abort :failure unless Auth.needs_setup?",
    );
  });

  it("the first user gets the three roles and is signed in", () => {
    expect(capture.facts.roles_for_first_user).toBe(
      "basket[:roles_for_first_user] = %i[help_desk shark administrator]",
    );
    expect(capture.facts.setup_first_user_event).toBe(
      "event :setup_first_user, :finalize, on: :create, when: :setup? do",
    );
    expect(capture.facts.setup_first_user_roles).toBe(
      "basket[:roles_for_first_user].map(&:cardname).each do |role|",
    );
    expect(capture.facts.signin_after_setup_event).toBe(
      "event :signin_after_setup, :integrate, on: :create, when: :setup? do",
    );
    expect(capture.facts.signin_after_setup_body).toBe("Auth.signin id");
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.needs_setup.gem).toBe("card-1.110.0");
    expect(capture.oracle.user_account_count.gem).toBe("card-1.110.0");
    expect(capture.oracle.setup_view.gem).toBe("card-mod-account-0.20.0");
    expect(capture.oracle.check_setup_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the contract the row is out of scope for", () => {
  it("the port runs the same census", () => {
    expect(portSetup).toContain("export async function countUserAccounts(");
    expect(portSetup).toContain(
      "WHERE right_id = ? AND trash = 0 AND NOT (left_id IN (${excluded}))",
    );
    expect(portSetup).toContain(
      "export async function setupWindowState(",
    );
  });

  it("the port renders the setup surface with Ruby's own title and button", () => {
    expect(portRoutes).toContain("<p>Your deck is ready to go!</p>");
    expect(portRoutes).toContain(
      '<button type="submit" class="btn btn-primary">Set up</button>',
    );
  });

  it("the port grants the same three first-user roles", () => {
    expect(portSetup).toContain(
      "basket[:roles_for_first_user] %i[help_desk shark administrator]",
    );
  });
});

describe("the row stays out of scope, and the name says why", () => {
  it("the roster declares the row out of scope with no checks", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S9");
    expect(row).toBeDefined();
    expect(row.status).toBe("out_of_scope");
    expect(row.checks ?? []).toEqual([]);
    expect(row.reason).toContain("one-time setup");
  });

  it("the grader returns an out of scope row unchanged, so no result credits it", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S9");
    const graded = verifiedCapabilities([row], [
      { check: "any check at all", pass: true },
    ]).find((c: { id: string }) => c.id === "S9");
    expect(graded?.status).toBe("out_of_scope");
    expect(graded?.verifiedChecks).toBeUndefined();
  });

  it("the deck this family exercises is already set up, by the harness's own seed", () => {
    // The harness seeds two accounts of its own into the deck copy it drives,
    // so the census over that deck is not zero and Ruby's own gate closes the
    // setup surface there: no signed-in run of this family can reach it.
    expect(seed).toContain('const ADMIN_NAME = "Harness Admin";');
    expect(seed).toContain('const MEMBER_NAME = "Harness Member";');
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("administrator");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/first-run-setup.json",
        "utf8",
      ),
    ).toContain('"user_account_cql"');
  });
});
