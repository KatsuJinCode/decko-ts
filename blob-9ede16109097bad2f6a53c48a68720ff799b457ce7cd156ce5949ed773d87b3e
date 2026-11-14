-- ============================================================================
-- schema.mysql-card-gem.sql
--
-- Ruby Decko tables that card-1.110.0 creates (db/schema.rb) and that the
-- production MySQL reference (schema.mysql-reference.sql) does not carry.
-- Column types follow ActiveRecord's MySQL adapter for each declaration in
-- schema.rb: string -> varchar (limit honoured; an unlimited string is
-- varchar(255)), integer -> int, datetime -> datetime.
--
-- Loaded after the reference DDL. Used by reference-harness/adapters/ts-mysql
-- and by tests/server/drivers/mysql-ruby-schema.test.ts.
-- ============================================================================

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `login` varchar(40) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `crypted_password` varchar(40) DEFAULT NULL,
  `salt` varchar(42) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `password_reset_code` varchar(40) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'request',
  `invite_sender_id` int DEFAULT NULL,
  `identity_url` varchar(255) DEFAULT NULL,
  `card_id` int NOT NULL,
  `account_id` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
