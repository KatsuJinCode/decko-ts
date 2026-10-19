// The card-mod-recaptcha gem (card-mod-recaptcha-0.20.0), ported through
// the mod loader - every set module the gem's set/ tree ships, plus the
// one html view the gem declares (the compat report's
// classification.metrics.htmlViewsMissingNames is EMPTY: nothing missing).
//
// The gem's tree (the installed
// card-mod-recaptcha-0.20.0/), all 8 set files (compat-report "setModules":
// 8; setModulesByPattern abstract:1, all:1, right:3, self:3):
//   set/abstract/recaptcha_setting.rb - events validate_recaptcha_field
//                                       (:validate, 1-5) +
//                                       set_recaptcha_site_key (:finalize,
//                                       7-9) + recaptcha_setting? (11-13)
//   set/all/recaptcha.rb              - RECAPTCHA_ERROR_CODES (1-7),
//                                       human?/recaptcha_on?/
//                                       recaptcha_success?/... methods,
//                                       event :recaptcha (:validate, 50-55),
//                                       format :html helper methods (74-104)
//   set/right/captcha.rb              - assign_type :toggle (one line)
//   set/right/secret_key.rb           - include_set Abstract::RecaptchaSetting
//   set/right/site_key.rb             - include_set Abstract::RecaptchaSetting
//   set/self/admin.rb                 - basket[:warnings] warning + admin
//                                       html format helpers (7-26)
//   set/self/captcha.rb               - setting_opts (1-5) +
//                                       captcha_used?/captcha_used! (7-13)
//   set/self/recaptcha_settings.rb    - format :html: raw_help_text (2-8)
//                                       + view :core (11-13)
// plus lib/card/mod/recaptcha.rb (the Cardio::Railtie config defaults - the
// seven recaptcha_* keys) and config/late/recaptcha.rb (the RecaptchaCard
// module: deprecated config names, the development defaults, and the
// card > config > deprecated > default key resolution).
//
// Ported here as faithfully as a headless engine permits:
//   - set/self/recaptcha_settings.rb's html view :core (11-13): the ONLY
//     html view the gem declares (compat-report viewsByFormat.html ==
//     ["core"]). Each branch is field_nest (card-1.110.0 lib/card/format/
//     nesting.rb:27-31): the field child name, the capitalized title
//     variant (name_variants.rb:7 "capitalized" -> :capitalize), NO view
//     option - the html format's default_nest_view supplies :titled
//     (card-mod-format set/all/html.rb:17-19). The same set module's
//     raw_help_text string (recaptcha_settings.rb:2-8) is exported as
//     RECAPTCHA_SETTINGS_HELP_TEXT.
//   - set/self/captcha.rb's setting_opts (group :permission, position 5,
//     help_text) - the registry entry; rule_type_editable defaults false
//     (card-1.110.0 lib/card/setting.rb:61). The module's per-card
//     captcha_used?/captcha_used! state (7-13) is the captchaUsedTracker
//     factory below.
//   - the set modules' DETERMINISTIC pure semantics, ported as exported
//     functions so tests can prove them against the Ruby lines (the
//     api_key-port convention for helper methods with no view slot):
//     RECAPTCHA_ERROR_CODES (recaptcha.rb:1-7), the human? composition
//     (recaptcha.rb:9-14), the recaptcha_on? conjunction (16-23, env/auth
//     inputs injected), add_recaptcha_errors (25-33), the success
//     predicate (35-39), recaptcha_keys? (46-48), the token special-cases
//     of handle_recaptcha_config_errors (57-66), the validate_recaptcha?
//     conjunction (68-72), the script-url + token bytes (75-87), the
//     field-content validation (recaptcha_setting.rb:1-5), the
//     recaptcha_setting? predicate (11-13), the RecaptchaCard key
//     resolution incl. using_defaults? and Card::Rule.toggle
//     (config/late/recaptcha.rb:16-44 + card-1.110.0 lib/card/rule.rb:
//     11-13 + self/admin.rb:3-5), the Railtie config defaults
//     (lib/card/mod/recaptcha.rb:1-10), and the admin warning messages
//     with the en.yml strings inlined (self/admin.rb:7-22 +
//     config/locales/en.yml:2-4). Regex/nil semantics are oracle-pinned
//     with the gem's own interpreter (see the per-export comments).
//
// NOT ported here :
//   - event :recaptcha (:validate, recaptcha.rb:50-55) IS ported:
//     registered below through the
//     mod-event seam (the add_comment pattern, card-mod-comment.ts) with
//     the real body — the handle_recaptcha_config_errors dispatch, the
//     captcha_used! mark, the siteverify GET and the human? verdict that
//     refuses the save. The event's DECK-side inputs (the recaptcha config
//     keys, the auth state, the :captcha rule content) ride the save path's
//     guard snapshot (ModEventSaveInput.recaptcha,
//     mod-event-dispatch.ts), which CardActionEngine builds from its
//     recaptcha options port + the codename registry + the *captcha rule
//     read. NAMED REMAINDERS: (a) the anonymous-save reach — Ruby's
//     recaptcha_on? requires !Auth.signed_in? (:20), but this engine's
//     write path is signed-in-only (CardActionEngineOptions.actor null =
//     read-only, types.ts:14-16), so the guard-on arms are provable at the
//     seam level (runModEventStage) until the anonymous-create permission
//     surface lands; (b) the *captcha rule CANDIDATE WALK — ported:
//     the engine resolves rule(:captcha)
//     through its own storage walk by default (ruleContentForCard,
//     actions/rule-content-walk.ts — rule/all.rb:5-15 + 66-73 over the
//     set-patterns port's ruleNamesForCard precedence), with the config's
//     explicit value/function kept as the host override seam; (c)
//     validate_recaptcha_field (recaptcha_setting.rb:1-5) — BODY PORTED
//     (validateRecaptchaFieldFn: the grammar rides recaptchaFieldContentError
//     and the errors.add :content half is the validate-stage CardActionError
//     refusal; the guard input (recaptchaSettingChild on ModEventCard) is
//     composition input the engine does not populate yet, so a runtime
//     without a setMember resolver skips the event set-not-applicable —
//     tests/card/mod-loader/card-mod-recaptcha-field-validate.test.ts pins
//     the seam-level contract) / set_recaptcha_site_key (:7-9): Card.config
//     mutation — the engine's recaptcha config is composition input
//     (ModEventRecaptchaGuard) and the port has no host-side mutable config
//     store a save could write; SKIPPED rather than diverged, never
//     fake-registered.
//   - recaptcha_response (recaptcha.rb:41-44): POSTs the token to Google's
//     siteverify endpoint via the `recaptcha` gem (config/late/
//     recaptcha.rb:61-68 wires Recaptcha.configure +
//     CardController.include ::Recaptcha::Verify) - an external service
//     the headless engine cannot call. The pure composition AROUND the
//     POST (human?, recaptchaSuccess) is ported; the POST itself is the
//     boundary.
//   - the format :html helper registrations hidden_form_tags (89-93) /
//     card_form_html_opts (95-99) — ported, server-side only: the override composites below
//     (recaptchaFormOn / recaptchaFormHtmlAttrs / recaptchaHiddenFormTags)
//     and the emission seam at the card_form home (the form substrate's
//     CardFormShellOpts.recaptchaTokenHtml — cardFormShell appends the
//     bytes at Ruby's `hidden + output(yield)` position, form.rb:195).
//     NAMED REMAINDER (the consult reach): Ruby consults the overrides
//     from EVERY card_form through the format's module chain, reading the
//     live guard (card.recaptcha_on?) off each rendered card. The port's
//     form-emitting view bodies compose the decoration per form by calling
//     the composites with the SAME guard inputs the validate event's
//     snapshot carries; no render-path engine composes a recaptcha config
//     yet, so a live render consult is reachable only once a host wires
//     the render engine's recaptcha config + page-session actor (the same
//     reach shape as remainder (a)). The browser recaptcha.js.coffee stays
//     OUT of scope (the standing scope decision: browser script assets are
//     not ported).
//   - self/admin.rb's basket[:warnings] << :recaptcha_config_issues (line
//     1) + add_recaptcha_keys_link (24-26): the warnings basket feeds the
//     admin page machinery (no TS consumer, same call as card-mod-help's
//     config/admin.yml remainder) and the link bytes are Rails
//     link-helper emissions (edit_link/link_to_card); the message
//     composition around them IS ported (recaptchaConfigIssuesMessage).
//   - assign_type :toggle (right/captcha.rb:1) and the include_set
//     Abstract::RecaptchaSetting directives (right/secret_key.rb:1,
//     right/site_key.rb:1): type assignment + set inclusion have no
//     manifest slot (the api_key/date-port call); the abstract module's
//     portable methods are the exported functions here and the data side
//     (data/real.yml's codenames) rides the deck schema.
//   - assets/script/recaptcha.js.coffee: the browser-side grecaptcha
//     script; the headless engine renders no JS assets.
//   - config/locales/de.yml: the German locale - no i18n surface in TS
//     (the en strings are inlined; the api_key-port convention).
//   - data/real.yml: seed data outside the mod loader's surface.

import type { ViewContext, ViewFn } from "../../render/format.js";
import { CardActionError } from "../../actions/types.js";
import type {
  DeckoModManifest,
  ModEventCard,
  ModEventFn,
  ModEventRegistration,
} from "../mod-manifest.js";
import type { ModEventContext } from "../mod-event-dispatch.js";

/** The set-module event declarations:
 *  stub-bodied, with the per-event reason on the declaration. Same shape
 *  as core-mod.ts's local helper. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}

// ---------------------------------------------------------------------------
// set/all/recaptcha.rb - the error-code table + the pure predicates
// ---------------------------------------------------------------------------

/** recaptcha.rb:1-7 RECAPTCHA_ERROR_CODES - the error-code -> human
 *  message table (marked `# LOCALIZE` in Ruby; inlined as the en shape). */
export const RECAPTCHA_ERROR_CODES: Readonly<Record<string, string>> = {
  "missing-input-secret": "secret parameter is missing",
  "invalid-input-secret": "secret parameter is invalid or malformed",
  "missing-input-response": "response parameter is missing",
  "invalid-input-response": "response parameter is invalid or malformed",
  "bad-request": "request is invalid or malformed",
};

/** The # LOCALIZE default (recaptcha.rb:31): the error added when the
 *  verify response carries NO error codes. */
export const RECAPTCHA_DEFAULT_ERROR = "Looks like you are not a human";

/** recaptcha.rb:25-33 add_recaptcha_errors, as the pure message list:
 *  codes present -> one message per code, mapped through
 *  `RECAPTCHA_ERROR_CODES.fetch(code, code)` (28: unknown codes pass
 *  through verbatim); codes absent/blank -> the single default message
 *  (30-32). */
export function recaptchaErrorMessages(
  errorCodes: readonly string[] | undefined | null,
): string[] {
  if (errorCodes !== undefined && errorCodes !== null && errorCodes.length > 0) {
    return errorCodes.map((code) => RECAPTCHA_ERROR_CODES[code] ?? code);
  }
  return [RECAPTCHA_DEFAULT_ERROR];
}

/** Ruby String#to_f for the score comparison (recaptcha.rb:37
 *  `result["score"].to_f`): nil -> 0.0 (NilClass#to_f exists - oracle-pinned
 *  with the gem's interpreter: p(nil.to_f) => 0.0), leading-numeric strings
 *  parse the leading run ("0.9x".to_f => 0.9, "junk".to_f => 0.0 - pinned).
 *  Non-finite parses are folded to 0 to match Ruby (String#to_f accepts no
 *  Infinity/NaN literals: "Infinity".to_f => 0.0; parseFloat would yield
 *  Infinity). */
function rubyToF(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** recaptcha.rb:35-39 recaptcha_success?: the response succeeds when
 *  `success` is truthy, the score meets the configured minimum
 *  (`Cardio.config.recaptcha_minimum_score`, default 0.5 -
 *  lib/card/mod/recaptcha.rb:8), and the action matches the requested one.
 *  Divergence note: Ruby calls `result["action"].to_sym`, which RAISES
 *  NoMethodError when the response carries no action (oracle-pinned:
 *  nil.to_sym => NoMethodError); the port returns false (a crash is not a
 *  behavior worth reproducing headlessly). */
export function recaptchaSuccess(
  result: { success?: unknown; score?: unknown; action?: unknown },
  minimumScore: number,
  action: string,
): boolean {
  if (!result.success) return false;
  if (rubyToF(result.score) < minimumScore) return false;
  return typeof result.action === "string" && result.action === action;
}

// ---------------------------------------------------------------------------
// set/all/recaptcha.rb - the remaining pure predicates (env/auth/rule inputs
// injected; the per-export comments name each Ruby line)
// ---------------------------------------------------------------------------

/** Ruby truthiness for the config/env conjuncts: only nil and false are
 *  falsy in Ruby - "" and 0 are TRUTHY (recaptcha.rb:46-47 relies on
 *  exactly that when the config values are blank strings). */
function rubyTruthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/** card-1.110.0 lib/card/rule.rb:11-13 `Card::Rule.toggle`:
 *  `val.to_s.strip == "1"`. The input is Card#rule's return - the rule
 *  card's db_content or nil (lib/card/rule/all.rb:5-7
 *  `rule_card(...)&.db_content`); nil.to_s is "" in Ruby. JS trim covers
 *  Ruby strip for whitespace (Ruby strip also drops NULs - unreachable for
 *  rule content in the engine's storage). */
export function ruleToggle(ruleContent: unknown): boolean {
  return String(ruleContent ?? "").trim() === "1";
}

/** recaptcha.rb:46-48 recaptcha_keys?: `Card.config.recaptcha_site_key &&
 *  Card.config.recaptcha_secret_key` under Ruby truthiness. */
export function recaptchaKeysPresent(
  siteKey: unknown,
  secretKey: unknown,
): boolean {
  return rubyTruthy(siteKey) && rubyTruthy(secretKey);
}

/** recaptcha.rb:16-23 recaptcha_on?: `recaptcha_keys? && Env.controller &&
 *  !Auth.signed_in? && !Auth.always_ok? && !Auth.needs_setup? &&
 *  Card::Rule.toggle(rule(:captcha))`. The live Env/Auth lookups are
 *  injected as plain inputs (no env/auth surface in TS); the captcha rule
 *  rides ruleToggle with the *captcha rule card's content. */
export function recaptchaOn(opts: {
  siteKey: unknown;
  secretKey: unknown;
  envController: unknown;
  signedIn: boolean;
  alwaysOk: boolean;
  needsSetup: boolean;
  captchaRuleContent: unknown;
}): boolean {
  return (
    recaptchaKeysPresent(opts.siteKey, opts.secretKey) &&
    rubyTruthy(opts.envController) &&
    !opts.signedIn &&
    !opts.alwaysOk &&
    !opts.needsSetup &&
    ruleToggle(opts.captchaRuleContent)
  );
}

/** recaptcha.rb:9-14 human?: `result = JSON.parse recaptcha_response;
 *  return false if recaptcha_success?(result); add_recaptcha_errors
 *  result["error-codes"]`. The siteverify POST itself (recaptcha_response,
 *  41-44) is the non-portable boundary; this is its pure composition:
 *  human -> human true, no errors; not human -> human false plus the
 *  recaptchaErrorMessages list for the response's "error-codes" key. */
export function humanCheck(
  result: { success?: unknown; score?: unknown; action?: unknown } & {
    "error-codes"?: readonly string[];
  },
  minimumScore: number,
  action: string,
): { human: boolean; errorMessages: string[] } {
  if (recaptchaSuccess(result, minimumScore, action)) {
    return { human: true, errorMessages: [] };
  }
  return {
    human: false,
    errorMessages: recaptchaErrorMessages(result["error-codes"]),
  };
}

/** recaptcha.rb:57-66 handle_recaptcha_config_errors, as the dispatch on
 *  `Env.params[:recaptcha_token]`: "grecaptcha-undefined" -> errors.add
 *  "recaptcha", "needs correct v3 configuration" (60 - the attribute is the
 *  STRING "recaptcha" here, and the source's marker is the misspelled
 *  `# LOCALILZE`); "recaptcha-token-field-missing" -> raise Card::Error,
 *  "recaptcha token field missing" (62, same misspelling); anything else
 *  yields (64 - the captcha_used! + human? path, recaptcha.rb:50-55). */
export function handleRecaptchaConfigErrors(recaptchaToken: unknown): {
  kind: "add-error" | "card-error" | "proceed";
  message?: string;
} {
  if (recaptchaToken === "grecaptcha-undefined") {
    return { kind: "add-error", message: "needs correct v3 configuration" };
  }
  if (recaptchaToken === "recaptcha-token-field-missing") {
    return { kind: "card-error", message: "recaptcha token field missing" };
  }
  return { kind: "proceed" };
}

/** recaptcha.rb:68-72 validate_recaptcha?: `return false unless
 *  Card::Codename.exist? :captcha; !@supercard && !:captcha.card.captcha_used?
 *  && recaptcha_on?`. The codename check, the supercard flag and the used
 *  flag are injected; the recaptcha_on? operand rides recaptchaOn's output. */
export function validateRecaptcha(opts: {
  captchaCodenameExists: boolean;
  isSupercard: boolean;
  captchaUsed: boolean;
  recaptchaOn: boolean;
}): boolean {
  if (!opts.captchaCodenameExists) return false;
  return !opts.isSupercard && !opts.captchaUsed && opts.recaptchaOn;
}

// ---------------------------------------------------------------------------
// set/all/recaptcha.rb - format :html helper bytes (no view declarations;
// the bytes ride the FORM machinery Ruby-side - see the header remainder)
// ---------------------------------------------------------------------------

/** recaptcha.rb:85-87 recaptcha_script_url. */
export function recaptchaScriptUrl(siteKey: string): string {
  return `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
}

/** recaptcha.rb:75-83 recaptcha_token: `javascript_include_tag(url)` +
 *  `hidden_field_tag("recaptcha_token", "", "data-site-key": ...,
 *  "data-action": ..., class: "_recaptcha-token")`. The attributes are the
 *  Ruby call's own (name/value at 78, data-site-key/data-action/class at
 *  79-81); the attribute ORDER follows Rails' helper emission shape
 *  (type/name/id/value, then the options hash) - reconstructed, not
 *  oracle-verified (no oracle render covers a recaptcha form). */
export function recaptchaTokenHtml(action: string, siteKey: string): string {
  const script = `<script src="${recaptchaScriptUrl(siteKey)}"></script>`;
  const hidden =
    `<input type="hidden" name="recaptcha_token" id="recaptcha_token" value=""` +
    ` data-site-key="${siteKey}" data-action="${action}" class="_recaptcha-token" />`;
  return `${script}${hidden}`;
}

// ---------------------------------------------------------------------------
// set/all/recaptcha.rb format :html - the form-stage hook composites
// (74-104). Ruby reaches them from EVERY card_form through the format's
// module chain (the mod's format block shadows card-mod-edit's
// hidden_form_tags / card_form_html_opts once loaded); the port's form
// consumers call them per form and hand the results to the card_form
// substrate (CardFormShellOpts.recaptchaTokenHtml + the htmlAttrs pairs).
// ---------------------------------------------------------------------------

/** recaptcha.rb:101-103 recaptcha?: `card.recaptcha_on? &&
 *  opts[:recaptcha] != :off` - the gate both overrides consult, in Ruby's
 *  operand order (the guard short-circuits the opt check). The guard
 *  operands ride recaptchaOn (16-23, the same conjunction the validate
 *  event's snapshot evaluates); the opt is the ported form-opts value -
 *  Ruby's symbol :off arrives as "off" at the port's call sites (the one
 *  Ruby opt call site passes recaptcha: :off: card-mod-account
 *  set/self/signin.rb:121). */
export function recaptchaFormOn(
  recaptchaOnOpts: Parameters<typeof recaptchaOn>[0],
  recaptchaOpt: unknown,
): boolean {
  return recaptchaOn(recaptchaOnOpts) && recaptchaOpt !== "off";
}

/** recaptcha.rb:95-99 card_form_html_opts override: `super;
 *  opts["data-recaptcha"] ||= "on" if recaptcha?(opts)`. The attribute
 *  APPENDS to the html-opts hash - every key the base card_form_html_opts
 *  added (form.rb:218-222: class, slotter, autosave) and every caller key
 *  precede it, and Rails emits the hash order - and ||= is
 *  first-write-wins: an existing data-recaptcha stands. */
export function recaptchaFormHtmlAttrs(
  htmlAttrs: ReadonlyArray<readonly [string, string]>,
  formRecaptcha: boolean,
): Array<[string, string]> {
  const copy: Array<[string, string]> = htmlAttrs.map(
    ([key, value]) => [key, value] as [string, string],
  );
  if (!formRecaptcha) return copy;
  if (copy.some(([key]) => key === "data-recaptcha")) return copy;
  copy.push(["data-recaptcha", "on"]);
  return copy;
}

/** recaptcha.rb:89-93 hidden_form_tags override: `return super unless
 *  recaptcha?(opts); super + recaptcha_token(action)`. `super` is the base
 *  hidden_form_tags (card-mod-edit set/all/form.rb:202-205 - the success
 *  tags); the token bytes follow it, because card_form composes
 *  `hidden + output(yield(cform))` (form.rb:195) - success tags, token
 *  bytes, body. The form substrate's CardFormShellOpts.recaptchaTokenHtml
 *  emits exactly this position (mod-form-substrate.ts). */
export function recaptchaHiddenFormTags(
  superTags: string,
  formRecaptcha: boolean,
  action: string,
  siteKey: string,
): string {
  if (!formRecaptcha) return superTags; // the `return super` arm (:90)
  return superTags + recaptchaTokenHtml(action, siteKey);
}

// ---------------------------------------------------------------------------
// set/abstract/recaptcha_setting.rb - the field validation + set predicate
// ---------------------------------------------------------------------------

/** recaptcha_setting.rb:2 the content pattern `/^[a-zA-Z0-9\-_]*$/`, JS with
 *  the `m` flag: Ruby's `^`/`$` are LINE anchors (match at string start/end
 *  AND around any \n), and `match?` searches for a match anywhere - so Ruby
 *  accepts content when ANY line is entirely alphanumerics/hyphens/
 *  underscores (possibly empty). Oracle-pinned with the gem's interpreter (Ruby 3.3):
 *   /^[a-zA-Z0-9\-_]*$/.match?("ok\nbad!")  => true
 *   /^[a-zA-Z0-9\-_]*$/.match?("\nok\n")    => true
 *   /^[a-zA-Z0-9\-_]*$/.match?("bad!")      => false
 * The flagless JS regex would return false for the first two - divergence,
 * hence `m`. (The author likely meant \A...\z; parity mirrors what shipped.) */
const RECAPTCHA_SETTING_CONTENT_PATTERN = /^[a-zA-Z0-9\-_]*$/m;

/** recaptcha_setting.rb:1-5 `event :validate_recaptcha_field, :validate,
 *  when: :recaptcha_setting? do return if content.match?(...); errors.add
 *  :content, "invalid key" end` — the event BODY: the ported grammar
 *  (recaptchaFieldContentError) decides, and a failing grammar refuses
 *  the save the way errors.add does (the CardActionError save-refusal
 *  shape, the detect_conflict pattern — the errors view's alert carries
 *  "Problems with <name>" over "CONTENT: invalid key"). The `when:`
 *  predicate (recaptcha_setting?) rides recaptchaModEventPredicates above;
 *  the dispatcher skips the event before the body runs when the card is
 *  not a *recaptcha settings child. */
const validateRecaptchaFieldFn: ModEventFn = (card, _host) => {
  const error = recaptchaFieldContentError(card.dbContent ?? "");
  if (error !== undefined) {
    // errors.add :content, "invalid key" (recaptcha_setting.rb:4).
    throw new CardActionError(
      "validation-failed",
      error,
      `CONTENT: ${error}`,
      undefined,
      card.name,
    );
  }
};

/** recaptcha_setting.rb:1-5 event validate_recaptcha_field's error branch,
 *  as the pure predicate: SOME line matching the pattern passes (undefined),
 *  otherwise the `:content` error "invalid key" (line 4). */
export function recaptchaFieldContentError(
  content: string,
): "invalid key" | undefined {
  return RECAPTCHA_SETTING_CONTENT_PATTERN.test(content)
    ? undefined
    : "invalid key";
}

/** recaptcha_setting.rb:11-13 recaptcha_setting?: the setting behavior
 *  applies when the junction's LEFT card is the *recaptcha settings card
 *  (`left&.codename == :recaptcha_settings`). Takes the left card's
 *  codename (undefined = no left card = Ruby's `left&.` nil branch). */
export function isRecaptchaSettingChild(
  leftCodename: string | undefined | null,
): boolean {
  return leftCodename === "recaptcha_settings";
}

// ---------------------------------------------------------------------------
// config/late/recaptcha.rb (RecaptchaCard) + lib/card/mod/recaptcha.rb (the
// Cardio::Railtie defaults) - the key resolution
// ---------------------------------------------------------------------------

/** config/late/recaptcha.rb:16-19 @deprecated - the config names the
 *  resolution falls back to (recaptcha_public_key / recaptcha_private_key;
 *  lib/card/mod/recaptcha.rb:2-3 initializes them with the "deprecated;
 *  use recaptcha_site_key/secret_key instead" notes). */
export const RECAPTCHA_DEPRECATED_CONFIG_NAMES: Readonly<{
  site_key: string;
  secret_key: string;
}> = {
  site_key: "recaptcha_public_key",
  secret_key: "recaptcha_private_key",
};

/** config/late/recaptcha.rb:20-23 @defaults - the DEVELOPMENT-ONLY key pair
 *  the resolution falls back to (line 13: "by using the defaults below
 *  (DEVELOPMENT ONLY)"). The pair itself is deployment configuration, not
 *  source: a host or test supplies it per call through this shape (the same
 *  seam the Auth::Token secret uses - the caller owns the value, the module
 *  never stores one). An uninjected run resolves `undefined`, which
 *  using_defaults?'s `==` (line 34) still treats as equal to an absent
 *  resolved value (nil == nil): with no +*site key card content and no
 *  config, recaptcha_config_issues? fires exactly as it does when the
 *  development pair is configured. */
export interface RecaptchaDevelopmentDefaults {
  readonly site_key?: string;
  readonly secret_key?: string;
}

/** lib/card/mod/recaptcha.rb:1-10 - the Cardio::Railtie config defaults
 *  (the compat report's seven cardioConfigKeys). The deprecated pair and
 *  the proxy start nil; the minimum score is 0.5; the verify URL points at
 *  Google's siteverify endpoint. */
export const RECAPTCHA_CARDIO_CONFIG_DEFAULTS: Readonly<{
  recaptcha_public_key: null;
  recaptcha_private_key: null;
  recaptcha_proxy: null;
  recaptcha_site_key: null;
  recaptcha_secret_key: null;
  recaptcha_minimum_score: number;
  recaptcha_verify_url: string;
}> = {
  recaptcha_public_key: null,
  recaptcha_private_key: null,
  recaptcha_proxy: null,
  recaptcha_site_key: null,
  recaptcha_secret_key: null,
  recaptcha_minimum_score: 0.5,
  recaptcha_verify_url: "https://www.google.com/recaptcha/api/siteverify",
};

/** config/late/recaptcha.rb:32-34 using_defaults? - the resolved site key
 *  equals the development default (`Cardio.config.recaptcha_site_key ==
 *  @defaults[:site_key]`; self/admin.rb:3-5 recaptcha_config_issues? is
 *  exactly this check). The default arrives injected; passing none compares
 *  against `undefined`, so an absent resolution still counts as using the
 *  default (Ruby's nil == nil) and the config-issues warning fires. */
export function usingDefaults(
  siteKey: string | undefined | null,
  developmentDefault?: string,
): boolean {
  return siteKey === developmentDefault;
}

/** config/late/recaptcha.rb:39-44 recaptcha_setting_value's precedence:
 *  card content overrides the application config, which overrides the
 *  deprecated config name, which overrides the development default
 *  (`card_value || config_value || deprecated_value || @defaults[setting]`).
 *  Ruby guards the card read behind Codename.exist? checks (50-57, "prevent
 *  breakage in migrations") - the caller passes the card value already
 *  resolved (or undefined); blank strings are skipped (56: `value if
 *  value.present?`). `which` selects the development-default fallback (the
 *  Ruby method resolves BOTH settings through this one path; default
 *  "site_key"); the pair arrives injected per {@link
 *  RecaptchaDevelopmentDefaults}. */
export function recaptchaSettingValue(
  cardValue: string | undefined | null,
  configValue: string | undefined | null,
  deprecatedValue: string | undefined | null,
  which: "site_key" | "secret_key" = "site_key",
  developmentDefaults?: RecaptchaDevelopmentDefaults,
): string | undefined {
  if (cardValue !== undefined && cardValue !== null && cardValue !== "") {
    return cardValue;
  }
  if (configValue !== undefined && configValue !== null && configValue !== "") {
    return configValue;
  }
  if (
    deprecatedValue !== undefined &&
    deprecatedValue !== null &&
    deprecatedValue !== ""
  ) {
    return deprecatedValue;
  }
  return developmentDefaults?.[which];
}

// ---------------------------------------------------------------------------
// set/self/admin.rb - the config-issues warning bytes (en.yml inlined)
// ---------------------------------------------------------------------------

/** config/locales/en.yml:2-4 - the three strings the admin warning
 *  references via t() (self/admin.rb:14, 18-19, 25). No i18n surface in
 *  TS (the api_key-port convention). */
export const LOCALE = {
  recaptcha_link_text: "recaptcha keys",
  recaptcha_captcha_keys:
    "You are configured to use %{captcha_link}, but for that to work you need new %{recaptcha_link}.",
  recaptcha_captcha_temp:
    "Your captcha is currently working with temporary settings. This is fine for a local installation, but you will need new %{recaptcha_link} if you want to make this site public.",
} as const;

/** self/admin.rb:7-22 recaptcha_config_issues_message: wrap_with :p around
 *  the localhost branch (14: the temp message) or the hosted branch (18-19:
 *  the keys message), with the Rails i18n %{key} interpolations filled by
 *  the caller's link bytes (the links themselves - the *recaptcha settings
 *  edit_link at 25 and the *captcha card link at 19 - are Rails helper
 *  emissions, not reproducible headlessly; see the header remainder). */
export function recaptchaConfigIssuesMessage(opts: {
  localhost: boolean;
  recaptchaLink: string;
  captchaLink: string;
}): string {
  const inner = opts.localhost
    ? LOCALE.recaptcha_captcha_temp.replace("%{recaptcha_link}", opts.recaptchaLink)
    : LOCALE.recaptcha_captcha_keys
        .replace("%{captcha_link}", opts.captchaLink)
        .replace("%{recaptcha_link}", opts.recaptchaLink);
  return `<p>${inner}</p>`;
}

// ---------------------------------------------------------------------------
// set/self/captcha.rb - the per-card captcha_used state (7-13)
// ---------------------------------------------------------------------------

/** self/captcha.rb:7-13 captcha_used?/captcha_used!: the *captcha card's
 *  `@captcha_used` ivar - `captcha_used?` is `!@captcha_used.nil?` (7-9),
 *  `captcha_used!` sets it true (11-13). The event :recaptcha body marks it
 *  (recaptcha.rb:52 `:captcha.card.captcha_used!`) so sibling cards
 *  validating in the same request cycle skip the verify (recaptcha.rb:71).
 *  Factory form: one tracker per *captcha card instance per request. */
export function captchaUsedTracker(): {
  isUsed(): boolean;
  markUsed(): void;
} {
  let captchaUsed: true | undefined = undefined; // the ivar, nil initially
  return {
    isUsed: () => captchaUsed !== undefined,
    markUsed: () => {
      captchaUsed = true;
    },
  };
}

// ---------------------------------------------------------------------------
// set/self/recaptcha_settings.rb - format :html, view :core (the gem's one
// declared html view)
// ---------------------------------------------------------------------------

/** recaptcha_settings.rb:2-8 raw_help_text (marked `# LOCALIZE` in Ruby;
 *  inlined as the en shape). The `[[...|text]]` link chunks render through
 *  the help/popover chunk walk at consume time, exactly as
 *  card-mod-help's raw help text does. */
export const RECAPTCHA_SETTINGS_HELP_TEXT =
  "Register your domain at Google's " +
  "[[http://google.com/recaptcha|reCAPTCHA service]] " +
  "and enter your site key and secret key below.<br>" +
  "If you want to turn captchas off then change all " +
  "[[*captcha|captcha rules]] to 'no'.";

/** Ruby String#capitalize for the vary("capitalized") title variant
 *  (name_variants.rb:7 aliases "capitalized" to :capitalize): first
 *  character upcased, the REST downcased. "site key" -> "Site key". */
function rubyCapitalize(name: string): string {
  return name === "" ? "" : name[0]!.toUpperCase() + name.slice(1).toLowerCase();
}

/** nesting.rb:27-31 field_nest: `fullname = card.name.field(field)`,
 *  `opts[:title] ||= field.cardname.vary("capitalized")`, then
 *  `nest fullname, opts`. NO view option rides - the subformat resolves
 *  the view through html's default_nest_view (:titled,
 *  card-mod-format set/all/html.rb:17-19; the TS engine's
 *  RenderFormat.defaultNestView returns "titled", format.ts:545-547). */
function fieldNest(ctx: ViewContext, field: string): string {
  const cardName = ctx.fmt.card.name.s;
  const fullName = `${cardName}+${field}`;
  return ctx.fmt.nest({
    syntax: `{{${fullName}}}`,
    name: fullName,
    options: { title: rubyCapitalize(field), extra: {} },
    comment: undefined,
  });
}

/** recaptcha_settings.rb:11-13 view :core:
 *  `[field_nest(:site_key), field_nest(:secret_key)]` - the array renders
 *  through the output join (content.rb:70-72 `Array.wrap(content).flatten
 *  .compact.join "\\n"`), one newline between the two field nests (the
 *  oracle's core bytes: `</div>\\n<div id="Xrecaptcha_setting-secret_key...`).
 *  No view
 *  config (no unknown/cache/wrap on the Ruby `view :core` call). */
const recaptchaSettingsCoreView: ViewFn = (ctx) =>
  [fieldNest(ctx, "site key"), fieldNest(ctx, "secret key")].join("\n");

// ---------------------------------------------------------------------------
// event :recaptcha (set/all/recaptcha.rb:50-55) — ported through the
// mod-event seam
// ---------------------------------------------------------------------------

/** ::Recaptcha.get (recaptcha-4.13.2 lib/recaptcha.rb:63-77): GET
 *  `verify_url + "?" + URI.encode_www_form(verify_hash)` with the body
 *  text returned. URI.encode_www_form is the form-urlencoded serializer
 *  (space -> "+", everything outside the unreserved set percent-encoded) —
 *  the encodeURIComponent post-pass reproduces its output shape; the
 *  siteverify params are keys/tokens (no spaces), where the two serializers
 *  agree byte-for-byte. Ruby sets use_ssl on port 443 and a 3 s timeout
 *  (:66-73); the fetch carries no explicit timeout (the Workers runtime's
 *  own limits apply — disclosed divergence, same request bytes). */
export function recaptchaSiteverifyGet(
  verifyUrl: string,
  query: { secret: string; response: string },
): Promise<string> {
  const enc = (value: string): string =>
    encodeURIComponent(value)
      .replace(/%20/g, "+")
      .replace(/!/g, "%21")
      .replace(/'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\*/g, "%2A");
  const qs = `secret=${enc(query.secret)}&response=${enc(query.response)}`;
  return fetch(`${verifyUrl}?${qs}`).then((res) => res.text());
}

/** The event body (recaptcha.rb:50-55):
 *   handle_recaptcha_config_errors do
 *     :captcha.card.captcha_used!
 *     human?
 *   end
 * The config-error arms (recaptcha.rb:57-66) become CardActionError throws
 * (the port's save-refusal shape, the detect_conflict pattern —
 * "conflict" -> 422 via write-routes): "grecaptcha-undefined" is the
 * errors.add arm (:60), "recaptcha-token-field-missing" the raise arm
 * (:62). human? (:9-14) POSTs the token through the injected transport
 * (recaptcha_response, :41-44) and fails the save with the mapped messages
 * when the verdict is not human. A non-JSON verify body raises
 * JSON::ParserError in Ruby — JSON.parse throws the same way here. */
export async function recaptchaEventFn(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  const rec = ctx.saveInput?.recaptcha;
  if (rec === undefined) return;
  const config = handleRecaptchaConfigErrors(rec.token);
  if (config.kind === "add-error") {
    // errors.add "recaptcha", "needs correct v3 configuration" — the errors
    // view's alert carries "Problems with <card name>" (error.rb:56-62
    // voo.title) over "<KEY>: <message>" (standard_errors), so the throw
    // carries the userMessage split and the acting card's name.
    throw new CardActionError(
      "recaptcha",
      config.message ?? "",
      `RECAPTCHA: ${config.message ?? ""}`,
      undefined,
      card.name,
    );
  }
  if (config.kind === "card-error") {
    // Ruby raises Card::Error (not a validation error) — the port carries
    // the message on the engine's own CardActionError; write-routes maps
    // it by code like every other refusal.
    throw new CardActionError(
      "recaptcha",
      config.message ?? "",
      `RECAPTCHA: ${config.message ?? ""}`,
      undefined,
      card.name,
    );
  }
  rec.markUsed(); // recaptcha.rb:52 — BEFORE the verify (:71 skips the next)
  const body = await rec.verify(rec.guard.verifyUrl, {
    secret: String(rec.guard.secretKey ?? ""),
    response: rec.token ?? "",
  });
  const result = JSON.parse(body) as {
    success?: unknown;
    score?: unknown;
    action?: unknown;
    "error-codes"?: readonly string[];
  };
  // recaptcha.rb:38 `result["action"].to_sym == action.to_sym` — Card#action,
  // the acting save's own create/update.
  const action = card.act?.action ?? "update";
  const verdict = humanCheck(result, rec.guard.minimumScore, action);
  if (!verdict.human) {
    // add_recaptcha_errors (:25-33): one errors.add per code (or the single
    // default). The ActiveRecord failure carries them as a list — the port
    // joins one line per added error.
    throw new CardActionError(
      "recaptcha",
      verdict.errorMessages.join("\n"),
      `RECAPTCHA: ${verdict.errorMessages.join("\n")}`,
      undefined,
      card.name,
    );
  }
}

/** The `when: :validate_recaptcha?` predicate (recaptcha.rb:68-72):
 *  `return false unless Card::Codename.exist? :captcha; !@supercard &&
 *  !:captcha.card.captcha_used? && recaptcha_on?`. Every operand rides the
 *  save path's guard snapshot — the engine resolves the deck config, its
 *  own auth state and the host's *captcha rule content before the validate
 *  walk (the sync predicate cannot await the rule read; the engine can). */
export const recaptchaModEventPredicates = {
  validate_recaptcha: (_card: ModEventCard, ctx?: ModEventContext): boolean => {
    const rec = ctx?.saveInput?.recaptcha;
    if (rec === undefined) return false;
    return validateRecaptcha({
      captchaCodenameExists: rec.guard.captchaCodenameExists,
      isSupercard: rec.guard.isSupercard,
      captchaUsed: rec.isUsed(),
      recaptchaOn: recaptchaOn({
        siteKey: rec.guard.siteKey,
        secretKey: rec.guard.secretKey,
        envController: rec.guard.envController,
        signedIn: rec.guard.signedIn,
        alwaysOk: rec.guard.alwaysOk,
        needsSetup: rec.guard.needsSetup,
        captchaRuleContent: rec.guard.captchaRuleContent,
      }),
    });
  },
  /** recaptcha_setting? (set/abstract/recaptcha_setting.rb:11): the left
   *  card is the recaptcha_settings card. Gates :validate_recaptcha_field
   *  (:1) and :set_recaptcha_site_key (:7). */
  "recaptcha_setting?": (card: ModEventCard): boolean =>
    card.recaptchaSettingChild === true,
} as const;

/** recaptcha_setting.rb:1-5 event :validate_recaptcha_field's BODY (the
 *  `:validate` stage; `when: :recaptcha_setting?` rides
 *  recaptchaModEventPredicates above):
 *
 *   return if content.match?(/^[a-zA-Z0-9\-_]*$/)
 *   errors.add :content, "invalid key"
 *
 * Ruby's `content` is standard_content (lib/card/content/all.rb:5-7,
 * 18-20): db_content, or "" for a not-new card with nil db_content
 * (new cards take default_content, "" for Basic). The grammar check rides
 * the shared pure predicate recaptchaFieldContentError (one definition of
 * the /m-flag line-anchor semantics). The `errors.add :content` half is
 * the engine's validate-stage refusal: a CardActionError thrown from a
 * non-integrate stage propagates out of runModEventStage
 * (mod-event-dispatch.ts:536-546 — only :integrate failures are rescued
 * into the report) and the write path reports errorsByAttribute as the
 * JSON errors view's hash (write-routes.ts jsonErrorsViewHash), exactly
 * the surface the :recaptcha event's own refusal uses. */
export async function validateRecaptchaFieldFn(card: ModEventCard): Promise<void> {
  const message = recaptchaFieldContentError(card.dbContent ?? "");
  if (message !== undefined) {
    throw new CardActionError(
      "validation-failed",
      message,
      `CONTENT: ${message}`,
      { content: message },
      card.name,
    );
  }
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModRecaptcha: DeckoModManifest = {
  name: "recaptcha",
  gemName: "card-mod-recaptcha",
  group: "gem-defaults", // the deck bundle's mod group (mod-order.ts:110-115)
  setModules: [
    {
      // card-mod-recaptcha-0.20.0/set/abstract/recaptcha_setting.rb -
      // events validate_recaptcha_field (:validate, 1-5) +
      // set_recaptcha_site_key (:finalize, 7-9).
      //
      // Events (recaptcha_setting.rb:1-9):
      // - validate_recaptcha_field (:validate, when: recaptcha_setting?) —
      //   BODY PORTED (validateRecaptchaFieldFn): the grammar rides
      //   recaptchaFieldContentError and the errors.add :content half is
      //   the engine's validate-stage CardActionError refusal (the same
      //   surface the :recaptcha event's refusal uses). The guard input
      //   (recaptchaSettingChild on ModEventCard) is composition input the
      //   engine does not populate yet, so a runtime without a setMember
      //   resolver skips the event set-not-applicable — the seam-level
      //   contract is pinned by
      //   tests/card/mod-loader/card-mod-recaptcha-field-validate.test.ts.
      // - set_recaptcha_site_key (:finalize, when: :recaptcha_setting?)
      //   `Card.config.send "recaptcha_#{codename}=", content`
      //   (recaptcha_setting.rb:8) mutates the process config at save
      //   time; the engine's recaptcha config is composition input
      //   (ModEventRecaptchaGuard, built per save), with no config-write
      //   seam an event body could drive — SKIPPED (see the register),
      //   never fake-registered.
      setPath: "abstract/recaptcha_setting",
      events: [
        event({
          event: "validate_recaptcha_field",
          at: "validate",
          when: "recaptcha_setting?",
          fn: validateRecaptchaFieldFn,
        }),
        event({ event: "set_recaptcha_site_key", at: "finalize", when: "recaptcha_setting?" }),
      ],
    },
    {
      // card-mod-recaptcha-0.20.0/set/all/recaptcha.rb - event :recaptcha
      // (:validate, 50-55; no on: — it applies to every action, the
      // dispatcher's absent-on rule) + the format :html helper block
      // (74-104): the helpers hook the form machinery the engine does not
      // run. The event body rides the exported recaptchaEventFn; the
      // `when: :validate_recaptcha?` predicate rides
      // recaptchaModEventPredicates above (the runtime composition merges
      // this table beside the comment mod's, ModEventRuntime.predicates).
      // The portable bytes ride the exported RECAPTCHA_ERROR_CODES /
      // humanCheck / recaptchaOn / recaptchaErrorMessages / recaptchaSuccess
      // / handleRecaptchaConfigErrors / validateRecaptcha /
      // recaptchaTokenHtml above. No views declared.
      setPath: "all/recaptcha",
      // data/real.yml:6-13 — the mod's seeded captcha toggles (*all+*captcha
      // '1' and *signup+*type+*captcha '1'): a stock deck boots with the
      // captcha guard ON for anonymous creates, and the oracle's signup
      // journey pins the armed refusal. Registered into the mod
      // rule-seed registry (mod-rule-seeds.ts) for the form-side gate's
      // synchronous read; the validate side resolves the same answer from
      // storage, where the serving boot seeds these rows.
      ruleSeeds: [
        { name: "*all+*captcha", content: "1" },
        { name: "signup+*type+*captcha", content: "1" },
      ],
      events: [
        {
          event: "recaptcha",
          at: "validate",
          when: "validate_recaptcha",
          fn: recaptchaEventFn,
        },
      ],
    },
    {
      // card-mod-recaptcha-0.20.0/set/right/captcha.rb:1 -
      // `assign_type :toggle` (the file's sole line; advanced_api.rb:5-8),
      // on the manifest's assignsType field (mod-loader.ts:1265-1266
      // registerSetTypeAssignment).
      setPath: "right/captcha",
      assignsType: "toggle",
    },
    {
      // card-mod-recaptcha-0.20.0/set/right/secret_key.rb - include_set
      // Abstract::RecaptchaSetting (the abstract module's methods above).
      setPath: "right/secret_key",
    },
    {
      // card-mod-recaptcha-0.20.0/set/right/site_key.rb - same include.
      setPath: "right/site_key",
    },
    {
      // card-mod-recaptcha-0.20.0/set/self/admin.rb - the warnings-basket
      // push (line 1: `basket[:warnings] << :recaptcha_config_issues`) +
      // admin html helpers; the portable message bytes ride
      // recaptchaConfigIssuesMessage / usingDefaults above. Oracle-pinned:
      // the *admin :warning alert's second <li>.
      setPath: "self/admin",
      basketWarnings: ["recaptcha_config_issues"],
    },
    {
      // card-mod-recaptcha-0.20.0/set/self/captcha.rb:1-5 setting_opts.
      // rule_type_editable absent -> the false default (setting.rb:61).
      // captcha_used?/captcha_used! (7-13) are per-request instance state
      // on the *captcha card consumed by the validate_recaptcha? guard -
      // the captchaUsedTracker factory above is their portable shape.
      setPath: "self/captcha",
      settingOpts: {
        group: "permission",
        position: 5,
        ruleTypeEditable: false,
        helpText:
          "Anti-spam setting.  Requires non-signed-in users to complete " +
          "a [[http://decko.org/captcha|captcha]] before adding or " +
          "editing cards (where permitted).",
      },
    },
    {
      // card-mod-recaptcha-0.20.0/set/self/recaptcha_settings.rb - the
      // gem's one declared html view (:core, 11-13).
      setPath: "self/recaptcha_settings",
      formats: {
        html: {
          views: [
            // recaptcha_settings.rb:11-13 view :core (no config opts)
            { view: "core", viewFn: recaptchaSettingsCoreView },
          ],
        },
      },
    },
  ],
};

export default cardModRecaptcha;
