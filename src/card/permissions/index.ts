// The read-permission layer: rule resolution for an actor (the Anonymous
// corpus viewer by default, signed-in session actors via ReadViewer) plus
// the denial markup contract. See docs/permissions-port-notes.md and
// docs/permission-actors-notes.md for the port trails.

export {
  ANONYMOUS_VIEWER,
  anonymousIdFromResults,
  canReadByRuleLookup,
  canReadByStoredRule,
  readPermissionStateFromResults,
  readPermissionStateFromViewerResults,
  readPermissionStatements,
  resolveAnonymousReadPermission,
  type ReadPermissionState,
  type ReadViewer,
} from "./read-rules.js";
export { viewPerms, viewDenialView, quietDenial, type ViewPerms } from "./view-perms.js";
