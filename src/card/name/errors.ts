/**
 * Error types raised by the name layer.
 *
 * Ruby counterparts (card-1.110.0 lib/card/name.rb#bad_mark and
 * #unsupported_class!):
 *   - Card::Error::NotFound          -> NameNotFoundError
 *   - Card::Error::CodenameNotFound  -> CodenameNotFoundError
 *   - ArgumentError                  -> UnsupportedIdentifierError
 */

export class NameNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NameNotFoundError";
  }
}

export class CodenameNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodenameNotFoundError";
  }
}

export class UnsupportedIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedIdentifierError";
  }
}
