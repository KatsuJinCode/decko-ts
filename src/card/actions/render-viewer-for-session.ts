// The render-path twin of engine-for-session.ts: a bearer session token
// becomes the READ-PERMISSION viewer (ReadViewer, src/card/permissions/
// read-rules.ts) whose readable-set union drives the render verdicts.
//
// Ruby shape: the read check is `Auth.as_card.read_rules_hash[read_rule_id]`
// (card-mod-permissions set/all/permissions.rb:142) — the session's user
// card IS the permission actor. Here the token resolves to the account
// card id (actorFromToken, engine-for-session.ts — the exact seam the
// write path uses, auth/current.rb:58-63 degradation included: a null /
// unknown / expired / revoked token yields the Anonymous viewer, never an
// error and never a half-privileged state).

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { actorFromToken } from "./engine-for-session.js";
import { ANONYMOUS_VIEWER, type ReadViewer } from "../permissions/index.js";

/**
 * Resolve one bearer token to its read-permission viewer.
 *
 * null/undefined/empty token, or a token that is unknown / expired /
 * revoked / points at a dead account card, resolves to ANONYMOUS_VIEWER —
 * the same degradation the write path applies (auth/current.rb:58-63, an
 * unresolvable session card signs in as Anonymous).
 *
 * Engine hookup: RenderEngine resolves the permission state lazily on the
 * first render; hand this viewer to the engine before that first render
 * (see docs/permission-actors-notes.md for the exact RenderEngine lines —
 * the field default keeps the corpus viewer byte-identical).
 */
export async function viewerFromToken(
  driver: SQLDatabaseDriver,
  token: string | null | undefined,
): Promise<ReadViewer> {
  const actor = await actorFromToken(driver, token);
  return actor === null ? ANONYMOUS_VIEWER : { signedIn: true, actorId: actor.id };
}
