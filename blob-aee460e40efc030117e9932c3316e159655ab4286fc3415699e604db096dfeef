// register-events-core-template-expansion-oracle-parity.test.ts - the SIXTEEN
// core template-expansion event rows, tied to the EXECUTED Ruby oracle
// capture.
//
// The register's core section listed sixteen PARTIAL events with "no
// single Ruby declaration": they are template expansions. The family's own
// audit (commit b1d68fd1) closed them from the SOURCE and said so: "No
// behavior changes; the disposition comment is the only edit." This file
// is the other half. One capture
// (tests/server/oracle-capture-core-template-expansion-events-ruby.rb)
// reads the three pinned templates out of the pinned gemset, records the
// EXPANDED declaration each one produces, and EXECUTES the two bodies that
// can be stood up (the observer trio and the email trio).
//
// WHAT THE CAPTURE RECORDS.
//   the ten mount rows: the expanded declaration of card_mount.rb's
//   class_eval template for the `file` and the `image` column, and the
//   fact that their bodies call into the carrierwave gem, which the
//   pinned gemset does not carry, so those bodies are not stood up.
//   the three observer rows: the expanded declaration of observer.rb's
//   each-loop, and the EXECUTED body (execute_card_events with the
//   action).
//   the three email rows: the expanded declaration of the account mod's
//   each-loop, and the EXECUTED body (send_account_email with the email
//   name).
//   the gate the mount rows name: the pinned `no_history?` source.
//
// Each case below pins the port's own registration against the captured
// expansion, clause for clause.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import { OBSERVER_EVENT_DECLARATIONS } from "../../../src/card/mod-loader/mods/card-mod-integrate.js";
import { NO_HISTORY_RIGHT_CODENAMES } from "../../../src/card/actions/account-fields.js";
import { declaredEvents, readOracle } from "./register-events-oracle-helpers.js";

function portSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const CAPTURED = readOracle("core-template-expansion-events");

/** The captured row, by its register id. */
function capturedRow(id: string): Record<string, any> {
  const all = [
    ...CAPTURED.mount_rows,
    ...CAPTURED.observer_rows,
    ...CAPTURED.email_rows,
  ];
  const row = all.find((entry: any) => entry.row === id);
  expect(row, `captured row missing: ${id}`).toBeDefined();
  return row as Record<string, any>;
}

/** The port's own declaration for an event, searched across the mods
 *  that declare it. */
function portDeclaration(event: string): Record<string, any> | undefined {
  const mods = [cardModCarrierwave, cardModAccount];
  for (const mod of mods) {
    const decl = declaredEvents(mod).find((d) => d.event === event);
    if (decl) return decl as Record<string, any>;
  }
  const observer = (OBSERVER_EVENT_DECLARATIONS as readonly Record<string, any>[]).find(
    (d) => d.event === event,
  );
  return observer as Record<string, any> | undefined;
}

describe("the sixteen core template-expansion rows against the EXECUTED Ruby oracle", () => {
  // ---------------------------------------------------------------------
  // the ten mount rows: card_mount.rb's class_eval template
  // ---------------------------------------------------------------------
  for (const column of ["file", "image"] as const) {
    const mountRows = [
      {
        id: `reg-evt-core-store-${column}-event`,
        event: `store_${column}_event`,
        at: "finalize",
        when: `store_${column}_event?`,
        on: undefined as string[] | undefined,
        citation: "card_mount.rb:32-34",
      },
      {
        id: `reg-evt-core-remove-${column}-event`,
        event: `remove_${column}_event`,
        at: "finalize",
        when: "no_history?",
        on: ["delete"],
        citation: "card_mount.rb:37-39",
      },
      {
        id: `reg-evt-core-mark-remove-${column}-false-event`,
        event: `mark_remove_${column}_false_event`,
        at: "finalize",
        when: undefined as string | undefined,
        on: ["update"],
        citation: "card_mount.rb:41-43",
      },
      {
        id: `reg-evt-core-reset-previous-changes-for-${column}-event`,
        event: `reset_previous_changes_for_${column}_event`,
        at: "finalize",
        when: "no_history?",
        on: undefined as string[] | undefined,
        citation: "card_mount.rb:45-48",
      },
      {
        id: `reg-evt-core-remove-previously-stored-${column}-event`,
        event: `remove_previously_stored_${column}_event`,
        at: "finalize",
        when: "no_history?",
        on: ["update"],
        citation: "card_mount.rb:50-53",
      },
    ];

    for (const row of mountRows) {
      it(`${row.id}: the port's declaration is the template's expansion, clause for clause`, () => {
        const captured = capturedRow(row.id);

        // the pinned expansion: the template's own line, with the column
        // substituted, and nothing invented.
        expect(captured.declaration).toContain(`event :${row.event}`);
        expect(captured.declaration).toContain(`:${row.at}`);
        if (row.when) expect(captured.declaration).toContain(`when: :${row.when}`);
        if (row.on) {
          for (const trigger of row.on) {
            expect(captured.declaration).toContain(`on: :${trigger}`);
          }
        }
        // and the pinned gate the declaration names
        expect(CAPTURED.pinned_no_history_gate).toBeDefined();
        if (row.when === "no_history?") {
          expect(CAPTURED.pinned_no_history_gate.body).toContain("!history?");
        }

        // the port's own declaration carries the same clauses
        const decl = portDeclaration(row.event);
        expect(decl, `${row.event} not declared by the port`).toBeDefined();
        expect(decl!.at).toBe(row.at);
        if (row.when) expect(decl!.when).toBe(row.when);
        if (row.on) expect(decl!.on).toEqual(row.on);
        if (!row.on) expect(decl!.on).toBeUndefined();

        // and the port's registration cites the pinned line it came from
        const carrierwave = portSource(
          "../../../src/card/mod-loader/mods/card-mod-carrierwave.ts",
        );
        expect(carrierwave).toContain(row.citation);
      });
    }
  }

  it("the two remove_* rows are the port's NAMED REMAINDER, and the gap is the delete path's missing cleanup", () => {
    // The port's delete path has no stored-file cleanup: the files of a
    // deleted card's actions stay on disk, deliberately, matching the
    // action rows a restore would need. Ruby runs remove_#{column}! when
    // the card has no history. That is a real divergence, named at the
    // registration.
    const carrierwave = portSource(
      "../../../src/card/mod-loader/mods/card-mod-carrierwave.ts",
    );
    expect(carrierwave).toContain("card_mount.rb:37-39");
    expect(carrierwave).toContain("no stored-file cleanup");

    // the port's own delete path: no attachment arm
    const engine = portSource("../../../src/card/actions/card-action-engine.ts");
    expect(engine).not.toContain("remove_file_event");
    expect(engine).not.toContain("remove_image_event");
  });

  it("the three mount rows whose Ruby body the port has no counterpart for are inert on the port's side", () => {
    // The port's no-history set lists right codenames only, never the
    // mount types, so the two no_history?-gated mount events are
    // structurally inert for a File or Image card: the same answer Ruby
    // gives for a card that keeps its history.
    expect([...NO_HISTORY_RIGHT_CODENAMES]).toEqual(["password", "salt"]);
    expect([...NO_HISTORY_RIGHT_CODENAMES]).not.toContain("file");
    expect([...NO_HISTORY_RIGHT_CODENAMES]).not.toContain("image");

    // and the mount rows whose bodies reset ActiveRecord mounter state
    // have no counterpart object in the port's save path.
    const engine = portSource("../../../src/card/actions/card-action-engine.ts");
    expect(engine).not.toContain("mark_remove_file_false");
    expect(engine).not.toContain("reset_previous_changes_for_file");
  });

  // ---------------------------------------------------------------------
  // the three observer rows: observer.rb's each-loop
  // ---------------------------------------------------------------------
  for (const action of ["create", "update", "delete"] as const) {
    it(`reg-evt-core-observer-${action}: the executed body is the port's integrate-seam observer run`, () => {
      const captured = capturedRow(`reg-evt-core-observer-${action}`);

      expect(captured.declaration).toBe(
        `event :observer_${action}, :integrate, on: ${action} do`,
      );
      // the EXECUTED body: one call, with the action
      expect(captured.executed.raised).toBeNull();
      expect(captured.executed.recorded).toEqual([
        { call: "execute_card_events", arguments: [{ on: action }] },
      ]);
      // and the pinned helper the body calls
      expect(captured.pinned_helper.file).toBe(
        "card-mod-integrate-0.20.0/set/all/observer.rb",
      );
      expect(captured.pinned_helper.body).toContain("event_cards(setting).each");

      // the port's own declaration carries the same clauses
      const decl = portDeclaration(`observer_${action}`);
      expect(decl, `observer_${action} not declared by the port`).toBeDefined();
      expect(decl!.stage).toBe("integrate");
      expect(decl!.on).toBe(action);

      // and the port's owner is wired at the engine's integrate seam
      const engine = portSource("../../../src/card/actions/card-action-engine.ts");
      expect(engine).toContain("runObserverEvents");
      const observer = portSource("../../../src/card/notify/observer.ts");
      expect(observer).toContain("runObserverEvents");
    });
  }

  // ---------------------------------------------------------------------
  // the three email rows: the account mod's each-loop
  // ---------------------------------------------------------------------
  for (const email of [
    "password_reset_email",
    "verification_email",
    "welcome_email",
  ] as const) {
    it(`reg-evt-core-send-${email.replace(/_/g, "-")}-email: the executed body is the port's account-mail send`, () => {
      const captured = capturedRow(`reg-evt-core-send-${email.replace(/_/g, "-")}`);

      expect(captured.declaration).toBe(
        `event :send_${email}, :integrate, trigger: :required do`,
      );
      // the EXECUTED body: one call, with the email name
      expect(captured.executed.raised).toBeNull();
      expect(captured.executed.recorded).toEqual([
        { call: "send_account_email", arguments: [email] },
      ]);

      // the port's own declaration carries the same clauses
      const decl = portDeclaration(`send_${email}`);
      expect(decl, `send_${email} not declared by the port`).toBeDefined();
      expect(decl!.at).toBe("integrate");
      expect(decl!.trigger).toBe("required");

      // and the port's owner sends the mail from the account flows
      const flows = portSource("../../../src/card/auth/account-verify-reset-flows.ts");
      expect(flows).toContain(`send_${email}`);
    });
  }
});
