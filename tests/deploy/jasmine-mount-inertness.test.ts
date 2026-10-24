// The deck template's JasmineRails engine mount, measured against the PINNED
// GEMSET, and the port's route set measured against it.
//
// The completeness register's A23 row (register-routes) grades the port
// UNPORTED for the deck app template's conditional
// `mount JasmineRails::Engine => "#{rel_root}/specs"`. The row's own note
// calls the mount "source-inert": the mount sits behind
// `Object.const_defined?( :JasmineRails )` and no jasmine gem is in the pin.
//
// fixtures/captured/jasmine-mount-ruby-oracle.json is what
// oracle-capture-jasmine-mount-ruby.rb (tests/server/) recorded by reading
// the template out of the pinned gemset and scanning every gem's ruby
// sources for the constant. That capture was taken against the earlier,
// larger pin (151 gems).
//
// fixtures/captured/jasmine-mount-rebuilt-gemset-ruby-oracle.json is the
// SAME capture re-run against the pin this machine carries now (68 gems).
// The pin was rebuilt smaller, so the two captures differ in ONE field,
// the gem count, and in nothing else: the mount's answer is the same on
// both pins, which is the point this file pins.
//
// What the measurement says:
//
//   - The mount is guarded by TWO conjuncts: `!Rails.env.production?` (a
//     Rails environment question) and `Object.const_defined?(
//     :JasmineRails )` (a constant question).
//   - The second conjunct is the one that decides the question, and the pin
//     cannot satisfy it: no gem in the pin is named jasmine, and not one of
//     their ruby sources mentions the JasmineRails constant at all. So for
//     every deck the pin can build, the mount never fires.
//   - The template's route set for such a deck is exactly one mounted
//     engine: `mount Decko::Engine => "/"`, the surface the port already
//     serves.
//
// The port therefore needs no mount, and that is the whole of this row:
// a skip-and-name, with the inertness measured rather than asserted. The
// pins below keep the skip honest. If a future pin adds a jasmine gem, the
// fixture's `mountCanFire` flips and this test fails, which is the signal
// that the mount has become a real port obligation.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface JasmineMountOracle {
  source: string;
  guardLine: string;
  mountBlock: string[];
  routeLines: string[];
  gemCount: number;
  jasmineNamedGems: string[];
  jasmineDefiningGems: string[];
  mountCanFire: boolean;
}

function readOracle(file: string): JasmineMountOracle {
  return JSON.parse(readFileSync(path.join(REPO, file), "utf8")) as JasmineMountOracle;
}

/** The capture taken against the earlier, larger pin (151 gems). */
const ORACLE = readOracle("fixtures/captured/jasmine-mount-ruby-oracle.json");

/** The same capture re-run against the pin this machine carries now. */
const REBUILT = readOracle(
  "fixtures/captured/jasmine-mount-rebuilt-gemset-ruby-oracle.json",
);

/** A DIFFERENT capture over the SAME pin (the round-seven forgery
 *  posture capture), which is what the gem count is cross-checked
 *  against: two captures, one pin, one count. */
const SAME_PIN = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/forgery-posture-rebuilt-gemset-ruby-oracle.json"), "utf8"),
) as { gemCount: number };

describe("the deck template's JasmineRails mount against the pinned gemset", () => {
  it("the mount is guarded by the environment AND the constant", () => {
    for (const capture of [ORACLE, REBUILT]) {
      expect(capture.guardLine).toContain("!Rails.env.production?");
      expect(capture.guardLine).toContain("Object.const_defined?( :JasmineRails )");
      expect(capture.mountBlock.join("\n")).toContain('mount engine => "#{rel_root}/specs"');
    }
  });

  it("no gem in the pin can define the constant, so the mount cannot fire", () => {
    // The scan is over the WHOLE pin this machine carries, and the count
    // is cross-checked against a second capture over the same pin.
    expect(REBUILT.gemCount).toBe(SAME_PIN.gemCount);
    expect(REBUILT.jasmineNamedGems).toEqual([]);
    // The stronger half: a gem that defined the constant without carrying
    // "jasmine" in its name would still arm the mount, so the scan is over
    // the gem SOURCES, not over the directory names.
    expect(REBUILT.jasmineDefiningGems).toEqual([]);
    expect(REBUILT.mountCanFire).toBe(false);
  });

  it("the two captures of the same mount differ in the gem count alone", () => {
    // The pin was rebuilt smaller, so the recorded count moved (151 gems
    // against 68). Every field that carries the mount's ANSWER is the
    // same on both pins, so the row's disposition does not depend on
    // which pin the capture was taken against.
    expect(REBUILT.gemCount).not.toBe(ORACLE.gemCount);
    expect(REBUILT.source).toBe(ORACLE.source);
    expect(REBUILT.guardLine).toBe(ORACLE.guardLine);
    expect(REBUILT.mountBlock).toEqual(ORACLE.mountBlock);
    expect(REBUILT.routeLines).toEqual(ORACLE.routeLines);
    expect(REBUILT.jasmineNamedGems).toEqual(ORACLE.jasmineNamedGems);
    expect(REBUILT.jasmineDefiningGems).toEqual(ORACLE.jasmineDefiningGems);
    expect(REBUILT.mountCanFire).toBe(ORACLE.mountCanFire);
    expect(ORACLE.mountCanFire).toBe(false);
  });

  it("the template's route set for a pin-built deck is the Decko engine alone", () => {
    const mounts = REBUILT.routeLines.filter((line) => line.includes("mount"));
    expect(mounts).toHaveLength(2);
    // The Jasmine mount is one of them, and it is inside the inert block.
    expect(mounts.some((line) => line.includes("/specs"))).toBe(true);
    // The engine the port DOES serve.
    expect(mounts.some((line) => line.includes('Decko::Engine => "/"'))).toBe(true);
  });

  it("the port has no mounted-engine arm: a /specs path is the ordinary card arm", () => {
    // A mounted engine would answer the whole /specs prefix with the
    // engine's own routes. The port has no such arm, so /specs/x parses as
    // the standard two-segment card route (mark "specs", view "x"), which
    // is what Ruby's own route table does for any path the Decko engine
    // serves and the (inert) Jasmine mount would have shadowed.
    expect(parsePath("/specs/some_spec")).toMatchObject({ name: "specs", view: "some_spec" });
    expect(parsePath("/specs")).toMatchObject({ name: "specs", view: "open" });
    // And the port's grammar has no specs-specific branch: the two results
    // above are the ordinary card arms, so a Jasmine mount would have to be
    // added as a NEW arm, not as a fix to an existing one.
    expect(parsePath("/specs/some_spec")).not.toHaveProperty("kind");
  });
});
