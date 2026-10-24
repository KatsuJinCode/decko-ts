// The port's server log.
//
// Ruby Decko writes its server-side log lines through Rails.logger - the
// card#asset method logs the symlink hint before it renders
// (decko-0.20.0/lib/card_controller/rest.rb:24). The port's hosts write
// their log lines through the runtime's console: the Cloudflare Workers
// and Bunny hosts capture console output in their deployment logs, and the
// Node host prints it to its stdout.
//
// This module is the one place the port writes a server log line, so a
// reader can find every line the port logs, and a test can watch them
// without reaching for a host's own logging setup.

/**
 * Write one server log line at Ruby's INFO level (Rails.logger.info).
 *
 * The console call is made at call time, not captured at import time, so
 * a test that watches the console sees the line.
 */
export function logInfo(message: string): void {
  console.info(message);
}
