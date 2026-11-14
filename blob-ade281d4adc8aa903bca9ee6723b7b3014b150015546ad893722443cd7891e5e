// The request-level composition where the session side and the action-engine
// side meet: a bearer session token becomes an Actor, and that Actor drives a
// CardActionEngine.
// This is the module an HTTP layer (or the deploy worker) calls per write
// request — Ruby's shape is `Auth.current_id` being read inside the save
// path (auth/current.rb:7-9); here the engine is constructed per request
// instead, so the actor is explicit and no process-global exists.
//
// null/undefined/empty token => anonymous engine (every action throws
// anonymous-actor); a token that is present but unknown/expired/revoked
// resolves to the same anonymous outcome (auth/current.rb:58-63 — an
// unresolvable session card degrades to Anonymous, never an error).

import type { FetchEngine } from "../fetch.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import { SessionStore, type Actor } from "../auth/index.js";
import { withVisitorEnabledRoles } from "../session/enabled-roles.js";
import {
  CardActionEngine,
  type CardActionEngineOptions,
} from "./card-action-engine.js";

/** Resolve one bearer token to its Actor (null when anonymous). */
export async function actorFromToken(
  driver: SQLDatabaseDriver,
  token: string | null | undefined,
): Promise<Actor | null> {
  if (token === null || token === undefined || token === "") return null;
  const sessions = new SessionStore({ driver });
  return sessions.resolveActorFromToken(token);
}

/** Build a CardActionEngine whose actor comes from the session token.
 *  All engine options except `actor` pass through unchanged. */
export async function createCardActionEngineForSession(
  fetchEngine: FetchEngine,
  driver: SQLDatabaseDriver,
  token: string | null | undefined,
  opts: Omit<CardActionEngineOptions, "actor"> = {},
  cookieHeader?: string,
): Promise<CardActionEngine> {
  const actor = await actorFromToken(driver, token);
  const viewer = await withVisitorEnabledRoles(fetchEngine,
    actor === null ? { signedIn: false } : { signedIn: true, actorId: actor.id }, cookieHeader);
  return new CardActionEngine(fetchEngine, { ...opts, actor,
    ...(viewer.enabledRoleIds === undefined ? {} : { enabledRoleIds: viewer.enabledRoleIds }) });
}
