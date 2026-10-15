-- The sign-in throttle's counters (src/card/auth/signin-security.ts).
-- One row per scope: "account:<normalized identifier>" or
-- "address:<client address>". failures counts failed sign-ins in the
-- window that began at window_started_at; locked_until, when later than
-- now, refuses sign-in for that scope without checking a password.
-- The engine also creates this table on first use, so applying this file
-- is optional; it is here so a provisioned deck carries the table from
-- the start. No Ruby counterpart.
CREATE TABLE IF NOT EXISTS auth_signin_throttle (
  scope TEXT PRIMARY KEY NOT NULL,
  failures INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);
