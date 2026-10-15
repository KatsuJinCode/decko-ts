# Edge signed-in exercise — 2026-10-15

- Command: `node tools/edge-signed-in-exercise.mjs`
- Artifact: `deploy/dist/bunny-edge-engine.bundle.js`, rebuilt from source, run against a LOCAL deck copy on the engine schema
- Deck source (local, never Bunny): `deck.sqlite3`, 21676 cards copied
- Accounts: two throwaway local accounts (one holding the `administrator` role, one signed in with no role)
- Browser: headless Chromium, throwaway profile, local origin + the deck's configured asset host + stock layout CDNs only
- Result: **49 / 50 passed**, 1 failed

| check | result | evidence |
|---|---|---|
| 1. sign in, and stay signed in / admin signs in through the sign-in form and stays signed in | PASS | {"hasSessionCookie":true,"landedOn":"https://127.0.0.1:64020/","signedIn":true,"hasSignOut":true} |
| 1. sign in, and stay signed in / member signs in through the sign-in form and stays signed in | PASS | {"hasSessionCookie":true,"signedIn":true} |
| 1. sign in, and stay signed in / home shows the account name and Sign out | PASS | {"title":"Home - Culturesmith","hasSignOut":true,"hasAccountName":true,"signedIn":true} |
| 1. sign in, and stay signed in / stays signed in across navigation | PASS | {"title":"Home - Culturesmith","signedIn":true} |
| 1. sign in, and stay signed in / stays signed in after browser Back | PASS | {"url":"https://127.0.0.1:64020/"} |
| 1. sign in, and stay signed in / stays signed in after reload | PASS | {"url":"https://127.0.0.1:64020/"} |
| 1. sign in, and stay signed in / stays signed in after leaving the site and returning | PASS | {"url":"https://127.0.0.1:64020/"} |
| 2. styling and console on signed-in pages / deck stylesheet link resolves | PASS | {"links":[{"href":"https://fonts.googleapis.com/css2?family=Material+Icons","sheet":true},{"href":"https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1790384218.css","sheet":true}]} |
| 2. styling and console on signed-in pages / no blocked or 4xx/5xx subresource on the signed-in page | PASS | {"blocked":[]} |
| 2. styling and console on signed-in pages / no console errors on the signed-in page (Font Awesome kit 403 excluded: 14 responses, domain-locked kit) | PASS | {"errors":[],"excludedKit403":14} |
| 3. edit a Date card / date card page loads | PASS | {"status":200,"title":"2011 12 14 - Culturesmith"} |
| 3. edit a Date card / edit opens as a modal from the card page (no duplicated page behind it) | PASS | {"modals":1,"href":"/2011_12_14/edit"} |
| 3. edit a Date card / content field is a date picker showing the stored date | PASS | {"type":"date","value":"2011-12-14"} |
| 3. edit a Date card / saving the new date answers a write (Save) | PASS | {"status":200,"action":"/update/2011_12_14","serverTotalMs":1199} |
| 3. edit a Date card / the page shows the new date (long form) | PASS | {"newDate":"2011-12-15","shown":"December 15, 2011"} |
| 3. edit a Date card / the original date is restored afterwards (long form) | PASS | {"original":"2011-12-14","shown":"December 14, 2011"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / create a RichText card via /new/RichText and land on it | PASS | {"formStatus":200,"writeStatus":200,"serverTotalMs":1261,"landed":"https://127.0.0.1:64020/Harness_richtext_mva31s8n","exists":true} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / RichText edit opens as a modal | PASS | {"modals":1,"href":"/Harness_richtext_mva31s8n/edit"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / TinyMCE loads for the RichText editor | PASS | {"tinymcePresent":true,"activeEditor":true,"skinCss":0,"textarea":"card[content]"} |
| 4. edit a RichText card (TinyMCE, nest dialog, link button) / saving the RichText card persists (Save answers a write) | PASS | {"status":200,"serverTotalMs":698,"serverSaid":"{\"redirect\":\"https://127.0.0.1:64020/Harness_richtext_mva31s8n\"}"} |
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
| 5. create a card every way the site offers / search for a nonexistent name offers a create link | PASS | {"url":"https://127.0.0.1:64020/*search?query[keyword]=zz_no_such_card_harness","hasCreate":true} |
| 6. delete a card / the edit form's Delete button is a confirm-guarded link to /delete/<name> | PASS | {"href":"/delete/Harness_delete_mva3436z?success%5Bview%5D=just_deleted"} |
| 6. delete a card / the delete removes the card (trashed, content gone, new-card page shown) | PASS | {"deleteStatus":200,"afterStatus":200,"afterTitle":"New BasicCs - Culturesmith","trashed":true,"stillHasContent":false} |
| 6. delete a card / no card named delete… was created by this run (cards with id above the run baseline) | PASS | {"cardsNamedDeleteCreatedThisRun":0,"baselineMaxCardId":53052} |
| 6. delete a card / the Sign out link is NOT a /delete/*signin link (which would delete/create a card) | **FAIL** | {"signOutHref":"/delete/*signin"} |
| 7. rename, history, search, changes, sign out and back in / a card's history view renders | PASS | {"status":200} |
| 7. rename, history, search, changes, sign out and back in / the Changes link (/*search) lists cards | PASS | {"status":200,"sample":[]} |
| 7. rename, history, search, changes, sign out and back in / /*search lists the cards this run just created/edited first | PASS | {"mentionsHarnessCard":true} |
| 7. rename, history, search, changes, sign out and back in / GET /_signout revokes the session (session cookie gone) | PASS | {"status":200,"cookies":["decko_visit"]} |
| 7. rename, history, search, changes, sign out and back in / after sign out the page is anonymous | PASS | {"signedIn":false} |
| 7. rename, history, search, changes, sign out and back in / signing back in works | PASS | {"hasSessionCookie":true,"signedIn":true} |
| 8. ordinary (non-admin) account permissions / the member is signed in | PASS | {"signedIn":true} |
| 8. ordinary (non-admin) account permissions / a member's delete attempt is refused with a clear message, not a form | PASS | {"status":403,"body":"<!DOCTYPE html><html><head><title>Error (permission-denied)</title></head><body><pre>Sorry! You need permission to do that.</pre><!-- actor Harness Member may not delete card Harness_richtext_mva31s8n"} |
| 8. ordinary (non-admin) account permissions / the card the member tried to delete is still there | PASS | {"status":200} |
| 9. timings / no signed-in page exceeded 3 s of server time | PASS | {"slow":[]} |
| 9. timings / no save exceeded 3 s of server time | PASS | {"slow":[]} |
| 9. timings / no request returned a 5xx | PASS | {"fiveHundreds":[]} |
| cleanup / every card the run created is removed from the local copy | PASS | {"removed":0,"remaining":0} |

## Notes on the one failure

The navbar's Sign out link renders `href="/delete/*signin"`
(src/card/render/navbar-views.ts:369, `signOutView`), the way Ruby's
card-mod-account sign_out view does. On the Bunny edge, GET `/delete/:mark` is
rewritten to a DELETE for the write surface EXCEPT `/delete/*signin`
(deploy/bunny-worker-src/bunny-edge-engine-handler.ts:261 excludes it, because
`*signin` keeps its own sign-out handling). So clicking Sign out navigates to
`/delete/*signin`, which the edge answers 404 "delete" (no Set-Cookie, session
not revoked). The edge's own sign-out route `GET /_signout`
(bunny-edge-engine-handler.ts:303) works (the harness's `_signout` checks pass),
but the navbar does not link to it.

Verified over HTTP with a fresh session:
- `GET /delete/*signin` -> 404, no Set-Cookie, page title "delete"
- `GET /_signout` -> 200, `Set-Cookie: decko_ts_session=; Max-Age=0`, session revoked

Not fixed here (the lead fixes product failures).

## Environmental notes (not deployment failures)
- Font Awesome kit script (`kit.fontawesome.com`) answers 403 for 127.0.0.1 because
  the kit is registered to culturesmith.com; excluded from the console check.
- The signed-in path re-reads the nest-index marker as "missing" at each actor
  boot even on a deck whose marker is current (the anonymous/anonymous boot and
  a direct readNestIndexMarker both report current); the pages still render,
  they walk the nest closure. Observed, not fixed, not counted as a failure.
