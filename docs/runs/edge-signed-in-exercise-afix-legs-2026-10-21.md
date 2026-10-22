# Edge signed-in exercise — the cap-A4 and cap-M1 afix legs, 2026-10-21

The two rows the tranche-5 signed-in battery left partial (A4: the
anonymous sign-up create answered 422 with a bare form re-render; M1: the
rendered toolbar read as missing exactly forecolor and backcolor) were
repaired and re-run on their own legs. Both legs ran the full local stack
on a throwaway copy of the 21,676-card local deck (the same deck the
tranche-5 full run used), loopback database and storage, owned in-process
mail capture, headless Chromium.

| leg | run record (this clone, gitignored) | source | result |
|---|---|---|---|
| account-signup (cap-A4) | `.runtime/edge-signed-in/a4-after-4/report.md` | `aad44b08` (cap-A4: the landing leg waits for the landing before reading it) | **8 / 8 passed** |
| cover-b M1 case (cap-M1) | `.runtime/edge-signed-in/m1-after-1/report.md` | `5f094dca` (cap-M1: the sweep reads the split buttons TinyMCE actually renders) | **5 / 5 passed** |

## cap-A4 — the anonymous sign-up, 8/8

`node tools/edge-signed-in-exercise.mjs --only account-signup --out
.runtime/edge-signed-in/a4-after-4/report.md` at source `aad44b08`.

| check | result | evidence (headline facts) |
|---|---|---|
| the sign-up form carries Ruby's name, email and password fields, its create action and its success mark | PASS | status 200; no failures; the Background wrote `Person+*type+*create` = "Anyone" (the deck's accounted cardtype is named Person, codename user); the name field is Ruby's named shape: `<input type="hidden" name="card[name]" id="card_name" value="Harness_Signup_mvikvsvu" autocomplete="off">` |
| the sign-up lands on the deck's own Signup Success card | PASS | no failures; the page shows the seed card's name and its own sentence |
| the new account is sent the verification mail Ruby's template writes | PASS | delivered 1; subject "verification link for Culturesmith"; the follow-this-link anchor |
| the verification link is an update of the account card carrying the verify trigger and a token | PASS | `/update/Harness_Signup_mvikvsvu+*account?card[trigger]=verify_and_activate&token=...` (the oracle's url shape) |
| the new account can sign in with its own email and password | PASS | activation answers 200 with a session cookie and the page signed in; after sign out and sign back in, session cookie present, no failures |

The fixes the leg sits on (this branch, in order):

1. `ceb47daa` — the name reaches the create: the anonymous /new/:type arm
   rendered the name prompt unconditionally, so the form posted an empty
   `card[name]` and the engine refused the create 422 name-illegal. The
   route now reads `card[name]` off the query and renders Ruby's named
   shape (the committed real-Ruby capture arm
   `probe-view:23:new@set/type/signup/views.rb`: hide [name_formgroup],
   the hidden `card[name]` field). The check's Background also runs as the
   administrator now, the way signup.feature's Background does — the
   anonymous write of the rule was refused 403 and the rule was never
   there.
2. `8dbde162` — the form wears Ruby's main slot wrap: the anonymous route
   spliced the bare form frame into the layout with no card-slot wrapper,
   so the vendored client's `mainSuccess` (slotter.js.coffee:106-110,
   gated on `$.fn.slot().parent('#main')` from decko_jquery.js.coffee:4)
   never appended `success[redirect]=true`, the server answered the soft
   slot re-render, and the page never landed. The route now emits the
   engine's own `:new` slot wrap (transcribed from
   `RenderEngine.render`'s output for both name shapes). The Background
   rule anchors on the deck's OWN accounted cardtype (codename user): this
   deck renamed the cardtype to "Person", so the upstream literal
   "User+*type+*create" covered a set no accounted card belongs to —
   Ruby's own algebra answers unapproved/no-mail on that deck state
   (verified against the engine's verdict walk: candidates
   `person+*type+*create`, `*all+*create`="Anyone Signed In" → anonymous
   denied).
3. `aad44b08` — the landing leg waits for the landing: the client's own
   success navigation evicts the XHR body (the signIn contract names the
   shape), so the check read a truncated mid-load document; it now waits
   for the seed card's URL or content before reading.

## cap-M1 — the rendered toolbar, 5/5

`node tools/edge-signed-in-exercise.mjs --only cover-b --case M1 --out
.runtime/edge-signed-in/m1-after-1/report.md` at source `5f094dca`.

| check | result | evidence (headline facts) |
|---|---|---|
| M1 Rich text editor toolbar (formats, lists, table, insert menu) | PASS | formats/lists/table/insert/format all true |
| the opened editor's controls cover the toolbar configuration's tokens | PASS | all 17 tokens matched: formatselect bold italic strikethrough **forecolor backcolor** deckolink nest numlist bullist outdent indent removeformat + menubar edit view insert format table; missing [], failures []; configSeen true; insertMenuSeen deckolink nest; servedBytesMatchGemPin true — the page's own fetch of `/mod/tinymce_editor/tinymce.min.js` and `/mod/tinymce_editor/themes/silver/theme.min.js` digested (in the browser) to exactly `3c6a5feeb3fb4dd9b5ab70f3e13b6cb0715136ddb50344b6d3069e9233dc8a9c` and `40126fc0466dc69021240211ce9a6bc90b73f14a6533bd205cd08a1e4af8f87a`, the gem tree's own distribution files (card-mod-tinymce_editor-0.20.0/public/), also verified against the redirect target (cdnjs 5.10.7) this session |

The fix the leg sits on: `5f094dca` — the sweep reads the split buttons.
TinyMCE renders the color controls as SPLIT BUTTONS
(div.tox-split-button, role="button"; the silver theme registers
`kb(t,"forecolor","forecolor","Text color",...)` and
`kb(t,"backcolor","hilitecolor","Background color",...)`), and the
battery's label sweep selected only `button, [role=menuitem], .tox-tbtn,
.tox-mbtn` — the editor's own DOM carried `Text color` / `Background
color` while the sweep's label list carried neither. The port's toolbar
construction was never the defect: the page config carries the stock
toolbar1 verbatim and the served bytes are the gem's. The sweep's selector
now names every element class the editor emits, the same title/aria-label
attributes Ruby's own Cypress suite drives by.
