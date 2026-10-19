// ServerError's debugger arm (register-routes C14) — card-1.110.0
// lib/card/error.rb:46-59:
//
//     class ServerError < Error
//       def self.view
//         debugger_on? ? :debug_server_error : :server_error
//       end
//
//       def self.status_code
//         # Errors with status code 900 are displayed as modal instead of
//         # inside the "card-notice" div"
//         debugger_on? ? 900 : 500
//       end
//
//       def self.debugger_on?
//         Card::Codename[:debugger] && Card[:debugger]&.content =~ /on/
//       end
//
// BOTH the view and the status come from the SAME predicate, so a deck with
// the debugger on answers one shape and a deck without it another. The port
// carried the 500/:server_error half unconditionally —
// write-routes.ts:1076 `if (code === "server-error") return 500`,
// vm-staging-server.mjs's server_error arms, the edge's
// renderDeckoServerErrorPage — while a grep for `*debugger` over src/,
// deploy/ and the staging host found the VIEW
// (src/card/render/debug-server-error.ts) and nothing that could select it.
// The 900 arm was unreachable on every host.
//
// THE PREDICATE'S TWO READS, in Ruby's order and with Ruby's semantics:
//
//   1. `Card::Codename[:debugger]` — codename.rb:37-44. For a Symbol it is
//      `codehash[:c2i].key?(codename.to_sym) ? codename.to_sym : nil`, so
//      it is a REGISTRATION test, not a name read: the symbol back if the
//      deck registered the codename, nil if not. Nothing about the card's
//      content is consulted, and `&&` means the second read never happens
//      when this one is nil — which is what makes the predicate safe to ask
//      of a deck that predates the card.
//
//   2. `Card[:debugger]&.content` — card_class.rb:42-44 `def [] *mark;
//      fetch(*mark, skip_virtual: true); end`. The skip_virtual is load
//      bearing: a deck with the codename but no stored card answers NIL,
//      not a virtual one, so the debugger arm cannot be switched on by a
//      codename alone. The port's own `fetcher.bracket` is that method.
//
// TWO THINGS WORTH NAMING, both about what this does NOT do:
//
// 1. IT IS NOT A DEVELOPMENT MODE. The gate is a DECK CARD — no env var, no
//    request header, no Rails group. A deck whose `*debugger` card says "on"
//    is a 900 deck; editing that card flips the status of every server error
//    on every host. Nothing here reads DECKO_DEBUGGER, because Ruby reads no
//    such thing.
//
// 2. THE DEBUG VIEW RAISES IN A STOCK DECK, AND THAT IS FAITHFUL. error.rb's
//    :debug_server_error block calls `BetterErrors::ErrorPage.new`, and
//    better_errors reaches a deck only through card-mod-monkey, a
//    development-group gem. In a deck built from its generated Gemfile the
//    constant lookup raises NameError — pinned by
//    src/card/render/debug-server-error.ts, which raises the same error on
//    the same condition. So the observable 900 answer in a stock deck is a
//    correct status plus a view that raises, which is exactly what Ruby
//    does. Synthesizing a debug PAGE here instead would be the divergence,
//    not the fix.

/** The two fields `debugger_on?` decides together. They are one value in
 *  Ruby — the same predicate reads both — so they travel as one. */
export interface ServerErrorArm {
  /** ServerError.status_code — 900 or 500. */
  readonly status: 900 | 500;
  /** ServerError.view — :debug_server_error or :server_error, with Ruby's
   *  leading colon off, matching the port's view identifiers. */
  readonly view: "debug_server_error" | "server_error";
}

/** What every deck answers when the `*debugger` card is absent or off
 *  (`Card[:debugger]&.content =~ /on/` is nil/false). */
export const DEBUGGER_OFF_ARM: ServerErrorArm = { status: 500, view: "server_error" };

/** What a deck answers when `Card::Codename[:debugger]` resolves and the
 *  stored card's content matches /on/. */
export const DEBUGGER_ON_ARM: ServerErrorArm = { status: 900, view: "debug_server_error" };

/** The predicate's one engine dependency, kept to the two reads every
 *  host's engine already has, so no host needs a new seam. */
export interface DebuggerCardReader {
  /** `Card::Codename[:debugger]` — whether the deck registered the
   *  codename. The symbol-vs-nil test, nothing more. */
  hasDebuggerCodename(): boolean;
  /** `Card[:debugger]&.content` — the STORED card's db_content, undefined
   *  when the codename resolves but no stored card answers (Ruby's
   *  skip_virtual fetch). */
  debuggerCardContent(): Promise<string | undefined>;
}

/**
 * `Card::Codename[:debugger] && Card[:debugger]&.content =~ /on/`.
 *
 * The content test is a Ruby `=~` — an UNANCHORED search, so "on" at any
 * position matches ("nothing" does, "off" does not, "on, for Julian" does).
 * It is deliberately neither a truthiness test on the string nor an
 * equality test, because that is the difference between this predicate and
 * a plausible-looking reimplementation of it.
 *
 * A read that fails answers the OFF arm rather than throwing: a 500 path
 * that raises while deciding how to report its own error loses the report.
 */
export async function serverErrorArm(reader: DebuggerCardReader): Promise<ServerErrorArm> {
  if (!reader.hasDebuggerCodename()) return DEBUGGER_OFF_ARM;
  let content: string | undefined;
  try {
    content = await reader.debuggerCardContent();
  } catch {
    return DEBUGGER_OFF_ARM;
  }
  if (content === undefined || !/on/.test(content)) return DEBUGGER_OFF_ARM;
  return DEBUGGER_ON_ARM;
}