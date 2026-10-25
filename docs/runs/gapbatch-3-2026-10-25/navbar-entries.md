# Gap batch three, GAP B: the five navbar entries

The enumeration audit (`docs/runs/enumeration-audit-2026-10-25.md`, part A3)
named five original navigation entries no roster row carries: "Add type",
"Configure skin", "Basic configuration", "Change this menu", "Learn more".
This lane's branch is `port/gapbatch-3-20261025`, created from
`deploy/full-candidate-20261030` at `95654138`
(`956541382ec80c32020977756af4cea1a7431511`), the newest pushed roll tip.

## The original's recorded render

- `fixtures/captured/followers-address-junction.json`,
  `fixtures/captured/email-templates-raw-oracle.json` and
  `fixtures/captured/search-list-views.json` each record the original's
  navbar page text (the audit's own evidence line): "Getting started Add type
  Configure skin Basic configuration Change this menu Learn more Recent
  Changes Sign up Sign in". The three recorded instances this session all
  carry the same sequence (the `httpAnonymous.*.textDigest` fields of the
  first capture; the same tokens in the other two).
- `fixtures/captured/email-templates-raw-oracle.json` records the two seed
  cards behind the navbar: card 22748 `*header`, whose layout nests
  `{{:main_menu|navbar_links}}`, and card 38248 `*getting started links`,
  whose content carries the five entries verbatim:
  `[[/new/Cardtype | Add type]]`, `[[:all+:style | Configure skin]]`,
  `[[Administrator| Basic configuration]]`, `[[/:main_menu/edit | Change this
  menu]]`, `[[https://decko.org/Features | Learn more]]`.
- The synthetic-v1 fixture deck carries the same seeds: `*main menu` (id 498,
  content `[[:getting_started_links|Getting started]]` /
  `[[:recent|Recent Changes]]`) and `*getting started links` (id 528, type
  Link list, the five entries). Both facts read this session from
  `reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3`.

## The port's navbar, measured

The serving host booted on a staged copy of the synthetic-v1 fixture
(`reference-harness/browser/engines/ts-server.mjs`, the journeys' own engine
manifest; `HARNESS_DECK`/`HARNESS_FILES`/`HARNESS_DECK_JSON`/`HARNESS_WORK`
set, ready probe `/__harness/ready` answered 200):

- `GET /` answered 200, 27794 bytes, and its navbar carries all five entries
  as anchors: `href="/new/Cardtype"` (Add type), `href="/*all+*style"`
  (Configure skin), `href="/Administrator"` (Basic configuration),
  `href="/:main_menu/edit"` (Change this menu), and the external
  `href="https://decko.org/Features"` (Learn more, `target="_blank"`).
- The served navbar's normalized text is exactly the recorded sequence:
  "Getting started Add type Configure skin Basic configuration Change this
  menu Learn more Recent Changes Sign up Sign in".
- `GET /*main_menu?view=navbar_links` (the direct card route with the navbar
  view) answered 200 with the same five anchors.

The same five entries with the same hrefs render on the edge page seam
(`liveRenderPage` over `bootEdgeServingEngines`, the closure the bunny
worker's page route takes) over the fixture copy: 27764 bytes, `main-nav`
present, all five labels present.

## Verdict: closed

The port renders every one of the five entries the audit named, at the
recorded labels, at the recorded targets, in the recorded order, on the
serving host and on the edge page seam. The gap was at the roster-row level;
the port surface needed no fix. The closing instrument is the pinned suite
`tests/card/render/navbar-getting-started-entries-oracle-pin.test.ts`, which
renders the anonymous Home page over the real fixture deck through the edge
page seam and asserts the five hrefs with their recorded labels and the
verbatim recorded sequence:

    npx vitest run tests/card/render/navbar-getting-started-entries-oracle-pin.test.ts --no-file-parallelism

    Test Files  1 passed (1)
         Tests  1 passed (1)

## One boundary, stated so it is not mistaken for a gap

A render that starts AT `*main menu` with view `navbar_links` as the root
view of a bare `liveRenderView` call (a test-harness entry point no serving
route takes: pages reach the navbar through the layout of a page render)
drops the two name-link entries ("Configure skin", "Basic configuration").
Mechanism, traced with an instrumented run of
`src/card/render/navbar-views.ts#nestResolvedName` and
`src/card/render/format.ts#nest`: the two targets are plain link references
inside `*getting started links` (a Link list); the render prefetch's
item-closure host filter (`render.ts` `hasUnwalkedSeatedHost` /
`enrichPointerListItemsClosure`) covers pointer, list, search_type, skin and
Search hosts and not link_list, and the general closure chases nest-syntax
references only; the two names are never seated in the cache-only render card
map, `fetchRenderCard` misses, the nest machinery fabricates unknown cards,
and the anonymous render of the unknown substitution is the empty string (the
createable gate). Ruby has no prefetch and answers both fetches, which is why
the original's recorded anonymous navbar carries the labels. The two serving
routes measured (`GET /`, `GET /*main_menu?view=navbar_links` on the Node
host; the edge page seam) all prepare the layout closure and render all five,
so no serving surface measured carries the defect. Recorded here so a future
lane that adds a direct-navbar serving route knows the shape first.

## Environment note

The worktree had no `reference-harness/oracle/app/public/mod` links; the host
refuses to boot without them (`ts-server.mjs` fails closed on
`DECKO_MOD_PUBLIC_DIR`). The four junctions (`ace_editor`, `bootstrap`,
`style`, `tinymce_editor`) were created the way
`reference-harness/browser/engines/ruby-server.sh link_mods` creates them,
pointing at the vendored gemset's `card-mod-*.public` directories. The
directory is gitignored; nothing here is committed through it.
