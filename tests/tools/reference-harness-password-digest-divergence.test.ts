// The password-digest divergence the ts-pbkdf2 harness configuration declares
// (reference-harness/runner/divergences.mjs): it masks the digest value of a
// +*password card and nothing else. Each case is a delta the grader would
// read; the negative cases are changes the divergence must leave failing.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs harness module without type declarations
import { MASKED_PASSWORD_DIGEST, isPasswordDigest, maskPasswordDigests, passwordDigestContext, validateDeclaredDivergences } from "../../reference-harness/runner/divergences.mjs";

const SHA1 = "c109ea3d686454ae92e588cb0a0dc2f312e8990b";
const PBKDF2 = "pbkdf2_sha256$600000$uBRUF6yiFPxy0NkxRcy3rg==$GS/E5/Z1jx7eLTHBVoc7ZLnUk5TLWHlAaP6YNOu+7rA=";
const PASSWORD_CODE = 216;
const context = { passwordCodeId: PASSWORD_CODE, passwordCards: new Set([620]), actionCards: new Map([[900, 620], [901, 5]]) };
const cards = (d: object) => ({ cards: { inserted: [], updated: [], deleted: [], ...d } });

describe("password-digest divergence", () => {
  it("recognises both digest schemes and nothing else", () => {
    expect([SHA1, PBKDF2].map(isPasswordDigest)).toEqual([true, true]);
    expect(["<p>hi</p>", "", null, 40, SHA1.toUpperCase(), "pbkdf2_sha256$x$y$z"].map(isPasswordDigest)).toEqual([false, false, false, false, false, false]);
  });

  it("a sign-in upgrade that rewrites only the digest grades as the oracle's empty delta", () => {
    const { delta, masked } = maskPasswordDigests(cards({ updated: [{ id: 620, changes: { db_content: [SHA1, PBKDF2] } }] }), context);
    expect(delta).toEqual({});
    expect(masked).toEqual(["cards/updated/620/db_content"]);
  });

  it("any other column the upgrade touched is still compared", () => {
    const { delta } = maskPasswordDigests(
      cards({ updated: [{ id: 620, changes: { db_content: [SHA1, PBKDF2], updated_at: ["2026-01-01", "2026-02-02"] } }] }),
      context,
    );
    expect(delta).toEqual(cards({ updated: [{ id: 620, changes: { updated_at: ["2026-01-01", "2026-02-02"] } }] }));
  });

  it("a digest-shaped value on a card that is not a +*password card is not masked", () => {
    const input = cards({ updated: [{ id: 7, changes: { db_content: [SHA1, PBKDF2] } }] });
    expect(maskPasswordDigests(input, context)).toEqual({ delta: input, masked: [] });
  });

  it("a password card whose content changes to something that is not a digest is not masked", () => {
    const input = cards({ updated: [{ id: 620, changes: { db_content: [SHA1, "plain text"] } }] });
    expect(maskPasswordDigests(input, context).delta).toEqual(input);
  });

  it("a newly created password card and its change row compare everything but the digest", () => {
    const ruby = {
      cards: { inserted: [{ id: 700, left_id: 699, right_id: PASSWORD_CODE, db_content: SHA1 }], updated: [], deleted: [] },
      card_actions: { inserted: [{ id: 950, card_id: 700 }], updated: [], deleted: [] },
      card_changes: { inserted: [{ id: 3, card_action_id: 950, field: 2, value: SHA1 }, { id: 4, card_action_id: 901, field: 2, value: SHA1 }], updated: [], deleted: [] },
    };
    const port = JSON.parse(JSON.stringify(ruby).replaceAll(SHA1, PBKDF2));
    const a = maskPasswordDigests(ruby, context);
    const b = maskPasswordDigests(port, context);
    expect(a.delta.cards.inserted[0].db_content).toBe(MASKED_PASSWORD_DIGEST);
    expect(a.delta.card_changes.inserted[0].value).toBe(MASKED_PASSWORD_DIGEST);
    // The change row of an action on another card keeps its value.
    expect(a.delta.card_changes.inserted[1].value).toBe(SHA1);
    expect(b.delta.card_changes.inserted[1].value).toBe(PBKDF2);
    expect(a.delta.cards).toEqual(b.delta.cards);
    expect(ruby.cards.inserted[0].db_content).toBe(SHA1); // the input is not changed
  });

  it("only known divergences, each with a reason, can be declared", () => {
    expect(() => validateDeclaredDivergences({ "password-digest": "why" })).not.toThrow();
    expect(() => validateDeclaredDivergences({ "everything": "why" })).toThrow(/unknown divergence/);
    expect(() => validateDeclaredDivergences({ "password-digest": "" })).toThrow(/non-empty/);
  });

  const fixture = join(process.cwd(), "reference-harness", "fixtures", "synthetic-v1");
  it.skipIf(!existsSync(join(fixture, "deck", "deck.sqlite3")))(
    "reads the synthetic deck's password cards without leaving files beside it",
    () => {
      const before = readdirSync(join(fixture, "deck")).sort();
      const read = passwordDigestContext(fixture);
      expect(read.passwordCodeId).toBe(PASSWORD_CODE);
      expect([...read.passwordCards].sort()).toEqual([614, 620]);
      expect(readdirSync(join(fixture, "deck")).sort()).toEqual(before);
    },
  );
});
