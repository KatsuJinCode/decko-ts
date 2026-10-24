// src/server/registered-format-route.ts - the REGISTERED-FORMAT route arm
// (row D5): the suffix rule, the per-format answer, and the
// render the arm serves.
//
// Ruby sources (decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0):
//
//   the route       decko-0.20.0/config/engine_routes.rb:22
//                     get "/:mark(.:format)" => "card#read"
//                   :24  get "/:mark/view/:view(.:format)" => "card#read"
//                   :51  get ":mark/:view(.:format)" => "card#read"
//                   The (.:format) capture rides the LAST segment of the
//                   card URL - the mark on the one-segment arm, the view on
//                   the two-segment and three-segment arms - and the format
//                   is the part after the LAST dot of that segment.
//
//   the registry    card-1.110.0/lib/card/format/registration.rb:6-9
//                     `registered << format.to_s` - the names are STRINGS,
//                   and the deck's membership test
//                   (decko-0.20.0/lib/card_controller/response.rb:107-109)
//                   compares the RAW requested format against them.
//
//   the mime types  the mod's own format classes:
//                     css_format.rb:7-9 text/css
//                     js_format.rb text/javascript
//                     scss_format.rb text/x-scss
//                     text_format.rb (the base's own) text/plain
//                     xml_format.rb text/xml
//                     yaml_format.rb text/x-yaml
//                     jsonld_format.rb application/ld+json
//                     csv_format.rb text/comma-separated-values, or
//                     text/plain when params[:disposition] == "inline"
//                   (the captured mime type for csv RAISES in the capture,
//                   because it reads the request's params).
//
//   the show default (the format's own show method, so the view the read
//   renders when the request names none):
//                     set/all/css.rb:8-11  `view ||= :content`
//                     set/all/base.rb:3-6  `view ||= :core`
//                     set/all/csv.rb:5-8   `view ||= :titled`
//
// WHAT THE ARM IS: a REGISTERED suffix on a card URL is a FORMAT, not part
// of the card's name. Before this arm the port kept every such suffix in
// the name, so "/Style.css" was the card named "Style.css" and answered
// 404 where the pinned deck answers the css format. The pinned dispatch is
// in the committed capture (fixtures/captured/format-registry-ruby-oracle.json,
// recorded by tests/server/oracle-capture-format-registry-ruby.rb): the
// registry carries THIRTEEN names, and each of them answers its OWN format
// with its own mime type.
//
// THE ARM'S SCOPE, and the two named remainders:
//
//   json and rss keep their own arms (the navbox typeahead's json view and
//   the feed surface), so they are not in the table below.
//
//   yaml and yml are NOT in the table: the pinned yaml format's own show
//   wraps the rendered view in Ruby's `to_yaml`
//   (card-mod-format-0.20.0/set/all/yaml.rb:5-7 `render!(view, args)
//   .to_yaml`), and the port has no YAML serializer, so the port's yaml
//   view (the pod hash, set/all/yaml.rb:6-8 `render_pod`) is a different
//   answer, not the same one in another shape. The suffix therefore stays
//   in the card's name, and the remainder is NAMED.
//
//   jsonld is NOT in the table either: the pinned jsonld format's own show
//   answers the unsupported-format error unless a set opts in
//   (card-mod-format-0.20.0/set/all/jsonld.rb:16-18 `jsonld_supported? ?
//   super : render_format_unsupported`), and the port does not carry the
//   jsonld support (the port's own format mod says so: "Not ported:
//   jsonld-support (no jsonld format dispatch in the engine)").
//
// So the arm answers SEVEN of the row's names: css, scss, js, text, txt,
// csv and xml.

/** The formats the arm answers. The row's names, less the three the port
 *  cannot answer yet (json and rss have their own arms; yaml, yml and
 *  jsonld are the named remainders above). */
export const REGISTERED_ROUTE_FORMAT_NAMES: readonly string[] = [
  "css",
  "scss",
  "js",
  "text",
  "txt",
  "csv",
  "xml",
];

/** What one registered format answers. */
export interface RegisteredFormatArm {
  /** The mime type the format answers (the mod's own format class). */
  readonly mimeType: string;
  /** The view the format's own show defaults to when the request names no
   *  view of its own (the format's `show` method's own default). */
  readonly defaultView: string;
  /** The port's own family renderer for this format: the csv family
   *  (src/card/render/format-families.ts, the port of set/all/csv.rb). */
  readonly family?: "csv";
}

/** The per-format answers, the pinned mime types and the pinned show
 *  defaults. The scss format inherits the css format's views (the pinned
 *  ScssFormat < CssFormat, scss_format.rb:6) and the txt name is the
 *  pinned alias of the text format (text_format.rb:8 `aliases["txt"] =
 *  "text"`), so both answer the css/text answers with their own mime
 *  type. */
export const REGISTERED_FORMAT_ARMS: Readonly<Record<string, RegisteredFormatArm>> = {
  css: { mimeType: "text/css", defaultView: "content" },
  scss: { mimeType: "text/x-scss", defaultView: "content" },
  js: { mimeType: "text/javascript", defaultView: "core" },
  text: { mimeType: "text/plain", defaultView: "core" },
  txt: { mimeType: "text/plain", defaultView: "core" },
  csv: { mimeType: "text/comma-separated-values", defaultView: "titled", family: "csv" },
  xml: { mimeType: "text/xml", defaultView: "core" },
};

/** The csv format's own mime type reads the request's params
 *  (csv_format.rb:7-11): `params[:disposition] == "inline" ? "text/plain"
 *  : "text/comma-separated-values"`. */
export function registeredFormatMimeType(format: string, disposition?: string | null): string {
  const arm = REGISTERED_FORMAT_ARMS[format];
  if (arm === undefined) return "text/html";
  if (format === "csv" && disposition === "inline") return "text/plain";
  return arm.mimeType;
}

/** Whether the arm answers this format at all. */
export function isRegisteredRouteFormat(format: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTERED_FORMAT_ARMS, format);
}

/**
 * The pinned suffix rule: the format is the part after the LAST dot of the
 * segment, and the segment's own name is what stands before it.
 *
 * Only the arm's own names are split. An unregistered suffix is NOT split
 * here: the pinned deck folds an unregistered suffix to the FILE sender
 * (decko-0.20.0/lib/card_controller/response.rb:102-105
 * `explicit_file_format?(rf) ? :file : rf.to_sym`), which is row D4's own
 * arm, and until that arm lands the suffix stays in the name.
 *
 * Returns undefined when the segment carries no arm-format suffix, so the
 * caller keeps the segment whole.
 */
export function splitRegisteredFormatSuffix(
  raw: string,
): { base: string; format: string } | undefined {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return undefined;
  const format = raw.slice(dot + 1);
  if (!isRegisteredRouteFormat(format)) return undefined;
  return { base: raw.slice(0, dot), format };
}

/** The view the arm renders when the request names none of its own: the
 *  format's own show default (the pinned `view ||= ...` in the format's
 *  set module). */
export function registeredFormatDefaultView(format: string): string {
  return REGISTERED_FORMAT_ARMS[format]?.defaultView ?? "open";
}

/** The engine the arm renders through. The hosts own their own engine
 *  shape; the arm only needs the bare view render and, for the csv
 *  family, the port's own family render. */
export interface RegisteredFormatEngine {
  /** The engine's bare view render, with the format's own name
   *  (src/card/render.ts:2553 `params.format` -> the format's dispatch). */
  render(name: string, view: string, params: { format: string; requestUrl?: string }): Promise<string>;
  /** The port's csv family (the csv format's own show). */
  renderCsvFormat?(name: string): Promise<string>;
}

/** The arm's answer: the bytes, the status and the content type. */
export interface RegisteredFormatAnswer {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

/**
 * The arm's render: the card in the named format, with the format's own
 * mime type.
 *
 * The view is the one the request names (the path's view segment on the
 * two-segment and three-segment arms, the query's view on the one-segment
 * arm), and the format's own show default when the request names none.
 */
export async function renderRegisteredFormat(
  engine: RegisteredFormatEngine,
  cardName: string,
  format: string,
  requestedView: string | undefined,
  requestUrl: string | undefined,
  disposition?: string | null,
): Promise<RegisteredFormatAnswer> {
  const arm = REGISTERED_FORMAT_ARMS[format];
  if (arm === undefined) {
    throw new Error(`no registered-format arm for ${format}`);
  }
  const view = requestedView ?? registeredFormatDefaultView(format);
  const body =
    arm.family === "csv" && engine.renderCsvFormat !== undefined
      ? await engine.renderCsvFormat(cardName)
      : await engine.render(cardName, view, {
          format,
          ...(requestUrl !== undefined ? { requestUrl } : {}),
        });
  return {
    status: 200,
    contentType: `${registeredFormatMimeType(format, disposition)}; charset=utf-8`,
    body,
  };
}
