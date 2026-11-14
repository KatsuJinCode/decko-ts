// Set modules that Ruby mixes into ANOTHER CONCRETE set module's format
// module. The generated SET_INCLUDE_GRAPH (set-include-graph.ts) records only
// abstract includes; these are the concrete ones the gems declare, kept by
// hand with their source lines. SET_INCLUDES merges both, and is what the
// chain walker and the flat-view scope read.
//
//   card-mod-layout set/type/layout_type.rb:5           include_set Type::Html
//   card-mod-carrierwave set/type/image/html_views.rb:2  include File::HtmlFormat
//
// Not listed: card-mod-rules set/type/set.rb (include_set Type::SearchType)
// and card-mod-search set/type/search_type.rb (include_set Type::Json). The
// generated graph already carries SearchType's abstract includes on
// Type::Set, and neither Type::SearchType nor Type::Json registers a view in
// the port.

import { SET_INCLUDE_GRAPH, type SetIncludes } from "./set-include-graph.js";

export const CONCRETE_SET_INCLUDES: Readonly<Record<string, SetIncludes>> = {
  "Type::LayoutType": { html: ["Type::Html"], base: ["Type::Html"] },
  "Type::Image::HtmlViews": { html: ["Type::File"] },
};

function mergeIncludes(
  a: Readonly<Record<string, SetIncludes>>,
  b: Readonly<Record<string, SetIncludes>>,
): Record<string, SetIncludes> {
  const out: Record<string, SetIncludes> = { ...a };
  for (const [owner, inc] of Object.entries(b)) {
    const prev = out[owner];
    out[owner] = {
      ...(prev?.html !== undefined || inc.html !== undefined ? { html: [...(inc.html ?? []), ...(prev?.html ?? [])] } : {}),
      ...(prev?.base !== undefined || inc.base !== undefined ? { base: [...(inc.base ?? []), ...(prev?.base ?? [])] } : {}),
    };
  }
  return out;
}

/** Every include Ruby performs between set modules, abstract and concrete. */
export const SET_INCLUDES: Readonly<Record<string, SetIncludes>> = mergeIncludes(
  SET_INCLUDE_GRAPH,
  CONCRETE_SET_INCLUDES,
);
