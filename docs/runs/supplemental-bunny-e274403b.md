# Complete supplemental journeys through the actual Bunny handler

All six unfiltered supplemental journeys completed on clean **e274403b**, using the actual Bunny request handler on Node, its real BunnyDbDriver over an owned local Hrana service, an owned Bunny Storage HTTP emulator, and the application NotifyTransport's captured local outbox. This is not a hosted Bunny runtime/provider acceptance claim or an exact six-case Ruby comparison. The JSON receipt pins source/build/fixture/journey/engine/policy hashes, raw result hashes, runtime configuration, observations, and failed network requests. Raw HTML/results/logs remain at `tmp/journey-bunny-six-e274403b/bunny-local`.

| Journey | Duration |
|---|---:|
| Email change, fresh login/restart, old credentials refused | 31.887s |
| Password change, fresh login/restart, old credentials refused | 34.430s |
| Reset email, actual token GET, account form, fresh login/restart | 34.261s |
| Anonymous signup, administrator approval, actual verification email/token, activation, fresh login/restart | 65.009s |
| Date edit/save/reload, fresh session/restart, exact editor value | 26.344s |
| Initialized rich editor/save/reload, fresh session/restart, persisted editor content | 25.194s |

The initial frozen ad428d89 attempt completed four journeys and exposed two actual browser failures. Reset posted a login without a password because the shared edit form omitted stock self/signin.rb's `edit_view_hidden` trigger and `edit_success` target. Signup submitted flat email/password fields rather than nested +*account fields, so the writer correctly refused it. The Node host's bespoke forms and hand-authored HTTP requests had masked both defects. e274403b repairs the application forms; the runner does not inject missing fields. The HTTP regression now collects and submits the rendered controls and proves missing transport refusal, actual verification/activation/fresh login, reset-token/password-form/fresh login, old credential refusal, and cross-origin reset refusal. Twelve focused form/HTTP tests and TypeScript validation passed before this full browser rerun.

The failed attempt remains at `tmp/journey-bunny-six-ad428d89-browser-hosts/bunny-local`. A still earlier ad428d89 attempt without the required `build:engine -- --browser-hosts` build option failed host admission for all six cases (missing compiled local Hrana helper); it remains at `tmp/journey-bunny-six-ad428d89/bunny-local`. Both failures remain visible rather than being overwritten. Production Node six-case acceptance is separately recorded at f0c91b5a; it cannot substitute for this Bunny handler run. Canonical Ruby reference coverage remains separate.
