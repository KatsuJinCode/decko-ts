/**
 * Environment for the name layer.
 *
 * In Ruby the name methods read process-global state:
 *   - Cardname.cattr_accessor :params / :session (cardname 0.20.0 lib/cardname.rb),
 *     overridden for Card::Name by Card::Name.params (Card::Env.params) and
 *     Card::Name.session (Card::Auth.current.name) - card-1.110.0 lib/card/name.rb.
 *     Contextual resolution reads these at call time: `_main` resolves through
 *     Card::Env.params[:main_name] (cardname lib/cardname/contextual.rb#user_part /
 *     absolutize_contextual_parts), `_user` through Card::Name.session.
 *   - Card::Lexicon (id <-> name registrations) for mark strings ("~75", ":codename"),
 *     Card::Name#standard and Card::Name#card_id.
 *   - Card::Codename for codename lookups.
 *
 * The TS port keeps the same shape as an injectable environment object; tests can
 * install one with setNameEnvironment. With no environment installed, `_main`
 * resolves to "" and `_user` stays relative, matching the Ruby behavior when
 * params/session are unset.
 */

/** Card::Lexicon (card-1.110.0 lib/card/lexicon.rb) subset used by the name layer. */
import { currentRequestContext } from "../request-context.js";

export interface NameLexicon {
  /** Lexicon.name(id): registered name string, or undefined when the id is unknown. */
  name(id: number): string | undefined;
  /**
   * Lexicon.id(name): registered id, or undefined when unknown. Receives the
   * name's canonical KEY - Ruby resolves ids through `{ key: lex.to_name.key }`
   * (lib/card/lexicon.rb#lex_query).
   */
  id(key: string): number | undefined;
}

/** Card::Codename (card-1.110.0 lib/card/codename.rb) subset used by the name layer. */
export interface NameCodenameRegistry {
  /** Codename.id!(codename): id for a codename string, undefined when unknown. */
  id(codename: string): number | undefined;
  /** Codename.name!(codename): card name string for a codename, undefined when unknown. */
  name(codename: string): string | undefined;
  /** Codename[id]: card name string for an id (i2c), undefined when unknown. */
  nameForId(id: number): string | undefined;
}

export interface NameEnvironment {
  /** Card::Auth.current.name via Card::Name.session; resolves `_user`. */
  readonly session?: string;
  /** Card::Env.params[:main_name]; resolves `_main`. */
  readonly mainName?: string;
  readonly lexicon?: NameLexicon;
  readonly codename?: NameCodenameRegistry;
}

let currentEnvironment: NameEnvironment | undefined;

/** Inside a request context (request-context.ts) the environment is that
 *  request's own; outside one it is the process-global environment. */
export function setNameEnvironment(environment: NameEnvironment | undefined): void {
  const ctx = currentRequestContext();
  if (ctx !== undefined) ctx.environment = environment;
  else currentEnvironment = environment;
}

export function getNameEnvironment(): NameEnvironment | undefined {
  const ctx = currentRequestContext();
  return ctx !== undefined ? ctx.environment : currentEnvironment;
}

/**
 * CardController::Rest#record_as_main (rest.rb:63-66), called from
 * load_card (rest.rb:49-54) right after the card is fetched - so it runs
 * for every action that loads a card (read, create, update, delete) and
 * NOT for the shapes that never reach load_card (the `*previous` redirect
 * in interpret_mark, mark.rb:12-14, fires before it):
 *
 *     def record_as_main
 *       Card::Env.main_name = params[:main] || card&.name || ""
 *     end
 *
 * `Card::Env.main_name` is what `_main` resolves through (cardname
 * lib/cardname/contextual.rb #absolutize_contextual_parts, read by
 * name.ts#absolutizeContextualPart): the focal card a request declares
 * for its contextual marks. BEFORE this row nothing in the serving path
 * ever installed it, so `_main` always resolved to "".
 *
 * WHY NOT `||` IN TYPESCRIPT: Ruby's `||` falls through only on nil (or
 * false). An EMPTY `?main=` is the truthy empty STRING in Ruby, so
 * `?main=` yields main_name "" and the card's own name is NOT the
 * fallback. JavaScript's `||` treats "" as falsy and would silently
 * answer the card name instead - the one case where the naive
 * transliteration is observably wrong. `??` carries Ruby's semantics.
 */
export function recordAsMain(
  paramMain: string | undefined,
  cardName: string | undefined,
): string {
  const mainName = paramMain ?? cardName ?? "";
  setNameEnvironment({ ...getNameEnvironment(), mainName });
  return mainName;
}
