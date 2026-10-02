/**
 * S2.2.b oracle replay: `_main` resolves through Card::Env.params[:main_name]
 * with blank-extreme fill when the param is nil.
 *
 * Oracle: fixtures/captured/name-env-main-params-oracle.json, captured from
 * the booted decko oracle app (the `english`-loaded app path — the bare-gem
 * `_main`-with-nil-params crash that kept this statement pinned-synthetic
 * does not exist there) by
 * tools/oracle/capture-name-env-main-params.rb (read-only: in-process
 * Card::Env.params mutation only; the fixture carries the card_actions
 * no-write proof).
 *
 * Ruby truth the fixture pins:
 *   - card-1.110.0 lib/card/name.rb#params (Card::Name.params -> Card::Env.params)
 *   - cardname-0.20.0 lib/cardname/contextual.rb:108 (`when /^_main$/i`,
 *     result `.to_s.strip`)
 *   - cardname-0.20.0 lib/cardname/contextual.rb:102-110 (#absolute ->
 *     absolutize_extremes)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

interface OracleRow {
  name: string;
  context: string | null;
  "relative?": boolean;
  absolute: string;
}

interface OracleScenario {
  main_name: string | null;
  params_echo: string | null;
  rows: OracleRow[];
}

const FIXTURE_PATH = join(
  __dirname,
  "../../../fixtures/captured/name-env-main-params-oracle.json",
);
const oracle = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8"),
) as { scenarios: OracleScenario[] };

afterEach(() => {
  setNameEnvironment(undefined);
});

describe("_main contextual resolution (S2.2.b oracle replay)", () => {
  // Every scenario x row of the capture, replayed against the port's
  // environment seam (Card::Name.params -> Card::Env.params is the
  // process-global the port injects as mainName).
  for (const scenario of oracle.scenarios) {
    const label =
      scenario.main_name === null
        ? "params[:main_name] unset"
        : `params[:main_name] = ${JSON.stringify(scenario.main_name)}`;

    it(`replays ${label} (${scenario.rows.length} rows)`, () => {
      setNameEnvironment({
        mainName: scenario.main_name ?? undefined,
      });

      for (const row of scenario.rows) {
        const name = DeckoName.parse(row.name);
        expect(name.isRelative, `${row.name}.relative?`).toBe(row["relative?"]);
        const absolute = name.absolute(row.context ?? undefined);
        expect(absolute, `${row.name}.absolute(${row.context ?? "nil"})`).toBe(
          row.absolute,
        );
      }
    });
  }

  it("no environment installed behaves like the nil-params capture", () => {
    // The port's no-env default (_main -> "") is Ruby's nil-params arm —
    // pinned against that scenario's rows, not asserted from thin air.
    setNameEnvironment(undefined);
    const nilScenario = oracle.scenarios.find((s) => s.main_name === null);
    expect(nilScenario).toBeDefined();
    for (const row of nilScenario?.rows ?? []) {
      expect(DeckoName.parse(row.name).absolute(row.context ?? undefined)).toBe(
        row.absolute,
      );
    }
  });
});
