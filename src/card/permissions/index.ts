// The read-permission layer: rule resolution for an actor (start: the
// Anonymous corpus viewer) plus the denial markup contract. See
// docs/permissions-port-notes.md for the full port trail.

export {
  readPermissionStatements,
  readPermissionStateFromResults,
  anonymousIdFromResults,
  resolveAnonymousReadPermission,
  canReadByStoredRule,
  canReadByRuleLookup,
  type ReadPermissionState,
} from "./read-rules.js";
export { viewPerms, viewDenialView, quietDenial, type ViewPerms } from "./view-perms.js";
