// follow/follow-form-shapes.ts — the Rails form/tag emitters the follow and
// account view bodies compose, byte-shaped from the sources:
//
//   card_form            card-mod-edit-0.20.0 set/all/form.rb:193-224
//                        (hidden success tags + form_for(url: path(action),
//                        html: {class: "card-form"[+" slotter"][+" autosave"
//                        on :update]}, remote: true))
//   the <form> bytes     card-mod-edit.ts's CAPTURED edit-form opener (the
//                        the edit views' oracle bytes): action, accept-charset,
//                        data-remote, method, the utf8 check + the _method
//                        patch spoof
//   hidden_field_tag     actionview-7.2.3.2 form_tag_helper.rb:264 defaults
//                        {type,name,id,value} + the .update append
//                        (autocomplete LAST) — same shape card-mod-edit.ts
//                        and card-mod-permissions.ts emit
//   check_box_tag        form_tag_helper.rb:455-460 (the permissions mod's
//                        port: type, name, id=sanitize_to_id(name), value,
//                        extras, checked LAST)
//   button_tag           form_tag_helper.rb button_tag:
//                        content_tag(:button, name, {"type"=>:submit,
//                        "name"=>nil}.update(options)) — bootstrap's
//                        bootstrapify_button (card-mod-bootstrap set/all/
//                        bootstrap/form.rb:33-36) appends
//                        [class, "btn", "btn-#{situation}"] first
//   submit_button        card-mod-edit set/all/form_elements.rb:59-64
//   link_to (href LAST)  card-mod-format set/all/html/links.rb:101-106
//   Card::Path           card-mod-format-0.20.0 lib/card/path.rb:34-63
//                        (action base / mark+view segment / query to_param —
//                        sorted keys, Rack escape: space->+, reserved
//                        percent-encoded)
//   output               card-1.110.0 lib/card/content.rb:68-70
//                        (Array.wrap(content).flatten.compact.join("\n"))

/** card-1.110.0 lib/card/content.rb:68-70. */
export function output(parts: ReadonlyArray<string | undefined | null>): string {
  return parts
    .flat()
    .filter((p): p is string => p !== undefined && p !== null && p !== "")
    .join("\n");
}

/** URI.encode_www_form_component (the Rack/URI escape to_param uses).
 *  Exported for the search mod's search_box_complete url pair — the same
 *  Rack escape the to_param query strings use (results_path's
 *  query%5Bkeyword%5D pair). */
export function formEscape(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

/** Hash#to_param (actionpack core_ext/object/conversions): keys sorted,
 *  one level of bracket flattening, Rack-escaped. */
export function toParam(hash: Record<string, string>): string {
  return Object.keys(hash)
    .sort()
    .map((k) => `${formEscape(k)}=${formEscape(hash[k])}`)
    .join("&");
}

/** card-mod-format lib/card/path.rb:34-63 Path#render — the arms the follow
 *  and account bodies hit:
 *  - action create/update/delete with a mark: "<action>/<mark>" (+query)
 *  - no action, mark+view: "<mark>/<view>" (+query)
 *  - no action, mark only: "<mark>" (+query)
 *  The mark is the card's url_key (path.rb:56-59 interpret_mark -> url_key).
 *  A markless create is "card/<action>" (:44-46) — not hit by these views. */
export function followPath(
  markUrlKey: string | undefined,
  opts: {
    action?: "update" | "create" | "delete";
    view?: string;
    query?: Record<string, string>;
  } = {},
): string {
  const mark = markUrlKey ?? "";
  let base: string;
  if (opts.action !== undefined) {
    base = mark === "" ? `card/${opts.action}` : `${opts.action}/${mark}`;
  } else if (mark !== "" && opts.view !== undefined) {
    base = `${mark}/${opts.view}`;
  } else {
    base = mark;
  }
  const query = opts.query ?? {};
  const qs = Object.keys(query).length > 0 ? `?${toParam(query)}` : "";
  return `/${base}${qs}`;
}

/** hidden_field_tag (form_tag_helper.rb:264 shape — the pinned
 *  bytes: type,name,id,value + autocomplete LAST). */
export function hiddenFieldTag(name: string, value: string): string {
  return (
    `<input type="hidden" name="${name}" id="${name}" value="${value}"` +
    ` autocomplete="off" />`
  );
}

/** hidden_tags (card-mod-edit set/all/form_elements.rb:23-29): flatten a
 *  hash into base[key] hidden inputs, in hash order. */
export function hiddenTags(
  hash: Record<string, string>,
  base?: string,
): string {
  return Object.entries(hash)
    .map(([key, value]) =>
      hiddenFieldTag(base === undefined ? key : `${base}[${key}]`, value),
    )
    .join("");
}

/** success_tags (form_elements.rb:16-20): `return "" unless opts.present?`;
 *  hidden_tags success: opts. */
export function successTags(success: Record<string, string> | undefined): string {
  if (success === undefined || Object.keys(success).length === 0) return "";
  return hiddenTags(success, "success");
}

/** The opener card_form emits for :update — the captured edit-form bytes:
 *  class from card_form_html_opts (form.rb:218-224: "card-form" + slotter
 *  unless redirect/no_slotter + autosave on :update), id = form_for's dom id
 *  (persisted: edit_card_<id>; a NEW record: new_card), then action (the
 *  path), accept-charset, data-remote (form_opts[:remote] = true,
 *  form.rb:214), method post, then the utf8 + _method spoofs. */
export function cardFormOpen(opts: {
  formId: string;
  action: string;
  classes?: string;
  htmlAttrs?: string;
}): string {
  const classes = opts.classes ?? "card-form slotter autosave";
  return (
    `<form class="${classes}" id="${opts.formId}"${opts.htmlAttrs ?? ""}` +
    ` action="${opts.action}" accept-charset="UTF-8" data-remote="true"` +
    ` method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />`
  );
}

export const CARD_FORM_CLOSE = `</form>`;

/** check_box_tag (form_tag_helper.rb:455-460 — the permissions mod's port,
 *  card-mod-permissions.ts:275-288: type, name, id=sanitize_to_id(name),
 *  value, extras, checked LAST). */
export function checkBoxTag(
  name: string,
  value: string,
  checked: boolean,
  extraClass?: string,
): string {
  const classAttr = extraClass === undefined ? "" : ` class="${extraClass}"`;
  const checkedAttr = checked ? ` checked="checked"` : "";
  return (
    `<input type="checkbox" name="${name}" id="${name}" value="${value}"${classAttr}${checkedAttr} />`
  );
}

/** button_tag (form_tag_helper.rb: name/type defaults then the options in
 *  hash order; bootstrapify_button form.rb:33-36 folds situation into
 *  class FIRST: [class, "btn", "btn-#{situation}"] * " "). data-<x> keys
 *  emit as data-x attributes. */
export function buttonTag(
  content: string,
  opts: {
    type?: string;
    name?: string;
    value?: string;
    situation?: string;
    class?: string;
    ariaLabel?: string;
    data?: Record<string, string>;
  } = {},
): string {
  const situation = opts.situation ?? "primary";
  const cls = [opts.class, "btn", `btn-${situation}`]
    .filter((c) => c !== undefined && c !== "")
    .join(" ");
  let attrs = `type="${opts.type ?? "submit"}"`;
  if (opts.name !== undefined) attrs += ` name="${opts.name}"`;
  if (opts.value !== undefined) attrs += ` value="${opts.value}"`;
  attrs += ` class="${cls}"`;
  if (opts.ariaLabel !== undefined) attrs += ` aria-label="${opts.ariaLabel}"`;
  for (const [k, v] of Object.entries(opts.data ?? {})) {
    attrs += ` data-${k}="${v}"`;
  }
  return `<button ${attrs}>${content}</button>`;
}

/** submit_button (form_elements.rb:59-64): text||"Submit",
 *  situation||"primary", data.disable_with||"Submitting". */
export function submitButton(
  args: {
    text?: string;
    situation?: string;
    disableWith?: string;
    name?: string;
    value?: string;
    class?: string;
  } = {},
): string {
  return buttonTag(args.text ?? "Submit", {
    situation: args.situation ?? "primary",
    name: args.name,
    value: args.value,
    class: args.class,
    data: { "disable-with": args.disableWith ?? "Submitting" },
  });
}

/** link_to (links.rb:101-106): the href is appended LAST. */
export function linkTo(
  text: string,
  href: string,
  attrs: Record<string, string | undefined> = {},
): string {
  let attrStr = "";
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    attrStr += ` ${k}="${v}"`;
  }
  return `<a${attrStr} href="${href}">${text}</a>`;
}
