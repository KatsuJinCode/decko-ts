// The P6 write half - "an administrator sets read/write rules" - graded on the
// rule-card shape Ruby renders and on the boundary the rule draws.
//
//   node --test tools/edge-signed-in-exercise/test/rule-permission-set.test.mjs
//
// PINNED AGAINST A COMMITTED RUBY CAPTURE:
//
// fixtures/captured/rules-views.json is the committed Ruby capture of the rule
// card and its walk. Tests 1-3 read it; nothing about the rule's shape, its
// type, or the names of its settings is transcribed here. If Ruby renames the
// setting, drops `update` out of the permission group, or stops making rules
// List-type cards, these tests fail rather than passing against a stale name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERMISSION_SETTINGS,
  RULE_TYPE_CODE,
  RULE_TYPE_NAME,
  permissionRuleVerdict,
  ruleKeyParts,
  ruleMembership,
} from "../lib/rule-permission-set.mjs";

const RULES = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/rules-views.json", import.meta.url), "utf8"),
);

test("Ruby's captured rule card is a List-type card named <set>+*<setting>", () => {
  const meta = RULES.rule_card.meta;
  assert.equal(meta.type_name, RULE_TYPE_NAME);
  assert.equal(meta.type_code, RULE_TYPE_CODE);
  assert.equal(meta.key, "*all+*read");
  const parts = ruleKeyParts(meta.key);
  assert.deepEqual(parts, { setKey: "*all", setting: "read", settingKey: "*read" });
});

test("the walk names the rule's setting codename and its set", () => {
  const walk = RULES.rule_card.walk;
  assert.equal(walk.rule_setting_codename, "read");
  assert.equal(walk.rule_set_key, "*all");
  // Both halves of "read/write" are in the same rule set, which is why one
  // Rules tab offers both pills.
  assert.equal(PERMISSION_SETTINGS.includes(walk.rule_setting_codename), true);
  assert.equal(PERMISSION_SETTINGS.includes("update"), true);
});

test("read and update are BOTH permission settings in Ruby's own registry", () => {
  const registry = RULES.setting_registry;
  for (const setting of PERMISSION_SETTINGS) {
    assert.equal(registry.all_settings_sorted.includes(setting), true, `${setting} not a setting`);
    assert.equal(registry.groups.permission.includes(setting), true, `${setting} not a permission setting`);
    assert.equal(registry.common_settings.includes(setting), true, `${setting} not a common setting`);
  }
});

test("a rule's content is its set membership, one member per line", () => {
  // "Anyone" in the capture: the granted set, not prose and not a boolean.
  assert.deepEqual(ruleMembership(RULES.rule_card.meta.db_content), ["Anyone"]);
  // The rule form's checkboxes serialize to CRLF-joined lines
  // (checks-permission-rules.mjs:344).
  assert.deepEqual(ruleMembership("Administrator\r\n"), ["Administrator"]);
  assert.deepEqual(ruleMembership("Administrator\r\n\r\n"), ["Administrator"]);
  assert.deepEqual(ruleMembership(""), []);
});

/** A write leg where every graded fact held. */
function passing() {
  return {
    ruleKey: "HarnessP6Card_abc+*self+*update",
    ruleTypeName: "List",
    ruleTypeCode: "list",
    setting: "update",
    ruleWalkCodename: "update",
    contentBefore: "Anyone",
    wanted: "Administrator\r\n",
    contentAfter: "Administrator\r\n",
    ruleWriteStatus: 200,
    memberVerdictBefore: 200,
    memberVerdictAfter: 403,
    secretVisibleAfter: false,
  };
}

test("a write rule the administrator set, which refuses the member's write, passes", () => {
  const verdict = permissionRuleVerdict(passing());
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
});

test("the write leg fails when the rule was OFFERED but never set", () => {
  const notSet = passing();
  notSet.contentAfter = "Anyone";
  const verdict = permissionRuleVerdict(notSet);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("ruleNotStored"), true);
  // ...and a rule whose membership never changed proves nothing, whichever way
  // the member's verdict is read.
  assert.equal(verdict.failures.includes("ruleUnchanged"), true);
});

test("a rule that answers but never moved the member's boundary fails", () => {
  const unmoved = passing();
  unmoved.memberVerdictAfter = 200;
  const verdict = permissionRuleVerdict(unmoved);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("memberVerdictUnchanged"), true);
  assert.equal(verdict.failures.includes("memberStillAllowed"), true);
});

test("a member whose page still shows the secret fails even with the verdict right", () => {
  const leaked = passing();
  leaked.secretVisibleAfter = true;
  assert.equal(permissionRuleVerdict(leaked).failures.includes("secretStillVisible"), true);
});

test("an object that is not a Ruby rule card fails on shape, not on the write", () => {
  const wrongType = passing();
  wrongType.ruleTypeName = "Cardtype";
  assert.equal(permissionRuleVerdict(wrongType).failures.includes("ruleTypeNotList"), true);

  const wrongKey = passing();
  wrongKey.ruleKey = "HarnessP6Card_abc";
  assert.equal(permissionRuleVerdict(wrongKey).failures.includes("ruleKeyShape"), true);

  // A key that names a different setting than the leg grades.
  const crossed = passing();
  crossed.ruleKey = "HarnessP6Card_abc+*self+*read";
  assert.equal(permissionRuleVerdict(crossed).failures.includes("settingNotInKey"), true);

  // The walk disagreeing with the key is a real disagreement, not a formality.
  const walkMismatch = passing();
  walkMismatch.ruleWalkCodename = "read";
  assert.equal(permissionRuleVerdict(walkMismatch).failures.includes("walkCodenameMismatch"), true);
});

test("a write that never answered fails the write leg", () => {
  for (const status of [409, 500, null, undefined]) {
    const failed = passing();
    failed.ruleWriteStatus = status;
    assert.equal(permissionRuleVerdict(failed).failures.includes("ruleWrite"), true, `status ${status}`);
  }
});

test("an empty membership cannot be what was set", () => {
  const empty = passing();
  empty.wanted = "";
  empty.contentAfter = "";
  const verdict = permissionRuleVerdict(empty);
  assert.equal(verdict.failures.includes("wantedEmpty"), true);
});