-- ============================================================================
-- 0013-nest-index-meta.sql — the stored nest index's build marker
-- ============================================================================
--
-- Host infrastructure, not a Decko table. The stored nest index (the
-- card_references 'I' rows the cold render's prelude walks) is built from the
-- deck's content by src/card/nest-index.ts. This migration creates the marker
-- table that records which build of that index the deck holds. It does not
-- build the index: a SQL migration cannot run the content parser, so the
-- build is the one-shot step tools/deploy/build-nest-index.mjs, run after the
-- migrations by the deploy chain. Until that step has run, the marker is
-- missing and the deck serves by walking its nest closure (the same bytes,
-- more round trips); the edge boot says so in its log and never builds inside
-- a request.
--
-- Columns are meta_key / meta_value. The same statement runs on MySQL and
-- PostgreSQL through the engine's dialect translation.

CREATE TABLE IF NOT EXISTS "nest_index_meta" (
  "meta_key"   TEXT NOT NULL PRIMARY KEY,
  "meta_value" TEXT NOT NULL
);
