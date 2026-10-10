// The mod rule-seed registry: each mod's data/real.yml rule rows, as far
// as they ship with the ported gems. Ruby's rule lookup (rule/all.rb:5-15)
// reads STORAGE first; the mod data rules are seeded into a real deck at
// deck creation (mod data/real.yml), so on a stock deck the storage rows
// exist and the lookup never sees this registry. The port's fixture decks
// and scrubbed corpora, however, carry only the deck's own rows — the mod
// seeds stand in as the fallback answer when no storage candidate exists
// (the recorded oracle boots armed on exactly these: mod/recaptcha
// data/real.yml's *signup+*type+*captcha toggle — the live oracle renders
// the signup form armed, /new/Sign_up carrying data-recaptcha="on" and the
// token field, while the *signin edit form renders unarmed).
//
// Precedence note: a storage rule row ALWAYS wins (this registry answers
// only when every storage candidate missed) — the same order Ruby's deck
// shows, where the seeded rows are themselves storage.

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
 *  card's id -> its codename). Unresolvable segments skip the arm. */
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
