/**
 * Per-pattern labels - port of the label / short_label / generic_label
 * methods in card-1.110.0 mod/core/set_pattern/01_all.rb .. 09_self.rb.
 *
 * Ruby calls these with the set's ANCHOR name (card-mod-rules
 * set/type/set.rb#label passes anchor_name). Patterns that define no
 * generic_label fall back to `label nil` (lib/card/set/pattern/
 * class_methods.rb#generic_label), which is why e.g. the *rule generic label
 * equals its label ("All rule cards") - oracle-verified.
 *
 * Note: short_label appends a plain "s" ("Books"), it does not pluralize
 * through the inflector - the source is a string interpolation.
 */

/** 01_all.rb: label 'All cards', short_label 'everything', no generic_label. */
export function allLabel(_anchor: string | undefined): string {
  return "All cards";
}

export function allShortLabel(_anchor: string | undefined): string {
  return "everything";
}

/** 02_all_plus.rb: label 'All "+" cards'. */
export function allPlusLabel(_anchor: string | undefined): string {
  return 'All "+" cards';
}

export function allPlusShortLabel(_anchor: string | undefined): string {
  return 'all "+" cards';
}

/** 03_type.rb: label %(All "#{name}" cards) - generic_label "cards of a given type". */
export function typeLabel(anchor: string | undefined): string {
  return `All "${anchor}" cards`;
}

export function typeShortLabel(anchor: string | undefined): string {
  return `all "${anchor}s"`;
}

export function typeGenericLabel(): string {
  return "cards of a given type";
}

/** 04_star.rb: label 'All "*" cards'. */
export function starLabel(_anchor: string | undefined): string {
  return 'All "*" cards';
}

export function starShortLabel(_anchor: string | undefined): string {
  return 'all "*" cards';
}

/** 05_rstar.rb: label 'All "+*" cards'. */
export function rstarLabel(_anchor: string | undefined): string {
  return 'All "+*" cards';
}

export function rstarShortLabel(_anchor: string | undefined): string {
  return 'all "+*" cards';
}

/** 06_rule.rb: label "All rule cards". */
export function ruleLabel(_anchor: string | undefined): string {
  return "All rule cards";
}

export function ruleShortLabel(_anchor: string | undefined): string {
  return "all rule cards";
}

/** 07_right.rb: label %(All "+#{name}" cards) - generic_label "given field cards". */
export function rightLabel(anchor: string | undefined): string {
  return `All "+${anchor}" cards`;
}

export function rightShortLabel(anchor: string | undefined): string {
  return `all "+${anchor}s"`;
}

export function rightGenericLabel(): string {
  return "given field cards";
}

/**
 * 08_type_plus_right.rb: label %(All "+#{name.tag}" cards on "#{name.left}"
 * cards). The anchor is a two-part name "Type+Field"; a one-part anchor
 * yields left "" (oracle: label("Book") => 'All "+Book" cards on "" cards').
 */
export function typePlusRightLabel(anchor: string | undefined): string {
  const { tag, left } = tagAndLeft(anchor);
  return `All "+${tag}" cards on "${left}" cards`;
}

export function typePlusRightShortLabel(anchor: string | undefined): string {
  const { tag, left } = tagAndLeft(anchor);
  return `all "+${tag}" on "${left}s"`;
}

export function typePlusRightGenericLabel(): string {
  return "given field cards on a given type";
}

/** 09_self.rb: label %(The card "#{name}"), short_label is the name itself. */
export function selfLabel(anchor: string | undefined): string {
  return `The card "${anchor}"`;
}

export function selfShortLabel(anchor: string | undefined): string {
  return anchor ?? "";
}

export function selfGenericLabel(): string {
  return "a single card";
}

/** 08_type_plus_right.rb#label: `name = name.to_name` then tag/left. */
function tagAndLeft(anchor: string | undefined): { tag: string; left: string } {
  if (anchor === undefined) return { tag: "", left: "" };
  const joint = anchor.lastIndexOf("+");
  // to_name.tag on a simple name is the name itself; left of a simple name is nil -> ""
  if (joint < 0) return { tag: anchor, left: "" };
  return {
    tag: anchor.slice(joint + 1),
    left: anchor.slice(0, joint),
  };
}
