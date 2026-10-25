# smell-prove-host-override-read-admission

- The row's own label: `smell/probe script prove-host-override-read-admission.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prove-host-override-read-admission.mjs`
  (sha256 `80b1c13b0c093c2e4032604c5a117764f2c08e69a81e9bfce3fc146d37b97c23`)
- What this lane did: restored the inputs the instrument imports and reads, ran
  the row's own instrument twice against this lane's tree, and landed the fix
  that the first run measured.
- Commands:
  - `node prove-host-override-read-admission.mjs smell-host-override-r5-20261024`
    (exit 1; the instrument wrote its own receipt)
  - `node prove-host-override-read-admission.mjs smell-host-override-r5-20261024-b`
    (exit 1; the instrument wrote its own receipt)
- Capture: `fixtures/captured/smell-row-r5b-2026-10-24/smell-prove-host-override-read-admission.json`
- Pin: `tests/server/smell-prove-host-override-read-admission-parity.test.ts`

## Verdict: WORKING ON IT

The row's own verification ran and refused, twice, each time for a mechanism it
measured itself. The row stays open, one step further along than the recorded
red of 2026-10-20.

## The inputs the instrument needed, and what it took to restore them

The instrument imports two harness modules from the pinned `b00a4503` checkout
and reads a throwaway TLS fixture from that checkout's own tree:

- `tools/edge-signed-in-exercise/lib/harness-browser.mjs`
- `reference-harness/browser/lib/live-walk-profile.mjs`
- `tmp/edge-signed-in-2026-10-18T06-33-24-416Z-40592-40592/runtime/edge/harness-key.pem`
  and `harness-cert.pem`

The pinned checkout had been reduced to a bare `node_modules` directory, and the
lease on that path still belonged to the lane that restored it for its own
instruments. This lane released that lease (its task is finished and its
checkout had been swept), restored the checkout at the pinned commit with the
steward's own entry point, and linked the shared `node_modules`.

The pinned commit carries no `live-walk-profile.mjs` at all, so the current
tree's two harness modules were placed at the paths the instrument imports
from. The fixture is input-shaped rather than hash-pinned, so it was
regenerated with the same command the harness itself uses
(`openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=127.0.0.1
-addext subjectAltName=IP:127.0.0.1,DNS:localhost`).

## The first run: the override target was never reached

    page.goto: net::ERR_BLOCKED_BY_CLIENT at https://127.0.0.2:51498/
    checks: []   pass: false

The mechanism is in the port's own harness, `tools/edge-signed-in-exercise/lib/harness-browser.mjs`:

- the request filter's allow-list is the canonical loopback set
  (`LOCAL_HOSTS`, line 22: `127.0.0.1`, `localhost`, `[::1]`), and the policy
  route aborts every other origin;
- the harness also has an admit route whose own comment says it "continues the
  target origin's own requests", but it was registered BEFORE the two policy
  routes, and Playwright evaluates route handlers in the reverse order they
  were registered, so the policy route aborted the `127.0.0.2` navigation
  before the admit route could ever see it.

That is the same failure mode the recorded red of 2026-10-20 carries
(`page.goto net::ERR_BLOCKED_BY_CLIENT at the owned origin, pass:false,
checks:[]`), reproduced first hand.

## The fix this lane landed

The admit route is now registered after both policy routes and before the write
gate, so it is evaluated first for the target origin's requests and for nothing
else, while the write gate stays registered last so that it still runs first.
The change is in `tools/edge-signed-in-exercise/lib/harness-browser.mjs`, and
the pin above holds the order: a harness that moves the admit route back
above the policy routes fails the pin.

## The second run: admitted for reads, still refused at the write backstop

    checks: ["exact target document admitted", "same-origin JSON fetch admitted"]
    pass: false
    Expected values to be strictly deep-equal:
    + actual - expected
      [ true, true, true, false, false, false ]
    - [ true, true, true, true,  true,  true  ]

The six probes the instrument drives, and what each one did:

| probe | result |
|---|---|
| `POST /card/create` | refused |
| `GET /update/OwnedCard` | refused |
| `DELETE /delete/OwnedCard` | refused |
| `GET /delete/OwnedCard` | reached the owned server |
| `POST /update/account` (body `card[content]=owned`) | reached the owned server |
| `POST /card/create` (body `card[name]=*signin`) | reached the owned server |

The gate's own policy explains the three that got through, in
`reference-harness/browser/lib/live-walk-profile.mjs`:

- the session-mark carve-out (`SESSION_MARKS`, line 74: `*signin`, `signin`,
  `*account`, `account`) is decided from the card name alone
  (`decideWrite`, line 259), so a request that names a card in its body is
  admitted when the URL mark is a session mark;
- `classifyWriteRequest` treats a GET as a write only on the update route
  (line 316), so a GET that names a card on the delete route is not a write at
  all, and the port's own write-route table
  (`src/server/write-routes.ts`, mirrored at line 291) does not list it either.

## The gap, in one mechanism sentence

The harness's write backstop decides a write from the URL's mark and the card
name in the path, never from the body of an admitted request, so a card write
posted to a session-mark route, and a GET that names a card on a mutation
route, both reach the target in read-only mode.

## What this lane did not do

It did not change the write gate's policy: the session-mark carve-out is what
lets the signed-in journeys change the account card's own content, so
narrowing it is a contract decision about the port's own flows, not a
parity verdict. It did not change the instrument. It made no `.com` request,
no public network request and no production write, and it read no credential.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
