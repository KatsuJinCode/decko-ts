# Design pass: the four front doors, reworked (2026-10-26)

The operator judged the first four renders correct but bare bones and handed
eight notes. This pass applies them to the same four real decko skins in the
demo deck (127.0.0.1:3118, the registered dev instance), iterating the
existing cards in place through the engine's own write path. Nothing was
published, nothing deploys, and the shared Home card stayed byte-identical
(checked by both builders). culturesmith.com was never contacted.

## Renders (this folder)

Per direction: one full-page capture at a 1440x900 viewport and one
motion-state capture (every CSS entrance animation frozen at 550 ms via the
Web Animations API, so the still shows the motion deterministically):

- library-first-1440x900-fullpage.png, library-first-motion-state.png
- editorial-1440x900-fullpage.png, editorial-motion-state.png
- product-grid-1440x900-fullpage.png, product-grid-motion-state.png
- three-doors-1440x900-fullpage.png, three-doors-motion-state.png

dark-check/ holds viewport captures of all four pages under Chromium's forced
dark mode (the reading condition the design rules require verifying,
brandonDojoTech docs/plans/writing-for-brandon.md rule 2): all four keep their
contrast when the browser inverts them.

Receipts: directions-a-build-receipt.json (10 of 10 checks),
directions-b-build-receipt.json (17 of 17), render-receipt.json,
dark-check/dark-check-receipt.json. asset-picks/ holds the frame-selection
probes (nine poster fetches used to choose the thumbnails; regenerable from
the media map, not committed).

Rebuild and re-render:
`node scripts/frontdoor-directions/build-frontdoor-directions-a.mjs`,
`node scripts/frontdoor-directions-b/build-directions-b.mjs`,
`node scripts/frontdoor-design-pass/render-design-pass.mjs`,
`node scripts/frontdoor-design-pass/check-forced-dark.mjs`.

## What changed per direction

### Library-first (/Culturesmith%2BFront%20Door%20Library)

- Hero line replaced with value framing, per note 2: "Years of knowledge,
  one click away." set in large serif type over the featured class's poster,
  with a slow 24-second drift on the background and a darker veil.
- Note 1 applied: the April 21, 2026 class poster (a shot of Eric) is off
  the wall. The builder pins the recording id, the served page is checked
  for its absence, and the page's own provenance line says the poster is
  held back. Eighteen posters remain; the corpus line still says 19
  recorded classes because that is the library's count.
- Every wall card carries a small play badge (top right), and the wall
  enters with a staggered fade-up; the quiet row gained three small line
  icons; a hairline gold rule with a diamond ornament separates hero from
  wall.

### Editorial (/Culturesmith%2BFront%20Door%20Editorial)

- Note 4 applied: each of the four contents entries carries a small square
  thumbnail (108 px, sepia-toned, color on hover), a real frame from the
  recorded classes per entry, listed under Imagery below.
- Two of Brandon's recorded lines set as quoted blocks with session
  citations (see Words below): the victory condition as an epigraph under
  the cover statement, the leadership bar as a pull quote between entries
  02 and 03.
- A fleuron ornament under the masthead's double rule, rules that draw in,
  entries that stagger in, all disabled under prefers-reduced-motion.

### Product grid (/Culturesmith%2BProduct%20Grid%20Door)

- Note 5 applied: a real photograph now opens every tile (16:10, zoom on
  hover), replacing the icon-only tiles.
- Two tiles carry one of Brandon's recorded lines as an italic caption with
  its session citation: the training tile carries his words about what
  organization administrators need to see, the Guardians tile his words for
  the citizen the standard forms.
- Equal-height tiles (the deck's nest wrapper is flexed so the grid
  stretches), buttons aligned at the tile bottoms, a diamond ornament under
  the headline, staggered tile entrance.

### Three doors (/Culturesmith%2BThree%20Doors)

- Note 6 applied: an image per door, each showing the place the door opens:
  the guest door a class in the dojo, the member door the deck's own album
  photo of a workshop circle, the student door a frame from the recorded
  classes.
- Brandon's recorded line about what the front page asks set as the quoted
  subline under the hero, cited to the session.
- Doors enter with a stagger, images zoom gently on hover, the three links
  align on one baseline.

## Words: which words came from which session

The words law (note 3): words set in type are Brandon's own recorded words
from the working sessions of 2026-10-16 and 2026-10-20, cited to the
session. In the cards each quotation carries the line "Brandon, working
session" and the date. No family name appears in any card, per the guards.

Set in type this pass, with sources:

- "All of business and life is a sea of conflict. Most organizations
  improvise. We give them a jumpstart." (editorial cover, grid headline).
  Session: 2026-10-16 working session. Source: brandonDojoTech
  docs/plans/writing-for-brandon.md rule 4.
- "everybody gets what they need and a shot at what they want." (editorial
  epigraph). Session: 2026-10-20 working session, 11:15. Source:
  brandonDojoTech
  docs/reports/meeting-summary-and-action-items-2026-10-20-1115.md point 12.
- "If you can't do conflict well, you're not qualified for a leadership
  position." (editorial pull quote). Same session and record, point 12.
- "They need a video of seeing the people that look exactly like them and
  their people doing the thing that we're doing, and smiling." (grid
  training tile). Same session and record, point 8, contiguous span.
- "the only thing the front page asks is which one you came for." (three
  doors subline). Same session and record, point 1, contiguous span.
- "a well-informed, thoughtful, subtle, honest citizen." (grid Guardians
  tile). Same session and record, point 12.

The one line not his: the library hero "Years of knowledge, one click
away." No recorded Brandon words exist for that slot, and note 2 directed
value framing there, offering "years of knowledge, one click away" as the
operator's own spitball; the line applies it nearly verbatim. The other
standing lines (entry descriptions, tile pitches, the door sentences) carry
over from the first renders unchanged; each page's provenance line says the
page is a machine-assisted design proposal prepared for review, and the
editorial note states in plain words that quoted lines are Brandon's
recorded words from the two sessions.

## Imagery: what is real, what is not

- Class poster frames come from the recordings' own video store on the
  Bunny pull zone, which answers this page's referrer (19 of 19 probed
  2026-10-26 by the first pass; nine posters re-probed with 200s this
  pass). The small speaker-name overlay visible at some frames' lower left
  is burned into the recordings themselves.
- The workshop-circle photo (member door) is the deck's own album photo,
  the same photograph the live Home page shows (matched against the audit
  render reference-live-home-signed-in.png in brandonDojoTech). It is
  embedded as a data URL because the local deck copy holds no image
  attachments (its /files routes answer 404); 41 KB.
- No placeholder imagery was needed: every image slot carries a real asset
  from the library mappings or the deck. Every image alt text describes the
  scene without names.

## Mechanics worth knowing

- The A-lane door cards were stored as RichText by the first pass, and the
  engine's RichText sanitizer strips every inline svg element on save
  (found this pass: the fleuron and the wall's play badges silently
  vanished from the served pages). The doors are now written as HTML type,
  the same pattern builder B uses, and the builders check svg survival on
  the served page so the failure cannot return silently.
- All entrance animations are CSS only and disabled under
  prefers-reduced-motion; the render harness freezes them at 550 ms for the
  motion-state shots.

Machine-assisted, prepared for review. Local renders only; nothing here
publishes or deploys anything.
