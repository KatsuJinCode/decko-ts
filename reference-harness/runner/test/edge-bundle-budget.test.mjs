import assert from "node:assert/strict";
import { test } from "node:test";
import { assertBunnyScriptBudget, BUNNY_SCRIPT_LIMIT_BYTES } from "../../../tools/vendor/edge-bundle-budget.mjs";
import { assertStaticUglifierCurrent } from "../../../tools/vendor/build-uglify-harmony-static.mjs";

test("Bunny budget accepts the exact boot-safe byte limit and rejects one byte more", () => {
  assert.equal(BUNNY_SCRIPT_LIMIT_BYTES, 9_200_000);
  assert.equal(assertBunnyScriptBudget("x".repeat(9_200_000)), 9_200_000);
  assert.throws(() => assertBunnyScriptBudget("x".repeat(9_200_001)), /9200001 UTF-8 bytes/);
});
test("Bunny budget rejects the size of a script that deployed but never booted", () => {
  // The 9,998,789-byte release-candidate bundle uploaded and published without
  // error on staging script 96895, then answered every request with an empty
  // HTTP 400. The budget has to stop it here instead.
  assert.throws(() => assertBunnyScriptBudget("x".repeat(9_998_789)), /9998789 UTF-8 bytes/);
});
test("Bunny budget counts UTF-8 bytes rather than JavaScript characters", () => {
  const exact = "😀".repeat(2_300_000);
  assert.equal(exact.length, 4_600_000);
  assert.equal(assertBunnyScriptBudget(exact), 9_200_000);
  assert.throws(() => assertBunnyScriptBudget(exact + "a"), /9200001 UTF-8 bytes/);
});
test("the checked-in compiler and provenance reproduce from pinned unchanged vendor sources", () => {
  const provenance = assertStaticUglifierCurrent();
  assert.equal(provenance.trustedFactorySignatures, 201);
  assert.equal(provenance.executableConstructorOffsets.length, 5);
});