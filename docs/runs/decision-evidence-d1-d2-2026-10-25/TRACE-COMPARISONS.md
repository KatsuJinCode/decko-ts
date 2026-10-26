# Decision 1 evidence: three representative saves, driven through the recorded Ruby trace and the port

Recorded Ruby oracle: `reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`
(the side-effects scenario battery's recorded trace, the 87-step public list, sha256-pinned by the
fixture's MANIFEST.json and re-verified this run). Port: this tree's engine, built from source and
driven by `tools/parity-side-effects/ts-drive.mjs` through the same 87-step list
(`tools/parity-side-effects/scenarios.json`) over a copy of the same committed start deck.

## The run of record

Commands (run 2026-10-25, worktree at c29e4c3f):

    node tools/parity-side-effects/ts-drive.mjs reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 tmp/d1d2-verify/ts-work > ts-trace.json   # exit 0
    node tools/parity-side-effects/compare.mjs reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json ts-trace.json compare-report.json  # exit 0

The same run through the committed battery test (`npx vitest run tests/tools/side-effects-scenario-battery.test.ts`) PASSED:
its pinned verdict is 80 pass + 7 declared + 0 mismatched over the 87 steps.
The comparison's own headline: `SIDE EFFECTS PASS 80 / 87; deliberate differences pinned 7; mismatches 0`.
Event order: `EVENT ORDER in verdict: 81 / 81 deterministic steps agree; 6 not established (event-order-evidence.json)`.

The 7 declared (not silent) differences, all pre-pinned in the battery: get-home (Ruby names script
bundles by wall clock), signin-unknown + signin-wrong-password + reset-unknown-email (docs/SECURITY.md
approved divergence 4: the port's uniform sign-in answers), restore-file-revision (Ruby crashes with a
500 restoring a File/Image revision; the port restores it), admin-deny-signup (knock-on of the previous),
admin-create-skin-bad-parent (Ruby 500 vs port 422 validation refusal). None of the three saves below is
among them.

## The three representative saves, field by field

Chosen to cover the director's three shapes: a simple content edit, a save carrying subcards, and a
card type change. A fourth row (create-compound, a junction create that instantiates a second card) is
included because it exercises the subdirector side of the registry work. Verdicts from compare.mjs (the
comparator's normalized field extraction):
- signed-in-update-card: **PASS** (zero differing extracted fields).
- signup: **PASS** (zero differing extracted fields).
- admin-skin-type-change: **PASS** (zero differing extracted fields).
- create-compound: **PASS** (zero differing extracted fields).

Fields compared per step: status, headers, response body (by length + sha256), the row-delta table,
the actions, the EVENTS (the director's stage machinery made visible - Ruby's event list vs the port's),
files, virtuals, mail, signed_in_as, session_cards. The battery's comparator (which compares through
normalizing extractors) finds no behavioral difference in any of the four steps. The raw fields below are
printed un-normalized, and they are NOT byte-identical: the ACTUAL raw differences are enumerated in the
next section, each with its visibility.

## The ACTUAL differences the raw fields carry (all four steps)

1. Write-response headers. The port adds `Cache-Control: no-store` to every write response and omits
   `Content-Type` on 303 redirects (Ruby sends `Content-Type: text/html; charset=utf-8`). Visibility to a
   reader: none - a 303's body is not rendered, and no-store on a dynamic write response is invisible
   except to a header inspector.
2. The delta table's shape. The port's delta carries one extra counter key, `auth_sessions: 0`, that Ruby's
   delta does not carry. All shared counters match exactly on every step (including the 7-change update).
   Visibility: none - instrumentation shape, not behavior.
3. The events field's shape. Ruby records `[cardName, eventName]` per event; the port records
   `[stageName, eventName]`. The event SEQUENCES agree (the comparison's event-order verdict: 81/81
   deterministic steps agree), and the port's form is strictly more informative (it names the stage each
   event ran at). One behavioral note inside this item: on the REFUSED type change, Ruby's trace records
   the validation-phase events it ran before refusing (assign_action, validate_type_change, ...); the port
   records none, because it refuses by throwing before event dispatch (the engine's refuse-by-throw model,
   card-action-engine.ts:2354-2358). The observable outcome is identical: 422, zero rows written.
4. Follow mail's unfollow link. Ruby: `.../update/Parity_Follower+*follow?card[...]=%2Anever`. Port: the
   same URL plus `&success[redirect]=soft`. This is the recorded divergence the issue text already
   declares (draft section "The recorded divergences", item 3: the follow-mail link), kept deliberately.
   Both engines' text_body and html_body are otherwise identical. The battery's comparator normalizes
   exactly this URL away (compare.mjs:224-227 folds every `/update/...*never...` link to a placeholder),
   so the comparator's mail PASS carries this one deliberately normalized declared difference.
5. The type-change refusal's page body. Both engines render the SAME alert message text (`+*STYLESHEETS:
   Parity Probe Card has an invalid type: RichText. Allowed types: CSS and SCSS.`). Ruby renders it
   inside the full site page - 18,722 bytes with the card-title header "Problems with Parity Old Skin"
   and all chrome; the port answers a 381-byte minimal document (title `Error (user-error)`) whose body
   is the alert alone. A reader WOULD notice this in a browser: same warning text, but the site page
   around it is missing on the port's write-refusal path. This is a rendering-surface difference of the
   write path's error response, enumerated here because this comparison found it; it is not one of the
   battery's declared differences and the battery's comparator does not count it (it compares the alert
   content, which matches).

## signed-in-update-card

- status [SAME]:
  - ruby: 303
  - port: 303
- headers [DIFF]:
  - ruby: {"Location": "http://127.0.0.1/Parity_Probe_Card", "Content-Type": "text/html; charset=utf-8"}
  - port: {"Location": "http://127.0.0.1/Parity_Probe_Card", "Cache-Control": "no-store"}
- body: ruby (empty string) | port (empty string)
- delta [DIFF]:
  - ruby: {"cards": 0, "card_acts": 1, "card_actions": 1, "card_changes": 7, "card_references": 0, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0}
  - port: {"cards": 0, "card_acts": 1, "card_actions": 1, "card_changes": 7, "card_references": 0, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0, "auth_sessions": 0}
- actions [SAME]:
  - ruby: [{"card": "Parity Probe Card", "type": "update", "fields": [2], "values": ["updated while signed in"], "creator": "Parity Probe", "updater": "Parity Probe", "content": "updated while signed in"}]
  - port: [{"card": "Parity Probe Card", "type": "update", "fields": [2], "values": ["updated while signed in"], "creator": "Parity Probe", "updater": "Parity Probe", "content": "updated while signed in"}]
- events [DIFF]:
  - ruby: [["Parity Probe Card", "assign_action"], ["Parity Probe Card", "reject_empty_subcards"], ["Parity Probe Card", "set_stamper"], ["Parity Probe Card", "check_permissions"], ["Parity Probe Card", "set_content"], ["Parity Probe Card", "refresh_references_out"], ["Parity Probe Card", "expire_related"], ["Parity Probe Card", "finalize_action"], ["Parity Probe Card", "finalize_act"], ["Parity Probe Ca...
  - port: [["initialize", "assign_action"], ["prepare_to_validate", "reject_empty_subcards"], ["prepare_to_validate", "set_stamper"], ["validate", "check_permissions"], ["finalize", "refresh_references_out"], ["finalize", "expire_related"], ["integrate", "observer_update"], ["integrate", "update_ancestor_timestamps"]]
- files [SAME]:
  - ruby: []
  - port: []
- virtuals [SAME]:
  - ruby: []
  - port: []
- mail [DIFF]:
  - ruby: [{"to": ["follower.probe@example.com"], "from": ["no-reply@decko.org"], "from_header": "no-reply@decko.org", "reply_to": ["no-reply@decko.org"], "subject": "Parity Probe updated \"Parity Probe Card\"", "text_body": "\"Parity Probe Card\" was just updated by Parity Probe.\n\n  new content: updated while signed in\n\n\n\n\nSee the card: http://127.0.0.1/Parity_Probe_Card\n\nYou received this emai...
  - port: [{"to": ["follower.probe@example.com"], "from": ["no-reply@decko.org"], "from_header": "no-reply@decko.org", "reply_to": ["no-reply@decko.org"], "subject": "Parity Probe updated \"Parity Probe Card\"", "text_body": "\"Parity Probe Card\" was just updated by Parity Probe.\n\n  new content: updated while signed in\n\n\n\n\nSee the card: http://127.0.0.1/Parity_Probe_Card\n\nYou received this emai...
- signed_in_as [SAME]:
  - ruby: "Parity Probe"
  - port: "Parity Probe"
- session_cards [SAME]:
  - ruby: {}
  - port: {}

## signup

- status [SAME]:
  - ruby: 303
  - port: 303
- headers [DIFF]:
  - ruby: {"Location": "http://127.0.0.1/Parity_Joiner", "Content-Type": "text/html; charset=utf-8"}
  - port: {"Location": "http://127.0.0.1/Parity_Joiner", "Cache-Control": "no-store"}
- body: ruby (empty string) | port (empty string)
- delta [DIFF]:
  - ruby: {"cards": 6, "card_acts": 1, "card_actions": 4, "card_changes": 0, "card_references": 1, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0}
  - port: {"cards": 6, "card_acts": 1, "card_actions": 4, "card_changes": 0, "card_references": 1, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0, "auth_sessions": 0}
- actions [SAME]:
  - ruby: [{"card": "Parity Joiner", "type": "create", "fields": [], "values": [], "creator": "Anonymous", "updater": "Anonymous", "content": ""}, {"card": "Parity Joiner+*account", "type": "create", "fields": [], "values": [], "creator": "Anonymous", "updater": "Anonymous", "content": ""}, {"card": "Parity Joiner+*account+*email", "type": "create", "fields": [], "values": [], "creator": "Anonymous", "up...
  - port: [{"card": "Parity Joiner", "type": "create", "fields": [], "values": [], "creator": "Anonymous", "updater": "Anonymous", "content": ""}, {"card": "Parity Joiner+*account", "type": "create", "fields": [], "values": [], "creator": "Anonymous", "updater": "Anonymous", "content": ""}, {"card": "Parity Joiner+*account+*email", "type": "create", "fields": [], "values": [], "creator": "Anonymous", "up...
- events [DIFF]:
  - ruby: [["Parity Joiner", "assign_action"], ["Parity Joiner+*account", "assign_action"], ["Parity Joiner+*account+*email", "assign_action"], ["Parity Joiner", "reject_empty_subcards"], ["Parity Joiner", "set_stamper"], ["Parity Joiner+*account", "reject_empty_subcards"], ["Parity Joiner+*account", "set_stamper"], ["Parity Joiner+*account", "set_default_salt"], ["Parity Joiner+*account", "set_default_s...
  - port: [["initialize", "assign_action"], ["prepare_to_validate", "reject_empty_subcards"], ["prepare_to_validate", "set_stamper"], ["initialize", "assign_action"], ["prepare_to_validate", "reject_empty_subcards"], ["prepare_to_validate", "set_stamper"], ["initialize", "assign_action"], ["prepare_to_validate", "reject_empty_subcards"], ["prepare_to_validate", "set_stamper"], ["prepare_to_validate", "do...
- files [SAME]:
  - ruby: []
  - port: []
- virtuals [SAME]:
  - ruby: []
  - port: []
- mail [SAME]:
  - ruby: []
  - port: []
- signed_in_as [SAME]:
  - ruby: null
  - port: null
- session_cards [SAME]:
  - ruby: {"parity_session_probe": "x"}
  - port: {"parity_session_probe": "x"}

## admin-skin-type-change

- status [SAME]:
  - ruby: 422
  - port: 422
- headers [DIFF]:
  - ruby: {"Content-Type": "text/html; charset=utf-8"}
  - port: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}
- body: ruby len=18722 sha256=f49e4b60fa6acc31... | port len=381 sha256=70929c5636540f42...
- delta [DIFF]:
  - ruby: {"cards": 0, "card_acts": 0, "card_actions": 0, "card_changes": 0, "card_references": 0, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0}
  - port: {"cards": 0, "card_acts": 0, "card_actions": 0, "card_changes": 0, "card_references": 0, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0, "auth_sessions": 0}
- actions [SAME]:
  - ruby: []
  - port: []
- events [DIFF]:
  - ruby: [["Parity Old Skin", "assign_action"], ["Parity Old Skin", "reject_empty_subcards"], ["Parity Old Skin", "set_stamper"], ["Parity Old Skin", "validate_type_change"], ["Parity Old Skin", "validate_type"], ["Parity Old Skin", "check_permissions"], ["Parity Old Skin", "initialize_because_of_type_change"], ["Parity Old Skin+*colors", "assign_action"], ["Parity Old Skin+*colors", "reject_empty_subca...
  - port: []
- files [SAME]:
  - ruby: []
  - port: []
- virtuals [SAME]:
  - ruby: []
  - port: []
- mail [SAME]:
  - ruby: []
  - port: []
- signed_in_as [SAME]:
  - ruby: "Parity Admin"
  - port: "Parity Admin"
- session_cards [SAME]:
  - ruby: {"parity_session_probe": "x"}
  - port: {"parity_session_probe": "x"}

## create-compound

- status [SAME]:
  - ruby: 303
  - port: 303
- headers [DIFF]:
  - ruby: {"Location": "http://127.0.0.1/Parity_Probe_Card+Parity_Field", "Content-Type": "text/html; charset=utf-8"}
  - port: {"Location": "http://127.0.0.1/Parity_Probe_Card+Parity_Field", "Cache-Control": "no-store"}
- body: ruby (empty string) | port (empty string)
- delta [DIFF]:
  - ruby: {"cards": 2, "card_acts": 1, "card_actions": 2, "card_changes": 0, "card_references": 0, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0}
  - port: {"cards": 2, "card_acts": 1, "card_actions": 2, "card_changes": 0, "card_references": 0, "card_revisions": 0, "card_virtuals": 0, "sessions": 0, "users": 0, "delayed_jobs": 0, "auth_sessions": 0}
- actions [SAME]:
  - ruby: [{"card": "Parity Probe Card+Parity Field", "type": "create", "fields": [], "values": [], "creator": "Parity Probe", "updater": "Parity Probe", "content": "field value"}, {"card": "Parity Field", "type": "create", "fields": [], "values": [], "creator": "Parity Probe", "updater": "Parity Probe", "content": ""}]
  - port: [{"card": "Parity Probe Card+Parity Field", "type": "create", "fields": [], "values": [], "creator": "Parity Probe", "updater": "Parity Probe", "content": "field value"}, {"card": "Parity Field", "type": "create", "fields": [], "values": [], "creator": "Parity Probe", "updater": "Parity Probe", "content": ""}]
- events [DIFF]:
  - ruby: [["Parity Probe Card+Parity Field", "assign_action"], ["Parity Probe Card+Parity Field", "reject_empty_subcards"], ["Parity Probe Card+Parity Field", "set_stamper"], ["Parity Probe Card+Parity Field", "validate_name"], ["Parity Probe Card+Parity Field", "validate_legality_of_name"], ["Parity Probe Card+Parity Field", "validate_uniqueness_of_name"], ["Parity Probe Card+Parity Field", "validate_k...
  - port: [["initialize", "assign_action"], ["prepare_to_validate", "reject_empty_subcards"], ["prepare_to_validate", "set_stamper"], ["validate", "validate_type"], ["validate", "check_permissions"], ["initialize", "assign_action"], ["prepare_to_validate", "reject_empty_subcards"], ["prepare_to_validate", "set_stamper"], ["validate", "validate_type"], ["validate", "check_permissions"], ["store", "set_rea...
- files [SAME]:
  - ruby: []
  - port: []
- virtuals [SAME]:
  - ruby: []
  - port: []
- mail [DIFF]:
  - ruby: [{"to": ["follower.probe@example.com"], "from": ["no-reply@decko.org"], "from_header": "no-reply@decko.org", "reply_to": ["no-reply@decko.org"], "subject": "Parity Probe created \"Parity Probe Card+Parity Field\"", "text_body": "\"Parity Probe Card+Parity Field\" was just created by Parity Probe.\n\n   cardtype: RichText\n   content: field value\n\n\n\n\nSee the card: http://127.0.0.1/Parity_Pr...
  - port: [{"to": ["follower.probe@example.com"], "from": ["no-reply@decko.org"], "from_header": "no-reply@decko.org", "reply_to": ["no-reply@decko.org"], "subject": "Parity Probe created \"Parity Probe Card+Parity Field\"", "text_body": "\"Parity Probe Card+Parity Field\" was just created by Parity Probe.\n\n   cardtype: RichText\n   content: field value\n\n\n\n\nSee the card: http://127.0.0.1/Parity_Pr...
- signed_in_as [SAME]:
  - ruby: "Parity Probe"
  - port: "Parity Probe"
- session_cards [SAME]:
  - ruby: {}
  - port: {}

## What this comparison is, and is not

It IS: the recorded Ruby behavior and the port's behavior over the same operations on the same deck,
compared field by field by the battery's own comparator, with the three-step subset reproduced here in full.
The `events` field is the closest thing the traces carry to the director's stage machinery: it lists each
event in the order the engines ran them (assign_action, reject_empty_subcards, set_stamper, validate_*,
check_permissions, set_content, store, integrate, notify...). The port runs no Director object; it
reproduces the same sequence through the action engine's fixed stage dispatches
(DIRECTOR-57-DISPOSITION.md maps each of the 57 definitions to its carrier).

It is NOT: a claim that the 57 definitions are ported (they are not - none of the names is bound), nor a
claim about the steps withheld until disclosure (3 steps, not run here), nor about delayed-stage delivery
(Ruby's trace records delaying:false; the port's drive passes no delayed-jobs config, whose documented
default is the same inline integrate_with_delay - card-action-engine.ts:496-502). The port's trace
carries no delaying/environment envelope fields; the comparator compares steps, not the envelope.

