// The strict-parity flags: the operator's one-to-one ruling on the port's
// deliberate improvements. Where the port improved on the original's
// behaviour, the original's exact behaviour stays reachable behind a switch,
// so a one-to-one port is always available. Each flag is OFF by default
// (the improved behaviour is what every host serves), and ON reproduces the
// recorded Ruby behaviour, one for one, against the side-effects battery's
// recordings (tools/parity-side-effects/scenarios.json):
//
//   * DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS: Ruby's sign-in and
//     forgot-password answers name the field that failed ("Unrecognized
//     email.", "Wrong password", 422 "EMAIL: not recognized"); the port's
//     default answers every failure uniformly ("Wrong email or password.",
//     the reset redirect) so neither the answer nor its timing says whether
//     an address has an account (docs/SECURITY.md, approved divergence 4).
//     Recorded cases: signin-unknown, signin-wrong-password,
//     reset-unknown-email. This switch forces the uniform-failure policy
//     off while it is on (auth/signin-security.ts); DECKO_SIGNIN_UNIFORM_FAILURE
//     keeps its own meaning beside it.
//   * DECKO_STRICT_PARITY_REVISION_RESTORE_500: restoring an old version of
//     a File or Image card crashes Ruby (card-mod-carrierwave's revision
//     override takes a keyword where the history mod passes positionals,
//     ArgumentError -> 500); the port restores the version, which is what
//     the revert was written to do. Recorded case: admin-restore-file-revision
//     (with admin-deny-signup its location-history knock-on).
//   * DECKO_STRICT_PARITY_SKIN_CREATE_500: creating a Bootswatch skin whose
//     +parent names a card that is not a skin crashes Ruby
//     (validate_theme_template -> theme_card on a non-skin -> NoMethodError
//     -> 500); the port refuses the create with the validation error the
//     event was written to give (422 "ABORT: not a valid theme <name>").
//     Recorded case: admin-create-skin-bad-parent.
//   * DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES: Ruby names a compiled
//     asset bundle's file by the wall clock (the stand-in action id
//     Time.now.to_i, card-mod-carrierwave
//     lib/carrier_wave/file_card_uploader.rb:147-151), so every deploy
//     changes every bundle URL; the port names the file by the bundle
//     bytes, so a URL changes only when the bundle's content does. Recorded
//     evidence: the get-home step of the side-effects battery.
//
// The settings ride the same environment surface as the other host settings
// (the DECKO_* variables, docs/SECURITY.md's Configuration row); edge hosts
// read them from their own settings bag through configureStrictParity, the
// same arrangement the sign-in policy uses (auth/signin-security.ts). An
// invalid value fails loudly, naming the setting.

/** The four switches, each defaulting off (the improved behaviour). */
export interface StrictParityFlags {
  readonly signinDetailedErrors: boolean;
  readonly revisionRestore500: boolean;
  readonly skinCreate500: boolean;
  readonly scriptBundleClockNames: boolean;
}

/** The environment names the flags read, in declaration order. */
export const STRICT_PARITY_ENV_NAMES = {
  signinDetailedErrors: "DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS",
  revisionRestore500: "DECKO_STRICT_PARITY_REVISION_RESTORE_500",
  skinCreate500: "DECKO_STRICT_PARITY_SKIN_CREATE_500",
  scriptBundleClockNames: "DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES",
} as const;

/** The environment shape: the four names, all optional. */
export type StrictParityEnv = Partial<Record<(typeof STRICT_PARITY_ENV_NAMES)[keyof typeof STRICT_PARITY_ENV_NAMES], unknown>>;

function readSwitch(raw: unknown, name: string): boolean {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "" || value === "off") return false;
  if (value === "on") return true;
  throw new Error(`${name} must be "on" or "off", got ${JSON.stringify(raw)}`);
}

/** Build the flags from a settings bag; unset values take the defaults
 *  (every flag off: the improved behaviour). Throws on a value it cannot
 *  honour, so a misconfiguration fails loudly. */
export function strictParityFlagsFromEnv(env: StrictParityEnv | undefined): StrictParityFlags {
  return {
    signinDetailedErrors: readSwitch(env?.[STRICT_PARITY_ENV_NAMES.signinDetailedErrors], STRICT_PARITY_ENV_NAMES.signinDetailedErrors),
    revisionRestore500: readSwitch(env?.[STRICT_PARITY_ENV_NAMES.revisionRestore500], STRICT_PARITY_ENV_NAMES.revisionRestore500),
    skinCreate500: readSwitch(env?.[STRICT_PARITY_ENV_NAMES.skinCreate500], STRICT_PARITY_ENV_NAMES.skinCreate500),
    scriptBundleClockNames: readSwitch(env?.[STRICT_PARITY_ENV_NAMES.scriptBundleClockNames], STRICT_PARITY_ENV_NAMES.scriptBundleClockNames),
  };
}

let configured: StrictParityFlags | undefined;

/** Set the flags explicitly (a host with its own settings bag, such as a
 *  Workers `env`), or clear them (undefined) to fall back to process.env. */
export function configureStrictParity(flags: StrictParityFlags | undefined): void {
  configured = flags;
}

function processEnv(): StrictParityEnv | undefined {
  const proc = (globalThis as { process?: { env?: StrictParityEnv } }).process;
  return proc?.env;
}

/** The flags in force: the configured ones, else process.env, else the
 *  defaults. */
export function strictParityFlags(): StrictParityFlags {
  return configured ?? strictParityFlagsFromEnv(processEnv());
}

/** The error a strict-parity site throws to reproduce a recorded Ruby
 *  crash. Deliberately NOT a CardActionError: Ruby's crash is not a
 *  validation answer, and the write surface renders it as the recorded
 *  production 500 (the "Wild Card!" server_error page), not as an errors
 *  alert. */
export class StrictParityCrashError extends Error {
  /** The flag that asked for the crash, for the diagnostic record. */
  readonly flag: string;

  constructor(flag: string, message: string) {
    super(message);
    this.name = "StrictParityCrashError";
    this.flag = flag;
  }
}
