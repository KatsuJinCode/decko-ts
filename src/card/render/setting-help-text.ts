// The setting help-text registry: the static `help_text` strings Ruby serves
// through `card.try(:raw_help_text)` on the menu's help popover
// (card-mod-help-0.20.0 set/all/help.rb:36-38:
//   `card.try(:raw_help_text) || card.help_rule_card&.content`).
//
// Ruby truth for WHERE these strings live (two shapes, same output):
// 1. `setting_opts ... help_text:` registrations. Card::Setting#register_setting
//    -> help_text_for_setting (card-1.110.0 lib/card/setting.rb:112-114) stores
//    the string on BOTH the setting's Self set module and its Right set module
//    (mattr_accessor, setting.rb:25-33), so a card responds to
//    `raw_help_text` when the card IS the setting card (self set) or its
//    RIGHT part is the setting card (right set).
// 2. Plain `def raw_help_text` definitions in the setting's set files - at
//    CARD level (found by card.try; card-mod-layout set/self/sidebar.rb:1-5,
//    card-mod-tinymce_editor set/self/tiny_mce.rb:1-6, card-mod-edit
//    set/right/input_type.rb:22-24, card-mod-follow set/right/follow.rb:39-41)
//    or at FORMAT level inside `format :html do` (card-mod-edit
//    set/self/input_type.rb:7-12, card-mod-ace_editor set/self/ace.rb:1-7).
//    Format-level defs override help.rb's generic `raw_help_text` through
//    HtmlFormat method resolution (Set::Self::InputType::HtmlFormat beats
//    Set::All::HtmlFormat) - the observable contract is identical: a card in
//    the setting's self/right set serves the static string.
//
// Membership = codename based (set modules bind to their set card by
// CODENAME - card-1.110.0 lib/card/set.rb:42-44 "the set_anchor must
// correspond to the codename of a card in the database"). Keys here are
// setting codenames; the lookup takes the card's own codename (self set) or
// its right part's codename (right set).
//
// COVERAGE: the settings the captured corpus deck exercises whose gems carry
// a help_text/raw_help_text (fixtures/corpus-v2/recapture menu bytes + the
// an earlier pass view-fail dump). Settings whose registration carries no
// `help_text:` (e.g. *default - card-mod-content set/self/default.rb has only
// short_help_text; *guide self - card-mod-help set/self/guide.rb) are
// correctly ABSENT: their cards fall through to the rule-card branch and
// render the nbsp placeholder when no readable *help rule exists (the
// corpus pins both: "*default" -> "&amp;nbsp;",
// "*table of contents" -> "&amp;nbsp;").

/** The help text for a setting's self set and/or right set, verbatim from the
 *  gems (the [[link]] chunks are processed at render time - see
 *  help-popover.ts#processHelpContent). */
export interface SettingHelpEntry {
  /** served to the setting card itself (Self::<Setting> set). */
  self?: string;
  /** served to cards whose right part is the setting card (Right::<Setting>). */
  right?: string;
}

export const SETTING_HELP_TEXT: ReadonlyMap<string, SettingHelpEntry> = new Map([
  // card-mod-integrate-0.20.0 set/self/thanks.rb:1-4 (setting_opts help_text)
  ["thanks", {
    self: "Destination after card is created. [[http://decko.org/Custom_thank_you_messages_for_forms|more]]",
    right: "Destination after card is created. [[http://decko.org/Custom_thank_you_messages_for_forms|more]]",
  }],
  // card-mod-help-0.20.0 set/self/help.rb (setting_opts help_text)
  ["help", {
    self: "[[http://decko.org/custom_help_text|Help text]] people will see when editing.",
    right: "[[http://decko.org/custom_help_text|Help text]] people will see when editing.",
  }],
  // card-mod-edit-0.20.0 set/self/input_type.rb:7-12 (format-level def) for
  // the self set; set/right/input_type.rb:22-24 (card-level def) for the
  // right set. The setting's own setting_opts registers only short_help_text.
  ["input_type", {
    self: "Configure [[https://ace.c9.io/|ace]], Decko's default code editor, using these available [[https://github.com/ajaxorg/ace/wiki/Configuring-Ace|options]].",
    right: "edit interface for list cards",
  }],
  // card-mod-layout-0.20.0 set/self/sidebar.rb:1-5 (card-level heredoc def)
  ["sidebar", {
    self: "    Sidebar content of [[Layouts]] with sidebar. [[http://decko.org/sidebar|more]]\n",
  }],
  // card-mod-tinymce_editor-0.20.0 set/self/tiny_mce.rb:1-6 (card-level
  // heredoc def; the set binds via the `tiny_mce` codename - the corpus card
  // is named "*TinyMCE")
  ["tiny_mce", {
    self: "    Configure [[http://tinymce.com|TinyMCE]], Decko's default\n    [[http://en.wikipedia.org/wiki/Wysiwyg|wysiwyg]] editor.\n    [[http://decko.org/TinyMCE|more]]\n",
  }],
  // card-mod-list-0.20.0 set/self/content_options.rb (setting_opts help_text)
  ["content_options", {
    self: "Value options for [[List]] and [[Pointer]] and cards. Can itself be a List or a [[Search]]. [[http://decko.org/Pointer|more]]",
    right: "Value options for [[List]] and [[Pointer]] and cards. Can itself be a List or a [[Search]]. [[http://decko.org/Pointer|more]]",
  }],
  // card-mod-list-0.20.0 set/self/content_option_view.rb (setting_opts)
  ["content_option_view", {
    self: "Label view for radio button and checkbox items.  [[http://decko.org/Pointer|more]]",
    right: "Label view for radio button and checkbox items.  [[http://decko.org/Pointer|more]]",
  }],
  // card-mod-layout-0.20.0 set/self/layout.rb (setting_opts help_text; note
  // the spaces around the "|" divider in the link chunk - Ruby's
  // Chunk::Link#objectify strips both sides)
  ["layout", {
    self: "HTML structure of card's page [[http://decko.org/layouts | more]]",
    right: "HTML structure of card's page [[http://decko.org/layouts | more]]",
  }],
  // card-mod-recaptcha-0.20.0 set/self/captcha.rb (setting_opts help_text)
  ["captcha", {
    self: "Anti-spam setting.  Requires non-signed-in users to complete a [[http://decko.org/captcha|captcha]] before adding or editing cards (where permitted).",
    right: "Anti-spam setting.  Requires non-signed-in users to complete a [[http://decko.org/captcha|captcha]] before adding or editing cards (where permitted).",
  }],
  // card-mod-content-0.20.0 set/self/structure.rb (setting_opts help_text)
  ["structure", {
    self: "Controls cards' content / structure. [[http://decko.org/formatting|more]]",
    right: "Controls cards' content / structure. [[http://decko.org/formatting|more]]",
  }],
  // card-1.110.0 mod/core/set/self/autoname.rb (setting_opts help_text)
  ["autoname", {
    self: "Autogenerate name for new cards by incrementing this value. [[http://decko.org/autonaming|more]]",
    right: "Autogenerate name for new cards by incrementing this value. [[http://decko.org/autonaming|more]]",
  }],
  // card-mod-permissions-0.20.0 set/self/{create,read,update,delete}.rb
  ["create", { self: "Who can create new cards", right: "Who can create new cards" }],
  ["read", { self: "Who can view cards in the [[Set]].", right: "Who can view cards in the [[Set]]." }],
  ["update", { self: "Who can update cards", right: "Who can update cards" }],
  ["delete", { self: "Who can delete cards", right: "Who can delete cards" }],
  // card-mod-layout-0.20.0 set/self/head.rb (setting_opts help_text)
  ["head", { self: "head tag content", right: "head tag content" }],
  // --- 2026-09-29 extensions, sourced verbatim from the
  // --- installed gems the same way; an earlier view-fail H4 class showed the
  // --- captured corpus exercising these settings' menus too.

  // card-mod-style-0.20.0 set/self/style.rb:3-5 (setting_opts help_text -
  // registered on BOTH the Self and Right set modules, setting.rb:25-33)
  ["style", {
    self: "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]",
    right: "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]",
  }],
  // card-mod-script-0.20.0 set/right/script.rb (format-level def, Right set
  // only - the self set's script.rb registers no help_text)
  ["script", {
    right: "JavaScript (or CoffeeScript) for card's page.",
  }],
  // card-mod-integrate-0.20.0 set/self/{on_create,on_update,on_delete}.rb
  // (setting_opts help_text - Self and Right set modules)
  ["on_create", { self: "Configure events to be executed when card is created", right: "Configure events to be executed when card is created" }],
  ["on_update", { self: "Configure events to be executed when card is updated", right: "Configure events to be executed when card is updated" }],
  ["on_delete", { self: "Configure events to be executed when card is deleted", right: "Configure events to be executed when card is deleted" }],
  // card-mod-ace_editor-0.20.0 set/self/ace.rb (format-level def, Self set
  // only; the corpus card is named "*Ace", codename "ace")
  ["ace", {
    self: "Configure [[https://ace.c9.io/|ace]], Decko's default code editor, using these available [[https://github.com/ajaxorg/ace/wiki/Configuring-Ace|options]].",
  }],
  // card-mod-carrierwave-0.20.0 set/self/favicon.rb (format-level def, Self
  // set only; *favicon is an Image-typed card, codename "favicon")
  ["favicon", {
    self: "A favicon (or shortcut icon) is a small image used by browsers to help identify your website. [[http://www.decko.org/favicon|How to customize your favicon]]",
  }],
  // card-mod-follow-0.20.0 set/right/follow.rb:39-41 (card-level def, Right
  // set only)
  ["follow", {
    right: "Get notified about changes",
  }],
  // card-mod-help-0.20.0 set/right/guide.rb (format-level def, Right set
  // only; set/self/guide.rb registers only short_help_text, so the *guide
  // card itself correctly stays absent -> nbsp placeholder)
  ["guide", {
    right: "Appears in the full editor view to guide users.",
  }],
  // card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/variables.rb
  // (card-level heredoc def: "    Override bootstrap [[...]]\n" - <<-TEXT keeps
  // the content's own indentation, terminator excluded). Ruby defines this on
  // the TypePlusRight::BootswatchSkin::Variables set (left card's TYPE is
  // Bootswatch skin); this registry keys by right codename only, which serves
  // the same string to every *variables-right card. The corpus's
  // *variables-right cards are all bootswatch skins (checked via the fresh-
  // process replay's zero-new-failures gate).
  ["variables", {
    right: "    Override bootstrap [[https://github.com/twbs/bootstrap/blob/v5.1.3/scss/_variables.scss|variables]]\n",
  }],
  // card-mod-search-0.20.0 set/right/<name>.rb: each virtual search includes
  // Abstract::VirtualSearch with a `raw_help_text:` option, and include_set
  // turns every option into a cattr_accessor on the Right set module (card
  // lib/card/set/inheritance.rb:32-36). Right set only. set/right/mates.rb
  // has its option commented out, so *mates is absent.
  ["children", {
    right: "Cards formed by \"mating\" {{_left|name}} with another card. eg: \"{{_left|name}}+mate\".",
  }],
  ["created", { right: "Cards created by {{_left|name}}." }],
  ["edited", { right: "Cards edited by {{_left|name}}." }],
  ["editors", { right: "Users who have edited {{_left|name}}." }],
  ["linked_to_by", { right: "Cards that link to {{_left|name}}." }],
  ["links_to", { right: "Cards that <em>{{_left|name}}</em> links to." }],
  ["nested_by", { right: "Cards that nest {{_left|name}}." }],
  ["nests", { right: "Cards that {{_left|name}} includes." }],
  ["referred_to_by", { right: "Cards that refer to {{_left|name}}." }],
  ["refers_to", { right: "Cards that {{_left|name}} refers to." }],
]);

/** The static raw_help_text a card serves: its OWN codename's self-set string
 *  wins (Ruby's set-module MRO: Self is the most specific pattern), else the
 *  right part's codename's right-set string. `undefined` = the card responds
 *  to neither set module - Ruby's `card.try(:raw_help_text)` returns nil and
 *  the help falls to the rule-card branch (all/help.rb:37). Callers resolve
 *  the codenames off the card records (the cards.codename column). */
export function registeredSettingHelpText(
  cardCodename: string | undefined,
  rightCodename: string | undefined,
): string | undefined {
  if (cardCodename !== undefined) {
    const own = SETTING_HELP_TEXT.get(cardCodename);
    if (own?.self !== undefined) return own.self;
  }
  if (rightCodename !== undefined) {
    const right = SETTING_HELP_TEXT.get(rightCodename);
    if (right?.right !== undefined) return right.right;
  }
  return undefined;
}
