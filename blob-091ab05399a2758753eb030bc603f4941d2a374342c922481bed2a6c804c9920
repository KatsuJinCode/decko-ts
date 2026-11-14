// src/card/session/visitor-session.ts
//
// The per-visitor session state Ruby Decko keeps in its Rails session, for
// signed-in and anonymous visitors alike:
//
//   - the location history (card-1.110.0 lib/card/env/location_history.rb):
//     the pages the visitor has viewed, so a delete can send them back to
//     the last page that still exists (card-mod-session
//     set/all/location_history.rb);
//   - Session-type card content (card-mod-session set/type/session.rb):
//     saving a Session card keeps its content under "_card_<key>" in the
//     session instead of in the card tables.
//
// The port carries this state in its own cookie (VISITOR_COOKIE_NAME), apart
// from the sign-in cookie, so it survives sign-in exactly as Ruby's session
// does and is dropped on sign-out with Env.reset_session (signin.rb:21).
// Entries are validated on read: a history entry must be a path or an
// http(s) URL, so a hand-edited cookie can at most redirect its own visitor
// to another page path.

import { DeckoName } from "../name.js";

export const VISITOR_COOKIE_NAME = "decko_visit";

/** Ruby's history keeps at most this many entries before shifting the
 *  oldest one out (location_history.rb:8, `shift if size > 5`). */
const HISTORY_LIMIT = 5;

/** Session content Ruby would refuse to keep (the cookie store's 4 KB
 *  limit raises CookieOverflow); the port drops oversized state instead of
 *  emitting a cookie browsers discard. */
const COOKIE_VALUE_LIMIT = 3800;

export interface VisitorSession {
  /** The location history, oldest first; undefined until first used. */
  history?: string[];
  /** Session-type card content by card key (session.rb session_key). */
  cards: Record<string, string>;
  /** Env.session[:comment_author] (card-mod-comment set/all/comment.rb:6):
   *  the sticky comment author the add_comment event writes and its
   *  reader's session arm (comment.rb:16-19) reads first. Undefined until
   *  a comment save writes it. */
  commentAuthor?: string;
}

export function emptyVisitorSession(): VisitorSession {
  return { cards: {} };
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const LOCATION = /^(\/(?!\/)|https?:\/\/)[^\s]*$/;

/** The visitor state carried by a request's Cookie header (empty when the
 *  cookie is absent or unreadable). */
export function readVisitorSession(cookieHeader: string | undefined): VisitorSession {
  const state = emptyVisitorSession();
  if (cookieHeader === undefined) return state;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== VISITOR_COOKIE_NAME) continue;
    try {
      const raw = JSON.parse(base64UrlDecode(part.slice(eq + 1).trim())) as {
        h?: unknown;
        c?: unknown;
        a?: unknown;
      };
      if (Array.isArray(raw.h)) {
        state.history = raw.h.filter((l): l is string => typeof l === "string" && LOCATION.test(l));
      }
      if (raw.c !== null && typeof raw.c === "object") {
        for (const [k, v] of Object.entries(raw.c as Record<string, unknown>)) {
          if (typeof v === "string") state.cards[k] = v;
        }
      }
      if (typeof raw.a === "string" && raw.a !== "") {
        state.commentAuthor = raw.a;
      }
    } catch {
      // an unreadable cookie is a fresh session
    }
  }
  return state;
}

/** The Set-Cookie value that stores the state (or clears the cookie when
 *  the state is empty). */
export function visitorSessionCookie(state: VisitorSession, opts?: { secure?: boolean }): string {
  const attrs = `Path=/; HttpOnly; SameSite=Lax${opts?.secure === true ? "; Secure" : ""}`;
  const payload: { h?: string[]; c?: Record<string, string>; a?: string } = {};
  if (state.history !== undefined) payload.h = state.history;
  if (Object.keys(state.cards).length > 0) payload.c = state.cards;
  if (state.commentAuthor !== undefined && state.commentAuthor !== "") {
    payload.a = state.commentAuthor;
  }
  if (payload.h === undefined && payload.c === undefined && payload.a === undefined) {
    return `${VISITOR_COOKIE_NAME}=; ${attrs}; Max-Age=0`;
  }
  let value = base64UrlEncode(JSON.stringify(payload));
  if (value.length > COOKIE_VALUE_LIMIT && payload.c !== undefined) {
    value = base64UrlEncode(JSON.stringify({ h: payload.h ?? [] }));
  }
  return `${VISITOR_COOKIE_NAME}=${value}; ${attrs}`;
}

/** location_history (location_history.rb:6-10): starts as the deck root,
 *  and sheds its oldest entry whenever it has grown past the limit. */
export function locationHistory(state: VisitorSession): string[] {
  state.history ??= ["/"];
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  return state.history;
}

/** save_location? (location_history.rb:47-51): a page view of a known card,
 *  as HTML and not by ajax, other than the sign-in card. */
export function shouldSaveLocation(view: {
  known: boolean;
  html: boolean;
  ajax: boolean;
  codename?: string | null;
}): boolean {
  return !view.ajax && view.html && view.known && view.codename !== "signin";
}

/** save_location (location_history.rb:12-17): the request URL is pushed,
 *  then duplicates are dropped keeping the FIRST occurrence (`uniq!`), so a
 *  page already in the history does not move to its end. */
export function saveLocation(state: VisitorSession, url: string): void {
  if (!LOCATION.test(url)) return;
  const history = locationHistory(state);
  history.push(url);
  state.history = [...new Set(history)];
}

/** previous_location (location_history.rb:19-21). */
export function previousLocation(state: VisitorSession): string {
  return locationHistory(state).at(-1) ?? "/";
}

/** location_cardname (location_history.rb:41-43): the first path segment,
 *  read as a card name. */
function locationCardKey(location: string): string {
  let path = location;
  const scheme = /^https?:\/\/[^/]*/.exec(location);
  if (scheme !== null) path = location.slice(scheme[0].length);
  path = path.replace(/[?#].*$/, "").replace(/^\//, "").replace(/\/.*$/, "");
  return DeckoName.parse(path).key;
}

/** discard_locations_for (location_history.rb:23-27): every history entry
 *  that names the card goes. */
export function discardLocationsFor(state: VisitorSession, cardName: string): void {
  const key = DeckoName.parse(cardName).key;
  state.history = locationHistory(state).filter((l) => locationCardKey(l) !== key);
}

/** Session-type card content (session.rb session_key / session_content). */
export function sessionCardContent(state: VisitorSession, cardName: string): string | undefined {
  return state.cards[DeckoName.parse(cardName).key];
}

/** store_in_session (session.rb:37-40): the saved content replaces the
 *  session's; delete_in_session (:42-45) clears it. */
export function storeSessionCardContent(
  state: VisitorSession,
  cardName: string,
  content: string | undefined,
): void {
  const key = DeckoName.parse(cardName).key;
  if (content === undefined) delete state.cards[key];
  else state.cards[key] = content;
}

/** The page-view hook (event :save_current_location, before: :show_page,
 *  on: :read — card-mod-session set/all/location_history.rb:6-8): a host
 *  calls this when it renders a card page and adds the returned Set-Cookie
 *  value to the response (undefined: nothing to store). */
export function pageViewCookie(
  cookieHeader: string | undefined,
  url: string,
  view: { known: boolean; html: boolean; ajax: boolean; codename?: string | null },
  opts?: { secure?: boolean },
): string | undefined {
  if (!shouldSaveLocation(view)) return undefined;
  const state = readVisitorSession(cookieHeader);
  const before = visitorSessionCookie(state, opts);
  saveLocation(state, url);
  const after = visitorSessionCookie(state, opts);
  return after === before ? undefined : after;
}

/** Whether two states would store the same cookie. */
export function sameVisitorSession(a: VisitorSession, b: VisitorSession): boolean {
  return visitorSessionCookie(a) === visitorSessionCookie(b);
}

export function cloneVisitorSession(state: VisitorSession): VisitorSession {
  return {
    ...(state.history === undefined ? {} : { history: [...state.history] }),
    cards: { ...state.cards },
  };
}
