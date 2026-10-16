import assert from "node:assert/strict";
import { test } from "node:test";
import { assertBunnyScriptBudget, BUNNY_SCRIPT_LIMIT_BYTES } from "../../../tools/vendor/edge-bundle-budget.mjs";
import { assertStaticUglifierCurrent } from "../../../tools/vendor/build-uglify-harmony-static.mjs";

test("Bunny budget accepts the exact decimal byte limit and rejects one byte more", () => {
  assert.equal(BUNNY_SCRIPT_LIMIT_BYTES, 10_000_000);
  assert.equal(assertBunnyScriptBudget("x".repeat(10_000_000)), 10_000_000);
  assert.throws(() => assertBunnyScriptBudget("x".repeat(10_000_001)), /10000001 UTF-8 bytes/);
});
test("Bunny budget counts UTF-8 bytes rather than JavaScript characters", () => {
  const exact = "😀".repeat(2_500_000);
  assert.equal(exact.length, 5_000_000);
  assert.equal(assertBunnyScriptBudget(exact), 10_000_000);
  assert.throws(() => assertBunnyScriptBudget(exact + "a"), /10000001 UTF-8 bytes/);
});
test("the checked-in compiler and provenance reproduce from pinned unchanged vendor sources", () => {
  const provenance = assertStaticUglifierCurrent();
  assert.equal(provenance.trustedFactorySignatures, 201);
  assert.equal(provenance.executableConstructorOffsets.length, 5);
});
