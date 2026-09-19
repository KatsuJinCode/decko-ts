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

export function setNameEnvironment(environment: NameEnvironment | undefined): void {
  currentEnvironment = environment;
}

export function getNameEnvironment(): NameEnvironment | undefined {
  return currentEnvironment;
}
