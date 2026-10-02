// The card-mod-ace_editor gem (card-mod-ace_editor-0.20.0), ported through
// the mod loader.
//
// The gem's tree (the installed
// card-mod-ace_editor-0.20.0/): two set files, no lib/, no set_pattern/, no
// events, zero HTML views declared. Ported here byte-verifiably:
//
//   * set/self/ace.rb (8 lines, format :html do def raw_help_text ... end end)
//     - the *Ace Setting card's help text body. Per
//     card-1.110.0 lib/card/setting.rb:112-114 (help_text_for_setting), the
//     same raw_help_text string lands on BOTH the Self set (registration)
//     and the Right set (proxy card's help block). The ModSettingOpts
//     helperText field stores it in BOTH halves of the TS RegisteredSetting
//     record (rawHelpText + rightRawHelpText, mirror of the Ruby dual
//     store), so the test asserts both halves equal the Ruby source body.
//
//   * set/all/ace_editor.rb (1-2: basket[:list_input_options] << "ace
//     editor"; basket[:script_calls]["setAceConfig"] = :ace_config) - those
//     two basket operations register the input-type dropdown label and the
//     script-call entry the Card-form admin uses. NEITHER has a TS analog
//     in this engine surface (the admin settings form is not ported; the JS
//     asset pipeline lives in a separate, not-yet-ported surface). Set
//     module still enters the basket (format :html block defines methods,
//     no view declarations).
//
// NOT ported (documented remainder, see blockers in the report):
//   - basket[:list_input_options] << "ace editor" (set/all/ace_editor.rb:1)
//     - admin form input-type menu, no TS consumer
//   - basket[:script_calls]["setAceConfig"] = :ace_config (set/all/ace_editor.rb:2)
//     - JS asset pipeline call entry, no TS consumer; the actual CoffeeScript
//     body lives in assets/script/decko_ace_config.js.coffee and depends on
//     the ace.min.js library under public/ace/ (the public/ asset surface is
//     outside the headless engine)
//   - format :html do; ace_config / ace_editor_input / ace_mode - the
//     methods are consumed by the ace-editor input-type renderer, which is
//     defined in card-mod-format (a separate mod) and not ported here. They
//     are not view declarations themselves and render no bytes independently.
//   - data/real.yml (*Ace JSON seed card) - deck-level seed data; the seed
//     path enters through the standard write path, which is outside this
//     stream.
//   - data/transform/20180805112548_delete_ace_help_card.rb - migration that
//     deletes a now-superseded *Ace+*self+*help rule card and retypes *Ace
//     as JSON. Migration surface is outside the engine.
//   - assets/script/* + public/ace/* - the ace.js library + the mod's
//     config CoffeeScript that consumes it. JS asset surface, not in the
//     headless engine.
//   - config/admin.yml - editor configurations list; admin surface, no TS
//     consumer.

import type { DeckoModManifest } from "../mod-manifest.js";

// The raw_help_text body from set/self/ace.rb:2-6 - one Defect dashboard
// cite. Double-quoted strings concatenated with " \ " line continuations;
// the wiki/render layer expands the [[link]] chunks to anchor tags (the
// test pins the byte-for-byte literal, link expansion lives in
// src/card/render/help-popover.ts#processHelpContent for the populated
// help view; the *Ace Setting's help text here is the source-form string,
// the same shape card-mod-help's help.rb:1-5 raw_help_text tests pin).
const ACE_HELP_TEXT =
  "Configure [[https://ace.c9.io/|ace]], " +
  "Decko's default code editor, using these available " +
  "[[https://github.com/ajaxorg/ace/wiki/Configuring-Ace|options]].";

const cardModAceEditor: DeckoModManifest = {
  name: "ace_editor",
  gemName: "card-mod-ace_editor",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-ace_editor-0.20.0/set/self/ace.rb
      // The format :html do block defines raw_help_text; per setting.rb:112-114
      // the same string is stored on BOTH the Self set and the Right set, so
      // ModSettingOpts.helpText propagates to both halves (the registrar
      // record has rawHelpText + rightRawHelpText mirroring Ruby's dual store).
      setPath: "self/ace",
      settingOpts: {
        group: "other",
        helpText: ACE_HELP_TEXT,
      },
    },
    {
      // card-mod-ace_editor-0.20.0/set/all/ace_editor.rb
      // Two basket operations on the set module (lines 1-2) have no TS
      // analog (admin form + JS asset pipeline; both outside the engine).
      // The format :html do block on lines 4-18 defines helper methods
      // (ace_config / ace_editor_input / ace_mode) consumed by an
      // input-type renderer defined in card-mod-format, not this mod -
      // no view declarations, no bytes emitted by this file alone.
      setPath: "all/ace_editor",
      formats: {
        html: {
          views: [],
        },
      },
    },
  ],
};

export default cardModAceEditor;
