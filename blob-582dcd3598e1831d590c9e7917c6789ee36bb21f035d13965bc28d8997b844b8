// The port's mark arming: the port of CardController::Mark#implicit_mark's
// setup half (decko-0.20.0/lib/card_controller/mark.rb:28-63), measured
// against the PINNED DECK's own method.
//
// THE GROUND TRUTH, two captures from the pinned gemset:
//
//   fixtures/captured/needs-setup-ruby-oracle.json - the arming's four
//     cells and the prepared params. The capture
//     (tests/server/oracle-capture-needs-setup-ruby.rb) loaded the deck's
//     own mark.rb as it is and called the deck's own initial_setup? over
//     the four cells of the conjunction, then the deck's own
//     prepare_setup_card!, and recorded the params it wrote.
//
//   fixtures/captured/register-routes-remaining-eight-ruby-oracle.json - the
//     same method executed through the deck's own implicit_mark: the mark it
//     answers and the params it leaves behind.
//
// WHAT THE PORT LANDS HERE. src/card/auth/implicit-mark.ts: the arming's
// DECISION (the pinned conjunction), the card it PREPARES (the pinned
// params), the census it reads (the port's countUserAccounts, the pinned
// predicate's port), and the HAND-OFF of the census verdict to the sync
// view gate (the account mod's `perms: :needs_setup?`).
//
// WHAT IS NOT HERE, and why: the env gate on the port's own /setup route is
// the deployment owner's recorded decision (the register's reg-routes-B10
// CONTRACT half), so this file does not touch it. The other three arms of
// the ladder (the mark a request carries, the mark a card hash carries, the
// home fallback) are the port's own mark resolution, measured in
// tests/server/implicit-mark-parity.test.ts and served by each host's own
// mark source.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import type { FetchEngine } from "../../src/card/fetch.js";
import {
  armSetupCardForRead,
  defaultAccountedTypeId,
  implicitSetupArming,
  initialSetupArming,
  prepareSetupCard,
  SETUP_VIEW,
} from "../../src/card/auth/implicit-mark.js";
import { preparedSetupVerdict } from "../../src/card/auth/first-run-setup-verdict-seam.js";
import { createRenderTestStorage } from "../card/render/render-test-storage.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const NEEDS_SETUP_ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/needs-setup-ruby-oracle.json"), "utf8"),
) as {
  markArming: Array<{ needsSetup: boolean; html: boolean; initialSetup: boolean }>;
  preparedParams: { card: { type_id: number }; view: string };
};

const REMAINING_EIGHT_ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/register-routes-remaining-eight-ruby-oracle.json"),
    "utf8",
  ),
) as {
  pinnedMethods: {
    B10: {
      sourceFile: string;
      method: string;
      cells: Array<{
        name: string;
        cell: {
          needsSetup: boolean;
          html: boolean;
          answerMark: string;
          paramsAfter: Record<string, unknown>;
        };
      }>;
    };
  };
};

// ---------------------------------------------------------------------------
// the fixture: a deck with the account system and no owner yet
// ---------------------------------------------------------------------------

const IDS = {
  account: 9001,
  email: 9002,
  password: 9003,
  salt: 9004,
  status: 9005,
  anonymous: 9006,
  deckoBot: 9007,
  user: 9008,
} as const;
const BOT = { id: IDS.deckoBot, name: "Decko Bot" };
const ANON = { id: IDS.anonymous, name: "*anonymous" };
const TS = "2026-10-27 05:00:00.000";

async function insertRow(driver: SQLDatabaseDriver, sql: string): Promise<void> {
  await driver.query(sql, []);
}

async function insertCodename(
  driver: SQLDatabaseDriver,
  id: number,
  codename: string,
  name: string,
): Promise<void> {
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${id}, '${name}', '${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}',
        '${codename}', NULL, NULL, NULL, '${TS}', '${TS}', ${BOT.id}, ${BOT.id},
        NULL, NULL, NULL, 0, 1, NULL)`,
  );
}

async function insertHolder(
  driver: SQLDatabaseDriver,
  id: number,
  name: string,
): Promise<void> {
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${id}, '${name}', '${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}',
        NULL, NULL, NULL, NULL, '${TS}', '${TS}', ${BOT.id}, ${BOT.id},
        NULL, NULL, NULL, 0, 3, NULL)`,
  );
}

/** A `+*account` junction - the row the census counts. */
async function insertJunction(
  driver: SQLDatabaseDriver,
  args: { id: number; holderId: number; holderName: string; creatorId: number },
): Promise<void> {
  await insertRow(
    driver,
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${args.id}, '${args.holderName}+*account', NULL, NULL,
        ${args.holderId}, ${IDS.account}, NULL, '${TS}', '${TS}',
        ${args.creatorId}, ${args.creatorId},
        NULL, NULL, NULL, 0, 1, NULL)`,
  );
}

interface Fixture {
  readonly driver: SQLDatabaseDriver;
  readonly fetcher: FetchEngine;
  readonly close: () => void;
}

async function fixture(opts: { withUserCardtype?: boolean } = {}): Promise<Fixture> {
  const render = await createRenderTestStorage({ bootstrapReadRules: false });
  const driver = render.counting;
  await insertCodename(driver, IDS.account, "account", "*account");
  await insertCodename(driver, IDS.email, "email", "*email");
  await insertCodename(driver, IDS.password, "password", "*password");
  await insertCodename(driver, IDS.salt, "salt", "*salt");
  await insertCodename(driver, IDS.status, "status", "*status");
  await insertCodename(driver, IDS.anonymous, "anonymous", "*anonymous");
  await insertCodename(driver, IDS.deckoBot, "decko_bot", "Decko Bot");
  if (opts.withUserCardtype !== false) {
    await insertCodename(driver, IDS.user, "user", "User");
  }
  // The two shipped accounts, authored by the bot (auth/setup.rb:44).
  await insertJunction(driver, { id: 9101, holderId: BOT.id, holderName: BOT.name, creatorId: BOT.id });
  await insertJunction(driver, { id: 9102, holderId: ANON.id, holderName: ANON.name, creatorId: BOT.id });
  return { driver, fetcher: render.fetcher, close: () => render.close() };
}

// ---------------------------------------------------------------------------
// 1. THE ARMING'S DECISION, against the pinned deck's own method
// ---------------------------------------------------------------------------

describe("the arming's decision, against the pinned deck gem (mark.rb:56-58)", () => {
  it("the capture ran the deck's own method over the four cells of the conjunction", () => {
    expect(REMAINING_EIGHT_ORACLE.pinnedMethods.B10.sourceFile).toBe(
      "decko-0.20.0/lib/card_controller/mark.rb",
    );
    expect(REMAINING_EIGHT_ORACLE.pinnedMethods.B10.method).toBe(
      "CardController::Mark#implicit_mark",
    );
    expect(NEEDS_SETUP_ORACLE.markArming).toHaveLength(4);
  });

  it("the census open and the request HTML: the arming holds", () => {
    const cell = NEEDS_SETUP_ORACLE.markArming.find(
      (row) => row.needsSetup === true && row.html === true,
    );
    expect(cell?.initialSetup).toBe(true);
    expect(initialSetupArming({ needsSetup: true, html: true })).toBe(true);
  });

  it("the census open and the request NOT HTML: the arming does not hold", () => {
    const cell = NEEDS_SETUP_ORACLE.markArming.find(
      (row) => row.needsSetup === true && row.html === false,
    );
    expect(cell?.initialSetup).toBe(false);
    expect(initialSetupArming({ needsSetup: true, html: false })).toBe(false);
  });

  it("the census closed: the arming does not hold, whatever the request kind is", () => {
    for (const html of [true, false]) {
      const cell = NEEDS_SETUP_ORACLE.markArming.find(
        (row) => row.needsSetup === false && row.html === html,
      );
      expect(cell?.initialSetup).toBe(false);
      expect(initialSetupArming({ needsSetup: false, html })).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. THE PREPARED CARD, against the pinned deck's own method
// ---------------------------------------------------------------------------

describe("the prepared card, against the pinned deck gem (mark.rb:60-63)", () => {
  it("the prepared params are the card's type and the setup view", () => {
    expect(NEEDS_SETUP_ORACLE.preparedParams).toEqual({
      card: { type_id: 2 },
      view: "setup",
    });
    expect(prepareSetupCard(2)).toEqual(NEEDS_SETUP_ORACLE.preparedParams);
    expect(SETUP_VIEW).toBe("setup");
  });

  it("the pinned method's own cells: the arming prepares the card, and the closed cells prepare nothing", () => {
    for (const row of REMAINING_EIGHT_ORACLE.pinnedMethods.B10.cells) {
      const prepared = implicitSetupArming({
        needsSetup: row.cell.needsSetup,
        html: row.cell.html,
        typeId: 99,
      });
      if (row.cell.answerMark === "") {
        // the arming held: the method answers the EMPTY mark and the params
        // carry the setup card and the setup view.
        expect(prepared, row.name).toEqual({ card: { type_id: 99 }, view: "setup" });
        expect(row.cell.paramsAfter).toEqual({ card: { type_id: 99 }, view: "setup" });
      } else {
        // the arming did not hold: the method keeps its own mark and the
        // params carry nothing of the setup card's.
        expect(prepared, row.name).toBeUndefined();
        expect(row.cell.paramsAfter, row.name).toEqual({});
        expect(row.cell.answerMark, row.name).toBe("Home");
      }
    }
  });

  it("a request that names a view still gets the setup view: prepare_setup_card! overwrites params[:view]", () => {
    const row = REMAINING_EIGHT_ORACLE.pinnedMethods.B10.cells.find((entry) =>
      entry.name.includes("names a view"),
    );
    expect(row?.cell.paramsAfter).toEqual({ view: "setup", card: { type_id: 99 } });
  });

  it("a deck with no default accounted type prepares nothing, and does not raise", () => {
    // The pinned capture records the raise the pinned deck makes when the
    // constant is missing (implicit-mark-ruby-oracle.json's initialSetup
    // cell). The port answers the arming's question instead: no type, no
    // prepared card, and the read keeps its own mark.
    expect(
      implicitSetupArming({ needsSetup: true, html: true, typeId: undefined }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. THE PRODUCER, over a real deck
// ---------------------------------------------------------------------------

describe("the arming's producer over a real deck", () => {
  const ARMED = { firstRunEnabled: true, writePathEnabled: true };

  it("the census open and the request HTML: the card is prepared and the verdict reaches the view gate", async () => {
    const deck = await fixture();
    try {
      const result = await armSetupCardForRead(
        { driver: deck.driver, fetcher: deck.fetcher },
        { html: true, gates: ARMED },
      );
      expect(result.armed).toBe(true);
      expect(result.censusReason).toBe("needs_setup");
      expect(result.accountCount).toBe(0);
      // Card.default_accounted_type_id - the User cardtype card's id.
      expect(result.prepared).toEqual({ card: { type_id: IDS.user }, view: "setup" });
      // the hand-off: the sync view gate reads the prepared verdict.
      expect(preparedSetupVerdict()).toEqual({ open: true, accountCount: 0 });
    } finally {
      deck.close();
    }
  });

  it("the census open and the request NOT HTML: no card, and the verdict still reaches the view gate", async () => {
    const deck = await fixture();
    try {
      const result = await armSetupCardForRead(
        { driver: deck.driver, fetcher: deck.fetcher },
        { html: false, gates: ARMED },
      );
      expect(result.armed).toBe(false);
      expect(result.prepared).toBeUndefined();
      // the gate is the census, so the census's own answer is handed even
      // when the request kind keeps the read off the setup card.
      expect(preparedSetupVerdict()).toEqual({ open: true, accountCount: 0 });
    } finally {
      deck.close();
    }
  });

  it("the census closed: no card, and the verdict says closed", async () => {
    const deck = await fixture();
    try {
      await insertHolder(deck.driver, 9400, "Real User");
      await insertJunction(deck.driver, {
        id: 9401,
        holderId: 9400,
        holderName: "Real User",
        creatorId: ANON.id,
      });
      const result = await armSetupCardForRead(
        { driver: deck.driver, fetcher: deck.fetcher },
        { html: true, gates: ARMED },
      );
      expect(result.armed).toBe(false);
      expect(result.prepared).toBeUndefined();
      expect(result.censusReason).toBe("setup_complete");
      expect(result.accountCount).toBe(1);
      expect(preparedSetupVerdict()).toEqual({ open: false, accountCount: 1 });
    } finally {
      deck.close();
    }
  });

  it("a deployment with no first-run journey: no card, no census, and no verdict", async () => {
    const deck = await fixture();
    try {
      const result = await armSetupCardForRead(
        { driver: deck.driver, fetcher: deck.fetcher },
        { html: true, gates: { firstRunEnabled: false, writePathEnabled: true } },
      );
      expect(result.armed).toBe(false);
      expect(result.prepared).toBeUndefined();
      expect(result.censusReason).toBe("disabled");
      // the gate order: an un-armed deployment spends no query, so the
      // census never ran and nothing was handed to the view gate.
      expect(result.accountCount).toBeUndefined();
    } finally {
      deck.close();
    }
  });

  it("a deck with no User cardtype: no prepared card, and no raise", async () => {
    const deck = await fixture({ withUserCardtype: false });
    try {
      expect(await defaultAccountedTypeId(deck.fetcher)).toBeUndefined();
      const result = await armSetupCardForRead(
        { driver: deck.driver, fetcher: deck.fetcher },
        { html: true, gates: ARMED },
      );
      expect(result.armed).toBe(false);
      expect(result.prepared).toBeUndefined();
    } finally {
      deck.close();
    }
  });
});
