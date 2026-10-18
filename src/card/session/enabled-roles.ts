import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { NameNotFoundError, CodenameNotFoundError } from "../name/errors.js";
import type { ReadViewer } from "../permissions/read-rules.js";
import { rawItemStrings } from "../render/pointer-list.js";
import { readVisitorSession, sessionCardContent } from "./visitor-session.js";

/** Selection is untrusted input. The permission resolver intersects these
 * IDs with the actor's current grants; a cookie never confers a role. */
export async function withVisitorEnabledRoles(
  fetcher: FetchEngine, viewer: ReadViewer, cookieHeader: string | undefined,
  ensureFreshness?: () => Promise<void>,
): Promise<ReadViewer> {
  if (!viewer.signedIn || viewer.actorId === undefined) return viewer;
  const session = readVisitorSession(cookieHeader);
  if (Object.keys(session.cards).length === 0) return viewer;
  await ensureFreshness?.();
  await fetcher.codenames.ensureLoaded();
  const setting = fetcher.codenames.peekName("enabled_roles");
  if (setting === undefined) return viewer;
  const actor = await fetcher.fetchById(viewer.actorId, { skipVirtual: true });
  if (actor?.name == null) return viewer;
  const sessionName = `${actor.name.s}+${setting}`;
  const content = sessionCardContent(session, sessionName);
  // Ruby Session#virtual? requires present session content; blank means defaults.
  if (content === undefined || content.trim() === "") return viewer;
  const ids: number[] = [];
  for (const item of rawItemStrings(content)) {
    try {
      const name = DeckoName.parse(item).absoluteName(DeckoName.parse(sessionName));
      const role = await fetcher.fetchByKey(name.key, { skipVirtual: true });
      if (role?.id !== undefined && !ids.includes(role.id)) ids.push(role.id);
    } catch (error) {
      // Stock item_names drops unresolved ID/codename marks, not driver failures.
      if (!(error instanceof NameNotFoundError || error instanceof CodenameNotFoundError)) throw error;
    }
  }
  return { ...viewer, enabledRoleIds: ids };
}

/** Stable partition for retained permission and rendered-page caches. */
export function permissionViewerKey(viewer: ReadViewer): string {
  const roles = viewer.enabledRoleIds === undefined ? "default"
    : [...new Set(viewer.enabledRoleIds)].sort((a, b) => a - b).join(",");
  return `${viewer.signedIn ? "signed-in" : "anonymous"}:${viewer.actorId ?? ""}:${roles}`;
}
