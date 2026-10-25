# Enumeration audit: the completeness roster against the original site's own surface

Date: 2026-10-25
Branch: `port/enumeration-audit-20261025`
Base commit: `c9ab5b3356e7ee1db1f8444967dd6cc09efc6157` (`deploy/full-candidate-20261029`, the newest pushed roll tip at the time of the walk)
Roster under audit: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`, read at its on-disk state (the file's own `at` field reads `2026-10-25T06:30:56.449Z`), 973 rows in 16 families.
Machine artifact: `docs/runs/enumeration-audit-2026-10-25.gaps.json`

## What this audit did, and what it did not do

It attacked the roster from the original site's own surface and produced the gap list. It converted nothing, it changed no roster row, it did not run a single behavioural check against a live site, and nothing here deploys. The deliverable is the list of what the roster does not cover, with the source that proves each item exists on the original side.

## Method

Three independent sources of what the original site is, all read inside this repo at the base commit:

1. **The oracle captures**, `fixtures/captured/`: 291 capture files, 255 flat and 36 across seven subdirectories. 91 of them carry recorded HTML. These are the recorded pages and behaviours of the original site, each with the addresses it answers.
2. **The recorded check suite**: `tools/edge-signed-in-exercise/capabilities.json` (95 capabilities, each naming the original spec it comes from: 44 cite a cypress spec, 24 cite a cucumber feature, 58 cite a journey, and one cites the enumeration and one the harness), the 60 distinct journey ids in `reference-harness/browser/journeys/` (67 journey entries across the five journey files), and the 89 modules under `tools/edge-signed-in-exercise/` (22 `checks-*.mjs` and the 67 files under `lib/`, the two `.d.mts` declaration files included).
3. **The port's own route registry and page templates**: the read grammar at `worker.ts:206-215`, the write grammar at `src/server/write-routes.ts:948-1027`, `src/server/file-routes.ts`, `src/server/first-run-routes.ts`, and the compiled view table at `src/card/render/views.ts` (107 entries).

The walk, in three passes:

- **Every captured address** was normalised into a route shape and split into the feature names it carries (the setting names, the view names). 2,315 distinct captured addresses resolved to 278 route shapes. The recorded HTML was parsed for the interactive elements it carries: 674 distinct `href` values, 13 button labels or classes, 27 form actions, 52 input names or types, 56 tab and nav class names, 440 distinct anchor texts.
- **Every check-suite behaviour** was recorded with the spec source it names: 95 capabilities and 60 journeys.
- **Every port route and view template** was recorded against the roster.

Every element was then matched against the roster by token-sequence matching over each row's `id`, `label`, `sourceParent`, `blocker` and `verdict`. Every unmatched candidate was then checked by hand and by raw `grep` against the roster file itself; the report lists only elements that survive that check. The absence of a row is therefore stated as a grep result, not as a matcher's silence.

## Part A: the gaps

27 gaps in five families. Each is named with the source that proves it exists on the original side.

### A1. Ten original page views that no roster row names

| The original view | The source that shows it | The evidence in the capture |
| --- | --- | --- |
| `:modal_rule` | `fixtures/captured/rules-views.json` | the anchor `/*all+*<setting>/modal_rule?slot[items][view]=closed` on every setting board the capture renders |
| `:overlay_rule` | `fixtures/captured/rules-views.json`, `fixtures/captured/board-views.json` | 65 captured anchors of the form `/*all+*<setting>/overlay_rule` and `/<card>+*self+*<setting>/overlay_rule` |
| `:overlay_guide` | `fixtures/captured/rules-views.json` | the anchor `/*all+*read/overlay_guide` |
| `:modal_nest_rules` | `fixtures/captured/rules-views.json` | the anchor `/*all/modal_nest_rules` |
| `:rule_edit` | `fixtures/captured/board-views.json`, `fixtures/captured/edit-views.json`, `fixtures/captured/help-mod-loader.json` | the anchors `/*all+*guide/rule_edit` and `/<card>+*self+*help/rule_edit` |
| `:email_page` | `fixtures/captured/email-templates-raw-oracle.json` | `/follower_notification_email+*html_message/email_page?layout=none`, and the same address for the signup alert, password reset and verification mail cards |
| `:action_expanded` | `fixtures/captured/history-views.json` | `/History_Probe_Renamed/action_expanded?action_id=N&look_in_trash=true` |
| `:action_summary` | `fixtures/captured/history-views.json` | `/History_Probe_Renamed/action_summary?action_id=N&look_in_trash=true` |
| `:edit_inline` | `fixtures/captured/edit-views.json` | `/Home/edit_inline` and `/Oracle_Basics/edit_inline` |
| `:new_in_modal` | `fixtures/captured/list-mod-loader.json`, `fixtures/captured/search-list-views.json`, `fixtures/captured/tinymce-editor-views.json` | `/Oracle_Probe_Wanted/new_in_modal`, `/Second_Item/new_in_modal`, `/image01/new_in_modal?card[type]=image` |

Check: `grep -o -i -e modal_rule -e overlay_rule -e overlay_guide -e modal_nest_rules -e rule_edit -e email_page -e action_expanded -e action_summary -e edit_inline -e new_in_modal docs/registry/completeness-roster.json` returns 0 occurrences for every one of the ten.

### A2. Two original setting addresses that no roster row names

| The original setting address | The source that shows it | Why no row covers it |
| --- | --- | --- |
| `*css` | `fixtures/captured/sass-style-pages/oracle-main-slot-regions.json` | the capture records the board's advanced tab linking to `/*css/board`. The roster's only css rows are a URL format suffix (`reg-routes-D5`), a format dispatch rule (`reg-dsl-C7`) and the `validate_css` event (`reg-evt-mod-style-validate-css`). There is no `*-card *css` row and no `setting *css` row, while 35 of the other 36 setting addresses the captures show do have one. |
| `*changed_card` | `fixtures/captured/email-templates-raw-oracle.json` | the capture records `/*changed_card` and `/*changed_card?view=history`. The token `changed_card` appears nowhere in the roster. |

### A3. Five original navigation entries that no roster row names

The captured pages of the original site carry their own navbar in the recorded page text. Three captures record it verbatim: `fixtures/captured/followers-address-junction.json`, `fixtures/captured/email-templates-raw-oracle.json` and `fixtures/captured/search-list-views.json`. The recorded text reads:

> Getting started Add type Configure skin Basic configuration Change this menu Learn more Recent Changes Sign up Sign in

Four of those nine are named by roster rows: "Getting started" by `reg-star-getting-started` and `reg-star-getting-started-links`, "Recent Changes" by `mx-170-recent-feed` and `mx-160-recent-changes-feed`, "Sign in" by `cap-S1` and `mx-B-001`, "Sign up" by `cap-S4` and `mx-B-048`. Five are not named by any row:

| The navbar entry | Check against the roster |
| --- | --- |
| "Add type" | `grep -o -i "Add type"` returns 0 occurrences |
| "Configure skin" | `grep -o -i "Configure skin"` returns 0 occurrences |
| "Basic configuration" | `grep -o -i "Basic configuration"` returns 0 occurrences |
| "Change this menu" | `grep -o -i "Change this menu"` returns 0 occurrences |
| "Learn more" | `grep -o -i "Learn more"` returns 0 occurrences |

The roster's `reg-star-getting-started-links` and `reg-star-main-menu` rows cover the menu cards themselves. No row names the entries those cards carry, or where they point.

### A4. Four pieces of the follow surface that no roster row names

| The original element | The source that shows it | The evidence |
| --- | --- | --- |
| the `:follow_status` view, which is the follow button's success view | `fixtures/captured/unfollow-board.json` | the capture records `card-mod-follow set/all/follow/follow_link.rb` with `def link_opts success_view=:follow_status` |
| the `follow_section` slot, which is the slot the follow button writes into | `fixtures/captured/unfollow-board.json` | the capture records `opts = link_opts(:follow_section)`. The port's own view table carries the matching `follow_section` view (`src/card/render/views.ts`). |
| the follower count slot `RIGHT-Xfollower.content-view`, shown on the board as the "1 follower" link | `fixtures/captured/board-views.json`, `fixtures/captured/unfollow-board.json` | the capture records the follow button's `data-update-foreign-slot` pointing at `.d0-card-body > .card-slot.RIGHT-Xfollower.content-view`, and the board capture records the anchor text "1 follower" |
| the followers ADDRESS: `<card>+*followers` answers 200, `<card>+followers` answers 404 | `fixtures/captured/followers-address-junction.json` | the capture asks, in its own words, "what does the Ruby oracle answer at `<card>+followers` and `<card>+*followers`?" and records 200 for the asterisked form and 404 for the un-asterisked form |

The roster does carry the follow behaviours: `cap-W4` and `mx-155-capability-catalog-follow` are the "Followers list and 'all followed cards' view" rows, both `WORKING ON IT`, and `reg-star-followers` is the seeded `*-card *followers`. What no row carries is the address contract itself, the success view, the slot name, or the follower count slot.

### A5. Six check-suite behaviours that no roster row names

| The behaviour | The source that names it | Why no row covers it |
| --- | --- | --- |
| the anonymous read denial | `reference-harness/browser/journeys/synthetic-v1.json`, journey `denied-anonymous-read` | the check suite's own capabilities name `denied-member-read`, `denied-member-edit`, `denied-member-create` and `denied-member-delete`, and none of the four anonymous-denial journeys. The roster's denial rows (`mx-B-100` P1, `mx-B-101` P3, `mx-140` P2) are all member denials; the one anonymous denial row, `mx-B-099` (S5), is the edit-modal denial. |
| the anonymous create denial | `reference-harness/browser/journeys/synthetic-v1.json`, journey `denied-anonymous-create` | the journey visits `/new/Note` as anonymous. No capability names it and no matrix row is about an anonymous create. |
| the permission-filtered anonymous search | `reference-harness/browser/journeys/synthetic-v1.json`, journey `search-filtered-anonymous` | the journey searches "Memo" from the home page as anonymous and observes the result set. No capability names it; the roster's search rows cover keyword and CQL search, not permission filtering of the result set. |
| persistence across a HOST RESTART, six account and date journeys | `reference-harness/browser/journeys/acceptance-account-date.json` | the journeys `account-email-login-persistence`, `account-password-login-persistence`, `account-reset-password-complete`, `account-signup-activation-complete`, `date-edit-persistence` and `rich-editor-save-persistence` each carry a `{'restart': True}` step and then re-assert the saved value. `grep -o -i "host restart"` returns 0 occurrences in the roster; the closest row, `mx-183`, is "persistence across reload". |
| persistence across a HOST RESTART, three follow-operation journeys | `reference-harness/browser/journeys/acceptance-follow-operations.json` | the journeys `follow-admin-operation-persistence`, `unfollow-member-operation-persistence` and `unfollow-mail-operation-persistence` each carry a `{'restart': True}` step. |
| the administrator's approval step on a pending signup | `reference-harness/browser/journeys/acceptance-account-date.json`, journey `account-signup-activation-complete` | the journey signs in as administrator, opens `/Journey_New_User` and clicks the "Send verification email" link before the activation mail arrives. `cap-A4` and `mx-159` cover signing up and signing in; no row covers the approval-and-send step. |

### A6. How the mechanical diff partitioned

The mechanical diff over the captured addresses produced 95 route shapes that carry at least one feature name no roster row names, carrying 202 uncovered feature names between them. The hand check confirmed 12 of those feature names (the 10 views of A1 and the 2 setting addresses of A2), which appear across 56 of the 95 candidate shapes. The other 146 uncovered names were tokeniser artefacts: concrete card names such as `History_Probe_Renamed`, Rails route patterns such as `/:mark/:view(.:format)`, and file paths such as `/mod/bootstrap/fontawesome-6.7.2/css/all.min.css`, all of which the roster does cover, under `reg-routes-A1` to `reg-routes-A23` and `reg-routes-E1` to `reg-routes-E13` for the route patterns.

The remaining 15 gaps were found by the hand check and are not reachable by the route-shape diff at all: the 5 navbar entries of A3 (they are page text, not addresses), the 4 follow-surface elements of A4 (three are view and slot names carried in a capture's Ruby source facts, the fourth is an address contract), and the 6 check-suite behaviours of A5 (they are journeys, not addresses). The full candidate list, with the covering rows for every element, is in the machine artifact.

## Part B: the suspect rows

A roster row whose own text names no source is suspect: it may be invented, or it may be unduplicatable because nothing records where it came from. Ten rows are suspect, in two shapes.

**Three port-only route rows.** `reg-routes-E8` (`GET /_mail-log`), `reg-routes-E11` (vendor font assets) and `reg-routes-E12` (Server-Timing, isolate probes, render budget) each carry the blocker "verified: port-only surface: the register names the host(s) and the file:line in the port that serves it, so there is no Ruby behaviour it could fail to match". The row names no file and no line. The promise in the blocker is not kept by the row.

**Seven railtie config-key rows.** `reg-redteam-cfg-token_expiry`, `reg-redteam-cfg-allow_inline_styles`, `reg-redteam-cfg-raise_all_rendering_errors`, `reg-redteam-cfg-email_defaults`, `reg-redteam-cfg-deck_origin`, `reg-redteam-cfg-allow_irreversible_admin_tasks` and `reg-redteam-cfg-max_depth-max_char_count-compress_assets-max_temporary_cache_keys` each carry the blocker "verified: the railtie config key is read port-side at the cited file". No cited file is in the row.

No row in the roster was found to be wholly invented: every row names a subject that exists on the original side or on the port side. The ten above are thin rather than false.

## Part C: the counts

### The original surface, as walked

| The unit | The count | Where it comes from |
| --- | --- | --- |
| capture files read | 291 | `fixtures/captured/`, 255 flat and 36 in seven subdirectories |
| distinct captured addresses | 2,315 | the recorded paths, the recorded HTML and the anchor `href` values across those captures |
| route shapes those addresses resolve to | 278 | the normaliser in the audit |
| distinct captured setting addresses | 60 | the `*name` segments of the captured addresses |
| distinct captured view segments | 125 | the view segments of the captured addresses |
| captures carrying recorded HTML | 91 | of the 291 |
| distinct captured `href` values | 674 | the recorded HTML |
| distinct captured button labels or classes | 13 | the recorded HTML |
| distinct captured form actions | 27 | the recorded HTML |
| distinct captured input names or types | 52 | the recorded HTML |
| distinct captured tab and nav class names | 56 | the recorded HTML |
| distinct captured anchor texts | 440 | the recorded HTML |
| check-suite behaviours | 155 | 95 capabilities in `capabilities.json` plus 60 journeys in `reference-harness/browser/journeys/` |
| check modules walked | 89 | `tools/edge-signed-in-exercise/`, 22 `checks-*.mjs` and the 67 files under `lib/` |
| port routes walked | 26 | `worker.ts:206-215`, `src/server/write-routes.ts:948-1027`, `src/server/file-routes.ts`, `src/server/first-run-routes.ts` |
| port view templates walked | 107 | the compiled table at `src/card/render/views.ts` |

### The roster

| | The count |
| --- | --- |
| total roster rows | 973 |
| rows by family | matrix-journey 190, register-events 162, smell-test 114, register-starcards 106, capability-inventory 95, register-routes 72, register-treewalk 62, register-dsl 57, register-redteam 35, register-mods 33, register-settings 23, promised-deliverable 13, save-path 8, mods 1, write-path/engine 1, deploy/files-area 1 |
| roster families | 16 |

### The result of the diff

| | The count |
| --- | --- |
| total original-surface elements walked | 2,315 captured addresses, 155 check-suite behaviours, 26 port routes, 107 port view templates (2,603 units before the route-shape fold; 278 shapes, 60 setting addresses and 125 view segments after it) |
| total roster rows | 973 |
| gaps found | 27 |
| suspects found | 10 |

### The gaps by family, and the roster by family

| The gap family | Gaps | The roster family that should have held them | That family's rows |
| --- | --- | --- | --- |
| capture-view | 10 | register-dsl, register-settings, register-starcards, matrix-journey | 57, 23, 106, 190 |
| capture-nav | 5 | register-starcards, register-mods | 106, 33 |
| capture-setting | 2 | register-settings, register-starcards | 23, 106 |
| follow-surface | 4 | register-mods, register-starcards, capability-inventory, matrix-journey | 33, 106, 95, 190 |
| check-suite | 6 | capability-inventory, matrix-journey | 95, 190 |

The check-suite side has no gap at capability granularity: all 95 capabilities have their `cap-<id>` roster row, and the 44 cypress specs and 24 cucumber features the capabilities cite are all reached through a capability. The six gaps there are at journey granularity, where the journey is not a capability source.

## The ten worst gaps, by name

1. The `:overlay_rule` view. The original site answers it on every setting board and on every card's own board; 65 captured anchors. No roster row names it.
2. The `:modal_rule` view, the modal half of the same rule surface, on every setting board. No roster row names it.
3. The followers ADDRESS contract: `<card>+*followers` answers 200 and `<card>+followers` answers 404. The roster carries the behaviour (`cap-W4`, `mx-155`, both `WORKING ON IT`) and the seeded card (`reg-star-followers`), but no row records the address.
4. The `:follow_status` view, the success view the follow button writes to, and the `follow_section` slot it writes into.
5. The follower count slot `RIGHT-Xfollower.content-view`, shown on the board as the "1 follower" link.
6. Persistence across a HOST RESTART, for the six account and date journeys and the three follow-operation journeys. No roster row names a host restart; `mx-183` covers a reload.
7. The anonymous read and create denials. The check suite names the four member denials and none of the four anonymous ones; the roster's denial rows are the three member denials (`mx-B-100` P1, `mx-B-101` P3, `mx-140` P2), and its one anonymous denial row, `mx-B-099` (S5), is the edit-modal denial, not the read or the create.
8. The `:rule_edit` view, the rule editor page the original serves at `/*all+*guide/rule_edit` and `/<card>+*self+*help/rule_edit`.
9. The five unnamed navbar entries: "Add type", "Configure skin", "Basic configuration", "Change this menu", "Learn more". The menu cards are covered; their entries are not.
10. The `:email_page` view, the page the original renders for each mail card (`follower_notification_email`, `signup_alert_email`, the password reset and the verification mail), plus the `:action_expanded` and `:action_summary` history views and the `:new_in_modal` create form.

## What this audit could not settle, stated plainly

- **The original cypress and cucumber spec bodies are not on this machine.** `capabilities.json` names them (`decko-ruby-reference/decko/spec/cypress/e2e` and `decko-ruby-reference/decko/features/*.feature`) but no copy of either tree exists under `C:/localProjects`. The check-suite leg of this audit therefore walks the capability definitions and the journeys that are in the repo, not the original spec files themselves. A behaviour that only the original specs exercise and that no capability, journey, capture or port row names would not have been found here.
- **The capture files are the original's surface as recorded, not as served today.** 95 of the 291 captures carry no `row` field, and they were matched by their subject rather than by a cited row. The mechanical link is exact for 233 of the 291 (96 by a roster row id, 96 by a normalized row name, 41 by the capture's own file stem); the other 58 were checked by hand.
- **Three captures did not parse as objects** and were skipped by the walk: `fixtures/captured/card-name-key-algebra-inputs.json`, `fixtures/captured/translate-variables-to-scss-ruby-oracle.json` and `fixtures/captured/coderay/alpha-style-kind-paths.json` (each is a JSON array at the top level). The index records them in `parse_errors`.
- **The port leg is a walk, not a verdict.** 26 port routes and 107 port view templates were checked against the roster. Eight port routes and 70 port view templates came back unmatched by the tokeniser, and every one of those was checked by hand: the route misses are tokeniser artefacts (the roster covers `/:mark/:view(.:format)` at `reg-routes-A21` and `/:mark/view/:view(.:format)` at `reg-routes-A8`), and the view misses are the port's own view table, whose names are covered by other families only where a behaviour row names the same feature. No port defect is claimed by this report.
- **Nothing was executed against a running site.** No browser, no live host, no edge host. Every statement here is a read of a file in this repo at the base commit, or a grep of the roster file.

## How the next batch consumes this

The machine artifact `docs/runs/enumeration-audit-2026-10-25.gaps.json` carries, for each of the 27 gaps, the family, the element, the source path, the evidence string taken from that source, and the reason no roster row covers it. It also carries the ten suspects with the same shape, and the full count table. A batch can take a family from that file and open one roster row per gap without re-walking the captures.

## How this was produced, and how it can be re-run

The audit's own scripts were scratch and are not committed (`tmp/` is ignored in this repo). They were, in order: a capture index that recorded every capture's keys, `row` field and paths; an HTML scan that parsed every recorded page for its interactive elements; a surface builder that normalised the captured addresses into route shapes; a gap pass that diffed those shapes against the roster; a check-suite pass that diffed the capabilities, the journeys, the check modules, the port routes and the port view templates against the roster; and a term checker that prints the roster rows naming any given term, which is what settled every "no roster row names this" statement in Part A.
