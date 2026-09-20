-- db/seed.sql — the M2 demo seed. Apply AFTER db/schema.sqlite.sql via:
--   wrangler d1 execute decko-ts --file db/seed.sql --remote
--
-- Seeds the minimum deck so a fresh deploy shows real content at:
--   GET /              → Home card
--   GET /Hello+World   → the leaf card with db_content
--   GET /api/status    → engine metadata
--
-- IDs are hand-chosen so the simple lookup paths in the engine hit them
-- without resorting to a sequence (the production schema's id column is
-- AUTOINCREMENT; this seed uses literal ids 1..4 for clarity).

-- 1. The root card. No compound parts, no junction.
INSERT INTO cards (
  id, name, key, codename, left_id, right_id, current_revision_id,
  created_at, updated_at, creator_id, updater_id,
  read_rule_class, read_rule_id, references_expired, trash,
  type_id, db_content
) VALUES (
  1, 'Home', 'home', NULL, NULL, NULL, NULL,
  '2026-09-19 00:00:00.000', '2026-09-19 00:00:00.000',
  1, 1,
  NULL, NULL, NULL, 0,
  2, NULL
);

-- 2. A leaf card with content. Renders inside the Home card via the
-- {{Hello World}} inclusion convention (the engine walks db_content for
-- the {{name}} pattern; see src/card/render/prefetch.ts for the closure
-- walk that resolves these).
INSERT INTO cards (
  id, name, key, codename, left_id, right_id, current_revision_id,
  created_at, updated_at, creator_id, updater_id,
  read_rule_class, read_rule_id, references_expired, trash,
  type_id, db_content
) VALUES (
  2, 'Hello World', 'hello_world', NULL, NULL, NULL, NULL,
  '2026-09-19 00:00:00.000', '2026-09-19 00:00:00.000',
  1, 1,
  NULL, NULL, NULL, 0,
  2, 'Welcome to the decko-ts demo running on Cloudflare Workers. This card was seeded by db/seed.sql; the engine walks the inclusion closure in one batched round trip.'
);

-- 3. The junction row that glues Home + Hello World into a compound name.
-- (2020 Lexicon convention: compound names store NULL name/key columns and
-- ride the side ids back to the lexicon; the renderer joins on the fly.)
INSERT INTO cards (
  id, name, key, codename, left_id, right_id, current_revision_id,
  created_at, updated_at, creator_id, updater_id,
  read_rule_class, read_rule_id, references_expired, trash,
  type_id, db_content
) VALUES (
  3, NULL, NULL, NULL, 1, 2, NULL,
  '2026-09-19 00:00:00.000', '2026-09-19 00:00:00.000',
  1, 1,
  NULL, NULL, NULL, 0,
  2, NULL
);

-- 4. A second leaf for the depth-sweep smoke. Renders inside Home too.
INSERT INTO cards (
  id, name, key, codename, left_id, right_id, current_revision_id,
  created_at, updated_at, creator_id, updater_id,
  read_rule_class, read_rule_id, references_expired, trash,
  type_id, db_content
) VALUES (
  4, 'About', 'about', NULL, NULL, NULL, NULL,
  '2026-09-19 00:00:00.000', '2026-09-19 00:00:00.000',
  1, 1,
  NULL, NULL, NULL, 0,
  2, 'decko-ts: TypeScript port of the Decko card engine. {{Hello World}} is one nested inclusion away.'
);
