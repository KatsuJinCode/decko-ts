// Row types and table/column inventory for the CORE decko schema. The
// reference DDL is db/schema.mysql-reference.sql; db/schema.sqlite.sql is
// what this engine actually runs against. Field names, order, and
// nullability mirror the CREATE TABLE statements exactly.
//
// Conventions:
// * Field names are snake_case, matching the SQL column names. The TABLES
//   constant carries the field->column mapping seam so a divergence never
//   has to be a rename.
// * Datetimes are `string` — stored as UTC "YYYY-MM-DD HH:MM:SS[.ffffff]" TEXT
//   (see db/schema.sqlite.sql header).
// * Booleans are `0 | 1` — the storage shape SQLite hands back; the engine
//   layer maps to and from `boolean`.
// * `| null` exactly where the column is nullable (DEFAULT NULL).

/** UTC datetime stored as TEXT in ActiveRecord's form ("YYYY-MM-DD HH:MM:SS", plus ".ffffff" when the microseconds are not zero). */
export type SQLDateTime = string;

/** MySQL tinyint(1) as SQLite stores it. `null` when the column is nullable. */
export type SQLBoolean = 0 | 1;

// ---------------------------------------------------------------------------
// Row types — one per table, fields in DDL order, nullability per MySQL.
// ---------------------------------------------------------------------------

/** The central table: every card is a row. [CORE] */
export interface CardsRow {
  id: number;
  name: string | null;
  key: string | null;
  codename: string | null;
  left_id: number | null;
  right_id: number | null;
  current_revision_id: number | null;
  created_at: SQLDateTime;
  updated_at: SQLDateTime;
  creator_id: number;
  updater_id: number;
  read_rule_class: string | null;
  read_rule_id: number | null;
  references_expired: number | null;
  trash: SQLBoolean;
  type_id: number;
  db_content: string | null;
}

/** One row per save event (actor, when, from where). [CORE] */
export interface CardActsRow {
  id: number;
  card_id: number | null;
  actor_id: number | null;
  acted_at: SQLDateTime | null;
  ip_address: string | null;
}

/** One row per action (create/update/delete/draft) within an act. [CORE] */
export interface CardActionsRow {
  id: number;
  card_id: number | null;
  card_act_id: number | null;
  super_action_id: number | null;
  action_type: number | null;
  draft: SQLBoolean | null;
  comment: string | null;
}

/** Per-field after-values for an action; `field` is a FieldID code. [CORE] */
export interface CardChangesRow {
  id: number;
  card_action_id: number | null;
  field: number | null;
  value: string | null;
}

/** Inclusion/link reference graph. [CORE] */
export interface CardReferencesRow {
  id: number;
  referer_id: number;
  referee_key: string | null;
  referee_id: number | null;
  ref_type: string;
  is_present: number | null;
}

/** Legacy pre-1.14 revisions; still populated on existing databases. [CORE] */
export interface CardRevisionsRow {
  id: number;
  created_at: SQLDateTime;
  card_id: number;
  creator_id: number;
  content: string;
}

/** Materialized content cache for virtual cards. [CORE] */
export interface CardVirtualsRow {
  id: number;
  left_id: number | null;
  right_id: number | null;
  content: string | null;
  left_key: string | null;
  updated_at: SQLDateTime | null;
}

/** Background job queue (delayed_job). [ENGINE-JOBS] */
export interface DelayedJobsRow {
  id: number;
  priority: number;
  attempts: number;
  handler: string;
  last_error: string | null;
  run_at: SQLDateTime | null;
  locked_at: SQLDateTime | null;
  failed_at: SQLDateTime | null;
  locked_by: string | null;
  queue: string | null;
  created_at: SQLDateTime | null;
  updated_at: SQLDateTime | null;
}

/** Browser sessions. [RAILS-INFRA] */
export interface SessionsRow {
  id: number;
  session_id: string | null;
  data: string | null;
  updated_at: SQLDateTime | null;
}

/** Rails migration bookkeeping. No id column in production. [RAILS-INFRA] */
export interface SchemaMigrationsRow {
  version: string | null;
}

/** Rails environment metadata; primary key is `key`. [RAILS-INFRA] */
export interface ArInternalMetadataRow {
  key: string;
  value: string | null;
  created_at: SQLDateTime;
  updated_at: SQLDateTime;
}

/** Content-transform migration bookkeeping. No id column. [RAILS-INFRA] */
export interface TransformMigrationsRow {
  version: string | null;
}

/** The committed-write freshness stamp: ONE row (id = 1), bumped by the
 *  AFTER INSERT/UPDATE/DELETE triggers on cards + card_references
 *  (db/schema.sqlite.sql, the [ENGINE-FRESHNESS] block) and read ONCE per
 *  render request by the render path's freshness gate
 *  (src/card/render.ts DECK_DATA_VERSION_STATEMENT). [ENGINE-FRESHNESS] —
 *  engine-owned table, not part of the reference DDL. */
export interface DeckDataVersionRow {
  id: number;
  version: number;
}

// ---------------------------------------------------------------------------
// TABLES — the table + column inventory the schema layer and the fetch
// layer build SQL from. Field names are identical to column names today;
// the mapping seam exists so a divergence never has to be a rename.
// ---------------------------------------------------------------------------

export interface TableDef {
  /** SQL table name. */
  name: string;
  /** Field name -> SQL column name. */
  columns: Record<string, string>;
}

/**
 * Column maps are written as literal objects (not built by a helper) so the
 * `as const` preserves literal keys — that is what the type-level test at
 * the bottom of this file checks the row interfaces against.
 */
export const TABLES = {
  cards: {
    name: "cards",
    columns: {
      id: "id",
      name: "name",
      key: "key",
      codename: "codename",
      left_id: "left_id",
      right_id: "right_id",
      current_revision_id: "current_revision_id",
      created_at: "created_at",
      updated_at: "updated_at",
      creator_id: "creator_id",
      updater_id: "updater_id",
      read_rule_class: "read_rule_class",
      read_rule_id: "read_rule_id",
      references_expired: "references_expired",
      trash: "trash",
      type_id: "type_id",
      db_content: "db_content",
    },
  },
  card_acts: {
    name: "card_acts",
    columns: {
      id: "id",
      card_id: "card_id",
      actor_id: "actor_id",
      acted_at: "acted_at",
      ip_address: "ip_address",
    },
  },
  card_actions: {
    name: "card_actions",
    columns: {
      id: "id",
      card_id: "card_id",
      card_act_id: "card_act_id",
      super_action_id: "super_action_id",
      action_type: "action_type",
      draft: "draft",
      comment: "comment",
    },
  },
  card_changes: {
    name: "card_changes",
    columns: {
      id: "id",
      card_action_id: "card_action_id",
      field: "field",
      value: "value",
    },
  },
  card_references: {
    name: "card_references",
    columns: {
      id: "id",
      referer_id: "referer_id",
      referee_key: "referee_key",
      referee_id: "referee_id",
      ref_type: "ref_type",
      is_present: "is_present",
    },
  },
  card_revisions: {
    name: "card_revisions",
    columns: {
      id: "id",
      created_at: "created_at",
      card_id: "card_id",
      creator_id: "creator_id",
      content: "content",
    },
  },
  card_virtuals: {
    name: "card_virtuals",
    columns: {
      id: "id",
      left_id: "left_id",
      right_id: "right_id",
      content: "content",
      left_key: "left_key",
      updated_at: "updated_at",
    },
  },
  delayed_jobs: {
    name: "delayed_jobs",
    columns: {
      id: "id",
      priority: "priority",
      attempts: "attempts",
      handler: "handler",
      last_error: "last_error",
      run_at: "run_at",
      locked_at: "locked_at",
      failed_at: "failed_at",
      locked_by: "locked_by",
      queue: "queue",
      created_at: "created_at",
      updated_at: "updated_at",
    },
  },
  sessions: {
    name: "sessions",
    columns: {
      id: "id",
      session_id: "session_id",
      data: "data",
      updated_at: "updated_at",
    },
  },
  schema_migrations: {
    name: "schema_migrations",
    columns: { version: "version" },
  },
  ar_internal_metadata: {
    name: "ar_internal_metadata",
    columns: {
      key: "key",
      value: "value",
      created_at: "created_at",
      updated_at: "updated_at",
    },
  },
  transform_migrations: {
    name: "transform_migrations",
    columns: { version: "version" },
  },
  deck_data_version: {
    name: "deck_data_version",
    columns: { id: "id", version: "version" },
  },
} as const satisfies Record<string, TableDef>;

/** Table keys in DDL order (the order db/schema.sqlite.sql declares them). */
export const TABLE_ORDER = [
  "cards",
  "card_acts",
  "card_actions",
  "card_changes",
  "card_references",
  "card_revisions",
  "card_virtuals",
  "delayed_jobs",
  "sessions",
  "schema_migrations",
  "ar_internal_metadata",
  "transform_migrations",
  "deck_data_version",
] as const;

// ---------------------------------------------------------------------------
// Type-level test: the row interfaces and the TABLES inventory must never
// drift apart. Each assertion compiles only when the interface's keys are
// exactly the TABLES column names for that table. Runtime enforcement
// (against the parsed DDL itself) lives in tests/server/schema.test.ts.
// ---------------------------------------------------------------------------

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const _typeTest = true;
void _typeTest;
const _assertions: [
  Expect<Equal<keyof CardsRow, keyof typeof TABLES.cards.columns>>,
  Expect<Equal<keyof CardActsRow, keyof typeof TABLES.card_acts.columns>>,
  Expect<Equal<keyof CardActionsRow, keyof typeof TABLES.card_actions.columns>>,
  Expect<Equal<keyof CardChangesRow, keyof typeof TABLES.card_changes.columns>>,
  Expect<Equal<keyof CardReferencesRow, keyof typeof TABLES.card_references.columns>>,
  Expect<Equal<keyof CardRevisionsRow, keyof typeof TABLES.card_revisions.columns>>,
  Expect<Equal<keyof CardVirtualsRow, keyof typeof TABLES.card_virtuals.columns>>,
  Expect<Equal<keyof DelayedJobsRow, keyof typeof TABLES.delayed_jobs.columns>>,
  Expect<Equal<keyof SessionsRow, keyof typeof TABLES.sessions.columns>>,
  Expect<Equal<keyof SchemaMigrationsRow, keyof typeof TABLES.schema_migrations.columns>>,
  Expect<Equal<keyof ArInternalMetadataRow, keyof typeof TABLES.ar_internal_metadata.columns>>,
  Expect<Equal<keyof TransformMigrationsRow, keyof typeof TABLES.transform_migrations.columns>>,
  Expect<Equal<keyof DeckDataVersionRow, keyof typeof TABLES.deck_data_version.columns>>,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];
void _assertions;
