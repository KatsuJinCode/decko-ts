// src/card/render/format-negotiation.ts - the DOOR ORDER a read's format
// is chosen by, and the pinned membership test that decides what the door
// hands over.
//
// Ruby sources (decko-0.20.0/lib/card_controller/response.rb):
//   :93-96   load_format - `request.format = :html if implicit_html?`
//            and then `card.format(response_format)`
//   :98-100  implicit_html? - `(Card::Env.ajax? && !params[:format]) ||
//            request.format.to_s == WILDCARD_ACCEPT`
//   :102-105 format_name_from_params - `explicit_file_format?(rf) ? :file :
//            rf.to_sym`
//   :107-109 explicit_file_format? - `params[:explicit_file] ||
//            !Card::Format.registered.member?(rf)`
//   :111-113 requested_format - `params[:format].present? ?
//            params[:format].to_s : request.format`
//
// and the registry it tests against (card-1.110.0/lib/card/format/
// registration.rb:6-9): `registered << format.to_s`, so the registry holds
// NAMES AS STRINGS.
//
// WHAT THE ORDER IS:
//
//   1. THE SUFFIX WINS. requested_format takes params[:format] (the
//      route's (.:format) segment, or the ?format= query) when it is
//      present, and the ACCEPT header only when it is not. A request that
//      carries both is answered by the suffix.
//   2. THE MEMBERSHIP TEST IS A STRING COMPARISON, AND THAT IS THE TRAP.
//      explicit_file_format? compares the registry against the RAW
//      requested format, BEFORE the symbolization, so the STRING "json" is
//      a member and the SYMBOL :json is not. The suffix door hands the
//      test a string (params[:format].to_s) and reaches the json format;
//      the ACCEPT door hands it whatever request.format is, and a MIME
//      type or a symbol answers the FILE sender.
//   3. THE IMPLICIT-HTML RULE. A request whose format is "*/*" (the
//      browser's own Accept header) and an ajax request with no format
//      param are both html, whatever the door order would say.
//
// The port's own read path consults this module for the format a render
// answers in, when the request carries no explicit format of its own.

/** The format names the port's own registry carries (the pinned registry's
 *  thirteen names: card-mod-format's own registered formats). The pinned
 *  registry holds them as STRINGS, which is what the membership test
 *  compares against. */
export const REGISTERED_FORMAT_NAMES: readonly string[] = [
  "css",
  "csv",
  "html",
  "js",
  "json",
  "jsonld",
  "rss",
  "scss",
  "text",
  "txt",
  "xml",
  "yaml",
  "yml",
];

/** The wildcard Accept pattern: the browser's own default, and the one
 *  value the pinned implicit_html? rule answers for (response.rb:99
 *  compares request.format.to_s against it). */
export const WILDCARD_ACCEPT = "*/*";

/** What a read's format negotiation resolved to. */
export interface ReadFormatNegotiation {
  /** The format the read answers in: a registered format's name, or
   *  "file" for the pinned file sender (the answer the pinned deck gives
   *  when the membership test fails). */
  readonly formatName: string;
  /** Which door answered. */
  readonly source: "params" | "accept" | "implicit-html";
  /** The pinned implicit_html? answer: true when the request is html
   *  whatever the door order would say. */
  readonly implicitHtml: boolean;
  /** The RAW requested format, before the membership test: a string from
   *  the params door, whatever the Accept door holds otherwise. */
  readonly requestedFormat: string;
}

/** The request's own format parameters, as the pinned controller reads
 *  them. */
export interface ReadFormatRequest {
  /** params[:format]: the route's (.:format) segment or the ?format=
   *  query. Absent means absent, and the ACCEPT door answers then. */
  readonly paramsFormat?: string | null;
  /** The request's Accept header, as the raw value: a format NAME ("json")
   *  is a member of the registry, a MIME type ("application/json") is not,
   *  and neither is a symbol. */
  readonly accept?: string | null;
  /** Card::Env.ajax? - the ajax half of the implicit-html rule. */
  readonly isAjax?: boolean;
  /** params[:explicit_file] - the pinned explicit-file switch: when it is
   *  present, the answer is the file sender whatever the door says. */
  readonly explicitFile?: boolean;
}

/**
 * The pinned membership test (response.rb:107-109): the registry holds
 * names as STRINGS, so a string name is a member and a symbol is not.
 */
export function registeredFormatMember(requestedFormat: string): boolean {
  return REGISTERED_FORMAT_NAMES.includes(requestedFormat);
}

/**
 * The pinned implicit_html? (response.rb:98-100): an ajax request with no
 * format param, or a request whose format is the wildcard Accept pattern, is html.
 */
export function implicitHtml(request: ReadFormatRequest, requestedFormat: string): boolean {
  const ajaxWithoutFormat = request.isAjax === true && !request.paramsFormat;
  return ajaxWithoutFormat || requestedFormat === WILDCARD_ACCEPT;
}

/**
 * The door order (response.rb:102-113), over one read.
 *
 * The suffix wins; the Accept door answers only when there is no suffix;
 * the membership test decides whether the answer is a registered format or
 * the file sender; and the implicit-html rule answers html for the
 * wildcard and for an ajax request with no format param.
 */
export function negotiateReadFormat(request: ReadFormatRequest): ReadFormatNegotiation {
  const paramsFormat = request.paramsFormat ?? null;
  // requested_format: `params[:format].present? ? params[:format].to_s :
  // request.format`. A blank params[:format] is not present, so the
  // Accept door answers.
  const fromParams = paramsFormat !== null && paramsFormat !== "";
  const requestedFormat = fromParams
    ? paramsFormat
    : (request.accept ?? "");
  const implicit = implicitHtml(request, requestedFormat);
  if (implicit) {
    // load_format writes request.format = :html and then asks the card for
    // the format the door order names. The membership test then reads the
    // SYMBOL it wrote, and a symbol is not a member of a registry that
    // holds strings, so the pinned capture measured this arm asking the
    // card for the FILE format. That is the pinned answer, and the port
    // keeps it: the file sender is the port's row D4's arm, and this
    // module's caller decides what to do with it.
    return {
      formatName: "file",
      source: "implicit-html",
      implicitHtml: true,
      requestedFormat,
    };
  }
  // explicit_file_format?: params[:explicit_file] || !registered.member?(rf)
  const isFile = request.explicitFile === true || !registeredFormatMember(requestedFormat);
  const formatName = isFile ? "file" : requestedFormat;
  return {
    formatName,
    source: fromParams ? "params" : "accept",
    implicitHtml: false,
    requestedFormat,
  };
}

/**
 * The format a render answers in when the request names none of its own
 * and carries an Accept header (register-routes D2).
 *
 * The pinned door order (decko-0.20.0/lib/card_controller/response.rb:
 * 102-113) takes params[:format] when it is present and the Accept header
 * when it is not, and the membership test (response.rb:107-109) then
 * decides between a registered format and the FILE sender. The registry
 * holds names as STRINGS, so the Accept door reaches a registered format
 * only when the header carries the format's NAME.
 *
 * THE FILE ANSWER IS ROW D4's ARM. The port has no file sender, so the
 * "file" answer keeps the format the render would have had, and the
 * divergence is named rather than papered over.
 */
export function negotiatedFormatName(
  accept: string | undefined,
): { formatName: string } | Record<string, never> {
  if (accept === undefined) return {};
  const negotiated = negotiateReadFormat({ accept });
  if (negotiated.formatName === "file") return {};
  return { formatName: negotiated.formatName };
}
