/** The staging server's host-env -> recaptcha-config source
 *  . vm-staging-server.mjs composes its
 *  WriteRouteContext (src/server/write-routes.ts) once at boot; this module
 *  is the one field that composition gained: the recaptcha seat's config,
 *  read from the host environment the same way the host's other engine
 *  inputs are (DECKO_FILES_DIR, DECKO_ORIGIN), so the deployed composition
 *  code never changes when ops arms the guard — only the environment does.
 *
 *  DEPLOYMENT KEYS (ops documentation; no values live in this repo):
 *    DECKO_RECAPTCHA_SITE_KEY      -> CardActionRecaptchaConfig.siteKey
 *    DECKO_RECAPTCHA_SECRET_KEY    -> CardActionRecaptchaConfig.secretKey
 *    DECKO_RECAPTCHA_MINIMUM_SCORE -> .minimumScore (finite number; the
 *                                     engine default 0.5 stands when absent,
 *                                     RECAPTCHA_CARDIO_CONFIG_DEFAULTS)
 *    DECKO_RECAPTCHA_VERIFY_URL    -> .verifyUrl (the engine default — the
 *                                     real Google siteverify GET — stands
 *                                     when absent)
 *
 *  INERT BY DEFAULT: with no key set (or every key blank — a blank env var
 *  is "unset" in ops idiom, and a whitespace-only secret would otherwise
 *  arm a guard that siteverifies every anonymous save against a blank
 *  secret) this returns undefined and the host composes NO recaptcha field
 *  — the exact pre-wiring context, byte-identical (the route seat's unarmed
 *  discipline, write-routes.ts:154-168). The arming rule mirrors Ruby's
 *  config model rather than second-guessing it: ANY key present composes
 *  the config through UNCHANGED, and the guard's own recaptcha_keys?
 *  (site && secret, card-mod-recaptcha.ts:228-235 = recaptcha.rb:46-48)
 *  disarms a half-configured host exactly as Ruby does.
 *
 *  NOT sourced here, by contract: captchaRuleContent (the engine's rule-walk
 *  default stands — ruleContentForCard over the deck's own *captcha rule
 *  cards, card-action-engine.ts:1884-1890) and verify (the real siteverify
 *  GET stands, :1930) — the route seat's proven defaults; alwaysOk /
 *  needsSetup (Auth state, engine defaults false — card-action-engine.ts
 *  :273-280) are not Cardio.config keys.
 *
 *  A malformed minimumScore throws: the deployment contract is boot-fail
 *  loud (the same posture as runAuthMigrations on a read-only corpus file),
 *  never a silently mis-armed guard. */

import type { CardActionRecaptchaConfig } from "../card/actions/card-action-engine.js";

/** Whitespace-only (or absent) -> undefined; otherwise the trimmed value. */
function nonBlankEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** The host's recaptcha config from the process environment — undefined
 *  when the host supplied nothing (the inert default). */
export function recaptchaConfigFromHostEnv(
  env: Record<string, string | undefined>,
): CardActionRecaptchaConfig | undefined {
  const siteKey = nonBlankEnv(env.DECKO_RECAPTCHA_SITE_KEY);
  const secretKey = nonBlankEnv(env.DECKO_RECAPTCHA_SECRET_KEY);
  if (siteKey === undefined && secretKey === undefined) return undefined;

  const minimumScoreRaw = nonBlankEnv(env.DECKO_RECAPTCHA_MINIMUM_SCORE);
  let minimumScore: number | undefined;
  if (minimumScoreRaw !== undefined) {
    const parsed = Number(minimumScoreRaw);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `staging recaptcha env: DECKO_RECAPTCHA_MINIMUM_SCORE="${minimumScoreRaw}" ` +
          `is not a finite number — refusing to boot with a mis-armed guard`,
      );
    }
    minimumScore = parsed;
  }
  const verifyUrl = nonBlankEnv(env.DECKO_RECAPTCHA_VERIFY_URL);

  return {
    siteKey,
    secretKey,
    ...(minimumScore !== undefined ? { minimumScore } : {}),
    ...(verifyUrl !== undefined ? { verifyUrl } : {}),
  };
}
