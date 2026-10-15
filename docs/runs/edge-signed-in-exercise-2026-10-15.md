# Edge signed-in exercise — 2026-10-15

- Command: `node tools/edge-signed-in-exercise.mjs`
- Artifact: `deploy/dist/bunny-edge-engine.bundle.js`, rebuilt from source, run against a LOCAL deck copy on the engine schema
- Deck source (local, never Bunny): `deck.sqlite3`, 21676 cards copied
- Accounts: two throwaway local accounts (one holding the `administrator` role, one signed in with no role)
- Browser: headless Chromium, throwaway profile, local origin + the deck's configured asset host + stock layout CDNs only
- Result: **59 / 63 passed**, 4 failed

| check | result | evidence |
|---|---|---|
| 1. sign in, and stay signed in / admin signs in through the sign-in form and stays signed in | PASS | {"hasSessionCookie":true,"landedOn":"https://127.0.0.1:54580/","signedIn":true,"hasSignOut":true} |
| 1. sign in, and stay signed in / member signs in through the sign-in form and stays signed in | PASS | {"hasSessionCookie":true,"signedIn":true} |
| 1. sign in, and stay signed in / home shows the account name and Sign out | PASS | {"title":"Home - Culturesmith","hasSignOut":true,"hasAccountName":true,"signedIn":true} |
| 1. sign in, and stay signed in / stays signed in across navigation | PASS | {"title":"Home - Culturesmith","signedIn":true} |
| 1. sign in, and stay signed in / stays signed in after browser Back | PASS | {"url":"https://127.0.0.1:54580/"} |
| 1. sign in, and stay signed in / stays signed in after reload | PASS | {"url":"https://127.0.0.1:54580/"} |
| 1. sign in, and stay signed in / stays signed in after leaving the site and returning | PASS | {"url":"https://127.0.0.1:54580/"} |
| 2. styling and console on signed-in pages / deck stylesheet link resolves | PASS | {"links":[{"href":"https://fonts.googleapis.com/css2?family=Material+Icons","sheet":true},{"href":"https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1790384218.css","sheet":true}]} |
| 2. styling and console on signed-in pages / no blocked or 4xx/5xx subresource on the signed-in page | PASS | {"blocked":[]} |
| 2. styling and console on signed-in pages / no console errors on the signed-in page (Font Awesome kit 403 excluded: 14 responses, domain-locked kit) | PASS | {"errors":[],"excludedKit403":14} |
| 3. edit a Date card / date card page loads | PASS | {"status":200,"title":"2011 12 14 - Culturesmith"} |
| 3. edit a Date card / edit opens as a modal from the card page (no duplicated page behind it) | PASS | {"modals":1,"href":"/2011_12_14/edit"} |
| 3. edit a Date card / content field is a date picker showing the stored date | PASS | {"type":"date","value":"2011-12-14"} |
| 3. edit a Date card / saving the new date answers a write (Save) | PASS | {"status":200,"action":"/update/2011_12_14","serverTotalMs":881} |
| 3. edit a Date card / the page shows the new date (long form) | PASS | {"newDate":"2011-12-15","shown":"December 15, 2011"} |
| 3. edit a Date card / the original date is restored afterwards (long form) | PASS | {"original":"2011-12-14","shown":"December 14, 2011"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / create a RichText card via /new/RichText and land on it | PASS | {"formStatus":200,"writeStatus":200,"serverTotalMs":778,"landed":"https://127.0.0.1:54580/Harness_richtext_mva58l79","exists":true} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / RichText edit opens as a modal | PASS | {"modals":1,"href":"/Harness_richtext_mva58l79/edit"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / TinyMCE loads for the RichText editor | PASS | {"tinymcePresent":true,"activeEditor":true,"skinCss":0,"textarea":"card[content]"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / saving the RichText card persists (Save answers a write) | PASS | {"status":200,"serverTotalMs":707,"serverSaid":"{\"redirect\":\"https://127.0.0.1:54580/Harness_richtext_mva58l79\"}"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / the saved RichText content is on the page | PASS | {"status":200} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / the nest ({{}}) button is present in the TinyMCE toolbar | PASS | {"nestButton":"Insert/edit nest"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / the {{}} button opens the Nest dialog | PASS | {"open":true,"fields":["nest_name","value","value","value","value","preview"]} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / typing a card name returns suggestions (/*all+by name.json?view=name_match&term=...) | PASS | {"status":200,"body":"[\"Home\",\"Home 1\",\"Home Layout 1\",\"Home-Beginning\",\"HomeHTMLheader\",\"Homeless\",\"Homeowners_Insurance\",\"home-buttons\"]"} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: /new/RichText | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: /new/Basic | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: /new/Date | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: unknown card name (/Some_New_Name) | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: unknown card name /new | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: unknown card ?view=new | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / create route shows signed-in chrome and a card form: /card/new | PASS | {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true} |
| 5. create a card every way the site offers / the Opportunities dropdown and navbar add links are present | PASS | {"itemCount":14,"sample":[{"href":"/Make_Contact","text":"Make Contact"},{"href":"/Aikido_2","text":"Aikido 2"},{"href":"/Aikido_Oak_Cliff","text":"Aikido Oak Cliff"},{"href":"/Archetypal_Psychology","text":"Archetypal Psychology"},{"href":"/Brandon_WilliamsCr |
| 5. create a card every way the site offers / search for a nonexistent name offers a create link | PASS | {"url":"https://127.0.0.1:54580/*search?query[keyword]=zz_no_such_card_harness","hasCreate":true} |
| 6. delete a card / the edit form's Delete button is a confirm-guarded link to /delete/<name> | PASS | {"href":"/delete/Harness_delete_mva5a7lv?success%5Bview%5D=just_deleted"} |
| 6. delete a card / the delete removes the card (trashed, content gone, new-card page shown) | PASS | {"deleteStatus":200,"afterStatus":200,"afterTitle":"New BasicCs - Culturesmith","trashed":true,"stillHasContent":false} |
| 6. delete a card / no card named delete… was created by this run (cards with id above the run baseline) | PASS | {"cardsNamedDeleteCreatedThisRun":0,"baselineMaxCardId":53052} |
| 6. delete a card / the Sign out link is NOT a /delete/*signin link (which would delete/create a card) | **FAIL** | {"signOutHref":"/delete/*signin"} |
| 7. rename, history, search, changes, sign out and back in / a card's history view renders | PASS | {"status":200} |
| 7. rename, history, search, changes, sign out and back in / the Changes link (/*search) lists cards | PASS | {"status":200,"sample":[]} |
| 7. rename, history, search, changes, sign out and back in / /*search lists the cards this run just created/edited first | PASS | {"mentionsHarnessCard":true} |
| 7. rename, history, search, changes, sign out and back in / GET /_signout revokes the session (session cookie gone) | PASS | {"status":200,"cookies":["decko_visit"]} |
| 7. rename, history, search, changes, sign out and back in / after sign out the page is anonymous | PASS | {"signedIn":false} |
| 7. rename, history, search, changes, sign out and back in / signing back in works | PASS | {"hasSessionCookie":true,"signedIn":true} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / the signed-out sign-in page links to sign up and to reset the password | PASS | {"signup":["/new/Sign_up","/new/Sign_up"],"reset":["/*signin","/*signin/edit","/*signin/board","/*signin/edit?slot%5Bhide%5D%5B%5D=board_link"]} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / sign-in refused on a wrong password (422, no session, error shown) | PASS | {"status":422,"hasSession":false,"refusedText":""} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / sign-in with an empty password is refused (no session) | PASS | {"status":422,"noRequest":false,"hasSession":false} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / card content preset in the /new URL is submitted and stored | **FAIL** | {"status":422,"prefilledEditor":"","marker":"Harness preset","afterStatus":200} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / creating a card whose name already exists is refused (Home not touched) | PASS | {"status":422,"homeStillThere":true,"errorShown":false} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / rename through the board's name row moves the card to its new name | PASS | {"status":200,"serverSaid":"{\"redirect\":\"https://127.0.0.1:54580/Harness_richtext_mva58l79_renamed\"}","newName":"Harness_richtext_mva58l79_renamed","afterStatus":200,"oldGone":true} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / the history page lists the card's acts (not just a 200) | PASS | {"status":200,"actLikeNodes":3} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / the card board renders with its tabs (guide, engage, history, rules) | PASS | {"board":1,"tabs":[{"text":"Guide","href":"#tab-harness_richtext_mva58l79_renamed-4-guide"},{"text":"Engage","href":"#tab-harness_richtext_mva58l79_renamed-5-engage"},{"text":"History","href":"#tab-harness_richtext_mva58l79_renamed-6-history"},{"text":"Related |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / the Engage tab shows the follow controls | PASS | {"followControls":["follow","1 follower","all followed cards"]} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / keyword search from the navbox returns the run's card | PASS | {"url":"https://127.0.0.1:54580/*search?query%5Bkeyword%5D=Harness_richte"} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / a CQL search runs and answers without an error page | PASS | {"url":"https://127.0.0.1:54580/*search?query%5Bquery%5D=type%3D%22RichText%22","query":"type=\"RichText\""} |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / the account card's board has an Account tab | **FAIL** | {"tabLinks":[{"text":"edit","href":"/Harness_Admin/name_form"},{"text":"Person","href":"/Person"},{"text":"edit","href":"/Harness_Admin/board_type_formgroup"},{"text":"Delete","href":"/delete/Harness_Admin?success%5Bview%5D=just_deleted"},{"text":"Guide","href |
| 7b. further signed-in capabilities (Decko's own browser tests as the checklist) / upload: the File create form offers a file input | **FAIL** | {"note":"no file input on /new/File"} |
| 8. ordinary (non-admin) account permissions / the member is signed in | PASS | {"signedIn":true} |
| 8. ordinary (non-admin) account permissions / a member's delete attempt is refused with a clear message, not a form | PASS | {"status":422,"body":"<!DOCTYPE html><html><head><title>Error (user-error)</title></head><body><div class=\"alert alert-warning alert-dismissible card-error-msg\" role=\"alert\"><button type=\"button\" data-bs-dismiss=\"alert\" cl"} |
| 8. ordinary (non-admin) account permissions / the card the member tried to delete is still there | PASS | {"status":200} |
| 9. timings / no signed-in page exceeded 3 s of server time | PASS | {"slow":[]} |
| 9. timings / no save exceeded 3 s of server time | PASS | {"slow":[]} |
| 9. timings / no request returned a 5xx | PASS | {"fiveHundreds":[]} |
| cleanup / every card the run created is removed from the local copy | PASS | {"removed":1,"remaining":0} |

## Capability coverage (Decko's own browser tests as the checklist)

94 capabilities enumerated from Decko's Cucumber features and Cypress e2e specs (see tools/edge-signed-in-exercise/capability-checklist.md).

| status | count |
|---|---|
| covered by this run | 20 |
| partially covered | 3 |
| not covered yet | 66 |
| disabled upstream (commented in Decko) | 1 |
| out of scope (needs a mail sink) | 4 |

Capabilities driven by this run that the checklist had listed as uncovered: M1

| id | group | capability | status | check |
|---|---|---|---|---|
| S1 | session | Sign in with email and password, landing signed in on / | covered | admin signs in through the sign-in form and stays signed in |
| S2 | session | Sign in refused on a wrong password | not_covered |  |
| S3 | session | Sign in requires email and password (form validation) | not_covered |  |
| S4 | session | Sign-in link to sign up, and link to reset password | not_covered |  |
| S5 | session | Redirect to the sign-in page when a signed-out user opens a gated page | not_covered |  |
| S6 | session | Stay signed in across navigation, Back, reload, leaving and returning | covered | stays signed in across navigation / after browser Back / after reload / after leaving the site and returning |
| S7 | session | Sign out, then sign back in | covered | GET /_signout revokes the session / signing back in works |
| S8 | session | Sign out link in the navbar signs the user out | partial | navbar Sign out is /delete/*signin, which 404s on the edge |
| S9 | session | First-run setup of the first admin account | out_of_scope | one-time setup of a fresh deck; Brandon's deck is already set up |
| C1 | create | Create a RichText card through /new/RichText and land on it | covered | create a RichText card via /new/RichText and land on it |
| C2 | create | Create a Basic and a Date card through /new/<Type> | covered | create route shows signed-in chrome and a card form: /new/Basic, /new/Date |
| C3 | create | Open an unknown card name (/Name, /Name/new, ?view=new) as a create form | covered | create route ... unknown card name, /new, ?view=new |
| C4 | create | /card/new create form | covered | create route shows ...: /card/new |
| C5 | create | Navbar and Opportunities add links present | covered | the Opportunities dropdown and navbar add links are present |
| C6 | create | Search for a nonexistent name offers a create link | covered | search for a nonexistent name offers a create link |
| C7 | create | Create a plain-input card through the editor | not_covered |  |
| C8 | create | Duplicate name refused in the editor (validation error) | not_covered |  |
| C9 | create | Invalid number refused in the editor | not_covered |  |
| C10 | create | Presetting card content from the URL (?card[content]=...) | not_covered |  |
| C11 | create | Autoname cardtype (name generated on save) | not_covered |  |
| C12 | create | Create a new structured card with its subcards (New structured card) | not_covered |  |
| C13 | create | Create and edit a templated card | not_covered |  |
| C14 | create | Default content from a rule fills the new form | not_covered |  |
| C15 | create | Radio input in a new card | not_covered |  |
| C16 | create | Checkbox input in a new card | not_covered |  |
| C17 | create | Multiselect input in a new card | not_covered |  |
| C18 | create | Select input in a structured card | not_covered |  |
| E1 | edit | Edit a Date card in the modal; save and restore | covered | edit opens as a modal ... / saving the new date ... / restored |
| E2 | edit | Edit a RichText card with TinyMCE: save persists, content shown | covered | saving the RichText card persists / the saved RichText content is on the page |
| E3 | edit | TinyMCE loads with its nest plugin and toolbar | covered | TinyMCE loads / the nest button is present / nest plugin served |
| E4 | edit | Nest button opens the Nest dialog; typing a card name returns suggestions | covered | the {{}} button opens the Nest dialog / typing a card name returns suggestions |
| E5 | edit | Insert a nested card from the Nest dialog and save it | not_covered |  |
| E6 | edit | Link button ([[ ]]) inserts a link | not_covered |  |
| E7 | edit | Nest rules editor | not_covered |  |
| E8 | edit | Nest image editor | not_covered |  |
| E9 | edit | Nest list editor | not_covered |  |
| E10 | edit | Edit a plain-input card; save | not_covered |  |
| E11 | edit | Edit a nested summary with plusses | not_covered |  |
| E12 | edit | Edit type of a card in the board | not_covered |  |
| E13 | edit | Edit type for a new card | not_covered |  |
| E14 | edit | Edit type for a rule | not_covered |  |
| E15 | edit | Save and Close updates the main slot | partial | saving the new date answers a write / the page shows the new date (Save and Close is the button used) |
| E16 | edit | Save (without close) updates the main slot | not_covered |  |
| E17 | edit | Save after a name change updates the origin slot | not_covered |  |
| E18 | edit | Two edits at the same time: second save refused (conflict) | not_covered |  |
| E19 | edit | Edit board: account tab, change email | not_covered |  |
| E20 | edit | Edit board: engage tab (follow button, advanced, all followed cards, followers, discussion) | not_covered |  |
| E21 | edit | Edit board: history tab lists changes in pills | not_covered |  |
| E22 | edit | Edit board: rules tab (no set selected; warns when set 'all' selected) | not_covered |  |
| E23 | edit | Pointer editing (change a pointer's selection and save) | not_covered |  |
| R1 | rename-delete | Rename a card through the editor; referers updated | not_covered |  |
| R2 | rename-delete | Delete a card through the editor; the card is gone | covered | the delete removes the card (trashed, content gone, new-card page shown) |
| R3 | rename-delete | Delete via the Delete link never creates a card named delete… | covered | no card named delete… was created by this run |
| R4 | rename-delete | Refuse to delete a system card | not_covered |  |
| R5 | rename-delete | Member delete refused with a clear message | covered | a member's delete attempt is refused with a clear message, not a form |
| P1 | permissions | Member denied read of a restricted card | not_covered |  |
| P2 | permissions | Member denied create of a restricted type | not_covered |  |
| P3 | permissions | Member denied edit of a restricted card | not_covered |  |
| P4 | permissions | Rules: default setting and plus-card override | not_covered |  |
| P5 | permissions | Rules: *right Set, *type_plus_right Set, Self Set | not_covered |  |
| P6 | permissions | Rule board: administrator sets read/write rules | not_covered |  |
| F1 | files | Upload a file (/files route after upload) | not_covered | the live edge environment carries no DECKO_STORAGE_* variables; expected to fail on the edge, to be confirmed |
| F2 | files | Remove an upload from the preview | not_covered |  |
| F3 | files | Upload and change an image | not_covered |  |
| F4 | files | Change a coded image | not_covered |  |
| F5 | files | Empty file refused | not_covered |  |
| F6 | files | Upload a file as a field in a form; update it; submit without updating | not_covered |  |
| F7 | files | Member uploads a file | not_covered |  |
| F8 | files | Replace an uploaded file | not_covered |  |
| N1 | search | Quick (keyword) search from the navbox | not_covered |  |
| N2 | search | CQL search | not_covered |  |
| N3 | search | Paging through search results | not_covered |  |
| N4 | search | Search card pages (search card paging) | not_covered |  |
| N5 | search | Changes link lists recently updated cards, newest first | covered | the Changes link (/*search) lists cards / lists the cards this run created first |
| N6 | search | Search for a nonexistent name offers a create link | covered | search for a nonexistent name offers a create link |
| N7 | search | Name-match autocomplete for card names | covered | typing a card name returns suggestions |
| N8 | search | Visit a card with the simple layout | not_covered |  |
| N9 | search | Visit a User card with the user layout | not_covered |  |
| N10 | search | Read pages with nests, links, files, chains and loops | not_covered |  |
| N11 | search | Reference links and card references render | not_covered |  |
| H1 | history | View a card's history page | partial | a card's history view renders (status only; the act list is not graded) |
| H2 | history | Expand an act and roll back by 'Save as current' | disabled_upstream | not graded; still a capability a signed-in editor has |
| W1 | follow | Follow a card from the board | not_covered |  |
| W2 | follow | Unfollow from the board | not_covered |  |
| W3 | follow | Watch a card and a type card | not_covered |  |
| W4 | follow | Followers list and 'all followed cards' view | not_covered |  |
| W5 | follow | Watcher notified of updates to included and plus cards (mail) | out_of_scope | the local harness does not run an SMTP sink; mail content and count are graded by Decko's own specs, not in the browser |
| W6 | follow | Unfollow link in the email | out_of_scope | needs a received email; no mail sink in the local harness |
| A1 | account | Open the account settings page | not_covered |  |
| A2 | account | Change password, then sign in with the new password | not_covered |  |
| A3 | account | Change email | not_covered |  |
| A4 | account | Sign up for a new account (anonymous), then sign in | not_covered |  |
| A5 | account | Request a password reset (mail link) | out_of_scope | the reset link arrives by mail; no mail sink locally |
| M1 | editor | Rich text editor toolbar (formats, lists, table, insert menu) | covered | TinyMCE loads for the RichText editor |


## The four failures, and what each one is

All four are the edge not doing something Decko does. None is fixed here; the lead fixes
product failures.

1. **Navbar Sign out.** The link is `href="/delete/*signin"`
   (src/card/render/navbar-views.ts:369). The edge excludes that path from the GET-to-DELETE
   rewrite (deploy/bunny-worker-src/bunny-edge-engine-handler.ts:261), so
   `GET /delete/*signin` answers 404 "delete", sets no cookie and does not revoke the session.
   The edge's own `GET /_signout` answers 200 and clears the cookie (the harness's `_signout`
   checks pass). Either serve `/delete/*signin` as sign-out, or point the link at `/_signout`.

2. **URL presets ignored on `/new/<Type>`.** `/new/RichText?card[name]=X&card[content]=Y`
   creates a blank card: the form generator hardcodes an empty name and content
   (deploy/bunny-worker-src/bunny-edge-new-card-form.ts, `signedInNewCardFormBodyHtml`).
   Decko's Cypress `create/presetting` suite drives this on Ruby.

3. **No Account tab on the account card's board.** `<Holder>/board` renders the content
   editor and the name row but no Account tab, so a signed-in user cannot change their email
   or password from the edge. Ruby's board has it (Cypress `edit/board/account_tab`).

4. **`/new/File` has no file input.** The signed-in new-card form renders a date input for
   Date and a TinyMCE textarea for everything else, with no `type="file"` branch, so uploads
   cannot start from the create form. This is the generic-form gap the project already logged
   in `.claude/issues/2026-10-15-signed-in-new-card-form-parity.md`.

## Environment notes, not deployment failures

- The Font Awesome kit script answers 403 for 127.0.0.1 because the kit is registered to
  culturesmith.com; excluded from the console check and counted in the evidence.
- Signed-in boots log "[nest-index] missing" on a deck whose marker is current: the anonymous
  boot and a direct marker read report it current while the boot serving a signed-in request
  reports it missing. The pages still render (they walk the nest closure). Cause not isolated.
- Timings: no page and no save exceeded 3 s of server time in this run. Earlier runs measured
  `/new/RichText` between 1.9 s and 3.2 s server time.
