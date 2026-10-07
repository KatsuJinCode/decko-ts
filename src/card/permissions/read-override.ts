// The mod set-module ok_to_read? overrides — the READ-verdict layer that
// REPLACES the generic stored-read-rule path for the cards its sets match.
//
// Ruby's read check is Card#ok_to_read? (card-mod-permissions-0.20.0
// set/all/permissions.rb:139-146: stored read_rule_id into
// Auth.as_card.read_rules_hash), but ok_to_read? is not one method: thirteen
// mod set files define their own for the cards their set matches, and set
// modules are included so the set-specific method wins. The port's verdict
// walk computed only the generic hash path, so every card below denied where
// Ruby's override grants (the a work item over-deny family: Anonymous+*account,
// Anonymous+*account+*email, FrAi+*right+*head, GBA+*right+*head, the
// +*self+*head virtual rule-card bars in the rules-editor navs, and 12 more
// of the triage's permission_denied_mismatch pages).
//
// The overrides, verbatim by gem file:
//
//   card core       mod/core/set/self/version.rb:3            true
//   account         set/self/signin.rb:37                     true
//   layout          set/self/account_links.rb:3               true
//   layout          set/right/head.rb:3                       true
//   script          set/right/script.rb:3                     true
//   layout          set/right/enabled_roles.rb:5              true
//   style           set/type_plus_right/set/style.rb:9        true
//   account         set/right/account.rb:28                   own_account? || super
//   account         set/right/password.rb:17                  own_account? || super
//   api_key         set/right/api_key.rb:24                   own_account? || super
//   account         set/right/email.rb:39                     own_email? || always_ok? else DENY (no super)
//   assets          set/right/asset_output.rb:5               left.ok_to_read?
//
// own_account? (right/account.rb:20-22): `accounted&.try :own_account?` —
// the LEFT card answers only when a set module defines own_account? on it:
// right::account itself (the chain: "X+*account+*api key"'s left IS an
// +*account card), or AccountHolder (abstract/account_holder.rb:18-20
// `key == Auth.as_card.key`), included at set/self/anonymous.rb:1,
// set/self/decko_bot.rb:1, set/type/signup.rb:1, set/type/user.rb:1. A left
// that answers neither is Ruby's nil -> falsy -> `super` (the generic path).
// own_email? (right/email.rb:45-47): `name.part_names[0].key ==
// Auth.as_card.key` — pure first-part name match, no holder requirement.
//
// Set membership is by NAME KEY (Set::Pattern application), and KEYS
// PRESERVE THE STAR: cardname-0.20.0 lib/cardname.rb:37
// `OK4KEY_RE = '\p{Word}\*'` keeps the asterisk a key-legal character, so
// `Card["*head"].key == "*head"`. The set-module FILE names strip the star
// and underscore the words (set/right/head.rb, set/self/account_links.rb) —
// that is mod-loader path spelling, NOT set application: a set module is
// included into exactly the cards matching its SET CARD
// ("*head+*right", "*account links+*self"), and set matching is by the
// ANCHOR CARD'S KEY. Keys also SINGULARIZE each piece through the same
// inflections as every other key ("*enabled roles" -> "*enabled_role",
// "*account links" -> "*account_link", "Anonymous" -> "anonymou" — the
// port's stableKey, cardname lib/cardname.rb #simple_key chain). The
// comparisons below therefore never hand-spell a key: every one is derived
// through DeckoName.parse(<the gem set's anchor card name>).key on first
// use (post-inflection-boot), so the port's own inflection config produces
// exactly the key set application compares — never wider, never narrower.
//
// Oracle proven on the capture deck (a Ruby probe run against the same
// deck the expected renders were captured from): every named over-deny
// card answers ok?(:read)=true in the deck Ruby rendered expected-v2
// from, while the CONTROL (the "FOR CHILDREN'S CLASS" card — a plain
// card with a *self rule granting five roles) stays false — the generic
// path still denies.

import { DeckoName } from "../name.js";
import { onDeckInflectionsChanged } from "../name/inflect.js";
import type { CardRecord } from "../fetch/card-record.js";

/** What a caller supplies so the overrides can resolve left cards, the Set
 *  cardtype, and the viewer identity. All fetches are the engine's
 *  cache-first ones (renderCards map first at the render.ts call sites). */
export interface ReadOverrideDeps {
  /** Ruby: Auth.as_card.key — the viewer card's canonical key. Undefined
   *  only when the viewer card is unresolvable, in which case the identity
   *  overrides defer (never deny on missing knowledge). */
  readonly viewerKey: string | undefined;
  fetchByKey(key: string): Promise<CardRecord | undefined>;
  fetchById(id: number): Promise<CardRecord | undefined>;
  /** The left card's FULL read verdict (overrides + generic path) — the
   *  right::asset_output delegation. The caller's own machinery supplies
   *  this so the recursion memoizes into the same verdict maps. */
  leftReadVerdict(leftName: DeckoName, depth: number): Promise<boolean | undefined>;
}

/** The deps the identity chains (own_account? and its update-task
 *  siblings) actually touch — the subset of ReadOverrideDeps without the
 *  read-delegation callback. */
export type IdentityOverrideDeps = Pick<
  ReadOverrideDeps,
  "viewerKey" | "fetchByKey" | "fetchById"
>;

/** Recursion cap for the own_account?/asset_output chains: every hop
 *  consumes one name part (the left chain strictly shrinks) — paranoia,
 *  not the termination argument. */
const OVERRIDE_MAX_DEPTH = 16;

/** The gem sets' anchor-card keys, derived through the port's own name
 *  machinery so inflections (singularization, star preservation) are the
 *  SAME code path set application uses. Computed LAZILY on first use —
 *  a deck's amended inflection tables are boot-time data
 *  (applyDeckInflections at fixture/corpus seed), and a module-load
 *  computation would freeze pre-boot tables; first use is always
 *  post-boot. Comment = the gem set card each anchor names. */
interface OverrideKeys {
  version: string; // set/self/version.rb — "*version+*self"
  signin: string; // set/self/signin.rb (card-mod-account) — "*signin+*self"
  accountLinks: string; // set/self/account_links.rb (card-mod-layout)
  head: string; // set/right/head.rb (card-mod-layout) — "*head+*right"
  script: string; // set/right/script.rb (card-mod-script)
  enabledRoles: string; // set/right/enabled_roles.rb (card-mod-layout)
  email: string; // set/right/email.rb (card-mod-account)
  account: string; // set/right/account.rb (card-mod-account)
  password: string; // set/right/password.rb (card-mod-account)
  apiKey: string; // set/right/api_key.rb (card-mod-api_key)
  assetOutput: string; // set/right/asset_output.rb (card-mod-assets)
  style: string; // set/type_plus_right/set/style.rb — "Set+*style"
  salt: string; // set/right/salt.rb (card-mod-account, Abstract::AccountField)
  status: string; // set/right/status.rb (card-mod-account, Abstract::AccountField)
}
let keysCache: OverrideKeys | undefined;
function overrideKeys(): OverrideKeys {
  if (keysCache === undefined) {
    keysCache = {
      version: DeckoName.parse("*version").key,
      signin: DeckoName.parse("*signin").key,
      accountLinks: DeckoName.parse("*account links").key,
      head: DeckoName.parse("*head").key,
      script: DeckoName.parse("*script").key,
      enabledRoles: DeckoName.parse("*enabled roles").key,
      email: DeckoName.parse("*email").key,
      account: DeckoName.parse("*account").key,
      password: DeckoName.parse("*password").key,
      apiKey: DeckoName.parse("*api key").key,
      assetOutput: DeckoName.parse("*asset output").key,
      style: DeckoName.parse("*style").key,
      salt: DeckoName.parse("*salt").key,
      status: DeckoName.parse("*status").key,
    };
  }
  return keysCache;
}
/** Whether a set-module ok_to_read? override may decide this name's read
 *  verdict (the populations readPermissionOverride dispatches on). Sync and
 *  query-free: callers that cannot run the async override use it to stay
 *  out of those populations. */
export function nameHasReadOverride(name: DeckoName): boolean {
  const K = overrideKeys();
  if (!name.isCompound) {
    return name.key === K.version || name.key === K.signin || name.key === K.accountLinks;
  }
  const tag = name.tagKey;
  return (
    tag === K.head ||
    tag === K.script ||
    tag === K.enabledRoles ||
    tag === K.email ||
    tag === K.account ||
    tag === K.password ||
    tag === K.apiKey ||
    tag === K.assetOutput ||
    tag === K.style
  );
}

// A deck-inflection config change invalidates the anchor keys exactly like
// DeckoName's own memo cache (name.ts static block) — a new config may
// singularize the anchor pieces differently.
onDeckInflectionsChanged(() => {
  keysCache = undefined;
});

/** Codename cards whose SET modules include AccountHolder
 *  (account_holder.rb's includers): the left card answers own_account?
 *  with `key == Auth.as_card.key`. */
const ACCOUNT_HOLDER_CODENAMES = new Set(["anonymous", "decko_bot"]);
/** Cardtype codenames whose type set includes AccountHolder. */
const ACCOUNT_HOLDER_TYPE_CODENAMES = new Set(["user", "signup"]);

/**
 * The override verdict for one card: true = allow, false = deny,
 * undefined = no override applies (or the applicable one defers via
 * `super`) — the generic stored/live path decides.
 */
export async function readPermissionOverride(
  name: DeckoName,
  deps: ReadOverrideDeps,
  depth = 0,
): Promise<boolean | undefined> {
  // The self-set overrides: set/self/version.rb (the "*version" card),
  // set/self/signin.rb ("*signin"), set/self/account_links.rb
  // ("*account links") — each a bare `def ok_to_read?; true; end`.
  const K = overrideKeys();
  if (!name.isCompound) {
    if (name.key === K.version || name.key === K.signin || name.key === K.accountLinks) {
      return true;
    }
    return undefined;
  }
  if (depth >= OVERRIDE_MAX_DEPTH) return undefined;
  switch (name.tagKey) {
    // set/right/head.rb:3, set/right/script.rb:3,
    // set/right/enabled_roles.rb:5 — unconditional `true`.
    case K.head:
    case K.script:
    case K.enabledRoles:
      return true;
    // set/right/email.rb:39-43 — `own_email? || Auth.always_ok?` else
    // deny_because; NO super: the override's denial is FINAL for every
    // non-own, non-always-ok viewer even where the stored rule would
    // grant. (always_ok? viewers never reach the walk — the caller
    // short-circuits on state.alwaysOk — matching the override's own
    // `|| Auth.always_ok?` arm.)
    case K.email: {
      if (deps.viewerKey === undefined) return undefined;
      // own_email? (email.rb:45-47): `name.part_names[0].key ==
      // Auth.as_card.key` — the FIRST PART (for "A+*account+*email" that
      // is "A", not the left compound "A+*account").
      return name.partKeys[0] === deps.viewerKey;
    }
    // set/right/account.rb:28, set/right/password.rb:17,
    // set/right/api_key.rb:24 — `own_account? || super`. The verdict is
    // NEVER false here: Ruby's own_account? is only consulted for
    // TRUTHINESS — truthy allows, falsy (a holder that isn't one's own,
    // or a left that answers nil) runs `super`, i.e. the generic
    // stored/live path. undefined = the generic path decides.
    case K.account:
    case K.password:
    case K.apiKey:
      return ownAccountVerdict(name, deps, depth);
    // set/right/asset_output.rb:5 — `left.ok_to_read?` — the verdict IS
    // the left card's (its own overrides included); undefined when the
    // left is unresolvable (no widening from missing data).
    case K.assetOutput: {
      const left = name.leftName;
      if (left === undefined) return undefined;
      return deps.leftReadVerdict(left, depth + 1);
    }
    // set/type_plus_right/set/style.rb:9 — the set is "Set+*style": the
    // left card's TYPE must be the Set cardtype (pattern.rb type_plus_right
    // anchor: superleft&.type_name == "Set").
    case K.style: {
      const left = name.leftName;
      if (left === undefined) return undefined;
      const leftCard = await deps.fetchByKey(left.key);
      if (leftCard?.typeId === undefined) return undefined;
      const setType = await deps.fetchByKey("set");
      if (setType?.id === undefined) return undefined;
      return leftCard.typeId === setType.id ? true : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * right/account.rb's own_account? chain: `accounted&.try :own_account?` —
 * the LEFT card answers own_account? when
 *   (a) it is itself an +*account card (right/account.rb defines
 *       own_account? for the whole "+*account" population — the chain
 *       "X+*account+*api key"'s left IS an +*account card), or
 *   (b) it is an AccountHolder (codename anonymous/decko_bot or cardtype
 *       user/signup), answering `key == Auth.as_card.key`.
 * The return is TRUE or UNDEFINED only — Ruby's `own_account? || super`
 * consults the answer for truthiness alone: a holder that is not one's
 * own (false) and a non-holder (nil) BOTH run `super`, so both fall
 * through to the caller's generic stored/live path. No viewer key ->
 * defer (never deny on missing knowledge).
 */
async function ownAccountVerdict(
  name: DeckoName,
  deps: IdentityOverrideDeps,
  depth: number,
): Promise<boolean | undefined> {
  if (deps.viewerKey === undefined || depth >= OVERRIDE_MAX_DEPTH) return undefined;
  const left = name.leftName;
  if (left === undefined) return undefined;
  if (left.tagKey === overrideKeys().account) return ownAccountVerdict(left, deps, depth + 1);
  const leftCard = await deps.fetchByKey(left.key);
  if (leftCard === undefined) return undefined;
  const holder =
    (leftCard.codename !== undefined && ACCOUNT_HOLDER_CODENAMES.has(leftCard.codename)) ||
    (await isHolderType(leftCard, deps));
  if (!holder) return undefined;
  return leftCard.key === deps.viewerKey ? true : undefined;
}

async function isHolderType(card: CardRecord, deps: IdentityOverrideDeps): Promise<boolean> {
  if (card.typeId === undefined) return false;
  const typeCard = await deps.fetchById(card.typeId);
  return typeCard?.codename !== undefined && ACCOUNT_HOLDER_TYPE_CODENAMES.has(typeCard.codename);
}

// -------------------------------------------------------------------------
// the UPDATE-task overrides — the ok_to_update? layer the page head's
// universal_edit_button rides (card-mod-format set/all/html/head.rb:46-51
// `view :universal_edit_button, denial: :blank, perms: :update`), same
// set-module replacement shape as the read layer. Only the sets this
// engine's render surface actually meets are ported; everything else
// defers to the generic permit(:update) walk.
// -------------------------------------------------------------------------

/**
 * The ok_to_update? override verdict for one card: true = allow,
 * undefined = no override applies (or the applicable one's own_account? is
 * falsy -> `super`) — the generic permit(:update) path decides. The only
 * FINAL deny is right::status's own-status lock.
 *
 * The `!name_changed? && !type_id_changed?` guards in the gems are TRUE
 * here by construction: the render path judges FETCHED records
 * (fetch/populated cards carry no dirty name/type state), which is
 * exactly the state the captured pages' ok?(:update) ran under.
 */
export async function updatePermissionOverride(
  name: DeckoName,
  deps: IdentityOverrideDeps,
): Promise<boolean | undefined> {
  const K = overrideKeys();
  if (!name.isCompound) {
    // set/abstract/account_holder.rb:59 — the HOLDER card itself:
    // `(own_account? && !type_id_changed?) || super`, clean here.
    return holderSelfVerdict(name, deps);
  }
  switch (name.tagKey) {
    // set/right/account.rb:33 — `(own_account? && !name_changed? &&
    // !type_id_changed?) || super`, clean here.
    case K.account:
      return ownAccountVerdict(name, deps, 0);
    // set/abstract/account_field.rb:16 (via right/email.rb,
    // right/password.rb, right/salt.rb) — `(account_card&.own_account?
    // && clean) || super`. account_field#account_card is the LEFT only
    // when left.right_id is the *account card (account_field.rb:3-5) —
    // a plain "Jane+*email" (left has no right) is nil -> super.
    case K.email:
    case K.password:
    case K.salt:
      return accountFieldOwnAccount(name, deps);
    // set/right/status.rb:16-22 — the file's OWN ok_to_update? shadows
    // AccountField's (include_set precedes the def): a viewer CANNOT
    // change its own account status — `own_account? && !always_ok? ->
    // deny_because`, else super. FINAL deny (no super in the deny arm).
    case K.status: {
      const own = await accountFieldOwnAccount(name, deps);
      return own === true ? false : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * account_field.rb:3-5 + :12 — the left card IS the account card iff its
 * right_id is the *account card's id; then the verdict is that +*account
 * card's own own_account? (the right::account chain). nil -> undefined.
 */
async function accountFieldOwnAccount(
  name: DeckoName,
  deps: IdentityOverrideDeps,
): Promise<boolean | undefined> {
  if (deps.viewerKey === undefined) return undefined;
  const left = name.leftName;
  if (left === undefined) return undefined;
  const leftCard = await deps.fetchByKey(left.key);
  if (leftCard?.rightId === undefined) return undefined;
  const accountCard = await deps.fetchByKey(overrideKeys().account);
  if (accountCard?.id === undefined) return undefined;
  if (leftCard.rightId !== accountCard.id) return undefined;
  return ownAccountVerdict(left, deps, 1);
}

/**
 * account_holder.rb:59 for the holder card itself (Anonymous, Decko Bot,
 * user/signup-typed cards): `(own_account? && !type_id_changed?) || super`
 * — own_account? is `key == Auth.as_card.key` (account_holder.rb:18-20).
 * Truthiness only: not-own -> super.
 */
async function holderSelfVerdict(
  name: DeckoName,
  deps: IdentityOverrideDeps,
): Promise<boolean | undefined> {
  if (deps.viewerKey === undefined) return undefined;
  const selfCard = await deps.fetchByKey(name.key);
  if (selfCard === undefined) return undefined;
  const holder =
    (selfCard.codename !== undefined && ACCOUNT_HOLDER_CODENAMES.has(selfCard.codename)) ||
    (await isHolderType(selfCard, deps));
  if (!holder) return undefined;
  return selfCard.key === deps.viewerKey ? true : undefined;
}
