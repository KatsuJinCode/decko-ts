// The write half of "an administrator sets read/write rules", graded on Ruby's
// own rule-card shape and on the boundary the administrator just drew.
//
// WHAT RUBY'S RULE CARD IS, from the committed Ruby capture
// fixtures/captured/rules-views.json:
//
//   rule_card.meta   {db_content: "Anyone", id: 10, key: "*all+*read",
//                     name: "*all+*read", type_code: "list", type_id: 4,
//                     type_name: "List"}
//   rule_card.walk   {categories: ["all","recent","common"], rule_set_key: "*all",
//                     rule_setting_codename: "read", rule_setting_count: 17,
//                     short_help_text: "who can view cards"}
//   setting_registry all_settings_sorted: [... "update" ...]
//                     common_settings: ["structure","default","create","read",
//                                        "update","delete","guide"]
//                     groups.permission: ["create","read","update","delete",
//                                         "captcha"]
//
// Three facts fall out of those bytes, and the predicate rests on all three:
//
// 1. A permission rule is a List-type card named `<set>+*<setting>`; its
//    db_content is the SET MEMBERSHIP it grants to - "Anyone" in the capture,
//    not prose and not a boolean.
// 2. The setting has its own codename, and the walk names it
//    (rule_setting_codename "read"). read and update are in the SAME registry
//    group (groups.permission) and the same common_settings list, so the update
//    rule is not a different kind of object from the read rule.
// 3. The two are settings of the SAME rule set (`*all` for both), which is why
//    one Rules tab offers both pills and why setting one can be graded the same
//    way as the other.
//
// Registry row cap-P6 (tools/edge-signed-in-exercise/capabilities.json, id P6)
// recorded that both its checks pass but that "the 'write' half of 'sets
// read/write rules' is only offered, never set: no check writes an update rule
// and re-reads a member's write verdict". This module grades that half. The
// read leg's own boundary - the member's READ flipping 200 -> 403 with the
// secret absent - is the same shape one setting over, and grading it separately
// keeps the two halves from being satisfied by one observation.

/** The two permission settings this row's capability names. */
export const PERMISSION_SETTINGS = Object.freeze(["read", "update"]);

/** Ruby stores a permission rule as a List-type card (rules-views.json
 *  rule_card.meta.type_name "List", type_code "list"). */
export const RULE_TYPE_NAME = "List";
export const RULE_TYPE_CODE = "list";

/** `<set>+*<setting>` - the key shape the capture's rule_card carries
 *  ("*all+*read"). */
export function ruleKeyParts(ruleKey) {
  const segments = String(ruleKey ?? "").split("+").map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const setting = segments[segments.length - 1];
  const setKey = segments.slice(0, -1).join("+");
  const codename = /^\*(.+)$/.exec(setting);
  if (codename === null || setKey === "") return null;
  return { setKey, setting: codename[1], settingKey: setting };
}

/** The membership a rule names, read the way the rule form writes it:
 *  permissionEditor checkboxes serialize to CRLF-joined lines
 *  (checks-permission-rules.mjs:344). */
export function ruleMembership(dbContent) {
  return String(dbContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * One permission leg, graded. `evidence`:
 *   ruleKey            the rule card's key, "<set>+*<setting>"
 *   ruleTypeName       its Cardtype name ("List")
 *   ruleTypeCode       its Cardtype code ("list")
 *   setting            the codename the administrator edited ("read"/"update")
 *   ruleWalkCodename   rule_card.walk.rule_setting_codename, when the walk ran
 *   contentBefore      db_content before the edit
 *   wanted             the membership the administrator chose
 *   contentAfter       db_content after the edit
 *   ruleWriteStatus    HTTP status of the rule write
 *   memberVerdictBefore  the member's status for this setting, before
 *   memberVerdictAfter   the member's status for this setting, after
 *   secretVisibleAfter   whether the member's page still shows the secret
 *
 * Returns {ok, failures}.
 */
export function permissionRuleVerdict(evidence) {
  const {
    ruleKey,
    ruleTypeName,
    ruleTypeCode,
    setting,
    ruleWalkCodename,
    contentBefore,
    wanted,
    contentAfter,
    ruleWriteStatus,
    memberVerdictBefore,
    memberVerdictAfter,
    secretVisibleAfter,
  } = evidence;
  const failures = [];

  // The rule is the object Ruby says it is: a List-type card whose key names a
  // set and a setting.
  const parts = ruleKeyParts(ruleKey);
  if (parts === null) {
    failures.push("ruleKeyShape");
  } else {
    if (parts.setting !== setting) failures.push("settingNotInKey");
    if (parts.setKey === "") failures.push("noSetKey");
  }
  if (ruleTypeName !== RULE_TYPE_NAME || ruleTypeCode !== RULE_TYPE_CODE) failures.push("ruleTypeNotList");
  if (ruleWalkCodename !== undefined && ruleWalkCodename !== null && ruleWalkCodename !== setting) {
    failures.push("walkCodenameMismatch");
  }

  // The administrator's edit actually landed and actually CHANGED the rule.
  // A leg that reads the same membership before and after proves nothing.
  if (ruleWriteStatus === null || ruleWriteStatus === undefined || ruleWriteStatus >= 400) {
    failures.push("ruleWrite");
  }
  const wantedMembership = ruleMembership(wanted);
  const afterMembership = ruleMembership(contentAfter);
  if (wantedMembership.length === 0) failures.push("wantedEmpty");
  if (afterMembership.join("\n") !== wantedMembership.join("\n")) failures.push("ruleNotStored");
  const beforeMembership = ruleMembership(contentBefore);
  if (beforeMembership.join("\n") === afterMembership.join("\n")) failures.push("ruleUnchanged");

  // The boundary: the member's verdict for THIS setting must have moved, and
  // the restricted content must be gone from the member's page. A member the
  // administrator excluded answers 403 (read) or a refused write; either way the
  // verdict must have flipped away from what it was.
  if (memberVerdictBefore === undefined || memberVerdictBefore === null) {
    failures.push("noMemberVerdictBefore");
  }
  if (memberVerdictAfter === null || memberVerdictAfter === undefined) failures.push("noMemberVerdictAfter");
  if (memberVerdictBefore !== undefined && memberVerdictBefore !== null &&
      memberVerdictAfter !== undefined && memberVerdictAfter !== null &&
      memberVerdictBefore === memberVerdictAfter) {
    failures.push("memberVerdictUnchanged");
  }
  if (memberVerdictAfter !== null && memberVerdictAfter !== undefined && memberVerdictAfter < 400) {
    failures.push("memberStillAllowed");
  }
  if (secretVisibleAfter !== false) failures.push("secretStillVisible");

  return { ok: failures.length === 0, failures };
}