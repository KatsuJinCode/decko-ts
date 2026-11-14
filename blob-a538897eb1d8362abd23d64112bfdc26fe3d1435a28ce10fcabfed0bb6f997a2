// CodeRay token kind -> CSS class table.
//
// Truth source: coderay-1.1.3 lib/coderay/token_kinds.rb, transcribed
// entry for entry. The table answers one question for the HTML encoder
// (encoders/html.rb:236 `css_class_for_kinds`): given the kind (or the
// FIRST kind of a kind PATH), what CSS class does the theme style?
//
// The entries whose value is `false` are the load-bearing ones. `false`
// is not "unknown" and not "unstyled" - it makes make_span_for_kinds
// return nil, and a nil span means:
//
//   text_token:  `if style then '<span...>text</span>' else out << text`
//                -> the token is emitted with NO WRAPPER AT ALL
//   begin_group: `@out << (span || '<span>')`
//                -> a bare <span> with no style attribute
//
// So `=` between an attribute name and its value (:operator), the
// whitespace inside a tag (:space) and the text between tags (:plain) all
// print unadorned, and a bare `<span>` appears only for a group the theme
// leaves unstyled.

/** The class name a kind styles as, or `false` for a kind with no span of
 *  its own. */
export type TokenKindClass = string | false;

/** token_kinds.rb's literal table. */
export const TOKEN_KINDS: Readonly<Record<string, TokenKindClass>> = Object.freeze({
  debug: "debug",

  annotation: "annotation",
  attribute_name: "attribute-name",
  attribute_value: "attribute-value",
  binary: "binary",
  char: "char",
  class: "class",
  class_variable: "class-variable",
  color: "color",
  comment: "comment",
  constant: "constant",
  content: "content",
  decorator: "decorator",
  definition: "definition",
  delimiter: "delimiter",
  directive: "directive",
  doctype: "doctype",
  docstring: "docstring",
  done: "done",
  entity: "entity",
  error: "error",
  escape: "escape",
  exception: "exception",
  filename: "filename",
  float: "float",
  function: "function",
  global_variable: "global-variable",
  hex: "hex",
  id: "id",
  imaginary: "imaginary",
  important: "important",
  include: "include",
  inline: "inline",
  inline_delimiter: "inline-delimiter",
  instance_variable: "instance-variable",
  integer: "integer",
  key: "key",
  keyword: "keyword",
  label: "label",
  local_variable: "local-variable",
  map: "map",
  modifier: "modifier",
  namespace: "namespace",
  octal: "octal",
  predefined: "predefined",
  predefined_constant: "predefined-constant",
  predefined_type: "predefined-type",
  preprocessor: "preprocessor",
  pseudo_class: "pseudo-class",
  regexp: "regexp",
  reserved: "reserved",
  shell: "shell",
  string: "string",
  symbol: "symbol",
  tag: "tag",
  type: "type",
  value: "value",
  variable: "variable",

  change: "change",
  delete: "delete",
  head: "head",
  insert: "insert",
  eyecatcher: "eyecatcher",

  // "almost all scanners" - no class, so no span.
  ident: false,
  // The theme does carry a bare `.operator { }` rule, but the KIND maps to
  // false first (token_kinds.rb:82), so that rule is unreachable from the
  // encoder and `=` in a tag prints bare.
  operator: false,

  space: false,
  plain: false,

  // token_kinds.rb's two trailing aliases.
  method: "function", // TokenKinds[:method] = TokenKinds[:function]
  unknown: false, // TokenKinds[:unknown] = TokenKinds[:plain]
});

/** The single lookup the encoder makes. token_kinds.rb's `TokenKinds` is
 *  a `Hash.new(false)`, so an unregistered kind reads exactly like a
 *  registered-but-unstyled one: false, and therefore no wrapper. */
export function tokenKindClass(kind: string): TokenKindClass {
  const value = TOKEN_KINDS[kind];
  return value === undefined ? false : value;
}
