# Permission actors notes — signed-in viewers in the read-permission engine

Stream: non-anonymous permission actors (S2). Companion to
`docs/permissions-port-notes.md` (the read-rule algebra itself). Ruby gems:
`card-1.110.0`, `card-mod-account-0.20.0`, `card-mod-permissions-0.20.0`,
`card-mod-list-0.20.0`, `card-mod-session-0.20.0`.

## The Ruby mechanism, file + line

The read check stays what the read-permission stream ported
(`set/all/permissions.rb:139-146 ok_to_read?`): `always_ok?` short-circuit,
then `Auth.as_card.read_rules_hash[read_rule_id]`. This stream ports how
`Auth.as_card` builds its readable set for a SIGNED-IN actor:

1. **Role membership** — card-mod-account `set/abstract/account_holder.rb`
   - `:111-113 fetch_roles`: `[AnyoneSignedInID] +
     role_ids_from_role_member_cards` — AnyoneSignedIn joins FIRST.
   - `:107-109 role_ids_from_role_member_cards` → `Self::Role.role_ids(id)`.
   - card-mod-account `set/self/role.rb:8-14 role_ids`: every role card
     whose member list includes the user. `:33-40 generate_rolehash`: the
     member lists are the cards with `left: {type_id: Card::RoleID},
     right_id: Card::MembersID` — i.e. `<RoleCard>+*members` — and each
     list's `item_ids` are the members.
   - `Card::RoleID` is the card with codename `role` (the Role cardtype);
     `Card::MembersID` the codename `members` setting. In the corpus deck:
     codename `role` = card 7, codename `members` = card 98, and the deck
     carries 22 real `<Role>+*members` lists (plus `quiz+*members`, whose
     left card is the role CARDTYPE card itself, type 5 ≠ 7 — the type
     filter excludes it, matching Ruby's search).
2. **Parties** — `account_holder.rb:27-29 parties`:
   `all_enabled_roles << id`. For a signed-in actor that is
   `[AnyoneSignedIn, ...role member roles, selfId]`. Anonymous joins no
   roles (`:39-41 all_enabled_roles` is `[]` when `id == AnonymousID`), so
   its parties are `[AnonymousID]`.
3. **The readable set** — `account_holder.rb:115-123 fetch_read_rules`:
   `[]` for DeckoBot (always_ok covers it), otherwise the union of
   `Card::Rule.read_rule_cache[party]` over `[AnyoneID] + parties`.
4. **The always_ok? short-circuit** — card-1.110.0
   `lib/card/auth/permissions.rb:8-13`: `when DeckoBotID then true`
   ("cannot disable"), else `always_ok_cached?` `:52-60` — a per-actor
   cache of `admin?`, which is `account_holder.rb:63-65`
   `all_enabled_roles.include? AdministratorID`. The Administrator codename
   is `administrator` (card-mod-account `data/real.yml:30-32`); it sits on
   a Role-type card. This verdict override runs BEFORE the hash lookup
   (`permissions.rb:140`), so an Administrator reads everything even where
   the union grants nothing.
5. **The `*enabled roles` override is rack-session state, not deck data** —
   `account_holder.rb:91-104`: when the codename `enabled_roles` exists
   (it does in the corpus: card 34832), `enabled_role_ids` consults
   `<user>+*enabled roles`. But that card is Session-typed and its
   `virtual?` is `session_content.present?` (card-mod-session
   `set/type/session.rb`, `def virtual?`); a REAL row makes `virtual?`
   false (mod/core/set/all/states.rb:40-57), which falls through to
   `fetch_roles` anyway. Only live rack-session content (the HelpDesk
   role-preview feature) substitutes the role list. Storage-truth parties
   are therefore exactly (1)-(3) for every signed-in actor; the session
   override is a server-layer remainder (see Divergences).

## What changed

- `src/card/permissions/read-rules.ts`
  - `ReadViewer { signedIn, actorId? }` + `ANONYMOUS_VIEWER` — the port of
    `Auth.as_card` as the read check consumes it.
  - `readPermissionStatements(viewer?)`: the historical three statements
    unchanged for no/anonymous viewers (statement 1's codename IN-list grew
    by `administrator` + `deckobot` — same one statement); signed-in
    viewers append ONE `rolePartyStatement(actorId)` (see below). Still one
    `driver.batch`, never per-render.
  - `readPermissionStateFromViewerResults(results, viewer)`: the party
    builder (Ruby order: `[Anyone, AnyoneSignedIn, ...roles, selfId]`) +
    union + `alwaysOk`. The legacy
    `readPermissionStateFromResults(results, actorId, signedIn)` delegates
    to it — the Anonymous entry point is signature-identical.
  - `ReadPermissionState.alwaysOk` — the port of `always_ok?`;
    `canReadByStoredRule` / `canReadByRuleLookup` short-circuit on it
    before any other logic (the two functions render.ts already calls, so
    the engine needs no verdict-logic change).
- `src/card/permissions/index.ts` — exports the above.
- `src/card/actions/render-viewer-for-session.ts` (NEW) — the render-path
  twin of `engine-for-session.ts`: `viewerFromToken(driver, token)` reuses
  that module's `actorFromToken` (unknown/expired/revoked/empty token →
  `ANONYMOUS_VIEWER`, the `auth/current.rb:58-63` degradation) and returns
  `{ signedIn: true, actorId }` for a live session.

## The exact render.ts hook (coordinator)

render.ts is read-only for this stream; the capability is complete in the
permissions/actions modules. Three lines wire it (current line numbers,
which include the structure-content stream's landed edits):

1. Add a public field near the other render caches (default keeps the
   corpus viewer byte-identical; set it BEFORE the first render, or call
   `resetCaches()` after changing it — the permission state memoizes):

   ```ts
   /** The viewer whose permission verdicts this engine computes (the
    *  Anonymous corpus actor by default). */
   viewer: ReadViewer = ANONYMOUS_VIEWER;
   ```

2. render.ts:152

   ```ts
   const permissionStatements = permissionCold
     ? readPermissionStatements(this.viewer) : [];
   ```

   (Everything downstream already adapts: the structure stream's
   `parseStructureContents` slices at `permissionStatements.length + ...`,
   and `parseRuleTypeIds` at `permissionStatements.length`.)

3. render.ts:393-396 (`ensureReadPermission`)

   ```ts
   this.readPermission = readPermissionStateFromViewerResults(
     results,
     this.viewer,
   );
   ```

   (`ensureVerdicts`/`isDenied` need NO change — `alwaysOk` is honored
   inside `canReadByStoredRule`/`canReadByRuleLookup`.)

Caller shape once hooked (glue already landed):

```ts
import { viewerFromToken } from ".../src/card/actions/render-viewer-for-session.js";
engine.viewer = await viewerFromToken(driver, bearerToken);
```

## Query shape (decko-commons/decko#1282)

- Anonymous (default): THREE statements, byte-stable — pinned in
  tests (`readPermissionStatements().length === 3`).
- Signed-in: FOUR statements, ONE batch — the role statement rides the
  same closure batch as the rest of the cold render; warm renders still
  issue zero permission queries. `roundTrips` is unchanged at every depth.
- The role statement is parameterized (`refs.referee_id = ?`), costs one
  indexed lookup per engine lifetime (memoized with the state).

The role statement reads member ids from `card_references`
(`ref_type "L"`, `referee_key IS NULL`) because that is where the list
layer itself puts them: IdList maintains one reference row per item at
save time (card-mod-list `set/abstract/id_list.rb:33-47
create_references_out`). Two corpus rows carry `referee_id IS NULL`
(unresolved members); the statement filters them — a null can fabricate no
role (pinned).

## Corpus proof (bench-corpus-v2 — what is proven, what is not)

PROVEN (tests/card/permissions/read-permission-actors-corpus.test.ts,
against benchmarks/corpus-v2/bench-corpus-v2.sqlite3 read-only):

- The deck carries real role data: codename `role` (card 7, the Role
  cardtype), 25 role-type cards, 22 in-scope `<Role>+*members` lists,
  113 distinct members, codename `administrator` (card 10, role-typed,
  5 members via list 34834), codename `anyone_signed_in` (card 9).
- 1,010 (party, read-rule) grant rows in the ReadRuleCache shape.
- The TS statement batch returns the IDENTICAL rule-id set as raw SQL
  computed independently from the corpus for:
  - Anonymous (79 rules),
  - a real roleful account holder (member 583: 9 roles, 358 rules —
    a strict superset of Anonymous's 79, 279 role-only grants),
  - an Administrator member (member 393: 19 roles; union matches AND
    `alwaysOk` is true),
  - EVERY one of the 113 role members (the full sweep).
- Item-count parity: every member list's reference count equals its
  content item count, so the surviving id references are the original
  membership.

NOT corpus-proven (honest remainder):

- Signed-in RENDERED BYTES. The capture is anonymous-viewer only; no
  fixture holds signed-in HTML. The verdict functions exercised here are
  the exact ones render.ts calls, but the end-to-end byte replay for a
  signed-in viewer awaits the render.ts hook above.
- Ruby's CONTENT-side `item_ids` (id_list.rb:12-17): the corpus
  anonymizer rewrote member-list CONTENT (the stored item names no longer
  resolve to cards), so only the reference-side ids are trustworthy in
  this corpus. Ruby maintains both sides from the same item_ids at save
  time, and the counts agree; a deck with intact `~id` content would
  prove the content path too.
- The `*enabled roles` session override has no storage footprint to
  replay (it lives in the rack session).

## Documented divergences (deliberate)

- **`*enabled roles` session override**: not ported. It substitutes the
  role list from rack-session content (HelpDesk role preview); the
  port's engine has no `Env.session`, and the DB branch of Ruby's own
  logic ignores real rows. Storage-truth parties are identical without
  it (see the Ruby section, item 5).
- **Id-less signed-out viewer**: `ANONYMOUS_VIEWER` carries no actorId and
  parses to parties `[Anyone]`. Ruby never produces this — Anonymous is
  always a real card (current.rb:7-9) and the engine supplies
  `anonymousIdFromResults`. If it ever leaked, it would fail CLOSED
  (missing Anonymous-only grants deny), never open.
- **Role order**: `ORDER BY lists.left_id` is a port-side normalization;
  Ruby's rolehash iteration order is not contractual (the union is
  hashed away at account_holder.rb:51-53).
- All read-permission stream divergences (rule-less seeds, partial-deck
  fallback, loud denial) carry over unchanged — see
  docs/permissions-port-notes.md.

## Tests

- tests/card/permissions/read-permission-actors.test.ts — synthetic deck:
  party order, per-role unions, no-role accounts, NULL-referee filtering,
  Administrator/DeckoBot `alwaysOk`, live-walk fallback with signed-in
  states, Anonymous equivalence (legacy entry point included), batch shape
  (3 statements anonymous / 4 signed-in / 1 round trip), and the
  `viewerFromToken` session wiring (live / unknown / expired / revoked /
  empty tokens).
- tests/card/permissions/read-permission-actors-corpus.test.ts — the
  corpus union-math proof above (skips when the corpus file is absent).
- tests/card/permissions/read-permission.test.ts — the Anonymous contract,
  unchanged except the cold-render additionalResults pin (4 → 5: the
  concurrent structured-content stream folds its rule-universe statement
  into the same batch after the permission statements).
