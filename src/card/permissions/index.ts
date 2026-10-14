// The read-permission layer: rule resolution for an actor (the anonymous
// viewer by default, signed-in session actors via ReadViewer) plus
// the denial markup contract.

export {
  actorKeyFromResults,
  ANONYMOUS_VIEWER,
  anonymousIdFromResults,
  canReadByRuleLookup,
  canReadByStoredRule,
  PERMISSION_GATE_COUNT_STATEMENT_INDEX,
  permissionGateCountJsonArm,
  primeRuleClosureUniverse,
  readPermissionStateFromResults,
  readPermissionStateFromViewerResults,
  readPermissionStatements,
  resolveAnonymousReadPermission,
  ruleClosureWalkStatement,
  type ReadPermissionState,
  type ReadViewer,
} from "./read-rules.js";
export { viewPerms, viewDenialView, quietDenial, type ViewPerms } from "./view-perms.js";
