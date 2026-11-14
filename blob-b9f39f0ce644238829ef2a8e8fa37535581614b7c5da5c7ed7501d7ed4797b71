export const SESSION_COOKIE_NAME = "decko_ts_session";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 48;

export function readSessionCookie(cookieHeader: unknown): string | null {
  if (typeof cookieHeader !== "string" || cookieHeader === "") return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

export function sessionCookieHeader(token: string, secure = false): string {
  return (
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${SESSION_COOKIE_MAX_AGE}${secure ? "; Secure" : ""}`
  );
}

export function clearedSessionCookieHeader(secure = false): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function arrivedOverTls(request: Request, url: URL): boolean {
  if (url.protocol === "https:") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded === null) return false;
  return forwarded.split(",")[0]?.trim().toLowerCase() === "https";
}
