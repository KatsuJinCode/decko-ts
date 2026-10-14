-- ============================================================================
-- schema.mysql-reference.sql
--
-- VERBATIM extraction of the CREATE TABLE statements from the mysqldump of
-- the deck this schema was converted from: a private production dump (not
-- distributed)
-- (mysqldump 10.13, MySQL 8.0.39 dump of server 8.0.45, 1.2 GB)
--
-- This file is the COMPARISON REFERENCE for db/schema.sqlite.sql. It is not
-- executable here; it records the production truth that the SQLite DDL was
-- hand-converted from. Every CREATE TABLE block below is copied byte for
-- byte from the dump (the dump's per-table preamble lines -- the
-- `/*!40101 SET @saved_cs_client ... */` plumbing immediately before each
-- CREATE TABLE -- are omitted as dump plumbing, not schema; everything from
-- `CREATE TABLE` through the closing `) ENGINE=...;` line is untouched).
-- The `-- Source: dump lines NNNN-MMMM` comment on each block makes any
-- block re-derivable with the sed recipe (not included in this tree).
--
-- TABLE CLASSIFICATION (cross-checked against the installed gems
-- card-1.110.0 core migrations in mod/core/data/schema/ and decko-0.20.0;
-- the full audit is not included in this tree):
--   [CORE]        card-engine data model (cards + history + references)
--   [ENGINE-JOBS] delayed_jobs — created by a core engine migration
--                 (mod/core/data/schema/20170908114442_create_delayed_jobs.rb);
--                 consumed by card-mod-delayed_job
--   [RAILS-INFRA] sessions (ActiveRecord::SessionStore), schema_migrations,
--                 ar_internal_metadata (Rails), transform_migrations (decko
--                 Cardio::Migration::Transform bookkeeping)
-- The production dump contains NO site-custom tables and NO mod-created
-- tables: a scan of all 33 installed card-mod-0.20.0 gems found zero
-- create_table/add_column schema migrations. The `users` table seen in the
-- card gem's stale site dump (card-1.110.0/db/schema.rb) was dropped from
-- production by the 2014 user-data-to-cards transform migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [RAILS-INFRA] ar_internal_metadata
-- Source: dump lines 25-31
-- ----------------------------------------------------------------------------
CREATE TABLE `ar_internal_metadata` (
  `key` varchar(255) NOT NULL,
  `value` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- ----------------------------------------------------------------------------
-- [CORE] card_actions
-- One row per recorded action on a card (create/update/delete/draft).
-- Source: dump lines 51-62
-- ----------------------------------------------------------------------------
CREATE TABLE `card_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `card_id` int DEFAULT NULL,
  `card_act_id` int DEFAULT NULL,
  `super_action_id` int DEFAULT NULL,
  `action_type` int DEFAULT NULL,
  `draft` tinyint(1) DEFAULT NULL,
  `comment` text,
  PRIMARY KEY (`id`),
  KEY `card_actions_card_act_id_index` (`card_act_id`),
  KEY `card_actions_card_id_index` (`card_id`)
) ENGINE=InnoDB AUTO_INCREMENT=461871 DEFAULT CHARSET=utf8mb3;

-- ----------------------------------------------------------------------------
-- [CORE] card_acts
-- One row per edit "act" (a save event), grouping the actions it produced.
-- Source: dump lines 87-97
-- ----------------------------------------------------------------------------
CREATE TABLE `card_acts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `card_id` int DEFAULT NULL,
  `actor_id` int DEFAULT NULL,
  `acted_at` datetime DEFAULT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `card_acts_actor_id_index` (`actor_id`),
  KEY `card_acts_card_id_index` (`card_id`),
  KEY `acts_acted_at_index` (`acted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=351482 DEFAULT CHARSET=utf8mb3;

-- ----------------------------------------------------------------------------
-- [CORE] card_changes
-- Per-field value changes belonging to a card_action. `field` is a
-- FieldID code (1=name, 2=content, 3=type_id, ... per the card gem),
-- `value` is the after-value.
-- Source: dump lines 127-134
-- ----------------------------------------------------------------------------
CREATE TABLE `card_changes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `card_action_id` int DEFAULT NULL,
  `field` int DEFAULT NULL,
  `value` mediumtext,
  PRIMARY KEY (`id`),
  KEY `card_changes_card_action_id_index` (`card_action_id`)
) ENGINE=InnoDB AUTO_INCREMENT=278789 DEFAULT CHARSET=utf8mb3;

-- ----------------------------------------------------------------------------
-- [CORE] card_references
-- Inclusion/link reference graph between cards.
-- Source: dump lines 1031-1043
-- ----------------------------------------------------------------------------
CREATE TABLE `card_references` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referer_id` int NOT NULL DEFAULT '0',
  `referee_key` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT '',
  `referee_id` int DEFAULT NULL,
  `ref_type` varchar(1) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT '',
  `is_present` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `card_references_referee_id_index` (`referee_id`),
  KEY `card_references_referee_key_index` (`referee_key`),
  KEY `card_references_referer_id_index` (`referer_id`),
  KEY `card_references_ref_type_index` (`ref_type`)
) ENGINE=InnoDB AUTO_INCREMENT=6302836 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- [CORE] card_revisions
-- Legacy pre-1.14 revision storage. Superseded by card_acts/actions/changes
-- but still populated in production (89,592 ids allocated); the engine keeps
-- reading paths for it, so the port must carry the table.
-- Source: dump lines 1090-1099
-- ----------------------------------------------------------------------------
CREATE TABLE `card_revisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `card_id` int NOT NULL,
  `creator_id` int NOT NULL,
  `content` text CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `revisions_card_id_index` (`card_id`),
  KEY `revisions_created_by_index` (`creator_id`)
) ENGINE=InnoDB AUTO_INCREMENT=89593 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- [CORE] card_virtuals
-- Materialized content cache for virtual cards.
-- NOTE the deliberately swapped index names (left_id_index is on right_id
-- and vice versa) — that is production truth, from core migration
-- 20200805200729_add_unique_pair_indices; preserved verbatim everywhere.
-- Source: dump lines 1166-1177
-- ----------------------------------------------------------------------------
CREATE TABLE `card_virtuals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `left_id` int DEFAULT NULL,
  `right_id` int DEFAULT NULL,
  `content` mediumtext,
  `left_key` varchar(255) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `index_card_virtuals_on_left_id_and_right_id` (`left_id`,`right_id`),
  KEY `left_id_index` (`right_id`),
  KEY `right_id_index` (`left_id`)
) ENGINE=InnoDB AUTO_INCREMENT=345 DEFAULT CHARSET=utf8mb3;

-- ----------------------------------------------------------------------------
-- [CORE] cards
-- The central table: every card (real, virtual parent, type, role) is a row.
-- Source: dump lines 1202-1232
-- ----------------------------------------------------------------------------
CREATE TABLE `cards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `key` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `codename` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `left_id` int DEFAULT NULL,
  `right_id` int DEFAULT NULL,
  `current_revision_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `creator_id` int NOT NULL,
  `updater_id` int NOT NULL,
  `read_rule_class` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `read_rule_id` int DEFAULT NULL,
  `references_expired` int DEFAULT NULL,
  `trash` tinyint(1) NOT NULL,
  `type_id` int NOT NULL,
  `db_content` mediumtext CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cards_key_index` (`key`),
  UNIQUE KEY `index_cards_on_left_id_and_right_id` (`left_id`,`right_id`),
  UNIQUE KEY `cards_codename_index` (`codename`),
  KEY `cards_name_index` (`name`),
  KEY `cards_type_id_index` (`type_id`),
  KEY `cards_left_id_index` (`left_id`),
  KEY `cards_right_id_index` (`right_id`),
  KEY `cards_read_rule_id_index` (`read_rule_id`),
  KEY `cards_created_at_index` (`created_at`),
  KEY `cards_updated_at_index` (`updated_at`),
  KEY `cards_trash_index` (`trash`)
) ENGINE=InnoDB AUTO_INCREMENT=53070 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- [ENGINE-JOBS] delayed_jobs
-- Background job queue (delayed_job). Created by core engine migration
-- 20170908114442; the delayed_job *integration* is card-mod-delayed_job.
-- Only table with a bigint id.
-- Source: dump lines 1403-1418
-- ----------------------------------------------------------------------------
CREATE TABLE `delayed_jobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `priority` int NOT NULL DEFAULT '0',
  `attempts` int NOT NULL DEFAULT '0',
  `handler` mediumtext NOT NULL,
  `last_error` text,
  `run_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL,
  `locked_by` varchar(255) DEFAULT NULL,
  `queue` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delayed_jobs_priority` (`priority`,`run_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5277 DEFAULT CHARSET=utf8mb3;

-- ----------------------------------------------------------------------------
-- [RAILS-INFRA] schema_migrations
-- Rails schema-migration bookkeeping. No id column; uniqueness on version.
-- Source: dump lines 1443-1446
-- ----------------------------------------------------------------------------
CREATE TABLE `schema_migrations` (
  `version` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  UNIQUE KEY `unique_schema_migrations` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- [RAILS-INFRA] sessions
-- ActiveRecord::SessionStore cookie-alternative sessions. Part of the
-- deployed decko base schema (no mod creates it); kept in the core DDL.
-- Source: dump lines 1466-1473
-- ----------------------------------------------------------------------------
CREATE TABLE `sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `data` text CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_session_id_index` (`session_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2150503 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- [RAILS-INFRA] transform_migrations
-- decko Cardio::Migration::Transform bookkeeping (tracks which *data
-- transform* migrations ran; see card gem lib/cardio/migration/transform.rb).
-- No id column; uniqueness on version.
-- Source: dump lines 1531-1534
-- ----------------------------------------------------------------------------
CREATE TABLE `transform_migrations` (
  `version` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  UNIQUE KEY `unique_schema_migrations_cards` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- ============================================================================
-- NOTES ON WHAT IS *NOT* HERE
-- - No FOREIGN KEY constraints are declared anywhere in the production
--   schema. All relationships (card_id -> cards.id etc.) are enforced at
--   the application layer, standard for this codebase's ActiveRecord era.
-- - No FULLTEXT or SPATIAL indexes exist in the core schema.
-- - No site-custom ("deck") tables and no mod-created tables exist in the
--   reference deck production dump. Extension points observed elsewhere:
--   card-mod-delayed_job consumes delayed_jobs; the Rails session store
--   consumes sessions; the card gem's stale site dump additionally showed
--   a legacy `users` table (dropped in production by the 2014
--   user-data-to-cards transform), plus tables belonging to a different
--   (dev) database rather than to the source dump.
-- ============================================================================
