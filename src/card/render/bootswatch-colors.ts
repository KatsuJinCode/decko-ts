// The bootswatch skin's colour palette: the SCSS variable lookup and the two
// HAML views that render it. card-mod-bootstrap set/type_plus_right/
// bootswatch_skin/colors.rb + colors/core.haml, colors/input.haml,
// colors/_colorgroup.haml, colors/_colorpicker.haml.
//
// VARIABLE LOOKUP (colors.rb:22-46). A variable's value is the first match
// of its SCSS definition, looked up in order:
//   1. the *colors card's own content (value_from_scss(name, content)),
//   2. the skin's *variables card, when it has content,
//   3. the vendored bootstrap _variables.scss (default_value_from_bootstrap).
// The definition regex is colors.rb:40-41 read with Ruby's line anchors:
//   ^(?<before>\s*\$NAME:\s*)(?<value>.+?)(?<after> !default;)$
// as a multiline JavaScript regex (`^` and `$` match at line boundaries, `.`
// does not cross a newline - the same anchoring Ruby uses).
//
// HAML OUTPUT. The two views are transcribed from their templates. The
// haml gem's output for these templates (single-quoted attributes, one line
// per tag, the blank line a `= partial` leaves after its rendered string) is
// reproduced here; the byte pins are the Ruby oracle captures in
// reference-harness/fixtures/synthetic-v2-mod-probes (probe-view:72 core,
// probe-view:76 input).

import { bootstrapVariablesScss } from "./bootstrap-code-files.js";

/** colors.rb:4-9 VARIABLE_NAMES[:colors], in declaration order. */
export const COLOR_VARIABLE_NAMES: readonly string[] = [
  "blue", "indigo", "purple", "pink", "red", "orange", "yellow", "green",
  "teal", "cyan", "black", "white", "gray-100", "gray-200", "gray-300",
  "gray-400", "gray-500", "gray-600", "gray-700", "gray-800", "gray-900",
];

/** colors.rb:4-9 VARIABLE_NAMES[:theme_colors], in declaration order. */
export const THEME_VARIABLE_NAMES: readonly string[] = [
  "primary", "secondary", "success", "info", "warning", "danger", "light",
  "dark", "body-bg", "body-color",
];

/** A variable name's value, or undefined where no source defines it (Ruby nil). */
export type VariableValues = Map<string, string | undefined>;

/** colors.rb:40-41 definition_regex (see the header for the anchoring). */
function definitionRegex(name: string): RegExp {
  return new RegExp(`^(?<before>\\s*\\$${name}:\\s*)(?<value>.+?)(?<after> !default;)$`, "m");
}

/** colors.rb:33-36 value_from_scss: the value of the `$name` definition in
 *  `source`, or undefined. A leading `$` on the name is dropped. */
export function valueFromScss(name: string, source: string): string | undefined {
  const bare = name.startsWith("$") ? name.slice(1) : name;
  return source.match(definitionRegex(bare))?.groups?.["value"];
}

/** colors.rb:22-46 variable_value: the first source that defines `name`. */
export function variableValue(
  name: string,
  content: string,
  variablesContent: string | undefined,
): string | undefined {
  return (
    valueFromScss(name, content) ??
    (variablesContent !== undefined && variablesContent.trim() !== ""
      ? valueFromScss(name, variablesContent)
      : undefined) ??
    valueFromScss(name, bootstrapVariables())
  );
}

let bootstrapCache: string | undefined;
/** The vendored bootstrap _variables.scss, read once. */
function bootstrapVariables(): string {
  bootstrapCache ??= bootstrapVariablesScss();
  return bootstrapCache;
}

/** colors.rb variable_group_with_values: the group's names, in order, each
 *  with its variable_value. */
export function variableGroupWithValues(
  names: readonly string[],
  content: string,
  variablesContent: string | undefined,
): VariableValues {
  const values: VariableValues = new Map();
  for (const name of names) values.set(name, variableValue(name, content, variablesContent));
  return values;
}

/** Ruby String#to_s for a nil-or-string haml interpolation: nil is "". */
function text(value: string | undefined): string {
  return value ?? "";
}

// ---------------------------------------------------------------------------
// core (colors/core.haml + colors/_colorgroup.haml)
// ---------------------------------------------------------------------------

/** colors/_colorgroup.haml: one `%div` per (name, color) pair. Each element
 *  is `%span.labeled-badge`, `%i{style: "background-color: #{color};"}` and
 *  `%label.text-muted` holding the name. */
function colorGroupBody(entries: ReadonlyArray<readonly [string, string | undefined]>): string {
  return entries
    .map(
      ([name, color]) =>
        "<div>\n" +
        "<span class='labeled-badge'></span>\n" +
        `<i style='background-color: ${text(color)};'></i>\n` +
        "<label class='text-muted'>\n" +
        `${name}\n` +
        "</label>\n" +
        "</div>\n",
    )
    .join("");
}

/** colors.rb view :core: the theme colours resolve a `$name` value through
 *  the colour map (`v.starts_with?("$") ? colors[v[1..]] : v`); the first ten
 *  colours fill @colors, the rest @grays. */
export function renderColorsCore(colors: VariableValues, themeColors: VariableValues): string {
  const colorEntries = [...colors.entries()];
  const themeEntries: Array<[string, string | undefined]> = [...themeColors.entries()].map(
    ([name, value]) => [
      name,
      value !== undefined && value.startsWith("$") ? colors.get(value.slice(1)) : value,
    ],
  );
  const groups = [themeEntries, colorEntries.slice(0, 10), colorEntries.slice(10)];
  let out = "<div class='colorpicker-element row'>\n";
  for (const group of groups) {
    // `= haml_partial` leaves a blank line after its rendered string.
    out += "<div class='col-auto input-group-addon'>\n" + colorGroupBody(group) + "\n</div>\n";
  }
  return out + "</div>\n";
}

// ---------------------------------------------------------------------------
// input (colors/input.haml + colors/_colorpicker.haml + theme_color_picker)
// ---------------------------------------------------------------------------

/** colors/_colorpicker.haml: one palette row with its colour input. */
function colorPickerPartial(name: string, color: string | undefined): string {
  return (
    "<div class='row'>\n" +
    "<label class='col-sm-3 col-form-label'>\n" +
    `${name}\n` +
    "</label>\n" +
    "<div class='col-sm-9 py-1'>\n" +
    "<div class='input-group colorpicker-component'>\n" +
    `<input class='form-control input-lg' name='colors[${name}]' type='text' value='${text(color)}'>\n` +
    "<span class='input-group-text input-group-addon'>\n" +
    "<i></i>\n" +
    "</span>\n" +
    "</div>\n" +
    "</div>\n" +
    "</div>\n"
  );
}

/** colors.rb theme_color_picker: a select_tag over the colour variables
 *  (`$name` options), plus the current value when it is not one of them.
 *  select_tag's id is sanitize_to_id(name): `]` removed, every other
 *  character outside [-a-zA-Z0-9:.] becomes `_`. */
export function themeColorPicker(name: string, value: string | undefined): string {
  const options = COLOR_VARIABLE_NAMES.map((variable) => `$${variable}`);
  if (value !== undefined && !options.includes(value)) options.push(value);
  const id = `theme_colors[${name}]`.replace(/\]/g, "").replace(/[^-a-zA-Z0-9:.]/g, "_");
  const optionTags = options
    .map((option) => {
      const selected = option === value ? ' selected="selected"' : "";
      return `<option${selected} value="${option}">${option}</option>`;
    })
    .join("\n");
  return `<select name="theme_colors[${name}]" id="${id}" class="tags form-control">${optionTags}</select>`;
}

/** colors/input.haml: the palette column and the theme-uses column. */
export function renderColorsInput(colors: VariableValues, themeColors: VariableValues): string {
  let out = "<div class='row'>\n<div class='col-6'>\n<h4>Palette</h4>\n";
  for (const [name, color] of colors) out += colorPickerPartial(name, color) + "\n";
  out += "</div>\n<div class='col-6'>\n<h4>Uses</h4>\n";
  for (const [name, value] of themeColors) {
    out +=
      "<div class='form-group row'>\n" +
      "<label class='col-sm-4 col-form-label'>\n" +
      `${name}\n` +
      "</label>\n" +
      `${themeColorPicker(name, value)}\n` +
      "</div>\n";
  }
  return out + "</div>\n</div>\n";
}
