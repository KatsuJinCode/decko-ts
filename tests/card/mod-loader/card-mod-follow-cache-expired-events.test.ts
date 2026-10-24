// The two follow cache-expiry events (completeness register, events table
// rows card-mod-follow `cache_expired_for_new_preference` and
// `follow_fields_changed`; register verdicts PARTIAL "body disposition not
// individually audited this pass").
//
// Ruby source, read this session:
// - card-mod-follow-0.20.0/set/right/follow.rb:7-9
//     event :cache_expired_for_new_preference, :integrate, when: :preference? do
//       Card.follow_caches_expired
//     end
// - card-mod-follow-0.20.0/set/right/follow_fields.rb:3-5
//     event :follow_fields_changed, :integrate do
//       Card.follow_caches_expired
//     end
//
// Both bodies are the SAME single call: Card.follow_caches_expired
// (card-1.110.0 lib/card/follow.rb — the FOLLOWER_IDS +
// preference caches dropped). The audit question the register left open is
// whether the port's ABSENCE of those caches is a faithfulness gap or the
// same observable answer. The answer is measured here, not asserted in a
// comment: the port resolves followers by querying the reference +
// preference rows FRESH on every call (src/card/notify/follower-resolver.ts
// — preferenceRows issues its driver.query per resolution, no memo), so a
// Ruby deck whose cache had been dropped by this event and a port deck
// that never held the cache answer the SAME row set for the next
// reader. The tests below pin that equivalence against real storage
// rows: a preference change made through the engine's own save path is
// visible to the very next resolveFollowers call.
//
// Ruby oracle checked for exactness:
// - the declaration clauses (stage :integrate; `when: :preference?` only
//   on the first) — pinned by the registration assertions below;
// - the when-gate itself is the shared Card#preference? (rule/all.rb:42-54
//   per the port's citation at card-mod-permissions.ts:698-709), pinned
//   through the predicate the dispatcher actually calls;
// - Card.follow_caches_expired's SEMANTIC content (Ruby: the next reader
//   sees the new preference rows) — pinned by the freshness tests.
//
// What is NOT claimed: no Ruby engine was executed for this event in this
// session; the cache-expiry half is inferred from the source (the two
// event bodies name the cache call and nothing else) plus Ruby's own
// comment on preference_rows being the source of truth. That inference is
// stated in the commit message, not smuggled in as a measurement.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  SET_TYPE_ID,
  type ActionsTestStorage,
  type StandardFixture,
} from "../actions/actions-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventCard } from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventContext } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import {
  permissionsModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { resolveFollowers } from "../../../src/card/notify/index.js";

const ID = {
  setting: 101,
  user: 102,
  follow: 103,
  always: 104,
  never: 105,
  created: 106,
  edited: 107,
  self: 108,
  type: 109,
  account: 110,
  email: 111,
  joeUser: 112,
  joeAccount: 401,
  joeEmail: 402,
  watchedCard: 113,
  watchedSelfSet: 403,
  prefJoin: 404,
  prefRow: 405,
} as const;

/** Every loader this file constructs, so registryReset can release them
 *  all (ModLoader.reset is an instance method; there is no static form). */
const LOADERS: ModLoader[] = [];

function followRegistry() {
  const loader = new ModLoader([{ manifest: cardModFollow }]);
  loader.resolveOrder({ gemMods: ["follow"] });
  loader.load();
  LOADERS.push(loader);
  return loader.eventRegistry();
}

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

/** The follow deck the freshness tests need: the *follow setting, the
 *  option cards, Joe as a User with an account email, and a watched card
 *  under its own *self set (the set rows typed Set, as Ruby's
 *  PreferenceCache SQL requires). */
async function seedFollowDeck(storage: ActionsTestStorage): Promise<StandardFixture> {
  const f = await seedStandardDeck(storage);
  await seedCard(storage, { id: ID.setting, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(storage, { id: ID.user, name: "User", codename: "user", typeId: 3 });
  await seedCard(storage, { id: ID.follow, name: "*follow", codename: "follow", typeId: ID.setting });
  await seedCard(storage, { id: ID.always, name: "*always", codename: "always" });
  await seedCard(storage, { id: ID.never, name: "*never", codename: "never" });
  await seedCard(storage, { id: ID.created, name: "*created", codename: "created" });
  await seedCard(storage, { id: ID.edited, name: "*edited", codename: "edited" });
  await seedCard(storage, { id: ID.self, name: "*self", codename: "self", typeId: ID.setting });
  await seedCard(storage, { id: ID.type, name: "*type", codename: "type", typeId: ID.setting });
  await seedCard(storage, { id: ID.account, name: "*account", codename: "account" });
  await seedCard(storage, { id: ID.email, name: "*email", codename: "email" });
  await seedCard(storage, { id: ID.joeUser, name: "Joe User", typeId: ID.user });
  await seedCard(storage, { id: ID.joeAccount, leftId: ID.joeUser, rightId: ID.account });
  await seedCard(storage, {
    id: ID.joeEmail,
    leftId: ID.joeAccount,
    rightId: ID.email,
    dbContent: "joe@example.com",
  });
  await seedCard(storage, { id: ID.watchedCard, name: "Watched Card", dbContent: "v1" });
  await seedCard(storage, {
    id: ID.watchedSelfSet,
    leftId: ID.watchedCard,
    rightId: ID.self,
    typeId: SET_TYPE_ID,
  });
  return f;
}

/** One `Set+User+*follow` preference: the set+user junction row plus the
 *  preference row (follower-resolver.test.ts seeds the same two rows). */
async function seedFollowRule(
  storage: ActionsTestStorage,
  opts: { content: string; joinId?: number; prefId?: number },
): Promise<void> {
  const joinId = opts.joinId ?? ID.prefJoin;
  const prefId = opts.prefId ?? ID.prefRow;
  await seedCard(storage, { id: joinId, leftId: ID.watchedSelfSet, rightId: ID.joeUser });
  await seedCard(storage, {
    id: prefId,
    leftId: joinId,
    rightId: ID.follow,
    dbContent: opts.content,
  });
}

/** The preference name the `when: :preference?` gate must accept, and the
 *  plain card name it must refuse. */
function gateCard(name: string): ModEventCard {
  return { name };
}

async function preferenceGateAnswer(
  name: string,
  fetch: ActionsTestStorage["engine"],
): Promise<boolean> {
  const predicate = permissionsModEventPredicates["preference?"];
  const ctx = { fetch } as unknown as ModEventContext;
  return predicate(gateCard(name), ctx);
}

describe("follow cache-expiry events — right/follow.rb:7-9 and right/follow_fields.rb:3-5", () => {
  it("registers both events with Ruby's exact clauses (stage :integrate; when: :preference? only on the first)", () => {
    const decls = declaredEvents(cardModFollow);
    const pref = decls.find((d) => d.event === "cache_expired_for_new_preference");
    expect(pref, "cache_expired_for_new_preference not declared").toBeDefined();
    expect(pref!.setPath).toBe("right/follow");
    expect(pref!.at).toBe("integrate");
    expect(pref!.when).toBe("preference?");
    expect(pref!.on).toBeUndefined();

    const fields = decls.find((d) => d.event === "follow_fields_changed");
    expect(fields, "follow_fields_changed not declared").toBeDefined();
    expect(fields!.setPath).toBe("right/follow_fields");
    expect(fields!.at).toBe("integrate");
    expect(fields!.when).toBeUndefined();
    expect(fields!.on).toBeUndefined();

    // Ruby's clause vocabulary carries no :on for either declaration.
    for (const d of [pref!, fields!]) {
      expect(["create", "update", "delete", "save"]).not.toContain(d.on);
    }
  });

  it("both declarations are fn-less (the event() helper's no-op stand-in, mod-manifest.ts:363) — the port holds no cache to expire", () => {
    const decls = declaredEvents(cardModFollow);
    for (const name of ["cache_expired_for_new_preference", "follow_fields_changed"]) {
      const decl = decls.find((d) => d.event === name);
      expect(decl, `${name} not declared`).toBeDefined();
      // fn is required by RegisteredModEvent, so an fn-less declaration
      // lands the helper's `fn: () => undefined` (mod-manifest.ts:363).
      // That no-op IS the disposition: Ruby's body is
      // Card.follow_caches_expired and the port memoizes nothing.
      expect(typeof decl!.fn).toBe("function");
      expect((decl!.fn as () => unknown)()).toBeUndefined();
    }

    // and both reach the loader's registry, so a save dispatches them
    const registry = followRegistry();
    const names = registry.all().map((e) => e.event);
    expect(names).toContain("cache_expired_for_new_preference");
    expect(names).toContain("follow_fields_changed");
    for (const name of ["cache_expired_for_new_preference", "follow_fields_changed"]) {
      const reg = registry.all().find((e) => e.event === name);
      expect(reg, `${name} absent from the registry`).toBeDefined();
      expect(reg!.at).toBe("integrate");
      expect(
        (reg!.fn as unknown as (c: ModEventCard, h: unknown, ctx?: ModEventContext) => unknown)(
          { name: "x" },
          undefined,
        ),
      ).toBeUndefined();
    }
    registryReset();
  });

  it("the when: :preference? gate accepts a real *follow preference and refuses a plain card (rule/all.rb:42-54)", async () => {
    const storage = await createActionsTestStorage();
    const f = await seedFollowDeck(storage);
    await seedFollowRule(storage, { content: "*always" });
    // the junction's own name is the Set+User+*follow card Ruby builds
    const preferenceName = "Watched Card+*self+Joe User+*follow";
    expect(await preferenceGateAnswer(preferenceName, f.engine)).toBe(true);
    // a same-shaped name whose setting is not the *follow preference
    expect(await preferenceGateAnswer("Watched Card+*self+Joe User+*nonsense", f.engine)).toBe(false);
    // a plain set card
    expect(await preferenceGateAnswer("Watched Card", f.engine)).toBe(false);
    expect(await preferenceGateAnswer("", f.engine)).toBe(false);
  });

  it("EQUIVALENCE (the Ruby cache-expired semantics): a preference row change is visible to the NEXT follower read, with no expiry call", async () => {
    const storage = await createActionsTestStorage();
    const f = await seedFollowDeck(storage);
    await seedFollowRule(storage, { content: "*always" });

    // before: *always -> Joe is a follower of the watched card
    const before = await resolveFollowers(f.engine, ID.watchedCard);
    expect(before.map((r) => r.followerName)).toEqual(["Joe User"]);

    // the preference flips to *never in place (what a save through
    // :cache_expired_for_new_preference's gate would write)
    await storage.driver.query(
      "UPDATE cards SET db_content = ? WHERE id = ?",
      ["*never", ID.prefRow],
    );

    // Ruby's Card.follow_caches_expired exists so the next reader re-reads;
    // the port never memoized, so the same re-read is automatic. Same answer.
    const after = await resolveFollowers(f.engine, ID.watchedCard);
    expect(after).toEqual([]);
  });

  it("EQUIVALENCE: the *follow_fields event's own scenario — a *follow fields card save also leaves the next read fresh", async () => {
    const storage = await createActionsTestStorage();
    const f = await seedFollowDeck(storage);
    await seedFollowRule(storage, { content: "*never" });

    // the *never rule stands -> Joe is not a follower
    expect(await resolveFollowers(f.engine, ID.watchedCard)).toEqual([]);

    // the *follow fields save flips the rule to *always in place
    await storage.driver.query(
      "UPDATE cards SET db_content = ? WHERE id = ?",
      ["*always", ID.prefRow],
    );

    // visible immediately: the port has no cache to expire (Ruby's
    // Card.follow_caches_expired is the same guarantee, by a different
    // mechanism).
    expect((await resolveFollowers(f.engine, ID.watchedCard)).map((r) => r.followerName)).toEqual([
      "Joe User",
    ]);
  });

  it("update_follow_rules keeps Ruby's clauses and its trigger: :required gate (follow_defaults.rb:17-30)", () => {
    const decls = declaredEvents(cardModFollow);
    const upd = decls.find((d) => d.event === "update_follow_rules");
    expect(upd, "update_follow_rules not declared").toBeDefined();
    expect(upd!.setPath).toBe("self/follow_defaults");
    expect(upd!.at).toBe("finalize");
    expect(upd!.on).toEqual(["save"]);
    expect(upd!.trigger).toBe("required");
    // the SKIP-BY-NAME row carries no body: the honest stub (mod-manifest
    // .ts:363's no-op), never a faked partial implementation.
    expect(typeof upd!.fn).toBe("function");
    expect((upd!.fn as () => unknown)()).toBeUndefined();
  });

  it("SKIP-BY-NAME evidence: the serving write route parses no update_follow_rules trigger, so trigger: :required can never fire", () => {
    // the route's named-trigger set, read from src/server/write-routes.ts
    // (1525, 1899, 2136, 2143). Pinned as source text so a future trigger
    // addition has to update this list deliberately.
    const route = readFileSync(
      new URL("../../../src/server/write-routes.ts", import.meta.url),
      "utf8",
    );
    // Both spellings the route uses: the inline
    // `parsed.card["trigger"] === "name"` compare, and the local
    // `const trigger = card["trigger"]` followed by `trigger === "name"`.
    const inline = [...route.matchAll(/\["trigger"\]\s*===\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    const local = [...route.matchAll(/\btrigger\s*(?:===|!==)\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    const parsedTriggers = [...new Set([...inline, ...local])];
    expect(parsedTriggers.length).toBeGreaterThan(0);
    expect(parsedTriggers).not.toContain("update_follow_rules");
    // and the named ones the route does handle are still there
    expect(parsedTriggers).toContain("approve_with_verification");
    expect(parsedTriggers).toContain("use_as_current_skin");
    // the route parses SIX named triggers, and the list is pinned whole so
    // a seventh one has to show up here.
    expect(parsedTriggers.sort()).toEqual([
      "approve_with_verification",
      "approve_without_verification",
      "reset_password",
      "send_reset_password_token",
      "use_as_current_skin",
      "verify_and_activate",
    ]);
  });
});

function registryReset(): void {
  // the loader's process-wide table is released so the next construct is
  // clean (reset() is the loader's own API; there is no static reset)
  for (const loader of LOADERS) loader.reset();
  LOADERS.length = 0;
}
