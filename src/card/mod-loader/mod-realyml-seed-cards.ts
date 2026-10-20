// The mod real.yml seed cards: the card-mod gems' data/real.yml CONTENT
// entries, flattened into create-or-update rows the boot seed runs through the
// same Card.ensure! machinery the account layer uses.
//
// Ruby source of the shape: Cardio::Mod::Eat (eat.rb:22-33) runs
// `Card.ensure!` over every data/real.yml entry the mod load order reaches,
// under Auth.as_bot. The entry's `:fields:` hash is flattened the way
// Subcards::Args (subcards/args.rb:22-39) flattens it: each symbol key goes
// through Card::Codename.name! and then the joint, so `:shark:` becomes the
// subcard `*getting started+Shark` (the codename belongs to the account
// layer's Shark role card) and `:right:` / `:input_type:` / `:content_options:`
// become the `*contextual class+*right` chain. Those flattened rows are
// spelled out here as their own entries because the flattened name depends on
// codenames the boot seed does not itself create - the cards those codenames
// belong to (core's `description` and `*right`, card-mod-edit's `*input type`,
// card-mod-list's `*content options`) are seeded by their own gems.
//
// Every `content` below is the gem's real.yml bytes VERBATIM, block scalar
// chomping included - `tests/card/mod-loader/real-yaml-oracle.ts` reads the
// same files with the same rules, and mod-realyml-seed-cards.test.ts pins the
// two against each other and against Ruby's own Psych.
//
// Rows are in mod-load order: a type card comes before anything typed by it,
// and a parent before its flattened fields. `typeCodename` is the real.yml
// `:type:` symbol without its colon; a row with none is created at the Basic
// default a type-less Card.ensure! save gets.

/** One data/real.yml entry, or one row its `:fields:` map flattens to: the
 *  card's name, its codename, the codename of its type card, and its content
 *  exactly as the gem writes it. */
export interface ModRealYamlSeedCard {
  readonly name: string;
  readonly codename?: string;
  readonly typeCodename?: string;
  readonly content?: string;
}

export const MOD_REAL_YAML_SEED_CARDS: readonly ModRealYamlSeedCard[] = [
  // card-mod-format-0.20.0/data/real.yml entry 1 - the JSON cardtype, which
  // the *Ace entry types by (`:type: json`). It rides along for the same
  // reason the account layer carries User and Email template: a seed that
  // types by a cardtype needs that cardtype to exist first.
  { name: "JSON", codename: "json", typeCodename: "cardtype" },

  // card-mod-ace_editor-0.20.0/data/real.yml - the gem's whole file, one
  // entry: the ace editor's JSON configuration, seeded as a json-typed card.
  { name: "*Ace", codename: "ace", typeCodename: "json", content: "{\n  \"default\": {\n  \"showGutter\": true,\n  \"theme\": \"ace/theme/github\",\n  \"printMargin\": false,\n  \"tabSize\": 2,\n  \"useSoftTabs\": true,\n  \"maxLines\": 30\n  }\n}\n" },

  // card-mod-tinymce_editor-0.20.0/data/real.yml - the gem's whole file,
  // one entry: the tinyMCE editor's JSON configuration, seeded as a
  // json-typed card. Its content block ends ` }` with NO trailing newline -
  // the gem's file ends mid-line, so clip chomping has no break to keep.
  { name: "*tinyMCE", codename: "tiny_mce", typeCodename: "json", content: "{\n  \"theme\": \"silver\",\n  \"menubar\": \"edit view insert format table\",\n  \"plugins\": \"autoresize code lists hr link autolink table\",\n  \"toolbar1\": \"formatselect | bold italic strikethrough forecolor backcolor | deckolink nest |   | numlist bullist outdent indent  | removeformat\",\n  \"width\":\"100%\",\n  \"auto_resize\":true,\n  \"autoresize_max_height\": 500,\n  \"relative_urls\":false,\n  \"extended_valid_elements\":\"a[name|href|target|title|onclick],img[class|src|border=0|alt|title|hspace|vspace|width|height|align|onmouseover|onmouseout|name],hr[class|width|size|noshade],font[face|size|color|style],span[class|align|style]\"\n }" },
];