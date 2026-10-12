// The mod rule-seed registry: each mod's data/real.yml rule rows, as far
// as they ship with the ported gems. Ruby's rule lookup (rule/all.rb:5-15)
// reads STORAGE; the mod data rules are seeded into a real deck at deck
// creation (mod data/real.yml), so on a stock deck the storage rows exist
// and carry the gems' values — the serving boot performs that seeding
// (boot-seed's stock profile), and the recorded oracle boots armed on
// exactly these rows: mod/recaptcha data/real.yml's *signup+*type+*captcha
// toggle — the live oracle renders the signup form armed, /new/Sign_up
// carrying data-recaptcha="on" and the token field, while the *signin edit
// form renders unarmed.
//
// Consumers: the FORM side only. The card_form gate (card-mod-edit
// createCardForm) reads the seeds synchronously at render, where a storage
// rule read would be an async surface the format override does not have.
// The VALIDATE side deliberately does NOT consult this registry
// (rule-content-walk): its reach runs through the process-global name
// environment, so a seed consult there would arm decks Ruby keeps unarmed
// (a deck without the rows has no rule; Card::Rule.toggle(nil) is false)
// and would flip on whether another engine instance in the same process
// had installed the environment. On served decks the two sides agree
// because the boot seeds the same rows the gems ship.

import { DeckoName } from "../name.js";
import { getNameEnvironment } from "../name/environment.js";

const seeds = new Map<string, string>();

/** Register one mod rule seed (mod-loader, from a manifest's ruleSeeds).
 *  The seed name is the gem's data/real.yml reference form (segments joined
 *  by "+", codename references unstarred, settings starred — e.g.
 *  "*signup+*type+*captcha"); it keys under its DeckoName key. */
export function registerModRuleSeed(modName: string, name: string, content: string): void {
  const key = DeckoName.parse(name).key;
  if (!seeds.has(key)) seeds.set(key, content);
  void modName;
}

/** The seeded content for a rule CANDIDATE name (the spelled rule name the
 *  candidate walk produced — e.g. "Sign up+*type+*captcha"), or undefined.
 *  Tries the candidate's own key, then the CODENAME-form key: the gem's
 *  references name non-setting segments by CODENAME (data/real.yml
 *  [:signup, :type, :captcha] keys to "signup+type+captcha"), so each
 *  non-setting segment resolves through the sync name environment (the
 *  card's id -> its codename). Unresolvable segments skip the arm. Form-side
 *  consumer only (rule-content-walk's header records why the validate side
 *  stays storage-only). */
export function modRuleSeedContentForCandidate(candidate: string): string | undefined {
  const direct = seeds.get(DeckoName.parse(candidate).key);
  if (direct !== undefined) return direct;
  const env = getNameEnvironment();
  if (env?.lexicon === undefined || env?.codename === undefined) return undefined;
  const codenameSegments: string[] = [];
  for (const segment of candidate.split("+")) {
    if (segment.startsWith("*")) {
      codenameSegments.push(DeckoName.parse(segment).key);
      continue;
    }
    const parsed = DeckoName.parse(segment);
    const id = env.lexicon.id(parsed.key);
    const codename = id !== undefined ? env.codename.nameForId(id) : undefined;
    if (codename === undefined) return undefined;
    codenameSegments.push(DeckoName.parse(codename).key);
  }
  return seeds.get(codenameSegments.join("+"));
}
