// The port of CardController::Mark#implicit_mark's SETUP HALF
// (decko-0.20.0/lib/card_controller/mark.rb:28-63).
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
//
// The completeness register's reg-routes-B10 row splits its hold in two. The
// CLOSABLE half is the mark arming: the pinned deck turns a MARKLESS HTML
// read on a needs-setup deck into the setup card, and the port had no
// equivalent of the method that does it. The CONTRACT half (the env gate on
// the port's own /setup route) is the deployment owner's recorded decision
// and is not this file's business.
//
// ---------------------------------------------------------------------------
// THE PINNED METHOD, verbatim (mark.rb:28-63)
// ---------------------------------------------------------------------------
//
//   def implicit_mark
//     case
//     when initial_setup?                # needs_setup? && Env.html?
//       prepare_setup_card!               # alters params
//       ""
//     when (name = mark_from_card_hash)   # params.dig :card, :name
//       name
//     when view_does_not_require_name?
//       ""
//     else
//       home_mark                         # Card::Rule.global_setting(:home) || "Home"
//     end
//   end
//
//   def home_mark                        # mark.rb:42-44
//     Card::Rule.global_setting(:home) || "Home"
//   end
//
//   def initial_setup?                   # mark.rb:56-58
//     Card::Auth.needs_setup? && Card::Env.html?
//   end
//
//   def prepare_setup_card!              # mark.rb:60-63
//     params[:card] = { type_id: Card.default_accounted_type_id }
//     params[:view] = "setup"
//   end
//
// WHAT THIS FILE PORTS: the FIRST arm of the ladder (the arming) and the
// card it prepares. The other three arms are the port's own mark
// resolution: the mark a request carries, the mark a card hash carries, the
// view that needs no name, and the home fallback. They are measured in
// tests/server/implicit-mark-parity.test.ts, and each host serves the mark
// its own request surface resolved.
//
// ---------------------------------------------------------------------------
// THE ARMING IS A CONJUNCTION, and the conjunction is the whole of it
// ---------------------------------------------------------------------------
//
// The census (Ruby's needs_setup?) AND the request kind (Ruby's
// Card::Env.html?). So:
//   - a JSON request on a needs-setup deck is NOT the setup card;
//   - a deck whose census is closed is NOT the setup card, whatever the
//     request kind is;
//   - the arming answers the EMPTY mark, so the read lands on the prepared
//     card rather than on a card named by the URL.
//
// ---------------------------------------------------------------------------
// THE CENSUS IS THE CENSUS, NOT THE PORT'S WINDOW
// ---------------------------------------------------------------------------
//
// Ruby's needs_setup? is purely the account count
// (card-1.110.0/lib/card/auth/setup.rb:33-52). The port's setupWindowState
// folds the deploy gates (DECKO_FIRST_RUN, DECKO_WRITE_PATH) on top of that
// count, because the port's /setup route is a PORT surface. The arming
// counts through setupCensus, so the arming's own decision is Ruby's.
//
// THE DEPLOY GATES ARE THE PRODUCER'S BUSINESS, and the producer takes them
// as INPUTS rather than reading them itself: every host derives its own
// flags (the Node hosts read the environment, the edge reads its env bag,
// the Cloudflare shell derives the flag it hands down), and a gate this
// module read for itself would be a THIRD derivation of the same fact.
//
// The gate order is the port's own (first-run-setup.ts's setupWindowState):
// the first-run gate first, then the write-path gate, then the census. A
// deployment that has neither spends no query, which is what the port's own
// module header means by "an un-armed deployment must not spend a query".
//
// WHAT THE GATES DO NOT CHANGE: the ARMING's own decision. The conjunction
// (the census AND the request kind) is the pinned one, and the gates decide
// whether the deployment has the first-run journey at all, not whether the
// deck needs setting up.
//
// ---------------------------------------------------------------------------
// THE VIEW GATE
// ---------------------------------------------------------------------------
//
// Ruby's setup view carries `perms: :needs_setup?`
// (card-mod-account-0.20.0/set/type/user.rb:10-11) and the render pipeline
// asks Card::Auth.needs_setup? synchronously at render time. The port's
// census is async SQL, so the gate reads the PREPARED verdict
// (first-run-setup-verdict-seam.ts). This file is the producer that hands
// it: the arming prepares the card AND the census verdict, so the view gate
// and the arming can never disagree about the deck.
//
// A census that could not RUN (the account system or the bot is absent) is
// not a closed census, and the hand-off says so by handing NOTHING, exactly
// as the /setup route's own producer does.
//
// ---------------------------------------------------------------------------
// THE PREPARED CARD
// ---------------------------------------------------------------------------
//
// Ruby's prepare_setup_card! writes `params[:card] = { type_id:
// Card.default_accounted_type_id }`: a NEW card of the deck's default
// accounted type (the User cardtype, set/all/account.rb:3-5), and
// `params[:view] = "setup"`. The port renders the same card through the
// same view: the account mod's own setup view
// (src/card/mod-loader/mods/card-mod-account.ts) reads the same type id
// through the same name ("User"), and the deck's User cardtype card is what
// the port resolves.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { FetchEngine } from "../fetch.js";
import { setupCensus, type SetupWindowDeps } from "./first-run-setup.js";
import { setPreparedSetupVerdict } from "./first-run-setup-verdict-seam.js";

/** The view the arming prepares (mark.rb:62 — `params[:view] = "setup"`). */
export const SETUP_VIEW = "setup";

/** The deck's default accounted type, by name: the User cardtype card
 *  (set/all/account.rb:3-5 — `default_accounted_type_id` is UserID). The
 *  account mod's own setup form resolves the same card by the same name
 *  (card-mod-account.ts's setupHiddenFields). */
export const DEFAULT_ACCOUNTED_TYPE_NAME = "User";

/** The card the arming prepares: Ruby's params[:card] and params[:view]
 *  (mark.rb:60-63). */
export interface PreparedSetupCard {
  /** params[:card] — the new card's type. */
  readonly card: { readonly type_id: number };
  /** params[:view] — the setup view. */
  readonly view: typeof SETUP_VIEW;
}

/**
 * mark.rb:56-58 — `initial_setup?`:
 *   `Card::Auth.needs_setup? && Card::Env.html?`
 *
 * The conjunction, in the pinned order. The census is asked first, so a
 * closed census never reads the request kind.
 */
export function initialSetupArming(input: {
  readonly needsSetup: boolean;
  readonly html: boolean;
}): boolean {
  return input.needsSetup && input.html;
}

/**
 * mark.rb:60-63 — `prepare_setup_card!`:
 *   `params[:card] = { type_id: Card.default_accounted_type_id }`
 *   `params[:view] = "setup"`
 */
export function prepareSetupCard(typeId: number): PreparedSetupCard {
  return { card: { type_id: typeId }, view: SETUP_VIEW };
}

/**
 * The arming, whole: the pinned conjunction, and the card the pinned method
 * prepares when the conjunction holds.
 *
 * A deck with no User cardtype has no default accounted type to prepare,
 * and the pinned capture records what the pinned deck does in that case:
 * the method RAISES (fixtures/captured/implicit-mark-ruby-oracle.json's
 * initialSetup cell, "NoMethodError: undefined method
 * 'default_accounted_type_id' for class Card"). The port answers the
 * arming's own question instead of raising: no type, no prepared card, so
 * the read keeps its own mark. The arming's DECISION is unaffected: it is
 * the conjunction, and the conjunction does not read the type.
 */
export function implicitSetupArming(input: {
  readonly needsSetup: boolean;
  readonly html: boolean;
  readonly typeId: number | undefined;
}): PreparedSetupCard | undefined {
  if (!initialSetupArming(input)) return undefined;
  if (input.typeId === undefined) return undefined;
  return prepareSetupCard(input.typeId);
}

/**
 * The deck's default accounted type id: the User cardtype card's id, which
 * is Ruby's `Card.default_accounted_type_id`
 * (set/all/account.rb:3-5). Undefined when the deck carries no such card.
 */
export async function defaultAccountedTypeId(
  fetcher: Pick<FetchEngine, "fetchByName">,
): Promise<number | undefined> {
  const card = await fetcher.fetchByName(DEFAULT_ACCOUNTED_TYPE_NAME);
  return card?.id;
}

/** What the read path's producer needs. The driver and the fetcher are the
 *  same two seams the /setup route's context takes (first-run-routes.ts). */
export interface SetupArmingDeps extends SetupWindowDeps {
  readonly driver: SQLDatabaseDriver;
  readonly fetcher: Pick<FetchEngine, "fetchByName">;
}

/** The deploy gates, supplied by the host that owns the deployment's flags.
 *  Their order and their meaning are the port's own (first-run-setup.ts's
 *  setupWindowState): the first-run gate, then the write-path gate, then
 *  the census. */
export interface SetupArmingGates {
  /** DECKO_FIRST_RUN: the deployment has the first-run journey. */
  readonly firstRunEnabled: boolean;
  /** DECKO_WRITE_PATH: the deck can create the owner, so the setup card's
   *  form is a form whose submit can work. */
  readonly writePathEnabled: boolean;
}

/** The producer's answer: the prepared card when the arming holds, and the
 *  census that decided it either way. */
export interface SetupArmingResult {
  /** TRUE when the arming holds and a card was prepared. */
  readonly armed: boolean;
  /** The prepared card (mark.rb:60-63). Absent when not armed. */
  readonly prepared: PreparedSetupCard | undefined;
  /** The census's own reason, or the gate that stopped the producer. */
  readonly censusReason: string;
  /** The census count, when it ran. */
  readonly accountCount: number | undefined;
}

/** The reason a producer stopped before the census: the deployment has no
 *  first-run journey (the port's own "disabled" reason). */
export const ARMING_DISABLED = "disabled";
/** The reason a producer stopped after the census could not run: the deck
 *  carries no account system, or no bot to exclude. */
export const ARMING_CENSUS_UNCOMPUTABLE = "census_uncomputable";

/**
 * The read path's producer: the deploy gates, the census, the request kind,
 * the prepared card, and the hand-off to the sync view gate.
 *
 * `html` is the port's Card::Env.html?: the request's format is the html
 * one. A host that serves other formats answers false for them, and the
 * arming then keeps the home mark, exactly as the pinned method does.
 *
 * The hand-off happens on every census that RAN, not only on an armed one:
 * Ruby's view gate asks the census at render time, so a deck whose census
 * closed answers the gate closed. A census that could not run hands
 * NOTHING, because a census that did not run is not a closed census.
 */
export async function armSetupCardForRead(
  deps: SetupArmingDeps,
  input: { readonly html: boolean; readonly gates: SetupArmingGates },
): Promise<SetupArmingResult> {
  // The port's gate order: an un-armed deployment spends no query.
  if (!input.gates.firstRunEnabled) {
    return {
      armed: false,
      prepared: undefined,
      censusReason: ARMING_DISABLED,
      accountCount: undefined,
    };
  }
  if (!input.gates.writePathEnabled) {
    return {
      armed: false,
      prepared: undefined,
      censusReason: ARMING_DISABLED,
      accountCount: undefined,
    };
  }
  const census = await setupCensus(deps);
  if (census.reason === "needs_setup") {
    setPreparedSetupVerdict({ open: true, accountCount: census.accountCount });
  } else if (census.reason === "setup_complete") {
    setPreparedSetupVerdict({ open: false, accountCount: census.accountCount });
  } else {
    // The census could not RUN. That is not a closed census, and it must
    // not close the card-view gate on the census's behalf.
    return {
      armed: false,
      prepared: undefined,
      censusReason: ARMING_CENSUS_UNCOMPUTABLE,
      accountCount: census.accountCount,
    };
  }
  if (!census.open) {
    return {
      armed: false,
      prepared: undefined,
      censusReason: census.reason,
      accountCount: census.accountCount,
    };
  }
  const typeId = await defaultAccountedTypeId(deps.fetcher);
  const prepared = implicitSetupArming({
    needsSetup: census.open,
    html: input.html,
    typeId,
  });
  return {
    armed: prepared !== undefined,
    prepared,
    censusReason: census.reason,
    accountCount: census.accountCount,
  };
}
