# Round 9 spec: apply type+\*structure templates when composing card-page bodies

Date: 2026-09-26
Evidence: the 12-page live-wire sweep + the site-wide generalization round
(gate receipts in tmp/diff-norm.mjs output; per-page deltas below).
Gated on: round 8 releasing src/** (lanes were running when this was written).

## The gap

Pages whose bodies are composed by a `type+*structure` rule template render only
a fraction of their children in the decko-ts engine. Ruby's
`applyStructureContent` (structure.rb) takes the template (e.g. the
`Person+*type+*structure` rule, corpus card id 416: `{{+image}}{{+bio}}…{{+how to
contact me}}…`), resolves each `{{+child}}` nest against the INSTANCE card, and
renders every child. Our engine only renders children when the parent's literal
`db_content` carries the nest tokens — the template's tokens are not applied
per-instance.

## Measured per-page deltas (served vs live wire bytes, normalized)

| Page | live | served | missing children (from the live capture) |
|---|---:|---:|---|
| Brandon_WilliamsCraig | 107,294 | 14,989 | +bio, +Description (+its children incl. the collage image), +Musings (7 items), +Pages (6 items), +Core Projects, +Project(s) Organizing/Participating, +video — 2 of 7+ children render |
| Wikirate | 44,461 | 14,587 | +Document, +related, +Organizer(s), +Supporter(s), +Core/Related/Potential Projects, +File uploads — only +image +Description render |
| Conflict_Done_Well | 43,644 | 17,306 | +page, +discussion, project-relationship bars — only +image/+overview/+management render |
| Aikido_Oak_Cliff | 34,714 | 11,778 | ~10 of 12 children missing |
| What_Do_We_Need_To_Know | 31,178 | 12,068 | +discussion open-view nest missing |
| blog / Latest_News | 79,846 / 79,343 | 68,113 / 68,047 | 9/9 news items RENDER (search bridge works); missing +image, +related family, +discussion |

Total normalized shortfall: ~209,625 bytes across the 12 sampled pages.

## The fix (engine, round 9)

In `src/card/render/format.ts` `applyStructureContent` (and the prepare-phase
structure walk it feeds):

1. When a card has a `type+*structure` (or more specific `+*structure`) rule,
   compose the render body from the TEMPLATE's content with each `{{+child}}`
   nest resolved against the instance card — exactly Ruby's
   `Card::Structure#apply_structure` path. The engine's structure-rule universe
   loading already exists (parseStructureContents, render.ts:688-700); the
   per-instance application to the rendered body is the missing half.
2. Children that do not exist as rows render as the virtual/empty shape Ruby
   produces (verified against the live bytes: absent children render as empty
   slots, not denials, for public-read cards).
3. The origin bridge (matchContentViewShape family in vm-staging-server.mjs)
   stays as-is until this lands; then re-run the 12-page normalized diff and
   retire bridge pieces per page as the engine matches.

## Verification

12-page normalized diff (tmp/live-wire/ vs served, tmp/diff-norm.mjs): every
page's delta should drop from the ~19-92KB range to head/footer-only residue.
The corpus exam is unaffected directly (card-view comparisons), but the
structure walk feeds set/structure rule families too — run the full 48-shard
raw verifier; pass.total must not regress below 6,998 and should rise.
